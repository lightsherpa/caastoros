import React from "react";
const { Icon, BrandolphAvatar } = window;
/* Caastor Intelligence — mock auth + login screens.                  */
/* Client-side only: a session is persisted to localStorage so a      */
/* reload keeps you signed in. Any credentials are accepted (demo).   */

const { useState: useAuthState, useEffect: useAuthEffect } = React;

const SESSION_KEY = "ci_session";

const IDENTITIES = {
  client: { role:"client", name:"Marina Reyes", email:"marina@vinilo.coffee",   avatar:"intelligence/assets/profile-3.jpg" },
  team:   { role:"team",   name:"Aitana Vives", email:"aitana@lamesa.studio",   avatar:"intelligence/assets/profile-1.jpg" },
};

function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function signIn(role, email) {
  const base = IDENTITIES[role] || IDENTITIES.client;
  const session = { ...base, email: email || base.email, at: Date.now() };
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) {}
  window.dispatchEvent(new Event("ci_auth_change"));
  return session;
}

function signOut() {
  try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  window.dispatchEvent(new Event("ci_auth_change"));
}

window.CI_AUTH = { getSession, signIn, signOut, IDENTITIES };

/* Current session as React state; re-renders on sign in/out (this tab */
/* via the custom event, other tabs via the native storage event).    */
function useSession() {
  const [session, setSession] = useAuthState(getSession);
  useAuthEffect(() => {
    const sync = () => setSession(getSession());
    window.addEventListener("ci_auth_change", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("ci_auth_change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return session;
}

/* Role-specific login screen. */
function Login({ role = "client", go }) {
  const isTeam = role === "team";
  const id = IDENTITIES[isTeam ? "team" : "client"];
  const [email, setEmail] = useAuthState(id.email);
  const [password, setPassword] = useAuthState("demo-access");

  const submit = (e) => {
    e.preventDefault();
    signIn(role, email);
    go(isTeam ? "team" : "home");
  };

  return (
    <div className={"auth-root" + (isTeam ? " auth-root--team" : "")}>
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-mark">
          <BrandolphAvatar size={40} color={isTeam ? "violet" : "yellow"} />
        </div>
        <div className="eyebrow">Caastor Intelligence</div>
        <h1>{isTeam ? "Team portal" : "Client portal"}</h1>
        <p className="auth-sub">
          {isTeam ? "La Mesa creative team" : id.name + " · Vinilo"}
        </p>

        <div className="auth-field">
          <label htmlFor="auth-email">Email</label>
          <input id="auth-email" className="auth-input" type="email" autoComplete="username"
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="auth-field">
          <label htmlFor="auth-password">Password</label>
          <input id="auth-password" className="auth-input" type="password" autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>

        <button
          type="submit"
          className="btn btn--primary auth-submit"
          style={isTeam ? { background: "var(--purple-500)", color: "#fff" } : undefined}
        >
          Sign in <Icon name="arrow" size={14} />
        </button>

        <div className="auth-hint">Demo — any credentials work.</div>
        <div className="auth-alt">
          <a className="btn btn--link" href={isTeam ? "#/login" : "#/team/login"}>
            {isTeam ? "Sign in as a client" : "On the Caastor team? Sign in here"} →
          </a>
        </div>
      </form>
    </div>
  );
}

window.useSession = useSession;
window.Login = Login;
