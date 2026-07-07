// Service-role Supabase client. SERVER-SIDE ONLY. Bypasses RLS —
// every consumer of this client must enforce workspace boundaries
// explicitly (or use the userClient() wrapper that scopes by JWT).

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.warn("[supabase] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — DB reads will fail.");
}

// Placeholders keep createClient from throwing "supabaseUrl is required" at
// import time when env is absent (e.g. unit tests). The warning above still
// fires and real DB calls still fail — we just don't crash the module import.
const PLACEHOLDER_URL = "http://localhost:54321";
const PLACEHOLDER_KEY = "missing";

export const supabaseAdmin = createClient(SUPABASE_URL || PLACEHOLDER_URL, SERVICE_KEY || PLACEHOLDER_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Per-request client scoped to a user JWT. RLS applies normally.
 * Use this when handling an authenticated request and you want
 * workspace isolation enforced by Postgres, not by hand.
 */
export function userClient(jwt) {
  return createClient(SUPABASE_URL || PLACEHOLDER_URL, ANON_KEY || PLACEHOLDER_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}
