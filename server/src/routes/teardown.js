// ─────────────────────────────────────────────────────────────────────
// CAA-33 · BIO Teardown v0 (Phase 0a) — public, self-serve lead magnet.
//
// Flow:  POST /start {url}         → create lead workspace+brand (source=teardown),
//                                    fire compile-bio (mode:"teardown"), return leadId
//        GET  /:id                 → JSON: status + scorecard (BIO gated)
//        GET  /:id/report          → self-contained gated HTML report
//        POST /:id/claim {email}   → email gate → PQL + funnel events
//        GET  /:id/bio.json        → BIO download (claimed only)
//        POST /:id/event {name}    → client beacon (pilot CTA click)
//
// No requireAuth: this is the top of the funnel. It uses the service-role
// supabase client, so RLS on teardown_leads/events denies all client access.
// ─────────────────────────────────────────────────────────────────────

import { Hono } from "hono";
import { supabaseAdmin } from "../lib/supabase.js";
import { inngest } from "../lib/inngest.js";
import { teardownScorecard } from "../lib/teardown-scorecard.js";
import { renderReport } from "../lib/teardown-report.js";
import { getOffer } from "../lib/teardown-config.js";
import { emitTeardownEvent, computePql, TEARDOWN_EVENTS as E } from "../lib/teardown-events.js";

const app = new Hono();

// Reuse a still-fresh lead for the same URL instead of re-paying for a compile.
const REUSE_WINDOW_MS = 10 * 60 * 1000;

function normalizeUrl(raw) {
  let s = String(raw || "").trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (!u.hostname.includes(".")) return null;                    // reject bare/localhost
  u.hash = "";
  return { href: u.toString(), host: u.hostname.replace(/^www\./, "") };
}

const publicOffer = (o) => ({
  key: o.key, pilotHeading: o.pilotHeading, pilotBody: o.pilotBody,
  pilotCtaLabel: o.pilotCtaLabel, pilotCtaUrl: o.pilotCtaUrl,
  gateHeading: o.gateHeading, gateSub: o.gateSub, gateCta: o.gateCta,
});

// Latest BIO row for a brand (highest version). Teardown BIOs are uncertified.
async function latestBio(brandId) {
  const { data } = await supabaseAdmin
    .from("bios").select("id, version, payload, score")
    .eq("brand_id", brandId)
    .order("version", { ascending: false }).limit(1).maybeSingle();
  return data || null;
}

// Flip a processing lead → ready once its BIO lands. Idempotent; emits bio_ready once.
async function syncLead(lead) {
  if (lead.status !== "processing") return lead;
  const bio = await latestBio(lead.brand_id);
  if (!bio) return lead;
  const { data: updated } = await supabaseAdmin
    .from("teardown_leads")
    .update({ status: "ready", bio_id: bio.id, score: bio.score, updated_at: new Date().toISOString() })
    .eq("id", lead.id).eq("status", "processing")   // guard: only the first sync wins
    .select("*").maybeSingle();
  if (updated) {
    await emitTeardownEvent(supabaseAdmin, { name: E.BIO_READY, leadId: lead.id, brandId: lead.brand_id, props: { score: bio.score } });
    return updated;
  }
  // lost the race — re-read
  const { data } = await supabaseAdmin.from("teardown_leads").select("*").eq("id", lead.id).maybeSingle();
  return data || lead;
}

async function getLead(id) {
  const { data } = await supabaseAdmin.from("teardown_leads").select("*").eq("id", id).maybeSingle();
  return data || null;
}

/* POST /api/teardown/start  Body:{ url }  → { leadId, brandId, status } */
app.post("/start", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const norm = normalizeUrl(body.url);
  if (!norm) return c.json({ error: "A valid brand URL is required." }, 400);

  // Cost guard: reuse a fresh lead for the same URL.
  const since = new Date(Date.now() - REUSE_WINDOW_MS).toISOString();
  const { data: recent } = await supabaseAdmin
    .from("teardown_leads").select("id, brand_id, status")
    .eq("url", norm.href).gte("created_at", since)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (recent) return c.json({ leadId: recent.id, brandId: recent.brand_id, status: recent.status, reused: true });

  // Throwaway tier-00 workspace to own the lead's brand (claim re-parents it).
  const { data: ws, error: wsErr } = await supabaseAdmin
    .from("workspaces").insert({ name: `teardown:${norm.host}`, tier: "00" })
    .select("id").single();
  if (wsErr) return c.json({ error: `workspace create failed: ${wsErr.message}` }, 500);

  const { data: brand, error: brandErr } = await supabaseAdmin
    .from("brands").insert({ workspace_id: ws.id, name: norm.host, url: norm.href, source: "teardown" })
    .select("id").single();
  if (brandErr) return c.json({ error: `brand create failed: ${brandErr.message}` }, 500);

  const { data: lead, error: leadErr } = await supabaseAdmin
    .from("teardown_leads")
    .insert({ brand_id: brand.id, workspace_id: ws.id, url: norm.href, status: "processing", offer_key: getOffer().key })
    .select("*").single();
  if (leadErr) return c.json({ error: `lead create failed: ${leadErr.message}` }, 500);

  await emitTeardownEvent(supabaseAdmin, { name: E.STARTED, leadId: lead.id, brandId: brand.id, props: { url: norm.href } });

  // Fire the SHARED compiler in teardown mode (skips Steward cert).
  try {
    await inngest.send({ name: "discovery/start", data: { brandId: brand.id, url: norm.href, workspaceId: ws.id, mode: "teardown" } });
  } catch (err) {
    console.error("[teardown] inngest.send failed:", err?.message || err);
    return c.json({ error: "Analysis queue unavailable — try again shortly.", leadId: lead.id }, 503);
  }

  return c.json({ leadId: lead.id, brandId: brand.id, status: "processing" });
});

/* GET /api/teardown/:id → { status, score, scorecard, claimed, offer, bio? } */
app.get("/:id", async (c) => {
  let lead = await getLead(c.req.param("id"));
  if (!lead) return c.json({ error: "not_found" }, 404);
  lead = await syncLead(lead);

  const claimed = lead.status === "claimed";
  const out = { leadId: lead.id, status: lead.status, url: lead.url, claimed, offer: publicOffer(getOffer(lead.offer_key)) };
  if (lead.status === "ready" || claimed) {
    const bio = await latestBio(lead.brand_id);
    if (bio?.payload) {
      out.score = bio.score;
      out.scorecard = teardownScorecard(bio.payload);
      if (claimed) out.bio = bio.payload;              // full BIO only after the gate
    }
  }
  return c.json(out);
});

/* GET /api/teardown/:id/report → self-contained gated HTML */
app.get("/:id/report", async (c) => {
  let lead = await getLead(c.req.param("id"));
  if (!lead) return c.text("Report not found", 404);
  lead = await syncLead(lead);

  const { data: brand } = await supabaseAdmin.from("brands").select("name, url").eq("id", lead.brand_id).maybeSingle();
  const offer = getOffer(lead.offer_key);

  if (lead.status === "processing") {
    // Lightweight auto-refresh while the compile runs (<90s target).
    return c.html(`<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="5">
      <title>Analyzing ${brand?.name || "your brand"}…</title>
      <div style="font:16px system-ui;max-width:520px;margin:80px auto;text-align:center">
      <h1 style="font-size:22px">Reading ${brand?.name || "your brand"}'s public brand…</h1>
      <p style="color:#6b625b">Building your Brand Intelligence Object. This takes under a couple of minutes — the page refreshes itself.</p></div>`);
  }

  const bio = await latestBio(lead.brand_id);
  if (!bio?.payload) return c.text("BIO not available yet — refresh in a moment.", 202);

  await emitTeardownEvent(supabaseAdmin, { name: E.REPORT_VIEWED, leadId: lead.id, brandId: lead.brand_id, props: { claimed: lead.status === "claimed" } });

  const html = renderReport({
    brand: brand?.name || lead.url,
    url: brand?.url || lead.url,
    scorecard: teardownScorecard(bio.payload),
    offer,
    claimed: lead.status === "claimed",
    bioPayload: bio.payload,
    leadId: lead.id,
    apiBase: "",
  });
  return c.html(html);
});

/* POST /api/teardown/:id/claim  Body:{ email } → PQL + events */
app.post("/:id/claim", async (c) => {
  let lead = await getLead(c.req.param("id"));
  if (!lead) return c.json({ error: "not_found" }, 404);
  lead = await syncLead(lead);
  if (lead.status === "processing") return c.json({ error: "Still analyzing — try again in a moment." }, 409);

  const body = await c.req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return c.json({ error: "A valid email is required." }, 400);

  const bio = await latestBio(lead.brand_id);
  const { pql, band } = computePql({ score: bio?.score || 0, engagement: { viewedReport: true, emailProvided: true } });

  const { data: updated, error } = await supabaseAdmin
    .from("teardown_leads")
    .update({ email, status: "claimed", pql_score: pql, pql_band: band, claimed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", lead.id).select("*").single();
  if (error) return c.json({ error: error.message }, 500);

  await emitTeardownEvent(supabaseAdmin, { name: E.EMAIL_CAPTURED, leadId: lead.id, brandId: lead.brand_id, props: { emailDomain: email.split("@")[1] } });
  await emitTeardownEvent(supabaseAdmin, { name: E.PQL_CREATED, leadId: lead.id, brandId: lead.brand_id, props: { pql, band, score: bio?.score || 0 } });

  return c.json({ ok: true, pql, band, offer: publicOffer(getOffer(updated.offer_key)) });
});

/* GET /api/teardown/:id/bio.json → BIO download (claimed only) */
app.get("/:id/bio.json", async (c) => {
  const lead = await getLead(c.req.param("id"));
  if (!lead) return c.json({ error: "not_found" }, 404);
  if (lead.status !== "claimed") return c.json({ error: "Unlock the BIO with your email first." }, 403);

  const bio = await latestBio(lead.brand_id);
  if (!bio?.payload) return c.json({ error: "BIO not available." }, 404);

  await emitTeardownEvent(supabaseAdmin, { name: E.BIO_DOWNLOADED, leadId: lead.id, brandId: lead.brand_id });
  c.header("Content-Disposition", `attachment; filename="bio-${lead.id}.json"`);
  return c.json({ url: lead.url, score: bio.score, bio: bio.payload });
});

/* POST /api/teardown/:id/event  Body:{ name } → client beacon (whitelisted) */
const CLIENT_EVENTS = new Set([E.PILOT_CTA, E.REPORT_VIEWED]);
app.post("/:id/event", async (c) => {
  const lead = await getLead(c.req.param("id"));
  if (!lead) return c.json({ error: "not_found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  if (!CLIENT_EVENTS.has(body.name)) return c.json({ error: "unknown event" }, 400);
  await emitTeardownEvent(supabaseAdmin, { name: body.name, leadId: lead.id, brandId: lead.brand_id, props: { via: "beacon" } });
  return c.json({ ok: true });
});

export default app;
