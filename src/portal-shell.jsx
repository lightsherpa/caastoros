import React from "react";
const { BrandolphAvatar, BrandolphDot, Icon, TweaksPanel, TweakSection, TweakSelect, TweakSlider, TweakRadio, BrandolphHome, Discovery, BioViewer, BriefsLibrary, BriefDetail, SpecialistsDirectory, CanvasView, Library, CraftMarketplace, CreditsLedger, SettingsView, FloatingBrandolph, TeamQueue, TeamJob, TeamCapacity, TeamClients, TeamMe, Login, useSession } = window;
/* Caastor Intelligence — app shell + router + sidebar + topbar.    */
/* Internal hash router; supports client + team portals.            */

const { useState: useShellState, useEffect: useShellEffect } = React;

/* Defaults persisted via the tweaks panel host protocol */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "homeVariant": "create",
  "brandolphMood": "midway",
  "tier": "02",
  "bioScore": 91,
  "assemblyDensity": 7,
  "portal": "client"
}/*EDITMODE-END*/;

/* Routes ---------------------------------------------------------- */
/* Grouped by `section` so the sidebar reads as a hierarchy: the daily
   brief→ship loop first (Workspace), the brand canon next (Brand), the
   "how it works" proof surfaces (Intelligence), then account (Account).
   `discovery` is intentionally NOT a top-level item — it's the one-time
   intake reached from inside Brand Intelligence; the route still works. */
const CLIENT_ROUTES = [
  { id:"home",        label:"Create",             icon:"sparkles", section:"Workspace" },
  { id:"briefs",      label:"Briefs",             icon:"brief",    section:"Workspace" },
  { id:"library",     label:"Library",            icon:"files",    section:"Workspace" },
  { id:"bio",         label:"Brand Intelligence", icon:"bio",      section:"Brand" },
  { id:"specialists", label:"Specialists",        icon:"team",     section:"Intelligence" },
  { id:"canvas",      label:"Canvas",             icon:"canvas",   section:"Intelligence" },
  { id:"craft",       label:"Human craft",        icon:"craft",    section:"Intelligence" },
  { id:"credits",     label:"Credits",            icon:"credit",   section:"Account" },
  { id:"settings",    label:"Settings",           icon:"settings", section:"Account" },
];

const TEAM_ROUTES = [
  { id:"team",          label:"Job queue",     icon:"brief", section:"Team" },
  { id:"team-capacity", label:"Capacity",      icon:"timer", section:"Team" },
  { id:"team-clients",  label:"Clients",       icon:"team",  section:"Team" },
  { id:"team-me",       label:"My earnings",   icon:"credit", section:"Team" },
];

/* useTweaks-style hook (copied to keep app self-contained from the panel) */
function useShellTweaks() {
  const [tweaks, setTweaks] = useShellState(TWEAK_DEFAULTS);
  const setTweak = (k, v) => {
    const next = typeof k === "object" ? { ...tweaks, ...k } : { ...tweaks, [k]: v };
    setTweaks(next);
    window.parent.postMessage({ type: "__edit_mode_set_keys", edits: next }, "*");
  };
  return [tweaks, setTweak];
}

/* Design-system settings — drive the <html data-*> attributes that the
   v2 tokens key off. Persisted to localStorage so the look survives
   reloads. */
const DS_KEY = "ci_ds";
const DS_DEFAULTS = { theme: "light", palette: "citrus", font: "inter", density: "cozy" };
function useDesignSettings() {
  const [ds, setDs] = useShellState(() => {
    try { return { ...DS_DEFAULTS, ...JSON.parse(localStorage.getItem(DS_KEY) || "{}") }; }
    catch (e) { return DS_DEFAULTS; }
  });
  useShellEffect(() => {
    const r = document.documentElement;
    r.setAttribute("data-theme", ds.theme);
    r.setAttribute("data-palette", ds.palette);
    r.setAttribute("data-font", ds.font);
    r.setAttribute("data-density", ds.density);
    try { localStorage.setItem(DS_KEY, JSON.stringify(ds)); } catch (e) {}
  }, [ds.theme, ds.palette, ds.font, ds.density]);
  const setDsKey = (k, v) => setDs(prev => ({ ...prev, [k]: v }));
  return [ds, setDsKey];
}

/* Hash router --------------------------------------------------- */
function useRoute() {
  const parse = () => {
    const h = (window.location.hash || "").replace(/^#\/?/, "") || "home";
    const [main, ...rest] = h.split("/");
    return { id: main, param: rest.join("/") || null };
  };
  const [route, setRoute] = useShellState(parse());
  useShellEffect(() => {
    const onHash = () => setRoute(parse());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const go = (path) => { window.location.hash = "#/" + path; };
  return [route, go];
}

/* Logo / brandmark mini ----------------------------------------- */
function Brandmark() {
  return (
    <div style={{display:"flex", alignItems:"center", gap: 9}}>
      <img src="intelligence/assets/logo-full-yellow.png" alt="Caastor"
        className="brand-logo" style={{height: 24, width:"auto", display:"block"}} />
      <span className="eyebrow" style={{fontSize:9, letterSpacing:"0.18em", paddingTop: 2}}>Intelligence</span>
    </div>
  );
}

/* Sidebar --------------------------------------------------------- */
function Sidebar({ portal, currentRoute, onNav, onLogout, tweaks, brandName, bioScore }) {
  const routes = portal === "team" ? TEAM_ROUTES : CLIENT_ROUTES;
  const isClient = portal === "client";
  const credits = window.CI_CREDITS;
  return (
    <nav className="sidebar">
      {/* Workspace badge */}
      <div style={{padding:"18px 16px 14px", borderBottom:"1px solid var(--c-line)"}}>
        <Brandmark />
      </div>

      {/* Brand selector (client) / team identity (team) */}
      <div style={{padding:"14px 16px 12px", borderBottom:"1px solid var(--c-line)"}}>
        {isClient ? (
          <div className="card" style={{padding:"10px 12px", background:"var(--c-bg)", boxShadow:"none"}}>
            <div style={{display:"flex", alignItems:"center", gap: 10}}>
              <div style={{
                width:30, height:30, borderRadius: 7, background:"var(--neutral-900)",
                color:"#fff", display:"flex", alignItems:"center", justifyContent:"center",
                fontFamily:"var(--font-mono)", fontSize:13, fontWeight:600,
              }}>V</div>
              <div style={{flex:1, minWidth: 0}}>
                <div style={{fontSize:13, fontWeight: 500, color:"var(--c-ink)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{brandName}</div>
                <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--c-faint)", letterSpacing:"0.04em"}}>BIO {bioScore}%</div>
              </div>
              <button className="btn btn--icon btn--ghost" aria-label="Switch brand" style={{height:26, width:26}}>
                <Icon name="chev" size={14} />
              </button>
            </div>
          </div>
        ) : (
          <div className="card" style={{padding:"10px 12px", background:"var(--c-bg)", boxShadow:"none"}}>
            <div style={{display:"flex", alignItems:"center", gap: 10}}>
              <img src="intelligence/assets/profile-1.jpg" alt="" style={{width:30, height:30, borderRadius:"50%", objectFit:"cover"}} />
              <div style={{flex:1, minWidth: 0}}>
                <div style={{fontSize:13, fontWeight: 500, color:"var(--c-ink)"}}>Aitana Vives</div>
                <div className="eyebrow">Senior designer</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Nav items */}
      <div className="scroll" style={{flex:1, overflowY:"auto", padding:"12px 12px"}}>
        <div style={{display:"flex", flexDirection:"column", gap: 1}}>
          {routes.map((r, i) => {
            const showSection = i === 0 || r.section !== routes[i - 1].section;
            const active = currentRoute === r.id
              || (r.id === "briefs" && currentRoute === "brief-detail")
              || (r.id === "bio" && currentRoute === "discovery")
              || (r.id === "team" && currentRoute === "team-job");
            return (
              <React.Fragment key={r.id}>
                {showSection && (
                  <div className="eyebrow" style={{padding: i === 0 ? "4px 12px 8px" : "16px 12px 8px"}}>
                    {r.section}
                  </div>
                )}
                <button onClick={() => onNav(r.id)}
                  className={"navitem" + (active ? " navitem--active" : "")}
                  style={{border:"none", background: undefined, textAlign:"left", width:"100%"}}>
                  <Icon name={r.icon} size={16} />
                  <span>{r.label}</span>
                  {r.id === "bio" && currentRoute !== "discovery" && bioScore < 70 && <BrandolphDot />}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        {isClient && (
          <>
            <div className="eyebrow" style={{padding:"18px 12px 8px"}}>Brandolph</div>
            <div className="card" style={{background:"var(--c-bg)", boxShadow:"none", padding:"10px 12px"}}>
              <div style={{display:"flex", alignItems:"center", gap: 8, marginBottom: 6}}>
                <BrandolphDot />
                <span className="eyebrow eyebrow--yellow">Active</span>
              </div>
              <div style={{fontSize: 12, color:"var(--c-dim)", lineHeight: 1.4}}>
                Reading your BIO. Watching the pricing relaunch through review.
              </div>
            </div>
          </>
        )}
      </div>

      {/* Credits / portal switch footer */}
      {isClient ? (
        <div style={{padding:"12px 16px", borderTop:"1px solid var(--c-line)"}}>
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom: 6}}>
            <span className="eyebrow">Credits</span>
            <span style={{fontFamily:"var(--font-mono)", fontSize:12, color:"var(--c-dim)"}}>
              <strong style={{color:"var(--c-ink)"}}>{credits.balance}</strong> / {credits.monthly}
            </span>
          </div>
          <div style={{height:6, background:"var(--c-line)", borderRadius: 999, overflow:"hidden"}}>
            <div style={{
              height:"100%", width: `${(credits.balance / credits.monthly) * 100}%`,
              background:"var(--yellow-500)", borderRadius:999, transition:"width 600ms ease",
            }} />
          </div>
          <button className="btn btn--link" style={{marginTop: 8, fontSize:12}} onClick={() => onNav("credits")}>
            View ledger →
          </button>
        </div>
      ) : (
        <div style={{padding:"12px 16px", borderTop:"1px solid var(--c-line)"}}>
          <div className="eyebrow" style={{marginBottom:6}}>This week</div>
          <div style={{display:"flex", justifyContent:"space-between", fontSize:13}}>
            <span style={{color:"var(--c-dim)"}}>Jobs delivered</span>
            <strong style={{fontFamily:"var(--font-mono)"}}>14</strong>
          </div>
          <div style={{display:"flex", justifyContent:"space-between", fontSize:13, marginTop: 4}}>
            <span style={{color:"var(--c-dim)"}}>Credits earned</span>
            <strong style={{fontFamily:"var(--font-mono)", color:"var(--green-600)"}}>+1,847</strong>
          </div>
        </div>
      )}

      <button
        onClick={onLogout}
        style={{
          margin:"0 16px 16px", padding:"10px 12px",
          background:"var(--neutral-900)", color:"#fff",
          border:"none", borderRadius: 10,
          fontFamily:"var(--font-mono)", fontSize:10.5, letterSpacing:"0.14em",
          textTransform:"uppercase", fontWeight:500, cursor:"pointer",
          display:"flex", alignItems:"center", justifyContent:"space-between",
        }}
      >
        Log out
        <Icon name="arrow" size={14} />
      </button>
    </nav>
  );
}

/* Top yellow strip --------------------------------------------- */
function TopBar({ portal, route, brandName }) {
  const isClient = portal === "client";
  const titles = {
    home:        ["Create",            "Workspace"],
    discovery:   ["Discovery",         "Brand Intelligence"],
    bio:         ["Brand Intelligence","Workspace"],
    briefs:      ["Briefs",            "Workspace"],
    library:     ["Library",           "Workspace"],
    "brief-detail":["Brief",           "Workspace"],
    specialists: ["Specialists · 33 on shift", "Workspace"],
    canvas:      ["Canvas",            "Workspace"],
    craft:       ["Human craft",       "Workspace"],
    credits:     ["Credits",           "Workspace"],
    settings:    ["Settings",          "Workspace"],
    team:        ["Job queue",         "Team portal"],
    "team-job":  ["Active job",        "Team portal"],
    "team-capacity":["Capacity & SLA", "Team portal"],
    "team-clients":["Client roster",   "Team portal"],
    "team-me":   ["My earnings",       "Team portal"],
  };
  const [title, crumb] = titles[route] || [route, ""];
  const ws = isClient ? brandName : "La Mesa team";
  return (
    <div className="topbar">
      <div className="titlestrip__crumb">{ws} · {crumb}</div>
      <span style={{color:"rgba(48,48,48,0.4)"}}>/</span>
      <div className="topbar__title">{title}</div>
      <div style={{marginLeft:"auto", display:"flex", alignItems:"center", gap: 14}}>
        {isClient && (
          <div style={{display:"flex", alignItems:"center", gap:6, fontFamily:"var(--font-mono)", fontSize:10.5, letterSpacing:"0.14em", textTransform:"uppercase", color:"rgba(48,48,48,0.7)"}}>
            <BrandolphDot /> Brandolph is reading
          </div>
        )}
        <img src={isClient ? window.CI_USER.avatar : "intelligence/assets/profile-1.jpg"} alt="" style={{width: 30, height: 30, borderRadius: "50%", objectFit:"cover", border:"1.5px solid rgba(0,0,0,0.12)"}} />
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/* Root App                                                          */
function App() {
  const [tweaks, setTweak] = useShellTweaks();
  const [route, go] = useRoute();
  const session = useSession();
  const [ds, setDs] = useDesignSettings();

  const onLoginRoute = route.id === "login" || (route.id === "team" && route.param === "login");
  const portal = session ? session.role : "client";

  /* Expose current portal to shared components so they can hide model/route detail on client */
  window.__CI_PORTAL = portal;

  /* Route guard: keep authenticated users inside their own portal, and
     bounce them off login routes back to their home. */
  useShellEffect(() => {
    if (!session) return;
    if (onLoginRoute) { go(session.role === "team" ? "team" : "home"); return; }
    const isClientRoute = CLIENT_ROUTES.some(r => r.id === route.id) || route.id === "brief-detail" || route.id === "home" || route.id === "discovery";
    const isTeamRoute = TEAM_ROUTES.some(r => r.id === route.id) || route.id === "team-job";
    if (session.role === "client" && !isClientRoute) go("home");
    if (session.role === "team"   && !isTeamRoute  ) go("team");
  }, [session, route.id, route.param, onLoginRoute]);

  /* Not signed in → show the matching login screen. */
  if (!session) {
    const role = (route.id === "team" && route.param === "login") ? "team" : "client";
    return <Login key={role} role={role} go={go} />;
  }

  const logout = () => { window.CI_AUTH.signOut(); go("login"); };

  return (
    <div className="app" data-screen-label={portal === "client" ? "Client portal" : "Team portal"}>
      <Sidebar
        portal={portal}
        currentRoute={route.id}
        onNav={go}
        onLogout={logout}
        tweaks={tweaks}
        brandName={window.CI_BRAND.name}
        bioScore={tweaks.bioScore || 91}
      />
      <div style={{display:"flex", flexDirection:"column", minWidth:0}}>
        <TopBar portal={portal} route={route.id} brandName={window.CI_BRAND.name} />
        <main className="scroll" style={{flex:1, overflowY:"auto"}}>
          <div className="route-view" key={route.id + "/" + (route.param || "")}>
            <ScreenRouter route={route} go={go} tweaks={tweaks} setTweak={setTweak} />
          </div>
        </main>
      </div>

      {/* Tweaks panel (host-toggled) */}
      <PortalTweaks tweaks={tweaks} setTweak={setTweak} ds={ds} setDs={setDs} />

      {/* Floating Brandolph mascot — visible on client portal, all screens except /home */}
      <FloatingBrandolph />
    </div>
  );
}

/* Screen router — dispatches to the right page component ------- */
function ScreenRouter({ route, go, tweaks, setTweak }) {
  switch(route.id) {
    case "home":         return <BrandolphHome tweaks={tweaks} setTweak={setTweak} go={go} />;
    case "discovery":    return <Discovery go={go} />;
    case "bio":          return <BioViewer go={go} bioScore={tweaks.bioScore} />;
    case "briefs":       return <BriefsLibrary go={go} />;
    case "library":      return <Library go={go} />;
    case "brief-detail": return <BriefDetail id={route.param} go={go} />;
    case "specialists":  return <SpecialistsDirectory />;
    case "canvas":       return <CanvasView />;
    case "craft":        return <CraftMarketplace go={go} tier={tweaks.tier} />;
    case "credits":      return <CreditsLedger />;
    case "settings":     return <SettingsView />;
    case "team":         return <TeamQueue go={go} />;
    case "team-job":     return <TeamJob id={route.param} go={go} />;
    case "team-capacity":return <TeamCapacity />;
    case "team-clients": return <TeamClients />;
    case "team-me":      return <TeamMe />;
    default:             return <BrandolphHome tweaks={tweaks} setTweak={setTweak} go={go} />;
  }
}

/* Tweaks panel ---------------------------------------------------- */
function PortalTweaks({ tweaks, setTweak, ds, setDs }) {
  return (
    <TweaksPanel title="Tweaks">
      <TweakSection title="Design system">
        <TweakRadio label="Theme"
          value={ds.theme}
          onChange={v => setDs("theme", v)}
          options={[
            { value:"light", label:"Light" },
            { value:"dark",  label:"Dark" },
          ]} />
        <TweakSelect label="Palette"
          value={ds.palette}
          onChange={v => setDs("palette", v)}
          options={[
            { value:"citrus",  label:"Citrus (amber · indigo)" },
            { value:"aurora",  label:"Aurora (violet · lime)" },
            { value:"cobalt",  label:"Cobalt (blue · magenta)" },
            { value:"ember",   label:"Ember (orange · teal)" },
            { value:"caastor", label:"Caastor (yellow · purple)" },
          ]} />
        <TweakSelect label="Font"
          value={ds.font}
          onChange={v => setDs("font", v)}
          options={[
            { value:"inter",     label:"Inter Tight (default)" },
            { value:"geist",     label:"Geist" },
            { value:"plex",      label:"IBM Plex Condensed" },
            { value:"serif-mix", label:"Serif display mix" },
          ]} />
        <TweakRadio label="Density"
          value={ds.density}
          onChange={v => setDs("density", v)}
          options={[
            { value:"comfortable", label:"Comfortable" },
            { value:"cozy",        label:"Cozy" },
            { value:"compact",     label:"Compact" },
          ]} />
      </TweakSection>

      <TweakSection title="Brandolph">
        <TweakSelect label="Home layout"
          value={tweaks.homeVariant}
          onChange={v => setTweak("homeVariant", v)}
          options={[
            { value:"create",   label:"Create launchpad (default)" },
            { value:"console",  label:"Console (chat + assembly)" },
            { value:"cards",    label:"Cards (Brandolph offers options)" },
            { value:"desk",     label:"Desk (operator dashboard)" },
          ]} />
        <TweakSelect label="Opening mood"
          value={tweaks.brandolphMood}
          onChange={v => setTweak("brandolphMood", v)}
          options={[
            { value:"welcome", label:"Welcome (idle this week)" },
            { value:"midway",  label:"Mid-engagement (something running)" },
            { value:"cold",    label:"Cold (months since last brief)" },
            { value:"fresh",   label:"Fresh (no projects yet)" },
          ]} />
        <TweakSlider label="Assembly density (specialists in run)"
          value={tweaks.assemblyDensity} min={3} max={12} step={1}
          onChange={v => setTweak("assemblyDensity", v)} />
      </TweakSection>

      <TweakSection title="Workspace">
        <TweakRadio label="Tier"
          value={tweaks.tier}
          onChange={v => setTweak("tier", v)}
          options={[
            { value:"00", label:"00 Free" },
            { value:"01", label:"01 Studio" },
            { value:"02", label:"02 Brandolph" },
            { value:"03", label:"03 Suite" },
          ]} />
        <TweakSlider label="BIO completeness"
          value={tweaks.bioScore} min={32} max={100} step={1}
          onChange={v => setTweak("bioScore", v)} />
      </TweakSection>
    </TweaksPanel>
  );
}

Object.assign(window, { App, Sidebar, TopBar, Brandmark });

export { App };
