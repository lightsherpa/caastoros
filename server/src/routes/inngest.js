// Inngest serve handler — single Hono request handler that the
// Inngest local dev server (and Inngest Cloud at deploy time) calls
// to introspect functions, replay steps, and stream results back.

import { serve } from "inngest/hono";
import { inngest } from "../lib/inngest.js";
import { compileBio } from "../inngest/functions/compile-bio.js";

export const inngestHandler = serve({
  client: inngest,
  functions: [compileBio],
  signingKey: process.env.INNGEST_SIGNING_KEY,
});
