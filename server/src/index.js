import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";

import brandolph from "./routes/brandolph.js";
import bios from "./routes/bios.js";
import brands from "./routes/brands.js";
import briefs from "./routes/briefs.js";
import discovery from "./routes/discovery.js";
import discoverySession from "./routes/discovery-session.js";
import discoveryDelegation from "./routes/discovery-delegation.js";
import steward from "./routes/steward.js";
import runs from "./routes/runs.js";
import outputs from "./routes/outputs.js";
import craft from "./routes/craft.js";
import credits from "./routes/credits.js";
import notifications from "./routes/notifications.js";
import billing from "./routes/billing.js";
import admin from "./routes/admin.js";
import languages from "./routes/languages.js";
import me from "./routes/me.js";
import access from "./routes/access.js";
import opex from "./routes/opex.js";
import teamPortal from "./routes/team-portal.js";
import { inngestHandler } from "./routes/inngest.js";

const PORT = Number(process.env.PORT) || 8787;
const CONFIGURED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:5173,http://localhost:4173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const ORIGINS = [...new Set(CONFIGURED_ORIGINS.flatMap((origin) =>
  origin.includes("localhost") ? [origin, origin.replace("localhost", "127.0.0.1")] : [origin]
))];

const app = new Hono();
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin) => (ORIGINS.includes(origin) ? origin : ORIGINS[0]),
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: false,
    maxAge: 600,
  }),
);

app.get("/healthz", (c) =>
  c.json({
    name: "caastoros-server",
    status: "ok",
    model: process.env.MODEL || "claude-sonnet-4-6",
    hasKey: Boolean(process.env.ANTHROPIC_API_KEY),
    allowedOrigins: ORIGINS,
  }),
);

app.route("/api/brandolph", brandolph);
app.route("/api/bios", bios);
app.route("/api/brands", brands);
app.route("/api/briefs", briefs);
app.route("/api/discovery", discovery);
app.route("/api/discovery", discoverySession);      // /session/:brandId, /session/:brandId/attest
app.route("/api/discovery", discoveryDelegation);   // /delegation, /delegation/:token
app.route("/api/steward", steward);
app.route("/api/runs", runs);
app.route("/api/outputs", outputs);
app.route("/api/craft", craft);
app.route("/api/credits", credits);
app.route("/api/notifications", notifications);
app.route("/api/billing", billing);
app.route("/api/admin", admin);
app.route("/api/i18n", languages);
app.route("/api/me", me);
app.route("/api/access", access);
app.route("/api/opex", opex);
app.route("/api/team", teamPortal);
// Inngest serve — local dev server auto-discovers this endpoint
// (GET introspection + POST function invocations + PUT registration).
app.on(["GET", "POST", "PUT"], "/api/inngest", inngestHandler);

// Unmatched /api/* → JSON 404 (registered after the real API routes, before the
// static handlers) so API clients never receive the SPA's index.html.
app.all("/api/*", (c) => c.json({ error: "not_found", path: c.req.path }, 404));

// ── Serve the built SPA (production). Registered after /api routes so the API
// always wins. In dev an absent ../dist just 404s here (the SPA runs on :5173).
// ponytail: root is CWD-relative — start from server/ (npm start does `cd server`).
app.use("/*", serveStatic({ root: "../dist" }));
app.get("*", serveStatic({ path: "../dist/index.html" })); // SPA fallback (hash router)

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`caastoros-server listening on http://localhost:${info.port}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("  ⚠  ANTHROPIC_API_KEY not set — /api/brandolph/ask will 503 until you add it to .env");
  }
});
