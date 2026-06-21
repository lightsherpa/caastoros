// PATCH /api/outputs/:id — save the user's edited output body.
// Writes `edited_text` + `edited_at` + `edited_by` INSIDE the existing
// outputs.body JSONB so the original AI output stays intact for audit
// (apis-and-agents-plan §8 — "Per-run audit ... recoverable forever").
// The UI reads body.edited_text if present, else body.text.

import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { recordSignal } from "../lib/brandolph-memory.js";

const app = new Hono();

app.patch("/:id", requireAuth, async (c) => {
  const { workspaceId, userId } = c.get("auth");
  const outputId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text : null;
  if (text == null) return c.json({ error: "text required" }, 400);

  /* Ownership check via the output → brief → brand → workspace chain */
  const { data: output, error: outErr } = await supabaseAdmin
    .from("outputs")
    .select("id, body, run_id, brief:briefs ( brand_id, brand:brands ( workspace_id ) )")
    .eq("id", outputId)
    .maybeSingle();
  if (outErr || !output) return c.json({ error: "Output not found" }, 404);
  if (output.brief?.brand?.workspace_id !== workspaceId) return c.json({ error: "Forbidden" }, 403);

  const nowIso = new Date().toISOString();
  const newBody = {
    ...(output.body || {}),
    edited_text: text,
    edited_at:   nowIso,
    edited_by:   userId,
  };

  const { data: updated, error: updErr } = await supabaseAdmin
    .from("outputs")
    .update({ body: newBody })
    .eq("id", outputId)
    .select("id, body, status")
    .single();
  if (updErr) return c.json({ error: updErr.message }, 500);

  /* Brandolph memory — every edit is a vote that the AI output wasn't
     quite right. We don't know which specialist ran this without
     joining; cheap to fetch separately, gated on success of update. */
  try {
    const { data: run } = await supabaseAdmin
      .from("runs").select("specialist_id").eq("id", output.run_id).maybeSingle();
    recordSignal({
      brandId:      output.brief?.brand_id,
      kind:         "run.edited",
      specialistId: run?.specialist_id,
      runId:        output.run_id,
      outputId,
      createdBy:    userId,
      payload:      { chars_edited: text.length },
    });
  } catch {}

  return c.json({ output: updated });
});

app.delete("/:id", requireAuth, async (c) => {
  const { workspaceId } = c.get("auth");
  const outputId = c.req.param("id");

  /* Ownership check via the output → brief → brand → workspace chain */
  const { data: output, error: outErr } = await supabaseAdmin
    .from("outputs")
    .select("id, brief:briefs ( brand:brands ( workspace_id ) )")
    .eq("id", outputId)
    .maybeSingle();
  if (outErr || !output) return c.json({ error: "Output not found" }, 404);
  if (output.brief?.brand?.workspace_id !== workspaceId) return c.json({ error: "Forbidden" }, 403);

  const { error: delErr } = await supabaseAdmin
    .from("outputs")
    .delete()
    .eq("id", outputId);
  if (delErr) return c.json({ error: delErr.message }, 500);

  return c.json({ ok: true, id: outputId });
});

export default app;
