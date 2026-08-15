import React from "react";
import { useLocale } from "./lib/i18n.js";
import { apiFetch } from "./lib/supabase-browser.js";
const { Icon, BrandolphDot, StreamedText } = window;
/* Caastor Intelligence — Floating Brandolph                          */
/* The mascot button + chat panel that lives on every client screen.  */
/* Hidden on team portal and on /home (where chat is already primary).*/

const { useState: useFState, useEffect: useFEffect, useRef: useFRef } = React;

/* Live backend (P0). If VITE_API_BASE is set, we stream from caastoros-server.
   If unset (or the fetch fails), we keep the fakeReply mock so the SPA never
   degrades from a missing server.                                            */
const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");

/* The OFFICIAL Caastor / Brandolph mascot — paths lifted from         */
/* /assets/mascot/yellow.svg. Yellow body, black outline + face.       */
function MascotIcon({ size = 60, color = "yellow" }) {
  const fills = {
    yellow: "#F8C036",
    green:  "#30B478",
    red:    "#F0486C",
    violet: "#8436C0",
    white:  "#FFFFFF",
    cream:  "#FFF8E6",
  };
  const bodyFill = fills[color] || fills.yellow;
  const ink = "#1A1F36";
  const aspect = 984 / 1176;
  return (
    <svg width={size} height={size / aspect} viewBox="0 0 984 1176" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{display:"block"}}>
      {/* Body silhouette w/ two ear bumps */}
      <path fill={bodyFill} d="M708,216c0-19.9-16.1-36-36-36s-36,16.1-36,36H276c0-19.9-16.1-36-36-36s-36,16.1-36,36c0,19.9,16.1,36,36,36v684h504V216H708z"/>
      {/* Eyebrows (rotated bars) */}
      <rect x="414" y="255.4" transform="matrix(0.2873 -0.9578 0.9578 0.2873 -5.2749 628.9104)" width="12" height="125.3" fill={ink}/>
      <rect x="632.3" y="276" transform="matrix(0.9192 -0.3938 0.3938 0.9192 -56.2662 289.8156)" width="91.4" height="12" fill={ink}/>
      {/* Nose, mouth, teeth, body inner contour */}
      <path fill={ink} d="M684,714c-66.4,0-90-54.9-90-102V494.5l58.2-58.2l-8.5-8.5l-56.1,56.1l-67.8-56.5l-7.7,9.2l69.8,58.2V612c0,60.1-37,102-90,102c-55.8,0-90.5-56.5-90.9-57.1l-10.3,6.2c1.5,2.6,38.5,62.9,101.1,62.9c10.6,0,20.6-1.5,30-4.3V846h120V718.2c11.9,5,25.8,7.8,42,7.8V714z M534,717.3c21-9.5,37.6-26.2,48-48.2V834h-48V717.3z M630,834h-36V670.2c7.7,16.8,19.4,31.7,36,41.8V834z"/>
      {/* Pupils */}
      <rect x="420" y="360" width="24" height="36" fill={ink}/>
      <rect x="672" y="360" width="24" height="36" fill={ink}/>
      {/* Glasses — left rim */}
      <path fill={ink} d="M456,522c-41.9,0-66-41.6-66-114s24.1-114,66-114s66,41.6,66,114S497.9,522,456,522z M456,306c-34.3,0-54,37.2-54,102s19.7,102,54,102s54-37.2,54-102S490.3,306,456,306z"/>
      {/* Glasses — right rim */}
      <path fill={ink} d="M708,522c-41.9,0-66-41.6-66-114s24.1-114,66-114s66,41.6,66,114S749.9,522,708,522z M708,306c-34.3,0-54,37.2-54,102s19.7,102,54,102s54-37.2,54-102S742.3,306,708,306z"/>
      {/* Left temple bar */}
      <rect x="252" y="366" width="144" height="12" fill={ink}/>
      {/* Nose bridge */}
      <path fill={ink} d="M645.3,377.4C645.1,377.3,622,366,588,366c-46.1,0-69.1,11.3-69.3,11.4l-5.4-10.7c1-0.5,25.8-12.6,74.7-12.6c37,0,61.7,12.1,62.7,12.6L645.3,377.4z"/>
    </svg>
  );
}

/* Memory-derived contextual greeting. Reads the brand's running
   memory (approval rates, edit patterns, escalation signal) and
   surfaces the single most useful thing Brandolph could say right
   now. Falls back to the route-based generic line if the brand has
   no signal yet.

   Returns { line, prompts? } — prompts is a curated list of follow-up
   asks the floater can render as quick-tap buttons. */
function deriveContextFromMemory({ stats, signals, routeId, agentsById }) {
  if (!stats || stats.length === 0) return { line: null, prompts: null };

  /* 1. Premium re-run pattern — operator keeps escalating a spec */
  const rerunUp = {};
  for (const s of (signals || [])) {
    if (s.kind === "spec.rerun_with_premium" && s.specialist_id) {
      rerunUp[s.specialist_id] = (rerunUp[s.specialist_id] || 0) + 1;
    }
  }
  const escalated = Object.entries(rerunUp).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])[0];
  if (escalated) {
    const [id, n] = escalated;
    const name = agentsById?.[id]?.name || id;
    return {
      line: `*You've escalated ${name} to premium ${n} times this month.* Want me to default it to the heavier model and stop asking?`,
      prompts: [
        { eyebrow: "Promote", text: `Default ${name} to its premium model from now on.` },
        { eyebrow: "Leave it", text: `Keep ${name} on the cheap default — I'll escalate manually.` },
      ],
    };
  }

  /* 2. High edit rate — specialist consistently needs human polish */
  const heavyEdit = stats
    .filter((r) => (r.runs_total || 0) >= 3)
    .map((r) => ({ ...r, editRate: r.runs_total > 0 ? r.runs_edited / r.runs_total : 0 }))
    .filter((r) => r.editRate >= 0.4)
    .sort((a, b) => b.editRate - a.editRate)[0];
  if (heavyEdit) {
    const name = agentsById?.[heavyEdit.specialist_id]?.name || heavyEdit.specialist_id;
    const pct = Math.round(100 * heavyEdit.editRate);
    return {
      line: `*${name} is getting heavily edited.* ${pct}% of runs touched. Could be the brief, could be the model, could be the BIO voice.`,
      prompts: [
        { eyebrow: "Diagnose", text: `Why am I editing ${name} so much?` },
        { eyebrow: "Try", text: `Re-run my last ${name} brief on a stronger model.` },
      ],
    };
  }

  /* 3. Low brand-match on images — palette / BIO visual drift */
  const lowVision = stats
    .filter((r) => (r.brand_match_n || 0) >= 2 && (r.avg_brand_match ?? 100) < 65)
    .sort((a, b) => a.avg_brand_match - b.avg_brand_match)[0];
  if (lowVision) {
    const name = agentsById?.[lowVision.specialist_id]?.name || lowVision.specialist_id;
    return {
      line: `*${name} keeps scoring ${lowVision.avg_brand_match}/100 on brand match.* The BIO visual rules may need tightening.`,
      prompts: [
        { eyebrow: "Diagnose", text: `What's drifting in my ${name} outputs?` },
        { eyebrow: "Tune", text: `Help me tighten the BIO palette + imagery rules.` },
      ],
    };
  }

  /* 4. Strong recent week — celebrate, suggest next */
  const recentRuns = (signals || []).filter((s) => s.kind === "run.approved" || s.kind === "run.flagged");
  const recentApproved = recentRuns.filter((s) => s.kind === "run.approved").length;
  if (recentRuns.length >= 8) {
    const pct = Math.round(100 * recentApproved / recentRuns.length);
    return {
      line: `*${recentRuns.length} runs recently, ${pct}% approved.* What's next on the slate?`,
      prompts: null,
    };
  }

  return { line: null, prompts: null };
}

/* Contextual greeting Brandolph says when first opened on each route. */
function getContextLine(routeId, t) {
  switch (routeId) {
    case "home":         return t("floater.greeting.home");
    case "discovery":    return t("floater.greeting.discovery");
    case "bio":          return t("floater.greeting.bio");
    case "briefs":       return t("floater.greeting.briefs");
    case "brief-detail": return t("floater.greeting.briefDetail");
    case "specialists":  return t("floater.greeting.specialists");
    case "canvas":       return t("floater.greeting.canvas");
    case "craft":        return t("floater.greeting.craft");
    case "credits":      return t("floater.greeting.credits");
    case "settings":     return t("floater.greeting.settings");
    default:             return t("floater.greeting.default");
  }
}

/* Stream tokens from POST /api/brandolph/ask. Throws on network/HTTP
   error so the caller can fall back to fakeReply.                       */
async function streamBrandolph({ history, routeId, brandId, onToken, signal }) {
  /* apiFetch attaches the session JWT — /api/brandolph/ask is requireAuth,
     so a raw fetch() (no Authorization header) 401s and silently drops the
     floater to the mock reply. apiFetch also returns the streaming Response
     untouched, so SSE reading below is unchanged. */
  const res = await apiFetch("/api/brandolph/ask", {
    method: "POST",
    body: JSON.stringify({ messages: history, routeId, brandId }),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error("server " + res.status);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // SSE frames are separated by a blank line
    let split;
    while ((split = buf.indexOf("\n\n")) !== -1) {
      const frame = buf.slice(0, split);
      buf = buf.slice(split + 2);
      let eventName = "message";
      const dataLines = [];
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length === 0) continue;
      let payload = null;
      try { payload = JSON.parse(dataLines.join("\n")); } catch { payload = null; }
      if (eventName === "token" && payload?.text) onToken(payload.text);
      else if (eventName === "error") throw new Error(payload?.message || "stream error");
      else if (eventName === "done") return payload;
    }
  }
  return null;
}

/* Mock replies — heuristic match on user input.                       */
function fakeReply(msg) {
  const m = msg.toLowerCase();
  if (/status|going on|in flight|what'?s up|running/.test(m))
    return "*Two things alive.* Pricing relaunch is in production — Email 2 reads dutiful and needs one more pass before it ships. Collection essay is with Lia for a finishing pass. Everything else is on you to push.";
  if (/next|brief.*next|what.*ship|new brief/.test(m))
    return "*Summer Tuesdays.* You sketched it on Friday. I have two sharpening questions before we assemble: in or out for wholesale, and is this an organic-only push or do we have paid?";
  if (/bio|read.*me|positioning|brand/.test(m))
    return "*Your BIO is the source of truth for this answer.* If it is incomplete, finish Discovery before asking Brandolph to make a strategic recommendation.";
  if (/block|stuck|wait/.test(m))
    return "*One thing is actively stuck.* The pricing decision gates the outputs in flight. Until you decide, I'm holding the email and pricing hero.";
  if (/cost|credit|spend|budget/.test(m))
    return "*337 cr spent this cycle. 563 left, 14 days to reset.* The split: 41% AI work, 33% human craft, 8% QA. If you're heavy on craft this cycle it's because the Hero KV and the Collection essay both landed with Aitana and Lia.";
  if (/team|aitana|marc|lia|diego/.test(m))
    return "*The team has two of your jobs.* Aitana on the Hero KV — delivered v3, you commented this morning. Lia on the Collection essay — finishing pass. Both on track.";
  if (/refuse|not doing|kill/.test(m))
    return "*I'd kill the brewing-kit page.* It converts at 0.4% and dilutes the subscription story. Doing that frees a Sonnet pass for the wholesale flow you've been deferring.";
  if (/who|specialist|agent/.test(m))
    return "*For your next brief I'd assemble The Sharpener, The Strategist, Conversion Copy, Email Sequence, and Brand Consistency QA.* That's 36 cr and the smallest crew that earns the brief.";
  return "*Heard.* Give me a beat — I'd rather come back with a brief or a question than an answer. Probably a question.";
}

/* Streaming-style Brandolph line (italic + yellow voice) -------- */
function FloaterMessage({ m }) {
  if (m.role === "user") {
    return (
      <div className="bf-msg bf-msg--user">
        <div className="bf-msg__bubble">{m.text}</div>
      </div>
    );
  }
  return (
    <div className="bf-msg bf-msg--brandolph">
      <span style={{flexShrink: 0, marginTop: 2}}>
        <MascotIcon size={26} />
      </span>
      <div className="bf-msg__bubble">
        {m.live
          ? <span>{m.text}{m.text ? <span className="b-caret" /> : <BrandolphDot state="thinking" />}</span>
          : <StreamedText html={m.text} startDelay={300} />}
      </div>
    </div>
  );
}

/* Re-render this component on hash + portal change -------------- */
function useRouteSubscription() {
  const [, setTick] = useFState(0);
  useFEffect(() => {
    const bump = () => setTick(t => t + 1);
    window.addEventListener("hashchange", bump);
    /* Listen to a custom event the App fires after portal flips. */
    window.addEventListener("__ci_portal_change", bump);
    return () => {
      window.removeEventListener("hashchange", bump);
      window.removeEventListener("__ci_portal_change", bump);
    };
  }, []);
}

/* Floating Brandolph - the mascot + popover chat */
function FloatingBrandolph() {
  useRouteSubscription();
  const { t } = useLocale();
  const [open, setOpen] = useFState(false);
  const [render, setRender] = useFState(false);   // panel stays mounted through its exit animation
  const [input, setInput] = useFState("");
  const [messages, setMessages] = useFState([]);
  const [thinking, setThinking] = useFState(false);
  const bodyRef = useFRef(null);
  const closeTimerRef = useFRef(null);

  /* Keep the panel in the DOM briefly after close so it can animate out. */
  useFEffect(() => {
    if (open) {
      setRender(true);
      if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
    } else {
      closeTimerRef.current = setTimeout(() => setRender(false), 200);
    }
    return () => { if (closeTimerRef.current) clearTimeout(closeTimerRef.current); };
  }, [open]);

  const portal = window.__CI_PORTAL || "client";
  const hash = (window.location.hash || "").replace(/^#\/?/, "") || "home";
  const [routeId] = hash.split("/");
  const onHome = routeId === "home";

  /* List routes render full-width rows whose right edge carries a status
     pill + open/→ affordance. The fixed bottom-right floater was landing
     on top of a mid-list row, occluding its CTA. On those routes we lift
     the floater clear of the row gutter so it never competes with row
     content. Behaviour/features are untouched — purely a position nudge. */
  const onListRoute = routeId === "briefs" || routeId === "library";

  /* Auto-scroll body to bottom when messages change */
  useFEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, thinking, open]);

  /* Keyboard close */
  useFEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  /* Brand memory snapshot — fetched once per workspace switch, drives
     the contextual greeting. Falls back gracefully if the migration
     isn't applied or the fetch fails (Brandolph still works).

     CRITICAL: these hooks must run UNCONDITIONALLY, ABOVE the early
     `return null` below. `portal` flips client→team when the async role
     resolve completes; if the return sat before these hooks the hook
     count would change between renders and React throws "rendered fewer
     hooks than expected", white-screening the whole app (it bit every
     team/admin account). All hooks first, conditional return after. */
  const [memory, setMemory] = useFState(null);
  const currentBrandId = window.useCurrentBrandId ? window.useCurrentBrandId() : null;
  useFEffect(() => {
    if (!currentBrandId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/brandolph/memory?brandId=" + encodeURIComponent(currentBrandId));
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setMemory(json);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [currentBrandId, open]);

  /* The floater only renders on client + admin surfaces. This early
     return MUST stay below every hook above (stable hook order). */
  if (portal !== "client" && portal !== "admin") return null;

  const agentsById = window.CI_AGENTS ? Object.fromEntries(window.CI_AGENTS.map((a) => [a.id, a])) : {};
  const derived = memory && memory.migrationApplied
    ? deriveContextFromMemory({ stats: memory.stats, signals: memory.signals, routeId, agentsById })
    : { line: null, prompts: null };

  const prompts = derived.prompts || [
    { eyebrow: t("floater.prompt.statusEyebrow"),  text: t("floater.prompt.statusText") },
    { eyebrow: t("floater.prompt.nextEyebrow"),    text: t("floater.prompt.nextText") },
    { eyebrow: t("floater.prompt.sharpenEyebrow"), text: t("floater.prompt.sharpenText") },
    { eyebrow: t("floater.prompt.refuseEyebrow"),  text: t("floater.prompt.refuseText") },
  ];

  const send = async (textArg) => {
    const t = (textArg ?? input).trim();
    if (!t || thinking) return;
    const userMsg = { role: "user", text: t };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setThinking(true);

    /* Mock fallback path — used when no API_BASE is configured, and as the
       recovery branch if the live call throws.                            */
    const playMock = () => {
      setTimeout(() => {
        setMessages(prev => [...prev, { role: "brandolph", text: fakeReply(t) }]);
        setThinking(false);
      }, 1400 + Math.random() * 600);
    };

    // In prod API_BASE is "" (same-origin) which is a VALID backend — only
    // fall back to the mock in dev when no server is configured.
    if (import.meta.env.DEV && !API_BASE) { playMock(); return; }

    /* Live path — append an empty `live` brandolph message and grow it as
       tokens arrive from the server.                                      */
    const history = [...messages, userMsg].map(m => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.text,
    }));
    setMessages(prev => [...prev, { role: "brandolph", text: "", live: true }]);

    try {
      await streamBrandolph({
        history,
        routeId,
        brandId: currentBrandId,
        onToken: (delta) => {
          setMessages(prev => {
            const copy = prev.slice();
            const last = copy[copy.length - 1];
            if (last && last.live) copy[copy.length - 1] = { ...last, text: last.text + delta };
            return copy;
          });
        },
      });
      /* Mark the message done — switches the renderer from raw to formatted. */
      setMessages(prev => {
        const copy = prev.slice();
        const last = copy[copy.length - 1];
        if (last && last.live) copy[copy.length - 1] = { ...last, live: false };
        return copy;
      });
    } catch (err) {
      /* Drop the empty live bubble and fall back to mock so the UI never breaks. */
      setMessages(prev => {
        const copy = prev.slice();
        const last = copy[copy.length - 1];
        if (last && last.live) copy.pop();
        return copy;
      });
      console.warn("Brandolph live stream failed, falling back to mock:", err);
      playMock();
      return;
    }
    setThinking(false);
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <React.Fragment>
      {open && <div className="bf-backdrop" onClick={() => setOpen(false)} />}

      {render && (
        <aside className={"bf-panel" + (open ? "" : " bf-panel--out")} role="dialog" aria-label={t("floater.ask")}>
          <header className="bf-header">
            <span className="bf-header__mark">
              <MascotIcon size={32} />
            </span>
            <div style={{display:"flex", flexDirection:"column"}}>
              <span className="bf-header__title">Brandolph</span>
              <span className="bf-header__sub">{t("floater.headerSub")}</span>
            </div>
            <button className="bf-header__close" onClick={() => setOpen(false)} aria-label={t("floater.close")}>
              <svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            </button>
          </header>

          <div ref={bodyRef} className="bf-body scroll">
            {messages.length === 0 ? (
              <React.Fragment>
                <FloaterMessage m={{ role: "brandolph", text: derived.line || getContextLine(routeId, t) }} />
                <div className="eyebrow" style={{marginTop: 4, marginBottom: 4}}>{t("floater.tryAsking")}</div>
                <div style={{display:"flex", flexDirection:"column", gap: 8}}>
                  {prompts.map((p, i) => (
                    <button key={i} className="bf-prompt" onClick={() => send(p.text)}>
                      <div style={{flex: 1, minWidth: 0}}>
                        <div className="bf-prompt__eyebrow">{p.eyebrow}</div>
                        <div className="bf-prompt__text">{p.text}</div>
                      </div>
                      <Icon name="arrow" size={13} />
                    </button>
                  ))}
                </div>
              </React.Fragment>
            ) : (
              messages.map((m, i) => <FloaterMessage key={i} m={m} />)
            )}
            {thinking && (
              <div className="bf-msg bf-msg--brandolph">
                <span style={{flexShrink: 0, marginTop: 2}}>
                  <MascotIcon size={26} />
                </span>
                <div className="bf-msg__bubble" style={{display:"flex", alignItems:"center", gap: 4}}>
                  <BrandolphDot state="thinking" />
                  <span style={{fontSize: 12, color:"var(--c-faint)", marginLeft: 6}}>{t("floater.reading")}</span>
                </div>
              </div>
            )}
          </div>

          <footer className="bf-footer">
            <div className="bf-input">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                rows={1}
                placeholder={t("floater.placeholder")}
              />
              <button className="btn btn--primary btn--icon" onClick={() => send()} aria-label={t("floater.send")}
                style={{width: 32, height: 32, borderRadius: 8, alignSelf:"center"}}>
                <Icon name="arrow" size={14} />
              </button>
            </div>
            <div className="bf-meta">
              <span><strong style={{color:"var(--green-700)", fontWeight:600}}>{t("floater.free")}</strong> {t("floater.metaRest")}</span>
              {messages.length > 0 && (
                <button className="btn btn--link" style={{fontSize: 10, padding: 0}} onClick={() => setMessages([])}>
                  {t("floater.clear")}
                </button>
              )}
            </div>
            <div style={{marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--c-line-2)", display:"flex", gap: 6}}>
              <a href="#/home" onClick={() => setOpen(false)} className="btn btn--primary btn--sm" style={{flex: 1, justifyContent:"center"}}>
                {t("floater.briefNewTask")} <Icon name="arrow" size={12} />
              </a>
              <a href="#/briefs" onClick={() => setOpen(false)} className="btn btn--ghost btn--sm" style={{flex: 1, justifyContent:"center"}}>
                {t("floater.addToFlow")}
              </a>
            </div>
          </footer>
        </aside>
      )}

      <button
        className={"bf-button" + (open ? " bf-button--open" : "")}
        onClick={() => setOpen(o => !o)}
        aria-label={t("floater.ask")}
        aria-expanded={open}
        style={onListRoute && !open ? { bottom: "var(--space-13, 80px)" } : undefined}
      >
        <MascotIcon size={60} />
        {!open && messages.length === 0 && (
          <span
            className="bf-button__ping"
            role="status"
            aria-label={t("floater.pingLabel")}
            title={t("floater.pingTitle")}
          >1</span>
        )}
      </button>
    </React.Fragment>
  );
}

Object.assign(window, { FloatingBrandolph, MascotIcon });
