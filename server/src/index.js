import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";

import brandolph from "./routes/brandolph.js";
import bios from "./routes/bios.js";
import brands from "./routes/brands.js";
import briefs from "./routes/briefs.js";
import discovery from "./routes/discovery.js";
import steward from "./routes/steward.js";
import runs from "./routes/runs.js";
import outputs from "./routes/outputs.js";
import craft from "./routes/craft.js";
import admin from "./routes/admin.js";
import { inngestHandler } from "./routes/inngest.js";

const PORT = Number(process.env.PORT) || 8787;
const ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:5173,http://localhost:4173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

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

app.get("/", (c) =>
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
app.route("/api/steward", steward);
app.route("/api/runs", runs);
app.route("/api/outputs", outputs);
app.route("/api/craft", craft);
app.route("/api/admin", admin);
// Inngest serve — local dev server auto-discovers this endpoint
// (GET introspection + POST function invocations + PUT registration).
app.on(["GET", "POST", "PUT"], "/api/inngest", inngestHandler);

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`caastoros-server listening on http://localhost:${info.port}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("  ⚠  ANTHROPIC_API_KEY not set — /api/brandolph/ask will 503 until you add it to .env");
  }
});
