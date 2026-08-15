import React from "react";
import { useLocale } from "./lib/i18n.js";
import { apiFetch, supabase } from "./lib/supabase-browser.js";
import { briefProgress, daysLeftInCycle, successRate } from "./lib/home-stats.js";
import { handleComposerKeyDown } from "./lib/editing-shortcuts.js";
const { BrandolphAvatar, BrandolphDot, Icon, LayerTag, Reveal, StatusPill, StreamedText, useIsTeam } = window;

/* Same SSE helper as portal-briefs's TryPanel — duplicated here to keep
   portal-brandolph self-contained. Parses /api/runs/stream events. */
async function streamSpecialistRun({ specialistId, briefText, brandId, briefId, onToken, onProgress, onQa, onDone, onError }) {
  const res = await apiFetch("/api/runs/stream", {
    method: "POST",
    body: JSON.stringify({ specialistId, briefText, brandId, briefId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    onError && onError({ message: err.error || `HTTP ${res.status}` });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const events = buf.split("\n\n");
    buf = events.pop() || "";
    for (const ev of events) {
      const lines = ev.split("\n");
      const eventLine = lines.find((l) => l.startsWith("event:"));
      const dataLine  = lines.find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      const eventType = eventLine?.slice(6).trim();
      let data; try { data = JSON.parse(dataLine.slice(5).trim()); } catch { continue; }
      if (eventType === "token")         onToken && onToken(data);
      else if (eventType === "progress") onProgress && onProgress(data);
      else if (eventType === "qa")       onQa && onQa(data);
      else if (eventType === "done")     onDone && onDone(data);
      else if (eventType === "error")    onError && onError(data);
    }
  }
}

const { useState: useBState, useEffect: useBEffect, useMemo: useBMemo, useRef: useBRef } = React;

/* The current assembly being assembled (mock — derived from the pricing brief) */
function getAssembly(density) {
  const order = ["a02","a03","a06","a12","a13","a14","a18","a24","a04","a09","a07","a30"];
  const ids = order.slice(0, Math.max(3, Math.min(12, density)));
  const agents = ids.map(id => window.CI_AGENTS.find(a => a.id === id)).filter(Boolean);
  const totalCr = agents.reduce((s, a) => s + a.cr, 0);
  const models = [...new Set(agents.map(a => a.model))];
  return { agents, totalCr, models };
}

/* Live home stats. Deliberately leaner than useLiveBriefs in portal-briefs:
   the tiles only count and label, so we skip outputs.body (image prompts and
   long copy) which would be the bulk of the payload on every home load. */
function useHomeStats() {
  const [state, setState] = useBState({ loading: true, briefs: [], credits: null, brand: null, bio: null, error: null });
  const loadSequence = useBRef(0);

  const load = React.useCallback(async () => {
    const sequence = ++loadSequence.current;
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      /* Same brand resolution as the Briefs page: switcher's pick, else the
         first brand. RLS scopes rows to the caller's workspaces regardless. */
      const wantedId = window.getCurrentBrandId?.();
      let brand = null;
      if (wantedId) {
        const { data, error } = await supabase.from("brands").select("id, name").eq("id", wantedId).maybeSingle();
        if (error) throw new Error(error.message);
        brand = data;
      }
      if (!brand) {
        /* Surface a failed brand lookup — swallowing it renders the tiles as
           a confident "you have nothing" when we simply couldn't read. */
        const { data, error: brandErr } = await supabase.from("brands").select("id, name").order("created_at", { ascending: true }).limit(1);
        if (brandErr) throw new Error(brandErr.message);
        brand = data?.[0];
      }

      const [briefsRes, bioRes, creditsRes] = await Promise.all([
        brand
          ? supabase
              .from("briefs")
              .select("id, title, type, payload, created_at, runs ( id, specialist_id, status, outputs ( id, kind, status ) )")
              .eq("brand_id", brand.id)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [] }),
        brand
          ? supabase
              .from("bios")
              .select("id, version, score, certified, certified_by, certified_at")
              .eq("brand_id", brand.id)
              .eq("certified", true)
              .order("version", { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        apiFetch("/api/credits").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);

      if (sequence !== loadSequence.current) return;
      setState({
        loading: false,
        briefs: briefsRes.data || [],
        credits: creditsRes,
        brand,
        bio: bioRes.data || null,
        error: briefsRes.error?.message || bioRes.error?.message || null,
      });
    } catch (e) {
      if (sequence !== loadSequence.current) return;
      setState((s) => ({ ...s, loading: false, error: e?.message || String(e) }));
    }
  }, []);

  useBEffect(() => { load(); }, [load]);
  useBEffect(() => {
    const onChange = () => load();
    window.addEventListener("brand:changed", onChange);
    return () => window.removeEventListener("brand:changed", onChange);
  }, [load]);

  return state;
}

/* Mini analytics — credits · campaigns + success · library peek + in-flight. */
function HomeDashboard({ go, stats }) {
  const { t } = useLocale();
  const { loading, briefs, credits, error } = stats;
  /* Loading and failed are both "we don't know" — neither may render as a
     real count, and neither may render as "you have nothing". */
  const unknown = loading || !!error;

  const byState = briefs.map((b) => ({ brief: b, state: briefProgress(b) }));
  const shipped  = byState.filter((x) => x.state === "shipped").length;
  const inFlight = byState.filter((x) => x.state === "in-flight").map((x) => x.brief);
  const rate = successRate({ shipped, inFlight: inFlight.length });

  /* Library peek — most recent outputs across the brand's briefs. Uploads are
     the user's own files, not produced work, so they stay out. */
  const recent = briefs
    .flatMap((b) => (b.runs || []).flatMap((r) => (r.outputs || []).map((o) => ({ ...o, specialistId: r.specialist_id }))))
    .filter((o) => o.kind !== "upload")
    .slice(0, 4);

  const big = (color) => ({ fontFamily:"Georgia, serif", fontStyle:"italic", fontSize:36, fontWeight:500, lineHeight:1, color: color || "var(--c-ink)" });
  const cardStyle = { padding:18, display:"flex", flexDirection:"column", gap:10, height:"100%", boxSizing:"border-box" };

  return (
    <div style={{maxWidth:1080, margin:"0 auto"}}>
      {/* A failed load must not read as "you have nothing" — say so instead. */}
      {error && (
        <div className="card" style={{padding:"10px 14px", marginBottom:14, borderLeft:"3px solid var(--pink-500)", fontSize:13}}>
          {t("brandolph.statsLoadError", { error })}
        </div>
      )}
      <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:14, marginBottom:18, alignItems:"stretch"}}>
        <Reveal>
          <div className="card" style={cardStyle}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}><span className="eyebrow">{t("brandolph.creditsThisCycle")}</span><button className="btn btn--link" style={{fontSize:11.5}} onClick={() => go("credits")}>{t("brandolph.ledger")} →</button></div>
            <div style={{display:"flex", alignItems:"baseline", gap:8}}>
              <span style={big()}>{credits ? credits.balance : "—"}</span>
              <span style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--c-faint)"}}>
                {/* monthly 0 = The Colony's unlimited pool, so no "/ N" to show */}
                {credits?.monthly
                  ? t("brandolph.creditsMeter", { monthly: credits.monthly, days: daysLeftInCycle() })
                  : t("brandolph.daysLeft", { days: daysLeftInCycle() })}
              </span>
            </div>
            <div style={{height:6, background:"var(--neutral-50)", borderRadius:999, overflow:"hidden", display:"flex"}}>
              <div style={{width: `${credits?.monthly ? Math.min(100, Math.round((credits.monthlyDebited / credits.monthly) * 100)) : 0}%`, background:"var(--yellow-500)"}} />
            </div>
          </div>
        </Reveal>
        <Reveal delay={80}>
          <div className="card" style={cardStyle}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}><span className="eyebrow">{t("brandolph.campaigns")}</span><button className="btn btn--link" style={{fontSize:11.5}} onClick={() => go("briefs")}>{t("brandolph.allBriefs")} →</button></div>
            <div style={{display:"flex", alignItems:"baseline", gap:20}}>
              <div><div style={big()}>{unknown ? "—" : briefs.length}</div><div className="eyebrow" style={{marginTop:5}}>{t("brandolph.created")}</div></div>
              <div><div style={big("var(--green-600)")}>{unknown ? "—" : `${rate}%`}</div><div className="eyebrow" style={{marginTop:5}}>{t("brandolph.successRate")}</div></div>
            </div>
            <div style={{fontSize:12, color:"var(--c-faint)"}}>{unknown ? "—" : t("brandolph.inFlightShipped", { inFlight: inFlight.length, shipped })}</div>
          </div>
        </Reveal>
        <Reveal delay={160}>
          <div className="card" style={cardStyle}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}><span className="eyebrow">{t("brandolph.library")}</span><button className="btn btn--link" style={{fontSize:11.5}} onClick={() => go("library")}>{t("brandolph.open")} →</button></div>
            <div style={{display:"flex", flexDirection:"column", gap:7, marginTop:2}}>
              {/* Only claim emptiness when the load actually succeeded. */}
              {!unknown && recent.length === 0 && (
                <div style={{fontSize:12.5, color:"var(--c-faint)"}}>{t("brandolph.libraryEmpty")}</div>
              )}
              {error && <div style={{fontSize:12.5, color:"var(--c-faint)"}}>{t("brandolph.couldntLoad")}</div>}
              {recent.map(o => (
                <div key={o.id} style={{display:"flex", alignItems:"center", gap:8, fontSize:12.5}}>
                  <span style={{width:6, height:6, borderRadius:"50%", background: o.status === "approved" ? "var(--green-500)" : "var(--yellow-500)", flexShrink:0}} />
                  <span style={{flex:1, minWidth:0, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", color:"var(--c-ink)"}}>
                    {window.CI_AGENTS?.find(a => a.id === o.specialistId)?.name || o.kind}
                  </span>
                  <span style={{fontFamily:"var(--font-mono)", fontSize:9.5, color:"var(--c-faint)", textTransform:"uppercase"}}>{o.kind}</span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>

      {inFlight.length > 0 && (
        <Reveal>
          <div style={{display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:12}}>
            <h3 style={{fontSize:16, margin:0, letterSpacing:"-0.005em"}}>{t("brandolph.inFlightHeading", { count: inFlight.length })}</h3>
            <button className="btn btn--link" style={{fontSize:12}} onClick={() => go("briefs")}>{t("brandolph.viewAll")} →</button>
          </div>
          <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(300px, 1fr))", gap:12}}>
            {inFlight.map(b => {
              /* One dot per distinct specialist; credits priced off the same
                 CI_AGENTS table the Briefs page totals from. */
              const specialistIds = [...new Set((b.runs || []).map(r => r.specialist_id).filter(Boolean))];
              const cr = specialistIds.reduce((s, id) => s + (window.CI_AGENTS?.find(a => a.id === id)?.cr || 0), 0);
              /* Still producing vs. produced-but-awaiting-your-approval. */
              const running = (b.runs || []).some(r => r.status === "queued" || r.status === "running");
              return (
                <a key={b.id} href={"#/board/" + b.id} className="card" style={{padding:16, textDecoration:"none", color:"inherit", cursor:"pointer", display:"flex", flexDirection:"column", gap:7}}>
                  <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10}}><span className="eyebrow">{b.type === "one_off" ? t("brandolph.briefKind") : (b.type || t("brandolph.briefKind"))}</span><StatusPill status={running ? "in-production" : "review"} /></div>
                  <div style={{fontSize:14.5, fontWeight:500, color:"var(--c-ink)", letterSpacing:"-0.005em"}}>{b.title || b.payload?.title || t("brandolph.untitledBrief")}</div>
                  <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", paddingTop:7, borderTop:"1px dashed var(--c-line-2)"}}>
                    <div style={{display:"flex", gap:3}}>
                      {specialistIds.slice(0, 5).map(aid => { const a = window.CI_AGENTS?.find(x => x.id === aid); return <span key={aid} title={a?.name} style={{width:9, height:9, borderRadius:"50%", background: window.CI_DEPT_COLORS?.[a?.dept] || "var(--neutral-400)", outline:"1px solid var(--c-line)"}} />; })}
                    </div>
                    <span style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--c-faint)"}}>{cr} cr · {new Date(b.created_at).toLocaleDateString(undefined, { day:"numeric", month:"short" })}</span>
                  </div>
                </a>
              );
            })}
          </div>
        </Reveal>
      )}
    </div>
  );
}

function HomeCreate({ tweaks, go }) {
  const { t } = useLocale();
  /* Fetched once here and handed to HomeDashboard — the crew-cost line below
     needs the same live balance, and two hooks would mean two round-trips. */
  const stats = useHomeStats();
  const activeBrandId = window.useCurrentBrandId();
  const [mode, setMode]   = useBState("flow");
  const [input, setInput] = useBState(() => {
    /* Pick up a "Reuse" prefill posted from the Library — when set,
       the brief textarea opens with the upstream output already pasted. */
    try {
      const raw = sessionStorage.getItem("ci_home_prefill");
      if (!raw) return "";
      const parsed = JSON.parse(raw);
      sessionStorage.removeItem("ci_home_prefill");
      return typeof parsed?.text === "string" ? parsed.text : "";
    } catch { return ""; }
  });
  const [phase, setPhase] = useBState("idle"); // idle | sharpening | proposing | running | done
  const reviewRef = useBRef(null);

  /* Wired models — text (Anthropic + OpenRouter) AND image (fal.ai).
     Other vendors (exa/v0/gamma/framer/elevenlabs) aren't dispatched
     through /api/runs/stream yet so we filter them out of the assembly. */
  const TEXT_MODELS  = new Set(["opus", "sonnet", "haiku", "gpt5", "gemPro", "gemFlash"]);
  const IMAGE_MODELS = new Set(["flux", "fluxSchnell", "gptimage", "recraft"]);
  const RUNNABLE = (m) => TEXT_MODELS.has(m) || IMAGE_MODELS.has(m);
  const rawAssembly = useBMemo(() => getAssembly(tweaks.assemblyDensity || 7), [tweaks.assemblyDensity]);
  const assembly = useBMemo(() => ({
    ...rawAssembly,
    agents: rawAssembly.agents.filter((a) => a.status === "live" && RUNNABLE(a.model)).slice(0, 3),
    totalCr: rawAssembly.agents.filter((a) => a.status === "live" && RUNNABLE(a.model)).slice(0, 3).reduce((s, a) => s + (a.cr || 0), 0),
  }), [rawAssembly]);

  /* Per-agent live state during a real assembly run. Keyed by specialist id. */
  const [agentStates, setAgentStates] = useBState({});      /* { a12: "running"|"ok"|"queued"|"failed" } */
  const [agentOutputs, setAgentOutputs] = useBState({});    /* { a12: { text, qa, usage, briefId } } */
  const [runErr, setRunErr] = useBState(null);

  /* a02 Sharpener state — real per-brief output from /api/briefs/sharpen. */
  const [sharp, setSharp]       = useBState({ loading: false, data: null, error: null });
  const [answers, setAnswers]   = useBState({});            /* { 0: "...", 1: "...", 2: "..." } */
  const [qStep, setQStep]       = useBState(0);             /* sharpening wizard: current question index */
  const [briefBrandId, setBriefBrandId] = useBState(null);  /* brand pinned when sharpening starts */

  /* A sharpened brief belongs to the BIO that shaped it. Switching brands
     invalidates that draft so it cannot be run against a different BIO. */
  useBEffect(() => {
    if (!briefBrandId || briefBrandId === activeBrandId) return;
    setPhase("idle");
    setSharp({ loading:false, data:null, error:null });
    setAnswers({});
    setQStep(0);
    setBriefBrandId(null);
  }, [activeBrandId, briefBrandId]);

  /* Resolve the actual assembly — Sharpener's proposed specialists take
     precedence; fall back to the mock density-based pick filtered to
     live text specialists. */
  const realAssembly = useBMemo(() => {
    const proposed = sharp.data?.proposedSpecialists || [];
    if (proposed.length > 0) {
      const agents = proposed
        .map((id) => window.CI_AGENTS.find((a) => a.id === id))
        .filter((a) => a && a.status === "live" && RUNNABLE(a.model));
      return { agents, totalCr: agents.reduce((s, a) => s + (a.cr || 0), 0) };
    }
    return assembly;
  }, [sharp.data, assembly]);

  const tryPrompts = [
    { eyebrow:"Conversion",    text:"Launch a Q1 product drop with the pricing page", est: 42 },
    { eyebrow:"Repositioning", text:"Reposition the brand for a younger audience",    est: 68 },
    { eyebrow:"Seasonal",      text:"A holiday social campaign that doesn't feel like every other one", est: 36 },
    { eyebrow:"Acquisition",   text:"Landing page that converts cold traffic",         est: 28 },
  ];

  const handleStart = async () => {
    if (!input.trim()) return;
    if (!activeBrandId) {
      setSharp({ loading:false, data:null, error: t("brandolph.selectBrand") + "." });
      return;
    }
    /* Real a02 The Sharpener pass — reads the BIO + brief, returns 2–3
       brand-aware questions + a proposed crew. If sharpening fails
       (network, parse, etc.), skip straight to proposing with the raw
       brief so the user is never blocked. */
    setPhase("sharpening");
    setSharp({ loading: true, data: null, error: null });
    setAnswers({});
    setQStep(0);
    setBriefBrandId(activeBrandId);
    setTimeout(() => reviewRef.current?.scrollIntoView({ behavior:"smooth", block:"nearest" }), 80);
    try {
      const res = await apiFetch("/api/briefs/sharpen", {
        method: "POST",
        body: JSON.stringify({ briefText: input.trim(), brandId: activeBrandId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setSharp({ loading: false, data: json, error: null });
    } catch (e) {
      setSharp({ loading: false, data: null, error: e?.message || String(e) });
    }
  };

  const handleKeyDown = (e) => handleComposerKeyDown(e, handleStart);

  const handleProceed = () => {
    if (!briefBrandId || briefBrandId !== activeBrandId) {
      setSharp((current) => ({ ...current, error: t("brandolph.brandChangedError") }));
      return;
    }
    /* Hand off the run context to the Canvas: BIO → Brief → Specialists
       assemble there with animations, then the user fires the run from
       the Canvas itself. The Canvas is the moment-of-truth UX surface;
       a flat inline grid breaks that promise. */
    const ctx = {
      rawBrief:      input.trim(),
      composedBrief: composeBriefText(),
      title:         sharp.data?.title || "",
      sharpenedBrief: sharp.data?.sharpenedBrief || "",
      tension:       sharp.data?.tension || "",
      questions:     sharp.data?.questions || [],
      answers,
      refusals:      sharp.data?.refusals || [],
      specialistIds: realAssembly.agents.map((a) => a.id),
      deliveryPlan:  sharp.data?.deliveryPlan || null,
      totalCr:       realAssembly.totalCr,
      /* Carry the current brand so canvas re-runs forward a real brandId
         instead of undefined. The server still re-derives brand from briefId,
         but forwarding it removes the fragile "works only by coincidence".
         briefBrandId === activeBrandId here (guarded above), so use the
         canonical activeBrandId — the pinned selected brand. */
      brandId:       activeBrandId,
      ts:            Date.now(),
    };
    try { sessionStorage.setItem("ci_run_context", JSON.stringify(ctx)); } catch (e) {}
    go("canvas");
  };

  /* Compose the final brief sent to each specialist — combines the
     operator's raw request, the Sharpener's CMO-grade rewrite, the
     answers to clarifying questions, and the Sharpener's explicit
     refusals. Specialists then run against the full sharpened context. */
  const composeBriefText = () => {
    /* Plain prose — no markdown headings. Specialists were mimicking the
       "## SHARPENED BRIEF (CMO-grade)" structure in their outputs,
       which made every result look generic-AI. Now this reads like a
       senior operator briefing a teammate: paragraph + paragraph. */
    const blocks = [];
    const data = sharp.data;
    const sharpened = data?.sharpenedBrief?.trim();
    const raw       = input.trim();

    blocks.push(sharpened || raw);
    if (sharpened && raw && sharpened !== raw) {
      blocks.push(`The operator's original words, for reference: "${raw}"`);
    }

    const answeredEntries = (data?.questions || [])
      .map((q, i) => ({ q: q.q, a: (answers[i] || "").trim() }))
      .filter((x) => x.a);
    if (answeredEntries.length > 0) {
      const clarifs = answeredEntries
        .map(({ q, a }) => `${q.replace(/[?.!]+$/, "")}? ${a}`)
        .join(" ");
      blocks.push(`Clarifications from the operator: ${clarifs}`);
    }

    if (data?.tension) {
      blocks.push(`The tension underneath this: ${data.tension}`);
    }

    if (data?.refusals?.length) {
      blocks.push(`Hard don'ts for this brief: ${data.refusals.join(" · ")}`);
    }

    return blocks.join("\n\n");
  };

  /* Real assembly runner — fires /api/runs/stream sequentially for each
     specialist in the assembly. All runs share a single brief row
     (briefId reused after first run's done event). Per-agent state
     drives the dot-state animation in the existing UI. */
  const handleRun = async () => {
    if (!input.trim() || !realAssembly.agents.length) return;
    setPhase("running");
    setRunErr(null);
    const initialStates = {};
    realAssembly.agents.forEach((a) => { initialStates[a.id] = "queued"; });
    setAgentStates(initialStates);
    setAgentOutputs({});

    const composedBrief = composeBriefText();
    let sharedBriefId = null;

    for (const agent of realAssembly.agents) {
      setAgentStates((prev) => ({ ...prev, [agent.id]: "running" }));
      let text = "";
      let qa   = null;
      let done = null;
      let err  = null;
      await streamSpecialistRun({
        specialistId: agent.id,
        briefText:    composedBrief,
        brandId:      briefBrandId || activeBrandId,
        briefId:      sharedBriefId,
        onToken: ({ text: t }) => {
          text += t;
          /* Live-update the output so the user sees tokens stream in */
          setAgentOutputs((prev) => ({ ...prev, [agent.id]: { ...(prev[agent.id] || {}), text } }));
        },
        onQa:    (data) => { qa = data; setAgentOutputs((prev) => ({ ...prev, [agent.id]: { ...(prev[agent.id] || {}), qa } })); },
        onDone:  (data) => {
          done = data;
          if (!sharedBriefId && data.briefId) sharedBriefId = data.briefId;
          setAgentOutputs((prev) => ({ ...prev, [agent.id]: { text, qa, done, briefId: data.briefId } }));
        },
        onError: ({ message }) => { err = message; },
      });
      if (err) {
        setAgentStates((prev) => ({ ...prev, [agent.id]: "failed" }));
        setRunErr(`${agent.name}: ${err}`);
        break;
      }
      setAgentStates((prev) => ({ ...prev, [agent.id]: "ok" }));
    }
    setPhase("done");
  };

  const handleReset = () => {
    setPhase("idle"); setInput("");
    setAgentStates({}); setAgentOutputs({}); setRunErr(null);
    setSharp({ loading: false, data: null, error: null });
    setAnswers({});
    setBriefBrandId(null);
  };

  const isActive = phase !== "idle";

  return (
    <div style={{padding:"24px 36px 72px"}}>
      {/* HERO — the launchpad. The workspace switcher lives in the
          dock under the logo now; the in-page bar was redundant. */}
      <Reveal>
        <section style={{
          background: "linear-gradient(180deg, var(--yellow-50) 0%, transparent 70%)",
          borderRadius: 24,
          padding: "56px 32px 24px",
          marginBottom: isActive ? 0 : 32,
          transition: "margin-bottom 200ms ease",
        }}>
          <div style={{maxWidth: 760, margin: "0 auto", textAlign: "center"}}>
            <div className="eyebrow eyebrow--yellow" style={{marginBottom: 14, letterSpacing:"0.22em"}}>
              CaastorOS · Brandolph
            </div>
            <h1 style={{
              fontFamily:"Georgia, serif", fontStyle:"italic",
              fontSize: 56, lineHeight: 1.08, letterSpacing:"-0.015em",
              margin: 0, color:"var(--c-ink)", fontWeight: 500,
            }}>
              {(() => {
                /* Split the translated hero around the {word} slot so the
                   highlighted verb keeps its <em> mark in every locale. */
                const parts = t("brandolph.hero", { word: "\u0000" }).split("\u0000");
                return <>{parts[0]}<em style={{background:"var(--yellow-300)", padding:"0 6px", fontStyle:"italic"}}>{t("brandolph.heroWord")}</em>{parts[1] ?? ""}</>;
              })()}
            </h1>
            <p style={{
              fontSize: 16, color:"var(--c-dim)", lineHeight: 1.55,
              margin: "16px auto 0", maxWidth: 520,
            }}>
              {t("brandolph.subcopy")}
            </p>

            {/* Scope pills lived here. They were four hardcoded demo product
                lines, and `scope` was never sent to the Sharpener — brands have
                no sub-line model, so the control had nothing real to filter. */}

            {/* Composer */}
            <div style={{
              marginTop: 32, background:"var(--c-card)",
              border: isActive ? "1.5px solid var(--yellow-500)" : "1.5px solid var(--c-line-2)",
              borderRadius: 16, padding: 18, textAlign:"left",
              boxShadow: isActive
                ? "0 0 0 4px rgba(248,192,54,0.12), var(--shadow-md)"
                : "var(--shadow-md)",
              transition: "border-color 160ms ease, box-shadow 160ms ease",
            }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--yellow-500)"; e.currentTarget.style.boxShadow = "0 0 0 4px rgba(248,192,54,0.16), var(--shadow-md)"; }}
              onBlur={(e) => { if (!isActive) { e.currentTarget.style.borderColor = "var(--c-line-2)"; e.currentTarget.style.boxShadow = "var(--shadow-md)"; } }}
              tabIndex={-1}
            >
              <textarea
                className="brandolph-composer__input"
                aria-label={t("brandolph.composerAria")}
                value={input}
                onChange={(e) => { setInput(e.target.value); if (phase !== "idle") setPhase("idle"); }}
                onKeyDown={handleKeyDown}
                placeholder={t("brandolph.composerPlaceholder")}
                rows={3}
                style={{
                  width:"100%", border:"none", outline:"none", resize:"none",
                  fontFamily:"var(--font-sans)", fontSize: 16, lineHeight: 1.5,
                  color:"var(--c-ink)", background:"transparent", padding: 0,
                }}
              />
              <div style={{
                marginTop: 12, paddingTop: 12,
                borderTop:"1px dashed var(--c-line)",
                display:"flex", justifyContent:"space-between", alignItems:"center", gap: 12,
              }}>
                <div style={{display:"flex", gap: 6}}>
                  {[
                    {k:"flow",   l:t("brandolph.modeFlow"),   icon:"sparkles"},
                    {k:"words",  l:t("brandolph.modeWords"),  icon:"brief"},
                    {k:"visual", l:t("brandolph.modeVisual"), icon:"canvas"},
                    {k:"polish", l:t("brandolph.modePolish"), icon:"edit"},
                  ].map(m => (
                    <button key={m.k} onClick={() => setMode(m.k)}
                      style={{
                        height: 30, padding:"0 12px",
                        background: mode === m.k ? "var(--yellow-500)" : "transparent",
                        color: mode === m.k ? "var(--c-ink)" : "var(--c-dim)",
                        border: mode === m.k ? "1px solid var(--yellow-500)" : "1px solid var(--c-line)",
                        borderRadius: 8, fontSize: 12, fontFamily:"inherit",
                        cursor:"pointer", display:"inline-flex", alignItems:"center", gap: 6,
                        fontWeight: mode === m.k ? 500 : 400,
                        transition:"all 140ms ease",
                      }}>
                      <Icon name={m.icon} size={12} /> {m.l}
                    </button>
                  ))}
                </div>
                <div style={{display:"flex", alignItems:"center", gap: 12}}>
                  <span style={{fontFamily:"var(--font-mono)", fontSize: 10.5, color:"var(--c-faint)", letterSpacing:"0.06em"}}>
                    <kbd style={{background:"var(--c-bg)", padding:"2px 6px", borderRadius: 4, border:"1px solid var(--c-line)"}}>⌘</kbd>
                    <span style={{margin:"0 4px"}}>+</span>
                    <kbd style={{background:"var(--c-bg)", padding:"2px 6px", borderRadius: 4, border:"1px solid var(--c-line)"}}>↵</kbd>
                  </span>
                  <button className="btn btn--primary" disabled={!input.trim()} onClick={handleStart}>
                    {isActive ? t("brandolph.reBrief") : t("brandolph.start")} <Icon name="arrow" size={14} />
                  </button>
                </div>
              </div>
            </div>

            <div aria-live="polite" style={{marginTop: 16, fontFamily:"var(--font-mono)", fontSize: 10.5, color:"var(--c-faint)", letterSpacing:"0.04em"}}>
              <BrandolphDot /> &nbsp;
              {stats.loading
                ? t("brandolph.checkingBrand")
                : stats.error
                  ? t("brandolph.bioStatusUnavailable", { error: stats.error })
                  : stats.brand && stats.bio
                    ? t("brandolph.brandBioReady", { name: stats.brand.name, score: stats.bio.score ?? "—", version: stats.bio.version })
                    : stats.brand
                      ? t("brandolph.brandNoBio", { name: stats.brand.name })
                      : t("brandolph.selectBrand")}
            </div>
          </div>

          {/* ── REVIEW PANEL — slides in below the composer inside the hero ── */}
          {isActive && (
            <div ref={reviewRef} style={{
              maxWidth: 760, margin: "28px auto 0",
              animation: "fade 200ms ease",
            }}>

              {/* Phase: sharpening — real a02 questions, brand-aware, with whys */}
              {phase === "sharpening" && (
                <div style={{
                  background:"var(--c-card)", border:"1px solid var(--c-line)",
                  borderLeft:"3px solid var(--yellow-500)", borderRadius: 14,
                  padding: "22px 26px", textAlign:"left",
                }}>
                  {sharp.loading && (
                    <div style={{display:"flex", alignItems:"center", gap: 12, padding:"12px 0"}}>
                      <BrandolphDot state="thinking" size={11} />
                      <div>
                        <div className="eyebrow eyebrow--yellow" style={{marginBottom: 2}}>{t("brandolph.sharpeningEyebrow")}</div>
                        <p style={{margin: 0, fontSize: 13.5, color:"var(--c-dim)", lineHeight: 1.5}}>{t("brandolph.sharpeningLoading")}</p>
                      </div>
                    </div>
                  )}

                  {!sharp.loading && sharp.error && (
                    <>
                      <div className="eyebrow eyebrow--yellow" style={{marginBottom: 8}}>{t("brandolph.sharpeningFailedEyebrow")}</div>
                      <p style={{margin: 0, fontSize: 13.5, color:"var(--c-dim)", marginBottom: 14, lineHeight: 1.5}}>
                        {t("brandolph.sharpeningFailedBody", { error: sharp.error })}
                      </p>
                      <button className="btn btn--primary" onClick={handleProceed}>{t("brandolph.proceedRaw")} →</button>
                    </>
                  )}

                  {!sharp.loading && sharp.data && (
                    <>
                      <div className="eyebrow eyebrow--yellow" style={{marginBottom: 8}}>{t("brandolph.sharpeningEyebrow")}</div>
                      {sharp.data.tension && (
                        <p style={{margin: 0, fontFamily:"Georgia, serif", fontStyle:"italic", fontSize: 17, color:"var(--c-ink)", lineHeight: 1.45, marginBottom: 12}}>
                          {sharp.data.tension}
                        </p>
                      )}
                      {sharp.data.sharpenedBrief && (
                        <div style={{padding: 12, background:"var(--c-bg)", borderRadius: 10, marginBottom: 20}}>
                          <div className="eyebrow" style={{marginBottom: 4}}>{t("brandolph.cmoRewrite")}</div>
                          <p style={{margin: 0, fontSize: 13.5, color:"var(--c-ink)", lineHeight: 1.55}}>{sharp.data.sharpenedBrief}</p>
                        </div>
                      )}

                      {(sharp.data.questions || []).length > 0 && (
                        <div style={{display:"flex", flexDirection:"column", gap: 10, marginBottom: 18}}>
                          {sharp.data.questions.map((q, i) => (
                            <div key={i} className="card" style={{padding:"14px 16px"}}>
                              <div style={{display:"flex", gap: 10, marginBottom: 8}}>
                                <span style={{fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--c-faint)", letterSpacing:"0.04em"}}>{String(i + 1).padStart(2, "0")}</span>
                                <div style={{flex: 1}}>
                                  <div style={{fontSize: 14.5, fontWeight: 500, color:"var(--c-ink)", lineHeight: 1.4}}>{q.q}</div>
                                  {q.solvingFor && <div style={{fontSize: 12.5, color:"var(--c-dim)", lineHeight: 1.45, marginTop: 4}}>{q.solvingFor}</div>}
                                </div>
                              </div>
                              <textarea
                                value={answers[i] || ""}
                                onChange={(e) => setAnswers((p) => ({ ...p, [i]: e.target.value }))}
                                onKeyDown={(e) => e.stopPropagation()}
                                placeholder={t("brandolph.answerPlaceholder")}
                                rows={2}
                                style={{width:"100%", padding:"9px 12px", borderRadius: 8,
                                  border:"1px solid var(--c-line)", background:"var(--c-bg)",
                                  fontFamily:"inherit", fontSize: 13.5, color:"var(--c-ink)",
                                  lineHeight: 1.5, resize:"vertical", outline:"none", boxSizing:"border-box"}}
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {(sharp.data.proposedSpecialists || []).length > 0 && (
                        <div style={{padding: 12, background:"var(--c-bg)", borderRadius: 10, marginBottom: 18}}>
                          <div className="eyebrow" style={{marginBottom: 6}}>{t("brandolph.proposedCrew")}</div>
                          <div style={{display:"flex", flexWrap:"wrap", gap: 6}}>
                            {sharp.data.proposedSpecialists.map((id) => {
                              const a = window.CI_AGENTS.find((x) => x.id === id);
                              if (!a) return null;
                              const accent = window.CI_DEPT_COLORS[a.dept] || "var(--neutral-300)";
                              return (
                                <span key={id} className="pill" style={{height: 22, padding:"0 10px", fontSize: 11.5, borderLeft: `3px solid ${accent}`}}>
                                  {a.name}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", paddingTop: 12, borderTop:"1px dashed var(--c-line)"}}>
                        <button className="btn btn--link" style={{fontSize: 12}} onClick={handleReset}>← {t("brandolph.reBrief")}</button>
                        <button className="btn btn--primary" onClick={handleProceed}>
                          {t("brandolph.proceedAssembly")} <Icon name="arrow" size={14} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Phase: proposing / running / done — inline assembly card */}
              {(phase === "proposing" || phase === "running" || phase === "done") && (
                <div style={{display:"flex", flexDirection:"column", gap: 14, textAlign:"left"}}>
                  <div className="card" style={{padding:"20px 24px", boxShadow:"var(--shadow-md)"}}>

                    {/* Card header */}
                    <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom: 16}}>
                      <div>
                        <div className="eyebrow eyebrow--yellow" style={{marginBottom: 4}}>
                          {phase === "done" ? t("brandolph.assemblyComplete") : t("brandolph.assemblyReady")}
                        </div>
                        <div style={{fontSize: 15, fontWeight: 500, color:"var(--c-ink)"}}>
                          {t("brandolph.specialists", { count: realAssembly.agents.length })} · {t("brandolph.creditsCount", { count: realAssembly.totalCr })}
                        </div>
                        <div style={{fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--c-faint)", marginTop: 3, letterSpacing:"0.04em"}}>
                          {[...new Set(realAssembly.agents.map(a => a.dept))].join(" · ")}
                        </div>
                      </div>
                      {phase !== "running" && (
                        <button className="btn btn--ghost btn--sm" onClick={handleReset}
                          style={{fontFamily:"var(--font-mono)", fontSize: 10.5, letterSpacing:"0.08em", textTransform:"uppercase"}}>
                          {phase === "done" ? <>← {t("brandolph.newBrief")}</> : <>← {t("brandolph.reBrief")}</>}
                        </button>
                      )}
                    </div>

                    {/* Agent grid */}
                    <div style={{
                      display:"grid",
                      gridTemplateColumns:"repeat(auto-fill, minmax(200px, 1fr))",
                      gap: 8, marginBottom: 16,
                    }}>
                      {realAssembly.agents.map((a, i) => {
                        const accent = window.CI_DEPT_COLORS[a.dept] || "var(--neutral-300)";
                        /* Pull live state from agentStates when running/done; default to queued */
                        const st = (agentStates[a.id]) ||
                          (phase === "done" ? "ok" : "queued");
                        return (
                          <div key={a.id} style={{
                            display:"flex", alignItems:"center", gap: 8,
                            padding:"8px 10px",
                            border:"1px solid var(--c-line)",
                            borderLeft:`3px solid ${accent}`,
                            borderRadius: 8,
                            background: st === "running" ? "var(--yellow-50)" : "var(--c-card)",
                            transition:"background 240ms ease",
                          }}>
                            <div style={{flex:1, minWidth:0}}>
                              <div style={{
                                fontSize:12.5, fontWeight:500, color:"var(--c-ink)",
                                whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
                              }}>{a.name}</div>
                              <div style={{
                                fontFamily:"var(--font-mono)", fontSize:9.5,
                                color:"var(--c-faint)", letterSpacing:"0.06em", textTransform:"uppercase",
                              }}>{a.dept}</div>
                            </div>
                            <div style={{display:"flex", alignItems:"center", gap:5, flexShrink:0}}>
                              <span className="credit" style={{fontSize:10}}>{a.cr} cr</span>
                              <span className={"dot-state dot-state--" + st} />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Footer: total cost + run / running / open CTA */}
                    <div style={{
                      paddingTop: 14, borderTop:"1px dashed var(--c-line)",
                      display:"flex", justifyContent:"space-between", alignItems:"center", gap: 12,
                    }}>
                      <div style={{fontFamily:"var(--font-mono)", fontSize:12, color:"var(--c-dim)"}}>
                        {t("brandolph.total")}{" "}
                        <strong style={{color:"var(--c-ink)"}}>{realAssembly.totalCr} cr</strong>
                        <span style={{color:"var(--c-faint)", margin:"0 8px"}}>·</span>
                        {stats.credits
                          ? t("brandolph.remainingAfter", { n: stats.credits.balance - (phase === "done" ? realAssembly.totalCr : 0) })
                          : t("brandolph.balanceLoading")}
                      </div>
                      {phase === "proposing" && (
                        <button className="btn btn--primary" onClick={handleRun}>
                          {t("brandolph.runCredits", { count: realAssembly.totalCr })} <Icon name="arrow" size={14} />
                        </button>
                      )}
                      {phase === "running" && (
                        <button className="btn btn--ghost" disabled style={{minWidth:140, justifyContent:"center"}}>
                          <BrandolphDot state="thinking" />&nbsp;&nbsp;{t("brandolph.assembling")}
                        </button>
                      )}
                      {phase === "done" && (
                        <a href="#/library" className="btn btn--primary">
                          <Icon name="check" size={14} /> {t("brandolph.openInLibrary")}
                        </a>
                      )}
                    </div>
                  </div>

                  {runErr && (
                    <div className="card" style={{padding:"10px 14px", borderLeft:"3px solid var(--pink-500)", fontSize: 13}}>
                      {runErr}
                    </div>
                  )}

                  {/* Real streaming outputs — one card per agent, in assembly order.
                      During `running` the active agent's card streams tokens; the
                      rest sit in queued/done states. */}
                  {(phase === "running" || phase === "done") && realAssembly.agents.map((a) => {
                    const data  = agentOutputs[a.id];
                    const state = agentStates[a.id] || "queued";
                    if (state === "queued") return null;       /* don't render empty cards for not-yet-started */
                    const text   = data?.text || "";
                    const qa     = data?.qa;
                    const done   = data?.done;
                    const accent = window.CI_DEPT_COLORS[a.dept] || "var(--neutral-300)";
                    const passed = qa?.passed ?? null;
                    return (
                      <div key={a.id} style={{
                        background: "var(--c-card)", border: "1px solid var(--c-line)",
                        borderLeft: `3px solid ${accent}`, borderRadius: 12,
                        padding: 16, textAlign:"left",
                      }}>
                        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 10}}>
                          <div className="eyebrow eyebrow--yellow">{a.name} · {a.dept}</div>
                          {state === "running" && <span style={{display:"inline-flex", alignItems:"center", gap: 6, fontFamily:"var(--font-mono)", fontSize: 10.5, color:"var(--yellow-700)"}}><BrandolphDot state="thinking" size={9} /> {t("brandolph.streaming")}</span>}
                          {state === "ok"      && qa && <span className="pill" style={{height: 20, padding:"0 9px", fontSize: 10, background: passed ? "var(--green-50, rgba(127,163,122,0.16))" : "var(--pink-50, rgba(244,143,177,0.12))", color: passed ? "var(--green-600)" : "var(--pink-700, var(--pink-500))"}}>{passed ? t("brandolph.approved") : t("brandolph.flagged")} · {qa.voice_match}/100</span>}
                          {state === "failed"  && <span className="pill" style={{height: 20, padding:"0 9px", fontSize: 10, background: "var(--pink-50, rgba(244,143,177,0.12))", color: "var(--pink-700, var(--pink-500))"}}>{t("brandolph.failed")}</span>}
                        </div>
                        <p style={{margin: 0, fontFamily:"Georgia, 'Times New Roman', serif", fontStyle:"italic", color:"var(--c-ink)", fontSize: 15.5, lineHeight: 1.6, whiteSpace:"pre-wrap"}}>
                          {text}{state === "running" ? <span style={{opacity: 0.4}}>▎</span> : null}
                        </p>
                        {done && (
                          <div style={{
                            marginTop: 12, paddingTop: 10, borderTop:"1px dashed var(--c-line-2)",
                            display:"flex", justifyContent:"space-between",
                            fontFamily:"var(--font-mono)", fontSize: 10.5, color:"var(--c-faint)", letterSpacing:"0.04em",
                          }}>
                            <span>
                              {t("brandolph.composedBy")} <span style={{color:"var(--c-ink)"}}>{done.spec?.name || a.name}</span> ·{" "}
                              {t("brandolph.bioVersion", { version: done.brand?.bioVersion })}
                              {done.brand?.certifiedBy
                                ? <> · <span style={{color:"var(--green-600)"}}>{t("brandolph.certified")}</span></>
                                : <> · <span style={{color:"var(--yellow-700)"}}>{t("brandolph.uncertified")}</span></>}
                            </span>
                            <span>{a.cr ?? "?"} cr</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>
      </Reveal>

      {/* Mini analytics dashboard — only at idle */}
      {!isActive && <HomeDashboard go={go} stats={stats} />}
    </div>
  );
}

/* The Console / Cards / Desk layout variants were deleted — all three were
   design explorations still rendering seed-brand demo data, reachable by
   anyone who opened Tweaks. Create is the home. */
function BrandolphHome({ tweaks, go }) {
  return <HomeCreate tweaks={tweaks} go={go} />;
}

Object.assign(window, { BrandolphHome });
