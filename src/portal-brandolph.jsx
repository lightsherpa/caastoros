import React from "react";
import { useLocale } from "./lib/i18n.js";
import { apiFetch } from "./lib/supabase-browser.js";
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

/* Brandolph message rendered with italic + yellow voice highlight */
function BrandolphLine({ html, who = "brandolph" }) {
  return (
    <div style={{display:"flex", gap: 12, alignItems:"flex-start"}}>
      {who === "brandolph" ? <BrandolphAvatar /> : (
        <img src={window.CI_USER.avatar} alt="" style={{width: 36, height: 36, borderRadius: "50%", objectFit:"cover"}} />
      )}
      <div style={{flex: 1, minWidth: 0}}>
        <div style={{display:"flex", alignItems:"center", gap:8, marginBottom: 4}}>
          <span style={{fontWeight:500, fontSize:13, color:"var(--c-ink)"}}>
            {who === "brandolph" ? "Brandolph" : window.CI_USER.name}
          </span>
          {who === "brandolph" && <LayerTag layer="L1" />}
          <span className="eyebrow" style={{marginLeft:"auto"}}>now</span>
        </div>
        <div className="b-voice" style={{fontSize: 14.5, lineHeight: 1.6, color:"var(--c-ink)"}}>
          <StreamedText html={html} stream={who === "brandolph"} />
        </div>
      </div>
    </div>
  );
}

/* Brandolph's diagnosis card (the "sharpens before assembling" pattern) */
function BrandolphDiagnosis({ onAnswer, onProceed }) {
  return (
    <div style={{
      borderLeft: "3px solid var(--yellow-500)",
      background: "var(--yellow-50)",
      borderRadius: "0 12px 12px 0",
      padding: "18px 22px",
      marginTop: 14,
    }}>
      <div className="eyebrow eyebrow--yellow" style={{marginBottom: 8}}>Brandolph · sharpening</div>
      <div style={{
        fontFamily:"Georgia, serif", fontStyle:"italic", fontSize: 16,
        color:"var(--c-ink)", lineHeight: 1.5, marginBottom: 14,
      }}>
        Before we run this, two things I'd want a CMO to answer first. They're not gatekeepers — they're the difference between a pricing page that converts and one that hedges.
      </div>
      <ol style={{margin: 0, padding: 0, listStyle:"none", display:"flex", flexDirection:"column", gap: 12}}>
        <li>
          <div style={{display:"flex", gap: 10}}>
            <span style={{
              fontFamily:"var(--font-mono)", fontSize:11, color:"var(--yellow-800)",
              minWidth: 22,
            }}>01</span>
            <div>
              <div style={{fontWeight: 500, fontSize: 14, color:"var(--c-ink)"}}>Annual at 11.4× monthly, or 10×?</div>
              <div style={{fontSize: 12.5, color:"var(--c-dim)", marginTop: 4}}>
                Because — at 10× you're competing with your own monthly. At 11.4× you're offering 1-in-12 free, which reads as a decision, not a discount.
              </div>
            </div>
          </div>
        </li>
        <li>
          <div style={{display:"flex", gap: 10}}>
            <span style={{
              fontFamily:"var(--font-mono)", fontSize:11, color:"var(--yellow-800)",
              minWidth: 22,
            }}>02</span>
            <div>
              <div style={{fontWeight: 500, fontSize: 14, color:"var(--c-ink)"}}>Is the wholesale audience in or out of this push?</div>
              <div style={{fontSize: 12.5, color:"var(--c-dim)", marginTop: 4}}>
                Because — they convert on email differently. If they're in, I'll route a sequence variant B. If they're out, we don't waste a Sonnet pass on copy that won't land.
              </div>
            </div>
          </div>
        </li>
      </ol>
      <div style={{display:"flex", gap: 8, marginTop: 16}}>
        <button className="btn btn--primary btn--sm" onClick={onAnswer}>Answer inline</button>
        <button className="btn btn--ghost btn--sm" onClick={onProceed}>Proceed with what Brandolph proposes</button>
      </div>
    </div>
  );
}

/* "Not doing" red card */
function NotDoing({ items }) {
  return (
    <div style={{
      borderLeft: "3px solid var(--pink-500)",
      background: "var(--pink-50)",
      borderRadius: "0 12px 12px 0",
      padding: "16px 20px",
    }}>
      <div className="eyebrow eyebrow--pink" style={{marginBottom: 8}}>What this brief is NOT doing</div>
      <ul style={{margin:0, paddingLeft: 0, listStyle:"none", display:"flex", flexDirection:"column", gap: 8}}>
        {items.map((it, i) => (
          <li key={i} style={{display:"flex", gap: 10, fontSize:13.5, lineHeight: 1.45}}>
            <span style={{color:"var(--pink-500)", fontFamily:"var(--font-mono)"}}>✕</span>
            <span style={{color:"var(--c-ink)"}}>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* Assembly panel — used in Console + Desk variants */
function AssemblyPanel({ assembly, runState = "proposing", onRun }) {
  const isTeam = useIsTeam();
  return (
    <div style={{display:"flex", flexDirection:"column", height:"100%"}}>
      <div style={{
        padding:"18px 20px", borderBottom: "1px solid var(--c-line)",
      }}>
        <div className="eyebrow" style={{marginBottom: 6}}>Assembly</div>
        <div style={{fontSize: 15, fontWeight: 500, color:"var(--c-ink)", letterSpacing:"-0.005em"}}>Pricing relaunch</div>
        <div style={{fontSize: 12, color:"var(--c-faint)", marginTop: 2}}>
          {assembly.agents.length} specialists assembled{isTeam ? ` · ${assembly.models.length} models routed` : ""}
        </div>
      </div>
      <div className="scroll" style={{flex:1, overflowY:"auto", padding:"12px 12px", display:"flex", flexDirection:"column", gap: 6}}>
        {assembly.agents.map((a, i) => {
          const m = window.CI_MODELS[a.model];
          const accent = isTeam ? m.color : (window.CI_DEPT_COLORS[a.dept] || "var(--neutral-300)");
          const state = runState === "running" ? (i < 2 ? "ok" : i === 2 ? "running" : "queued")
                       : runState === "done" ? "ok"
                       : "queued";
          return (
            <div key={a.id} style={{
              display:"flex", alignItems:"center", gap: 10,
              padding: "10px 12px",
              borderRadius: 8,
              border:"1px solid var(--c-line)",
              borderLeft: `3px solid ${accent}`,
              background: state === "running" ? "var(--yellow-50)" : "var(--c-card)",
              transition: "background 200ms ease",
            }}>
              <span style={{
                fontFamily:"var(--font-mono)", fontSize:10, color:"var(--c-faint)",
                letterSpacing:"0.06em", minWidth: 28,
              }}>{a.code.replace("L2-","")}</span>
              <div style={{flex:1, minWidth: 0}}>
                <div style={{fontSize: 13, fontWeight: 500, color:"var(--c-ink)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{a.name}</div>
                <div style={{display:"flex", alignItems:"center", gap:6, marginTop:2}}>
                  {isTeam ? (
                    <>
                      <span className="modelchip__dot" style={{width:6, height:6, background: m.color}} />
                      <span style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--c-faint)", letterSpacing:"0.04em"}}>{m.label}</span>
                    </>
                  ) : (
                    <span style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--c-faint)", letterSpacing:"0.06em", textTransform:"uppercase"}}>{a.dept}</span>
                  )}
                </div>
              </div>
              <div style={{display:"flex", alignItems:"center", gap: 8}}>
                <span className="credit" style={{fontSize:11}}>{a.cr} cr</span>
                <span className={"dot-state dot-state--" + state} />
              </div>
            </div>
          );
        })}
      </div>
      <div style={{
        padding:"14px 18px", borderTop:"1px solid var(--c-line)",
        background:"var(--c-bg)",
      }}>
        <div style={{display:"flex", justifyContent:"space-between", marginBottom: 12, fontSize:13}}>
          <span style={{color:"var(--c-dim)"}}>Total</span>
          <strong style={{fontFamily:"var(--font-mono)"}}>{assembly.totalCr} cr</strong>
        </div>
        {runState === "running" ? (
          <button className="btn btn--ghost" style={{width:"100%", justifyContent:"center"}} disabled>
            <BrandolphDot state="thinking" /> Running…
          </button>
        ) : runState === "done" ? (
          <button className="btn btn--primary" style={{width:"100%", justifyContent:"center"}}>
            <Icon name="check" size={14} /> Open the work
          </button>
        ) : (
          <button className="btn btn--primary" style={{width:"100%", justifyContent:"center"}} onClick={onRun}>
            Run — {assembly.totalCr} credits <Icon name="arrow" size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

/* BIO chip — a left rail summary entry */
function BioChip({ bioScore }) {
  return (
    <div className="card" style={{padding: "14px 16px", marginBottom: 14}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom: 6}}>
        <span className="eyebrow">BIO · Vinilo</span>
        <span style={{fontFamily:"var(--font-mono)", fontWeight: 600, fontSize:14, color:"var(--c-ink)"}}>{bioScore}%</span>
      </div>
      <div style={{height:6, background:"var(--neutral-50)", borderRadius: 999, overflow:"hidden", marginBottom: 10}}>
        <div style={{height:"100%", width: bioScore + "%", background:"var(--yellow-500)", borderRadius:999}} />
      </div>
      <div style={{fontSize: 12, color:"var(--c-dim)", lineHeight: 1.45}}>
        <strong style={{color:"var(--c-ink)", fontWeight:500}}>Slow Tuesdays.</strong> Editorial + warm. No "limited", no "unlock", no urgency manipulation.
      </div>
      <a href="#/bio" className="btn btn--link" style={{marginTop: 8, fontSize:12}}>View full BIO →</a>
    </div>
  );
}

/* Quick prompts (suggested actions Brandolph offers) */
function QuickPrompts({ onPrompt }) {
  const items = [
    { eyebrow:"Strategy",   label:"What's blocked on the pricing relaunch?" },
    { eyebrow:"Ship",       label:"Three subject line variants for Tuesday's send" },
    { eyebrow:"Read me",    label:"Read my BIO out loud — diagnostic mode" },
    { eyebrow:"Sharpen",    label:"I want to brief a summer campaign" },
  ];
  return (
    <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap: 10}}>
      {items.map((it, i) => (
        <button key={i} className="card" onClick={() => onPrompt(it.label)} style={{
          textAlign:"left", padding:"12px 14px", cursor:"pointer", border:"1px solid var(--c-line)",
          background:"var(--c-card)", transition:"border-color 140ms ease",
        }}
          onMouseEnter={e => e.currentTarget.style.borderColor = "var(--purple-300)"}
          onMouseLeave={e => e.currentTarget.style.borderColor = "var(--c-line)"}
        >
          <div className="eyebrow eyebrow--purple" style={{marginBottom: 4}}>{it.eyebrow}</div>
          <div style={{fontSize: 13.5, color:"var(--c-ink)", lineHeight: 1.4}}>{it.label}</div>
        </button>
      ))}
    </div>
  );
}

/* Composer (chat input) */
function Composer({ value, onChange, onSend, placeholder }) {
  return (
    <div style={{
      background:"var(--c-card)", border:"1.5px solid var(--c-line-2)",
      borderRadius: 14, padding: 12,
      transition:"border-color 160ms ease, box-shadow 160ms ease",
    }}
      onFocus={(e) => { e.currentTarget.style.borderColor = "var(--purple-500)"; e.currentTarget.style.boxShadow = "var(--shadow-focus-ring)"; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = "var(--c-line-2)"; e.currentTarget.style.boxShadow = "none"; }}
      tabIndex={-1}
    >
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        placeholder={placeholder || "Tell me what you're working on…"}
        style={{
          width:"100%", border:"none", outline:"none", resize:"none",
          fontFamily:"var(--font-sans)", fontSize: 15, color:"var(--c-ink)",
          background:"transparent", padding: 0, lineHeight: 1.5,
        }}
      />
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginTop: 6}}>
        <div style={{display:"flex", gap: 10, alignItems:"center"}}>
          <button className="btn btn--ghost btn--sm" style={{height:28, padding:"0 10px"}}>
            <Icon name="files" size={13} /> Attach
          </button>
          <button className="btn btn--ghost btn--sm" style={{height:28, padding:"0 10px"}}>
            <Icon name="brief" size={13} /> From brief
          </button>
          <span style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--c-faint)", letterSpacing:"0.04em"}}>
            Brandolph turn ≈ 3 cr · Assembly previewed before spend
          </span>
        </div>
        <button className="btn btn--primary btn--sm" onClick={onSend}>
          Send <Icon name="arrow" size={13} />
        </button>
      </div>
    </div>
  );
}

/* Outputs ready strip (shows when assembly is done) */
function OutputsReady({ outputs }) {
  return (
    <div style={{borderLeft:"3px solid var(--green-500)", background:"var(--green-50)", borderRadius:"0 12px 12px 0", padding:"16px 20px"}}>
      <div className="eyebrow eyebrow--green" style={{marginBottom: 8}}>Brandolph · ready</div>
      <p style={{fontSize: 14, color:"var(--c-ink)", margin: 0, marginBottom: 12}}>
        The pricing relaunch is back from the team. <em className="b-voice" style={{background:"none"}}>I read it.</em>{" "}
        The conversion copy + subject lines hold. Email 2 reads dutiful — I'd send it for a second pass. Want me to, or want to read it first?
      </p>
      <div style={{display:"flex", gap: 8, flexWrap:"wrap"}}>
        <a href="#/briefs/b-pricing-relaunch" className="btn btn--primary btn--sm">Open the brief →</a>
        <button className="btn btn--ghost btn--sm">Send Email 2 back for a pass — 5 cr</button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* Variant A — CONSOLE (chat + assembly always visible)            */
function HomeConsole({ tweaks }) {
  const [input, setInput] = useBState("");
  const [runState, setRunState] = useBState("proposing");
  const assembly = useBMemo(() => getAssembly(tweaks.assemblyDensity || 7), [tweaks.assemblyDensity]);
  const openers = window.CI_BRANDOLPH_OPENERS;
  const opener = openers[tweaks.brandolphMood || "midway"];

  return (
    <div className="bcon">
      {/* Left rail */}
      <aside className="bcon-left scroll" style={{padding: 24, borderRight:"1px solid var(--c-line)", overflowY:"auto"}}>
        <BioChip bioScore={tweaks.bioScore || 91} />
        <div className="eyebrow" style={{margin:"4px 4px 10px"}}>This week</div>
        <div className="card" style={{padding: 14, marginBottom: 12}}>
          <div style={{display:"flex", justifyContent:"space-between", marginBottom: 6}}>
            <span style={{fontSize:13, color:"var(--c-dim)"}}>Active briefs</span>
            <strong style={{fontFamily:"var(--font-mono)"}}>3</strong>
          </div>
          <div style={{display:"flex", justifyContent:"space-between", marginBottom: 6}}>
            <span style={{fontSize:13, color:"var(--c-dim)"}}>Outputs shipped</span>
            <strong style={{fontFamily:"var(--font-mono)"}}>9</strong>
          </div>
          <div style={{display:"flex", justifyContent:"space-between"}}>
            <span style={{fontSize:13, color:"var(--c-dim)"}}>Credits spent</span>
            <strong style={{fontFamily:"var(--font-mono)"}}>337</strong>
          </div>
        </div>
        <div className="eyebrow" style={{margin:"14px 4px 10px"}}>Recent briefs</div>
        <div style={{display:"flex", flexDirection:"column", gap: 6}}>
          {window.CI_BRIEFS.slice(0,3).map(b => (
            <a key={b.id} href={"#/board/" + b.id} className="card" style={{
              padding:"10px 12px", textDecoration:"none", cursor:"pointer",
              display:"flex", flexDirection:"column", gap: 4,
            }}>
              <span style={{fontSize: 13, fontWeight: 500, color:"var(--c-ink)"}}>{b.title}</span>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                <StatusPill status={b.status} />
                <span style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--c-faint)"}}>{b.createdAt}</span>
              </div>
            </a>
          ))}
        </div>
      </aside>

      {/* Main chat surface */}
      <section className="scroll" style={{padding:"24px 32px", overflowY:"auto", display:"flex", flexDirection:"column"}}>
        <div className="stream" style={{display:"flex", flexDirection:"column", gap: 22, flex:1}}>
          <BrandolphLine html={opener} />
          {tweaks.brandolphMood === "midway" && (
            <>
              <OutputsReady outputs={window.CI_OUTPUTS.filter(o => o.briefId === "b-pricing-relaunch")} />
              <BrandolphLine html="One more thing while I have you. The summer campaign you sketched on Friday — I drafted three creative territories for it. *Two are obvious. One is a refusal disguised as a territory.* Want to see them?" />
            </>
          )}
          {tweaks.brandolphMood === "cold" && (
            <BrandolphDiagnosis onAnswer={() => {}} onProceed={() => {}} />
          )}
          {tweaks.brandolphMood === "welcome" && (
            <QuickPrompts onPrompt={(p) => setInput(p)} />
          )}
          {tweaks.brandolphMood === "fresh" && (
            <>
              <NotDoing items={[
                "Don't ask me to make a logo before we agree what 'Vinilo' is for in 2026.",
                "Don't ask me to write you content for a content calendar that doesn't exist yet.",
              ]} />
              <QuickPrompts onPrompt={(p) => setInput(p)} />
            </>
          )}
        </div>
        <div style={{position:"sticky", bottom: 0, paddingTop: 22, background:"linear-gradient(180deg, transparent, var(--c-bg) 30%)"}}>
          <Composer value={input} onChange={setInput} onSend={() => { setInput(""); setRunState("running"); setTimeout(() => setRunState("done"), 3500); }} />
        </div>
      </section>

      {/* Right rail — assembly */}
      <aside className="bcon-right scroll" style={{borderLeft:"1px solid var(--c-line)", background:"var(--c-card)", overflowY:"auto"}}>
        <AssemblyPanel assembly={assembly} runState={runState} onRun={() => { setRunState("running"); setTimeout(() => setRunState("done"), 3500); }} />
      </aside>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* Variant B — CARDS (Brandolph offers options, less prompt-first)  */
function HomeCards({ tweaks }) {
  const assembly = useBMemo(() => getAssembly(tweaks.assemblyDensity || 7), [tweaks.assemblyDensity]);
  return (
    <div style={{padding:"32px 40px", maxWidth: 1180, margin:"0 auto"}}>
      <Reveal>
        <div style={{display:"flex", gap: 18, alignItems:"flex-start", marginBottom: 28}}>
          <BrandolphAvatar size={56} />
          <div style={{flex:1, paddingTop: 8}}>
            <div className="eyebrow eyebrow--yellow" style={{marginBottom: 4}}>Brandolph · L1</div>
            <h1 style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize: 30, lineHeight: 1.25, letterSpacing:"-0.01em", margin: 0, color:"var(--c-ink)"}}>
              Good morning, Marina. The pricing relaunch is two cards short of ready, and the summer campaign is sitting in your head — not on a brief. <em style={{fontStyle:"normal", background:"var(--yellow-200)", padding:"0 4px"}}>Where do you want to spend the next 20 minutes?</em>
            </h1>
          </div>
        </div>
      </Reveal>

      <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap: 18, marginBottom: 32}}>
        <Reveal delay={50}>
          <a href="#/board/b-pricing-relaunch" className="card" style={{padding: 22, display:"flex", flexDirection:"column", height:"100%", cursor:"pointer", textDecoration:"none"}}>
            <div className="eyebrow eyebrow--yellow" style={{marginBottom: 8}}>Finish what's running</div>
            <h3 style={{fontSize: 18, letterSpacing:"-0.01em", margin: 0, marginBottom: 8}}>Pricing relaunch</h3>
            <p style={{fontSize: 13, color:"var(--c-dim)", lineHeight: 1.5, margin: 0, flex: 1}}>
              Conversion copy + subjects look strong. Email 2 reads dutiful. <em className="b-voice" style={{background:"none", fontStyle:"italic"}}>I'd send it back for one pass.</em>
            </p>
            <div style={{marginTop: 14, display:"flex", justifyContent:"space-between", alignItems:"center"}}>
              <StatusPill status="in-production" />
              <span className="credit credit--pending">37 cr spent</span>
            </div>
          </a>
        </Reveal>
        <Reveal delay={150}>
          <div className="card" style={{padding: 22, display:"flex", flexDirection:"column", height:"100%"}}>
            <div className="eyebrow eyebrow--purple" style={{marginBottom: 8}}>Sharpen a new brief</div>
            <h3 style={{fontSize: 18, letterSpacing:"-0.01em", margin: 0, marginBottom: 8}}>Summer campaign</h3>
            <p style={{fontSize: 13, color:"var(--c-dim)", lineHeight: 1.5, margin: 0, flex: 1}}>
              You said "make Tuesday matter in June". <em className="b-voice" style={{background:"none", fontStyle:"italic"}}>That's not a brief yet — it's a feeling.</em> I have two questions that turn it into one.
            </p>
            <div style={{marginTop: 14, display:"flex", gap: 8}}>
              <button className="btn btn--primary btn--sm">Sharpen with me</button>
              <button className="btn btn--ghost btn--sm">Skip — just brief it</button>
            </div>
          </div>
        </Reveal>
        <Reveal delay={250}>
          <div className="card" style={{padding: 22, display:"flex", flexDirection:"column", height:"100%", borderLeft: "3px solid var(--mint-500)"}}>
            <div className="eyebrow" style={{color:"#1d6b4b", marginBottom: 8}}>Hand to the human team</div>
            <h3 style={{fontSize: 18, letterSpacing:"-0.01em", margin: 0, marginBottom: 8}}>Honduras essay needs finishing</h3>
            <p style={{fontSize: 13, color:"var(--c-dim)", lineHeight: 1.5, margin: 0, flex: 1}}>
              Opus wrote 1,840 words. <em className="b-voice" style={{background:"none", fontStyle:"italic"}}>The opening is exactly right. The middle drifts.</em> Lia could finish this in 2h. 120 cr.
            </p>
            <a href="#/craft" className="btn btn--dark btn--sm" style={{marginTop: 14, alignSelf:"flex-start"}}>Hand off →</a>
          </div>
        </Reveal>
      </div>

      <Reveal>
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap: 18, marginBottom: 28}}>
          <div className="card" style={{padding: 22}}>
            <div className="eyebrow" style={{marginBottom: 12}}>Currently assembled · Pricing relaunch</div>
            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap: 8}}>
              {assembly.agents.slice(0,6).map(a => {
                const accent = window.CI_DEPT_COLORS[a.dept] || "var(--neutral-300)";
                return (
                  <div key={a.id} style={{display:"flex", alignItems:"center", gap:8, padding:"6px 8px", border:"1px solid var(--c-line)", borderRadius: 8, borderLeft:`3px solid ${accent}`}}>
                    <span style={{fontFamily:"var(--font-mono)", fontSize:9, color:"var(--c-faint)"}}>{a.code}</span>
                    <span style={{fontSize: 12, fontWeight: 500, flex:1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{a.name}</span>
                  </div>
                );
              })}
            </div>
            <div style={{marginTop: 12, display:"flex", justifyContent:"space-between", alignItems:"center"}}>
              <span style={{fontSize:12, color:"var(--c-dim)"}}>{assembly.agents.length} specialists · from {[...new Set(assembly.agents.map(a => a.dept))].length} departments</span>
              <span className="credit">{assembly.totalCr} cr</span>
            </div>
          </div>
          <NotDoing items={[
            "Not running a 'limited-time' urgency play. We've committed to the slow Tuesday register.",
            "Not bundling annual with the brewing kit. That's a different conversation, with a different SMP.",
            "Not opening a paid social push. Klaviyo + IG organic only.",
          ]} />
        </div>
      </Reveal>

      <Reveal>
        <Composer value="" onChange={() => {}} onSend={() => {}} placeholder="Or — tell Brandolph what you're working on." />
      </Reveal>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* Variant C — DESK (operator dashboard, Brandolph speaks atop)     */
function HomeDesk({ tweaks }) {
  const assembly = useBMemo(() => getAssembly(tweaks.assemblyDensity || 7), [tweaks.assemblyDensity]);
  return (
    <div style={{padding:"28px 36px", display:"flex", flexDirection:"column", gap: 22}}>
      <Reveal>
        <div style={{
          background:"var(--c-card)", border:"1px solid var(--c-line)", borderRadius: 14, padding: "22px 26px",
          display:"grid", gridTemplateColumns: "auto 1fr auto", gap: 20, alignItems:"flex-start",
        }}>
          <BrandolphAvatar size={48} />
          <div>
            <div className="eyebrow eyebrow--yellow" style={{marginBottom: 6}}>Brandolph · this morning</div>
            <p style={{fontSize:17, lineHeight:1.5, margin: 0, color:"var(--c-ink)"}}>
              <em className="b-voice" style={{background:"none", fontStyle:"italic"}}>You shipped two things last week.</em> The annual page is converting at 6.2% — better than baseline, not yet what we agreed. The Honduras essay is in human craft. <strong>Today the work is the summer campaign brief.</strong> I have two questions before we assemble.
            </p>
          </div>
          <div style={{display:"flex", flexDirection:"column", gap: 8}}>
            <button className="btn btn--primary btn--sm">Continue · 2 questions</button>
            <button className="btn btn--ghost btn--sm">Read me the BIO</button>
          </div>
        </div>
      </Reveal>

      {/* Operator strips */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap: 18}}>
        <Reveal delay={60}>
          <div className="card" style={{padding: 18}}>
            <div className="eyebrow" style={{marginBottom: 10}}>What's running</div>
            <div style={{display:"flex", flexDirection:"column", gap: 8}}>
              {window.CI_BRIEFS.filter(b => b.status === "in-production").map(b => (
                <a href={"#/board/" + b.id} key={b.id} style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 10px", borderRadius: 8, border:"1px solid var(--c-line)", textDecoration:"none", color:"inherit"}}>
                  <span style={{fontSize:13, fontWeight: 500}}>{b.title}</span>
                  <span style={{fontFamily:"var(--font-mono)", fontSize: 10, color:"var(--yellow-700)"}}>● live</span>
                </a>
              ))}
              <a href="#/board/b-honduras-microlot" style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 10px", borderRadius: 8, border:"1px solid var(--c-line)", textDecoration:"none", color:"inherit"}}>
                <span style={{fontSize:13, fontWeight: 500}}>Honduras single-origin</span>
                <span style={{fontFamily:"var(--font-mono)", fontSize: 10, color:"#1d6b4b"}}>● in craft</span>
              </a>
            </div>
          </div>
        </Reveal>
        <Reveal delay={120}>
          <div className="card" style={{padding: 18}}>
            <div className="eyebrow" style={{marginBottom: 10}}>Needs you</div>
            <div style={{display:"flex", flexDirection:"column", gap: 10}}>
              <div style={{padding: 10, borderRadius: 8, borderLeft:"3px solid var(--yellow-500)", background:"var(--yellow-50)"}}>
                <div style={{fontSize:13, color:"var(--c-ink)", marginBottom: 4}}>Approve summer territories</div>
                <div style={{fontSize:12, color:"var(--c-dim)"}}>3 directions ready. Brandolph recommends "Slow June".</div>
              </div>
              <div style={{padding: 10, borderRadius: 8, borderLeft:"3px solid var(--purple-500)", background:"var(--purple-50)"}}>
                <div style={{fontSize:13, color:"var(--c-ink)", marginBottom: 4}}>Decide: annual 10× or 11.4×</div>
                <div style={{fontSize:12, color:"var(--c-dim)"}}>Affects 5 outputs in flight.</div>
              </div>
            </div>
          </div>
        </Reveal>
        <Reveal delay={180}>
          <div className="card" style={{padding: 18}}>
            <div className="eyebrow" style={{marginBottom: 10}}>Brandolph recommends</div>
            <div style={{display:"flex", flexDirection:"column", gap: 10}}>
              <div style={{padding: 10, borderRadius: 8, border:"1px dashed var(--c-line-2)"}}>
                <div style={{fontSize:13, color:"var(--c-ink)"}}>Run a producer-named microlot in Aug.</div>
                <div style={{fontSize:11.5, color:"var(--c-faint)", marginTop: 4}}><em>Because Honduras worked — repeat the pattern with a different country.</em></div>
              </div>
              <div style={{padding: 10, borderRadius: 8, border:"1px dashed var(--c-line-2)"}}>
                <div style={{fontSize:13, color:"var(--c-ink)"}}>Kill the brewing-kit page.</div>
                <div style={{fontSize:11.5, color:"var(--c-faint)", marginTop: 4}}><em>Because it dilutes the subscription story and converts at 0.4%.</em></div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>

      <Reveal>
        <div style={{display:"grid", gridTemplateColumns:"minmax(0,2fr) minmax(0,1fr)", gap: 18}}>
          <div className="card" style={{padding: 0, overflow:"hidden"}}>
            <div style={{padding:"16px 20px", borderBottom:"1px solid var(--c-line)", display:"flex", justifyContent:"space-between", alignItems:"center"}}>
              <div>
                <div className="eyebrow" style={{marginBottom: 4}}>Assembly · Pricing relaunch</div>
                <div style={{fontSize: 14, color:"var(--c-dim)"}}>{assembly.agents.length} specialists · from {[...new Set(assembly.agents.map(a => a.dept))].length} departments</div>
              </div>
              <span className="credit credit--pending">{assembly.totalCr} cr</span>
            </div>
            <div style={{padding: 12, display:"grid", gridTemplateColumns:"1fr 1fr", gap: 8}}>
              {assembly.agents.map(a => {
                const accent = window.CI_DEPT_COLORS[a.dept] || "var(--neutral-300)";
                return (
                  <div key={a.id} style={{display:"flex", alignItems:"center", gap:10, padding:"10px 12px", border:"1px solid var(--c-line)", borderRadius: 8, borderLeft:`3px solid ${accent}`, background:"var(--c-card)"}}>
                    <span style={{fontFamily:"var(--font-mono)", fontSize:9, color:"var(--c-faint)"}}>{a.code}</span>
                    <div style={{flex:1, minWidth: 0}}>
                      <div style={{fontSize: 12.5, fontWeight: 500, color:"var(--c-ink)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{a.name}</div>
                      <div style={{fontFamily:"var(--font-mono)", fontSize: 9.5, color:"var(--c-faint)", letterSpacing:"0.06em", textTransform:"uppercase"}}>{a.dept}</div>
                    </div>
                    <span className="credit" style={{fontSize:10}}>{a.cr}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <BioChip bioScore={tweaks.bioScore || 91} />
        </div>
      </Reveal>

      <Reveal>
        <Composer value="" onChange={() => {}} onSend={() => {}} placeholder="Brief Brandolph on the next thing…" />
      </Reveal>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* Variant D — CREATE (the launchpad — default home)                */
/* Workspace switcher — multi-brand is a Suite-plan feature. */
function WorkspaceBar() {
  const [open, setOpen] = useBState(false);
  const [active, setActive] = useBState("vinilo");
  const ws = window.CI_WORKSPACES || [];
  const cur = ws.find(w => w.id === active) || ws[0];
  if (!cur) return null;
  return (
    <div style={{maxWidth:1080, margin:"0 auto 16px", display:"flex", justifyContent:"space-between", alignItems:"center"}}>
      <div style={{position:"relative"}}>
        <button onClick={() => setOpen(o => !o)} className="card" style={{display:"flex", alignItems:"center", gap:10, padding:"7px 12px", cursor:"pointer", border:"1px solid var(--c-line)"}}>
          <span style={{width:30, height:30, borderRadius:8, background:"var(--neutral-900)", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"var(--font-mono)", fontWeight:600, fontSize:13}}>{cur.initial}</span>
          <div style={{textAlign:"left", lineHeight:1.2}}>
            <div style={{fontSize:13.5, fontWeight:600, color:"var(--c-ink)"}}>{cur.name}</div>
            <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--c-faint)"}}>BIO {cur.bio}% · {cur.plan}</div>
          </div>
          <Icon name="chev" size={14} />
        </button>
        {open && (
          <>
            <div onClick={() => setOpen(false)} style={{position:"fixed", inset:0, zIndex:40}} />
            <div style={{position:"absolute", top:"calc(100% + 6px)", left:0, zIndex:41, width:288, background:"var(--c-card)", border:"1px solid var(--c-line)", borderRadius:12, boxShadow:"var(--shadow-lg)", padding:6}}>
              <div className="eyebrow" style={{padding:"6px 10px"}}>Switch workspace</div>
              {ws.map(w => (
                <button key={w.id} onClick={() => { setActive(w.id); setOpen(false); }}
                  style={{display:"flex", alignItems:"center", gap:10, width:"100%", textAlign:"left", border:"none", background:"transparent", padding:"8px 10px", borderRadius:8, cursor:"pointer"}}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--neutral-50)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <span style={{width:26, height:26, borderRadius:7, background: w.id === active ? "var(--neutral-900)" : "var(--neutral-50)", color: w.id === active ? "#fff" : "var(--c-dim)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"var(--font-mono)", fontWeight:600, fontSize:12}}>{w.initial}</span>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontSize:13, fontWeight:500, color:"var(--c-ink)"}}>{w.name}</div>
                    <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--c-faint)"}}>BIO {w.bio}% · {w.campaigns} campaigns</div>
                  </div>
                  {w.id === active && <Icon name="check" size={14} />}
                </button>
              ))}
              <div style={{height:1, background:"var(--c-line)", margin:"6px 8px"}} />
              <button style={{display:"flex", alignItems:"center", gap:8, width:"100%", textAlign:"left", border:"none", background:"transparent", padding:"8px 10px", borderRadius:8, cursor:"pointer", color:"var(--c-ink)", fontSize:13}}
                onMouseEnter={e => e.currentTarget.style.background = "var(--neutral-50)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <Icon name="plus" size={14} /> New workspace
                <span style={{fontFamily:"var(--font-mono)", fontSize:9, color:"var(--c-faint)", marginLeft:"auto", letterSpacing:"0.1em"}}>SUITE PLAN</span>
              </button>
            </div>
          </>
        )}
      </div>
      <div style={{display:"flex", alignItems:"center", gap:7, fontFamily:"var(--font-mono)", fontSize:10.5, color:"var(--c-faint)", letterSpacing:"0.12em", textTransform:"uppercase"}}>
        <BrandolphDot /> Brandolph is reading {cur.name}
      </div>
    </div>
  );
}

/* Mini analytics — credits · campaigns + success · library peek + in-flight. */
function HomeDashboard({ go }) {
  const { t } = useLocale();
  const briefs = window.CI_BRIEFS;
  const credits = window.CI_CREDITS;
  const shipped = briefs.filter(b => ["shipped","delivered","approved"].includes(b.status)).length;
  const successRate = Math.round((shipped / briefs.length) * 100);
  const inFlight = briefs.filter(b => b.status === "in-production" || b.status === "approved");
  const recent = window.CI_OUTPUTS.filter(o => o.kind !== "upload").slice(0, 4);
  const big = (color) => ({ fontFamily:"Georgia, serif", fontStyle:"italic", fontSize:36, fontWeight:500, lineHeight:1, color: color || "var(--c-ink)" });
  const cardStyle = { padding:18, display:"flex", flexDirection:"column", gap:10, height:"100%", boxSizing:"border-box" };

  return (
    <div style={{maxWidth:1080, margin:"0 auto"}}>
      <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:14, marginBottom:18, alignItems:"stretch"}}>
        <Reveal>
          <div className="card" style={cardStyle}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}><span className="eyebrow">{t("brandolph.creditsThisCycle")}</span><button className="btn btn--link" style={{fontSize:11.5}} onClick={() => go("credits")}>{t("brandolph.ledger")} →</button></div>
            <div style={{display:"flex", alignItems:"baseline", gap:8}}><span style={big()}>{credits.balance}</span><span style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--c-faint)"}}>{t("brandolph.creditsMeter", { monthly: credits.monthly, days: credits.resetsInDays })}</span></div>
            <div style={{height:6, background:"var(--neutral-50)", borderRadius:999, overflow:"hidden", display:"flex"}}>
              {credits.split.filter(s => s.credits > 0).map((s, i) => <div key={i} style={{flex: s.pct || 1, background: s.color}} />)}
            </div>
          </div>
        </Reveal>
        <Reveal delay={80}>
          <div className="card" style={cardStyle}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}><span className="eyebrow">{t("brandolph.campaigns")}</span><button className="btn btn--link" style={{fontSize:11.5}} onClick={() => go("briefs")}>{t("brandolph.allBriefs")} →</button></div>
            <div style={{display:"flex", alignItems:"baseline", gap:20}}>
              <div><div style={big()}>{briefs.length}</div><div className="eyebrow" style={{marginTop:5}}>{t("brandolph.created")}</div></div>
              <div><div style={big("var(--green-600)")}>{successRate}%</div><div className="eyebrow" style={{marginTop:5}}>{t("brandolph.successRate")}</div></div>
            </div>
            <div style={{fontSize:12, color:"var(--c-faint)"}}>{t("brandolph.inFlightShipped", { inFlight: inFlight.length, shipped })}</div>
          </div>
        </Reveal>
        <Reveal delay={160}>
          <div className="card" style={cardStyle}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}><span className="eyebrow">{t("brandolph.library")}</span><button className="btn btn--link" style={{fontSize:11.5}} onClick={() => go("library")}>{t("brandolph.open")} →</button></div>
            <div style={{display:"flex", flexDirection:"column", gap:7, marginTop:2}}>
              {recent.map(o => (
                <div key={o.id} style={{display:"flex", alignItems:"center", gap:8, fontSize:12.5}}>
                  <span style={{width:6, height:6, borderRadius:"50%", background:"var(--yellow-500)", flexShrink:0}} />
                  <span style={{flex:1, minWidth:0, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", color:"var(--c-ink)"}}>{o.type}</span>
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
            {inFlight.map(b => (
              <a key={b.id} href={"#/board/" + b.id} className="card" style={{padding:16, textDecoration:"none", color:"inherit", cursor:"pointer", display:"flex", flexDirection:"column", gap:7}}>
                <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10}}><span className="eyebrow">{b.type}</span><StatusPill status={b.status} /></div>
                <div style={{fontSize:14.5, fontWeight:500, color:"var(--c-ink)", letterSpacing:"-0.005em"}}>{b.title}</div>
                <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", paddingTop:7, borderTop:"1px dashed var(--c-line-2)"}}>
                  <div style={{display:"flex", gap:3}}>
                    {b.agents.slice(0, 5).map(aid => { const a = window.CI_AGENTS.find(x => x.id === aid); return <span key={aid} title={a?.name} style={{width:9, height:9, borderRadius:"50%", background: window.CI_DEPT_COLORS[a?.dept] || "var(--neutral-400)", outline:"1px solid var(--c-line)"}} />; })}
                  </div>
                  <span style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--c-faint)"}}>{b.credits} cr · {b.createdAt}</span>
                </div>
              </a>
            ))}
          </div>
        </Reveal>
      )}
    </div>
  );
}

function HomeCreate({ tweaks, go }) {
  const { t } = useLocale();
  const [scope, setScope] = useBState("all");
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

  const flowsInFlight = window.CI_BRIEFS.filter(b => b.status === "in-production" || b.status === "approved");

  const handleStart = async () => {
    if (!input.trim()) return;
    /* Real a02 The Sharpener pass — reads the BIO + brief, returns 2–3
       brand-aware questions + a proposed crew. If sharpening fails
       (network, parse, etc.), skip straight to proposing with the raw
       brief so the user is never blocked. */
    setPhase("sharpening");
    setSharp({ loading: true, data: null, error: null });
    setAnswers({});
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
      title:         sharp.data?.title || "",
      sharpenedBrief: sharp.data?.sharpenedBrief || "",
      tension:       sharp.data?.tension || "",
      questions:     sharp.data?.questions || [],
      answers,
      refusals:      sharp.data?.refusals || [],
      specialistIds: realAssembly.agents.map((a) => a.id),
      deliveryPlan:  sharp.data?.deliveryPlan || null,
      totalCr:       realAssembly.totalCr,
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
                const word = t("brandolph.heroWord");
                const parts = t("brandolph.hero", { word }).split(word);
                return (<>{parts[0]}<em style={{background:"var(--yellow-300)", padding:"0 6px", fontStyle:"italic"}}>{word}</em>{parts.slice(1).join(word)}</>);
              })()}
            </h1>
            <p style={{
              fontSize: 16, color:"var(--c-dim)", lineHeight: 1.55,
              margin: "16px auto 0", maxWidth: 520,
            }}>
              {t("brandolph.subcopy")}
            </p>

            {/* Brand scope pills */}
            <div style={{display:"flex", alignItems:"center", justifyContent:"center", gap: 8, marginTop: 28, flexWrap:"wrap"}}>
              <span className="eyebrow" style={{marginRight: 4}}>{t("brandolph.scope")}</span>
              {[
                {k:"all",          l:"All Vinilo"},
                {k:"subscription", l:"Subscription"},
                {k:"cafe",         l:"Café"},
                {k:"wholesale",    l:"Wholesale"},
              ].map(s => (
                <button key={s.k} onClick={() => setScope(s.k)}
                  className={"pill" + (scope === s.k ? " pill--dark" : "")}
                  style={{cursor:"pointer", height: 30, padding:"0 14px", fontSize: 11}}>
                  {s.l}
                </button>
              ))}
            </div>

            {/* Composer */}
            <div style={{
              marginTop: 24, background:"var(--c-card)",
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
                value={input}
                onChange={(e) => { setInput(e.target.value); if (phase !== "idle") setPhase("idle"); }}
                onKeyDown={handleKeyDown}
                placeholder={t("brandolph.promptPlaceholder")}
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

            <div style={{marginTop: 16, fontFamily:"var(--font-mono)", fontSize: 10.5, color:"var(--c-faint)", letterSpacing:"0.06em"}}>
              <BrandolphDot /> &nbsp;{t("brandolph.assemblyNote", { score: 91 })}
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
                          ← {phase === "done" ? t("brandolph.newBrief") : t("brandolph.reBrief")}
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
                        {t("brandolph.remainingAfter", { n: window.CI_CREDITS.balance - (phase === "done" ? realAssembly.totalCr : 0) })}
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
                              {t("brandolph.composedBy")} <span style={{color:"var(--c-ink)"}}>{done.spec?.name || a.name}</span> ·
                              BIO v{done.brand?.bioVersion}
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
      {!isActive && <HomeDashboard go={go} />}
    </div>
  );
}

/* Dispatcher — chooses which home variant to render */
function BrandolphHome({ tweaks, setTweak, go }) {
  const v = tweaks.homeVariant || "create";
  if (v === "create")  return <HomeCreate  tweaks={tweaks} go={go} />;
  if (v === "cards")   return <HomeCards   tweaks={tweaks} />;
  if (v === "desk")    return <HomeDesk    tweaks={tweaks} />;
  return <HomeConsole tweaks={tweaks} />;
}

Object.assign(window, { BrandolphHome });
