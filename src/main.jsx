import React from "react";
import ReactDOM from "react-dom/client";

/* i18n boot — set <html lang/dir> from the resolved locale BEFORE first
   paint so RTL/lang-dependent CSS is correct on the very first render.
   Locale is resolved from localStorage → browser → "en" inside the lib. */
import { initI18n } from "./lib/i18n.js";
initI18n();

/* Load order matters: data + primitives populate `window` before the
   screens and shell read them at module-eval time. */
import "./portal-data.js";        // window.CI_* mock data
import "./tweaks-panel.jsx";      // TweaksPanel + tweak controls
import "./portal-shared.jsx";     // shared UI primitives

import "./portal-brandolph.jsx";  // screens
import "./portal-discovery.jsx";
import "./portal-briefs.jsx";
import "./portal-craft.jsx";
import "./portal-team.jsx";
import "./portal-floater.jsx";
import "./portal-admin.jsx";       // admin-only screens (spec editor, future memory)
import "./portal-ops.jsx";         // interactive access governance + Super Admin FinOps
import "./portal-auth.jsx";        // mock auth + login screens

import { App } from "./portal-shell.jsx"; // router + sidebar + topbar

/* App-level error boundary. Without this, any single component throwing
   white-screens the entire SPA (no way to recover, no visible cause). It
   catches the error, shows it on screen instead of a blank page, and lets
   the user reload. Ship-readiness: a partner hitting one bug should see a
   recoverable error, not a dead app. */
class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    this.setState({ info });
    console.error("[CaastorOS] render crash:", error, info?.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    const { error, info } = this.state;
    return (
      <div style={{ maxWidth: 760, margin: "8vh auto", padding: "0 24px", fontFamily: "ui-sans-serif, system-ui, sans-serif", color: "#1a1a1a" }}>
        <div style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 30, marginBottom: 10 }}>Something broke on this screen.</div>
        <p style={{ fontSize: 14.5, color: "#555", lineHeight: 1.55, marginBottom: 20 }}>
          The app caught an error instead of going blank. Reload to recover; if it keeps happening, the message below pinpoints the cause.
        </p>
        <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
          <button onClick={() => window.location.reload()} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#1a1a1a", color: "#fff", fontSize: 13.5, cursor: "pointer" }}>Reload</button>
          <button onClick={() => { try { localStorage.clear(); } catch (e) {} window.location.assign("#/login"); window.location.reload(); }} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", fontSize: 13.5, cursor: "pointer" }}>Clear session + reload</button>
        </div>
        <pre style={{ background: "#faf8f4", border: "1px solid #eee", borderRadius: 10, padding: 16, fontSize: 12, lineHeight: 1.5, overflow: "auto", whiteSpace: "pre-wrap", color: "#7a2020" }}>
{String(error && (error.stack || error.message || error))}
{info?.componentStack ? "\n\nComponent stack:" + info.componentStack : ""}
        </pre>
      </div>
    );
  }
}

/* Reuse one React root across Vite module invalidations. Re-running
   createRoot() during HMR leaves an older tree mounted with stale auth and
   produces an impossible split state (visible workspace, null session). */
const reactRoot = window.__CI_REACT_ROOT__ || ReactDOM.createRoot(document.getElementById("app"));
window.__CI_REACT_ROOT__ = reactRoot;

reactRoot.render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);
