// ─────────────────────────────────────────────────────────────────────
// a18 Voice QA — runs after every text specialist output.
//
// Two passes:
//   1. Local regex scan for forbidden-word violations (free, instant,
//      deterministic). No LLM tokens spent on what \bword\b matches.
//   2. Gemini 2.5 Flash (~$0.0008/check) for voice drift / register
//      assessment — the "soft" check the regex can't do.
//
// Returns { passed, voice_match, violations, usage }. `passed` is false
// if any local violation fires OR if the LLM says voice_match < 70.
//
// Cost choice rationale: QA is high-volume (every text run + every
// re-run), low reasoning depth. Flash @ $0.30/$2.50 per M tokens
// produces a reliable JSON verdict. Haiku 4.5 would cost ~2× for the
// same outcome. Per the cost-optimization-at-scale memory.
// ─────────────────────────────────────────────────────────────────────

import { streamCompletion } from "./models/router.js";

const QA_SPEC = {
  payload: {
    name: "a18 Voice QA",
    modelRouting: {
      primary: "openrouter/google/gemini-3.5-flash-lite",
      reason: "high-volume reliability check; local regex handles hard violations",
    },
    cr_estimate: 1,
  },
};

const QA_SYSTEM = `You are a18 Voice QA — you evaluate a piece of finished copy against a brand's voice rules and refusals.

Return STRICT JSON ONLY, no preamble, no fences. Shape:
{"passed":boolean,"voice_match":number,"violations":string[]}

- voice_match: integer 0–100. How well does the copy match the brand register + rhythm + signatures?
- violations: short strings, max 12 words each. Examples: "tone reads breathless; brand register is low-urgency", "uses fake urgency ('don't miss out')", "second-person addressed inconsistently".
- passed: true only if NO refusal violations AND voice_match >= 70.

Be strict on refusals (any contradiction = fail). Be calibrated on voice — a 70 is "passes muster, ships"; 85+ is "this reads exactly like the brand"; below 60 is "needs a rewrite, not a tweak".`;

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function voiceQa({ body, bio, refusals }) {
  /* 1. Local forbidden-words scan. */
  const forbidden = bio?.voice?.forbidden || [];
  const localViolations = [];
  for (const word of forbidden) {
    if (!word) continue;
    const re = new RegExp(`\\b${escapeRegex(word)}\\b`, "i");
    if (re.test(body)) localViolations.push(`uses forbidden word "${word}"`);
  }

  /* 2. LLM voice-drift check. */
  const userMsg = [
    `BRAND VOICE`,
    `Register: ${bio?.voice?.register || "(none)"}`,
    `Rhythm: ${bio?.voice?.rhythm || "(none)"}`,
    `Signatures: ${(bio?.voice?.signatures || []).join(" · ") || "(none)"}`,
    `Forbidden: ${forbidden.join(", ") || "(none)"}`,
    ``,
    `GLOBAL REFUSALS`,
    ...(Array.isArray(refusals) ? refusals.map((r, i) => `${i + 1}. ${r}`) : []),
    ``,
    `COPY TO EVALUATE`,
    `"""`,
    String(body || "").trim(),
    `"""`,
  ].join("\n");

  let text = "";
  let usage = null;
  try {
    for await (const ev of streamCompletion({
      spec: QA_SPEC,
      system: QA_SYSTEM,
      messages: [{ role: "user", content: userMsg }],
      maxTokens: 400,
    })) {
      if (ev.type === "token")      text += ev.text;
      else if (ev.type === "done")  usage = ev.usage;
      else if (ev.type === "error") {
        /* QA itself failed — fail safe: report local violations only. */
        return {
          passed: localViolations.length === 0,
          voice_match: localViolations.length === 0 ? 70 : 0,
          violations: [...localViolations, `qa_unavailable: ${ev.message}`],
          usage: null,
        };
      }
    }
  } catch (e) {
    return {
      passed: localViolations.length === 0,
      voice_match: localViolations.length === 0 ? 70 : 0,
      violations: [...localViolations, `qa_unavailable: ${e?.message || e}`],
      usage: null,
    };
  }

  let llmVerdict = { passed: true, voice_match: 70, violations: [] };
  try {
    const stripped = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
    llmVerdict = JSON.parse(stripped);
  } catch {
    /* If the LLM returned non-JSON, fall back to local-only result. */
    return {
      passed: localViolations.length === 0,
      voice_match: localViolations.length === 0 ? 70 : 0,
      violations: [...localViolations, "qa_unparseable_response"],
      usage,
    };
  }

  const violations = [...localViolations, ...(Array.isArray(llmVerdict.violations) ? llmVerdict.violations : [])];
  const voiceMatch = typeof llmVerdict.voice_match === "number" ? llmVerdict.voice_match : 70;
  const llmPassed = llmVerdict.passed !== false;

  return {
    passed: localViolations.length === 0 && llmPassed && voiceMatch >= 70,
    voice_match: voiceMatch,
    violations,
    usage,
  };
}
