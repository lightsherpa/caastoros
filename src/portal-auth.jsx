import React from "react";
import { supabase } from "./lib/supabase-browser.js";

const { Icon, BrandolphAvatar } = window;
/* Real Supabase auth (P0-004) — replaces the prior localStorage mock.
   Uses email+password for dev simplicity. The `handle_new_auth_user`
   trigger we shipped in migration 0001_init creates workspace + brand
   + users row on first sign-up.

   The `useSession()` interface is preserved (shape: {role, email,
   name?, avatar?, workspaceId?, ...}) so portal-shell and other
   consumers don't need to change. Role is resolved from the `users`
   table after sign-in.                                                 */

const { useState: useAuthState, useEffect: useAuthEffect } = React;

/* Synchronously read the stored Supabase session from localStorage so
   `currentProfile` is non-null on the very first React render (before
   the async `getSession()` returns). Without this the App momentarily
   sees session=null on every page refresh and bounces to Login. */
function syncReadStoredUser() {
  try {
    const raw = window.localStorage.getItem("ci_sb_session");
    if (!raw) return null;
    const blob = JSON.parse(raw);
    // Supabase 2.x stores access_token + user directly; older shapes
    // wrapped in `currentSession`. Handle both.
    const session = blob?.access_token ? blob : blob?.currentSession;
    return session?.user || null;
  } catch (e) {
    return null;
  }
}

/* In-memory mirror of the resolved session profile.
   Kept on window for legacy consumers of window.CI_AUTH. */
function bootstrapProfileFromStorage() {
  const u = syncReadStoredUser();
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    role: "client",                                       // refined when async resolveProfile completes
    workspaceId: null,
    name: u.user_metadata?.name || u.email?.split("@")[0] || "User",
    avatar: u.user_metadata?.avatar_url || "caastor/assets/profile-3.jpg",
    at: Date.now(),
    _pending: true,                                       // marker: full profile (role+workspaceId) still loading
  };
}

let currentProfile = bootstrapProfileFromStorage();
const listeners = new Set();
function notify() {
  listeners.forEach((fn) => { try { fn(currentProfile); } catch (e) {} });
  window.dispatchEvent(new Event("ci_auth_change"));
}

/* Resolve role + workspace from `users` table after auth fires. */
async function resolveProfile(authUser) {
  if (!authUser) return null;
  const { data, error } = await supabase
    .from("users")
    .select("id, workspace_id, email, role")
    .eq("id", authUser.id)
    .maybeSingle();
  if (error) console.warn("[auth] users row lookup failed:", error.message);
  return {
    id: authUser.id,
    email: authUser.email,
    role: data?.role || "client",
    workspaceId: data?.workspace_id || null,
    // For UI rendering — name + avatar are decorative; default fallbacks until
    // we add a `users.display_name` column.
    name: authUser.user_metadata?.name || authUser.email?.split("@")[0] || "User",
    avatar: authUser.user_metadata?.avatar_url || "caastor/assets/profile-3.jpg",
    at: Date.now(),
  };
}

/* Public API mirrors the prior mock shape (so window.CI_AUTH consumers work). */
async function signInWithPassword(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  currentProfile = await resolveProfile(data.user);
  notify();
  return currentProfile;
}

async function signUpWithPassword(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  if (!data.session) {
    // Email confirmation is enabled — user needs to verify before they get a session.
    throw new Error("Check your inbox to confirm your email, then sign in. (Or disable 'Confirm email' in Supabase → Authentication → Settings for dev.)");
  }
  currentProfile = await resolveProfile(data.user);
  notify();
  return currentProfile;
}

async function signOut() {
  /* Clear local state IMMEDIATELY — including the localStorage session
     blob — so the UI flips to "signed out" the moment the user clicks
     Log out. If we waited on supabase.auth.signOut() to round-trip the
     server and it stalled or threw, currentProfile would stay set and
     the route guard would bounce the user back to the portal. Local
     cleanup first, backend cleanup as best-effort after. */
  try { window.localStorage.removeItem("ci_sb_session"); } catch (e) {}
  // Clear the per-browser current-brand pointer too — otherwise the next
  // account to sign in on this browser inherits a brand id from a workspace
  // it doesn't own, and every /api/* call 403s until it's reset.
  try { window.localStorage.removeItem("ci_current_brand_id"); } catch (e) {}
  currentProfile = null;
  notify();
  try {
    await supabase.auth.signOut();
  } catch (e) {
    console.warn("supabase.auth.signOut() API failed; local state already cleared:", e);
  }
}

/* Request a password-reset email. The link in the email brings the user
   back to this SPA with a recovery session in the URL fragment, which
   Supabase's `detectSessionInUrl` picks up and surfaces as a
   PASSWORD_RECOVERY auth event. We then route them to the recovery form. */
async function requestPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  if (error) throw error;
}

/* Set a new password during a recovery session. The user must arrive
   here via the email-link flow above; Supabase only allows updateUser
   with a new password when the session is in PASSWORD_RECOVERY state. */
async function setNewPassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

function getSession() {
  return currentProfile;   // synchronous; populated by the auth listener below
}

/* Hydrate session on module load (handles page refresh + magic-link callback).
   Bootstrap above already fills currentProfile synchronously from localStorage
   so the first render isn't blank; this just refines it with the DB-derived
   role + workspace, or clears it if the stored token turns out invalid. */
(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  currentProfile = session?.user ? await resolveProfile(session.user) : null;
  notify();
})();

/* Subscribe to auth state changes (sign in, sign out, token refresh, recovery).
   CRITICAL: this callback must NOT be `async` and must NOT `await` any
   Supabase client calls inside — there's a documented Supabase deadlock
   where the auth lock blocks subsequent supabase.from()/auth.* calls
   issued from within the listener. Symptom: signInWithPassword hangs
   forever, button stuck on "...". Fix: stay synchronous, fire any DB
   work via .then() so it executes outside the lock. */
supabase.auth.onAuthStateChange((event, session) => {
  if (!session?.user) {
    currentProfile = null;
    notify();
    return;
  }
  /* Flip the UI immediately with a partial profile so the user isn't
     waiting on a DB roundtrip to see they're signed in. _pending=true
     tells the route guard to wait before applying redirects. */
  currentProfile = {
    id: session.user.id,
    email: session.user.email,
    role: "client",
    workspaceId: null,
    name: session.user.user_metadata?.name || session.user.email?.split("@")[0] || "User",
    avatar: session.user.user_metadata?.avatar_url || "caastor/assets/profile-3.jpg",
    at: Date.now(),
    _pending: true,
  };
  if (event === "PASSWORD_RECOVERY") currentProfile._recovery = true;
  notify();
  /* Resolve the real role + workspace OUTSIDE the auth-lock. Supabase
     docs explicitly call out setTimeout(0) here — microtask-queue
     (.then() on a resolved promise) runs in the same tick and can still
     hit the lock. */
  setTimeout(() => {
    resolveProfile(session.user).then((profile) => {
      if (!profile) return;
      if (event === "PASSWORD_RECOVERY") profile._recovery = true;
      currentProfile = profile;
      notify();
    }).catch((e) => console.warn("[auth] background profile resolve failed:", e));
  }, 0);
});

window.CI_AUTH = {
  getSession,
  signIn: signInWithPassword,
  signUp: signUpWithPassword,
  signOut,
  requestPasswordReset,
  setNewPassword,
};

/* React hook — same name + shape as the prior mock so consumers don't change. */
function useSession() {
  const [session, setSession] = useAuthState(getSession);
  useAuthEffect(() => {
    const onChange = () => setSession(getSession());
    listeners.add(onChange);
    window.addEventListener("ci_auth_change", onChange);
    return () => {
      listeners.delete(onChange);
      window.removeEventListener("ci_auth_change", onChange);
    };
  }, []);
  return session;
}

/* Role-specific login screen — handles four modes:
   signin   — email + password → sign in
   signup   — email + password → create account
   forgot   — email only → email reset link
   recovery — new password only → set new password (after email link click) */
function Login({ role = "client", go, initialMode = "signin" }) {
  const isTeam = role === "team";
  const [email, setEmail] = useAuthState("");
  const [password, setPassword] = useAuthState("");
  const [showPw, setShowPw] = useAuthState(false);
  const [mode, setMode] = useAuthState(initialMode);
  const [busy, setBusy] = useAuthState(false);
  const [error, setError] = useAuthState(null);
  const [info, setInfo] = useAuthState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null); setInfo(null);
    try {
      if (mode === "signup") {
        const profile = await signUpWithPassword(email, password);
        if (profile) go(profile.role === "team" ? "team" : "home");
      } else if (mode === "forgot") {
        await requestPasswordReset(email);
        setInfo("Check your inbox — we sent you a link to reset your password.");
      } else if (mode === "recovery") {
        await setNewPassword(password);
        /* Clear the recovery flag on the in-memory profile so the App
           routes to the normal portal on the next notify. */
        if (currentProfile) { delete currentProfile._recovery; notify(); }
        go("home");
      } else {
        const profile = await signInWithPassword(email, password);
        go(profile.role === "team" ? "team" : "home");
      }
    } catch (err) {
      const msg = err?.message || String(err);
      if (msg.toLowerCase().includes("check your inbox")) setInfo(msg);
      else setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const showEmail    = mode !== "recovery";
  const showPassword = mode !== "forgot";
  const submitLabel  =
    mode === "signup"   ? "Create account"
    : mode === "forgot"  ? "Send reset link"
    : mode === "recovery" ? "Set new password"
    : "Sign in";
  const heading =
    mode === "signup"   ? "Create your account"
    : mode === "forgot"  ? "Reset your password"
    : mode === "recovery" ? "Set a new password"
    : (isTeam ? "La Mesa creative team" : "Sign in to your brand workspace");

  return (
    <div className={"auth-root" + (isTeam ? " auth-root--team" : "")}>
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-mark" style={{display:"flex", alignItems:"baseline", gap:5}}>
          <img src="caastor/assets/logo-full-yellow.png" alt="CaastorOS" className="brand-logo" style={{height: 38, width:"auto", alignSelf:"center"}} />
          <span style={{fontFamily:"var(--font-mono)", fontSize:18, fontWeight:600, color:"var(--text-primary)", letterSpacing:"0.01em"}}>OS</span>
        </div>
        <h1>{isTeam ? "Team portal" : "Client portal"}</h1>
        <p className="auth-sub">{heading}</p>

        {showEmail && (
          <div className="auth-field">
            <label htmlFor="auth-email">Email</label>
            <input id="auth-email" className="auth-input" type="email" autoComplete="username" required
              value={email} onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { e.stopPropagation(); }} />
          </div>
        )}
        {showPassword && (
        <div className="auth-field">
          <label htmlFor="auth-password">{mode === "recovery" ? "New password" : "Password"}</label>
          <div style={{position:"relative"}}>
            <input
              id="auth-password"
              className="auth-input"
              type={showPw ? "text" : "password"}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              /* Stop key events from bubbling so any global hotkey
                 handler (e.g. an editor command palette) can't swallow
                 Cmd/Ctrl + A/C/V/X while the password field is focused. */
              onKeyDown={(e) => { e.stopPropagation(); }}
              style={{paddingRight: 40}}
            />
            <button
              type="button"
              aria-label={showPw ? "Hide password" : "Show password"}
              onClick={() => setShowPw(v => !v)}
              tabIndex={-1}
              style={{
                position:"absolute", top:"50%", right:8, transform:"translateY(-50%)",
                border:"none", background:"transparent", cursor:"pointer",
                padding:6, lineHeight:0, color:"var(--c-faint)",
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = "var(--c-ink)"}
              onMouseLeave={(e) => e.currentTarget.style.color = "var(--c-faint)"}
            >
              {showPw ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
          {mode === "signin" && (
            <div style={{marginTop:6, textAlign:"right"}}>
              <button type="button" className="btn btn--link" style={{fontSize:12}}
                onClick={() => { setMode("forgot"); setError(null); setInfo(null); }}>
                Forgot password?
              </button>
            </div>
          )}
        </div>
        )}

        {error && <div style={{background:"var(--pink-50, rgba(244,143,177,0.12))", color:"var(--pink-700, var(--pink-500))", padding:"8px 12px", borderRadius:8, fontSize:13, marginTop: 4}}>{error}</div>}
        {info && <div style={{background:"var(--yellow-50, rgba(252,211,77,0.18))", color:"var(--c-ink)", padding:"8px 12px", borderRadius:8, fontSize:13, marginTop: 4}}>{info}</div>}

        <button
          type="submit"
          disabled={busy}
          className="btn btn--primary auth-submit"
          style={isTeam ? { background: "var(--purple-500)", color: "#fff" } : undefined}
        >
          {busy ? "…" : submitLabel} <Icon name="arrow" size={14} />
        </button>

        <div className="auth-alt">
          {mode === "signin" && (
            <span style={{ fontSize: 13.5, color: "var(--c-dim)" }}>
              First time?{" "}
              <button type="button" className="btn btn--link" style={{ textDecoration: "underline" }}
                onClick={() => { setMode("signup"); setError(null); setInfo(null); }}>
                Create an account
              </button>
            </span>
          )}
          {mode === "signup" && (
            <button type="button" className="btn btn--link" onClick={() => { setMode("signin"); setError(null); setInfo(null); }}>
              Already have an account? Sign in →
            </button>
          )}
          {mode === "forgot" && (
            <button type="button" className="btn btn--link" onClick={() => { setMode("signin"); setError(null); setInfo(null); setPassword(""); }}>
              ← Back to sign in
            </button>
          )}
          {mode === "recovery" && (
            /* In recovery mode the user IS signed in (recovery session). The
               only way out without setting a new password is to actually
               sign out — otherwise on reload Supabase re-hydrates the same
               recovery session and they're stuck on this form forever. */
            <button type="button" className="btn btn--link" onClick={async () => {
              try { await signOut(); } catch (e) {}
              setMode("signin"); setError(null); setInfo(null); setPassword("");
            }}>
              ← Sign out and start over
            </button>
          )}
        </div>
        <div className="auth-alt" style={{ marginTop: 16, fontSize: 12, color: "var(--c-faint)" }}>
          {isTeam ? "Not on the team?" : "Caastor team member?"}{" "}
          <a className="btn btn--link" style={{ fontSize: 12 }} href={isTeam ? "#/login" : "#/team/login"}>
            {isTeam ? "Client sign-in" : "Team sign-in"} →
          </a>
        </div>
      </form>
    </div>
  );
}

window.useSession = useSession;
window.Login = Login;
