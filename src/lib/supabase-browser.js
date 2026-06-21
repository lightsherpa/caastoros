// ─────────────────────────────────────────────────────────────────────
// Supabase client for the browser SPA.
// Anon key only — service role NEVER ships here. RLS policies on every
// workspace-scoped table are what actually protect data; this client
// just gives us session JWTs and table access shaped by policy.
// ─────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Loud warning so a missing .env.local is obvious in dev console.
  console.error("[supabase-browser] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing — auth + DB reads will fail. Check .env.local at repo root.");
}

export const supabase = createClient(SUPABASE_URL ?? "", SUPABASE_ANON_KEY ?? "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,    // parse magic-link callback from URL hash
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    storageKey: "ci_sb_session",
  },
});

export const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8787";

/**
 * Fetch wrapper that attaches the current session's JWT as Bearer.
 * Routes that read `Authorization: Bearer <jwt>` (e.g. /api/brandolph/ask)
 * use this to resolve the calling user → workspace → brand.
 */
export async function apiFetch(path, init = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = new Headers(init.headers || {});
  if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);
  /* Only force JSON Content-Type for non-FormData bodies — multipart
     uploads need the browser to set the boundary automatically. */
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (init.body && !isFormData && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}
