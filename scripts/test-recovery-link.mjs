// Generates a password-recovery link for an existing user, bypassing
// email delivery. Lets you test the in-app recovery flow without
// waiting for an inbox.
//
// Run:  EMAIL=you@example.com npm run test:recovery
//
// What it does:
//   1. Calls supabase.auth.admin.generateLink({ type:'recovery', email })
//   2. Prints the action_link — paste it into your browser
//   3. SPA: detectSessionInUrl parses the token → PASSWORD_RECOVERY event
//      → App renders Login in "recovery" mode → you set a new password.

import { createClient } from "@supabase/supabase-js";

const email = process.env.EMAIL;
if (!email) { console.error("Usage: EMAIL=you@example.com npm run test:recovery"); process.exit(1); }

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await sb.auth.admin.generateLink({
  type: "recovery",
  email,
  options: { redirectTo: "http://localhost:5173" },
});

if (error) { console.error("generateLink failed:", error.message); process.exit(1); }

console.log("Recovery link (paste into the browser you've been signed in on):\n");
console.log(data.properties?.action_link || "(no action_link in response)");
console.log("\nExpected: SPA loads → recovery form (\"Set a new password\") appears → set a new password → routes to /home.");
