import React from "react";
import { supabase, apiFetch } from "./lib/supabase-browser.js";
const { BrandolphAvatar, BrandolphDot, Icon, TweaksPanel, TweakSection, TweakSelect, TweakSlider, TweakRadio, BrandolphHome, Discovery, BioViewer, BriefsLibrary, LiveBriefDetail, SpecialistsDirectory, SpecialistAuthor, CanvasView, Library, BriefBoard, CraftMarketplace, CreditsLedger, SettingsView, FloatingBrandolph, TeamQueue, TeamJob, TeamCapacity, TeamClients, TeamMe, CraftQueue, Login, Onboarding, useSession, getCurrentBrandId, setCurrentBrandId, useCurrentBrandId, AdminSpecs, AdminBrandolphMemory } = window;
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
/* IA LOCKED 2026-05-24 (rev 2) per modes-templates-steward-plan.md §2:
   four sections, two children each, section eyebrows ARE the contents
   (slash-joined). Replaces the earlier Workspace/Brand/Capabilities/Account
   structure. `discovery` and `canvas` are intentionally NOT nav items —
   Discovery is reached from inside BIO ("Re-extract"); Canvas is a
   workspace state, not a destination. Route id `craft` keeps its old id
   so route guard + TopBar.titles don't break; label flips to "Humans".
   The id rename is a follow-up cleanup PR. */
const CLIENT_ROUTES = [
  { id:"home",        label:"Create",      icon:"sparkles", section:"Create / Briefs" },
  { id:"briefs",      label:"Briefs",      icon:"brief",    section:"Create / Briefs" },
  { id:"bio",         label:"BIO",         icon:"bio",      section:"BIO / Library" },
  { id:"library",     label:"Library",     icon:"files",    section:"BIO / Library" },
  { id:"specialists", label:"Specialists", icon:"team",     section:"Specialists / Humans" },
  { id:"craft",       label:"Humans",      icon:"craft",    section:"Specialists / Humans" },
  { id:"credits",     label:"Credits",     icon:"credit",   section:"Credits / Account" },
  { id:"settings",    label:"Account",     icon:"settings", section:"Credits / Account" },
];

const TEAM_ROUTES = [
  { id:"team",          label:"Job queue",     icon:"brief", section:"Team" },
  { id:"team-craft",    label:"Craft polish",  icon:"brief", section:"Team" },
  { id:"team-capacity", label:"Capacity",      icon:"timer", section:"Team" },
  { id:"team-clients",  label:"Clients",       icon:"team",  section:"Team" },
  { id:"team-me",       label:"My earnings",   icon:"credit", section:"Team" },
];

/* Admin-only routes appended below the client nav for users with
   role:'admin'. Keeps the admin's client view intact; adds tools. */
const ADMIN_ROUTES = [
  { id:"admin-specs",     label:"Specs",            icon:"settings", section:"Admin" },
  { id:"admin-brandolph", label:"Brandolph memory", icon:"sparkles", section:"Admin" },
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
const DS_DEFAULTS = { theme: "light", palette: "caastor", font: "inter", density: "cozy" };
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

/* Shell mode — workspace vs default ----------------------------
   Per modes-templates-steward-plan.md rev 2 §7. Workspace mode collapses
   the dock and shrinks the topbar for focus surfaces (brief-detail,
   canvas, board); hover-reveal returns the labels. Driven by the
   `data-shell-mode` attribute on <html>, consumed by CSS rules in
   portal.css. Pure CSS for the visual transitions — no JS layout reads. */
const WORKSPACE_ROUTES = new Set(["brief-detail", "canvas", "board"]);
function useShellMode(routeId) {
  const mode = WORKSPACE_ROUTES.has(routeId) ? "workspace" : "default";
  useShellEffect(() => {
    document.documentElement.dataset.shellMode = mode;
    return () => { delete document.documentElement.dataset.shellMode; };
  }, [mode]);
  return mode;
}

/* Hash router --------------------------------------------------- */
function useRoute() {
  const parse = () => {
    const h = (window.location.hash || "").replace(/^#\/?/, "") || "home";
    const [main, ...rest] = h.split("/");
    return { id: main, param: rest[0] || null, sub: rest[1] || null };
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

/* Workspace switcher ──────────────────────────────────────────────
   Lists every brand the signed-in user has RLS access to and lets
   them switch the active workspace. Selection is persisted via
   setCurrentBrandId() which broadcasts a 'brand:changed' event so
   every data hook (briefs, BIO, library, discovery) re-fetches.
   Mounted inside the AppDock, directly under the logo. */
function useBrandList() {
  const [state, setState] = useShellState({ brands: [], loading: true });
  useShellEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("brands")
        .select("id, name, url, created_at")
        .order("created_at", { ascending: true });
      if (cancelled) return;
      setState({ brands: data || [], loading: false });
      // Seed AND validate the current-brand selection. `brands` is RLS-scoped
      // to the signed-in user's workspaces, so a stored id that isn't in the
      // list is stale — left over from a previous account on this browser
      // (it points at another workspace's brand and 403s every /api/* call).
      // Reset to the first owned brand in both the unset and stale cases.
      const stored = getCurrentBrandId();
      const ownsStored = stored && (data || []).some((b) => b.id === stored);
      if (!ownsStored && data?.[0]?.id) {
        setCurrentBrandId(data[0].id);
      } else if (!data?.length && stored) {
        setCurrentBrandId(null);   // no brands at all → clear stale pointer
      }
    };
    load();
    // Refetch when a brand is added or switched (e.g. "+ Add brand" runs
    // discovery → setCurrentBrandId fires 'brand:changed'); otherwise the
    // newly-created brand never appears in the switcher until a reload.
    // Safe against loops: load() only calls setCurrentBrandId when the stored
    // id isn't owned, which can't recur once the new brand is in the list.
    window.addEventListener("brand:changed", load);
    return () => { cancelled = true; window.removeEventListener("brand:changed", load); };
  }, []);
  return state;
}

/* Workspace tier — drives the brand allowance gate on the switcher's
   "Add brand" action and the highlighted "Current plan" on the upgrade
   page. Fetched once; defaults to "00" (Creek) when absent. */
function useWorkspaceTier() {
  const [tier, setTier] = useShellState("00");
  useShellEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("workspaces")
        .select("tier")
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (data?.tier) setTier(data.tier);
    })();
    return () => { cancelled = true; };
  }, []);
  return tier;
}

/* Live credit balance. Hydrates the window.CI_CREDITS global (which several
   surfaces read directly and mutate optimistically) with the real ledger
   balance + tier pool from /api/credits, and returns a reactive copy so the
   sidebar pill re-renders. The `split` breakdown stays as the placeholder —
   the enforced numbers (balance/monthly) are what matter. */
function useLiveCredits() {
  const [credits, setCredits] = useShellState(window.CI_CREDITS);
  useShellEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await apiFetch("/api/credits");
        if (!r.ok) return;
        const live = await r.json();
        if (!alive || live == null) return;
        Object.assign(window.CI_CREDITS, { balance: live.balance, monthly: live.monthly });
        setCredits({ ...window.CI_CREDITS });
      } catch (e) { /* leave placeholder on failure */ }
    })();
    return () => { alive = false; };
  }, []);
  return credits;
}

function WorkspaceSwitcher() {
  const { brands, loading } = useBrandList();
  const tier = useWorkspaceTier();
  const currentId = useCurrentBrandId();
  const [open, setOpen] = useShellState(false);
  const current = brands.find((b) => b.id === currentId) || brands[0];
  const initial = (current?.name?.trim()?.[0] || "?").toUpperCase();

  const limit = window.CI_BRAND_LIMITS[tier] ?? 1;
  const canAdd = brands.length < limit;
  const onAddBrand = () => {
    window.location.hash = canAdd ? "#/discovery/new" : "#/upgrade";
    setOpen(false);
  };

  // Close on outside click
  const rootRef = React.useRef(null);
  useShellEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (loading || !current) {
    return <div className="ws-switcher ws-switcher--ghost" aria-hidden="true" />;
  }

  return (
    <div className="ws-switcher" ref={rootRef}>
      <button className={"ws-switcher__trigger" + (open ? " ws-switcher__trigger--open" : "")}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox" aria-expanded={open}>
        <span className="ws-switcher__chip" aria-hidden="true">{initial}</span>
        <span className="ws-switcher__name">{current.name || "Workspace"}</span>
        <span className="ws-switcher__chev" aria-hidden="true"><Icon name="chev" size={12} /></span>
      </button>
      {open && (
        <div className="ws-switcher__menu" role="listbox">
          {brands.map((b) => {
            const active = b.id === current.id;
            const ini = (b.name?.trim()?.[0] || "?").toUpperCase();
            return (
              <button key={b.id} role="option" aria-selected={active}
                className={"ws-switcher__option" + (active ? " ws-switcher__option--active" : "")}
                onClick={() => { setCurrentBrandId(b.id); setOpen(false); }}>
                <span className="ws-switcher__chip ws-switcher__chip--sm">{ini}</span>
                <span className="ws-switcher__name">{b.name}</span>
                {active && <span className="ws-switcher__tick"><Icon name="check" size={12} /></span>}
              </button>
            );
          })}
          <div style={{height:1, background:"var(--c-line)", margin:"4px 2px"}} aria-hidden="true" />
          <button type="button"
            className="ws-switcher__option"
            style={{color:"var(--c-dim)"}}
            onClick={onAddBrand}>
            <span className="ws-switcher__chip ws-switcher__chip--sm"
              style={{background:"transparent", color:"var(--c-dim)", boxShadow:"inset 0 0 0 1px var(--c-line)"}}
              aria-hidden="true">+</span>
            <span className="ws-switcher__name" style={{color:"var(--c-dim)"}}>Add brand</span>
          </button>
        </div>
      )}
    </div>
  );
}

/* Top yellow strip --------------------------------------------- */
/* In-app notifications — initial load + Supabase Realtime push (INSERT on the
   recipient's own rows, RLS-scoped). If Realtime isn't enabled on the project
   the subscribe simply no-ops and the initial load still populates the bell. */
function useNotifications() {
  const [items, setItems] = useShellState([]);
  const [unread, setUnread] = useShellState(0);
  useShellEffect(() => {
    let alive = true;
    let channel = null;
    const merge = (rows) => setItems((prev) => {
      const byId = new Map(prev.map((n) => [n.id, n]));
      for (const n of rows) byId.set(n.id, { ...byId.get(n.id), ...n });   // dedup by id
      return [...byId.values()]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 50);
    });
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!alive || !user) return;
      // Subscribe FIRST so a row created during the fetch isn't missed; merge()
      // dedups any overlap between the live push and the fetched snapshot.
      channel = supabase
        .channel("notif:" + user.id)
        .on("postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
          (payload) => {
            if (!alive || !payload.new) return;
            merge([payload.new]);
            setUnread((u) => u + 1);
          })
        .subscribe();
      const r = await apiFetch("/api/notifications");
      if (r.ok && alive) { const d = await r.json(); merge(d.items || []); setUnread(d.unread || 0); }
    })();
    return () => { alive = false; if (channel) supabase.removeChannel(channel); };
  }, []);
  const markAll = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
    setUnread(0);
    try { await apiFetch("/api/notifications/read-all", { method: "POST" }); } catch (e) {}
  };
  const markRead = async (id, wasUnread = true) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: n.read_at || new Date().toISOString() } : n)));
    if (wasUnread) setUnread((u) => Math.max(0, u - 1));
    try { await apiFetch(`/api/notifications/${id}/read`, { method: "PATCH" }); } catch (e) {}
  };
  return { items, unread, markAll, markRead };
}

function notifTimeAgo(iso) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return s + "s ago";
  const m = Math.floor(s / 60); if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60); if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}

function NotificationBell() {
  const { items, unread, markAll, markRead } = useNotifications();
  const [open, setOpen] = useShellState(false);
  const openItem = (n) => {
    markRead(n.id, !n.read_at);
    setOpen(false);
    if (n.link) window.location.hash = String(n.link).replace(/^#/, "");
  };
  return (
    <div style={{position:"relative"}}>
      <button onClick={() => setOpen((o) => !o)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-haspopup="dialog" aria-expanded={open}
        style={{position:"relative", width:32, height:32, borderRadius:9, border:"1px solid var(--c-line)",
          background:"var(--c-card)", cursor:"pointer", display:"inline-flex", alignItems:"center", justifyContent:"center", color:"var(--c-ink)"}}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span style={{position:"absolute", top:-5, right:-5, minWidth:16, height:16, padding:"0 4px", borderRadius:999,
            background:"var(--status-danger)", color:"#fff", fontSize:10, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center"}}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{position:"fixed", inset:0, zIndex:40}} />
          <div style={{position:"absolute", right:0, top:40, width:340, maxHeight:420, overflowY:"auto", zIndex:41,
            background:"var(--c-card)", border:"1px solid var(--c-line)", borderRadius:12, boxShadow:"var(--shadow-lg)"}}>
            <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 14px", borderBottom:"1px solid var(--c-line)"}}>
              <strong style={{fontSize:13}}>Notifications</strong>
              {unread > 0 && <button onClick={markAll} className="btn btn--link" style={{fontSize:12}}>Mark all read</button>}
            </div>
            {items.length === 0 ? (
              <div style={{padding:"28px 14px", textAlign:"center", color:"var(--c-faint)", fontSize:13}}>You're all caught up.</div>
            ) : items.map((n) => (
              <button key={n.id} onClick={() => openItem(n)}
                style={{display:"block", width:"100%", textAlign:"left", border:"none", cursor:"pointer",
                  padding:"12px 14px", borderBottom:"1px solid var(--c-line)",
                  background: n.read_at ? "transparent" : "rgba(var(--brand-glow),0.06)"}}>
                <div style={{display:"flex", gap:8, alignItems:"baseline"}}>
                  {!n.read_at && <span style={{width:7, height:7, borderRadius:"50%", background:"var(--brand)", flexShrink:0, marginTop:5}} />}
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontSize:13, fontWeight:500, color:"var(--c-ink)"}}>{n.title}</div>
                    {n.body && <div style={{fontSize:12, color:"var(--c-dim)", marginTop:2, lineHeight:1.4}}>{n.body}</div>}
                    <div style={{fontSize:11, color:"var(--c-faint)", marginTop:4}}>{notifTimeAgo(n.created_at)}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TopBar({ portal, route, brandName, go }) {
  const isClient = portal === "client";
  /* TopBar titles — eyebrows now match the rev-2 §2 section structure
     (slash-joined section eyebrows that ARE the contents). */
  const titles = {
    home:        ["Create",            "Create / Briefs"],
    discovery:   ["Discovery",         "BIO / Library"],
    bio:         ["BIO",               "BIO / Library"],
    briefs:      ["Briefs",            "Create / Briefs"],
    library:     ["Library",           "BIO / Library"],
    "brief-detail":["Brief",           "Create / Briefs"],
    board:       ["Brief",             "Create / Briefs"],
    specialists: ["Specialists · 33 on shift", "Specialists / Humans"],
    "specialist-new": ["New specialist", "Specialists / Humans"],
    canvas:      ["Canvas",            "Create / Briefs"],
    craft:       ["Humans",            "Specialists / Humans"],
    credits:     ["Credits",           "Credits / Account"],
    settings:    ["Account",           "Credits / Account"],
    upgrade:     ["Plans",             "Credits / Account"],
    team:        ["Job queue",         "Team portal"],
    "team-craft":["Craft polish",       "Team portal"],
    "team-job":  ["Active job",        "Team portal"],
    "team-capacity":["Capacity & SLA", "Team portal"],
    "team-clients":["Client roster",   "Team portal"],
    "team-me":   ["My earnings",       "Team portal"],
    "admin-specs":     ["Specs",            "Admin"],
    "admin-brandolph": ["Brandolph memory", "Admin"],
  };
  const [title, crumb] = titles[route] || [route, ""];
  /* Breadcrumb workspace segment: the team portal is the only surface that
     belongs to the La Mesa team. Client routes — and the admin's client-nav
     surfaces (Briefs / BIO / …) — are brand workspaces, so show the brand
     name there. Showing "La Mesa team" to a client/brand view is a mixed
     mental model (sidebar says "My brand", login said "Client portal"). */
  const ws = portal === "team" ? "La Mesa team" : brandName;
  return (
    <div className="topbar">
      <div className="titlestrip__crumb">{ws} · {crumb}</div>
      <span style={{color:"rgba(48,48,48,0.4)"}}>/</span>
      <div className="topbar__title">{title}</div>
      <div style={{marginLeft:"auto", display:"flex", alignItems:"center", gap: 14}}>
        <NotificationBell />
        {isClient && (
          <button onClick={() => go && go(route === "canvas" ? "briefs" : "home")}
            style={{
              display:"inline-flex", alignItems:"center", gap:7, height:32, padding:"0 14px",
              background:"var(--neutral-900)", color:"#fff", border:"none", borderRadius:9,
              fontFamily:"var(--font-sans)", fontWeight:600, fontSize:13, letterSpacing:"-0.01em",
              cursor:"pointer", boxShadow:"0 2px 6px rgba(0,0,0,0.18)",
            }}>
            <Icon name={route === "canvas" ? "arrowLeft" : "plus"} size={14} />
            {route === "canvas" ? "Exit Canvas" : "Start a brief"}
          </button>
        )}
        {isClient && (
          <div style={{display:"flex", alignItems:"center", gap:6, fontFamily:"var(--font-mono)", fontSize:10.5, letterSpacing:"0.14em", textTransform:"uppercase", color:"rgba(48,48,48,0.7)"}}>
            <BrandolphDot /> Brandolph is reading
          </div>
        )}
        <img src={isClient ? window.CI_USER.avatar : "caastor/assets/profile-1.jpg"} alt="" style={{width: 30, height: 30, borderRadius: "50%", objectFit:"cover", border:"1.5px solid rgba(0,0,0,0.12)"}} />
      </div>
    </div>
  );
}

/* V3 app rail — compact by default and expandable on demand. The prototype
   proved the interaction; this production version keeps live workspaces,
   credits, account state, and role-aware routes. */
const NAV_EXPANDED_KEY = "ci_nav_expanded";
function AppDock({ portal, currentRoute, shellMode, onNav, onLogout }) {
  /* Admins see the client nav + the admin extras. Team users see their
     own nav unchanged. This keeps the admin's everyday surfaces intact
     and just adds operator tooling at the bottom of the dock. */
  const routes = portal === "team"
    ? TEAM_ROUTES
    : portal === "admin"
      ? [...CLIENT_ROUTES, ...ADMIN_ROUTES]
      : CLIENT_ROUTES;
  const isActive = (id) => currentRoute === id
    || (id === "briefs" && currentRoute === "brief-detail")
    || (id === "bio" && currentRoute === "discovery")
    || (id === "specialists" && currentRoute === "specialist-new")
    || (id === "team" && currentRoute === "team-job");

  /* Logo doubles as a "back to dashboard" affordance — clickable
     whenever the user is anywhere except home. A back-arrow chip
     appears next to the logo on non-home routes so the action is
     visible, not hidden behind a tooltip. */
  const homeRoute = portal === "team" ? "team" : "home";
  const isHome = currentRoute === homeRoute;
  const goHome = () => onNav(homeRoute);
  const [expanded, setExpanded] = useShellState(() => {
    try { return localStorage.getItem(NAV_EXPANDED_KEY) === "true"; }
    catch { return false; }
  });
  const [profileOpen, setProfileOpen] = useShellState(false);
  const credits = useLiveCredits();
  const tier = useWorkspaceTier();
  const currentBrandId = useCurrentBrandId();
  const { brands } = useBrandList();
  const currentBrand = brands.find((brand) => brand.id === currentBrandId) || brands[0];
  const userName = window.CI_USER?.name || "Account";
  const userInitials = userName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "CA";
  const planName = window.CI_TIERS?.[tier] || `Tier ${tier}`;

  useShellEffect(() => {
    if (shellMode !== "workspace") return;
    setExpanded(false);
    setProfileOpen(false);
  }, [shellMode]);

  useShellEffect(() => {
    if (!profileOpen) return;
    const onKey = (event) => { if (event.key === "Escape") setProfileOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [profileOpen]);

  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);
    setProfileOpen(false);
    try { localStorage.setItem(NAV_EXPANDED_KEY, String(next)); } catch {}
  };
  const navigate = (routeId) => { setProfileOpen(false); onNav(routeId); };

  return (
    <nav className={`app-dock ${expanded ? "app-dock--expanded" : "app-dock--collapsed"}`} aria-label="Navigation" data-expanded={expanded}>
      <div className="app-dock__head">
        <button
          className={"app-dock__logo" + (isHome ? "" : " app-dock__logo--linked")}
          onClick={isHome ? undefined : goHome}
          disabled={isHome}
          title={isHome ? "CaastorOS" : "Back to dashboard"}
          aria-label={isHome ? "CaastorOS" : "Back to dashboard"}
        >
          <span className="app-dock__brand-mark"><img src="caastor/assets/icon-white.svg" alt="" /></span>
          <span className="app-dock__brand-name">CAASTOR<span className="app-dock__os">OS</span></span>
        </button>
        <button className="app-dock__toggle" onClick={toggleExpanded}
          aria-label={expanded ? "Collapse navigation" : "Expand navigation"}
          aria-expanded={expanded} title={expanded ? "Collapse navigation" : "Expand navigation"}>
          <Icon name={expanded ? "arrowLeft" : "arrow"} size={16} />
        </button>
      </div>
      {portal !== "team" && <WorkspaceSwitcher />}
      <div className="app-dock__items">
        {routes.map((r, i) => (
          <React.Fragment key={r.id}>
            {(i === 0 || r.section !== routes[i - 1].section) && r.section && (
              <div className="app-dock__section">{r.section}</div>
            )}
            <button data-route={r.id} className={"app-dock__item" + (isActive(r.id) ? " app-dock__item--active" : "")} onClick={() => navigate(r.id)}
              aria-label={r.label} title={expanded ? undefined : r.label}>
              <span className="app-dock__icon"><Icon name={r.icon} size={18} /></span>
              <span className="app-dock__label">{r.label}</span>
            </button>
          </React.Fragment>
        ))}
      </div>
      <div className="app-dock__account">
        <button className={"app-dock__profile-trigger" + (profileOpen ? " is-open" : "")}
          onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen}
          aria-label="Open account menu" title={expanded ? undefined : "Account"}>
          {window.CI_USER?.avatar
            ? <img className="app-dock__avatar" src={window.CI_USER.avatar} alt="" />
            : <span className="app-dock__avatar app-dock__avatar--initials">{userInitials}</span>}
          <span className="app-dock__profile-copy"><strong>{userName}</strong><small>{planName} plan</small></span>
          <Icon name="chev" size={13} />
        </button>
        {profileOpen && (
          <>
            <button className="app-dock__profile-scrim" onClick={() => setProfileOpen(false)} aria-label="Close account menu" />
            <aside className="app-dock__profile-menu" aria-label="Account menu">
              <header>
                <span className="app-dock__avatar app-dock__avatar--initials">{userInitials}</span>
                <div><strong>{userName}</strong><small>{currentBrand?.name || "Workspace"} · {portal}</small></div>
              </header>
              <button onClick={() => navigate("credits")}><Icon name="credit" size={16} /><span><strong>Plan &amp; credits</strong><small>{credits.balance} credits available</small></span><Icon name="arrow" size={13} /></button>
              <button onClick={() => navigate("settings")}><Icon name="settings" size={16} /><span><strong>Account settings</strong><small>Workspace and preferences</small></span><Icon name="arrow" size={13} /></button>
              <button onClick={onLogout}><Icon name="arrowLeft" size={16} /><span><strong>Log out</strong><small>End this session</small></span></button>
            </aside>
          </>
        )}
      </div>
    </nav>
  );
}

/* Workspace-mode standalone logo — appears at top-left, outside the
   collapsed dock, vertically aligned with the (now shorter) topbar.
   Per rev-2 plan §7 workspace state feedback: the in-dock logo gets
   clipped at 44-56px dock width and looks broken; pulling it out
   cleans the focus surface up. Only renders in workspace mode —
   defensive in case the CSS hides-in-default rule isn't loaded. */
function WorkspaceLogo({ shellMode }) {
  if (shellMode !== "workspace") return null;
  return (
    <div className="workspace-logo" aria-hidden="true">
      <img src="caastor/assets/icon-white.svg" alt="" />
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
  const shellMode = useShellMode(route.id);

  const onLoginRoute = route.id === "login" || (route.id === "team" && route.param === "login");
  const portal = session ? session.role : "client";

  /* Resolve the real brand name so the TopBar crumb reflects the
     workspace switcher, not the mock CI_BRAND. The palette-shift
     experiment was rolled back per user direction — keep the brand
     plumbing (switcher + data refetch) without recoloring the UI. */
  const currentBrandId = useCurrentBrandId();
  const { brands: allBrands, loading: brandsLoading } = useBrandList();
  const currentBrandName = allBrands.find((b) => b.id === currentBrandId)?.name
                        || allBrands[0]?.name
                        || window.CI_BRAND?.name
                        || "Workspace";

  /* Expose current portal to shared components so they can hide model/route detail on client */
  window.__CI_PORTAL = portal;

  /* Route guard: keep authenticated users inside their own portal, and
     bounce them off login routes back to their home. */
  useShellEffect(() => {
    if (!session) return;
    if (session._recovery) return;                            // stay on the recovery form until new password set
    if (session._pending) return;                             // bootstrap profile lacks real role — wait for async resolve
    if (onLoginRoute) { go(session.role === "team" ? "team" : "home"); return; }
    const selectedBrand = allBrands.find((brand) => brand.id === currentBrandId) || allBrands[0];
    const selectedName = String(selectedBrand?.name || "").trim().toLowerCase();
    const selectedIsPlaceholder = !selectedName || ["my brand", "untitled brand", "new brand"].includes(selectedName);
    if (!brandsLoading && (session.role === "client" || session.role === "admin") && route.id === "home" && selectedIsPlaceholder) {
      go("onboarding");
      return;
    }
    const isClientRoute = CLIENT_ROUTES.some(r => r.id === route.id) || route.id === "brief-detail" || route.id === "home" || route.id === "onboarding" || route.id === "discovery" || route.id === "specialist-new" || route.id === "canvas" || route.id === "board" || route.id === "upgrade";
    const isTeamRoute  = TEAM_ROUTES.some(r => r.id === route.id) || route.id === "team-job";
    const isAdminRoute = ADMIN_ROUTES.some(r => r.id === route.id);
    if (session.role === "client" && !isClientRoute) go("home");
    if (session.role === "team"   && !isTeamRoute  ) go("team");
    if (session.role === "admin"  && !isClientRoute && !isAdminRoute) go("home");
  }, [session, route.id, route.param, onLoginRoute, brandsLoading, allBrands, currentBrandId]);

  /* Not signed in → show the matching login screen.
     OR signed in but in PASSWORD_RECOVERY state (user clicked the
     password-reset email link) → show the recovery form so they MUST
     set a new password before they can reach the portal. */
  if (!session || session._recovery) {
    const role = (route.id === "team" && route.param === "login") ? "team" : "client";
    const initialMode = session?._recovery ? "recovery" : "signin";
    return <Login key={role + "-" + initialMode} role={role} go={go} initialMode={initialMode} />;
  }

  const logout = async () => {
    /* Await sign-out so the session is null BEFORE we navigate to /login —
       otherwise the route guard sees a still-truthy session on the login
       route and bounces back to home, creating a "can't log out" symptom. */
    try { await window.CI_AUTH.signOut(); } catch (e) { console.warn("signOut failed:", e); }
    go("login");
  };

  if (route.id === "onboarding") {
    return <Onboarding key={route.param || "default"} go={go} initialStep={route.param === "brand" ? 2 : route.param === "profile" ? 1 : undefined} />;
  }

  return (
    <div className="app" data-screen-label={portal === "client" ? "Client portal" : "Team portal"}>
      <WorkspaceLogo shellMode={shellMode} />
      <AppDock portal={portal} currentRoute={route.id} shellMode={shellMode} onNav={go} onLogout={logout} />
      <div style={{display:"flex", flexDirection:"column", minWidth:0}}>
        <TopBar portal={portal} route={route.id} brandName={currentBrandName} go={go} />
        <main className="scroll" style={{flex:1, overflowY:"auto"}}>
          <div className="route-view" key={route.id + "/" + (route.param || "") + "/" + (route.sub || "")}>
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
    case "onboarding":   return <Onboarding go={go} initialStep={route.param === "brand" ? 2 : route.param === "profile" ? 1 : undefined} />;
    case "discovery":    return <Discovery go={go} newBrand={route.param === "new"} />;
    case "bio":          return <BioViewer go={go} bioScore={tweaks.bioScore} />;
    case "briefs":       return <BriefsLibrary go={go} />;
    case "library":      return <Library go={go} />;
    case "board":        return <BriefBoard id={route.param} go={go} />;
    case "brief-detail": return <LiveBriefDetail id={route.param} initialTab={route.sub} go={go} />;
    case "specialists":  return <SpecialistsDirectory go={go} />;
    case "specialist-new": return <SpecialistAuthor go={go} />;
    case "canvas":       return <CanvasView go={go} />;
    case "craft":        return <CraftMarketplace go={go} tier={tweaks.tier} />;
    case "credits":      return <CreditsLedger />;
    case "settings":     return <SettingsView />;
    case "upgrade":      return <UpgradeView go={go} param={route.param} />;
    case "team":         return <TeamQueue go={go} />;
    case "team-craft":   return <CraftQueue />;
    case "team-job":     return <TeamJob id={route.param} go={go} />;
    case "team-capacity":return <TeamCapacity />;
    case "team-clients": return <TeamClients />;
    case "team-me":      return <TeamMe />;
    case "admin-specs":     return <AdminSpecs />;
    case "admin-brandolph": return <AdminBrandolphMemory />;
    default:             return <BrandolphHome tweaks={tweaks} setTweak={setTweak} go={go} />;
  }
}

/* Upgrade / plans ------------------------------------------------- */
/* On-brand pricing page. Reachable directly (#/upgrade) and via the
   workspace switcher's gated "Add brand" path (over brand allowance →
   here). Four tiers from CI_TIERS / CI_BRAND_LIMITS; the user's current
   tier is highlighted. Upgrade CTAs are stubs (billing is P7 — Stripe
   not built). No prices: we have none yet. */
const TIER_ORDER = ["00", "01", "02", "03"];
const TIER_BLURBS = {
  "00": "One brand, the full Brandolph crew, and your certified BIO.",
  "01": "Run two brands side by side with shared specialist memory.",
  "02": "Three brands plus priority human craft polish.",
  "03": "Unlimited brands for studios running the whole roster.",
};
function tierAllowance(tier) {
  const n = window.CI_BRAND_LIMITS[tier] ?? 1;
  if (n === Infinity) return "Unlimited brands";
  return n === 1 ? "1 brand" : `${n} brands`;
}

function UpgradeView({ go, param }) {
  const fetchedTier = useWorkspaceTier();
  const [polledTier, setPolledTier] = useShellState(null);
  const currentTier = polledTier || fetchedTier;
  const session = useSession();
  const isAdmin = session?.role === "admin";
  const [note, setNote] = useShellState(null);   // tier id showing the fallback message
  const [busy, setBusy] = useShellState(null);    // tier id whose checkout is starting
  const tiers = window.CI_TIERS || {};
  const currentIdx = TIER_ORDER.indexOf(currentTier);

  // Start a hosted Stripe Checkout for a self-serve tier (01/02). 03 = talk to us.
  // On success the browser leaves for Stripe; any failure (e.g. 503 unconfigured)
  // falls back to the inline note.
  const startCheckout = async (id) => {
    if (id === "03") { setNote(id); return; }
    setBusy(id);
    try {
      const r = await apiFetch("/api/billing/checkout", { method: "POST", body: JSON.stringify({ tier: id }) });
      const { url } = await r.json().catch(() => ({}));
      if (r.ok && url) { window.location.href = url; return; }
      setNote(id);
    } catch (e) { setNote(id); }
    setBusy(null);
  };

  // Returning from Stripe success: the webhook flips workspaces.tier server-side,
  // which can lag the redirect by a second or two — poll a few times to catch it.
  useShellEffect(() => {
    if (param !== "success") return;
    let n = 0, alive = true;
    const tick = async () => {
      const { data } = await supabase.from("workspaces").select("tier").limit(1).maybeSingle();
      if (!alive) return;
      if (data?.tier) setPolledTier(data.tier);
      if (++n < 5) setTimeout(tick, 1500);
    };
    tick();
    return () => { alive = false; };
  }, [param]);

  return (
    <div style={{maxWidth: 1080, margin:"0 auto", padding:"40px 32px 64px"}}>
      <div className="eyebrow" style={{marginBottom: 12}}>Plans</div>
      <h1 style={{
        fontFamily:"var(--font-serif)", fontStyle:"italic", fontWeight: 500,
        fontSize: "clamp(32px, 5vw, 52px)", lineHeight: 1.05, letterSpacing:"-0.02em",
        color:"var(--c-ink)", margin:"0 0 12px",
      }}>
        Grow your studio.
      </h1>
      <p style={{fontSize: 15, color:"var(--c-dim)", lineHeight: 1.5, maxWidth: 520, margin:"0 0 40px"}}>
        Every plan ships the full Brandolph crew and a senior-certified BIO. Choose the
        brand allowance that fits the work in front of you.
      </p>

      {param === "success" && (
        <div className="card" style={{marginBottom: 24, padding:"14px 16px", fontSize: 13, color:"var(--c-ink)", boxShadow:"inset 0 0 0 1.5px var(--status-success)"}}>
          Payment received — your plan is updating. This can take a few seconds.
        </div>
      )}
      {param === "cancel" && (
        <div className="card" style={{marginBottom: 24, padding:"14px 16px", fontSize: 13, color:"var(--c-dim)"}}>
          No changes made. Pick a plan whenever you're ready.
        </div>
      )}

      <div style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap: 16}}>
        {TIER_ORDER.map((id, idx) => {
          const name = tiers[id] || id;
          const isCurrent = id === currentTier;
          const isHigher = idx > currentIdx;
          return (
            <div key={id} className="card"
              style={{
                display:"flex", flexDirection:"column", gap: 14, padding:"22px 20px",
                position:"relative",
                ...(isCurrent ? { boxShadow:"inset 0 0 0 1.5px var(--yellow-500)" } : {}),
              }}>
              {isCurrent && (
                <span className="eyebrow eyebrow--yellow"
                  style={{position:"absolute", top: 16, right: 18}}>
                  Current plan
                </span>
              )}
              <div className="eyebrow">{`Tier ${id}`}</div>
              <div style={{
                fontFamily:"var(--font-serif)", fontStyle:"italic", fontWeight: 500,
                fontSize: 26, lineHeight: 1, color:"var(--c-ink)",
              }}>
                {name}
              </div>
              <div style={{
                fontFamily:"var(--font-mono)", fontSize: 12, letterSpacing:"0.02em",
                color:"var(--c-dim)",
              }}>
                {tierAllowance(id)}
              </div>
              <div style={{fontSize: 13, color:"var(--c-dim)", lineHeight: 1.45, flex: 1}}>
                {TIER_BLURBS[id]}
              </div>
              <div style={{fontFamily:"var(--font-mono)", fontSize: 18, color:"var(--c-ink)"}} aria-hidden="true">—</div>
              {isCurrent ? (
                <button className="btn" disabled
                  style={{width:"100%", justifyContent:"center", opacity: 0.55, cursor:"default"}}>
                  Your plan
                </button>
              ) : isHigher ? (
                !isAdmin ? (
                  <div style={{
                    fontSize: 12, color:"var(--c-dim)", lineHeight: 1.4,
                  }}>
                    Plan changes are managed by your workspace admin.
                  </div>
                ) : (
                  <>
                    <button className="btn btn--primary"
                      style={{width:"100%", justifyContent:"center"}}
                      disabled={busy === id}
                      onClick={() => startCheckout(id)}>
                      {id === "03" ? "Talk to us" : busy === id ? "Starting…" : "Upgrade"}
                    </button>
                    {note === id && (
                      <div style={{
                        fontSize: 12, color:"var(--c-dim)", lineHeight: 1.4,
                        background:"var(--c-bg)", border:"1px solid var(--c-line)",
                        borderRadius: 8, padding:"8px 10px",
                      }}>
                        {id === "03"
                          ? "Reach your Caastor team to set up The Colony 🐜."
                          : "Couldn't start the upgrade just now — please try again or contact your Caastor team."}
                      </div>
                    )}
                  </>
                )
              ) : (
                <button className="btn" disabled
                  style={{width:"100%", justifyContent:"center", opacity: 0.45, cursor:"default"}}>
                  Included
                </button>
              )}
            </div>
          );
        })}
      </div>

      <button className="btn btn--link" style={{marginTop: 28, fontSize: 13}}
        onClick={() => go && go("home")}>
        ← Back to Create
      </button>
    </div>
  );
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

Object.assign(window, { App, TopBar, AppDock });

export { App };
