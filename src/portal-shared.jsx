import React from "react";
/* Caastor Intelligence — shared UI primitives. */
/* Pure components; no router or page logic. Globals exposed on window. */

const { useState, useEffect, useRef, useMemo } = React;

/* Brandolph avatar — yellow pulse dot. Two states. */
function BrandolphDot({ state = "idle", size = 10 }) {
  if (state === "thinking") {
    return (
      <span style={{display:"inline-flex", gap:4, alignItems:"center"}} aria-label="Brandolph is thinking">
        {[0,1,2].map(i => (
          <span key={i} style={{
            width: size-2, height: size-2, borderRadius: "50%",
            background: "var(--yellow-500)",
            animation: `brand-thinking 1200ms ${i*180}ms ease-in-out infinite`,
          }} />
        ))}
        <style>{`@keyframes brand-thinking { 0%, 100% { opacity: 0.25; transform: scale(0.85);} 50% { opacity: 1; transform: scale(1);} }`}</style>
      </span>
    );
  }
  return <span className="pulse-dot" style={{ width: size, height: size }} aria-label="Brandolph"></span>;
}

/* Brandolph avatar — the OFFICIAL Caastor mascot, sized for chat use. */
function BrandolphAvatar({ size = 44, color = "yellow" }) {
  const fills = {
    yellow: "#F8C036", green: "#30B478", red: "#F0486C",
    violet: "#8436C0", white: "#FFFFFF",
  };
  const bodyFill = fills[color] || fills.yellow;
  const ink = "#1A1F36";
  const aspect = 984 / 1176;
  return (
    <svg width={size} height={size / aspect} viewBox="0 0 984 1176" aria-hidden="true" style={{flexShrink: 0, filter:"drop-shadow(0 2px 3px rgba(0,0,0,0.08))", display:"block"}}>
      <path fill={bodyFill} d="M708,216c0-19.9-16.1-36-36-36s-36,16.1-36,36H276c0-19.9-16.1-36-36-36s-36,16.1-36,36c0,19.9,16.1,36,36,36v684h504V216H708z"/>
      <rect x="414" y="255.4" transform="matrix(0.2873 -0.9578 0.9578 0.2873 -5.2749 628.9104)" width="12" height="125.3" fill={ink}/>
      <rect x="632.3" y="276" transform="matrix(0.9192 -0.3938 0.3938 0.9192 -56.2662 289.8156)" width="91.4" height="12" fill={ink}/>
      <path fill={ink} d="M684,714c-66.4,0-90-54.9-90-102V494.5l58.2-58.2l-8.5-8.5l-56.1,56.1l-67.8-56.5l-7.7,9.2l69.8,58.2V612c0,60.1-37,102-90,102c-55.8,0-90.5-56.5-90.9-57.1l-10.3,6.2c1.5,2.6,38.5,62.9,101.1,62.9c10.6,0,20.6-1.5,30-4.3V846h120V718.2c11.9,5,25.8,7.8,42,7.8V714z M534,717.3c21-9.5,37.6-26.2,48-48.2V834h-48V717.3z M630,834h-36V670.2c7.7,16.8,19.4,31.7,36,41.8V834z"/>
      <rect x="420" y="360" width="24" height="36" fill={ink}/>
      <rect x="672" y="360" width="24" height="36" fill={ink}/>
      <path fill={ink} d="M456,522c-41.9,0-66-41.6-66-114s24.1-114,66-114s66,41.6,66,114S497.9,522,456,522z M456,306c-34.3,0-54,37.2-54,102s19.7,102,54,102s54-37.2,54-102S490.3,306,456,306z"/>
      <path fill={ink} d="M708,522c-41.9,0-66-41.6-66-114s24.1-114,66-114s66,41.6,66,114S749.9,522,708,522z M708,306c-34.3,0-54,37.2-54,102s19.7,102,54,102s54-37.2,54-102S742.3,306,708,306z"/>
      <rect x="252" y="366" width="144" height="12" fill={ink}/>
      <path fill={ink} d="M645.3,377.4C645.1,377.3,622,366,588,366c-46.1,0-69.1,11.3-69.3,11.4l-5.4-10.7c1-0.5,25.8-12.6,74.7-12.6c37,0,61.7,12.1,62.7,12.6L645.3,377.4z"/>
    </svg>
  );
}

/* L1 / L2 / L3 layer tag */
function LayerTag({ layer = "L2" }) {
  const colors = {
    L1: { bg: "var(--yellow-50)",   fg: "var(--yellow-800)",   border: "var(--yellow-300)" },
    L2: { bg: "var(--purple-50)",   fg: "var(--purple-700)",   border: "var(--purple-200)" },
    L3: { bg: "rgba(108,244,180,0.22)", fg: "#1d6b4b", border: "rgba(108,244,180,0.55)" },
  };
  const c = colors[layer] || colors.L2;
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", justifyContent:"center",
      fontFamily:"var(--font-mono)", fontSize:10, letterSpacing:"0.08em",
      padding:"2px 7px", borderRadius:5,
      background: c.bg, color: c.fg, border: `1px solid ${c.border}`, fontWeight: 600,
    }}>{layer}</span>
  );
}

/* Are we currently on the client side? Model + routing details are
   internal-only and hidden when viewing the client portal. */
function useIsTeam() {
  // Read from window each render; App writes this in its render path.
  return (window.__CI_PORTAL || "client") === "team";
}

/* Model swatch + name (mono) — only rendered on the team side. */
function ModelChip({ modelKey, withDot = true, withLabel = true, size = 9, force = false }) {
  const isTeam = useIsTeam();
  if (!isTeam && !force) return null;
  const m = window.CI_MODELS[modelKey] || { label: modelKey, color: "var(--neutral-400)" };
  return (
    <span className="modelchip">
      {withDot && <span className="modelchip__dot" style={{ width: size, height: size, background: m.color }} />}
      {withLabel && <span>{m.label}</span>}
    </span>
  );
}

/* Credit badge */
function Credit({ value, pending = false, earned = false, suffix = "cr" }) {
  const sign = value > 0 && earned ? "+" : (value < 0 ? "−" : "");
  const abs = Math.abs(value);
  let cls = "credit";
  if (pending) cls += " credit--pending";
  if (earned) cls += " credit--earned";
  if (value < 0) cls += " credit--spent";
  return <span className={cls}>{sign}{abs} {suffix}</span>;
}

/* Confidence indicator: green ≥85, amber 65–84, red <65 */
function Confidence({ value }) {
  const tone = value >= 85 ? "" : value >= 65 ? " confbar--amber" : " confbar--red";
  const segs = Math.round(value / 12.5); // 8 segs
  const dotColor = value >= 85 ? "var(--green-500)" : value >= 65 ? "var(--orange-500)" : "var(--pink-500)";
  return (
    <span style={{display:"inline-flex", alignItems:"center", gap:8, fontFamily:"var(--font-mono)", fontSize:11, color:"var(--c-dim)"}}>
      <span style={{display:"inline-flex", alignItems:"center", gap:4}}>
        <span style={{ width:6, height:6, borderRadius:"50%", background: dotColor }} />
        <span>{value}%</span>
      </span>
      <span className={"confbar" + tone}>
        {Array.from({length: 8}, (_, i) => <i key={i} className={i < segs ? "on" : ""} />)}
      </span>
    </span>
  );
}

/* Specialist card — atomic L2 unit. Used in assembly, directory, brief outputs. */
function AgentCard({ agentId, compact = false, onClick, showCaps = false }) {
  const a = window.CI_AGENTS.find(x => x.id === agentId);
  if (!a) return null;
  const isTeam = useIsTeam();
  const soon = a.status === "soon";
  const accent = isTeam ? window.CI_MODELS[a.model].color : (window.CI_DEPT_COLORS[a.dept] || "var(--neutral-400)");
  const caps = (window.CI_DEPT_META[a.dept] || {}).capabilities || [];
  return (
    <div
      className="agent-card"
      onClick={onClick}
      style={{
        background:"var(--c-card)",
        border:"1px solid var(--c-line)",
        borderLeft: `3px solid ${accent}`,
        borderRadius: 10,
        padding: compact ? "10px 12px" : "12px 14px",
        cursor: onClick ? "pointer" : "default",
        transition: "border-color 140ms ease, transform 120ms ease",
        display:"flex", flexDirection:"column", gap: 4,
        opacity: soon ? 0.62 : 1,
      }}
      onMouseEnter={e => onClick && (e.currentTarget.style.borderColor = "var(--neutral-300)")}
      onMouseLeave={e => onClick && (e.currentTarget.style.borderColor = "var(--c-line)")}
    >
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:8}}>
        <span className="eyebrow">{a.dept} · {a.code}</span>
        <span className="credit credit--pending">{a.cr} cr</span>
      </div>
      <div style={{
        fontFamily:"var(--font-sans)", fontWeight:600, fontSize:14.5,
        color:"var(--c-ink)", letterSpacing:"-0.005em", marginTop: 2,
      }}>{a.name}</div>
      {!compact && (
        <div style={{ color:"var(--c-dim)", fontSize: 12.5, lineHeight: 1.45 }}>{a.job}</div>
      )}
      {showCaps && !compact && caps.length > 0 && (
        <div style={{display:"flex", flexWrap:"wrap", gap:4, marginTop:6}}>
          {caps.slice(0, 3).map(c => (
            <span key={c} style={{
              fontFamily:"var(--font-mono)", fontSize:9.5, color:"var(--c-faint)",
              border:"1px solid var(--c-line)", borderRadius:6, padding:"1px 6px", letterSpacing:"0.02em",
            }}>{c}</span>
          ))}
        </div>
      )}
      <div style={{
        marginTop: 8, paddingTop: 8,
        borderTop: "1px dashed var(--c-line-2)",
        display:"flex", justifyContent:"space-between", alignItems:"center",
      }}>
        {isTeam ? <ModelChip modelKey={a.model} /> : <span className="eyebrow">Specialist</span>}
        {soon ? (
          <span className="pill" style={{height:18, padding:"0 8px", fontSize: 9.5}}>Coming soon</span>
        ) : (
          <LayerTag layer="L2" />
        )}
      </div>
    </div>
  );
}

/* Certification attribution. A named human appears only when a senior
   Steward actually signed; self-certified work says so plainly, and work
   with no certification at all says nothing. */
function CertNote({ steward, selfCertified }) {
  if (steward) {
    return <> · certified by <span style={{color:"var(--c-ink)"}}>{steward.firstName}</span>{steward.certifiedAt ? <> · {steward.certifiedAt}</> : null}</>;
  }
  if (selfCertified) return <> · self-certified</>;
  return null;
}

/* Output card — used in /briefs/[id] and canvas drawers.
   Footer renders the rev-2 §5.5 / §9 attribution. Two render modes:
   - Client (default, public): leads with the Steward chip; NO model name.
     This is the moat-defining trust signal — `certified by <steward>` is
     impossible to fake without the real Steward operation.
   - Team / debug: adds `routed via {model}` and `run {short_id}` for
     ops debugging. Surfaces by default on team portal; hover-reveal on
     client portal so debugging is always one mouse-hover away.
   Attribution comes in on `output` — never from ambient seed data. This
   footer used to read CI_BRAND.steward, which meant every card claimed a
   named human had certified it ("certified by <steward> · 14 May") on brands
   that person has never seen. A fabricated professional endorsement is the
   one thing this footer must never render, so an output with no cert data
   now says nothing rather than borrowing someone's signature.

   Certification is two-tier: `certified_by` set = a senior Steward signed
   it; certified with `certified_by` NULL = self-certified by Discovery.
   Only the first may name a person. */
function OutputCard({ output }) {
  const agent = window.CI_AGENTS.find(a => a.id === output.agentId);
  const isTeam = useIsTeam();
  const bioVersion = output.bioVersion ?? null;
  const steward = output.certifiedBy || null;   // { firstName, certifiedAt } — senior cert only
  const selfCertified = !steward && output.certified === true;
  const modelLabel = agent && window.CI_MODELS && window.CI_MODELS[agent.model] ? window.CI_MODELS[agent.model].label : null;
  const shortRunId = output.id ? String(output.id).replace(/[^a-z0-9]/gi, "").slice(0, 7) : "";

  const footerBase = {
    marginTop: 6, paddingTop: 10,
    borderTop:"1px dashed var(--c-line-2)",
    fontFamily:"var(--font-mono)", fontSize:11, color:"var(--c-faint)",
    letterSpacing:"0.04em", lineHeight: 1.45,
  };

  const ClientFooter = (
    <div style={footerBase}>
      Composed by <span style={{color:"var(--c-ink)"}}>{agent ? agent.name : "Specialist"}</span>
      {bioVersion ? <> · BIO v{bioVersion}</> : null}
      <CertNote steward={steward} selfCertified={selfCertified} />
    </div>
  );

  const DebugFooter = (
    <div style={{...footerBase, color:"var(--c-dim)"}}>
      Composed by <span style={{color:"var(--c-ink)"}}>{agent ? agent.name : "Specialist"}</span>
      {modelLabel ? <> · routed via {modelLabel}</> : null}
      {bioVersion ? <> · BIO v{bioVersion}</> : null}
      <CertNote steward={steward} selfCertified={selfCertified} />
      {shortRunId ? <> · run {shortRunId}</> : null}
    </div>
  );

  return (
    <div className="output-card" style={{
      background:"var(--c-card)", border:"1px solid var(--c-line)",
      borderRadius: 12, padding: 18, display:"flex", flexDirection:"column", gap: 10,
      position:"relative",
    }}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
        <span className="eyebrow eyebrow--yellow">{output.type}</span>
        {isTeam ? (agent && <ModelChip modelKey={agent.model} />) : <LayerTag layer="L2" />}
      </div>
      <p style={{
        fontFamily:"Georgia, 'Times New Roman', serif", fontStyle:"italic",
        color:"var(--c-ink)", fontSize: 16.5, lineHeight: 1.55,
        margin:0,
      }}>"{output.body}"</p>
      {isTeam ? DebugFooter : (
        /* Client portal: render client footer inline; hover-reveal the debug
           footer in a small tooltip card so debugging is one hover away. */
        <div className="output-card__footer-wrap" style={{position:"relative"}}>
          {ClientFooter}
          <div className="output-card__debug-tip" style={{
            position:"absolute", left: 0, right: 0, top: "calc(100% + 6px)",
            background:"var(--c-card)", border:"1px solid var(--c-line)",
            borderRadius: 8, padding:"8px 12px",
            boxShadow:"var(--shadow-md, 0 4px 16px rgba(0,0,0,0.08))",
            opacity: 0, pointerEvents:"none",
            transform:"translateY(-4px)",
            transition:"opacity 140ms ease, transform 140ms ease",
            zIndex: 5,
          }}>
            <div style={{fontSize:9.5, fontFamily:"var(--font-mono)", letterSpacing:"0.14em", textTransform:"uppercase", color:"var(--c-faint)", marginBottom: 4}}>Debug attribution</div>
            {DebugFooter}
          </div>
        </div>
      )}
    </div>
  );
}

/* Status pill for jobs / briefs */
function StatusPill({ status }) {
  const map = {
    "draft":        { label:"Draft",          cls:"" },
    "approved":     { label:"Approved",       cls:"pill--green" },
    "in-production":{ label:"In production",  cls:"pill--yellow" },
    "shipped":      { label:"Shipped",        cls:"pill--purple" },
    "archived":     { label:"Archived",       cls:"" },
    "unassigned":   { label:"Unassigned",     cls:"" },
    "in-progress":  { label:"In progress",    cls:"pill--yellow" },
    "review":       { label:"In review",      cls:"pill--purple" },
    "delivered":    { label:"Delivered",      cls:"pill--green" },
    "blocked":      { label:"Blocked",        cls:"pill--pink" },
    "live":         { label:"Live",           cls:"pill--green" },
    "soon":         { label:"Coming soon",    cls:"" },
  };
  const v = map[status] || { label: status, cls: "" };
  return <span className={"pill " + v.cls}>{v.label}</span>;
}

/* Intersection-observer reveal wrapper */
function Reveal({ children, delay = 0, as: As = "div", style }) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { setSeen(true); obs.disconnect(); } });
    }, { threshold: 0.08 });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return <As ref={ref} className={"reveal" + (seen ? " is-in" : "")} style={{ ...style, transitionDelay: delay + "ms" }}>{children}</As>;
}

/* Drawer wrapper */
function Drawer({ open, onClose, title, eyebrow, children, footer, width = 520 }) {
  if (!open) return null;
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose}></div>
      <aside className="drawer" style={{ width }}>
        <header style={{
          padding:"18px 22px", borderBottom:"1px solid var(--c-line)",
          display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap: 12,
        }}>
          <div style={{display:"flex", flexDirection:"column", gap:4}}>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h3 style={{margin:0, fontSize:18}}>{title}</h3>
          </div>
          <button className="btn btn--icon btn--ghost" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </header>
        <div className="scroll" style={{flex:1, overflowY:"auto", padding:"18px 22px"}}>{children}</div>
        {footer && <footer style={{
          padding:"14px 22px", borderTop:"1px solid var(--c-line)",
          display:"flex", justifyContent:"flex-end", gap: 10, background:"var(--c-card)",
        }}>{footer}</footer>}
      </aside>
    </>
  );
}

/* Animated counter — easing 1 - pow(1-t, 2) */
function Counter({ to, duration = 1100, format = (n) => Math.round(n) }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 2);
      setV(eased * to);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);
  return <>{format(v)}</>;
}

/* Mini SLA heat indicator */
function SlaHeat({ text }) {
  let color = "var(--green-600)";
  if (/overdue/i.test(text)) color = "var(--pink-500)";
  else if (/^\d+h/.test(text) && parseInt(text) <= 24) color = "var(--orange-500)";
  return (
    <span style={{display:"inline-flex", alignItems:"center", gap:6, fontFamily:"var(--font-mono)", fontSize:11, color, letterSpacing:"0.04em"}}>
      <span style={{width:6, height:6, borderRadius:"50%", background: color}} />
      {text}
    </span>
  );
}

/* Section header — used inside the routed pages, below the yellow strip */
function PageHeader({ eyebrow, title, sub, right }) {
  return (
    <div style={{
      display:"flex", justifyContent:"space-between", alignItems:"flex-start",
      gap: 24, marginBottom: 24, paddingBottom: 18,
      borderBottom: "1px solid var(--c-line)",
    }}>
      <div>
        {eyebrow && <div className="eyebrow" style={{marginBottom: 6}}>{eyebrow}</div>}
        <h1 style={{margin:0, fontSize: 26, letterSpacing:"-0.01em"}}>{title}</h1>
        {sub && <p style={{marginTop:8, fontSize: 14, color:"var(--c-dim)", maxWidth: 600}}>{sub}</p>}
      </div>
      {right && <div style={{display:"flex", gap: 10, alignItems:"center"}}>{right}</div>}
    </div>
  );
}

/* Small icon set ---------------------------------------------------- */
function Icon({ name, size = 16, stroke = 1.6 }) {
  const paths = {
    home:      "M3 11.5L10 4l7 7.5V17a1 1 0 01-1 1h-3v-5h-4v5H4a1 1 0 01-1-1z",
    // BIO — open book / two-page spread. The "canon" of the brand,
    // visibly singular and bound, distinct from the Library grid.
    bio:       "M10 5v12M3 5h6a1 1 0 011 1v11a1 1 0 00-1-1H3zM17 5h-6a1 1 0 00-1 1v11a1 1 0 011-1h6z",
    // Brief — a document with a title bar + two content strokes.
    // Reads as "page with a brief on it", not a hamburger menu.
    brief:     "M4 3h12v14H4zM4 7h12M7 11h6M7 14h4",
    spark:     "M10 2v6M10 12v6M2 10h6M12 10h6M5 5l3 3M12 12l3 3M5 15l3-3M12 8l3-3",
    canvas:    "M3 4h14v12H3zM3 9h14M9 4v12",
    // Humans — single figure (the artisan finishing the work).
    // Distinct from team (two figures, plural).
    craft:     "M10 3a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM4 17a6 6 0 0112 0",
    // Credits — a card with a small chip strip.
    credit:    "M3 6h14v8H3zM3 9.5h14M6 12.5h3",
    // Settings — clean radial gear with a central circle.
    settings:  "M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.5 4.5l1.4 1.4M14.1 14.1l1.4 1.4M4.5 15.5l1.4-1.4M14.1 5.9l1.4-1.4M10 7a3 3 0 100 6 3 3 0 000-6z",
    team:      "M7 9a3 3 0 100-6 3 3 0 000 6zM2 17a5 5 0 0110 0M15 8a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM18 17a4 4 0 00-3-3.9",
    arrow:     "M4 10h12M11 5l5 5-5 5",
    arrowLeft: "M16 10H4M9 5l-5 5 5 5",
    plus:      "M10 4v12M4 10h12",
    check:     "M4 10l4 4 8-9",
    close:     "M4 4l12 12M16 4L4 16",
    star:      "M10 2l2.4 5 5.6.8-4 3.9.9 5.5L10 14.6l-5 2.6.9-5.5-4-3.9 5.6-.8z",
    chev:      "M6 8l4 4 4-4",
    dot:       "",
    // Create — single 4-point star with a small accent. Cleaner than the
    // old double-asterisk; reads as "make something new".
    sparkles:  "M9.5 2.5l2 5 5 2-5 2-2 5-2-5-5-2 5-2zM16 12.5l.7 1.8 1.8.7-1.8.7L16 17.5l-.7-1.8-1.8-.7 1.8-.7z",
    refresh:   "M4 10a6 6 0 0111-3M16 10a6 6 0 01-11 3M14 4v4h-4M6 16v-4h4",
    flag:      "M5 18V4h9l-1 3 1 3H5",
    edit:      "M4 16l3-1 9-9-2-2-9 9zM13 6l2 2",
    // Library — a 2x2 contact sheet. Reads instantly as "collection",
    // visually distinct from the BIO's book spread.
    files:     "M3 3h6v6H3zM11 3h6v6h-6zM3 11h6v6H3zM11 11h6v6h-6z",
    download:  "M10 3v11M5 9l5 5 5-5M4 17h12",
    mail:      "M3 5h14v10H3zM3 5l7 5 7-5",
    timer:     "M10 7v4l3 2M10 3a7 7 0 100 14 7 7 0 000-14zM8 1h4",
    search:    "M9 16a7 7 0 100-14 7 7 0 000 14zM14 14l4 4",
    filter:    "M3 5h14l-5 7v5l-4 1v-6z",
  };
  const d = paths[name] || paths.dot;
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
      {d.split(/(?=M)/).filter(Boolean).map((p, i) => <path key={i} d={p.trim()} />)}
    </svg>
  );
}

/* ─── Current-brand state ───────────────────────────────────────
   Single source of truth for which brand the workspace is viewing.
   Persisted to localStorage and broadcast via a 'brand:changed' event
   so every data hook (briefs, BIO, library, discovery) can re-fetch
   when the user picks a new brand from the dock-mounted switcher. */
const CURRENT_BRAND_KEY = "ci_current_brand_id";

function getCurrentBrandId() {
  try { return localStorage.getItem(CURRENT_BRAND_KEY) || null; }
  catch { return null; }
}

function setCurrentBrandId(id) {
  try {
    if (id) localStorage.setItem(CURRENT_BRAND_KEY, id);
    else    localStorage.removeItem(CURRENT_BRAND_KEY);
  } catch {}
  // Notify listeners. Custom event because storage events don't fire
  // in the same tab that wrote the value.
  window.dispatchEvent(new CustomEvent("brand:changed", { detail: { id } }));
}

/* Hook — components subscribe to the current brand id and rerender
   when it changes. Returns null until set. */
function useCurrentBrandId() {
  const [id, setId] = React.useState(() => getCurrentBrandId());
  React.useEffect(() => {
    const onChange = (e) => setId(e.detail?.id || null);
    window.addEventListener("brand:changed", onChange);
    return () => window.removeEventListener("brand:changed", onChange);
  }, []);
  return id;
}

Object.assign(window, { getCurrentBrandId, setCurrentBrandId, useCurrentBrandId });

/* Split prose into sentences for line-by-line streaming.            */
/* Respects *…* emphasis spans so a period inside an emphasis        */
/* (e.g. "*Two are obvious. One is a refusal.*") does not split it.  */
function splitSentences(text) {
  const out = [];
  let buf = "", emph = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    buf += ch;
    if (ch === "*") emph = !emph;
    if (!emph && (ch === "." || ch === "!" || ch === "?")) {
      const nxt = text[i + 1];
      if (nxt === undefined || nxt === " " || nxt === "\n") { out.push(buf.trim()); buf = ""; }
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.length ? out : [text];
}

function streamToHtml(s) {
  return s
    .replace(/\*([^*]+)\*/g, '<em class="b-voice">$1</em>')
    .replace(/\n/g, "<br/>");
}

/* Brandolph's voice signature: a brief "reading…" beat, then the    */
/* message arrives one line at a time (opacity + translateX stagger).*/
function StreamedText({ html, stream = true, startDelay = 600, lineStep = 420, className }) {
  const segs = useMemo(() => (stream ? splitSentences(html) : [html]), [html, stream]);
  const reduce = typeof window !== "undefined" && window.matchMedia
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [phase, setPhase] = useState(stream && !reduce ? "thinking" : "lines");

  useEffect(() => {
    if (!stream || reduce) { setPhase("lines"); return; }
    setPhase("thinking");
    const t = setTimeout(() => setPhase("lines"), startDelay);
    return () => clearTimeout(t);
  }, [html, stream, startDelay, reduce]);

  if (stream && !reduce && phase === "thinking") {
    return (
      <span className="b-typing">
        <BrandolphDot state="thinking" />
        <span className="b-typing__label">reading…</span>
      </span>
    );
  }

  const animate = stream && !reduce;
  return (
    <span className={className}>
      {segs.map((s, i) => (
        <span
          key={i}
          className={"b-line" + (animate ? "" : " b-line--static")}
          style={animate ? { animationDelay: i * lineStep + "ms" } : undefined}
          dangerouslySetInnerHTML={{ __html: streamToHtml(s) }}
        />
      ))}
    </span>
  );
}

/* Shared Brandolph message row. Keep this with the chat primitives: both
   Discovery and the workspace use it, so page-local ownership can make a
   successful build fail only when the completion screen renders. */
export function BrandolphLine({ html, who = "brandolph" }) {
  const isBrandolph = who === "brandolph";
  const user = window.CI_USER || {};
  return (
    <div style={{display:"flex", gap: 12, alignItems:"flex-start"}}>
      {isBrandolph ? <BrandolphAvatar /> : (
        <img
          src={user.avatar}
          alt=""
          style={{width: 36, height: 36, borderRadius: "50%", objectFit:"cover"}}
        />
      )}
      <div style={{flex: 1, minWidth: 0}}>
        <div style={{display:"flex", alignItems:"center", gap:8, marginBottom: 4}}>
          <span style={{fontWeight:500, fontSize:13, color:"var(--c-ink)"}}>
            {isBrandolph ? "Brandolph" : (user.name || "You")}
          </span>
          {isBrandolph && <LayerTag layer="L1" />}
          <span className="eyebrow" style={{marginLeft:"auto"}}>now</span>
        </div>
        <div className="b-voice" style={{fontSize: 14.5, lineHeight: 1.6, color:"var(--c-ink)"}}>
          <StreamedText html={html} stream={isBrandolph} />
        </div>
      </div>
    </div>
  );
}

/* Pins — re-render on change; toggle favorite outputs / specialists. */
function usePins() {
  const [, force] = useState(0);
  useEffect(() => {
    const h = () => force(n => n + 1);
    window.addEventListener("ci_pins_change", h);
    return () => window.removeEventListener("ci_pins_change", h);
  }, []);
  return window.CI_PINS;
}

function PinButton({ kind, id, size = 15, style }) {
  const pins = usePins();
  const on = pins.has(kind, id);
  return (
    <button onClick={(e) => { e.stopPropagation(); pins.toggle(kind, id); }} title={on ? "Unpin" : "Pin"}
      aria-pressed={on}
      style={{ border:"none", background:"transparent", cursor:"pointer", padding:2, lineHeight:0,
        color: on ? "var(--yellow-600)" : "var(--c-faint)", ...style }}>
      <svg width={size} height={size} viewBox="0 0 20 20" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
        <path d="M10 2l2.4 5 5.6.8-4 3.9.9 5.5L10 14.6l-5 2.6.9-5.5-4-3.9 5.6-.8z" />
      </svg>
    </button>
  );
}

/* Expose to other Babel files ------------------------------------- */
Object.assign(window, {
  BrandolphDot, BrandolphAvatar, LayerTag, ModelChip, Credit, Confidence,
  AgentCard, OutputCard, StatusPill, Reveal, Drawer, Counter, SlaHeat,
  PageHeader, Icon, useIsTeam, StreamedText, BrandolphLine, usePins, PinButton,
});
