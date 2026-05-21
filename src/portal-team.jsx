import React from "react";
const { BrandolphDot, Confidence, Counter, Icon, ModelChip, PageHeader, SlaHeat, StatusPill } = window;
/* Team portal — queue, job workspace, capacity, clients, earnings. */

const { useState: useTState } = React;

/* ════════════════════════════════════════════════════════════════ */
/* JOB QUEUE                                                          */

function TeamQueue({ go }) {
  const [filter, setFilter] = useTState("all");
  const filtered = filter === "all" ? window.CI_JOBS : window.CI_JOBS.filter(j => j.status === filter);

  return (
    <div className="tqueue">
      {/* Main */}
      <section className="scroll" style={{padding: "24px 32px 40px", overflowY:"auto"}}>
        {/* KPI strip */}
        <div className="stagger" style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap: 14, marginBottom: 24}}>
          {[
            { kpi: 12,        label:"Jobs open"           },
            { kpi: 3,         label:"In progress · mine"  },
            { kpi: "2.7d",    label:"Avg SLA remaining"   },
            { kpi:"€1,847",   label:"Earned this week"   },
          ].map((s, i) => (
            <div key={i} className="card" style={{padding: 18}}>
              <div className="eyebrow" style={{marginBottom: 6}}>{s.label}</div>
              <div style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontWeight: 500, fontSize: 36, color:"var(--c-ink)", lineHeight: 1}}>
                {typeof s.kpi === "number" ? <Counter to={s.kpi} /> : s.kpi}
              </div>
            </div>
          ))}
        </div>

        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 14}}>
          <h2 style={{fontSize: 20, margin: 0, letterSpacing:"-0.01em"}}>Active queue · {filtered.length}</h2>
          <div style={{display:"flex", gap: 6, flexWrap:"wrap"}}>
            {[["all","All"],["unassigned","Unassigned"],["in-progress","In progress"],["review","Review"],["delivered","Delivered"]].map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)}
                className={"pill" + (filter === k ? " pill--dark" : "")}
                style={{cursor:"pointer", height: 28, padding:"0 12px"}}>{l}</button>
            ))}
          </div>
        </div>

        <div className="card" style={{padding: 0, overflow:"hidden"}}>
          <table style={{width:"100%", borderCollapse:"collapse", fontSize: 13}}>
            <thead>
              <tr style={{background:"var(--c-bg)", borderBottom:"1px solid var(--c-line)"}}>
                {["Job","Client","Type","Cr","Submitted","SLA","Status","Assignee",""].map((h, i) => (
                  <th key={i} style={{textAlign:"left", padding:"10px 14px", fontFamily:"var(--font-mono)", fontSize: 10.5, color:"var(--c-faint)", letterSpacing:"0.1em", textTransform:"uppercase", fontWeight: 500}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="stagger">
              {filtered.map((j, i) => {
                const mine = j.assignee === "Aitana V.";
                const overdue = /overdue/i.test(j.sla);
                let borderLeft = "none";
                if (overdue) borderLeft = "2px solid var(--pink-500)";
                else if (mine) borderLeft = "2px solid var(--yellow-500)";
                else if (j.status === "delivered") borderLeft = "2px solid var(--green-500)";
                return (
                  <tr key={j.id} onClick={() => go("team-job/" + j.id)} style={{
                    borderBottom: i < filtered.length - 1 ? "1px solid var(--c-line)" : "none",
                    cursor:"pointer", borderLeft,
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--neutral-50)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <td style={{padding:"12px 14px", fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--c-faint)"}}>{j.id}</td>
                    <td style={{padding:"12px 14px"}}>
                      <div style={{display:"flex", alignItems:"center", gap: 8}}>
                        <div style={{width: 22, height: 22, borderRadius:5, background:"var(--neutral-900)", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"var(--font-mono)", fontSize: 11, fontWeight: 600}}>{j.client[0]}</div>
                        <span style={{fontSize: 13, color:"var(--c-ink)"}}>{j.client}</span>
                      </div>
                    </td>
                    <td style={{padding:"12px 14px", color:"var(--c-ink)"}}>{j.type}</td>
                    <td style={{padding:"12px 14px"}}><span className="credit">{j.cr}</span></td>
                    <td style={{padding:"12px 14px", color:"var(--c-faint)", fontSize: 12}}>{j.submitted}</td>
                    <td style={{padding:"12px 14px"}}><SlaHeat text={j.sla} /></td>
                    <td style={{padding:"12px 14px"}}><StatusPill status={j.status} /></td>
                    <td style={{padding:"12px 14px"}}>
                      {j.assignee ? (
                        <span style={{fontSize: 12.5, color:"var(--c-dim)"}}>{j.assignee}</span>
                      ) : (
                        <button className="btn btn--primary btn--sm" style={{height: 26}} onClick={(e) => { e.stopPropagation(); }}>Claim</button>
                      )}
                    </td>
                    <td style={{padding:"12px 8px"}}><Icon name="arrow" size={14} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Right rail */}
      <aside className="tqueue-right scroll" style={{borderLeft:"1px solid var(--c-line)", background:"#fff", overflowY:"auto"}}>
        <div style={{padding: "20px"}}>
          <div className="eyebrow" style={{marginBottom: 12}}>Your capacity</div>
          <div className="card" style={{padding: 16, marginBottom: 18}}>
            <div style={{display:"flex", justifyContent:"space-between", marginBottom: 8}}>
              <span style={{fontSize: 13, color:"var(--c-dim)"}}>Today</span>
              <span style={{fontFamily:"var(--font-mono)", fontSize: 12, color:"var(--c-ink)"}}>3 / 4 slots</span>
            </div>
            <div style={{height: 6, background:"var(--neutral-50)", borderRadius: 999, marginBottom: 12, overflow:"hidden"}}>
              <div style={{height:"100%", width:"75%", background:"var(--yellow-500)", borderRadius:999}} />
            </div>
            <div style={{display:"flex", justifyContent:"space-between", marginBottom: 8}}>
              <span style={{fontSize: 13, color:"var(--c-dim)"}}>This week</span>
              <span style={{fontFamily:"var(--font-mono)", fontSize: 12, color:"var(--c-ink)"}}>11 / 14</span>
            </div>
            <div style={{height: 6, background:"var(--neutral-50)", borderRadius: 999, overflow:"hidden"}}>
              <div style={{height:"100%", width:"78%", background:"var(--mint-500)", borderRadius:999}} />
            </div>
          </div>

          <div className="eyebrow" style={{marginBottom: 12, color:"var(--pink-500)"}}>SLA at risk · 2</div>
          <div style={{display:"flex", flexDirection:"column", gap: 8, marginBottom: 22}}>
            {window.CI_JOBS.filter(j => /overdue/.test(j.sla) || (/^\d+h/.test(j.sla) && parseInt(j.sla) <= 8)).slice(0, 3).map(j => (
              <div key={j.id} className="card card--inset" style={{padding:"10px 12px", borderLeft:"3px solid var(--pink-500)"}}>
                <div style={{fontSize: 13, fontWeight: 500, marginBottom: 2}}>{j.client}</div>
                <div style={{fontSize: 12, color:"var(--c-dim)", marginBottom: 6}}>{j.type}</div>
                <SlaHeat text={j.sla} />
              </div>
            ))}
          </div>

          <div className="eyebrow" style={{marginBottom: 12}}>Team activity · live</div>
          <div style={{display:"flex", flexDirection:"column", gap: 10}}>
            {[
              { who:"Marc P.", action:"claimed", obj:"j-9f2a1c", time:"4m ago" },
              { who:"Lia R.",  action:"delivered", obj:"j-91b8e0", time:"22m ago" },
              { who:"Aitana V.", action:"started", obj:"j-d4e8b7", time:"1h ago" },
              { who:"Diego M.", action:"flagged", obj:"j-aaa099", time:"2h ago" },
            ].map((a, i) => (
              <div key={i} style={{display:"flex", gap: 10, fontSize: 12, color:"var(--c-dim)", lineHeight: 1.4}}>
                <span style={{width: 8, height: 8, borderRadius:"50%", background: a.action === "delivered" ? "var(--green-500)" : a.action === "flagged" ? "var(--pink-500)" : "var(--yellow-500)", marginTop: 6}} />
                <div style={{flex: 1}}>
                  <strong style={{color:"var(--c-ink)", fontWeight: 500}}>{a.who}</strong> {a.action} <span style={{fontFamily:"var(--font-mono)", fontSize: 11}}>{a.obj}</span>
                  <div style={{fontSize: 11, color:"var(--c-faint)"}}>{a.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* ACTIVE JOB WORKSPACE                                              */

function TeamJob({ id, go }) {
  const job = window.CI_JOBS.find(j => j.id === id) || window.CI_JOBS[0];
  const [tab, setTab] = useTState("files");

  return (
    <div className="tjob">
      {/* Left rail · CONTEXT */}
      <aside className="tjob-left scroll" style={{borderRight: "1px solid var(--c-line)", overflowY:"auto", background:"#fff"}}>
        <div style={{padding: 22, borderBottom: "1px solid var(--c-line)"}}>
          <button onClick={() => go("team")} className="btn btn--link" style={{fontSize: 12, marginBottom: 12}}>
            <Icon name="arrowLeft" size={13} /> Job queue
          </button>
          <div className="eyebrow" style={{marginBottom: 6}}>{job.id} · {job.type}</div>
          <h2 style={{margin: 0, fontSize: 18}}>{job.client}</h2>
          <div style={{display:"flex", gap: 8, marginTop: 12, alignItems:"center"}}>
            <StatusPill status={job.status} />
            <span className="credit">−{job.cr} cr</span>
            <SlaHeat text={job.sla} />
          </div>
        </div>

        <div style={{padding: 22, borderBottom: "1px solid var(--c-line)"}}>
          <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: 12}}>
            <span className="eyebrow">BIO highlights</span>
            <a href="#/bio" className="btn btn--link" style={{fontSize: 11}}>Open BIO →</a>
          </div>
          <div style={{display:"flex", flexDirection:"column", gap: 12}}>
            <div>
              <div className="eyebrow" style={{marginBottom: 4, color:"var(--yellow-700)"}}>Positioning</div>
              <p style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize: 14, color:"var(--c-ink)", margin: 0, lineHeight: 1.45}}>"Specialty coffee for slow Tuesdays."</p>
            </div>
            <div>
              <div className="eyebrow" style={{marginBottom: 4}}>Voice</div>
              <p style={{fontSize: 12.5, color:"var(--c-dim)", margin: 0, lineHeight: 1.5}}>Editorial, low-urgency, second person. Funny only when earned.</p>
            </div>
            <div>
              <div className="eyebrow eyebrow--pink" style={{marginBottom: 4}}>Forbidden</div>
              <div style={{display:"flex", flexWrap:"wrap", gap: 4}}>
                {["unlock","limited","drop","exclusive","FOMO","kit"].map(t => (
                  <span key={t} style={{padding:"3px 8px", borderRadius: 4, background:"var(--pink-50)", color:"var(--pink-700)", fontSize: 11, textDecoration:"line-through"}}>{t}</span>
                ))}
              </div>
            </div>
            <div>
              <div className="eyebrow" style={{marginBottom: 4}}>Palette</div>
              <div style={{display:"flex", gap: 4}}>
                {window.CI_DISCOVERY.palette.slice(0,5).map((c, i) => (
                  <div key={i} title={c.name} style={{width: 32, height: 32, background: c.hex, borderRadius: 6, border:"1px solid var(--c-line)"}} />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div style={{padding: 22, borderBottom: "1px solid var(--c-line)"}}>
          <div className="eyebrow" style={{marginBottom: 12}}>AI drafts attached</div>
          <div style={{display:"flex", flexDirection:"column", gap: 8}}>
            {window.CI_OUTPUTS.slice(0,2).map(o => {
              const a = window.CI_AGENTS.find(x => x.id === o.agentId);
              return (
                <div key={o.id} className="card card--inset" style={{padding: 12, borderLeft:`3px solid ${window.CI_MODELS[a.model].color}`}}>
                  <div className="eyebrow eyebrow--yellow" style={{fontSize: 9, marginBottom: 4}}>{o.type}</div>
                  <p style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize: 12.5, color:"var(--c-ink)", margin: 0, lineHeight: 1.4}}>"{o.body.slice(0, 100)}…"</p>
                  <div style={{marginTop: 6, display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                    <ModelChip modelKey={a.model} />
                    <button className="btn btn--link" style={{fontSize: 10}}>Open →</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{padding: 22, borderBottom: "1px solid var(--c-line)"}}>
          <div className="eyebrow" style={{marginBottom: 8}}>Direction from Marina</div>
          <p style={{fontSize: 13, color:"var(--c-ink)", margin: 0, lineHeight: 1.55}}>
            Take this through to print-ready. Tone is calm conviction. Image direction is craft-led, low-light interiors, no top-down latte art. Final files in PDF + EPS.
          </p>
        </div>

        <div style={{padding: 22}}>
          <div style={{display:"flex", alignItems:"center", gap: 8, marginBottom: 8}}>
            <BrandolphDot />
            <span className="eyebrow eyebrow--yellow">Brandolph's brief synthesis</span>
          </div>
          <p style={{fontSize: 13, color:"var(--c-ink)", margin: 0, lineHeight: 1.55, fontStyle:"italic", fontFamily:"Georgia, serif"}}>
            "The conversion copy is strong. The image direction reads warm not cute. The single thing I'd watch: the annual price has to read like a decision, not a saving. If you ever feel like you're competing with the monthly column, push the editorial frame harder."
          </p>
        </div>
      </aside>

      {/* Main · WORK */}
      <main className="scroll" style={{overflowY:"auto"}}>
        {/* Action bar */}
        <div style={{
          padding:"14px 28px", borderBottom: "1px solid var(--c-line)",
          background:"#fff", display:"flex", alignItems:"center", justifyContent:"space-between", gap: 14,
        }}>
          <div style={{display:"flex", alignItems:"center", gap: 14}}>
            <select className="input" style={{height: 34, width: 160, fontSize: 13}} defaultValue="in-progress">
              <option value="in-progress">In progress</option>
              <option value="review">In review</option>
              <option value="blocked">Blocked</option>
              <option value="delivered">Delivered</option>
            </select>
            <button className="btn btn--ghost btn--sm">
              <Icon name="timer" size={13} /> 2h 14m logged
            </button>
          </div>
          <button className="btn btn--primary">
            Deliver <Icon name="arrow" size={13} />
          </button>
        </div>

        {/* Tabs */}
        <div className="tabs" style={{paddingLeft: 28, paddingRight: 28, background:"#fff"}}>
          <button className={"tab" + (tab === "files" ? " tab--active" : "")} onClick={() => setTab("files")}>Files</button>
          <button className={"tab" + (tab === "direction" ? " tab--active" : "")} onClick={() => setTab("direction")}>Direction</button>
          <button className={"tab" + (tab === "history" ? " tab--active" : "")} onClick={() => setTab("history")}>Version history</button>
        </div>

        <div style={{padding: 28}}>
          {tab === "files" && (
            <div>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 12}}>
                <span className="eyebrow">Versions · 3</span>
                <button className="btn btn--ghost btn--sm"><Icon name="plus" size={13} /> Upload</button>
              </div>
              <div style={{display:"flex", flexDirection:"column", gap: 10}}>
                {[
                  { v:"v3", title:"vinilo-pricing-hero-v3.pdf", state:"current", note:"Resized to A2 + 1080×1350 IG", time:"38m ago", thumb:"#C97B3F" },
                  { v:"v2", title:"vinilo-pricing-hero-v2.fig", state:"superseded", note:"Annual line moved up · type pass", time:"yesterday", thumb:"#F4ECDD" },
                  { v:"v1", title:"vinilo-pricing-hero-v1.fig", state:"superseded", note:"First take · AI hero as image", time:"2 days ago", thumb:"#1F1A14" },
                ].map((f, i) => (
                  <div key={i} style={{
                    display:"flex", alignItems:"center", gap: 14, padding: 12,
                    border:"1px solid var(--c-line)", borderRadius: 10,
                    background: f.state === "current" ? "var(--yellow-50)" : "#fff",
                  }}>
                    <div style={{
                      width: 60, height: 60, borderRadius: 6,
                      background: f.thumb, flexShrink: 0,
                      border:"1px solid var(--c-line)",
                      display:"flex", alignItems:"center", justifyContent:"center",
                      color: f.thumb === "#F4ECDD" ? "#1F1A14" : "#F4ECDD",
                      fontFamily:"Georgia, serif", fontStyle:"italic", fontSize: 16, fontWeight: 500,
                    }}>vinilo</div>
                    <div style={{flex: 1, minWidth: 0}}>
                      <div style={{display:"flex", alignItems:"center", gap: 8, marginBottom: 4}}>
                        <span style={{fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--c-faint)"}}>{f.v}</span>
                        <span style={{fontSize: 14, fontWeight: 500}}>{f.title}</span>
                        {f.state === "current" && <span className="pill pill--yellow" style={{height: 18, padding:"0 8px", fontSize:9.5}}>Current</span>}
                      </div>
                      <div style={{fontSize: 12, color:"var(--c-dim)"}}>{f.note}</div>
                      <div style={{fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--c-faint)", marginTop: 4}}>{f.time}</div>
                    </div>
                    <div style={{display:"flex", gap: 6}}>
                      <button className="btn btn--icon btn--ghost"><Icon name="download" size={14} /></button>
                      <button className="btn btn--ghost btn--sm">Open</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Inline comments thread */}
              <div style={{marginTop: 32}}>
                <div className="eyebrow" style={{marginBottom: 12}}>Comments on v3</div>
                <div style={{display:"flex", flexDirection:"column", gap: 12}}>
                  <div style={{display:"flex", gap: 12, padding: 14, background:"var(--c-bg)", borderRadius: 10}}>
                    <img src="intelligence/assets/profile-3.jpg" alt="" style={{width: 30, height:30, borderRadius:"50%"}} />
                    <div style={{flex:1}}>
                      <div style={{display:"flex", gap: 8, marginBottom: 2}}>
                        <strong style={{fontSize: 13}}>Marina · client</strong>
                        <span style={{fontSize: 11, color:"var(--c-faint)"}}>32m ago</span>
                      </div>
                      <p style={{fontSize: 13.5, color:"var(--c-ink)", margin: 0, lineHeight: 1.5}}>Love where this is. Annual line landed perfectly. One — the "1-in-12" sub-line might be redundant with the SMP. Worth A/B?</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {tab === "direction" && (
            <div className="card" style={{padding: 24, maxWidth: 720}}>
              <div className="eyebrow eyebrow--yellow" style={{marginBottom: 14}}>Direction brief · pre-filled by Brandolph</div>
              <textarea className="input" rows={14} defaultValue={"Hero KV for the pricing relaunch.\n\nThe SMP — 'We are the coffee for the Tuesday you decide to slow down on purpose' — is the single line that should drive everything. The page hero already lifts a version of it; the KV should NOT repeat it, but it should feel like a continuation.\n\nImage direction:\n— Low light, warm cast (Ember + Espresso from the palette).\n— Hands + a cup, not a portrait.\n— A Tuesday morning, not a Saturday.\n\nType direction:\n— Söhne (substitute for Söhne Breit). Don't fight the brand book.\n— Stack: One-line headline. One supporting line. No bullets.\n\nDeliverables: A2 print, 1080×1350 IG, 1200×628 OG.\n\nWhat I'm NOT doing here: I am not solving the annual-vs-monthly comparison. That sits on the pricing page. The KV is the editorial frame, not the conversion frame."} />
              <button className="btn btn--primary" style={{marginTop: 16}}>Save direction</button>
            </div>
          )}
          {tab === "history" && (
            <div style={{display:"flex", flexDirection:"column", gap: 10}}>
              {[
                { who:"Marina", e:"submitted with direction", time:"yesterday · 14:22" },
                { who:"Aitana", e:"claimed", time:"yesterday · 15:08" },
                { who:"Aitana", e:"uploaded v1", time:"yesterday · 17:42" },
                { who:"Aitana", e:"uploaded v2 · type pass", time:"today · 09:14" },
                { who:"Marina", e:"reviewed v2 · 'Annual line works better up'", time:"today · 10:30" },
                { who:"Aitana", e:"uploaded v3 · current", time:"today · 13:46" },
                { who:"Marina", e:"left a comment on v3", time:"32m ago" },
              ].map((h, i) => (
                <div key={i} className="card card--inset" style={{padding:"10px 14px", display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                  <div><strong style={{fontSize:13}}>{h.who}</strong> <span style={{fontSize: 13, color:"var(--c-dim)"}}>{h.e}</span></div>
                  <span style={{fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--c-faint)"}}>{h.time}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Right rail · COMMS */}
      <aside className="tjob-right scroll" style={{borderLeft: "1px solid var(--c-line)", background:"#fff", overflowY:"auto", display:"flex", flexDirection:"column"}}>
        <div style={{padding: 20, borderBottom:"1px solid var(--c-line)"}}>
          <div className="eyebrow" style={{marginBottom: 8}}>Comms · with Marina</div>
          <div style={{display:"flex", alignItems:"center", gap: 8, fontSize: 12, color:"var(--c-dim)"}}>
            <span style={{width: 6, height: 6, borderRadius:"50%", background:"var(--green-500)"}} />
            Marina is online
          </div>
        </div>
        <div style={{flex: 1, overflowY:"auto", padding: 20, display:"flex", flexDirection:"column", gap: 14}}>
          <div style={{maxWidth:"86%"}}>
            <div style={{padding:"10px 12px", background:"var(--c-bg)", borderRadius:"12px 12px 12px 4px"}}>
              <p style={{fontSize: 13.5, color:"var(--c-ink)", margin: 0, lineHeight: 1.45}}>Submitted v3 — annual line up, sub-line shortened.</p>
            </div>
            <div style={{fontSize: 10.5, color:"var(--c-faint)", marginTop: 4}}>Aitana · 38m ago</div>
          </div>
          <div style={{maxWidth:"86%", alignSelf:"flex-end"}}>
            <div style={{padding:"10px 12px", background:"var(--yellow-50)", borderRadius:"12px 12px 4px 12px"}}>
              <p style={{fontSize: 13.5, color:"var(--c-ink)", margin: 0, lineHeight: 1.45}}>Love where this is. One — the 1-in-12 sub-line might be redundant. Worth A/B?</p>
            </div>
            <div style={{fontSize: 10.5, color:"var(--c-faint)", marginTop: 4, textAlign:"right"}}>Marina · 32m ago</div>
          </div>
          <div style={{maxWidth:"86%"}}>
            <div style={{padding:"10px 12px", background:"var(--c-bg)", borderRadius:"12px 12px 12px 4px"}}>
              <p style={{fontSize: 13.5, color:"var(--c-ink)", margin: 0, lineHeight: 1.45}}>Agreed. Pulling a B-variant without the sub. Five mins.</p>
            </div>
            <div style={{fontSize: 10.5, color:"var(--c-faint)", marginTop: 4}}>Aitana · 8m ago</div>
          </div>
        </div>
        <div style={{padding: 14, borderTop: "1px solid var(--c-line)"}}>
          <label style={{display:"flex", alignItems:"center", gap: 6, fontSize: 11, color:"var(--c-faint)", marginBottom: 8}}>
            <input type="checkbox" /> <Icon name="files" size={12} /> Internal-only note
          </label>
          <div style={{display:"flex", gap: 8}}>
            <input className="input" placeholder="Reply to Marina…" style={{flex:1}} />
            <button className="btn btn--primary btn--icon"><Icon name="arrow" size={14} /></button>
          </div>
        </div>
      </aside>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* CAPACITY & SLA DASHBOARD                                          */

function TeamCapacity() {
  const days = ["Mon","Tue","Wed","Thu","Fri"];
  return (
    <div style={{padding:"24px 36px 60px"}}>
      <PageHeader eyebrow="Team lead" title="Capacity & SLA" sub="Where the team is loaded, where SLA is at risk, where the next job should land." />

      <div style={{display:"grid", gridTemplateColumns:"2fr 1fr", gap: 22, marginBottom: 30}}>
        <div className="card" style={{padding: 22}}>
          <div className="eyebrow" style={{marginBottom: 16}}>Team load · this week</div>
          <div style={{display:"grid", gridTemplateColumns:"180px repeat(5, 1fr)", gap: 6}}>
            <div></div>
            {days.map(d => <div key={d} className="eyebrow" style={{textAlign:"center"}}>{d}</div>)}
            {window.CI_TEAM.map(t => (
              <React.Fragment key={t.id}>
                <div style={{display:"flex", alignItems:"center", gap: 8, padding: 8}}>
                  <img src={t.photo} alt="" style={{width: 28, height: 28, borderRadius:"50%", objectFit:"cover"}} />
                  <div>
                    <div style={{fontSize: 13, fontWeight: 500}}>{t.name}</div>
                    <div style={{fontSize: 11, color:"var(--c-faint)"}}>{t.role}</div>
                  </div>
                </div>
                {days.map((d, i) => {
                  const load = Math.max(0.1, Math.min(1, t.load + (i - 2) * 0.08 + Math.random() * 0.1));
                  const color = load > 0.85 ? "#FCDDDD" : load > 0.65 ? "#FFE9C0" : load > 0.35 ? "#FFF4D5" : "#E8FBF2";
                  const textColor = load > 0.85 ? "var(--pink-700)" : load > 0.65 ? "var(--orange-600)" : load > 0.35 ? "var(--yellow-800)" : "var(--green-700)";
                  return (
                    <div key={i} style={{
                      background: color, borderRadius: 6, padding:"10px 8px",
                      textAlign:"center", color: textColor,
                      fontFamily:"var(--font-mono)", fontSize: 11, letterSpacing:"0.04em", fontWeight: 500,
                    }}>{Math.round(load * 100)}%</div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="card" style={{padding: 22}}>
          <div className="eyebrow" style={{marginBottom: 14, color:"var(--pink-500)"}}>SLA risk · 3 jobs</div>
          <div style={{display:"flex", flexDirection:"column", gap: 10}}>
            {window.CI_JOBS.filter(j => /overdue/.test(j.sla) || (/^\d+h/.test(j.sla) && parseInt(j.sla) <= 8)).map(j => (
              <div key={j.id} style={{padding: 12, border:"1px solid var(--c-line)", borderRadius: 8, borderLeft:"3px solid var(--pink-500)"}}>
                <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                  <div>
                    <div style={{fontSize: 13, fontWeight: 500}}>{j.client}</div>
                    <div style={{fontSize: 12, color:"var(--c-dim)"}}>{j.type}</div>
                  </div>
                  <SlaHeat text={j.sla} />
                </div>
                <button className="btn btn--ghost btn--sm" style={{marginTop: 10, fontSize: 11}}>Reassign</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap: 22}}>
        <div className="card" style={{padding: 22}}>
          <div className="eyebrow" style={{marginBottom: 14}}>Daily throughput · last 14 days</div>
          <div style={{display:"flex", alignItems:"flex-end", gap: 6, height: 140}}>
            {[6,8,5,9,11,4,7,9,12,8,10,9,11,14].map((n, i) => (
              <div key={i} style={{flex:1, height: `${(n/14)*100}%`, background: i >= 12 ? "var(--yellow-500)" : "var(--purple-200)", borderRadius:"3px 3px 0 0"}} title={`${n} jobs`} />
            ))}
          </div>
          <div style={{display:"flex", justifyContent:"space-between", marginTop: 8, fontFamily:"var(--font-mono)", fontSize: 10, color:"var(--c-faint)"}}>
            <span>2 weeks ago</span>
            <span>today</span>
          </div>
        </div>

        <div className="card" style={{padding: 22}}>
          <div className="eyebrow" style={{marginBottom: 14}}>Backlog · oldest unstarted</div>
          <div style={{display:"flex", flexDirection:"column", gap: 8}}>
            {window.CI_JOBS.filter(j => j.status === "unassigned").map(j => (
              <div key={j.id} style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 12px", border:"1px solid var(--c-line)", borderRadius: 8}}>
                <div>
                  <div style={{fontSize: 13, fontWeight: 500}}>{j.client}</div>
                  <div style={{fontSize: 12, color:"var(--c-dim)"}}>{j.type} · submitted {j.submitted}</div>
                </div>
                <button className="btn btn--primary btn--sm">Assign</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* CLIENT ROSTER                                                     */

function TeamClients() {
  const clients = [
    { name:"Vinilo Coffee",   bio: 91, tier:"02", active: 4, lifetime: 38, last:"2h ago",   primary:"Marina Reyes" },
    { name:"Plaza Hortelana", bio: 78, tier:"03", active: 2, lifetime: 22, last:"yesterday", primary:"Pere Sallés" },
    { name:"Bandera",         bio: 84, tier:"02", active: 2, lifetime: 31, last:"4h ago",    primary:"Joana Vidal" },
    { name:"Faro Lab",        bio: 66, tier:"02", active: 2, lifetime: 19, last:"yesterday", primary:"Alma Castro" },
    { name:"Olivar Real",     bio: 92, tier:"03", active: 2, lifetime: 44, last:"6h ago",    primary:"Iván Mestres" },
    { name:"Maizal",          bio: 58, tier:"01", active: 1, lifetime: 4,  last:"3h ago",    primary:"Sofía Romero" },
  ];
  return (
    <div style={{padding:"24px 36px 60px"}}>
      <PageHeader eyebrow="Team portal" title="Clients · 6" sub="The workspaces the team serves. Useful when you're picking up multiple jobs from the same brand." />
      <div className="card" style={{padding: 0, overflow:"hidden"}}>
        <table style={{width:"100%", borderCollapse:"collapse", fontSize: 13}}>
          <thead>
            <tr style={{background:"var(--c-bg)", borderBottom:"1px solid var(--c-line)"}}>
              {["Brand","BIO","Tier","Active jobs","Lifetime","Last activity","Primary contact"].map(h => (
                <th key={h} style={{textAlign:"left", padding:"12px 18px", fontFamily:"var(--font-mono)", fontSize:10.5, color:"var(--c-faint)", letterSpacing:"0.1em", textTransform:"uppercase", fontWeight: 500}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="stagger">
            {clients.map((c, i) => (
              <tr key={c.name} style={{borderBottom: i < clients.length - 1 ? "1px solid var(--c-line)" : "none"}}>
                <td style={{padding:"14px 18px"}}>
                  <div style={{display:"flex", alignItems:"center", gap: 10}}>
                    <div style={{width: 28, height: 28, borderRadius: 6, background:"var(--neutral-900)", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"var(--font-mono)", fontWeight:600, fontSize: 12}}>{c.name[0]}</div>
                    <span style={{fontWeight: 500, color:"var(--c-ink)"}}>{c.name}</span>
                  </div>
                </td>
                <td style={{padding:"14px 18px"}}><Confidence value={c.bio} /></td>
                <td style={{padding:"14px 18px"}}><span className="pill pill--yellow">Tier {c.tier}</span></td>
                <td style={{padding:"14px 18px", fontFamily:"var(--font-mono)"}}>{c.active}</td>
                <td style={{padding:"14px 18px", fontFamily:"var(--font-mono)", color:"var(--c-dim)"}}>{c.lifetime}</td>
                <td style={{padding:"14px 18px", color:"var(--c-faint)"}}>{c.last}</td>
                <td style={{padding:"14px 18px"}}>{c.primary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* MY EARNINGS                                                       */

function TeamMe() {
  const [scope, setScope] = useTState("month");
  return (
    <div style={{padding:"24px 36px 60px"}}>
      <PageHeader
        eyebrow="My desk"
        title="Aitana V. · Senior designer"
        sub="Hours, jobs, satisfaction. La Mesa pays on a separate rail — this is the visibility, not the pay slip."
        right={
          <div style={{display:"flex", gap: 6}}>
            {[["month","Month"],["quarter","Quarter"],["lifetime","Lifetime"]].map(([k, l]) => (
              <button key={k} onClick={() => setScope(k)} className={"pill" + (scope === k ? " pill--dark" : "")} style={{cursor:"pointer", height:28, padding:"0 12px"}}>{l}</button>
            ))}
          </div>
        }
      />

      <div className="stagger" style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap: 14, marginBottom: 28}}>
        {[
          { label:"Jobs delivered", v: 14 },
          { label:"Hours logged",   v: 38 },
          { label:"Avg satisfaction", v:"4.7" },
          { label:"Credits earned", v:"€1,847" },
        ].map((s, i) => (
          <div key={i} className="card" style={{padding: 20}}>
            <div className="eyebrow" style={{marginBottom: 6}}>{s.label}</div>
            <div style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize: 36, color:"var(--c-ink)", letterSpacing:"-0.01em", fontWeight: 500, lineHeight: 1}}>
              {typeof s.v === "number" ? <Counter to={s.v} /> : s.v}
            </div>
          </div>
        ))}
      </div>

      <div style={{display:"grid", gridTemplateColumns:"2fr 1fr", gap: 22, marginBottom: 28}}>
        <div className="card" style={{padding: 22}}>
          <div className="eyebrow" style={{marginBottom: 14}}>Hours logged · this month</div>
          <div style={{display:"flex", alignItems:"flex-end", gap: 4, height: 160}}>
            {Array.from({length: 28}, (_, i) => 2 + Math.sin(i * 0.4) * 1.5 + Math.random() * 3).map((h, i) => (
              <div key={i} style={{flex:1, height: `${(h/8)*100}%`, background:"var(--yellow-500)", opacity: 0.3 + (i / 28) * 0.7, borderRadius:"2px 2px 0 0"}} />
            ))}
          </div>
        </div>
        <div className="card" style={{padding: 22}}>
          <div className="eyebrow" style={{marginBottom: 14}}>Top clients · this month</div>
          <div style={{display:"flex", flexDirection:"column", gap: 12}}>
            {[
              { name:"Vinilo Coffee", hrs: 14 },
              { name:"Faro Lab", hrs: 11 },
              { name:"Plaza Hortelana", hrs: 9 },
              { name:"Bandera", hrs: 4 },
            ].map((c, i) => (
              <div key={i}>
                <div style={{display:"flex", justifyContent:"space-between", fontSize: 13, marginBottom: 4}}>
                  <span>{c.name}</span>
                  <span style={{fontFamily:"var(--font-mono)", color:"var(--c-faint)"}}>{c.hrs}h</span>
                </div>
                <div style={{height: 4, background:"var(--neutral-50)", borderRadius: 999, overflow:"hidden"}}>
                  <div style={{height:"100%", width: `${(c.hrs/14)*100}%`, background:"var(--yellow-500)", borderRadius:999}} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{padding: 22}}>
        <div className="eyebrow" style={{marginBottom: 14}}>Recent deliveries</div>
        <div style={{display:"flex", flexDirection:"column", gap: 6}}>
          {[
            { title:"Hero KV finish · Vinilo pricing", state:"delivered", time:"38m ago", cr: 220 },
            { title:"Packaging dieline · Faro Lab",    state:"in-progress", time:"yesterday", cr: 700 },
            { title:"Brand guidelines · Olivar Real",  state:"in-progress", time:"3d ago", cr: 650 },
            { title:"Identity finalisation · Plaza",   state:"delivered",  time:"5d ago", cr: 550 },
            { title:"Deck polish · Bandera",            state:"delivered", time:"6d ago", cr: 300 },
          ].map((d, i) => (
            <div key={i} style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 14px", borderRadius: 8, border:"1px solid var(--c-line)"}}>
              <div style={{display:"flex", alignItems:"center", gap: 10}}>
                <span className={"dot-state dot-state--" + (d.state === "delivered" ? "ok" : "running")} />
                <span style={{fontSize: 13.5}}>{d.title}</span>
              </div>
              <div style={{display:"flex", alignItems:"center", gap: 14}}>
                <span style={{fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--c-faint)"}}>{d.time}</span>
                <span className="credit credit--earned">+{d.cr} cr</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { TeamQueue, TeamJob, TeamCapacity, TeamClients, TeamMe });
