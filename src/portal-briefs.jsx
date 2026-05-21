import React from "react";
const { AgentCard, BrandolphDot, Drawer, Icon, ModelChip, OutputCard, PageHeader, Reveal, StatusPill, useIsTeam } = window;
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
        sub="The CMO-grade briefs Brandolph has produced. Each one is auditable against the BIO, with the agents that executed it on record."
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
              {["Brief", "SMP", "Status", "Agents", "Credits", "Created"].map((h, i) => (
                <th key={h} style={{textAlign: i === 4 ? "right" : "left", padding:"12px 18px", fontFamily:"var(--font-mono)", fontSize:10.5, color:"var(--c-faint)", letterSpacing:"0.1em", textTransform:"uppercase", fontWeight: 500}}>{h}</th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody className="stagger">
            {filtered.map((b, i) => (
              <tr key={b.id} style={{borderBottom: i < filtered.length - 1 ? "1px solid var(--c-line)" : "none", cursor:"pointer"}}
                onClick={() => go("brief-detail/" + b.id)}
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

  return (
    <div style={{padding:"24px 36px 60px", maxWidth: 1200, margin: "0 auto"}}>
      <button onClick={() => go("briefs")} className="btn btn--link" style={{fontSize: 12, marginBottom: 14}}>
        <Icon name="arrowLeft" size={13} /> All briefs
      </button>

      <div style={{display:"grid", gridTemplateColumns:"1fr auto", gap: 24, alignItems:"start", marginBottom: 28}}>
        <div>
          <div className="eyebrow" style={{marginBottom: 8}}>{brief.type} · {brief.createdAt}</div>
          <h1 style={{
            fontFamily:"Georgia, serif", fontStyle:"italic",
            fontSize: 42, letterSpacing:"-0.015em", lineHeight: 1.1,
            margin: 0, color:"var(--c-ink)", fontWeight: 500,
          }}>{brief.title}</h1>
        </div>
        <div style={{display:"flex", flexDirection:"column", gap: 10, alignItems:"flex-end"}}>
          <StatusPill status={brief.status} />
          <div style={{display:"flex", gap: 8}}>
            {brief.status === "draft" && <button className="btn btn--primary">Approve <Icon name="check" size={13} /></button>}
            <button className="btn btn--ghost btn--sm">Revise with Brandolph</button>
            <button className="btn btn--ghost btn--sm">Send to team →</button>
            <button className="btn btn--ghost btn--icon" aria-label="Copy JSON"><Icon name="files" size={14} /></button>
            <button className="btn btn--ghost btn--icon" aria-label="Export PDF"><Icon name="download" size={14} /></button>
          </div>
        </div>
      </div>

      {/* SMP block — the yellow pull-quote */}
      <div style={{
        background:"var(--yellow-500)",
        borderRadius: 14,
        padding:"32px 38px",
        marginBottom: 28,
        position:"relative",
        overflow:"hidden",
      }}>
        <div style={{position:"absolute", top: 18, right: 22, fontFamily:"var(--font-mono)", fontSize: 10, letterSpacing:"0.18em", color:"rgba(48,48,48,0.6)", textTransform:"uppercase", fontWeight:500}}>
          Single-minded proposition
        </div>
        <p style={{
          fontFamily:"Georgia, serif", fontStyle:"italic",
          fontSize: 30, letterSpacing:"-0.005em", lineHeight: 1.25,
          margin: 0, color:"var(--neutral-900)", fontWeight: 500,
          maxWidth: 820,
        }}>
          "{brief.smp}"
        </p>
      </div>

      {/* Two-column body grid */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap: 18, marginBottom: 22}}>
        <BriefSection title="Background"            body={brief.background} />
        <BriefSection title="Objective"             body={brief.objective} />
        <BriefSection title="Audience"              body={brief.audience} />
        <BriefSection title="Creative strategy"     body={brief.strategy} />
        <BriefSection title="Tone"                  body={brief.tone} />
        <BriefSection title="Direction"             body={brief.direction} />
        <BriefSection title="Mandatories"           body={brief.mandatories} />
        <BriefSection title="Metrics that matter"   body={brief.metrics} />
      </div>

      {/* Deliverables */}
      <div className="card" style={{padding: 22, marginBottom: 22}}>
        <div className="eyebrow" style={{marginBottom: 14}}>Deliverables</div>
        <div style={{display:"flex", gap: 8, flexWrap:"wrap"}}>
          {brief.deliverables.map((d, i) => (
            <span key={i} className="pill" style={{height: 28, padding:"0 14px", fontSize:11.5, background:"var(--neutral-50)"}}>{d}</span>
          ))}
        </div>
      </div>

      {/* What we're NOT doing — red card */}
      <div style={{
        background:"var(--pink-50)", border:"1px solid var(--pink-200)", borderRadius: 12,
        padding: 22, marginBottom: 22,
      }}>
        <div className="eyebrow eyebrow--pink" style={{marginBottom: 14}}>What this brief is NOT doing</div>
        <p style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize: 17, lineHeight: 1.55, color:"var(--c-ink)", margin: 0}}>
          "{brief.notDoing}"
        </p>
      </div>

      {/* Strategic assumptions + Watchouts */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap: 18, marginBottom: 30}}>
        <div className="card" style={{padding: 20, borderLeft: "3px solid var(--yellow-500)"}}>
          <div className="eyebrow eyebrow--yellow" style={{marginBottom: 12}}>Strategic assumptions</div>
          <ul style={{margin:0, padding:0, listStyle:"none", display:"flex", flexDirection:"column", gap: 8}}>
            {brief.assumptions.map((a, i) => (
              <li key={i} style={{fontSize: 13.5, color:"var(--c-ink)", display:"flex", gap: 8, lineHeight: 1.5}}>
                <span style={{color:"var(--yellow-700)", fontFamily:"var(--font-mono)"}}>~</span> {a}
              </li>
            ))}
          </ul>
        </div>
        <div className="card" style={{padding: 20, borderLeft: "3px solid var(--orange-500)"}}>
          <div className="eyebrow" style={{color:"var(--orange-600)", marginBottom: 12}}>Production watchouts</div>
          <ul style={{margin:0, padding:0, listStyle:"none", display:"flex", flexDirection:"column", gap: 8}}>
            {brief.watchouts.map((w, i) => (
              <li key={i} style={{fontSize: 13.5, color:"var(--c-ink)", display:"flex", gap: 8, lineHeight: 1.5}}>
                <span style={{color:"var(--orange-600)", fontFamily:"var(--font-mono)"}}>!</span> {w}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Outputs */}
      {outputs.length > 0 && (
        <>
          <div style={{display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom: 14}}>
            <h2 style={{margin: 0, fontSize: 20, letterSpacing:"-0.01em"}}>Outputs · {outputs.length}</h2>
            <span style={{fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--c-faint)", letterSpacing:"0.06em"}}>
              {brief.agents.length} specialists · from {[...new Set(brief.agents.map(id => window.CI_AGENTS.find(a => a.id === id)?.dept))].filter(Boolean).length} departments · {brief.credits} cr spent
            </span>
          </div>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap: 18, marginBottom: 22}}>
            {outputs.map(o => <OutputCard key={o.id} output={o} />)}
          </div>
        </>
      )}

      {/* Agents involved */}
      <div className="card" style={{padding: 22}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 14}}>
          <div className="eyebrow">Department assembled · {brief.agents.length} agents</div>
          <a href="#/specialists" className="btn btn--link" style={{fontSize: 12}}>Browse the directory →</a>
        </div>
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))", gap: 10}}>
          {brief.agents.map(aid => <AgentCard key={aid} agentId={aid} compact />)}
        </div>
      </div>
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

function SpecialistsDirectory() {
  const [dept, setDept] = useBrState("all");
  const [openId, setOpenId] = useBrState(null);
  const agents = dept === "all" ? window.CI_AGENTS : window.CI_AGENTS.filter(a => a.dept === dept);

  return (
    <div style={{padding:"24px 36px 60px"}}>
      <PageHeader
        eyebrow="L2 · 33 senior agents"
        title="The department, on shift."
        sub="Brandolph reads the brief. The specialists do the work. Each one routes to the model best suited to the job — visible, auditable, paid out of the same credit pool."
        right={<>
          <button className="btn btn--ghost btn--sm">Filter <Icon name="filter" size={13} /></button>
          <span style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--c-faint)"}}>27 live · 6 coming soon</span>
        </>}
      />

      {/* Department filter */}
      <div style={{display:"flex", gap: 6, marginBottom: 24, flexWrap:"wrap"}}>
        {["all", ...window.CI_DEPTS].map(d => (
          <button key={d} onClick={() => setDept(d)}
            className={"pill" + (dept === d ? " pill--dark" : "")}
            style={{height: 30, padding:"0 14px", cursor:"pointer", fontSize: 11}}>
            {d === "all" ? "All departments" : d}
            {d !== "all" && <span style={{marginLeft: 6, opacity: 0.6}}>· {window.CI_AGENTS.filter(a => a.dept === d).length}</span>}
          </button>
        ))}
      </div>

      {/* Grouped by dept */}
      {(dept === "all" ? window.CI_DEPTS : [dept]).map(d => {
        const list = agents.filter(a => a.dept === d);
        if (!list.length) return null;
        return (
          <section key={d} style={{marginBottom: 32}}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom: 14}}>
              <h3 style={{margin: 0, fontSize: 17, letterSpacing:"-0.005em"}}>{d}</h3>
              <span style={{fontFamily:"var(--font-mono)", fontSize: 10.5, color:"var(--c-faint)", letterSpacing:"0.08em", textTransform:"uppercase"}}>{list.length} agents · {list.filter(a => a.status === "live").length} live</span>
            </div>
            <div className="stagger" style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))", gap: 12}}>
              {list.map(a => <AgentCard key={a.id} agentId={a.id} onClick={() => setOpenId(a.id)} />)}
            </div>
          </section>
        );
      })}

      <SpecialistDrawer open={!!openId} agent={openId ? window.CI_AGENTS.find(a => a.id === openId) : null} onClose={() => setOpenId(null)} />
    </div>
  );
}

function SpecialistDrawer({ open, agent, onClose }) {
  if (!agent) return null;
  const isTeam = useIsTeam();
  const m = window.CI_MODELS[agent.model];
  const accent = isTeam ? m.color : (window.CI_DEPT_COLORS[agent.dept] || "var(--neutral-300)");
  return (
    <Drawer open={open} onClose={onClose} title={agent.name} eyebrow={`${agent.code} · ${agent.dept}`}
      footer={<>
        <button className="btn btn--ghost" onClick={onClose}>Close</button>
        <button className="btn btn--primary">Add to next assembly · {agent.cr} cr</button>
      </>}>
      <div style={{
        background: accent, height: 6, borderRadius: 4, marginBottom: 18,
      }} />

      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 18}}>
        {isTeam ? <ModelChip modelKey={agent.model} /> : (
          <span className="eyebrow" style={{color:"var(--c-dim)"}}>L2 · {agent.dept}</span>
        )}
        <span className="credit credit--pending" style={{fontSize: 13}}>{agent.cr} cr · per run</span>
      </div>

      <div className="eyebrow" style={{marginBottom: 8}}>The job</div>
      <p style={{fontSize:14.5, color:"var(--c-ink)", lineHeight: 1.55, marginBottom: 22}}>{agent.job}</p>

      {isTeam && (
        <>
          <div className="eyebrow" style={{marginBottom: 8}}>System prompt · summarised</div>
          <div className="card card--inset" style={{padding: 14, marginBottom: 22}}>
            <p style={{fontSize: 12.5, color:"var(--c-dim)", lineHeight: 1.55, margin: 0, fontFamily:"var(--font-mono)"}}>
              You are a {agent.name.toLowerCase()}. You read the Brand Intelligence Object before responding. You write with conviction and refuse outputs that contradict the BIO. You produce {agent.dept === "Copy" ? "copy" : agent.dept === "Design" ? "visual artefacts" : "structured strategic output"} that a CMO would approve without a second pass…
            </p>
            <button className="btn btn--link" style={{fontSize:11, marginTop:8}}>Reveal full prompt (admin only)</button>
          </div>
        </>
      )}

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
  copy:"var(--green-600)", asset:"var(--pink-500)", feedback:"var(--orange-500)",
};

const SCALE_MIN = 0.4, SCALE_MAX = 2;

function CanvasView() {
  const [nodes, setNodes] = React.useState(() => CANVAS_NODES.map(n => ({ ...n })));
  const [view, setView]   = React.useState({ x: 24, y: 28, scale: 1 });
  const [sizes, setSizes] = React.useState({});      // id -> measured height
  const [hovered, setHovered] = React.useState(null);
  const [panning, setPanning] = React.useState(false);

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
    if (drag.current) wrapRef.current.releasePointerCapture?.(e.pointerId);
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
    const data = JSON.stringify({ nodes, edges: CANVAS_EDGES }, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type:"application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = "vinilo-canvas.json"; a.click();
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
        position:"relative", height:"calc(100vh - 56px)", overflow:"hidden",
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
      <div onPointerDown={stop} style={{position:"absolute", top: 20, left: 24, zIndex: 5, display:"flex", gap: 10}}>
        <span className="pill pill--yellow">Phase 3 — preview</span>
        <span className="pill">Vinilo · canvas</span>
      </div>
      <div onPointerDown={stop} style={{position:"absolute", top: 20, right: 24, zIndex: 5, display:"flex", gap: 8, alignItems:"center"}}>
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
          {CANVAS_EDGES.map((e, i) => {
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
          />
        ))}
      </div>

      {/* Bottom helper */}
      <div onPointerDown={stop} style={{position:"absolute", bottom: 24, left: "50%", transform:"translateX(-50%)", zIndex: 5}}>
        <div className="card" style={{padding:"10px 16px", display:"flex", alignItems:"center", gap: 14}}>
          <BrandolphDot />
          <span style={{fontSize: 13, color:"var(--c-dim)"}}>
            <em className="b-voice" style={{background:"none", fontStyle:"italic"}}>Senior users live here.</em> Drag the grid to pan · scroll to zoom · drag any node.
          </span>
          <a href="#/home" className="btn btn--ghost btn--sm">Back to chat</a>
        </div>
      </div>

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

function CanvasNode({ node, color, refCb, active, dim, dragging, index, onPointerDown, onEnter, onLeave }) {
  return (
    <div
      ref={refCb}
      className="cv-node"
      onPointerDown={onPointerDown}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        position:"absolute", left: node.x, top: node.y, width: node.w,
        background:"#fff", borderRadius: 8,
        borderTop: "1px solid " + (active ? "var(--yellow-500)" : "var(--c-line)"),
        borderRight: "1px solid " + (active ? "var(--yellow-500)" : "var(--c-line)"),
        borderBottom: "1px solid " + (active ? "var(--yellow-500)" : "var(--c-line)"),
        borderLeft: `3px solid ${color}`,
        padding: "10px 12px",
        boxShadow: active ? "0 8px 24px rgba(0,0,0,0.14)" : "var(--shadow-md)",
        cursor: dragging ? "grabbing" : "grab",
        opacity: dim ? 0.55 : 1,
        transform: dragging ? "scale(1.02)" : "none",
        transition: dragging
          ? "box-shadow 140ms ease, border-color 140ms ease"
          : "box-shadow 160ms ease, border-color 160ms ease, transform 160ms ease, opacity 160ms ease",
        animationDelay: `${index * 45}ms`,
        userSelect:"none", touchAction:"none", zIndex: active || dragging ? 3 : 1,
      }}
    >
      <div className="eyebrow" style={{marginBottom: 4, fontSize: 9}}>{node.kind.toUpperCase()}</div>
      <div style={{fontSize: 13, fontWeight: 500, color:"var(--c-ink)", lineHeight: 1.3, marginBottom: 4}}>{node.title}</div>
      <div style={{fontFamily:"var(--font-mono)", fontSize: 10, color:"var(--c-faint)", letterSpacing:"0.04em"}}>{node.sub}</div>
    </div>
  );
}

Object.assign(window, { BriefsLibrary, BriefDetail, SpecialistsDirectory, CanvasView });
