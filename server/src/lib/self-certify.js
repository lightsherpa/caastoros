// self-certify.js — shared Stage-1 client self-certification.
//
// Extracted from the bios POST /:brandId/self-certify handler so the M3
// discovery "attest" step and the standalone bios endpoint run the SAME gate:
// three affirmed statements, valid field marks, no missing high-importance
// field, and a minimum BIO score. On success it writes an immutable
// bio_attestations record (bound to the exact payload bytes) and flips
// bios.self_certified — which is what unlocks briefing.
//
// Pure-ish: all validation is a pure function of the arguments; the only side
// effects are the two Supabase writes on success. Failures return
// { ok:false, code, error, ... } (with an `error` message HTTP callers can
// pass straight through); success returns { ok:true, score }.

import { supabaseAdmin } from "./supabase.js";
import { scoreBio } from "./score-bio.js";
import { computeFocus } from "./bio-focus.js";
import { payloadHash } from "./bio-hash.js";
import { DEFAULT_RUBRIC } from "./evaluate-certification.js";

/**
 * @param {object} args
 * @param {string}  args.brandId
 * @param {string}  args.bioId              the exact bios row being attested
 * @param {object}  args.payload            that row's BIO payload
 * @param {string}  args.userId             attesting user (auth.userId)
 * @param {object}  args.statements         { authority, reflects, aspirationalMarked }
 * @param {object}  [args.fieldMarks]       { "section.key": "accurate"|"aspirational" }
 * @param {string}  [args.statementVersion] attestation copy version (default "1")
 * @param {number}  [args.minScore]         override; else read the active rubric
 * @returns {Promise<{ok:true, score:number}|{ok:false, code:string, error:string}>}
 */
export async function selfCertifyBio({ brandId, bioId, payload, userId, statements, fieldMarks, statementVersion, minScore }) {
  const marks = (fieldMarks && typeof fieldMarks === "object") ? fieldMarks : {};
  const s = statements || {};
  const version = String(statementVersion || "1");
  const bio = payload || {};

  // 1) All three attestation statements must be affirmed.
  if (!(s.authority && s.reflects && s.aspirationalMarked)) {
    return { ok: false, code: "STATEMENTS_REQUIRED", error: "All three attestation statements must be confirmed" };
  }

  // 2) Any field mark that is present must be a known value.
  for (const [k, v] of Object.entries(marks)) {
    if (v !== "accurate" && v !== "aspirational") {
      return { ok: false, code: "BAD_MARK", error: `Invalid mark for ${k}` };
    }
  }

  // 3) No high-importance field may be missing.
  const highGaps = computeFocus(bio).filter((f) => f.status === "missing" && f.importance >= 1.0);
  if (highGaps.length) {
    return { ok: false, code: "HIGH_IMPORTANCE_GAPS", error: "Fill the high-importance fields before self-certifying", fields: highGaps.map((f) => f.field) };
  }

  // 4) Score must clear the active rubric's self-cert minimum.
  let floor = minScore;
  if (typeof floor !== "number") {
    const { data: rubric } = await supabaseAdmin
      .from("cert_rubric_versions").select("config").eq("active", true).maybeSingle();
    floor = rubric?.config?.selfCertMinScore ?? DEFAULT_RUBRIC.selfCertMinScore;
  }
  const score = scoreBio(bio);
  if (score < floor) {
    return { ok: false, code: "BELOW_MIN_SCORE", error: `BIO score ${score} is below the ${floor} needed to self-certify`, score, minScore: floor };
  }

  // 5) Bind an immutable attestation to the exact payload, then flip the flag.
  await supabaseAdmin.from("bio_attestations").insert({
    bio_id: bioId, brand_id: brandId, attested_by: userId,
    payload_hash: payloadHash(bio), statement_version: version,
    field_marks: marks, self_score: score,
  });
  await supabaseAdmin.from("bios")
    .update({ self_certified: true, self_certified_at: new Date().toISOString() })
    .eq("id", bioId);

  return { ok: true, score };
}
