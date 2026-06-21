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

export const supabaseAdmin = createClient(SUPABASE_URL ?? "", SERVICE_KEY ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Per-request client scoped to a user JWT. RLS applies normally.
 * Use this when handling an authenticated request and you want
 * workspace isolation enforced by Postgres, not by hand.
 */
export function userClient(jwt) {
  return createClient(SUPABASE_URL ?? "", ANON_KEY ?? "", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}
