import React from "react";
import { apiFetch, supabase } from "./lib/supabase-browser.js";
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
/* Brandolph home — three layout variants the user toggles via tweaks. */

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

function isPlaceholderBrand(brand) {
  const name = String(brand?.name || "").trim().toLowerCase();
  return !name || name === "my brand" || name === "untitled brand" || name === "new brand";
}

function flattenBriefOutputs(briefs = []) {
  const outputs = [];
  for (const brief of briefs || []) {
    for (const run of brief.runs || []) {
      for (const output of run.outputs || []) {
        outputs.push({ ...output, run, brief });
      }
    }
  }
  return outputs.sort((a, b) => new Date(b.created_at || b.run?.ended_at || b.brief?.created_at || 0) - new Date(a.created_at || a.run?.ended_at || a.brief?.created_at || 0));
}

function readableOutputTitle(output) {
  const body = output?.body || {};
  return body.title || body.name || body.headline || output?.brief?.title || output?.brief?.payload?.title || output?.kind || "Output";
}

function useHomeWorkspaceSnapshot() {
  const [state, setState] = React.useState({
    loading: true,
    error: null,
    brands: [],
    brand: null,
    bio: null,
    reviewPending: false,
    focusCount: 0,
    briefs: [],
    outputs: [],
    sourceCount: 0,
    credits: null,
    stage: "loading",
  });

  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const { data: brands, error: brandErr } = await supabase
          .from("brands")
          .select("id, name, url, created_at")
          .order("created_at", { ascending: true });
        if (brandErr) throw brandErr;

        const ownedBrands = brands || [];
        const stored = window.getCurrentBrandId?.();
        let brand = ownedBrands.find((b) => b.id === stored) || ownedBrands[0] || null;
        if (brand && brand.id !== stored) window.setCurrentBrandId?.(brand.id);

        if (!brand) {
          if (!cancelled) {
            setState({
              loading: false,
              error: null,
              brands: [],
              brand: null,
              bio: null,
              reviewPending: false,
              focusCount: 0,
              briefs: [],
              outputs: [],
              sourceCount: 0,
              credits: null,
              stage: "no-brand",
            });
          }
          return;
        }

        const [bioRes, briefsRes, sourceRes, creditsRes] = await Promise.all([
          apiFetch(`/api/bios/${brand.id}`).then(async (r) => r.ok ? r.json() : { bio: null, reviewPending: false, focusCount: 0 }).catch(() => ({ bio: null, reviewPending: false, focusCount: 0 })),
          supabase
            .from("briefs")
            .select(`
              id, title, type, payload, mode, status, created_at,
              runs ( id, specialist_id, spec_version, bio_version, model_used, status, prompt_tokens, completion_tokens, ended_at,
                     outputs ( id, kind, body, status, rationale, created_at ) )
            `)
            .eq("brand_id", brand.id)
            .order("created_at", { ascending: false }),
          supabase
            .from("bio_sources")
            .select("id", { count: "exact", head: true })
            .eq("brand_id", brand.id),
          apiFetch("/api/credits").then(async (r) => r.ok ? r.json() : null).catch(() => null),
        ]);

        if (briefsRes.error) throw briefsRes.error;
        const bio = bioRes?.bio || null;
        const briefs = briefsRes.data || [];
        const outputs = flattenBriefOutputs(briefs);
        const stage = !bio
          ? "no-bio"
          : bio.certified
            ? "ready"
            : "review";

        if (!cancelled) {
          setState({
            loading: false,
            error: null,
            brands: ownedBrands,
            brand,
            bio,
            reviewPending: !!bioRes?.reviewPending,
            focusCount: bioRes?.focusCount || 0,
            briefs,
            outputs,
            sourceCount: sourceRes.count || 0,
            credits: creditsRes,
            stage,
            placeholderBrand: isPlaceholderBrand(brand),
          });
        }
      } catch (e) {
        if (!cancelled) setState((prev) => ({ ...prev, loading: false, error: e?.message || String(e), stage: "error" }));
      }
    };

    load();
    window.addEventListener("brand:changed", load);
    window.addEventListener("ci_auth_change", load);
    return () => {
      cancelled = true;
      window.removeEventListener("brand:changed", load);
      window.removeEventListener("ci_auth_change", load);
    };
  }, []);

  return state;
}


function FirstRunOnboarding({ snapshot, go }) {
  const brand = snapshot.brand;
  const hasBio = !!snapshot.bio;
  const reviewCopy = snapshot.reviewPending
    ? "A Steward review is already queued. You can inspect the draft BIO while the review is in motion."
    : "The BIO exists, but it is not certified yet. Client outputs stay locked until a Steward approves the canon.";
  const title = snapshot.stage === "review"
    ? `${brand?.name || "Your brand"} is waiting for certification.`
    : "Build the brand canon before you brief.";
  const intro = snapshot.stage === "review"
    ? reviewCopy
    : "Caastor needs a Brand Intelligence Object: one source of truth for audience, voice, strategy, visual rules, and refusals. Briefs unlock when that foundation is reviewed.";
  const steps = [
    { label: "Brand", text: brand ? (snapshot.placeholderBrand ? "Name still needs cleanup" : brand.name) : "Create the first brand", done: !!brand && !snapshot.placeholderBrand },
    { label: "Discovery", text: hasBio ? `BIO v${snapshot.bio.version} compiled` : "Read the site and source files", done: hasBio },
    { label: "Steward", text: snapshot.bio?.certified ? "Certified" : snapshot.reviewPending ? "Review queued" : "Needs review", done: !!snapshot.bio?.certified },
    { label: "Create", text: snapshot.bio?.certified ? "Briefs unlocked" : "Locked until certification", done: !!snapshot.bio?.certified },
  ];

  return (
    <div style={{padding:"34px 36px 72px"}}>
      <div style={{maxWidth: 1120, margin:"0 auto"}}>
        <section className="first-run-grid">
          <div>
            <div className="eyebrow eyebrow--yellow" style={{marginBottom: 12}}>First setup</div>
            <h1 style={{
              margin:"0 0 14px",
              fontFamily:"Georgia, serif",
              fontStyle:"italic",
              fontWeight: 500,
              fontSize:"clamp(32px, 4vw, 46px)",
              lineHeight:1.04,
              letterSpacing:"-0.018em",
              color:"var(--c-ink)",
            }}>
              {title}
            </h1>
            <p style={{margin:"0 0 24px", maxWidth: 660, color:"var(--c-dim)", fontSize: 16, lineHeight: 1.58}}>
              {intro}
            </p>
            <div style={{display:"flex", gap: 10, flexWrap:"wrap"}}>
              {snapshot.stage === "review" ? (
                <>
                  <button className="btn btn--primary btn--lg" onClick={() => go("bio")}>
                    Open BIO <Icon name="arrow" size={14} />
                  </button>
                  <button className="btn btn--ghost" onClick={() => go("discovery")}>
                    Re-run Discovery
                  </button>
                </>
              ) : (
                <>
                  <button className="btn btn--primary btn--lg" onClick={() => go(snapshot.placeholderBrand ? "onboarding" : "discovery")}>
                    Continue brand setup <Icon name="arrow" size={14} />
                  </button>
                  <button className="btn btn--ghost" onClick={() => go("bio")}>
                    View BIO area
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="card" style={{padding: 22}}>
            <div className="eyebrow" style={{marginBottom: 14}}>Workspace state</div>
            <div style={{display:"flex", flexDirection:"column", gap: 12}}>
              {steps.map((step, i) => (
                <div key={step.label} style={{display:"grid", gridTemplateColumns:"28px 1fr", gap: 10, alignItems:"start"}}>
                  <span style={{
                    width: 24, height: 24, borderRadius: 999,
                    display:"inline-flex", alignItems:"center", justifyContent:"center",
                    background: step.done ? "var(--green-50, rgba(127,163,122,0.16))" : "var(--neutral-50)",
                    color: step.done ? "var(--green-600)" : "var(--c-faint)",
                    fontFamily:"var(--font-mono)", fontSize: 11,
                  }}>{step.done ? "✓" : i + 1}</span>
                  <div>
                    <div style={{fontSize: 13.5, fontWeight: 600, color:"var(--c-ink)"}}>{step.label}</div>
                    <div style={{fontSize: 12.5, color:"var(--c-dim)", marginTop: 2, lineHeight: 1.45}}>{step.text}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{height:1, background:"var(--c-line)", margin:"18px 0"}} />
            <div style={{display:"flex", gap:10, alignItems:"flex-start", color:"var(--c-dim)"}}>
              <Icon name="bio" size={17} />
              <div style={{fontSize:12.5, lineHeight:1.5}}>
                {snapshot.sourceCount > 0
                  ? `${snapshot.sourceCount} evidence source${snapshot.sourceCount === 1 ? "" : "s"} attached to this BIO.`
                  : "Official pages and client files are treated as evidence, not inspiration."}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/* Real dashboard — no invented success rates, campaign counts, or fake library items. */
function HomeDashboard({ go, snapshot }) {
  const briefs = snapshot.briefs || [];
  const credits = snapshot.credits;
  const outputs = snapshot.outputs || [];
  const inFlight = briefs.filter(b => ["draft","active","in-production","approved"].includes(b.status));
  const recent = outputs.slice(0, 4);

  if (snapshot.loading) {
    return (
      <div style={{maxWidth:1080, margin:"0 auto"}}>
        <div className="card" style={{padding: 22, display:"flex", alignItems:"center", gap: 10}}>
          <BrandolphDot state="thinking" size={11} />
          <span style={{fontSize: 13, color:"var(--c-dim)"}}>Loading workspace state…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="home-dashboard">
      <section className="home-dashboard__work">
        <div className="home-dashboard__heading">
          <div><div className="eyebrow">Work in progress</div><h2>{inFlight.length ? "Active briefs" : "No active briefs"}</h2></div>
          <button className="btn btn--link" onClick={() => go("briefs")}>View briefs <Icon name="arrow" size={13} /></button>
        </div>
        {inFlight.length ? (
          <div className="home-dashboard__briefs">
            {inFlight.slice(0, 4).map((brief) => (
              <a key={brief.id} href={"#/board/" + brief.id} className="home-dashboard__brief">
                <div><span className="eyebrow">{brief.type || "Brief"}</span><h3>{brief.payload?.title || brief.title || "Untitled brief"}</h3></div>
                <div className="home-dashboard__brief-meta"><StatusPill status={brief.status} /><span>{(brief.runs || []).length} run{(brief.runs || []).length === 1 ? "" : "s"}</span><Icon name="arrow" size={13} /></div>
              </a>
            ))}
          </div>
        ) : (
          <div className="home-dashboard__empty">
            <Icon name="brief" size={24} />
            <div><strong>Your certified BIO is ready.</strong><span>Describe the business change above to create the first brief.</span></div>
          </div>
        )}

        <div className="home-dashboard__heading home-dashboard__heading--library">
          <div><div className="eyebrow">Recent output</div><h2>Library</h2></div>
          <button className="btn btn--link" onClick={() => go("library")}>Open library <Icon name="arrow" size={13} /></button>
        </div>
        {recent.length ? (
          <div className="home-dashboard__outputs">
            {recent.map((output) => (
              <button key={output.id} onClick={() => go("library")}>
                <span className="home-dashboard__output-icon"><Icon name={output.kind === "image" ? "canvas" : "files"} size={15} /></span>
                <span>{readableOutputTitle(output)}</span>
                <small>{output.kind || "output"}</small>
                <Icon name="arrow" size={13} />
              </button>
            ))}
          </div>
        ) : (
          <p className="home-dashboard__quiet">Finished specialist work will appear here. Nothing is pre-filled or simulated.</p>
        )}
      </section>

      <aside className="home-dashboard__aside">
        <div className="home-dashboard__status">
          <div className="home-dashboard__status-head"><span className="home-dashboard__status-icon home-dashboard__status-icon--bio"><Icon name="bio" size={18} /></span><span className="eyebrow">Brand canon</span></div>
          <h3>{snapshot.brand?.name || "Brand"} BIO</h3>
          <p>Version {snapshot.bio?.version || "-"} is certified and used for every new brief.</p>
          <div className="home-dashboard__status-line"><span>Confidence</span><strong>{snapshot.bio?.score != null ? `${snapshot.bio.score}/100` : "Reviewed"}</strong></div>
          <button className="btn btn--ghost" onClick={() => go("bio")}>Open BIO <Icon name="arrow" size={13} /></button>
        </div>
        <div className="home-dashboard__status">
          <div className="home-dashboard__status-head"><span className="home-dashboard__status-icon"><Icon name="credit" size={18} /></span><span className="eyebrow">Credits</span></div>
          <div className="home-dashboard__credit-value">{credits ? credits.balance : "Not loaded"}<span>{credits ? "available" : "ledger"}</span></div>
          {credits?.monthly > 0 && <div className="home-dashboard__credit-track"><span style={{width:`${Math.min(100, Math.max(0, (credits.balance / credits.monthly) * 100))}%`}} /></div>}
          <button className="btn btn--ghost" onClick={() => go("credits")}>Open ledger <Icon name="arrow" size={13} /></button>
        </div>
      </aside>
    </div>
  );
}

function HomeCreate({ tweaks, go }) {
  const snapshot = useHomeWorkspaceSnapshot();

  if (snapshot.loading) {
    return (
      <div style={{padding:"34px 36px 72px"}}>
        <div style={{maxWidth: 760, margin:"0 auto"}}>
          <div className="card" style={{padding: 24, display:"flex", alignItems:"center", gap: 12}}>
            <BrandolphDot state="thinking" size={11} />
            <span style={{fontSize: 14, color:"var(--c-dim)"}}>Reading workspace state…</span>
          </div>
        </div>
      </div>
    );
  }

  if (snapshot.error) {
    return (
      <div style={{padding:"34px 36px 72px"}}>
        <div className="card" style={{maxWidth: 760, margin:"0 auto", padding: 24, borderLeft:"3px solid var(--pink-500)"}}>
          <div className="eyebrow eyebrow--pink" style={{marginBottom: 8}}>Workspace state unavailable</div>
          <div style={{fontSize: 14, color:"var(--c-dim)", lineHeight: 1.5}}>{snapshot.error}</div>
        </div>
      </div>
    );
  }

  if (snapshot.stage !== "ready") {
    return <FirstRunOnboarding snapshot={snapshot} go={go} />;
  }

  return <HomeCreateReady tweaks={tweaks} go={go} snapshot={snapshot} />;
}

function HomeCreateReady({ tweaks, go, snapshot }) {
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
  const [briefDraft, setBriefDraft] = useBState({ title:"", objective:"", tension:"", direction:"" });

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

  const creditBalance = snapshot.credits?.balance;
  const bioLabel = snapshot.bio ? `BIO v${snapshot.bio.version} · ${snapshot.bio.score ?? "—"}/100` : "BIO unavailable";

  const handleStart = async () => {
    if (!input.trim()) return;
    /* Real a02 The Sharpener pass — reads the BIO + brief, returns 2–3
       brand-aware questions + a proposed crew. If sharpening fails
       (network, parse, etc.), skip straight to proposing with the raw
       brief so the user is never blocked. */
    setPhase("sharpening");
    setSharp({ loading: true, data: null, error: null });
    setAnswers({});
    setBriefDraft({ title:"", objective:"", tension:"", direction:"" });
    setQStep(0);
    setTimeout(() => reviewRef.current?.scrollIntoView({ behavior:"smooth", block:"nearest" }), 80);
    try {
      const res = await apiFetch("/api/briefs/sharpen", {
        method: "POST",
        body: JSON.stringify({ briefText: input.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setSharp({ loading: false, data: json, error: null });
      setBriefDraft({
        title: String(json.title || input.trim().split(/\s+/).slice(0, 8).join(" ")).trim(),
        objective: String(json.sharpenedBrief || input.trim()).trim(),
        tension: String(json.tension || "").trim(),
        direction: String(json.orchestrationRationale || json.deliveryPlan?.orchestrationRationale || "").trim(),
      });
    } catch (e) {
      setSharp({ loading: false, data: null, error: e?.message || String(e) });
    }
  };

  const handleKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleStart();
  };

  const handleProceed = () => {
    /* Hand off the run context to the Canvas: BIO → Brief → Specialists
       assemble there with animations, then the user fires the run from
       the Canvas itself. The Canvas is the moment-of-truth UX surface;
       a flat inline grid breaks that promise. */
    const ctx = {
      rawBrief:      input.trim(),
      composedBrief: composeBriefText(),
      title:         briefDraft.title || sharp.data?.title || "",
      sharpenedBrief: briefDraft.objective || sharp.data?.sharpenedBrief || input.trim(),
      tension:       briefDraft.tension || sharp.data?.tension || "",
      questions:     sharp.data?.questions || [],
      answers,
      refusals:      sharp.data?.refusals || [],
      orchestrationRationale: briefDraft.direction || sharp.data?.orchestrationRationale || sharp.data?.deliveryPlan?.orchestrationRationale || "",
      specialistIds: realAssembly.agents.map((a) => a.id),
      deliveryPlan:  sharp.data?.deliveryPlan || null,
      totalCr:       realAssembly.totalCr,
      briefApprovedAt: new Date().toISOString(),
      approvalState: "brief-approved",
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
    const sharpened = (briefDraft.objective || data?.sharpenedBrief || "").trim();
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

    if (briefDraft.tension || data?.tension) {
      blocks.push(`The tension underneath this: ${briefDraft.tension || data.tension}`);
    }

    if (briefDraft.direction) {
      blocks.push(`Execution direction: ${briefDraft.direction}`);
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
    setBriefDraft({ title:"", objective:"", tension:"", direction:"" });
  };

  const isActive = phase !== "idle";

  return (
    <div style={{padding:"24px 36px 72px"}}>
      {/* HERO — the launchpad. The workspace switcher lives in the
          dock under the logo now; the in-page bar was redundant. */}
      <Reveal>
        <section className="create-launchpad" style={{
          padding: "40px 32px 28px",
          marginBottom: isActive ? 0 : 32,
          transition: "margin-bottom 200ms ease",
        }}>
          <div style={{maxWidth: 760, margin: "0 auto", textAlign: "center"}}>
            <div className="eyebrow eyebrow--yellow" style={{marginBottom: 14, letterSpacing:"0.22em"}}>
              CaastorOS · Brandolph
            </div>
            <h1 style={{
              fontFamily:"var(--font-sans)", fontStyle:"normal",
              fontSize: 40, lineHeight: 1.12, letterSpacing:0,
              margin: 0, color:"var(--c-ink)", fontWeight: 650,
            }}>
              What needs to change?
            </h1>
            <p style={{
              fontSize: 16, color:"var(--c-dim)", lineHeight: 1.55,
              margin: "16px auto 0", maxWidth: 520,
            }}>
              Describe the business outcome. Brandolph reads the certified BIO, sharpens the brief, and shows you the smallest useful crew before anything runs.
            </p>

            {/* Composer */}
            <div style={{
              marginTop: 24, background:"var(--c-card)",
              border: isActive ? "1.5px solid var(--yellow-500)" : "1.5px solid var(--c-line-2)",
              borderRadius: 8, padding: 18, textAlign:"left",
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
                value={input}
                onChange={(e) => { setInput(e.target.value); if (phase !== "idle") setPhase("idle"); }}
                onKeyDown={handleKeyDown}
                placeholder="e.g. Turn the next product launch into a two-week system across social, email, and landing page."
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
                <div className="create-launchpad__modes">
                  {[
                    {k:"flow",   l:"Full flow",   icon:"sparkles"},
                    {k:"words",  l:"Words only",  icon:"brief"},
                    {k:"visual", l:"Visual only", icon:"canvas"},
                    {k:"polish", l:"Polish",      icon:"edit"},
                  ].map(m => (
                    <button key={m.k} onClick={() => setMode(m.k)}
                      style={{
                        height: 30, padding:"0 12px",
                        background: mode === m.k ? "var(--yellow-500)" : "transparent",
                        color: mode === m.k ? "var(--c-ink)" : "var(--c-dim)",
                        border: mode === m.k ? "1px solid var(--yellow-500)" : "1px solid var(--c-line)",
                        borderRadius: 6, fontSize: 12, fontFamily:"inherit",
                        cursor:"pointer", display:"inline-flex", alignItems:"center", gap: 6,
                        fontWeight: mode === m.k ? 500 : 400,
                        transition:"all 140ms ease",
                      }}>
                      <Icon name={m.icon} size={12} /> {m.l}
                    </button>
                  ))}
                </div>
                <div style={{display:"flex", alignItems:"center", gap: 12}}>
                  <button className="btn btn--primary" disabled={!input.trim()} onClick={handleStart}>
                    {isActive ? "Re-brief" : "Start"} <Icon name="arrow" size={14} />
                  </button>
                </div>
              </div>
            </div>

            <div style={{marginTop: 16, fontFamily:"var(--font-mono)", fontSize: 10.5, color:"var(--c-faint)", letterSpacing:"0.06em"}}>
              <BrandolphDot /> &nbsp;{bioLabel} / Brandolph sharpens the brief before assembly / Asking is free
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
                        <div className="eyebrow eyebrow--yellow" style={{marginBottom: 2}}>Brandolph · sharpening</div>
                        <p style={{margin: 0, fontSize: 13.5, color:"var(--c-dim)", lineHeight: 1.5}}>Reading your BIO. Pressuring the brief. Picking the smallest crew.</p>
                      </div>
                    </div>
                  )}

                  {!sharp.loading && sharp.error && (
                    <>
                      <div className="eyebrow eyebrow--yellow" style={{marginBottom: 8}}>Brandolph · sharpening failed</div>
                      <p style={{margin: 0, fontSize: 13.5, color:"var(--c-dim)", marginBottom: 14, lineHeight: 1.5}}>
                        {sharp.error}. You can run the brief as-written.
                      </p>
                      <button className="btn btn--primary" onClick={handleProceed}>Use raw brief &amp; review crew <Icon name="arrow" size={14} /></button>
                    </>
                  )}

                  {!sharp.loading && sharp.data && (
                    <>
                      <div className="eyebrow eyebrow--yellow" style={{marginBottom: 8}}>Brandolph · sharpening</div>
                      <div style={{padding: 16, background:"var(--c-bg)", border:"1px solid var(--c-line)", borderRadius: 8, marginBottom: 20}}>
                        <div style={{display:"flex", justifyContent:"space-between", gap:12, alignItems:"baseline", marginBottom:12}}>
                          <div className="eyebrow">Decision brief</div>
                          <span style={{fontSize:11, color:"var(--c-faint)"}}>Edit anything Brandolph misunderstood.</span>
                        </div>
                        <div style={{display:"grid", gap:12}}>
                          <label style={{display:"grid", gap:6, fontSize:11.5, fontWeight:650, color:"var(--c-dim)"}}>
                            Title
                            <input className="input" value={briefDraft.title}
                              onChange={(e) => setBriefDraft((draft) => ({...draft, title:e.target.value}))}
                              style={{height:40, fontWeight:600}} />
                          </label>
                          <label style={{display:"grid", gap:6, fontSize:11.5, fontWeight:650, color:"var(--c-dim)"}}>
                            Objective
                            <textarea value={briefDraft.objective}
                              onChange={(e) => setBriefDraft((draft) => ({...draft, objective:e.target.value}))}
                              rows={4} style={{width:"100%", boxSizing:"border-box", padding:"10px 12px", border:"1px solid var(--c-line-2)", borderRadius:8, background:"var(--c-card)", color:"var(--c-ink)", font:"inherit", fontSize:13.5, lineHeight:1.5, resize:"vertical"}} />
                          </label>
                          <label style={{display:"grid", gap:6, fontSize:11.5, fontWeight:650, color:"var(--c-dim)"}}>
                            Business tension
                            <textarea value={briefDraft.tension}
                              onChange={(e) => setBriefDraft((draft) => ({...draft, tension:e.target.value}))}
                              rows={2} style={{width:"100%", boxSizing:"border-box", padding:"10px 12px", border:"1px solid var(--c-line-2)", borderRadius:8, background:"var(--c-card)", color:"var(--c-ink)", font:"inherit", fontSize:13, lineHeight:1.5, resize:"vertical"}} />
                          </label>
                          <label style={{display:"grid", gap:6, fontSize:11.5, fontWeight:650, color:"var(--c-dim)"}}>
                            Execution direction
                            <textarea value={briefDraft.direction}
                              onChange={(e) => setBriefDraft((draft) => ({...draft, direction:e.target.value}))}
                              rows={2} style={{width:"100%", boxSizing:"border-box", padding:"10px 12px", border:"1px solid var(--c-line-2)", borderRadius:8, background:"var(--c-card)", color:"var(--c-ink)", font:"inherit", fontSize:13, lineHeight:1.5, resize:"vertical"}} />
                          </label>
                        </div>
                      </div>

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
                                placeholder="Answer in a sentence — or skip."
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
                          <div className="eyebrow" style={{marginBottom: 6}}>Suggested roles</div>
                          {(sharp.data.orchestrationRationale || sharp.data.deliveryPlan?.orchestrationRationale) && (
                            <p style={{margin:"0 0 10px", fontSize: 13, color:"var(--c-dim)", lineHeight: 1.5}}>
                              {sharp.data.orchestrationRationale || sharp.data.deliveryPlan.orchestrationRationale}
                            </p>
                          )}
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
                        <button className="btn btn--link" style={{fontSize: 12}} onClick={handleReset}>← Re-brief</button>
                        <button className="btn btn--primary" onClick={handleProceed}>
                          Approve brief &amp; review crew <Icon name="arrow" size={14} />
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
                          {phase === "done" ? "Assembly · complete" : "Assembly · ready to run"}
                        </div>
                        <div style={{fontSize: 15, fontWeight: 500, color:"var(--c-ink)"}}>
                          {realAssembly.agents.length} specialists · {realAssembly.totalCr} credits
                        </div>
                        <div style={{fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--c-faint)", marginTop: 3, letterSpacing:"0.04em"}}>
                          {[...new Set(realAssembly.agents.map(a => a.dept))].join(" · ")}
                        </div>
                      </div>
                      {phase !== "running" && (
                        <button className="btn btn--ghost btn--sm" onClick={handleReset}
                          style={{fontFamily:"var(--font-mono)", fontSize: 10.5, letterSpacing:"0.08em", textTransform:"uppercase"}}>
                          {phase === "done" ? "← New brief" : "← Re-brief"}
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
                        Total{" "}
                        <strong style={{color:"var(--c-ink)"}}>{realAssembly.totalCr} cr</strong>
                        {typeof creditBalance === "number" && (
                          <>
                            <span style={{color:"var(--c-faint)", margin:"0 8px"}}>·</span>
                            {Math.max(0, creditBalance - (phase === "done" ? realAssembly.totalCr : 0))} remaining after
                          </>
                        )}
                      </div>
                      {phase === "proposing" && (
                        <button className="btn btn--primary" onClick={handleRun}>
                          Run — {realAssembly.totalCr} credits <Icon name="arrow" size={14} />
                        </button>
                      )}
                      {phase === "running" && (
                        <button className="btn btn--ghost" disabled style={{minWidth:140, justifyContent:"center"}}>
                          <BrandolphDot state="thinking" />&nbsp;&nbsp;Assembling…
                        </button>
                      )}
                      {phase === "done" && (
                        <a href="#/library" className="btn btn--primary">
                          <Icon name="check" size={14} /> Open in Library
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
                          {state === "running" && <span style={{display:"inline-flex", alignItems:"center", gap: 6, fontFamily:"var(--font-mono)", fontSize: 10.5, color:"var(--yellow-700)"}}><BrandolphDot state="thinking" size={9} /> streaming</span>}
                          {state === "ok"      && qa && <span className="pill" style={{height: 20, padding:"0 9px", fontSize: 10, background: passed ? "var(--green-50, rgba(127,163,122,0.16))" : "var(--pink-50, rgba(244,143,177,0.12))", color: passed ? "var(--green-600)" : "var(--pink-700, var(--pink-500))"}}>{passed ? "approved" : "flagged"} · {qa.voice_match}/100</span>}
                          {state === "failed"  && <span className="pill" style={{height: 20, padding:"0 9px", fontSize: 10, background: "var(--pink-50, rgba(244,143,177,0.12))", color: "var(--pink-700, var(--pink-500))"}}>failed</span>}
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
                              Composed by <span style={{color:"var(--c-ink)"}}>{done.spec?.name || a.name}</span> ·
                              BIO v{done.brand?.bioVersion}
                              {done.brand?.certifiedBy
                                ? <> · <span style={{color:"var(--green-600)"}}>certified</span></>
                                : <> · <span style={{color:"var(--yellow-700)"}}>uncertified</span></>}
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
      {!isActive && <HomeDashboard go={go} snapshot={snapshot} />}
    </div>
  );
}

/* Dispatcher — chooses which home variant to render */
function BrandolphHome({ tweaks, setTweak, go }) {
  return <HomeCreate tweaks={tweaks} go={go} />;
}

Object.assign(window, { BrandolphHome });
