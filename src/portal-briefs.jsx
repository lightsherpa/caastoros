import React from "react";
const { AgentCard, BrandolphDot, Drawer, Icon, ModelChip, OutputCard, PageHeader, Reveal, StatusPill, useIsTeam, PinButton, usePins } = window;
/* Briefs library + Brief detail + Specialists directory + Canvas. */

const { useState: useBrState } = React;

/* ════════════════════════════════════════════════════════════════ */
/* BRIEFS LIBRARY                                                    */

function BriefsLibrary({ go }) {
  const [filter, setFilter] = useBrState("all");
  const filtered = filter === "all" ? window.CI_BRIEFS : window.CI_BRIEFS.filter(b => b.status === filter);

  return (
    <div style={{padding:"24px 36px 60px"}}>
      <PageHeader
        eyebrow="Workspace · Vinilo"
        title="Briefs"
        sub="The CMO-grade briefs Brandolph has produced. Each one is auditable against the BIO, with the specialists that executed it on record."
        right={<>
          <button className="btn btn--ghost">Filter <Icon name="filter" size={14} /></button>
          <a href="#/home" className="btn btn--primary">Brief Brandolph <Icon name="plus" size={14} /></a>
        </>}
      />

      <div style={{display:"flex", gap: 6, marginBottom: 20, flexWrap:"wrap"}}>
        {[
          ["all","All", window.CI_BRIEFS.length],
          ["draft","Draft", window.CI_BRIEFS.filter(b => b.status === "draft").length],
          ["approved","Approved", window.CI_BRIEFS.filter(b => b.status === "approved").length],
          ["in-production","In production", window.CI_BRIEFS.filter(b => b.status === "in-production").length],
          ["shipped","Shipped", window.CI_BRIEFS.filter(b => b.status === "shipped").length],
        ].map(([k, l, n]) => (
          <button key={k} onClick={() => setFilter(k)} className={"pill" + (filter === k ? " pill--dark" : "")} style={{cursor:"pointer", border:"1px solid", height: 28, padding:"0 12px"}}>
            {l} · {n}
          </button>
        ))}
      </div>

      <div className="card" style={{padding: 0, overflow:"hidden"}}>
        <table style={{width:"100%", borderCollapse:"collapse", fontSize: 13.5}}>
          <thead>
            <tr style={{background:"var(--c-bg)", borderBottom:"1px solid var(--c-line)"}}>
              {["Brief", "SMP", "Status", "Specialists", "Credits", "Created"].map((h, i) => (
                <th key={h} style={{textAlign: i === 4 ? "right" : "left", padding:"12px 18px", fontFamily:"var(--font-mono)", fontSize:10.5, color:"var(--c-faint)", letterSpacing:"0.1em", textTransform:"uppercase", fontWeight: 500}}>{h}</th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody className="stagger">
            {filtered.map((b, i) => (
              <tr key={b.id} style={{borderBottom: i < filtered.length - 1 ? "1px solid var(--c-line)" : "none", cursor:"pointer"}}
                onClick={() => go("board/" + b.id)}
                onMouseEnter={e => e.currentTarget.style.background = "var(--neutral-50)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <td style={{padding:"16px 18px"}}>
                  <div style={{fontWeight: 500, color:"var(--c-ink)", marginBottom: 2}}>{b.title}</div>
                  <div style={{fontFamily:"var(--font-mono)", fontSize: 10, color:"var(--c-faint)", letterSpacing:"0.04em"}}>{b.type}</div>
                </td>
                <td style={{padding:"16px 18px", maxWidth: 360}}>
                  <span style={{fontStyle:"italic", fontFamily:"Georgia, serif", color:"var(--c-dim)"}}>"{b.smp}"</span>
                </td>
                <td style={{padding:"16px 18px"}}><StatusPill status={b.status} /></td>
                <td style={{padding:"16px 18px"}}>
                  <div style={{display:"flex", gap:3}}>
                    {b.agents.slice(0, 5).map(aid => {
                      const a = window.CI_AGENTS.find(x => x.id === aid);
                      if (!a) return null;
                      const accent = window.CI_DEPT_COLORS[a.dept] || "var(--neutral-400)";
                      return <span key={aid} title={`${a.name} · ${a.dept}`} className="modelchip__dot" style={{width:11, height:11, background: accent, border:"1.5px solid #fff", outline:"1px solid var(--c-line)"}} />;
                    })}
                    {b.agents.length > 5 && <span style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--c-faint)", marginLeft: 4}}>+{b.agents.length - 5}</span>}
                  </div>
                </td>
                <td style={{padding:"16px 18px", textAlign:"right"}}><span className="credit">{b.credits || "—"} {b.credits ? "cr" : ""}</span></td>
                <td style={{padding:"16px 18px", fontFamily:"var(--font-mono)", fontSize:11, color:"var(--c-faint)"}}>{b.createdAt}</td>
                <td style={{padding:"16px 14px", color:"var(--c-faint)"}}><Icon name="arrow" size={14} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* BRIEF DETAIL                                                      */

function BriefDetail({ id, go }) {
  const brief = window.CI_BRIEFS.find(b => b.id === id) || window.CI_BRIEFS[0];
  const outputs = window.CI_OUTPUTS.filter(o => o.briefId === brief.id);
  const [win, setWin] = useBrState(null);   // "overview" | "recommendation" | null — open as floating windows
  const depts = [...new Set(brief.agents.map(aid => window.CI_AGENTS.find(a => a.id === aid)?.dept))].filter(Boolean).length;

  const TABS = [["overview","Overview"],["recommendation","Recommendation"],["delivery","Delivery"]];
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setWin(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div style={{padding:"22px 36px 60px", maxWidth: 1100, margin: "0 auto"}}>
      <button onClick={() => go("briefs")} className="btn btn--link" style={{fontSize: 12, marginBottom: 14}}>
        <Icon name="arrowLeft" size={13} /> All briefs
      </button>

      {/* Persistent header */}
      <div style={{display:"grid", gridTemplateColumns:"1fr auto", gap: 24, alignItems:"start", marginBottom: 18}}>
        <div>
          <div className="eyebrow" style={{marginBottom: 8}}>{brief.type} · {brief.createdAt} · {brief.credits} cr · {brief.agents.length} specialists</div>
          <h1 style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize: 36, letterSpacing:"-0.015em", lineHeight: 1.1, margin: 0, color:"var(--c-ink)", fontWeight: 500}}>{brief.title}</h1>
        </div>
        <div style={{display:"flex", flexDirection:"column", gap: 10, alignItems:"flex-end"}}>
          <StatusPill status={brief.status} />
          <div style={{display:"flex", gap: 8}}>
            {brief.status === "draft" && <button className="btn btn--primary btn--sm">Approve <Icon name="check" size={13} /></button>}
            <button className="btn btn--ghost btn--sm">Revise with Brandolph</button>
            <button className="btn btn--ghost btn--icon" aria-label="Export PDF"><Icon name="download" size={14} /></button>
          </div>
        </div>
      </div>

      {/* Deck tabs — Overview/Recommendation open as floating windows; Delivery opens the board */}
      <div style={{display:"flex", gap: 2, borderBottom:"1px solid var(--c-line)", marginBottom: 26}}>
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => k === "delivery" ? go("board/" + brief.id) : setWin(w => w === k ? null : k)} style={{
            border:"none", background:"transparent", cursor:"pointer", padding:"10px 16px",
            fontFamily:"var(--font-sans)", fontSize: 14, fontWeight: win === k ? 600 : 500,
            color: win === k ? "var(--c-ink)" : "var(--c-faint)",
            borderBottom: win === k ? "2px solid var(--yellow-500)" : "2px solid transparent", marginBottom: -1,
            display:"inline-flex", alignItems:"center", gap:6,
          }}>{l}{k === "delivery" && <Icon name="canvas" size={13} />}</button>
        ))}
      </div>

      {/* Base — calm proposition summary; the detail lives in the windows / board */}
      <div style={{maxWidth: 900}}>
        <div style={{background:"var(--yellow-500)", borderRadius: 14, padding:"30px 36px", marginBottom: 22, position:"relative", overflow:"hidden"}}>
          <div style={{position:"absolute", top: 16, right: 20, fontFamily:"var(--font-mono)", fontSize: 10, letterSpacing:"0.18em", color:"rgba(48,48,48,0.6)", textTransform:"uppercase", fontWeight:500}}>Single-minded proposition</div>
          <p style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize: 28, letterSpacing:"-0.005em", lineHeight: 1.25, margin: 0, color:"#1a1f36", fontWeight: 500, maxWidth: 820}}>"{brief.smp}"</p>
        </div>
        <div style={{display:"flex", gap:12, flexWrap:"wrap", alignItems:"center"}}>
          <button className="btn btn--primary" onClick={() => go("board/" + brief.id)}><Icon name="canvas" size={14} /> Open the board</button>
          <button className="btn btn--ghost btn--sm" onClick={() => setWin("overview")}>Overview</button>
          <button className="btn btn--ghost btn--sm" onClick={() => setWin("recommendation")}>Recommendation</button>
          <span style={{fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--c-faint)", letterSpacing:"0.06em"}}>{outputs.length} outputs · {depts} departments · {brief.credits} cr</span>
        </div>
      </div>

      {/* Small floating window — opens on the same page, no full-screen modal */}
      {win && (
        <>
          <div onClick={() => setWin(null)} style={{position:"fixed", inset:0, zIndex:60}} />
          <div className="card" style={{position:"fixed", top:170, left:284, width:440, maxHeight:"calc(100vh - 200px)", overflowY:"auto", zIndex:61, boxShadow:"var(--shadow-xl)", animation:"cvPopIn 180ms cubic-bezier(.2,.8,.2,1)"}}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 18px", borderBottom:"1px solid var(--c-line)", position:"sticky", top:0, background:"var(--c-card)"}}>
              <h3 style={{margin:0, fontSize:17}}>{win === "overview" ? "Overview" : "Recommendation"}</h3>
              <button onClick={() => setWin(null)} className="btn btn--icon btn--ghost" aria-label="Close"><Icon name="close" size={15} /></button>
            </div>
            <div style={{padding:"20px 22px"}}>
              {win === "overview" ? (
                <>
                  <div style={{display:"grid", gridTemplateColumns:"1fr", gap: 14, marginBottom: 18}}>
                    <BriefSection title="Background"          body={brief.background} />
                    <BriefSection title="Objective"           body={brief.objective} />
                    <BriefSection title="Audience"            body={brief.audience} />
                    <BriefSection title="Metrics that matter" body={brief.metrics} />
                  </div>
                  <div className="card card--inset" style={{padding: 18}}>
                    <div className="eyebrow" style={{marginBottom: 12}}>Deliverables · {brief.deliverables.length}</div>
                    <div style={{display:"flex", gap: 8, flexWrap:"wrap"}}>
                      {brief.deliverables.map((d, i) => <span key={i} className="pill" style={{height: 28, padding:"0 14px", fontSize:11.5}}>{d}</span>)}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{display:"grid", gridTemplateColumns:"1fr", gap: 14, marginBottom: 18}}>
                    <BriefSection title="Creative strategy" body={brief.strategy} />
                    <BriefSection title="Tone"              body={brief.tone} />
                    <BriefSection title="Direction"         body={brief.direction} />
                    <BriefSection title="Mandatories"       body={brief.mandatories} />
                  </div>
                  <div style={{background:"var(--pink-50)", border:"1px solid var(--pink-200)", borderRadius: 12, padding: 18, marginBottom: 18}}>
                    <div className="eyebrow eyebrow--pink" style={{marginBottom: 12}}>What this brief is NOT doing</div>
                    <p style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize: 16, lineHeight: 1.55, color:"var(--c-ink)", margin: 0}}>"{brief.notDoing}"</p>
                  </div>
                  <div style={{display:"grid", gridTemplateColumns:"1fr", gap: 14}}>
                    <div className="card card--inset" style={{padding: 18, borderLeft: "3px solid var(--yellow-500)"}}>
                      <div className="eyebrow eyebrow--yellow" style={{marginBottom: 12}}>Strategic assumptions</div>
                      <ul style={{margin:0, padding:0, listStyle:"none", display:"flex", flexDirection:"column", gap: 8}}>
                        {brief.assumptions.map((a, i) => <li key={i} style={{fontSize: 13.5, color:"var(--c-ink)", display:"flex", gap: 8, lineHeight: 1.5}}><span style={{color:"var(--yellow-700)", fontFamily:"var(--font-mono)"}}>~</span> {a}</li>)}
                      </ul>
                    </div>
                    <div className="card card--inset" style={{padding: 18, borderLeft: "3px solid var(--orange-500)"}}>
                      <div className="eyebrow" style={{color:"var(--orange-600)", marginBottom: 12}}>Production watchouts</div>
                      <ul style={{margin:0, padding:0, listStyle:"none", display:"flex", flexDirection:"column", gap: 8}}>
                        {brief.watchouts.map((w, i) => <li key={i} style={{fontSize: 13.5, color:"var(--c-ink)", display:"flex", gap: 8, lineHeight: 1.5}}><span style={{color:"var(--orange-600)", fontFamily:"var(--font-mono)"}}>!</span> {w}</li>)}
                      </ul>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function BriefSection({ title, body }) {
  return (
    <div className="card" style={{padding: 20}}>
      <div className="eyebrow" style={{marginBottom: 10}}>{title}</div>
      <p style={{fontSize: 14, lineHeight: 1.55, color:"var(--c-ink)", margin: 0}}>{body}</p>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* SPECIALISTS DIRECTORY (L2)                                        */

function SpecialistsDirectory({ go }) {
  const [dept, setDept] = useBrState("all");
  const [openId, setOpenId] = useBrState(null);
  const [query, setQuery] = useBrState("");
  const [sort, setSort] = useBrState("dept");
  const [view, setView] = useBrState("grid");

  const all = window.CI_AGENTS;
  const live = all.filter(a => a.status === "live").length;
  const soon = all.length - live;
  const pins = usePins();
  const pinned = all.filter(a => pins.has("specialists", a.id));

  /* Usage from produced outputs → "most used for this brand" */
  const usage = {};
  window.CI_OUTPUTS.forEach(o => { if (o.agentId) usage[o.agentId] = (usage[o.agentId] || 0) + 1; });
  const mostUsed = [...all].filter(a => usage[a.id]).sort((x, y) => usage[y.id] - usage[x.id]).slice(0, 4);

  const q = query.trim().toLowerCase();
  const matches = (a) => {
    if (dept !== "all" && a.dept !== dept) return false;
    if (!q) return true;
    const caps = (window.CI_DEPT_META[a.dept] || {}).capabilities || [];
    return [a.name, a.dept, a.code, a.job, ...caps].join(" ").toLowerCase().includes(q);
  };
  const filtered = all.filter(matches);
  const sortFns = {
    dept:    (x, y) => window.CI_DEPTS.indexOf(x.dept) - window.CI_DEPTS.indexOf(y.dept) || x.code.localeCompare(y.code),
    credits: (x, y) => x.cr - y.cr,
    used:    (x, y) => (usage[y.id] || 0) - (usage[x.id] || 0) || x.code.localeCompare(y.code),
  };
  const flat = [...filtered].sort(sortFns[sort] || sortFns.dept);
  const grouped = sort === "dept" && view === "grid" && !q;

  const Toggle = ({ val, set, options }) => (
    <div style={{display:"inline-flex", padding:3, gap:2, background:"var(--neutral-50)", borderRadius:9, border:"1px solid var(--c-line)"}}>
      {options.map(o => (
        <button key={o.v} onClick={() => set(o.v)}
          style={{
            border:"none", cursor:"pointer", borderRadius:7, padding:"5px 11px",
            fontFamily:"var(--font-mono)", fontSize:10.5, letterSpacing:"0.04em", textTransform:"uppercase",
            background: val === o.v ? "var(--c-card)" : "transparent",
            color: val === o.v ? "var(--c-ink)" : "var(--c-faint)",
            boxShadow: val === o.v ? "var(--shadow-sm)" : "none",
          }}>{o.l}</button>
      ))}
    </div>
  );

  return (
    <div style={{padding:"24px 36px 60px"}}>
      <PageHeader
        eyebrow="L2 · 33 senior specialists"
        title="The department, on shift."
        sub="Brandolph reads the brief. The specialists do the work. Each one routes to the model best suited to the job — visible, auditable, paid out of the same credit pool."
        right={<>
          <span style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--c-faint)"}}>{live} live · {soon} coming soon</span>
          <button className="btn btn--primary btn--sm" onClick={() => go && go("specialist-new")}><Icon name="plus" size={13} /> New specialist</button>
        </>}
      />

      {/* Pinned specialists */}
      {pinned.length > 0 && !q && (
        <section style={{marginBottom: 26}}>
          <div className="eyebrow eyebrow--yellow" style={{marginBottom: 10}}>★ Pinned · your preferred specialists</div>
          <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))", gap: 10}}>
            {pinned.map(a => (
              <button key={a.id} onClick={() => setOpenId(a.id)} className="card"
                style={{textAlign:"left", cursor:"pointer", padding:"12px 14px", display:"flex", alignItems:"center", gap:10,
                  borderLeft:`3px solid ${window.CI_DEPT_COLORS[a.dept] || "var(--neutral-400)"}`}}>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontSize:13.5, fontWeight:600, color:"var(--c-ink)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{a.name}</div>
                  <div className="eyebrow">{a.dept}</div>
                </div>
                <PinButton kind="specialists" id={a.id} />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Most used for this brand */}
      {mostUsed.length > 0 && !q && (
        <section style={{marginBottom: 26}}>
          <div className="eyebrow" style={{marginBottom: 10}}>Most used for Vinilo</div>
          <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))", gap: 10}}>
            {mostUsed.map(a => (
              <button key={a.id} onClick={() => setOpenId(a.id)} className="card"
                style={{textAlign:"left", cursor:"pointer", padding:"12px 14px", display:"flex", alignItems:"center", gap:10,
                  borderLeft:`3px solid ${window.CI_DEPT_COLORS[a.dept] || "var(--neutral-400)"}`}}>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontSize:13.5, fontWeight:600, color:"var(--c-ink)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{a.name}</div>
                  <div className="eyebrow">{a.dept}</div>
                </div>
                <span className="credit credit--pending" style={{fontSize:11}}>{usage[a.id]}×</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Controls — search · sort · view */}
      <div style={{display:"flex", gap: 10, alignItems:"center", marginBottom: 16, flexWrap:"wrap"}}>
        <div style={{display:"flex", alignItems:"center", gap:8, flex:"1 1 240px", minWidth: 200, height:36, padding:"0 12px",
          background:"var(--c-card)", border:"1px solid var(--c-line)", borderRadius:10}}>
          <Icon name="search" size={15} />
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search specialists, departments, capabilities…"
            style={{flex:1, border:0, outline:0, background:"transparent", color:"var(--c-ink)", fontFamily:"inherit", fontSize:13.5, height:"100%"}} />
          {query && <button onClick={() => setQuery("")} style={{border:0, background:"transparent", cursor:"pointer", color:"var(--c-faint)", padding:0}}><Icon name="close" size={14} /></button>}
        </div>
        <Toggle val={sort} set={setSort} options={[{v:"dept",l:"Department"},{v:"credits",l:"Credits"},{v:"used",l:"Most used"}]} />
        <Toggle val={view} set={setView} options={[{v:"grid",l:"Grid"},{v:"list",l:"List"}]} />
      </div>

      {/* Department filter */}
      <div style={{display:"flex", gap: 6, marginBottom: 24, flexWrap:"wrap"}}>
        {["all", ...window.CI_DEPTS].map(d => (
          <button key={d} onClick={() => setDept(d)}
            className={"pill" + (dept === d ? " pill--dark" : "")}
            style={{height: 30, padding:"0 14px", cursor:"pointer", fontSize: 11}}>
            {d === "all" ? "All departments" : d}
            {d !== "all" && <span style={{marginLeft: 6, opacity: 0.6}}>· {all.filter(a => a.dept === d).length}</span>}
          </button>
        ))}
      </div>

      {q && <div className="eyebrow" style={{marginBottom: 14}}>{flat.length} {flat.length === 1 ? "result" : "results"}</div>}

      {/* Results */}
      {grouped ? (
        (dept === "all" ? window.CI_DEPTS : [dept]).map(d => {
          const list = filtered.filter(a => a.dept === d);
          if (!list.length) return null;
          return (
            <section key={d} style={{marginBottom: 32}}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom: 14}}>
                <h3 style={{margin: 0, fontSize: 17, letterSpacing:"-0.005em"}}>{d}</h3>
                <span style={{fontFamily:"var(--font-mono)", fontSize: 10.5, color:"var(--c-faint)", letterSpacing:"0.08em", textTransform:"uppercase"}}>{list.length} specialists · {list.filter(a => a.status === "live").length} live</span>
              </div>
              <div className="stagger" style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))", gap: 12}}>
                {list.map(a => <AgentCard key={a.id} agentId={a.id} showCaps onClick={() => setOpenId(a.id)} />)}
              </div>
            </section>
          );
        })
      ) : view === "list" ? (
        <div className="card stagger" style={{padding: 0, overflow:"hidden"}}>
          {flat.map((a, i) => (
            <SpecialistRow key={a.id} a={a} usage={usage[a.id] || 0} last={i === flat.length - 1} onClick={() => setOpenId(a.id)} />
          ))}
          {!flat.length && <div style={{padding: 28, textAlign:"center", color:"var(--c-faint)", fontSize:13}}>No specialists match “{query}”.</div>}
        </div>
      ) : (
        <div className="stagger" style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))", gap: 12}}>
          {flat.map(a => <AgentCard key={a.id} agentId={a.id} showCaps onClick={() => setOpenId(a.id)} />)}
          {!flat.length && <div style={{gridColumn:"1/-1", padding: 28, textAlign:"center", color:"var(--c-faint)", fontSize:13}}>No specialists match “{query}”.</div>}
        </div>
      )}

      <SpecialistDrawer open={!!openId} agent={openId ? window.CI_AGENTS.find(a => a.id === openId) : null} onClose={() => setOpenId(null)} />
    </div>
  );
}

/* Compact list row (List view) */
function SpecialistRow({ a, usage, last, onClick }) {
  const isTeam = useIsTeam();
  const accent = isTeam ? window.CI_MODELS[a.model].color : (window.CI_DEPT_COLORS[a.dept] || "var(--neutral-400)");
  const soon = a.status === "soon";
  return (
    <div onClick={onClick}
      style={{display:"flex", alignItems:"center", gap:14, padding:"12px 16px", cursor:"pointer",
        borderBottom: last ? "none" : "1px solid var(--c-line)", borderLeft:`3px solid ${accent}`, opacity: soon ? 0.62 : 1}}
      onMouseEnter={e => e.currentTarget.style.background = "var(--neutral-50)"}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
      <span style={{fontFamily:"var(--font-mono)", fontSize:10.5, color:"var(--c-faint)", minWidth:48}}>{a.code}</span>
      <div style={{flex:"0 0 200px", minWidth:0}}>
        <div style={{fontSize:13.5, fontWeight:600, color:"var(--c-ink)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{a.name}</div>
        <div className="eyebrow">{a.dept}</div>
      </div>
      <div style={{flex:1, minWidth:0, fontSize:12.5, color:"var(--c-dim)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{a.job}</div>
      {isTeam && <ModelChip modelKey={a.model} />}
      {usage > 0 && <span style={{fontFamily:"var(--font-mono)", fontSize:10.5, color:"var(--c-faint)"}}>{usage}×</span>}
      <span className="credit credit--pending" style={{fontSize:11}}>{a.cr} cr</span>
      {soon ? <span className="pill" style={{height:18, padding:"0 8px", fontSize:9.5}}>Soon</span> : <Icon name="arrow" size={14} />}
    </div>
  );
}

/* Resolve a specialist's runnable spec: department template + per-id override. */
function specialistSpec(a) {
  const base = window.CI_DEPT_SPECS[a.dept] || {};
  const over = (window.CI_SPECIALIST_SPECS || {})[a.id] || {};
  return { ...base, ...over };
}

/* Compose the effective system prompt from the four layers in the plan:
   platform preamble + brand/BIO context + specialist spec + task context.
   Model routing is internal — only included on the team/admin side. */
function composeSpecialistPrompt(a, isTeam, specArg) {
  const brand = window.CI_BRAND;
  const spec = specArg || specialistSpec(a);
  const meta = window.CI_DEPT_META[a.dept] || {};
  const model = window.CI_MODELS[a.model];
  const refusals = [...(window.CI_BRAND_REFUSALS || []), ...(spec.refusals || [])];
  const L = [];
  L.push("# PLATFORM");
  L.push(`You are ${a.name} (${a.code}), an L2 specialist inside CaastorOS. Brandolph (L1) routed this brief to you. You do not chat — you return a deliverable a CMO would approve without a second pass.`);
  L.push("");
  L.push("# BRAND CONTEXT  ·  from the Brand Intelligence Object");
  L.push(`Brand: ${brand.name} — ${brand.tagline}`);
  L.push(`BIO completeness: ${brand.bioCompleteness}%. The BIO is canon; read it before responding.`);
  L.push("Refusals (hard rules):");
  refusals.forEach(r => L.push(`  • ${r}`));
  L.push("");
  L.push("# SPECIALIST SPEC");
  L.push(`Role: ${spec.role || a.job}`);
  if (spec.objective) L.push(`Objective: ${spec.objective}`);
  if (spec.method) { L.push("Method:"); spec.method.forEach((s, i) => L.push(`  ${i + 1}. ${s}`)); }
  if (spec.outputContract) L.push(`Output contract: ${spec.outputContract}`);
  if (spec.voice) L.push(`Voice: ${spec.voice}`);
  if (meta.capabilities) L.push(`Capabilities: ${meta.capabilities.join(", ")}`);
  if (spec.tools) L.push(`Tools: ${spec.tools.join(", ")}`);
  if (isTeam) L.push(`Model routing: ${model ? model.label : a.model} (primary)`);
  L.push("");
  L.push("# TASK");
  L.push("{ the sharpened brief + relevant prior outputs / uploads for this run are injected here }");
  return L.join("\n");
}

function SpecialistDrawer({ open, agent, onClose }) {
  const [showPrompt, setShowPrompt] = useBrState(false);
  if (!agent) return null;
  const isTeam = useIsTeam();
  const m = window.CI_MODELS[agent.model];
  const accent = isTeam ? m.color : (window.CI_DEPT_COLORS[agent.dept] || "var(--neutral-300)");
  const meta = window.CI_DEPT_META[agent.dept] || {};
  const spec = specialistSpec(agent);
  const refusals = [...(window.CI_BRAND_REFUSALS || []), ...(spec.refusals || [])];
  const tierLabel = (window.CI_TIERS || {})[meta.tierFrom] || meta.tierFrom;
  return (
    <Drawer open={open} onClose={onClose} title={agent.name} eyebrow={`${agent.code} · ${agent.dept}`}
      footer={<>
        <PinButton kind="specialists" id={agent.id} size={18} style={{marginRight:"auto"}} />
        <button className="btn btn--ghost" onClick={onClose}>Close</button>
        <button className="btn btn--primary">Add to next assembly · {agent.cr} cr</button>
      </>}>
      <div style={{ background: accent, height: 6, borderRadius: 4, marginBottom: 18 }} />

      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 18}}>
        {isTeam ? <ModelChip modelKey={agent.model} /> : (
          <span className="eyebrow" style={{color:"var(--c-dim)"}}>L2 · {agent.dept}</span>
        )}
        <span className="credit credit--pending" style={{fontSize: 13}}>{agent.cr} cr · per run</span>
      </div>

      <div className="eyebrow" style={{marginBottom: 8}}>The job</div>
      <p style={{fontSize:14.5, color:"var(--c-ink)", lineHeight: 1.55, marginBottom: 18}}>{agent.job}</p>

      {meta.capabilities && (
        <>
          <div className="eyebrow" style={{marginBottom: 8}}>Capabilities</div>
          <div style={{display:"flex", flexWrap:"wrap", gap:6, marginBottom: 18}}>
            {meta.capabilities.map(c => (
              <span key={c} style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--c-dim)",
                border:"1px solid var(--c-line)", borderRadius:7, padding:"3px 9px"}}>{c}</span>
            ))}
          </div>
        </>
      )}

      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom: 18}}>
        {meta.bestFor && (
          <div className="card card--inset" style={{padding:"12px 14px", gridColumn:"1/-1"}}>
            <div className="eyebrow" style={{marginBottom:4}}>Brandolph picks this for</div>
            <div style={{fontSize:13.5, color:"var(--c-ink)", lineHeight:1.45}}>{meta.bestFor}</div>
          </div>
        )}
        <div className="card card--inset" style={{padding:"12px 14px"}}>
          <div className="eyebrow" style={{marginBottom:4}}>Turnaround</div>
          <div style={{fontSize:14, color:"var(--c-ink)"}}>{meta.turnaround || "—"}</div>
        </div>
        <div className="card card--inset" style={{padding:"12px 14px"}}>
          <div className="eyebrow" style={{marginBottom:4}}>Unlocks from</div>
          <div style={{fontSize:14, color:"var(--c-ink)"}}>Tier {meta.tierFrom} · {tierLabel}</div>
        </div>
      </div>

      {/* Refusals — visible to everyone; the "shape not produce" guarantee */}
      {refusals.length > 0 && (
        <>
          <div className="eyebrow" style={{marginBottom: 8}}>Refusals · won't do</div>
          <div className="card card--inset" style={{padding:"12px 14px", marginBottom: 18, display:"flex", flexDirection:"column", gap:7}}>
            {refusals.slice(0, 5).map((r, i) => (
              <div key={i} style={{display:"flex", gap:8, fontSize:12.5, lineHeight:1.45, color:"var(--c-dim)"}}>
                <span style={{color:"var(--pink-500)", fontFamily:"var(--font-mono)"}}>✕</span>
                <span>{r}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* How Brandolph briefs this specialist — composed prompt (transparency). */}
      <div className="eyebrow" style={{marginBottom: 8, display:"flex", justifyContent:"space-between", alignItems:"center"}}>
        <span>How Brandolph briefs this specialist</span>
        <button className="btn btn--link" style={{fontSize:11}} onClick={() => setShowPrompt(p => !p)}>
          {showPrompt ? "Hide" : "View composed prompt"}
        </button>
      </div>
      <div className="card card--inset" style={{padding: 14, marginBottom: 22}}>
        {showPrompt ? (
          <pre style={{
            margin: 0, whiteSpace:"pre-wrap", wordBreak:"break-word",
            fontFamily:"var(--font-mono)", fontSize: 11.5, lineHeight: 1.55, color:"var(--c-ink)",
            maxHeight: 340, overflowY:"auto",
          }}>{composeSpecialistPrompt(agent, isTeam)}</pre>
        ) : (
          <p style={{fontSize: 12.5, color:"var(--c-dim)", lineHeight: 1.55, margin: 0, fontFamily:"var(--font-mono)"}}>
            {agent.name} reads the BIO before responding, follows {spec.role ? "their method as " + spec.role : "their method"}, and refuses anything that breaks the brand rules. {spec.objective || ""}
          </p>
        )}
        <div style={{marginTop:10, paddingTop:10, borderTop:"1px dashed var(--c-line-2)", fontFamily:"var(--font-mono)", fontSize:10, color:"var(--c-faint)", letterSpacing:"0.04em"}}>
          Composed from PLATFORM + BIO + SPEC + TASK{isTeam && m ? ` · routed to ${m.label}` : ""}
        </div>
      </div>

      <div className="eyebrow" style={{marginBottom: 8}}>Recent usage · 30 days</div>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap: 10, marginBottom: 22}}>
        {[
          { label:"Jobs run",        v:"14" },
          { label:"Credits spent",   v: agent.cr * 14 },
          { label:"Success rate",    v:"94%" },
        ].map((s, i) => (
          <div key={i} className="card card--inset" style={{padding:"12px 14px"}}>
            <div className="eyebrow" style={{marginBottom: 4}}>{s.label}</div>
            <div style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize: 22, color:"var(--c-ink)"}}>{s.v}</div>
          </div>
        ))}
      </div>

      <div className="eyebrow" style={{marginBottom: 8}}>Example outputs · for Vinilo</div>
      <div style={{display:"flex", flexDirection:"column", gap: 12}}>
        {window.CI_OUTPUTS.filter(o => o.agentId === agent.id).slice(0,2).map(o => <OutputCard key={o.id} output={o} />)}
        {window.CI_OUTPUTS.filter(o => o.agentId === agent.id).length === 0 && (
          <div className="card card--inset" style={{padding: 18, textAlign:"center", color:"var(--c-faint)", fontSize: 13}}>
            <em className="b-voice" style={{background:"none", fontStyle:"italic"}}>You haven't used this specialist yet.</em>
          </div>
        )}
      </div>
    </Drawer>
  );
}


/* ════════════════════════════════════════════════════════════════ */
/* CANVAS (Phase 3 placeholder, but designed)                        */

const CANVAS_NODES = [
  { id:"bio",      x:40,   y:60,  w:260, kind:"bio",       title:"Brand Intelligence Object",        sub:"BIO · 91%" },
  { id:"brief",    x:360,  y:50,  w:260, kind:"brief",     title:"Pricing relaunch · brief",         sub:"L1 · Brandolph" },
  { id:"t1",       x:680,  y:20,  w:240, kind:"territory", title:"Territory · 'It costs the Tuesday'", sub:"L2-06 · Territory Mapper" },
  { id:"t2",       x:680,  y:130, w:240, kind:"territory", title:"Territory · '1-in-12'",            sub:"L2-06 · Territory Mapper" },
  { id:"t3",       x:680,  y:240, w:240, kind:"territory", title:"Territory · 'Don't unsubscribe'",  sub:"L2-06 · Territory Mapper" },
  { id:"copy1",    x:960,  y:50,  w:260, kind:"copy",      title:"Pricing page hero",                sub:"L2-12 · Conversion Copy" },
  { id:"copy2",    x:960,  y:170, w:260, kind:"copy",      title:"Email sequence ×3",                sub:"L2-13 · Email Sequence" },
  { id:"copy3",    x:960,  y:290, w:260, kind:"copy",      title:"Subject lines ×6",                 sub:"L2-14 · Subject Lines" },
  { id:"asset",    x:1260, y:170, w:260, kind:"asset",     title:"Hero KV draft",                    sub:"L2-20 · Hero KV" },
  { id:"feedback", x:400,  y:330, w:260, kind:"feedback",  title:"Email 2 reads dutiful",            sub:"Brandolph · feedback" },
];

const CANVAS_EDGES = [
  { from:"bio",   to:"brief", fromSide:"right", toSide:"left" },
  { from:"brief", to:"t1",    fromSide:"right", toSide:"left" },
  { from:"brief", to:"t2",    fromSide:"right", toSide:"left" },
  { from:"brief", to:"t3",    fromSide:"right", toSide:"left" },
  { from:"t1",    to:"copy1", fromSide:"right", toSide:"left" },
  { from:"t2",    to:"copy2", fromSide:"right", toSide:"left" },
  { from:"t3",    to:"copy3", fromSide:"right", toSide:"left" },
  { from:"copy2", to:"asset", fromSide:"right", toSide:"left" },
  { from:"brief", to:"feedback", fromSide:"bottom", toSide:"top", dashed:true },
];

const CANVAS_COLORS = {
  bio:"var(--yellow-500)", brief:"var(--neutral-900)", territory:"var(--purple-500)",
  specialist:"var(--purple-500)", copy:"var(--green-600)", asset:"var(--pink-500)",
  qa:"var(--blue-600)", upload:"var(--neutral-400)", feedback:"var(--orange-500)",
};

const SCALE_MIN = 0.4, SCALE_MAX = 2;

/* Reusable pan/zoom/drag canvas. Renders nodeData + edges; clicking a
   node (without dragging) fires onNodeClick(node). */
function InteractiveCanvas({ nodeData, edges, onNodeClick, renderNode, height = "calc(100vh - 56px)", controls = true, helper, exportName = "canvas", toolbarExtra }) {
  const [nodes, setNodes] = React.useState(() => nodeData.map(n => ({ ...n })));
  const [view, setView]   = React.useState({ x: 24, y: 28, scale: 1 });
  const [sizes, setSizes] = React.useState({});      // id -> measured height
  const [hovered, setHovered] = React.useState(null);
  const [panning, setPanning] = React.useState(false);

  /* Merge external nodeData changes (added/removed nodes) while keeping
     positions of nodes the user has already dragged. */
  React.useEffect(() => {
    setNodes(prev => {
      const byId = new Map(prev.map(n => [n.id, n]));
      return nodeData.map(n => {
        const ex = byId.get(n.id);
        return ex ? { ...n, x: ex.x, y: ex.y } : { ...n };
      });
    });
  }, [nodeData]);

  const wrapRef  = React.useRef(null);
  const nodeRefs = React.useRef({});
  const drag     = React.useRef(null);

  /* Measure node heights once so edge anchors land on the true centre. */
  React.useEffect(() => {
    const next = {};
    Object.entries(nodeRefs.current).forEach(([id, el]) => { if (el) next[id] = el.offsetHeight; });
    setSizes(next);
  }, []);

  /* Native wheel listener (passive:false so we can preventDefault). */
  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      setView(v => {
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        const scale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, v.scale * factor));
        const k = scale / v.scale;
        return { scale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const heightOf = (id) => sizes[id] || 66;
  const nodeById = (id) => nodes.find(n => n.id === id);

  const anchor = (n, side) => {
    const h = heightOf(n.id);
    if (side === "right")  return [n.x + n.w, n.y + h / 2];
    if (side === "left")   return [n.x,       n.y + h / 2];
    if (side === "top")    return [n.x + n.w / 2, n.y];
    if (side === "bottom") return [n.x + n.w / 2, n.y + h];
    return [n.x, n.y];
  };

  const edgePath = (e) => {
    const a = nodeById(e.from), b = nodeById(e.to);
    if (!a || !b) return "";
    const [sx, sy] = anchor(a, e.fromSide);
    const [tx, ty] = anchor(b, e.toSide);
    if (e.fromSide === "right" || e.fromSide === "left") {
      const dx = (tx - sx) * 0.45;
      return `M${sx},${sy} C${sx + dx},${sy} ${tx - dx},${ty} ${tx},${ty}`;
    }
    const dy = (ty - sy) * 0.5;
    return `M${sx},${sy} C${sx},${sy + dy} ${tx},${ty - dy} ${tx},${ty}`;
  };

  /* ── Pointer interactions ─────────────────────────────────────── */
  const startPan = (e) => {
    if (e.button !== 0) return;
    drag.current = { mode:"pan", sx:e.clientX, sy:e.clientY, ox:view.x, oy:view.y, moved:false };
    setPanning(true);
    wrapRef.current.setPointerCapture?.(e.pointerId);
  };
  const startNode = (e, n) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    drag.current = { mode:"node", id:n.id, sx:e.clientX, sy:e.clientY, ox:n.x, oy:n.y, scale:view.scale, moved:false };
    wrapRef.current.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (d.mode === "pan") {
      setView(v => ({ ...v, x: d.ox + dx, y: d.oy + dy }));
    } else {
      setNodes(ns => ns.map(n => n.id === d.id ? { ...n, x: d.ox + dx / d.scale, y: d.oy + dy / d.scale } : n));
    }
  };
  const endDrag = (e) => {
    const d = drag.current;
    if (d) wrapRef.current.releasePointerCapture?.(e.pointerId);
    /* A node press that didn't move is a click → open its detail. */
    if (d && d.mode === "node" && !d.moved && onNodeClick) {
      const rect = nodeRefs.current[d.id] ? nodeRefs.current[d.id].getBoundingClientRect() : null;
      onNodeClick(nodeById(d.id), rect);
    }
    drag.current = null;
    setPanning(false);
  };

  const fitView = () => {
    const rect = wrapRef.current.getBoundingClientRect();
    const pad = 64;
    const minX = Math.min(...nodes.map(n => n.x));
    const minY = Math.min(...nodes.map(n => n.y));
    const maxX = Math.max(...nodes.map(n => n.x + n.w));
    const maxY = Math.max(...nodes.map(n => n.y + heightOf(n.id)));
    const w = maxX - minX, h = maxY - minY;
    const scale = Math.min(SCALE_MAX, Math.max(SCALE_MIN,
      Math.min((rect.width - pad * 2) / w, (rect.height - pad * 2) / h)));
    setView({
      scale,
      x: (rect.width  - w * scale) / 2 - minX * scale,
      y: (rect.height - h * scale) / 2 - minY * scale,
    });
  };

  const exportLayout = () => {
    const data = JSON.stringify({ nodes, edges }, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type:"application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = exportName + ".json"; a.click();
    URL.revokeObjectURL(url);
  };

  const stop = (e) => e.stopPropagation();

  return (
    <div
      ref={wrapRef}
      className="cv-root"
      onPointerDown={startPan}
      onPointerMove={onMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{
        position:"relative", height, overflow:"hidden", borderRadius: 14,
        cursor: panning ? "grabbing" : "grab", touchAction:"none",
      }}
    >
      {/* Dot grid — pans + scales with the view */}
      <div style={{
        position:"absolute", inset: 0, background:"var(--c-bg)",
        backgroundImage:"radial-gradient(circle, var(--neutral-200) 1px, transparent 1px)",
        backgroundSize:`${24 * view.scale}px ${24 * view.scale}px`,
        backgroundPosition:`${view.x}px ${view.y}px`,
      }} />

      {/* Floating controls */}
      <div onPointerDown={stop} style={{position:"absolute", top: 16, right: 18, zIndex: 5, display:"flex", gap: 8, alignItems:"center"}}>
        {toolbarExtra}
        <span style={{fontFamily:"var(--font-mono)", fontSize: 10, color:"var(--c-faint)", letterSpacing:"0.06em"}}>{Math.round(view.scale * 100)}%</span>
        <button className="btn btn--ghost btn--sm" onClick={fitView}>Fit view</button>
        <button className="btn btn--ghost btn--sm" onClick={exportLayout}>Export</button>
      </div>

      {/* Stage — everything in canvas-space, transformed as one */}
      <div className="cv-stage" style={{
        position:"absolute", top: 0, left: 0, zIndex: 2,
        transform:`translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
        transformOrigin:"0 0",
      }}>
        <svg style={{position:"absolute", top: 0, left: 0, width: 2000, height: 900, overflow:"visible", pointerEvents:"none"}}>
          <defs>
            <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--neutral-400)" />
            </marker>
            <marker id="arr-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--yellow-600)" />
            </marker>
          </defs>
          {edges.map((e, i) => {
            const on = hovered && (e.from === hovered || e.to === hovered);
            const dim = hovered && !on;
            return (
              <path
                key={i}
                className={"cv-edge" + (e.dashed ? " cv-edge--dashed" : "")}
                d={edgePath(e)}
                pathLength={e.dashed ? undefined : 1}
                fill="none"
                stroke={on ? "var(--yellow-600)" : "var(--neutral-400)"}
                strokeWidth={on ? 2.2 : 1.4}
                strokeDasharray={e.dashed ? "6 5" : undefined}
                markerEnd={on ? "url(#arr-on)" : "url(#arr)"}
                style={{ opacity: dim ? 0.3 : 1, transition:"stroke 140ms ease, stroke-width 140ms ease, opacity 140ms ease", animationDelay:`${260 + i * 60}ms` }}
              />
            );
          })}
        </svg>

        {nodes.map((n, i) => (
          <CanvasNode
            key={n.id}
            node={n}
            index={i}
            color={CANVAS_COLORS[n.kind] || CANVAS_COLORS.copy}
            refCb={(el) => { nodeRefs.current[n.id] = el; }}
            active={hovered === n.id}
            dim={hovered && hovered !== n.id}
            dragging={drag.current && drag.current.mode === "node" && drag.current.id === n.id}
            onPointerDown={(e) => startNode(e, n)}
            onEnter={() => setHovered(n.id)}
            onLeave={() => setHovered(h => (h === n.id ? null : h))}
          >
            {renderNode ? renderNode(n, { active: hovered === n.id, dragging: drag.current && drag.current.id === n.id }) : null}
          </CanvasNode>
        ))}
      </div>

      {/* Bottom helper */}
      {helper !== false && (
        <div onPointerDown={stop} style={{position:"absolute", bottom: 18, left: "50%", transform:"translateX(-50%)", zIndex: 5}}>
          <div className="card" style={{padding:"9px 16px", display:"flex", alignItems:"center", gap: 12}}>
            <BrandolphDot />
            <span style={{fontSize: 12.5, color:"var(--c-dim)"}}>
              {helper || <>Drag to pan · scroll to zoom · <strong style={{color:"var(--c-ink)", fontWeight:600}}>click any node</strong> for the detail and rationale.</>}
            </span>
          </div>
        </div>
      )}

      <style>{`
        .cv-node { animation: cvNodeIn 420ms cubic-bezier(.2,.8,.2,1) both; }
        @keyframes cvNodeIn { from { opacity: 0; transform: scale(.94) translateY(6px); } to { opacity: 1; transform: none; } }
        .cv-edge { stroke-dasharray: 1; stroke-dashoffset: 1; animation: cvDraw 700ms ease forwards; }
        .cv-edge--dashed { stroke-dasharray: 6 5; stroke-dashoffset: 0; animation: cvFade 500ms ease both; }
        @keyframes cvDraw { to { stroke-dashoffset: 0; } }
        @keyframes cvFade { from { opacity: 0; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .cv-node { animation: none !important; }
          .cv-edge, .cv-edge--dashed { animation: none !important; stroke-dashoffset: 0 !important; }
        }
      `}</style>
    </div>
  );
}

/* Standalone demo canvas (kept for deep-links; no longer a nav item). */
function CanvasView() {
  return <InteractiveCanvas nodeData={CANVAS_NODES} edges={CANVAS_EDGES} exportName="vinilo-canvas" />;
}

/* Build a brief's logic graph: BIO → brief → specialist → output(s). */
function buildBriefGraph(brief, outputs) {
  const brand = window.CI_BRAND;
  const rowH = 104, gapBlock = 26;
  const specIds = [...new Set(outputs.map(o => o.agentId).filter(Boolean))];
  const useSpecs = specIds.length ? specIds : (brief.agents || []);
  const kindFor = (o) => o.kind === "upload" ? "upload" : o.kind === "qa" ? "qa" : (o.kind === "image" ? "asset" : "copy");

  const nodes = [], edges = [];
  let y = 40;
  useSpecs.forEach((sid) => {
    const a = window.CI_AGENTS.find(x => x.id === sid);
    const outs = outputs.filter(o => o.agentId === sid);
    const blockStart = y;
    const n = Math.max(1, outs.length);
    nodes.push({ id:"spec-"+sid, x:700, y: blockStart + (n * rowH) / 2 - rowH / 2, w:240, kind:"specialist",
      title: a ? a.name : sid, sub: `${a ? a.code : ""}${a ? " · " + a.dept : ""}`, ref:{ type:"specialist", id:sid } });
    edges.push({ from:"brief", to:"spec-"+sid, fromSide:"right", toSide:"left" });
    outs.forEach((o, j) => {
      const oy = blockStart + j * rowH;
      nodes.push({ id:"out-"+o.id, x:1040, y: oy, w:260, kind: kindFor(o), title:o.type, sub:o.meta, ref:{ type:"output", id:o.id } });
      edges.push({ from:"spec-"+sid, to:"out-"+o.id, fromSide:"right", toSide:"left" });
    });
    y = blockStart + n * rowH + gapBlock;
  });

  const ys = nodes.map(n => n.y);
  const midY = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 120;
  nodes.unshift({ id:"brief", x:360, y:midY, w:260, kind:"brief", title:brief.title, sub:"L1 · Brandolph", ref:{ type:"brief" } });
  nodes.unshift({ id:"bio", x:40, y:midY, w:260, kind:"bio", title:"Brand Intelligence Object", sub:`BIO · ${brand.bioCompleteness}%`, ref:{ type:"bio" } });
  edges.unshift({ from:"bio", to:"brief", fromSide:"right", toSide:"left" });
  return { nodes, edges };
}

/* Why a specialist made its creative choice — explicit field or derived. */
function outputRationale(o, specialist) {
  if (o && o.rationale) return o.rationale;
  const spec = specialist ? specialistSpec(specialist) : {};
  const who = specialist ? specialist.name : "The specialist";
  if (spec.voice) return `${who} wrote to the brand voice — ${spec.voice.toLowerCase()} — and shaped it to: ${spec.outputContract || "the brief"}.`;
  return `${who} read the BIO first, then ${spec.objective ? spec.objective.toLowerCase() : "produced the deliverable to the brief"}`;
}

/* Per-brief Delivery view: the canvas + a node-detail drawer. */
function BriefDelivery({ brief, outputs }) {
  const [sel, setSel] = useBrState(null);
  const graph = React.useMemo(() => buildBriefGraph(brief, outputs), [brief.id]);

  const open = (node) => { if (node && node.ref) setSel(node.ref); };
  const ref = sel || {};
  const output = ref.type === "output" ? outputs.find(o => o.id === ref.id) : null;
  const specialist =
    ref.type === "specialist" ? window.CI_AGENTS.find(a => a.id === ref.id)
    : output ? window.CI_AGENTS.find(a => a.id === output.agentId) : null;

  let title = "", eyebrow = "", body = null;
  if (ref.type === "bio") {
    eyebrow = "Source · the canon"; title = "Brand Intelligence Object";
    body = <p style={{fontSize:14.5, color:"var(--c-ink)", lineHeight:1.55}}>Everything downstream is judged against the BIO. <em className="b-voice">{window.CI_BRAND.tagline}</em> · {window.CI_BRAND.bioCompleteness}% complete.</p>;
  } else if (ref.type === "brief") {
    eyebrow = "L1 · Brandolph"; title = brief.title;
    body = <><p style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize:17, lineHeight:1.5, color:"var(--c-ink)", marginBottom:12}}>"{brief.smp}"</p><p style={{fontSize:13.5, color:"var(--c-dim)", lineHeight:1.5}}>{brief.objective}</p></>;
  } else if (ref.type === "specialist" && specialist) {
    const spec = specialistSpec(specialist);
    eyebrow = `${specialist.code} · ${specialist.dept}`; title = specialist.name;
    body = <>
      <p style={{fontSize:14, color:"var(--c-ink)", lineHeight:1.5, marginBottom:14}}>{specialist.job}</p>
      <div className="eyebrow" style={{marginBottom:6}}>Why Brandolph routed this here</div>
      <p style={{fontSize:13.5, color:"var(--c-dim)", lineHeight:1.5}}>{spec.objective || "Best fit for this part of the brief."}</p>
    </>;
  } else if (output) {
    eyebrow = `${output.type}${specialist ? " · " + specialist.name : ""}`; title = "Output";
    body = <>
      {output.status && <div style={{marginBottom:12}}><StatusPill status={output.status} /></div>}
      <p style={{fontFamily:"Georgia, 'Times New Roman', serif", fontStyle:"italic", fontSize:16, lineHeight:1.55, color:"var(--c-ink)", marginBottom:14}}>"{output.body}"</p>
      <div style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--c-faint)", marginBottom:18}}>{output.meta}</div>
      <div className="card card--inset" style={{padding:"14px 16px", borderLeft:"3px solid var(--yellow-500)"}}>
        <div className="eyebrow eyebrow--yellow" style={{marginBottom:6}}>Why this creative choice</div>
        <p style={{fontSize:13.5, color:"var(--c-ink)", lineHeight:1.5, margin:0}}>{outputRationale(output, specialist)}</p>
      </div>
    </>;
  }

  return (
    <div>
      <InteractiveCanvas
        key={brief.id}
        nodeData={graph.nodes}
        edges={graph.edges}
        onNodeClick={open}
        height="calc(100vh - 250px)"
        exportName={brief.id}
      />
      <Drawer open={!!sel} onClose={() => setSel(null)} title={title} eyebrow={eyebrow} width={440}>
        {body}
      </Drawer>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* BRIEF BOARD — the whole brief as a Miro-style canvas workspace.    */
/* Floating launcher + toolbar; Ask-Brandolph, specialists, results   */
/* as draggable nodes; +Add to drop another ask or specialist.        */

const BOARD_LAUNCH = [
  { id:"home",        icon:"sparkles", label:"Create" },
  { id:"briefs",      icon:"brief",    label:"Briefs" },
  { id:"library",     icon:"files",    label:"Library" },
  { id:"specialists", icon:"team",     label:"Specialists" },
  { id:"credits",     icon:"credit",   label:"Credits" },
  { id:"settings",    icon:"settings", label:"Settings" },
];

function boardReply(text) {
  const m = text.toLowerCase();
  if (/why|reason|rational/.test(m)) return "Because the BIO frames price as cost-of-pause — the work leans on the decision to slow down, not the discount.";
  if (/change|revise|tweak|edit/.test(m)) return "On it. I'll route that back to the specialist and hold the QA gate until it clears the brand rules.";
  if (/who|specialist|which/.test(m)) return "For this I'd add Conversion Copy and Brand Consistency QA — smallest crew that earns the change.";
  return "Heard. I'll sharpen that into a sub-brief and assemble the right specialist — give me a beat.";
}

function BriefBoard({ id, go }) {
  const brief = window.CI_BRIEFS.find(b => b.id === id) || window.CI_BRIEFS[0];
  const outputs = window.CI_OUTPUTS.filter(o => o.briefId === brief.id);
  const base = React.useMemo(() => buildBriefGraph(brief, outputs), [brief.id]);

  const [extraNodes, setExtraNodes] = useBrState([]);
  const [extraEdges, setExtraEdges] = useBrState([]);
  const [pop, setPop] = useBrState(null);   // { ref, rect } — floating detail near the node
  const [addOpen, setAddOpen] = useBrState(false);
  const [connectFrom, setConnectFrom] = useBrState(null);
  const [win, setWin] = useBrState(null);   // "overview" | "recommendation" | null — small windows
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { setWin(null); setPop(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [panel, setPanel] = useBrState(null);   // "brief" | "ask" | null
  const [ask, setAsk] = useBrState("");
  const seq = React.useRef(0);

  const allNodes = React.useMemo(() => [...base.nodes, ...extraNodes], [base, extraNodes]);
  const allEdges = React.useMemo(() => [...base.edges, ...extraEdges], [base, extraEdges]);
  const nodeName = (nid) => { const n = allNodes.find(x => x.id === nid); return n ? n.title : nid; };

  const addSpecialist = (a) => {
    const nid = "specx-" + a.id + "-" + (++seq.current);
    setExtraNodes(ns => [...ns, { id:nid, x:700, y: 480 + ns.length * 44, w:240, kind:"specialist", title:a.name, sub:`${a.code} · ${a.dept}`, ref:{ type:"specialist", id:a.id } }]);
    setAddOpen(false);
    setConnectFrom(nid);
  };
  const sendAsk = () => {
    const text = ask.trim(); if (!text) return;
    const rid = "ans-" + (++seq.current);
    setExtraNodes(ns => [...ns, { id:rid, x: 380, y: 480 + ns.length * 44, w:300, kind:"note", title:"Brandolph", body: boardReply(text), ref:{ type:"note" } }]);
    setExtraEdges(es => [...es, { from:"brief", to:rid, fromSide:"bottom", toSide:"top", dashed:true }]);
    setAsk(""); setPanel(null);
  };

  const onNodeClick = (node, rect) => {
    if (!node) return;
    if (connectFrom && connectFrom !== node.id) {
      setExtraEdges(es => [...es, { from: connectFrom, to: node.id, fromSide:"right", toSide:"left" }]);
      setConnectFrom(null);
      return;
    }
    if (node.ref && node.ref.type !== "note") setPop({ ref: node.ref, rect });
  };

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { setConnectFrom(null); setAddOpen(false); setPanel(null); setPop(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ConnectHandle = ({ nid }) => (
    <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setConnectFrom(nid); }}
      title="Connect to another node"
      style={{position:"absolute", right:-9, top:"calc(50% - 9px)", width:18, height:18, borderRadius:"50%",
        border:"1px solid var(--c-line)", background:"var(--c-card)", color:"var(--c-faint)", cursor:"crosshair",
        display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"var(--shadow-sm)", zIndex:4}}>
      <Icon name="plus" size={11} />
    </button>
  );

  const renderNode = (n, { active }) => {
    const accent = CANVAS_COLORS[n.kind] || CANVAS_COLORS.copy;
    const edge = (connectFrom === n.id) ? "var(--accent)" : (active ? "var(--yellow-500)" : "var(--c-line)");
    const card = (extra) => ({
      position:"relative", background:"var(--c-card)", borderRadius:12,
      borderTop:`1px solid ${edge}`, borderRight:`1px solid ${edge}`, borderBottom:`1px solid ${edge}`,
      borderLeft:`3px solid ${accent}`,
      boxShadow: active ? "0 14px 32px rgba(0,0,0,0.16)" : "var(--shadow-sm)",
      transform: active ? "translateY(-2px)" : "none",
      transition: "transform 180ms cubic-bezier(.34,1.56,.64,1), box-shadow 180ms ease, border-color 140ms ease",
      ...extra,
    });
    const handle = n.kind !== "note" ? <ConnectHandle nid={n.id} /> : null;

    if (n.kind === "brief") {
      return (
        <div style={card({ padding:0, overflow:"hidden" })}>
          <div style={{padding:"12px 14px", background:"var(--yellow-50)", borderBottom:"1px solid var(--c-line)"}}>
            <div className="eyebrow eyebrow--yellow" style={{marginBottom:6}}>The brief · L1 Brandolph</div>
            <p style={{fontFamily:"Georgia,serif", fontStyle:"italic", fontSize:14.5, lineHeight:1.4, color:"var(--c-ink)", margin:0}}>"{brief.smp}"</p>
          </div>
          {brief.clarifications && (
            <div style={{padding:"12px 14px"}}>
              <div className="eyebrow" style={{marginBottom:8}}>Brandolph asked first</div>
              <div style={{display:"flex", flexDirection:"column", gap:10}}>
                {brief.clarifications.map((c, i) => (
                  <div key={i}>
                    <div style={{display:"flex", gap:7, fontSize:12.5, fontWeight:600, color:"var(--c-ink)", lineHeight:1.35}}>
                      <span style={{fontFamily:"var(--font-mono)", color:"var(--yellow-700)"}}>{String(i+1).padStart(2,"0")}</span>{c.q}
                    </div>
                    <div style={{fontSize:11.5, color:"var(--c-dim)", lineHeight:1.4, marginTop:3, paddingLeft:18}}>{c.why}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {handle}
        </div>
      );
    }
    if (n.kind === "note") {
      return (
        <div style={card({ padding:14 })}>
          <div style={{display:"flex", alignItems:"center", gap:6, marginBottom:8}}><BrandolphDot /><span className="eyebrow eyebrow--yellow">Brandolph</span></div>
          <p style={{fontFamily:"Georgia,serif", fontStyle:"italic", fontSize:14, lineHeight:1.5, color:"var(--c-ink)", margin:0}}>{n.body}</p>
        </div>
      );
    }
    if (n.kind === "bio") {
      return <div style={card({ padding:13 })}><div className="eyebrow" style={{marginBottom:4, fontSize:9}}>Source · canon</div><div style={{fontSize:13.5, fontWeight:600, color:"var(--c-ink)"}}>{n.title}</div><div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--c-faint)", marginTop:2}}>{n.sub}</div>{handle}</div>;
    }
    if (n.kind === "specialist") {
      return <div style={card({ padding:13 })}><div className="eyebrow" style={{marginBottom:4, fontSize:9}}>Specialist · {n.sub}</div><div style={{fontSize:13.5, fontWeight:600, color:"var(--c-ink)"}}>{n.title}</div>{handle}</div>;
    }
    const o = window.CI_OUTPUTS.find(x => "out-" + x.id === n.id);
    return (
      <div style={card({ padding:13 })}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:6, marginBottom:5}}>
          <span className="eyebrow eyebrow--yellow" style={{fontSize:9, maxWidth:"70%"}}>{n.title}</span>
          {o && o.status && <StatusPill status={o.status} />}
        </div>
        {o && <p style={{fontSize:12, color:"var(--c-dim)", lineHeight:1.4, margin:"0 0 5px", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden"}}>{o.body}</p>}
        <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--c-faint)"}}>{n.sub}</div>
        {handle}
      </div>
    );
  };

  // Floating detail content — derived from the clicked node
  const ref = (pop && pop.ref) || {};
  const output = ref.type === "output" ? outputs.find(o => o.id === ref.id) : null;
  const specialist = ref.type === "specialist" ? window.CI_AGENTS.find(a => a.id === ref.id)
    : output ? window.CI_AGENTS.find(a => a.id === output.agentId) : null;
  let dEye = "", dBody = null;
  if (ref.type === "bio") { dEye = "Source · the canon"; dBody = <><h3 style={{margin:"0 0 10px", fontSize:18}}>Brand Intelligence Object</h3><p style={{fontSize:14, lineHeight:1.55, color:"var(--c-dim)"}}><em className="b-voice" style={{background:"none", fontStyle:"italic"}}>{window.CI_BRAND.tagline}</em> · {window.CI_BRAND.bioCompleteness}% complete.</p></>; }
  else if (ref.type === "brief") { dEye = "L1 · Brandolph"; dBody = <><p style={{fontFamily:"Georgia,serif", fontStyle:"italic", fontSize:19, lineHeight:1.45, color:"var(--c-ink)", margin:"0 0 12px"}}>"{brief.smp}"</p><p style={{fontSize:13.5, color:"var(--c-dim)", lineHeight:1.5, margin:0}}>{brief.objective}</p></>; }
  else if (ref.type === "specialist" && specialist) { const sp = specialistSpec(specialist); dEye = `${specialist.code} · ${specialist.dept}`; dBody = <><h3 style={{margin:"0 0 8px", fontSize:18}}>{specialist.name}</h3><p style={{fontSize:14, lineHeight:1.5, color:"var(--c-ink)", margin:"0 0 16px"}}>{specialist.job}</p><div style={{height:1, background:"var(--c-line)", margin:"0 -16px 12px"}} /><div className="eyebrow" style={{marginBottom:6, color:"var(--c-faint)"}}>Why Brandolph routes here</div><p style={{fontSize:12.5, color:"var(--c-dim)", lineHeight:1.5, margin:0}}>{sp.objective}</p></>; }
  else if (output) {
    dEye = `${output.type}${specialist ? " · " + specialist.name : ""}`;
    dBody = (
      <>
        {output.status && <div style={{marginBottom:14}}><StatusPill status={output.status} /></div>}
        {/* THE OUTPUT — the hero of the card: big, italic, roomy */}
        <div className="eyebrow" style={{marginBottom:10}}>The output</div>
        <p style={{
          fontFamily:"Georgia, 'Times New Roman', serif", fontStyle:"italic",
          fontSize:21, lineHeight:1.5, letterSpacing:"-0.005em", color:"var(--c-ink)", margin:"0 0 12px",
        }}>"{output.body}"</p>
        <div style={{fontFamily:"var(--font-mono)", fontSize:10.5, color:"var(--c-faint)", letterSpacing:"0.04em"}}>{output.meta}</div>
        {/* divider — clearly separates output from rationale */}
        <div style={{height:1, background:"var(--c-line)", margin:"16px -16px 14px"}} />
        {/* THE RATIONALE — clearly secondary */}
        <div className="eyebrow" style={{marginBottom:6, color:"var(--c-faint)"}}>Why this choice</div>
        <p style={{fontSize:12.5, lineHeight:1.5, color:"var(--c-dim)", margin:0}}>{outputRationale(output, specialist)}</p>
      </>
    );
  }

  const addMenu = (
    <div style={{position:"relative"}}>
      <button className="btn btn--primary btn--sm" onClick={() => setAddOpen(o => !o)}><Icon name="plus" size={13} /> Add specialist</button>
      {addOpen && (
        <>
          <div onClick={() => setAddOpen(false)} style={{position:"fixed", inset:0, zIndex:40}} />
          <div style={{position:"absolute", top:"calc(100% + 6px)", right:0, zIndex:41, width:240, background:"var(--c-card)", border:"1px solid var(--c-line)", borderRadius:12, boxShadow:"var(--shadow-lg)", padding:6}}>
            <div className="eyebrow" style={{padding:"6px 10px 4px"}}>Drop a specialist, then connect it</div>
            <div style={{maxHeight:240, overflowY:"auto"}}>
              {window.CI_AGENTS.filter(a => a.status === "live").slice(0, 10).map(a => (
                <button key={a.id} onClick={() => addSpecialist(a)} style={{display:"block", width:"100%", textAlign:"left", border:"none", background:"transparent", padding:"7px 10px", borderRadius:8, cursor:"pointer", fontSize:12.5, color:"var(--c-ink)"}}
                  onMouseEnter={e => e.currentTarget.style.background="var(--neutral-50)"} onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                  {a.name} <span style={{color:"var(--c-faint)", fontFamily:"var(--font-mono)", fontSize:10}}>· {a.dept}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );

  const tabActive = (k) => k === "delivery" ? !win : win === k;
  return (
    <div style={{display:"flex", flexDirection:"column", height:"calc(100vh - 56px)", minHeight:0}}>
      {/* Brief header — integrated into the flow page (one page) */}
      <div style={{padding:"18px 32px 0", flexShrink:0}}>
        <button onClick={() => go("briefs")} className="btn btn--link" style={{fontSize:12, marginBottom:10}}><Icon name="arrowLeft" size={13} /> All briefs</button>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:24, marginBottom:12}}>
          <div>
            <div className="eyebrow" style={{marginBottom:6}}>{brief.type} · {brief.createdAt} · {brief.credits} cr · {brief.agents.length} specialists</div>
            <h1 style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize:30, letterSpacing:"-0.015em", lineHeight:1.05, margin:0, color:"var(--c-ink)", fontWeight:500}}>{brief.title}</h1>
          </div>
          <div style={{display:"flex", flexDirection:"column", gap:8, alignItems:"flex-end"}}>
            <StatusPill status={brief.status} />
            <div style={{display:"flex", gap:8}}>
              <button className="btn btn--ghost btn--sm">Revise with Brandolph</button>
              <button className="btn btn--ghost btn--icon" aria-label="Export"><Icon name="download" size={14} /></button>
            </div>
          </div>
        </div>
        <div style={{display:"flex", gap:2, borderBottom:"1px solid var(--c-line)"}}>
          {[["overview","Overview"],["recommendation","Recommendation"],["delivery","Delivery"]].map(([k, l]) => (
            <button key={k} onClick={() => k === "delivery" ? setWin(null) : setWin(w => w === k ? null : k)} style={{
              border:"none", background:"transparent", cursor:"pointer", padding:"10px 16px",
              fontFamily:"var(--font-sans)", fontSize:14, fontWeight: tabActive(k) ? 600 : 500,
              color: tabActive(k) ? "var(--c-ink)" : "var(--c-faint)",
              borderBottom: tabActive(k) ? "2px solid var(--yellow-500)" : "2px solid transparent", marginBottom:-1,
              display:"inline-flex", alignItems:"center", gap:6,
            }}>{l}{k === "delivery" && <Icon name="canvas" size={13} />}</button>
          ))}
        </div>
      </div>

      {/* Delivery — the flow canvas, filling the page */}
      <div style={{flex:1, position:"relative", minHeight:0}}>
        {connectFrom && (
          <div style={{position:"absolute", bottom:64, left:"50%", transform:"translateX(-50%)", zIndex:20}}>
            <div className="card" style={{padding:"9px 14px", display:"flex", alignItems:"center", gap:12, border:"1px solid var(--accent)"}}>
              <span style={{fontSize:13, color:"var(--c-ink)"}}>Connecting from <strong>{nodeName(connectFrom)}</strong> — click a node to link.</span>
              <button className="btn btn--ghost btn--sm" onClick={() => setConnectFrom(null)}>Cancel</button>
            </div>
          </div>
        )}
        <InteractiveCanvas
          key={brief.id}
          nodeData={allNodes}
          edges={allEdges}
          renderNode={renderNode}
          onNodeClick={onNodeClick}
          height="100%"
          exportName={brief.id + "-board"}
          toolbarExtra={addMenu}
          helper={connectFrom ? <>Click a node to connect · Esc to cancel.</> : <>Drag to pan · scroll to zoom · <strong style={{color:"var(--c-ink)", fontWeight:600}}>+</strong> on a node to connect it · click a result for the rationale.</>}
        />
      </div>

      {/* Overview / Recommendation — small windows on the same page */}
      {win && (
        <>
          <div onClick={() => setWin(null)} style={{position:"fixed", inset:0, zIndex:55}} />
          <div className="card" style={{position:"fixed", top:120, right:36, width:440, maxHeight:"calc(100vh - 160px)", overflowY:"auto", zIndex:56, boxShadow:"var(--shadow-xl)", animation:"cvPopIn 180ms cubic-bezier(.2,.8,.2,1)"}}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 18px", borderBottom:"1px solid var(--c-line)", position:"sticky", top:0, background:"var(--c-card)"}}>
              <h3 style={{margin:0, fontSize:17}}>{win === "overview" ? "Overview" : "Recommendation"}</h3>
              <button onClick={() => setWin(null)} className="btn btn--icon btn--ghost" aria-label="Close"><Icon name="close" size={15} /></button>
            </div>
            <div style={{padding:"18px"}}>
              {win === "overview" ? (
                <div style={{display:"flex", flexDirection:"column", gap:14}}>
                  <div style={{background:"var(--yellow-500)", borderRadius:12, padding:"18px 20px"}}>
                    <div className="eyebrow" style={{marginBottom:8, color:"rgba(48,48,48,0.6)"}}>Single-minded proposition</div>
                    <p style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize:18, lineHeight:1.35, margin:0, color:"#1a1f36", fontWeight:500}}>"{brief.smp}"</p>
                  </div>
                  <BriefSection title="Background"          body={brief.background} />
                  <BriefSection title="Objective"           body={brief.objective} />
                  <BriefSection title="Audience"            body={brief.audience} />
                  <BriefSection title="Metrics that matter" body={brief.metrics} />
                  <div className="card card--inset" style={{padding:16}}>
                    <div className="eyebrow" style={{marginBottom:10}}>Deliverables · {brief.deliverables.length}</div>
                    <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>{brief.deliverables.map((d, i) => <span key={i} className="pill" style={{height:28, padding:"0 14px", fontSize:11.5}}>{d}</span>)}</div>
                  </div>
                </div>
              ) : (
                <div style={{display:"flex", flexDirection:"column", gap:14}}>
                  <BriefSection title="Creative strategy" body={brief.strategy} />
                  <BriefSection title="Tone"              body={brief.tone} />
                  <BriefSection title="Direction"         body={brief.direction} />
                  <BriefSection title="Mandatories"       body={brief.mandatories} />
                  <div style={{background:"var(--pink-50)", border:"1px solid var(--pink-200)", borderRadius:12, padding:16}}>
                    <div className="eyebrow eyebrow--pink" style={{marginBottom:10}}>What this brief is NOT doing</div>
                    <p style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize:15, lineHeight:1.5, color:"var(--c-ink)", margin:0}}>"{brief.notDoing}"</p>
                  </div>
                  <div className="card card--inset" style={{padding:16, borderLeft:"3px solid var(--yellow-500)"}}>
                    <div className="eyebrow eyebrow--yellow" style={{marginBottom:10}}>Strategic assumptions</div>
                    <ul style={{margin:0, padding:0, listStyle:"none", display:"flex", flexDirection:"column", gap:8}}>
                      {brief.assumptions.map((a, i) => <li key={i} style={{fontSize:13, color:"var(--c-ink)", display:"flex", gap:8, lineHeight:1.5}}><span style={{color:"var(--yellow-700)", fontFamily:"var(--font-mono)"}}>~</span> {a}</li>)}
                    </ul>
                  </div>
                  <div className="card card--inset" style={{padding:16, borderLeft:"3px solid var(--orange-500)"}}>
                    <div className="eyebrow" style={{color:"var(--orange-600)", marginBottom:10}}>Production watchouts</div>
                    <ul style={{margin:0, padding:0, listStyle:"none", display:"flex", flexDirection:"column", gap:8}}>
                      {brief.watchouts.map((w, i) => <li key={i} style={{fontSize:13, color:"var(--c-ink)", display:"flex", gap:8, lineHeight:1.5}}><span style={{color:"var(--orange-600)", fontFamily:"var(--font-mono)"}}>!</span> {w}</li>)}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Floating detail — opens next to the clicked node, not on the side */}
      {pop && (() => {
        const r = pop.rect, W = 384, gap = 14;
        const vw = window.innerWidth, vh = window.innerHeight;
        let left = r ? r.right + gap : vw / 2 - W / 2;
        if (r && left + W > vw - 12) left = r.left - gap - W;
        if (left < 12) left = 12;
        const top = r ? Math.max(12, Math.min(r.top, vh - 360)) : 90;
        return (
          <>
            <div onClick={() => setPop(null)} style={{position:"fixed", inset:0, zIndex:49}} />
            <div className="card" style={{position:"fixed", top, left, width:W, zIndex:50, maxHeight:"calc(100vh - 24px)", overflowY:"auto", boxShadow:"var(--shadow-xl)", animation:"cvPopIn 160ms cubic-bezier(.2,.8,.2,1)"}}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8, padding:"14px 16px 0"}}>
                <span className="eyebrow eyebrow--yellow" style={{paddingTop:3}}>{dEye}</span>
                <div style={{display:"flex", alignItems:"center", gap:2, flexShrink:0}}>
                  {ref.type === "output" && <PinButton kind="outputs" id={ref.id} size={16} />}
                  {ref.type === "specialist" && <PinButton kind="specialists" id={ref.id} size={16} />}
                  <button onClick={() => setPop(null)} className="btn btn--icon btn--ghost" aria-label="Close" style={{height:26, width:26}}><Icon name="close" size={14} /></button>
                </div>
              </div>
              <div style={{padding:"6px 16px 16px"}}>{dBody}</div>
            </div>
          </>
        );
      })()}
    </div>
  );
}


function CanvasNode({ node, color, refCb, active, dim, dragging, index, onPointerDown, onEnter, onLeave, children }) {
  const shell = {
    position:"absolute", left: node.x, top: node.y, width: node.w,
    cursor: dragging ? "grabbing" : "grab",
    opacity: dim ? 0.55 : 1,
    transform: dragging ? "scale(1.02)" : "none",
    transition: dragging
      ? "box-shadow 140ms ease, border-color 140ms ease"
      : "box-shadow 160ms ease, border-color 160ms ease, transform 160ms ease, opacity 160ms ease",
    animationDelay: `${index * 45}ms`,
    userSelect:"none", touchAction:"none", zIndex: active || dragging ? 3 : 1,
  };
  /* Custom content (boards) — shell provides position + interactions only. */
  if (children) {
    return (
      <div ref={refCb} className="cv-node" onPointerDown={onPointerDown} onMouseEnter={onEnter} onMouseLeave={onLeave} style={shell}>
        {children}
      </div>
    );
  }
  /* Default card body (delivery canvas) */
  return (
    <div
      ref={refCb}
      className="cv-node"
      onPointerDown={onPointerDown}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        ...shell,
        background:"var(--c-card)", borderRadius: 8,
        borderTop: "1px solid " + (active ? "var(--yellow-500)" : "var(--c-line)"),
        borderRight: "1px solid " + (active ? "var(--yellow-500)" : "var(--c-line)"),
        borderBottom: "1px solid " + (active ? "var(--yellow-500)" : "var(--c-line)"),
        borderLeft: `3px solid ${color}`,
        padding: "10px 12px",
        boxShadow: active ? "0 8px 24px rgba(0,0,0,0.14)" : "var(--shadow-md)",
      }}
    >
      <div className="eyebrow" style={{marginBottom: 4, fontSize: 9}}>{node.kind.toUpperCase()}</div>
      <div style={{fontSize: 13, fontWeight: 500, color:"var(--c-ink)", lineHeight: 1.3, marginBottom: 4}}>{node.title}</div>
      <div style={{fontFamily:"var(--font-mono)", fontSize: 10, color:"var(--c-faint)", letterSpacing:"0.04em"}}>{node.sub}</div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* LIBRARY — every development + upload, grouped by brief,            */
/* filtered by output type, with per-output actions.                 */

function Library({ go }) {
  const [kind, setKind] = useBrState("all");
  const [toast, setToast] = useBrState(null);
  const [menuFor, setMenuFor] = useBrState(null);
  const isTeam = useIsTeam();
  const pins = usePins();

  const outputs = window.CI_OUTPUTS;
  const kinds = window.CI_OUTPUT_KINDS;
  const briefs = window.CI_BRIEFS;

  const flash = (msg) => {
    setToast(msg);
    clearTimeout(window.__libToast);
    window.__libToast = setTimeout(() => setToast(null), 2400);
  };

  const filtered = kind === "all" ? outputs
    : kind === "pinned" ? outputs.filter(o => pins.has("outputs", o.id))
    : outputs.filter(o => o.kind === kind);
  const groups = briefs
    .map(b => ({ brief: b, items: filtered.filter(o => o.briefId === b.id) }))
    .filter(g => g.items.length);
  const countFor = (k) => k === "all" ? outputs.length
    : k === "pinned" ? outputs.filter(o => pins.has("outputs", o.id)).length
    : outputs.filter(o => o.kind === k).length;

  return (
    <div style={{padding:"24px 36px 80px"}}>
      <PageHeader
        eyebrow="Workspace"
        title="Library"
        sub="Every development and upload Brandolph has produced, organised by brief. Download it, reuse it, add it to another project, hand it to the team, or send it back to Brandolph to revise."
        right={<span style={{fontFamily:"var(--font-mono)", fontSize:12, color:"var(--c-faint)"}}>{outputs.length} items · {briefs.length} briefs</span>}
      />

      {/* Type filter */}
      <div style={{display:"flex", gap:6, flexWrap:"wrap", marginBottom:24}}>
        <button onClick={() => setKind("all")}
          className={"pill" + (kind === "all" ? " pill--dark" : "")}
          style={{cursor:"pointer", height:30, padding:"0 12px"}}>All · {countFor("all")}</button>
        {countFor("pinned") > 0 && (
          <button onClick={() => setKind("pinned")}
            className={"pill" + (kind === "pinned" ? " pill--dark" : " pill--yellow")}
            style={{cursor:"pointer", height:30, padding:"0 12px"}}>★ Pinned · {countFor("pinned")}</button>
        )}
        {kinds.map(k => {
          const n = countFor(k.key);
          if (!n) return null;
          return (
            <button key={k.key} onClick={() => setKind(k.key)}
              className={"pill" + (kind === k.key ? " pill--dark" : "")}
              style={{cursor:"pointer", height:30, padding:"0 12px"}}>{k.label} · {n}</button>
          );
        })}
      </div>

      {/* Grouped by brief */}
      <div style={{display:"flex", flexDirection:"column", gap:32}}>
        {groups.map(g => (
          <section key={g.brief.id}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:14}}>
              <div style={{display:"flex", alignItems:"baseline", gap:10}}>
                <h3 style={{margin:0, fontSize:17, letterSpacing:"-0.005em"}}>{g.brief.title}</h3>
                <button className="btn btn--link" style={{fontSize:12}} onClick={() => go("board/" + g.brief.id)}>Open brief →</button>
              </div>
              <span style={{fontFamily:"var(--font-mono)", fontSize:10.5, color:"var(--c-faint)", letterSpacing:"0.08em", textTransform:"uppercase"}}>{g.items.length} {g.items.length === 1 ? "output" : "outputs"}</span>
            </div>
            <div className="stagger" style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(340px, 1fr))", gap:14}}>
              {g.items.map(o => (
                <LibraryOutput key={o.id} o={o} go={go} flash={flash} isTeam={isTeam}
                  briefs={briefs} menuOpen={menuFor === o.id}
                  onMenu={() => setMenuFor(menuFor === o.id ? null : o.id)}
                  closeMenu={() => setMenuFor(null)} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position:"fixed", bottom:28, left:"50%", transform:"translateX(-50%)", zIndex:60,
          background:"var(--c-inverse)", color:"#fff", borderRadius:10,
          padding:"10px 16px", fontSize:13, boxShadow:"var(--shadow-lg)",
          display:"flex", alignItems:"center", gap:8, animation:"fade 200ms ease",
        }}>
          <Icon name="check" size={14} /> {toast}
        </div>
      )}
    </div>
  );
}

function LibraryOutput({ o, go, flash, isTeam, briefs, menuOpen, onMenu, closeMenu }) {
  const agent = window.CI_AGENTS.find(a => a.id === o.agentId);
  const isUpload = o.kind === "upload";

  const download = () => {
    const blob = new Blob([`${o.type}\n\n${o.body}\n\n— ${o.meta}`], { type:"text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = o.type.replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-|-$/g, "") + ".txt";
    a.click();
    URL.revokeObjectURL(url);
    flash("Downloaded " + o.type);
  };

  const Action = ({ icon, label, onClick, primary }) => (
    <button onClick={onClick}
      className={"btn btn--sm " + (primary ? "btn--ghost" : "btn--ghost")}
      style={{height:28, padding:"0 9px", fontSize:11.5, gap:5}}>
      <Icon name={icon} size={13} /> {label}
    </button>
  );

  return (
    <div className="card" style={{padding:16, display:"flex", flexDirection:"column", gap:10, position:"relative"}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8}}>
        <span className="eyebrow eyebrow--yellow" style={{maxWidth:"62%"}}>{o.type}</span>
        <div style={{display:"flex", alignItems:"center", gap:6}}>
          {o.status && <StatusPill status={o.status} />}
          <PinButton kind="outputs" id={o.id} />
        </div>
      </div>

      <p style={{
        margin:0, fontSize:13.5, lineHeight:1.5, color:"var(--c-dim)",
        display:"-webkit-box", WebkitLineClamp:3, WebkitBoxOrient:"vertical", overflow:"hidden",
      }}>{o.body}</p>

      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", gap:8,
        fontFamily:"var(--font-mono)", fontSize:10.5, color:"var(--c-faint)", letterSpacing:"0.03em"}}>
        <span>{isUpload ? "Client upload" : (agent ? agent.name : "Brandolph")}</span>
        <span>{o.meta}</span>
      </div>

      {/* Actions */}
      <div style={{display:"flex", flexWrap:"wrap", gap:6, paddingTop:10, borderTop:"1px dashed var(--c-line-2)"}}>
        <Action icon="download" label="Download" onClick={download} primary />
        {!isUpload && <Action icon="refresh" label="Reuse" onClick={() => flash("Saved as a starting point for a new brief")} />}
        <div style={{position:"relative"}}>
          <Action icon="plus" label="Add to project" onClick={onMenu} />
          {menuOpen && (
            <>
              <div onClick={closeMenu} style={{position:"fixed", inset:0, zIndex:40}} />
              <div style={{
                position:"absolute", top:"calc(100% + 4px)", left:0, zIndex:41, minWidth:220,
                background:"var(--c-card)", border:"1px solid var(--c-line)", borderRadius:10,
                boxShadow:"var(--shadow-lg)", padding:6,
              }}>
                <div className="eyebrow" style={{padding:"6px 8px"}}>Add to project</div>
                {briefs.filter(b => b.id !== o.briefId).map(b => (
                  <button key={b.id} onClick={() => { closeMenu(); flash("Added to “" + b.title + "”"); }}
                    style={{display:"block", width:"100%", textAlign:"left", border:"none", background:"transparent",
                      padding:"8px 8px", borderRadius:7, fontSize:13, color:"var(--c-ink)", cursor:"pointer"}}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--neutral-50)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    {b.title}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        {!isUpload && <Action icon="craft" label="Send to polish" onClick={() => { flash("Sent to Human craft for finishing"); go("craft"); }} />}
        {!isUpload && <Action icon="sparkles" label="Revise" onClick={() => flash("Brandolph is revising this — check back shortly")} />}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* SPECIALIST AUTHOR — define a new specialist with a live prompt      */
/* preview (assembles PLATFORM + BIO + SPEC + TASK from form state).   */

const AUTHOR_INPUT = {
  width:"100%", boxSizing:"border-box", padding:"9px 11px", borderRadius:9,
  border:"1px solid var(--c-line)", background:"var(--c-card)", color:"var(--c-ink)",
  fontFamily:"inherit", fontSize:13.5, outline:"none",
};

/* Mock "dry run": synthesise a plausible draft from the brief + spec.
   No model call — clearly a simulated draft so the QA gate has something
   to check. */
function mockDraft(brief, a, spec) {
  const obj = (spec.objective || a.job || "produce the deliverable").replace(/\.$/, "");
  return [
    `Draft · ${a.name} (${a.dept})`,
    ``,
    `Brief: ${brief.trim() || "(no brief given)"}`,
    ``,
    `${a.name} would ${obj.toLowerCase()}. First read of the BIO holds: keep the brand voice, no manufactured urgency, respect the pricing formula.`,
    spec.outputContract ? `Output shaped to: ${spec.outputContract}` : ``,
    ``,
    `— simulated first cut. Edit below to QA real copy.`,
  ].filter(Boolean).join("\n");
}

/* Brand-consistency gate: scores a draft against the refusal rules.
   The forbidden-words rule is a real scan; the rest are simulated
   verdicts (a real backend would run model-assisted checks). */
function runQaGate(draft, refusals) {
  const text = (draft || "").toLowerCase();
  return refusals.map(rule => {
    if (/unlock|limited|exclusive/i.test(rule)) {
      const m = text.match(/\b(unlock|limited|exclusive)\b/);
      return { rule, status: m ? "fail" : "pass", note: m ? `found “${m[1]}”` : "no forbidden words" };
    }
    if (/11\.4|pricing|discount/i.test(rule)) return { rule, status: "pass", note: "no pricing claim to flag" };
    if (/provenance/i.test(rule)) return { rule, status: "pass", note: "ok" };
    if (/contradict|bio/i.test(rule)) return { rule, status: "pass", note: "no BIO conflict detected" };
    if (/voice|drift/i.test(rule)) return { rule, status: "pass", note: "drift ~0.12 (≤ 0.20)" };
    return { rule, status: "pass", note: "checked" };
  });
}

function SpecialistAuthor({ go }) {
  const [form, setForm] = useBrState(() => ({
    name:"", dept: window.CI_DEPTS[0], status:"live", job:"",
    role:"", objective:"", method:[""], outputContract:"", voice:"", tools:[""], refusals:[""],
    model: Object.keys(window.CI_MODELS)[0], cr: 6, tier:"01",
  }));
  const [saved, setSaved] = useBrState(false);
  const [tab, setTab] = useBrState("prompt");
  const [brief, setBrief] = useBrState("Write the annual pricing announcement email for wholesale buyers.");
  const [draft, setDraft] = useBrState("");

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setArr = (k, i, v) => setForm(f => ({ ...f, [k]: f[k].map((x, j) => j === i ? v : x) }));
  const addArr = (k) => setForm(f => ({ ...f, [k]: [...f[k], ""] }));
  const delArr = (k, i) => setForm(f => ({ ...f, [k]: f[k].filter((_, j) => j !== i) }));

  const nextNum = Math.max(0, ...window.CI_AGENTS.map(a => parseInt(String(a.id).slice(1)) || 0)) + 1;
  const code = "L2-" + String(nextNum).padStart(2, "0");

  const useTemplate = () => {
    const t = window.CI_DEPT_SPECS[form.dept] || {};
    setForm(f => ({ ...f,
      role: t.role || "", objective: t.objective || "",
      method: (t.method || [""]).slice(), outputContract: t.outputContract || "",
      voice: t.voice || "", tools: (t.tools || [""]).slice(), refusals: (t.refusals || [""]).slice(),
    }));
  };

  const agentLike = { name: form.name || "New specialist", code, dept: form.dept, model: form.model };
  const spec = {
    role: form.role, objective: form.objective, method: form.method.filter(s => s.trim()),
    outputContract: form.outputContract, voice: form.voice,
    tools: form.tools.filter(s => s.trim()), refusals: form.refusals.filter(s => s.trim()),
  };
  const preview = composeSpecialistPrompt(agentLike, true, spec);

  const canSave = form.name.trim().length > 0;
  const save = () => {
    if (!canSave) return;
    const id = "a" + String(nextNum).padStart(2, "0");
    window.CI_AGENTS.push({ id, code, dept: form.dept, name: form.name.trim(), job: form.job, model: form.model, cr: Number(form.cr) || 0, status: form.status });
    window.CI_SPECIALIST_SPECS[id] = spec;
    setSaved(true);
    setTimeout(() => go("specialists"), 700);
  };

  const Label = ({ children }) => <div className="eyebrow" style={{marginBottom:6}}>{children}</div>;
  const ListEditor = ({ k, placeholder }) => (
    <div style={{display:"flex", flexDirection:"column", gap:6}}>
      {form[k].map((v, i) => (
        <div key={i} style={{display:"flex", gap:6}}>
          <input value={v} placeholder={placeholder} onChange={e => setArr(k, i, e.target.value)} style={AUTHOR_INPUT} />
          {form[k].length > 1 && (
            <button onClick={() => delArr(k, i)} className="btn btn--ghost btn--icon" style={{flexShrink:0}} aria-label="Remove"><Icon name="close" size={14} /></button>
          )}
        </div>
      ))}
      <button onClick={() => addArr(k)} className="btn btn--link" style={{fontSize:12, alignSelf:"flex-start"}}><Icon name="plus" size={12} /> Add</button>
    </div>
  );

  return (
    <div style={{padding:"24px 36px 80px"}}>
      <PageHeader
        eyebrow="Capabilities · admin"
        title="New specialist"
        sub="Define an L2 specialist. The prompt on the right is the real composed brief — PLATFORM + the live BIO + this spec + the task — assembled as you type."
        right={<>
          <button className="btn btn--ghost" onClick={() => go("specialists")}>Cancel</button>
          <button className="btn btn--primary" disabled={!canSave} onClick={save} style={!canSave ? {opacity:0.5, cursor:"not-allowed"} : undefined}>
            {saved ? "Saved ✓" : "Save specialist"}
          </button>
        </>}
      />

      <div style={{display:"grid", gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)", gap:28, alignItems:"start"}}>
        {/* Form */}
        <div style={{display:"flex", flexDirection:"column", gap:18}}>
          <div className="card" style={{padding:18, display:"flex", flexDirection:"column", gap:14}}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
              <div className="eyebrow">Identity</div>
              <span style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--c-faint)"}}>{code}</span>
            </div>
            <div><Label>Name</Label><input value={form.name} placeholder="e.g. The Wholesale Closer" onChange={e => set("name", e.target.value)} style={AUTHOR_INPUT} /></div>
            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
              <div><Label>Department</Label>
                <select value={form.dept} onChange={e => set("dept", e.target.value)} style={AUTHOR_INPUT}>
                  {window.CI_DEPTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div><Label>Status</Label>
                <select value={form.status} onChange={e => set("status", e.target.value)} style={AUTHOR_INPUT}>
                  <option value="live">Live</option><option value="soon">Coming soon</option><option value="draft">Draft</option>
                </select>
              </div>
            </div>
            <div><Label>The job · one-liner</Label><input value={form.job} placeholder="What this specialist does, in one line." onChange={e => set("job", e.target.value)} style={AUTHOR_INPUT} /></div>
          </div>

          <div className="card" style={{padding:18, display:"flex", flexDirection:"column", gap:14}}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
              <div className="eyebrow">Prompt spec</div>
              <button onClick={useTemplate} className="btn btn--link" style={{fontSize:12}}><Icon name="refresh" size={12} /> Prefill from {form.dept} template</button>
            </div>
            <div><Label>Role</Label><input value={form.role} placeholder="a conversion copywriter who…" onChange={e => set("role", e.target.value)} style={AUTHOR_INPUT} /></div>
            <div><Label>Objective</Label><textarea value={form.objective} rows={2} placeholder="What a good run produces." onChange={e => set("objective", e.target.value)} style={{...AUTHOR_INPUT, resize:"vertical", lineHeight:1.5}} /></div>
            <div><Label>Method · steps</Label><ListEditor k="method" placeholder="A step the specialist follows" /></div>
            <div><Label>Output contract</Label><textarea value={form.outputContract} rows={2} placeholder="Shape / length / format it must return." onChange={e => set("outputContract", e.target.value)} style={{...AUTHOR_INPUT, resize:"vertical", lineHeight:1.5}} /></div>
            <div><Label>Voice</Label><input value={form.voice} placeholder="Voice constraints (inherits brand voice)." onChange={e => set("voice", e.target.value)} style={AUTHOR_INPUT} /></div>
            <div><Label>Tools</Label><ListEditor k="tools" placeholder="e.g. Exa search, image generation" /></div>
            <div><Label>Refusals · won't do (on top of brand rules)</Label><ListEditor k="refusals" placeholder="A hard rule this specialist won't break" /></div>
          </div>

          <div className="card" style={{padding:18, display:"flex", flexDirection:"column", gap:14}}>
            <div className="eyebrow">Routing & cost</div>
            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12}}>
              <div><Label>Model</Label>
                <select value={form.model} onChange={e => set("model", e.target.value)} style={AUTHOR_INPUT}>
                  {Object.entries(window.CI_MODELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div><Label>Credits / run</Label><input type="number" min="0" value={form.cr} onChange={e => set("cr", e.target.value)} style={AUTHOR_INPUT} /></div>
              <div><Label>Unlocks from</Label>
                <select value={form.tier} onChange={e => set("tier", e.target.value)} style={AUTHOR_INPUT}>
                  {Object.entries(window.CI_TIERS).map(([k, v]) => <option key={k} value={k}>Tier {k} · {v}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Right pane — Prompt | Test (dry run + QA gate) */}
        <div style={{position:"sticky", top:24, display:"flex", flexDirection:"column", gap:10}}>
          <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", gap:8}}>
            <div style={{display:"flex", alignItems:"center", gap:8}}>
              <BrandolphDot />
              <span className="eyebrow eyebrow--yellow">{tab === "prompt" ? "Live composed prompt" : "Test · dry run + QA gate"}</span>
            </div>
            <div style={{display:"inline-flex", padding:3, gap:2, background:"var(--neutral-50)", borderRadius:9, border:"1px solid var(--c-line)"}}>
              {[{v:"prompt",l:"Prompt"},{v:"test",l:"Test"}].map(o => (
                <button key={o.v} onClick={() => setTab(o.v)} style={{
                  border:"none", cursor:"pointer", borderRadius:7, padding:"5px 12px",
                  fontFamily:"var(--font-mono)", fontSize:10.5, letterSpacing:"0.04em", textTransform:"uppercase",
                  background: tab === o.v ? "var(--c-card)" : "transparent",
                  color: tab === o.v ? "var(--c-ink)" : "var(--c-faint)",
                  boxShadow: tab === o.v ? "var(--shadow-sm)" : "none",
                }}>{o.l}</button>
              ))}
            </div>
          </div>

          {tab === "prompt" ? (
            <>
              <div className="card" style={{padding:0, overflow:"hidden"}}>
                <pre style={{
                  margin:0, padding:"16px 18px", whiteSpace:"pre-wrap", wordBreak:"break-word",
                  fontFamily:"var(--font-mono)", fontSize:11.5, lineHeight:1.6, color:"var(--c-ink)",
                  maxHeight:"calc(100vh - 200px)", overflowY:"auto", background:"var(--bg-sunken, var(--c-bg))",
                }}>{preview}</pre>
              </div>
              <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--c-faint)", letterSpacing:"0.04em", paddingLeft:2}}>
                Brand refusals auto-inherit from the BIO · {(window.CI_BRAND_REFUSALS || []).length} rules
              </div>
            </>
          ) : (
            <div style={{display:"flex", flexDirection:"column", gap:12}}>
              <div className="card" style={{padding:14, display:"flex", flexDirection:"column", gap:10}}>
                <Label>Sample brief</Label>
                <textarea value={brief} rows={2} onChange={e => setBrief(e.target.value)}
                  style={{...AUTHOR_INPUT, resize:"vertical", lineHeight:1.5}} />
                <button className="btn btn--primary btn--sm" style={{alignSelf:"flex-start"}}
                  onClick={() => setDraft(mockDraft(brief, agentLike, spec))}>
                  <Icon name="sparkles" size={13} /> Dry run
                </button>
              </div>

              {draft && (() => {
                const refusals = [...(window.CI_BRAND_REFUSALS || []), ...spec.refusals];
                const results = runQaGate(draft, refusals);
                const fails = results.filter(r => r.status === "fail").length;
                return (
                  <>
                    <div className="card" style={{padding:0, overflow:"hidden"}}>
                      <div className="eyebrow" style={{padding:"10px 14px 4px"}}>Draft output · editable</div>
                      <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={6}
                        style={{width:"100%", boxSizing:"border-box", border:"none", borderTop:"1px solid var(--c-line)",
                          padding:"12px 14px", background:"transparent", color:"var(--c-ink)", outline:"none",
                          fontFamily:"var(--font-mono)", fontSize:12, lineHeight:1.55, resize:"vertical"}} />
                    </div>

                    <div className="card" style={{padding:14}}>
                      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10}}>
                        <div className="eyebrow">Brand QA gate</div>
                        <span className={"pill " + (fails ? "pill--pink" : "pill--green")}>{fails ? `${fails} blocking` : "Pass"}</span>
                      </div>
                      <div style={{display:"flex", flexDirection:"column", gap:8}}>
                        {results.map((r, i) => (
                          <div key={i} style={{display:"flex", gap:8, alignItems:"flex-start", fontSize:12.5, lineHeight:1.4}}>
                            <span style={{color: r.status === "fail" ? "var(--pink-500)" : "var(--green-600)", fontFamily:"var(--font-mono)", flexShrink:0}}>
                              {r.status === "fail" ? "✕" : "✓"}
                            </span>
                            <span style={{flex:1, color:"var(--c-dim)"}}>{r.rule}</span>
                            <span style={{fontFamily:"var(--font-mono)", fontSize:10.5, color:"var(--c-faint)", whiteSpace:"nowrap"}}>{r.note}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{marginTop:12, paddingTop:10, borderTop:"1px dashed var(--c-line-2)", fontSize:12, color:"var(--c-dim)"}}>
                        {fails
                          ? <><em className="b-voice" style={{background:"none", fontStyle:"italic"}}>Not ready.</em> Fix the flagged rule before setting this specialist live.</>
                          : <><em className="b-voice" style={{background:"none", fontStyle:"italic"}}>Clears the gate.</em> Safe to set status “Live”.</>}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { BriefsLibrary, BriefDetail, SpecialistsDirectory, CanvasView, Library, SpecialistAuthor, BriefBoard });
