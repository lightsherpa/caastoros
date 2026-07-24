// Service-role Supabase client. SERVER-SIDE ONLY. Bypasses RLS —
// every consumer of this client must enforce workspace boundaries
// explicitly.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  const msg = "[supabase] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — DB reads will fail.";
  // Fail loud in prod (misconfig should crash the boot); tolerate in dev/tests
  // where the placeholders below keep the module importable.
  if (process.env.NODE_ENV === "production") throw new Error(msg);
  console.warn(msg);
}

// Placeholders keep createClient from throwing "supabaseUrl is required" at
// import time when env is absent (e.g. unit tests). The warning above still
// fires and real DB calls still fail — we just don't crash the module import.
const PLACEHOLDER_URL = "http://localhost:54321";
const PLACEHOLDER_KEY = "missing";

export const supabaseAdmin = createClient(SUPABASE_URL || PLACEHOLDER_URL, SERVICE_KEY || PLACEHOLDER_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
