// Language-management routes — user locale, workspace locale policy, and
// translation overrides. Mounted at /api/i18n.
//
//   • GET   /translations        (auth)  — all override rows, grouped by locale
//   • PATCH /me-locale           (auth)  — set the caller's users.locale
//   • GET   /policy              (auth)  — workspace enabled_locales/default_locale
//   • POST  /admin/translations  (admin) — upsert/delete a single override
//   • PATCH /admin/policy        (admin) — set workspace locale policy
//
// Overrides live in `translations(locale, key, value)` (service-role only,
// RLS blocks the client) and are merged over the static JSON catalogs at
// client boot. Writes are a trust boundary — locales are validated strictly.

import { Hono } from "hono";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";

const app = new Hono();

const LOCALES = ["en", "es", "ar"];
const isLocale = (x) => x === "en" || x === "es" || x === "ar";

/* GET /api/i18n/translations — every override row grouped by locale, as a
   flat { key: value } map. All three locale keys always present. */
app.get("/translations", requireAuth, async (c) => {
  const { data, error } = await supabaseAdmin
    .from("translations")
    .select("locale, key, value");
  if (error) return c.json({ error: error.message }, 500);

  const overrides = { en: {}, es: {}, ar: {} };
  for (const row of data || []) {
    if (overrides[row.locale]) overrides[row.locale][row.key] = row.value;
  }
  return c.json({ overrides });
});

/* PATCH /api/i18n/me-locale { locale } — set the caller's UI language. */
app.patch("/me-locale", requireAuth, async (c) => {
  const { userId } = c.get("auth");
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const locale = body?.locale;
  if (!isLocale(locale)) return c.json({ error: "BAD_LOCALE" }, 400);

  const { error } = await supabaseAdmin.from("users").update({ locale }).eq("id", userId);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ ok: true, locale });
});

/* GET /api/i18n/policy — the caller's workspace locale policy. Falls back to
   sensible defaults when the workspace row is missing. */
app.get("/policy", requireAuth, async (c) => {
  const { workspaceId } = c.get("auth");
  const { data, error } = await supabaseAdmin
    .from("workspaces")
    .select("enabled_locales, default_locale")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error) return c.json({ error: error.message }, 500);

  return c.json({
    enabled_locales: data?.enabled_locales ?? ["en", "es", "ar"],
    default_locale: data?.default_locale ?? "en",
  });
});

/* POST /api/i18n/admin/translations { locale, key, value }
   Empty/whitespace value → DELETE the override (fall back to static catalog);
   otherwise UPSERT it. */
app.post("/admin/translations", requireAuth, requireAdmin, async (c) => {
  const { userId } = c.get("auth");
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const { locale, key, value } = body || {};
  if (!isLocale(locale) || typeof key !== "string" || !key.trim()) {
    return c.json({ error: "BAD_INPUT" }, 400);
  }

  if (typeof value !== "string" || !value.trim()) {
    const { error } = await supabaseAdmin
      .from("translations")
      .delete()
      .eq("locale", locale)
      .eq("key", key);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  }

  const { error } = await supabaseAdmin.from("translations").upsert(
    { locale, key, value, updated_by: userId, updated_at: new Date().toISOString() },
    { onConflict: "locale,key" },
  );
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ ok: true });
});

/* PATCH /api/i18n/admin/policy { enabled_locales?, default_locale? }
   Validates that the resulting default_locale is a member of the resulting
   enabled set (400 DEFAULT_NOT_ENABLED). Returns the persisted values. */
app.patch("/admin/policy", requireAuth, requireAdmin, async (c) => {
  const { workspaceId } = c.get("auth");
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const { enabled_locales, default_locale } = body || {};

  if (enabled_locales !== undefined) {
    if (!Array.isArray(enabled_locales) || enabled_locales.length === 0 || !enabled_locales.every(isLocale)) {
      return c.json({ error: "BAD_ENABLED_LOCALES" }, 400);
    }
  }
  if (default_locale !== undefined && !isLocale(default_locale)) {
    return c.json({ error: "BAD_LOCALE" }, 400);
  }

  // Need the current row to compute the resulting set and echo persisted values
  // when only one field is being changed.
  const { data: current, error: readErr } = await supabaseAdmin
    .from("workspaces")
    .select("enabled_locales, default_locale")
    .eq("id", workspaceId)
    .maybeSingle();
  if (readErr) return c.json({ error: readErr.message }, 500);

  const resultingEnabled =
    enabled_locales !== undefined ? enabled_locales : current?.enabled_locales ?? [...LOCALES];
  const resultingDefault =
    default_locale !== undefined ? default_locale : current?.default_locale ?? "en";

  if (!resultingEnabled.includes(resultingDefault)) {
    return c.json({ error: "DEFAULT_NOT_ENABLED" }, 400);
  }

  const patch = {};
  if (enabled_locales !== undefined) patch.enabled_locales = enabled_locales;
  if (default_locale !== undefined) patch.default_locale = default_locale;

  if (Object.keys(patch).length > 0) {
    const { error } = await supabaseAdmin.from("workspaces").update(patch).eq("id", workspaceId);
    if (error) return c.json({ error: error.message }, 500);
  }

  return c.json({ ok: true, enabled_locales: resultingEnabled, default_locale: resultingDefault });
});

export default app;
