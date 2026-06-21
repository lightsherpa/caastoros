// Inngest client. In local dev the inngest-cli auto-discovers this
// app via the serve() endpoint mounted at /api/inngest. No keys
// required for local — cloud event/signing keys land at deploy time.

import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "caastor-os",
  eventKey: process.env.INNGEST_EVENT_KEY || "local-dev-key", // ignored by local dev server
});
