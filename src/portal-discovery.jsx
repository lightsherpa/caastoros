import React from "react";
const { BrandolphAvatar, BrandolphDot, Confidence, Counter, Icon, Reveal } = window;
/* Discovery (3-step intake) + BIO viewer. */

const { useState: useDState, useEffect: useDEffect } = React;

/* ════════════════════════════════════════════════════════════════ */
/* DISCOVERY — 3-step Mavity-style intake                            */

function DiscoveryStepper({ step }) {
  const steps = [
    { n:"01", label:"Connect" },
    { n:"02", label:"Extract" },
    { n:"03", label:"Confirm" },
  ];
  return (
    <div style={{display:"flex", alignItems:"center", gap: 12}}>
      {steps.map((s, i) => {
        const isActive = i + 1 === step;
        const isDone = i + 1 < step;
        return (
          <React.Fragment key={s.n}>
            <div style={{display:"flex", alignItems:"center", gap: 10}}>
              <span style={{
                width: 26, height: 26, borderRadius:"50%",
                background: isActive ? "var(--yellow-500)" : isDone ? "var(--green-500)" : "transparent",
                color: isActive ? "var(--c-ink)" : isDone ? "#fff" : "var(--c-faint)",
                border: isActive || isDone ? "none" : "1.5px solid var(--c-line-2)",
                display:"inline-flex", alignItems:"center", justifyContent:"center",
                fontFamily:"var(--font-mono)", fontSize:11, fontWeight:600,
              }}>
                {isDone ? <Icon name="check" size={12} /> : s.n}
              </span>
              <span style={{
                fontSize: 13, fontWeight: isActive ? 500 : 400,
                color: isActive ? "var(--c-ink)" : isDone ? "var(--c-dim)" : "var(--c-faint)",
              }}>{s.label}</span>
            </div>
            {i < 2 && <span style={{height: 1, flex: "0 0 60px", background: isDone ? "var(--green-300)" : "var(--c-line-2)"}} />}
          </React.Fragment>
        );
      })}
      <a href="#/home" className="btn btn--link" style={{marginLeft:"auto", fontSize:12}}>Skip onboarding →</a>
    </div>
  );
}

function DiscoveryStep1({ onNext }) {
  return (
    <div style={{maxWidth: 580, margin:"40px auto 0"}}>
      <Reveal>
        <h1 style={{
          fontFamily:"Georgia, serif", fontStyle:"italic",
          fontSize: 38, letterSpacing:"-0.01em", lineHeight: 1.15,
          margin:0, marginBottom: 14, color:"var(--c-ink)",
        }}>
          <em style={{background:"var(--yellow-200)", padding:"0 4px", fontStyle:"normal", fontWeight:500}}>Point us at your brand.</em>
          {" "}Brandolph will read the rest.
        </h1>
        <p style={{fontSize: 16, color:"var(--c-dim)", lineHeight: 1.55, marginBottom: 30}}>
          A URL is enough. If you have guidelines, hand them over. If you don't — we'll work from what's already public, and tell you what we couldn't find.
        </p>
      </Reveal>

      <Reveal delay={150}>
        <div className="card" style={{padding: 28}}>
          <div style={{display:"flex", flexDirection:"column", gap: 18}}>
            <div>
              <label style={{display:"block", fontSize:12, fontWeight:500, color:"var(--c-ink)", marginBottom: 8}}>
                Primary website URL <span style={{color:"var(--pink-500)"}}>·</span>
              </label>
              <input className="input" defaultValue="vinilo.coffee" placeholder="brand.com" />
            </div>
            <div>
              <label style={{display:"block", fontSize:12, fontWeight:500, color:"var(--c-ink)", marginBottom: 8}}>
                Instagram handle <span style={{color:"var(--c-faint)", fontWeight:400}}>· optional</span>
              </label>
              <input className="input" defaultValue="@vinilo.coffee" placeholder="@handle" />
            </div>
            <div>
              <label style={{display:"block", fontSize:12, fontWeight:500, color:"var(--c-ink)", marginBottom: 8}}>
                Brand guidelines · PDF, Figma, Notion <span style={{color:"var(--c-faint)", fontWeight:400}}>· optional</span>
              </label>
              <input className="input" placeholder="Paste a link, or upload a file" />
            </div>
          </div>

          <div style={{
            marginTop: 22, paddingTop: 18,
            borderTop:"1px dashed var(--c-line-2)",
            display:"flex", justifyContent:"space-between", alignItems:"center",
          }}>
            <div style={{display:"flex", gap: 14, alignItems:"center"}}>
              <span style={{fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--c-faint)"}}>⏱ ~40s · 🔒 Nothing saved until you confirm</span>
            </div>
            <button className="btn btn--primary" onClick={onNext}>
              Start extraction <Icon name="arrow" size={14} />
            </button>
          </div>
        </div>
      </Reveal>

      <div style={{display:"flex", gap: 18, justifyContent:"center", marginTop: 22}}>
        <button className="btn btn--link" style={{fontSize: 12}}>Upload guidelines instead</button>
        <span style={{color:"var(--c-line-2)"}}>·</span>
        <button className="btn btn--link" style={{fontSize: 12}}>Start from scratch</button>
        <span style={{color:"var(--c-line-2)"}}>·</span>
        <button className="btn btn--link" style={{fontSize: 12}}>Clone a space (Tier 03)</button>
      </div>
    </div>
  );
}

function DiscoveryStep2Running({ onDone }) {
  const lines = [
    { state:"ok", text:"Reading site structure · 47 pages" },
    { state:"ok", text:"Visual identity captured · 5 colors, 2 typefaces" },
    { state:"ok", text:"Audience signals from copy + IG" },
    { state:"ok", text:"Competitor table mapped · 9 in-category" },
    { state:"running", text:"Analysing voice patterns…" },
    { state:"queued", text:"Cross-referencing IG captions" },
    { state:"queued", text:"BIO compile (Opus 4.1)" },
  ];
  useDEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div style={{maxWidth: 760, margin:"40px auto 0"}}>
      <div style={{display:"flex", alignItems:"center", gap: 12, marginBottom: 18}}>
        <BrandolphDot state="thinking" size={12} />
        <h2 style={{margin: 0, fontSize: 20}}>Brandolph is reading <em style={{fontStyle:"italic", color:"var(--yellow-700)"}}>vinilo.coffee</em></h2>
      </div>
      <div className="card" style={{padding: 0, overflow:"hidden"}}>
        <div style={{padding:"16px 20px", borderBottom:"1px solid var(--c-line)", background:"var(--c-bg)"}}>
          <div style={{display:"flex", justifyContent:"space-between", fontFamily:"var(--font-mono)", fontSize:11, color:"var(--c-dim)", letterSpacing:"0.06em"}}>
            <span>EXTRACTION · <span style={{color:"var(--yellow-700)"}}>72%</span></span>
            <span>22.4s elapsed · 67 signals · 0 flags</span>
          </div>
          <div style={{height: 4, background:"var(--neutral-50)", borderRadius:999, marginTop: 10, overflow:"hidden"}}>
            <div style={{height:"100%", width:"72%", background:"var(--yellow-500)", borderRadius:999, transition:"width 800ms ease"}} />
          </div>
        </div>
        <div style={{padding: "18px 22px", borderLeft: "3px solid var(--yellow-500)", display:"flex", flexDirection:"column", gap: 10}} className="stream">
          {lines.map((l, i) => (
            <div key={i} style={{display:"flex", alignItems:"center", gap: 10, fontFamily:"var(--font-mono)", fontSize: 13, color:"var(--c-ink)"}}>
              <span style={{color:"var(--c-faint)"}}>›</span>
              <span className={"dot-state dot-state--" + l.state} />
              <span style={{color: l.state === "queued" ? "var(--c-faint)" : "var(--c-ink)"}}>{l.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DiscoveryStep2Results({ onConfirm }) {
  const d = window.CI_DISCOVERY;
  const [tab, setTab] = useDState("identity");
  return (
    <div style={{maxWidth: 1080, margin:"24px auto 0"}}>
      <Reveal>
        <div style={{
          background:"var(--c-card)", border:"1px solid var(--c-line)", borderRadius: 14,
          padding: "22px 26px",
          display:"grid", gridTemplateColumns:"1fr auto", gap: 20, alignItems:"center", marginBottom: 18,
        }}>
          <div>
            <div style={{display:"flex", alignItems:"center", gap:12, marginBottom: 6}}>
              <span style={{width:36, height: 36, borderRadius: 8, background:"var(--neutral-900)", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"var(--font-mono)", fontWeight:600, fontSize: 18}}>V</span>
              <h2 style={{margin:0, fontSize: 22, letterSpacing:"-0.01em"}}>{d.brand}</h2>
            </div>
            <p style={{margin: 0, color:"var(--c-dim)", fontSize: 14}}>Specialty coffee for slow Tuesdays. · <a href={"https://" + d.url} style={{color:"var(--purple-500)"}}>{d.url}</a></p>
            <div style={{marginTop: 12, display:"flex", gap: 14, alignItems:"center", fontFamily:"var(--font-mono)", fontSize:11, color:"var(--c-dim)", letterSpacing:"0.06em"}}>
              <span><span className="dot-state dot-state--ok" /> EXTRACTION COMPLETE</span>
              <span>· {d.duration}</span>
              <span>· {d.signals} signals</span>
              <span style={{color:"var(--orange-600)"}}>· {d.flags} flag</span>
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div className="eyebrow eyebrow--yellow" style={{marginBottom: 4}}>Overall confidence</div>
            <div style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize: 56, lineHeight: 1, color:"var(--green-600)", fontWeight: 500}}>
              <Counter to={d.confidence} format={n => Math.round(n)} />
            </div>
            <div style={{fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--c-faint)", marginTop: 2}}>OF 100</div>
          </div>
        </div>
      </Reveal>

      {/* Flag banner */}
      <Reveal>
        <div style={{
          marginBottom: 14,
          background:"var(--yellow-50)", border:"1px solid var(--yellow-200)", borderRadius: 10,
          padding:"12px 16px",
          display:"flex", justifyContent:"space-between", alignItems:"center", gap: 14,
        }}>
          <div style={{display:"flex", alignItems:"center", gap: 10}}>
            <Icon name="flag" size={14} />
            <span style={{fontSize: 13, color:"var(--c-ink)"}}>
              <strong style={{fontWeight: 600}}>1 flag to resolve.</strong> Display typeface (Söhne Breit) requires a paid license. Suggested substitute: Söhne.
            </span>
          </div>
          <div style={{display:"flex", gap: 8}}>
            <button className="btn btn--ghost btn--sm">Upload license</button>
            <button className="btn btn--primary btn--sm">Accept substitute</button>
          </div>
        </div>
      </Reveal>

      <Reveal>
        <div className="card" style={{padding: 0, overflow:"hidden"}}>
          <div className="tabs">
            {[
              ["identity","Identity", 4],
              ["palette","Palette", 5],
              ["type","Typography", 2],
              ["voice","Voice", 4],
              ["imagery","Imagery", 4],
              ["audience","Audience", 3],
            ].map(([k, l, count]) => (
              <button key={k} className={"tab" + (tab === k ? " tab--active" : "")} onClick={() => setTab(k)}>
                {l} <span className="tab__count">{count}</span>
              </button>
            ))}
          </div>
          <div style={{padding: 24}}>
            {tab === "identity" && (
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap: 28}}>
                <div>
                  <div className="eyebrow" style={{marginBottom: 12}}>Facts captured</div>
                  <table style={{width:"100%", borderCollapse:"collapse", fontSize: 14}}>
                    <tbody>
                      {d.identity.map((r, i) => (
                        <tr key={i} style={{borderBottom: i < d.identity.length - 1 ? "1px solid var(--c-line)" : "none"}}>
                          <td style={{padding:"10px 0", color:"var(--c-faint)", width: 140, fontSize: 12}}>{r.key}</td>
                          <td style={{padding:"10px 0", color:"var(--c-ink)"}}>{r.val}</td>
                          <td style={{padding:"10px 0", textAlign:"right"}}><Confidence value={r.conf} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <div className="eyebrow" style={{marginBottom: 12}}>Logo lockups captured · 3</div>
                  <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap: 10}}>
                    {["#1F1A14", "#F4ECDD", "#C97B3F"].map((bg, i) => (
                      <div key={i} style={{
                        aspectRatio: "1.3 / 1", background: bg,
                        borderRadius: 10, display:"flex", alignItems:"center", justifyContent:"center",
                        color: bg === "#F4ECDD" ? "#1F1A14" : "#F4ECDD",
                        fontFamily:"Georgia, serif", fontStyle:"italic", fontSize: 24, letterSpacing:"-0.02em",
                        border:"1px solid var(--c-line)",
                      }}>vinilo</div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {tab === "palette" && (
              <div>
                <div style={{display:"grid", gridTemplateColumns:"repeat(5, 1fr)", gap: 14}}>
                  {d.palette.map((c, i) => (
                    <div key={i} className="card" style={{padding: 0, overflow:"hidden"}}>
                      <div style={{aspectRatio:"1.4/1", background: c.hex}}></div>
                      <div style={{padding:"10px 12px"}}>
                        <div style={{fontSize: 13, fontWeight: 500, color:"var(--c-ink)"}}>{c.name}</div>
                        <div style={{fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--c-faint)", marginTop: 2}}>{c.hex}</div>
                        <div style={{marginTop: 10, display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                          <Confidence value={c.conf} />
                          <span style={{fontFamily:"var(--font-mono)", fontSize:10, color: c.wcag === "—" ? "var(--c-faint)" : "var(--green-600)", letterSpacing:"0.06em"}}>WCAG {c.wcag}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{marginTop: 18}}>
                  <div className="eyebrow" style={{marginBottom: 8}}>Distribution across 47 scraped pages</div>
                  <div style={{display:"flex", height: 18, borderRadius: 4, overflow:"hidden", border:"1px solid var(--c-line)"}}>
                    {d.palette.map((c, i) => (
                      <div key={i} style={{flex: [38, 22, 28, 8, 4][i], background: c.hex}} title={`${c.name} ${[38,22,28,8,4][i]}%`} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            {tab === "type" && (
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap: 16}}>
                {d.type.map((t, i) => (
                  <div key={i} className="card" style={{padding: 20}}>
                    <div style={{display:"flex", justifyContent:"space-between", marginBottom: 10}}>
                      <span className="eyebrow">{t.kind}</span>
                      {t.license === "paid" && <span className="pill" style={{background:"var(--orange-100)", color:"var(--orange-600)", border:"1px solid #FFE0B0"}}>Paid license</span>}
                    </div>
                    <div style={{
                      fontFamily: t.kind === "Display" ? "Georgia, serif" : "var(--font-sans)",
                      fontWeight: 700, fontSize: t.kind === "Display" ? 38 : 22,
                      letterSpacing: "-0.01em", marginBottom: 6, color:"var(--c-ink)",
                    }}>
                      {t.kind === "Display" ? "Slow Tuesdays." : "Cup-by-cup, named after the person who grew it."}
                    </div>
                    <div style={{fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--c-faint)", marginBottom: 14}}>
                      {t.family} · {t.size}
                    </div>
                    <div style={{paddingTop: 14, borderTop:"1px dashed var(--c-line-2)", fontSize:12, color:"var(--c-dim)"}}>
                      Substitute: <strong style={{color:"var(--c-ink)", fontWeight: 500}}>{t.suggest}</strong>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {tab === "voice" && (
              <div style={{display:"grid", gridTemplateColumns:"260px 1fr", gap: 28}}>
                <div>
                  <div className="eyebrow" style={{marginBottom: 14}}>Voice dimensions</div>
                  <div style={{display:"flex", flexDirection:"column", gap: 16}}>
                    {d.voice.map((v, i) => (
                      <div key={i}>
                        <div style={{display:"flex", justifyContent:"space-between", marginBottom: 4}}>
                          <span style={{fontSize: 13, color:"var(--c-ink)"}}>{v.dim}</span>
                          <span style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--c-faint)"}}>{Math.round(v.val * 100)}</span>
                        </div>
                        <div style={{height: 6, background:"var(--neutral-50)", borderRadius: 999, position:"relative"}}>
                          <div style={{position:"absolute", left: 0, top: 0, height:"100%", width: `${v.val * 100}%`, background: "var(--yellow-500)", borderRadius:999}} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="eyebrow" style={{marginBottom: 14}}>Sampled from the site</div>
                  <div style={{display:"flex", flexDirection:"column", gap: 12}}>
                    {d.voice.map((v, i) => (
                      <div key={i} style={{
                        padding: 14, borderLeft:"3px solid var(--yellow-500)",
                        background:"var(--yellow-50)", borderRadius:"0 8px 8px 0",
                      }}>
                        <div className="eyebrow eyebrow--yellow" style={{marginBottom: 4}}>{v.dim}</div>
                        <p style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize: 15, color:"var(--c-ink)", margin: 0, lineHeight: 1.5}}>"{v.sample}"</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {tab === "imagery" && (
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap: 28}}>
                <div>
                  <div className="eyebrow" style={{marginBottom: 12}}>Style categories</div>
                  <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap: 10}}>
                    {[1,2,4,5].map((n, i) => (
                      <div key={n} style={{
                        aspectRatio:"1/1", borderRadius: 10, overflow:"hidden",
                        position:"relative", border:"1px solid var(--c-line)",
                      }}>
                        <img src={`intelligence/assets/profile-${n}.jpg`} alt="" style={{width:"100%", height:"100%", objectFit:"cover", filter:"sepia(0.05) saturate(0.9)"}} />
                        <div style={{position:"absolute", bottom:8, left:8, right:8, background:"rgba(0,0,0,0.66)", color:"#fff", padding:"4px 8px", borderRadius: 4, fontSize: 10, fontFamily:"var(--font-mono)", letterSpacing:"0.06em", textTransform:"uppercase"}}>
                          {d.imagery[i]}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="eyebrow" style={{marginBottom: 12}}>Style qualities</div>
                  <ul style={{margin:0, padding: 0, listStyle:"none", display:"flex", flexDirection:"column", gap: 8, marginBottom: 22}}>
                    {["Warm, slightly sunny color cast","Editorial framing — never staged","Hands + craft tools","Low light café interiors","Producer portraits with name"].map((q, i) => (
                      <li key={i} style={{display:"flex", gap: 8, fontSize: 13, color:"var(--c-ink)"}}>
                        <span style={{color:"var(--green-600)"}}>✓</span> {q}
                      </li>
                    ))}
                  </ul>
                  <div className="eyebrow eyebrow--pink" style={{marginBottom: 8}}>Avoid</div>
                  <ul style={{margin:0, padding: 0, listStyle:"none", display:"flex", flexDirection:"column", gap: 8}}>
                    {d.avoid.map((q, i) => (
                      <li key={i} style={{display:"flex", gap: 8, fontSize: 13, color:"var(--c-faint)", textDecoration:"line-through"}}>
                        <span style={{color:"var(--pink-500)", textDecoration:"none"}}>✕</span> {q}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {tab === "audience" && (
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap: 22}}>
                {[
                  ["Segments", d.audience.segments],
                  ["Channels", d.audience.channels],
                  ["Languages", d.audience.languages],
                ].map(([title, items], i) => (
                  <div key={i}>
                    <div className="eyebrow" style={{marginBottom: 12}}>{title}</div>
                    <div style={{display:"flex", flexDirection:"column", gap: 8}}>
                      {items.map((it, j) => (
                        <div key={j} style={{
                          padding:"10px 14px", border:"1px solid var(--c-line)",
                          borderRadius: 8, fontSize: 13, color:"var(--c-ink)",
                          display:"flex", justifyContent:"space-between", alignItems:"center",
                        }}>
                          {it} <Confidence value={[88, 75, 92][j] || 80} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Reveal>

      {/* Sticky confirm bar */}
      <div style={{
        position:"sticky", bottom: 0, marginTop: 22, marginLeft: -36, marginRight: -36,
        padding:"16px 36px",
        background:"linear-gradient(180deg, rgba(249,249,249,0), var(--c-bg) 30%)",
        display:"flex", justifyContent:"space-between", alignItems:"center", gap: 12,
      }}>
        <div style={{display:"flex", alignItems:"center", gap: 12}}>
          <Icon name="check" size={18} />
          <span style={{fontSize: 14, color:"var(--c-ink)"}}>Looks right? Confirm to activate your Brand Space.</span>
        </div>
        <div style={{display:"flex", gap: 10}}>
          <button className="btn btn--ghost">Save & review later</button>
          <button className="btn btn--primary btn--lg" onClick={onConfirm}>
            Activate brand space <Icon name="arrow" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function DiscoveryStep3({ go }) {
  return (
    <div style={{maxWidth: 580, margin:"80px auto 0", textAlign:"center"}}>
      <div style={{display:"flex", justifyContent:"center", marginBottom: 22}}>
        <BrandolphAvatar size={64} />
      </div>
      <h1 style={{fontSize: 28, letterSpacing:"-0.01em", marginBottom: 14}}>Brand Space is live.</h1>
      <div className="stream" style={{display:"flex", flexDirection:"column", gap: 12, marginBottom: 28, textAlign:"left"}}>
        <BrandolphLine html="*I've read the site, the IG, and three competitors.* You sell coffee. You also sell a decision to slow down on purpose. Most people in the category sell the first; almost none sell the second. That's your unfair advantage." />
        <BrandolphLine html="*Two things to know before we go further.* One — the BIO is editable. If I got something wrong, fix it. Two — I don't pretend to know what I don't know. I left three fields flagged amber. I'd rather ask you than guess." />
        <BrandolphLine html="*The first brief is on you.* When you have something to ship, brief me on the change you want — not the deliverable. I'll do the deliverable part." />
      </div>
      <button className="btn btn--primary btn--lg" onClick={() => go("home")}>
        Open Brandolph <Icon name="arrow" size={14} />
      </button>
    </div>
  );
}

function Discovery({ go }) {
  const [step, setStep] = useDState(1);
  const [phase, setPhase] = useDState("form"); // form | running | results
  return (
    <div style={{padding:"24px 36px 60px", maxWidth: 1180, margin:"0 auto"}}>
      <DiscoveryStepper step={step} />
      {step === 1 && <DiscoveryStep1 onNext={() => { setStep(2); setPhase("running"); }} />}
      {step === 2 && phase === "running"  && <DiscoveryStep2Running onDone={() => setPhase("results")} />}
      {step === 2 && phase === "results"  && <DiscoveryStep2Results onConfirm={() => setStep(3)} />}
      {step === 3 && <DiscoveryStep3 go={go} />}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* BIO VIEWER                                                        */

const BIO_SEED_SOURCES = [
  { src: "vinilo.coffee · homepage", date: "scraped 14 May 09:31", n: 18 },
  { src: "vinilo.coffee · about", date: "scraped 14 May 09:31", n: 12 },
  { src: "vinilo.coffee · pricing", date: "scraped 14 May 09:31", n: 7 },
  { src: "Instagram · @vinilo.coffee · 90 posts", date: "scraped 14 May 09:34", n: 22 },
  { src: "Founder intake answers", date: "14 May 09:42", n: 14 },
  { src: "Brand book v1.pdf · uploaded", date: "14 May 09:42", n: 9 },
  { src: "Competitor map · 9 in-category", date: "Brandolph 14 May 09:50", n: 12 },
];

const BIO_IDENTITY = [
  { label:"Name",        value:"Vinilo Coffee",                       conf:99, source:"intake answer" },
  { label:"Positioning", value:"Specialty coffee for slow Tuesdays.", conf:88, source:"extracted from homepage hero + about page", italic:true },
  { label:"Category",    value:"Specialty coffee · subscription + café", conf:94, source:"scrape + competitor map" },
  { label:"Founded",     value:"2021 · Barcelona",                    conf:96, source:"about page" },
  { label:"Ownership",   value:"Founder-led · 2 co-founders · 8 FTEs", conf:72, source:"intake answer + LinkedIn" },
  { label:"Pillars",     multi:true, value:["Provenance","Routine","Patience","Café-as-rest"], conf:84, source:"Brandolph synthesis from 47 scraped pages" },
];
const BIO_AUDIENCE = [
  { label:"Primary",   value:"Subscribers, 28–48, urban, recurring purchase behaviour. Value routine over discovery.", conf:86, source:"IG + Klaviyo intake" },
  { label:"Secondary", value:"Café-warm locals. Walks-in within 2.5km. Tuesday afternoon over Saturday morning.", conf:78, source:"café footfall + observation" },
  { label:"Tertiary",  value:"Wholesale buyers. Specialty hotels + co-working spaces.", conf:62, source:"intake answer" },
  { label:"JTBD",      multi:true, value:["The decision to slow down","The ritual that holds the week together","A weekly bag arriving on time"], conf:80, source:"Brandolph synthesis" },
];
const BIO_COMPETITIVE = [
  { label:"Direct",   multi:true, value:["Café Granell","Nomad Coffee","Three Marks","Caravelle"], conf:92, source:"competitor map · 9 in-category" },
  { label:"Adjacent", multi:true, value:["The Slow Café (UK)","Onyx (US)","La Marzocco Home"], conf:78, source:"competitor map" },
  { label:"The table you sit at", value:"Specialty roasters who lead with provenance + ritual. NOT the 'limited drop' microlot table.", conf:84, source:"Brandolph diagnosis" },
  { label:"Where you don't fit",  value:"High-energy 'third wave' branding. Aesthetic-led without infrastructure.", conf:80, source:"Brandolph diagnosis" },
];
const BIO_VOICE = [
  { label:"Register",        value:"Editorial, low-urgency, second person. Funny only when it's earned.", conf:88, source:"50 paragraphs sampled from site + IG" },
  { label:"Forbidden",       multi:true, value:["unlock","limited time","FOMO","drop","exclusive","kit","journey"], conf:94, source:"rules + Brandolph QA" },
  { label:"Sentence rhythm", value:"Short. Then longer, with a slight ramp. Periods over commas. No dashes-for-pace.", conf:82, source:"rhythm analysis (Opus)" },
  { label:"Signature moves", multi:true, value:["The phrase 'on purpose'","'It isn't X — it's Y'","First-person plural only in brand voice"], conf:86, source:"Brandolph synthesis" },
];
const BIO_GOALS = [
  { label:"2026 north star", value:"Be the coffee that earns the Tuesday back, for 10,000 households.", conf:70, source:"intake" },
  { label:"Q2 priority",     value:"Pricing relaunch + summer Tuesdays campaign.", conf:90, source:"founder calendar" },
  { label:"Q3 priority",     value:"Honduras + Aug microlot. Brand book v2.", conf:62, source:"intake" },
];
const BIO_STRATEGIC = {
  watchouts: [
    "The \"slow Tuesday\" line is doing a lot of work. If you outgrow it without retiring it cleanly, the brand reads contradictory.",
    "The café revenue is half the business. The site reads like it's only the subscription. There's a tension to resolve, not hide.",
    "Wholesale audience is on the BIO but invisible everywhere else. Decide if it stays.",
  ],
  gaps: [
    "No documented behaviour around producer relationships. Critical for the microlot cadence.",
    "No declared price ceiling. The annual conversation needs one.",
  ],
  notList: [
    "A discount-led subscription.",
    "A \"drop\" culture roaster.",
    "An aesthetic-led brand. The taste is the brand.",
    "A coffee-cult evangelism brand. Quiet conviction over loud taste.",
  ],
  diagnosis: "Vinilo's writing is consistently better than its visual system. The site reads with conviction; the system around it doesn't earn that conviction yet. The Q3 priority should be the book — not new campaigns. The summer campaign is fine, but a brand book is the unlock you've been compounding the cost of for two years.",
};
const BIO_GRADE = "Warm, slightly sunny. Editorial framing. Hands + craft + low-light interiors.";

function BioViewer({ go, bioScore = 91 }) {
  const [tab, setTab] = useDState("identity");
  const [score, setScore] = useDState(bioScore);
  const [sources, setSources] = useDState(BIO_SEED_SOURCES);
  const [feed, setFeed] = useDState("");
  const [reading, setReading] = useDState(false);
  const [toast, setToast] = useDState(null);
  const [editing, setEditing] = useDState(false);

  const d = window.CI_DISCOVERY;
  const [bio, setBio] = useDState(() => ({
    identity: BIO_IDENTITY, audience: BIO_AUDIENCE, competitive: BIO_COMPETITIVE,
    voice: BIO_VOICE, goals: BIO_GOALS,
    palette: d.palette, type: d.type, imagery: d.imagery, avoid: d.avoid, grade: BIO_GRADE,
    strategic: BIO_STRATEGIC,
  }));
  const patch = (key, value) => setBio(b => ({ ...b, [key]: value }));
  const patchStrategic = (key, value) => setBio(b => ({ ...b, strategic: { ...b.strategic, [key]: value } }));

  const flash = (msg) => { setToast(msg); clearTimeout(window.__bioT); window.__bioT = setTimeout(() => setToast(null), 2800); };
  const addReference = (labelArg, kind) => {
    const ref = (labelArg ?? feed).trim();
    if (!ref || reading) return;
    setReading(true); setFeed("");
    setTimeout(() => {
      const signals = 6 + Math.floor(Math.random() * 14);
      const next = Math.min(100, score + (score < 100 ? 2 : 0));
      setSources(s => [{ src: (kind === "doc" ? "" : "") + ref, date: "just now", n: signals, fresh: true }, ...s]);
      setScore(next);
      setReading(false);
      flash(`Brandolph read “${ref}” — learned ${signals} signals. BIO now ${next}%.`);
    }, 1700);
  };

  const tabs = [
    ["identity", "Identity"],
    ["audience", "Audience"],
    ["competitive", "Competitive"],
    ["voice", "Voice"],
    ["visual", "Visual"],
    ["goals", "Goals"],
    ["strategic", "Strategic"],
    ["sources", "Sources"],
  ];

  const conf = score;
  const tone = conf >= 85 ? { color:"var(--green-600)", word:"complete" } : conf >= 65 ? { color:"var(--orange-600)", word:"in progress" } : { color:"var(--pink-500)", word:"thin" };

  return (
    <div style={{padding:"24px 36px 60px"}}>
      {/* Hero */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 320px", gap: 28, marginBottom: 28, alignItems:"end"}}>
        <div>
          <div className="eyebrow" style={{marginBottom: 6}}>Brand Intelligence Object · Vinilo Coffee</div>
          <div style={{display:"flex", alignItems:"baseline", gap: 14}}>
            <span style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize: 88, lineHeight: 1, color: tone.color, fontWeight: 500}}>
              <Counter to={conf} />
            </span>
            <div>
              <div style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--c-faint)", letterSpacing:"0.06em", textTransform:"uppercase"}}>OF 100 · {tone.word}</div>
              <div style={{fontSize: 14, color:"var(--c-dim)", marginTop: 4}}>{window.CI_BRAND.bioLastUpdated}</div>
            </div>
          </div>
          <div style={{marginTop: 14, height: 6, background:"var(--neutral-50)", borderRadius:999, overflow:"hidden", maxWidth: 600}}>
            <div style={{height:"100%", width: conf + "%", background: tone.color, borderRadius:999, transition:"width 800ms ease"}} />
          </div>
        </div>
        <div style={{display:"flex", flexDirection:"column", gap: 10, alignItems:"flex-end"}}>
          <button className="btn btn--primary" onClick={() => setTab("sources")}>
            <Icon name="plus" size={14} /> Feed Brandolph
          </button>
          <button className={"btn btn--sm " + (editing ? "btn--primary" : "btn--ghost")} onClick={() => setEditing(e => !e)}>
            <Icon name={editing ? "check" : "edit"} size={14} /> {editing ? "Done editing" : "Edit BIO"}
          </button>
          <button className="btn btn--ghost btn--sm" onClick={() => go("discovery")}>
            <Icon name="refresh" size={14} /> Re-run discovery
          </button>
        </div>
      </div>

      {editing && (
        <div className="card" style={{padding:"10px 16px", marginBottom:14, borderLeft:"3px solid var(--brand, var(--yellow-500))", display:"flex", alignItems:"center", gap:10}}>
          <Icon name="edit" size={15} />
          <span style={{fontSize:13, color:"var(--c-ink)"}}>Editing the BIO — modify any value, add fields, or remove what's wrong. Changes feed back to Brandolph.</span>
        </div>
      )}

      {/* Tabs */}
      <div className="card" style={{padding: 0, overflow:"hidden"}}>
        <div className="tabs">
          {tabs.map(([k, l]) => (
            <button key={k} className={"tab" + (tab === k ? " tab--active" : "")} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
        <div style={{padding: 28}}>
          {tab === "identity"    && <BioFieldList items={bio.identity}    editing={editing} onChange={v => patch("identity", v)} />}
          {tab === "audience"    && <BioFieldList items={bio.audience}    editing={editing} onChange={v => patch("audience", v)} />}
          {tab === "competitive" && <BioFieldList items={bio.competitive} editing={editing} onChange={v => patch("competitive", v)} />}
          {tab === "voice"       && <BioFieldList items={bio.voice}       editing={editing} onChange={v => patch("voice", v)} />}
          {tab === "visual"      && <BioVisual bio={bio} patch={patch} editing={editing} />}
          {tab === "goals"       && <BioFieldList items={bio.goals}       editing={editing} onChange={v => patch("goals", v)} />}
          {tab === "strategic"   && <BioStrategic strat={bio.strategic} patchStrategic={patchStrategic} editing={editing} />}
          {tab === "sources"     && <BioSources sources={sources} setSources={setSources} feed={feed} setFeed={setFeed} reading={reading} addReference={addReference} editing={editing} go={go} />}
        </div>
      </div>

      {/* Learning toast */}
      {toast && (
        <div style={{position:"fixed", bottom:28, left:"50%", transform:"translateX(-50%)", zIndex:60, background:"var(--c-inverse)", color:"#fff", borderRadius:10, padding:"11px 18px", fontSize:13.5, boxShadow:"var(--shadow-lg)", display:"flex", alignItems:"center", gap:9, maxWidth:560, animation:"cvPopIn 200ms ease"}}>
          <BrandolphDot /> {toast}
        </div>
      )}
    </div>
  );
}

/* ---- Editing primitives ----------------------------------------- */
const EDIT_INPUT = { width:"100%", border:"1px solid var(--c-line-2)", borderRadius:7, background:"var(--c-bg)", padding:"7px 10px", fontSize:13.5, color:"var(--c-ink)", outline:"none", fontFamily:"inherit", boxSizing:"border-box" };
const CHIP_X = { border:"none", background:"transparent", cursor:"pointer", color:"var(--c-faint)", fontSize:14, lineHeight:1, padding:"0 2px" };

function EditInput({ value, onChange, placeholder, mono, area }) {
  const st = { ...EDIT_INPUT, ...(mono ? { fontFamily:"var(--font-mono)", fontSize:11.5 } : {}), ...(area ? { resize:"vertical", minHeight:60, lineHeight:1.5 } : { height:34 }) };
  return area
    ? <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2} style={st} />
    : <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={st} />;
}

function ChipEditor({ items, onChange }) {
  const set = (i, v) => onChange(items.map((x, j) => j === i ? v : x));
  return (
    <div style={{display:"flex", flexWrap:"wrap", gap:6, alignItems:"center"}}>
      {items.map((v, i) => (
        <span key={i} className="pill" style={{paddingRight:4, gap:2}}>
          <input value={v} onChange={(e) => set(i, e.target.value)} style={{border:"none", background:"transparent", outline:"none", font:"inherit", color:"inherit", width: Math.max(36, (v.length || 4) * 7) + "px"}} />
          <button onClick={() => onChange(items.filter((_, j) => j !== i))} style={CHIP_X} title="Remove">×</button>
        </span>
      ))}
      <button className="pill" onClick={() => onChange([...items, ""])} style={{borderStyle:"dashed", cursor:"pointer", color:"var(--c-dim)"}}>+ add</button>
    </div>
  );
}

function StringListEditor({ items, onChange, marker, color }) {
  const set = (i, v) => onChange(items.map((x, j) => j === i ? v : x));
  return (
    <ul style={{margin:0, padding:0, listStyle:"none", display:"flex", flexDirection:"column", gap:8}}>
      {items.map((x, i) => (
        <li key={i} style={{display:"flex", gap:8, alignItems:"flex-start"}}>
          {marker && <span style={{color, lineHeight:"34px"}}>{marker}</span>}
          <div style={{flex:1}}><EditInput value={x} onChange={(v) => set(i, v)} /></div>
          <button onClick={() => onChange(items.filter((_, j) => j !== i))} style={{...CHIP_X, lineHeight:"34px"}} title="Remove">×</button>
        </li>
      ))}
      <li><button className="btn btn--ghost btn--sm" onClick={() => onChange([...items, ""])}><Icon name="plus" size={12} /> Add item</button></li>
    </ul>
  );
}

function EditableField({ f, editing, onChange, onRemove }) {
  if (!editing) {
    return (
      <div style={{display:"grid", gridTemplateColumns: "180px 1fr 110px", gap: 18, padding:"14px 0", borderBottom:"1px solid var(--c-line)", alignItems:"start"}}>
        <div>
          <div style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--c-faint)", letterSpacing:"0.06em", textTransform:"uppercase"}}>{f.label}</div>
          {f.source && <div style={{fontSize: 11, color:"var(--c-faint)", marginTop: 4, fontStyle:"italic"}}>from {f.source}</div>}
        </div>
        <div style={{fontSize: 14, color:"var(--c-ink)", lineHeight: 1.55}}>
          {f.multi
            ? <div style={{display:"flex", flexWrap:"wrap", gap: 6}}>{(f.value || []).map((v, i) => <span key={i} className="pill">{v}</span>)}</div>
            : (f.italic ? <em style={{fontStyle:"italic"}}>{f.value}</em> : f.value)}
        </div>
        <div style={{textAlign:"right"}}><Confidence value={f.conf} /></div>
      </div>
    );
  }
  return (
    <div style={{display:"grid", gridTemplateColumns: "180px 1fr 110px", gap: 18, padding:"14px 0", borderBottom:"1px solid var(--c-line)", alignItems:"start"}}>
      <div style={{display:"flex", flexDirection:"column", gap:6}}>
        <EditInput value={f.label} onChange={(v) => onChange({ label: v })} placeholder="Label" mono />
        <EditInput value={f.source || ""} onChange={(v) => onChange({ source: v })} placeholder="Source" />
      </div>
      <div>
        {f.multi
          ? <ChipEditor items={f.value || []} onChange={(v) => onChange({ value: v })} />
          : <EditInput area value={f.value} onChange={(v) => onChange({ value: v })} placeholder="Value" />}
      </div>
      <div style={{display:"flex", flexDirection:"column", alignItems:"flex-end", gap:8}}>
        <div style={{display:"flex", alignItems:"center", gap:4}}>
          <input type="number" min={0} max={100} value={f.conf} onChange={(e) => onChange({ conf: Math.max(0, Math.min(100, +e.target.value || 0)) })} style={{...EDIT_INPUT, width:56, height:30, textAlign:"right", fontFamily:"var(--font-mono)", fontSize:12}} />
          <span style={{fontSize:11, color:"var(--c-faint)"}}>%</span>
        </div>
        <button className="btn btn--link" style={{fontSize:11, color:"var(--pink-500)"}} onClick={onRemove}>Remove field</button>
      </div>
    </div>
  );
}

function BioFieldList({ items, editing, onChange }) {
  const upd = (i, p) => onChange(items.map((x, j) => j === i ? { ...x, ...p } : x));
  const rm = (i) => onChange(items.filter((_, j) => j !== i));
  const add = (multi) => onChange([...items, { label: "New field", value: multi ? [] : "", conf: 50, source: "manual entry", multi }]);
  return (
    <div>
      {items.map((f, i) => <EditableField key={i} f={f} editing={editing} onChange={(p) => upd(i, p)} onRemove={() => rm(i)} />)}
      {editing && (
        <div style={{display:"flex", gap:8, marginTop:14}}>
          <button className="btn btn--ghost btn--sm" onClick={() => add(false)}><Icon name="plus" size={13} /> Add field</button>
          <button className="btn btn--ghost btn--sm" onClick={() => add(true)}><Icon name="plus" size={13} /> Add list field</button>
        </div>
      )}
    </div>
  );
}
function BioSectionHead({ label, source, conf }) {
  return (
    <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:14}}>
      <div>
        <div style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--c-faint)", letterSpacing:"0.08em", textTransform:"uppercase"}}>{label}</div>
        {source && <div style={{fontSize:11, color:"var(--c-faint)", marginTop:3, fontStyle:"italic"}}>from {source}</div>}
      </div>
      {conf != null && <Confidence value={conf} />}
    </div>
  );
}

function BioVisual({ bio, patch, editing }) {
  const dark = (hex) => {
    const n = parseInt((hex || "#000").slice(1), 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) < 140;
  };
  const updPal = (i, p) => patch("palette", bio.palette.map((x, j) => j === i ? { ...x, ...p } : x));
  const updType = (i, p) => patch("type", bio.type.map((x, j) => j === i ? { ...x, ...p } : x));
  return (
    <div style={{display:"flex", flexDirection:"column", gap:30}}>
      {/* PALETTE */}
      <section>
        <BioSectionHead label="Colour palette" source="extracted from 47 pages + logo" conf={94} />
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(160px, 1fr))", gap:12}}>
          {bio.palette.map((c, i) => (
            <div key={i} className="card" style={{padding:0, overflow:"hidden"}}>
              <div style={{height:92, background:c.hex, display:"flex", alignItems:"flex-end", justifyContent:"space-between", padding:10}}>
                {editing
                  ? <input type="color" value={c.hex} onChange={(e) => updPal(i, { hex: e.target.value })} style={{width:30, height:24, border:"none", background:"transparent", cursor:"pointer", padding:0}} />
                  : <span style={{fontFamily:"var(--font-mono)", fontSize:10.5, color: dark(c.hex) ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.6)", letterSpacing:"0.04em"}}>{c.hex}</span>}
                {editing && <button onClick={() => patch("palette", bio.palette.filter((_, j) => j !== i))} style={{...CHIP_X, color: dark(c.hex) ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.6)", fontSize:16}} title="Remove colour">×</button>}
              </div>
              <div style={{padding:"10px 12px"}}>
                {editing
                  ? <div style={{display:"flex", flexDirection:"column", gap:6}}>
                      <EditInput value={c.name} onChange={(v) => updPal(i, { name: v })} placeholder="Name" />
                      <div style={{display:"flex", gap:6}}>
                        <EditInput value={c.wcag} onChange={(v) => updPal(i, { wcag: v })} placeholder="WCAG" mono />
                        <input type="number" min={0} max={100} value={c.conf} onChange={(e) => updPal(i, { conf: +e.target.value || 0 })} style={{...EDIT_INPUT, width:60, height:34, fontFamily:"var(--font-mono)", fontSize:11.5}} />
                      </div>
                    </div>
                  : <>
                      <div style={{fontSize:13.5, fontWeight:600, color:"var(--c-ink)"}}>{c.name}</div>
                      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:8}}>
                        <span className="pill" style={{height:18, padding:"0 8px", fontSize:9.5}}>WCAG {c.wcag}</span>
                        <span style={{fontFamily:"var(--font-mono)", fontSize:10, color: c.conf >= 85 ? "var(--green-600)" : c.conf >= 65 ? "var(--orange-600)" : "var(--pink-500)"}}>{c.conf}%</span>
                      </div>
                    </>}
              </div>
            </div>
          ))}
          {editing && (
            <button className="card" onClick={() => patch("palette", [...bio.palette, { hex:"#888888", name:"New colour", conf:50, wcag:"—" }])}
              style={{display:"flex", alignItems:"center", justifyContent:"center", minHeight:150, borderStyle:"dashed", cursor:"pointer", color:"var(--c-dim)", gap:6}}>
              <Icon name="plus" size={16} /> Add colour
            </button>
          )}
        </div>
      </section>

      {/* TYPOGRAPHY */}
      <section>
        <BioSectionHead label="Typography" source="visual extraction" conf={88} />
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
          {bio.type.map((t, i) => {
            const serif = /sectra|serif|display/i.test(t.family) && t.kind === "Body";
            const ff = serif ? "Georgia, 'Times New Roman', serif" : "var(--font-sans)";
            return (
              <div key={i} className="card" style={{padding:18}}>
                <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8}}>
                  {editing
                    ? <input value={t.kind} onChange={(e) => updType(i, { kind: e.target.value })} style={{...EDIT_INPUT, width:130, height:28}} />
                    : <span className="eyebrow">{t.kind}</span>}
                  {editing
                    ? <button className="btn btn--link" style={{fontSize:11, color:"var(--pink-500)"}} onClick={() => patch("type", bio.type.filter((_, j) => j !== i))}>Remove</button>
                    : <span className="pill" style={{height:18, padding:"0 8px", fontSize:9.5}}>{t.license}</span>}
                </div>
                <div style={{fontFamily:ff, fontSize:52, lineHeight:1, color:"var(--c-ink)", fontWeight:600, letterSpacing:"-0.02em"}}>Aa Gg</div>
                <div style={{fontFamily:ff, fontSize:15, color:"var(--c-dim)", marginTop:8, lineHeight:1.4}}>The decision to slow down, on purpose.</div>
                <div style={{marginTop:14, paddingTop:12, borderTop:"1px dashed var(--c-line-2)"}}>
                  {editing
                    ? <div style={{display:"flex", flexDirection:"column", gap:6}}>
                        <EditInput value={t.family} onChange={(v) => updType(i, { family: v })} placeholder="Family" />
                        <div style={{display:"flex", gap:6}}>
                          <EditInput value={t.size} onChange={(v) => updType(i, { size: v })} placeholder="Size" mono />
                          <EditInput value={t.license} onChange={(v) => updType(i, { license: v })} placeholder="License" />
                        </div>
                        <EditInput value={t.suggest} onChange={(v) => updType(i, { suggest: v })} placeholder="Web alternative" />
                      </div>
                    : <>
                        <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline"}}>
                          <span style={{fontSize:13, fontWeight:500, color:"var(--c-ink)"}}>{t.family}</span>
                          <span style={{fontFamily:"var(--font-mono)", fontSize:10.5, color:"var(--c-faint)"}}>{t.size}</span>
                        </div>
                        <div style={{fontSize:11.5, color:"var(--c-faint)", marginTop:4}}>Web alternative · {t.suggest}</div>
                      </>}
                </div>
              </div>
            );
          })}
          {editing && (
            <button className="card" onClick={() => patch("type", [...bio.type, { kind:"New face", family:"Family name", size:"16/24", license:"free", suggest:"system" }])}
              style={{display:"flex", alignItems:"center", justifyContent:"center", minHeight:120, borderStyle:"dashed", cursor:"pointer", color:"var(--c-dim)", gap:6}}>
              <Icon name="plus" size={16} /> Add typeface
            </button>
          )}
        </div>
      </section>

      {/* IMAGERY */}
      <section>
        <BioSectionHead label="Imagery" source="image analysis · 90 posts" conf={84} />
        <div className="card card--inset" style={{padding:"14px 16px", marginBottom:12}}>
          <div className="eyebrow" style={{marginBottom:6}}>Grade</div>
          {editing
            ? <EditInput area value={bio.grade} onChange={(v) => patch("grade", v)} />
            : <p style={{fontSize:14, color:"var(--c-ink)", lineHeight:1.5, margin:0}}>{bio.grade}</p>}
        </div>
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
          <div className="card" style={{padding:16, borderLeft:"3px solid var(--green-600)"}}>
            <div className="eyebrow eyebrow--green" style={{marginBottom:10}}>Shoot this</div>
            {editing
              ? <StringListEditor items={bio.imagery} onChange={(v) => patch("imagery", v)} marker="✓" color="var(--green-600)" />
              : <ul style={{margin:0, padding:0, listStyle:"none", display:"flex", flexDirection:"column", gap:7}}>
                  {bio.imagery.map((x, i) => <li key={i} style={{fontSize:13, color:"var(--c-ink)", display:"flex", gap:8, lineHeight:1.45}}><span style={{color:"var(--green-600)"}}>✓</span> {x}</li>)}
                </ul>}
          </div>
          <div className="card" style={{padding:16, borderLeft:"3px solid var(--pink-500)"}}>
            <div className="eyebrow eyebrow--pink" style={{marginBottom:10}}>Never this</div>
            {editing
              ? <StringListEditor items={bio.avoid} onChange={(v) => patch("avoid", v)} marker="✕" color="var(--pink-500)" />
              : <ul style={{margin:0, padding:0, listStyle:"none", display:"flex", flexDirection:"column", gap:7}}>
                  {bio.avoid.map((x, i) => <li key={i} style={{fontSize:13, color:"var(--c-ink)", display:"flex", gap:8, lineHeight:1.45}}><span style={{color:"var(--pink-500)"}}>✕</span> {x}</li>)}
                </ul>}
          </div>
        </div>
      </section>
    </div>
  );
}

function BioStrategic({ strat, patchStrategic, editing }) {
  return (
    <div style={{display:"grid", gridTemplateColumns: "1fr 1fr", gap: 18}}>
      <div className="card" style={{padding: 18, borderLeft: "3px solid var(--yellow-500)"}}>
        <div className="eyebrow eyebrow--yellow" style={{marginBottom: 8}}>Strategic watchouts</div>
        {editing
          ? <StringListEditor items={strat.watchouts} onChange={(v) => patchStrategic("watchouts", v)} />
          : <ul style={{margin: 0, paddingLeft: 0, listStyle:"none", display:"flex", flexDirection:"column", gap: 10}}>
              {strat.watchouts.map((x, i) => <li key={i} style={{fontSize: 13.5, color:"var(--c-ink)"}}>{x}</li>)}
            </ul>}
      </div>
      <div className="card" style={{padding: 18, borderLeft:"3px solid var(--orange-500)"}}>
        <div className="eyebrow" style={{color:"var(--orange-600)", marginBottom: 8}}>Gaps</div>
        {editing
          ? <StringListEditor items={strat.gaps} onChange={(v) => patchStrategic("gaps", v)} />
          : <ul style={{margin:0, paddingLeft: 0, listStyle:"none", display:"flex", flexDirection:"column", gap: 10}}>
              {strat.gaps.map((x, i) => <li key={i} style={{fontSize: 13.5, color:"var(--c-ink)"}}>{x}</li>)}
            </ul>}
      </div>
      <div className="card" style={{padding: 18, borderLeft:"3px solid var(--pink-500)", gridColumn: "1 / -1"}}>
        <div className="eyebrow eyebrow--pink" style={{marginBottom: 8}}>What Vinilo is NOT</div>
        {editing
          ? <StringListEditor items={strat.notList} onChange={(v) => patchStrategic("notList", v)} marker="✕" color="var(--pink-500)" />
          : <ul style={{margin: 0, paddingLeft: 0, listStyle:"none", display:"grid", gridTemplateColumns: "1fr 1fr", gap: 10}}>
              {strat.notList.map((x, i) => <li key={i} style={{fontSize:13.5}}>✕ {x}</li>)}
            </ul>}
      </div>
      <div className="card" style={{padding: 18, gridColumn: "1 / -1"}}>
        <div className="eyebrow eyebrow--purple" style={{marginBottom: 8}}>Brandolph's diagnosis · this week</div>
        {editing
          ? <EditInput area value={strat.diagnosis} onChange={(v) => patchStrategic("diagnosis", v)} />
          : <p style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize: 16, lineHeight: 1.55, color:"var(--c-ink)", margin: 0}}>"{strat.diagnosis}"</p>}
      </div>
    </div>
  );
}
function BioSources({ sources, setSources, feed, setFeed, reading, addReference, editing, go }) {
  const total = sources.reduce((a, s) => a + s.n, 0);
  const onKey = (e) => { if (e.key === "Enter") { e.preventDefault(); addReference(); } };
  return (
    <div>
      {/* Feed composer */}
      <div className="card card--inset" style={{padding:18, marginBottom:22}}>
        <div style={{display:"flex", alignItems:"center", gap:9, marginBottom:12}}>
          <BrandolphDot state={reading ? "thinking" : "idle"} />
          <div>
            <div style={{fontSize:14, fontWeight:600, color:"var(--c-ink)"}}>Feed Brandolph</div>
            <div style={{fontSize:12, color:"var(--c-faint)"}}>Drop a link, a doc, or a note. Brandolph reads it and tightens the BIO.</div>
          </div>
        </div>
        <div style={{display:"flex", gap:10}}>
          <input
            value={feed}
            onChange={(e) => setFeed(e.target.value)}
            onKeyDown={onKey}
            disabled={reading}
            placeholder="Paste a URL — site, article, competitor, social…"
            style={{flex:1, height:42, borderRadius:9, border:"1px solid var(--c-line-2)", background:"var(--c-bg)", padding:"0 14px", fontSize:14, color:"var(--c-ink)", outline:"none"}}
          />
          <button className="btn btn--primary" disabled={reading || !feed.trim()} onClick={() => addReference()}>
            {reading ? <><BrandolphDot state="thinking" size={11} /> Reading…</> : <><Icon name="plus" size={14} /> Read it</>}
          </button>
        </div>
        <div style={{display:"flex", gap:8, marginTop:12, flexWrap:"wrap"}}>
          <button className="btn btn--ghost btn--sm" disabled={reading} onClick={() => addReference("Document upload · brand-deck.pdf", "doc")}><Icon name="files" size={13} /> Upload document</button>
          <button className="btn btn--ghost btn--sm" disabled={reading} onClick={() => addReference("Instagram · @vinilo.coffee · latest 30 posts")}><Icon name="refresh" size={13} /> Re-pull social</button>
          <button className="btn btn--ghost btn--sm" disabled={reading} onClick={() => addReference("Competitor · blue-bottle.com")}><Icon name="plus" size={13} /> Add competitor</button>
        </div>
      </div>

      {/* Ledger header */}
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:6}}>
        <div className="eyebrow">{sources.length} sources · {total} signals learned</div>
        <div style={{fontSize:11.5, color:"var(--c-faint)", fontStyle:"italic"}}>Every source compounds the BIO.</div>
      </div>

      {/* Source ledger */}
      <div>
        {sources.map((s, i) => (
          <div key={i} style={{display:"grid", gridTemplateColumns:"1fr auto auto", gap: 14, padding:"12px 0", borderBottom: "1px solid var(--c-line)", alignItems:"center", animation: s.fresh ? "cvPopIn 260ms ease" : "none"}}>
            <div>
              <div style={{fontSize: 13.5, color:"var(--c-ink)", fontWeight:500, display:"flex", alignItems:"center", gap:8}}>
                {s.src}
                {s.fresh && <span className="pill" style={{height:18, padding:"0 8px", fontSize:9.5, background:"var(--green-50, rgba(127,163,122,0.16))", color:"var(--green-600)"}}>new</span>}
              </div>
              <div style={{fontFamily:"var(--font-mono)", fontSize: 10.5, color:"var(--c-faint)", marginTop: 2, letterSpacing:"0.04em"}}>{s.date}</div>
            </div>
            <span className="pill">{s.n} signals</span>
            {editing
              ? <button className="btn btn--link" style={{fontSize: 12, color:"var(--pink-500)"}} onClick={() => setSources(sources.filter((_, j) => j !== i))}>Remove</button>
              : <button className="btn btn--link" style={{fontSize: 12}} onClick={() => go("discovery")}>Re-extract</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { Discovery, BioViewer });
