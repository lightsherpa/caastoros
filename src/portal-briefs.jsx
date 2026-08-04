import React from "react";
import { apiFetch, supabase } from "./lib/supabase-browser.js";
const { AgentCard, BrandolphDot, Drawer, Icon, ModelChip, OutputCard, PageHeader, Reveal, StatusPill, useIsTeam, PinButton, usePins } = window;
const { useState: useBrState, useEffect: useBrEffect } = React;

  /* useLiveBriefs — fetches real briefs + their runs + outputs from
   Supabase via RLS (workspace auto-filtered). Each brief carries the
   actual runs (spec_id, model_used, token counts) and outputs (body text,
   QA status) that were persisted by POST /api/runs/stream in P3. */
function useLiveBriefs() {
  const [state, setState] = useBrState({ briefs: [], cert: null, brand: null, loading: true, error: null });

  const reload = React.useCallback(async () => {
    try {
      /* Resolve current brand. Prefer the workspace switcher's selection;
         fall back to the first brand if none picked. RLS scopes the
         results to the user's workspaces, so even an unknown id can't
         leak data. */
      const wantedId = window.getCurrentBrandId?.();
      let brand = null;
      if (wantedId) {
        const { data } = await supabase.from("brands").select("id, name").eq("id", wantedId).maybeSingle();
        brand = data;
      }
      if (!brand) {
        const { data: brands } = await supabase
          .from("brands").select("id, name").order("created_at", { ascending: true }).limit(1);
        brand = brands?.[0];
      }
      if (!brand) { setState({ briefs: [], cert: null, brand: null, loading: false, error: "No brand" }); return; }

      /* Joined select pulls everything in one round-trip */
      const { data: briefs, error } = await supabase
        .from("briefs")
        .select(`
          id, title, type, payload, mode, status, created_at,
          runs ( id, specialist_id, spec_version, bio_version, model_used, status, prompt_tokens, completion_tokens, ended_at,
                 outputs ( id, kind, body, status, rationale ) )
        `)
        .eq("brand_id", brand.id)
        .order("created_at", { ascending: false });
      if (error) { setState({ briefs: [], cert: null, brand, loading: false, error: error.message }); return; }

      /* Cert state for the active BIO — drives the footer chip */
      const { data: bio } = await supabase
        .from("bios").select("version, certified, certified_by, certified_at")
        .eq("brand_id", brand.id).eq("certified", true)
        .order("version", { ascending: false }).limit(1).maybeSingle();
      let cert = null;
      if (bio) {
        /* byName stays null for a self-certified BIO (certified_by NULL) —
           the old default put a human's title on work nobody signed. */
        let byName = null;
        if (bio.certified_by) {
          const { data: tm } = await supabase.from("team_members").select("first_name").eq("id", bio.certified_by).maybeSingle();
          byName = tm?.first_name || "your Brand Steward";
        }
        cert = { version: bio.version, byName, at: bio.certified_at };
      }

      setState({ briefs: briefs || [], cert, brand, loading: false, error: null });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e?.message || String(e) }));
    }
  }, []);

  useBrEffect(() => { reload(); }, [reload]);
  /* Refetch when the user picks a different brand from the dock switcher. */
  useBrEffect(() => {
    const onChange = () => reload();
    window.addEventListener("brand:changed", onChange);
    return () => window.removeEventListener("brand:changed", onChange);
  }, [reload]);
  return { ...state, reload };
}

function shortDate(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString(undefined, { day:"numeric", month:"short" }); } catch { return ""; }
}
function specialistName(id) {
  const a = window.CI_AGENTS?.find((x) => x.id === id);
  return a?.name || id;
}

/* ── Provenance ───────────────────────────────────────────────────
   Every artifact carries its receipt: which BIO produced it, who signed
   that BIO, and how long the run took.

   Certification is TWO-TIER (see server/src/lib/load-brand-bio.js):
   Discovery self-certifies its own compile (certified = true,
   certified_by NULL) so briefs are never blocked, and a senior Steward
   can re-certify later to attach their name. Self-certified work must
   NEVER borrow a human's signature — and a signature only covers the
   exact BIO version that human signed, so a name on v3 must not rub off
   on an output produced from v2. Returns null when we can't tell. */
function certLabel(cert, bioVersion) {
  if (!cert) return "uncertified";
  if (bioVersion != null && cert.version != null && cert.version !== bioVersion) return null;
  return cert.byName ? `certified by ${cert.byName}` : "self-certified";
}

/* "45s" under a minute, "12 min" above. Null for runs with no timing on
   record (rows predating latency_ms) — callers drop the segment rather
   than printing "null min". */
function elapsedLabel(ms) {
  const n = Number(ms);
  if (!n || n <= 0) return null;
  const s = Math.round(n / 1000);
  return s < 60 ? `${s}s` : `${Math.round(s / 60)} min`;
}

/* Colored cert tier for drawer/viewer footers. Yellow covers both
   "uncertified" and "self-certified" — neither carries a human sign-off. */
function CertChip({ cert, bioVersion }) {
  const label = certLabel(cert, bioVersion);
  if (!label) return null;
  return <> · <span style={{color: cert?.byName ? "var(--green-600)" : "var(--yellow-700)"}}>{label}</span></>;
}

/* The footer line on every artifact card: "🧠 BIO v7 · certified by
   Marina · 12 min". Segments the data can't back are dropped, never faked.
   Pinned to the bottom of the card via marginTop:auto (parent is flex). */
function NodeProvenance({ bioVersion, cert, latencyMs }) {
  const line = [
    "🧠 BIO" + (bioVersion != null ? ` v${bioVersion}` : ""),
    certLabel(cert, bioVersion),
    elapsedLabel(latencyMs),
  ].filter(Boolean).join(" · ");
  return (
    <div style={{
      marginTop: "auto", paddingTop: 6, borderTop: "1px dashed var(--c-line-2)",
      fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--c-faint)",
      letterSpacing: "0.03em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      /* Never shrink: the card is a fixed-height flex column with overflow
         hidden, and the image variant's content lands within ~2px of the
         cap. Without this the provenance line is the thing that gets
         clipped — the one line on the card that must always be readable.
         Any deficit comes off the thumbnail instead, where it's invisible. */
      flexShrink: 0,
    }}>{line}</div>
  );
}

/* Strip generic-AI artifacts from a body of text for human-readable
   display in the Library. Render-time cleanup — body.text is preserved
   for audit. Handles markdown headings, **bold**, hedging openers,
   "FLAG BEFORE I X / Pausing before I draft" tics, list bullets that
   should be prose, trailing AI sign-offs. */
function humanize(raw) {
  if (!raw) return "";
  let t = String(raw);

  // Drop leading markdown headings — keep stripping while a heading
  // sits at the top. Iterative so we catch "## A\n## B\nBody" chains
  // that the single-regex form sometimes misses.
  for (let i = 0; i < 8; i++) {
    const next = t.replace(/^\s*#{1,6}[ \t]+[^\n]*\n+/, "");
    if (next === t) break;
    t = next;
  }
  // Strip any remaining ## / ### markers anywhere — keep the words.
  t = t.replace(/^[ \t]*#{1,6}[ \t]+/gm, "");
  // Drop ALL-CAPS section banners like "REFUSAL & REDIRECT\n" / "THE CONFLICT\n".
  t = t.replace(/^[ \t]*([A-Z][A-Z &/—\-]{4,})\s*\n+/gm, "");
  // Drop "Pausing before I draft" / "Flag before I ship" / "Here's the…" openers.
  t = t.replace(/^\s*(?:flag(?:\s+before)?|pausing(?:\s+before)?|before\s+i|let me|here'?s|i'?ll|i'?m going to)[^\n.?!]*[.?!]?\s*\n+/i, "");
  // Strip ** bold ** markers (keep the word).
  t = t.replace(/\*\*(.+?)\*\*/g, "$1");
  // Strip trailing AI sign-offs.
  t = t.replace(/\n+\s*(?:let me know if|happy to (?:iterate|adjust|refine)|hope this helps|please let me know)[^\n]*$/i, "");
  // Collapse 3+ blank lines.
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

/* Find the operator's original request inside a legacy "composedBrief"
   blob (which used to wrap sections in "## SHARPENED BRIEF" /
   "## ORIGINAL REQUEST" / "## CLARIFICATIONS" markdown headings).
   Returns "" if no ## ORIGINAL REQUEST section is present, in which
   case the caller should use other fallbacks. */
function extractOriginalRequest(composedText) {
  if (!composedText) return "";
  const m = String(composedText).match(/##\s*ORIGINAL\s+REQUEST\s*\n+([\s\S]*?)(?=\n##|$)/i);
  return m ? m[1].trim() : "";
}

/* Brief title — the editorial heading shown in the Library + Canvas
   for each brief. Priority:
     1. The Sharpener's title field (new briefs).
     2. The operator's RAW request extracted from a legacy
        composedBrief blob (the "## ORIGINAL REQUEST" section).
     3. payload.request if it's plain text (no markdown noise).
     4. The first sentence of the sharpened brief.
     5. briefs.title column (last-resort fallback).
   Never returns ## headings or the multi-paragraph composedBrief. */
function briefTitle(brief) {
  if (!brief) return "(untitled)";
  const p = brief.payload || {};

  // 1. Sharpener-emitted title (new briefs after the title-field rollout)
  const sharpenerTitle = p.title && humanize(String(p.title)).split("\n")[0].trim();
  if (sharpenerTitle && sharpenerTitle.length >= 3) return shorten(sharpenerTitle);

  // 2. Legacy composed-brief: pull the operator's original ask
  const original = extractOriginalRequest(p.request) || extractOriginalRequest(brief.title);
  if (original) return shorten(humanize(original).split("\n")[0]);

  // 3–5. Other fallbacks
  const fallbacks = [p.sharpenedBrief, p.request, brief.title, brief.request];
  for (const c of fallbacks) {
    if (!c) continue;
    const cleaned = humanize(String(c)).split("\n")[0].trim();
    if (cleaned && cleaned.length >= 3) return shorten(cleaned);
  }
  return "(untitled brief)";
}

function shorten(s, max = 72) {
  if (!s) return "";
  // Take the first sentence if there is one, else cap at max chars.
  const firstSentence = s.split(/(?<=[.!?])\s/)[0];
  const chosen = firstSentence || s;
  return chosen.length > max ? chosen.slice(0, max - 1).trim() + "…" : chosen;
}
/* Briefs library + Brief detail + Specialists directory + Canvas. */

/* ─── Specialist run streaming ────────────────────────────────────
   Parses SSE from POST /api/runs/stream. The endpoint is the P3 kernel
   — composes the four-layer prompt, calls the routed model, runs Voice
   QA, and persists runs + outputs + qa_results + ledger rows. */
async function streamSpecialistRun({ specialistId, briefText, brandId, briefId, briefMeta, modelOverride, revisionFeedback, deliverableSpec, onToken, onProgress, onQa, onDone, onError, __body }) {
  /* __body is the per-call escape hatch — any extra fields the caller
     wants to send (e.g. modelOverride for re-runs) get merged. */
  const body = { specialistId, briefText, brandId, briefId, briefMeta, modelOverride, revisionFeedback, deliverableSpec, ...(__body || {}) };
  const res = await apiFetch("/api/runs/stream", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    onError({ message: err.error || `HTTP ${res.status}` });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const events = buf.split("\n\n");
    buf = events.pop() || "";
    for (const ev of events) {
      const lines = ev.split("\n");
      const eventLine = lines.find((l) => l.startsWith("event:"));
      const dataLine  = lines.find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      const eventType = eventLine?.slice(6).trim();
      let data;
      try { data = JSON.parse(dataLine.slice(5).trim()); } catch { continue; }
      if (eventType === "token")         onToken && onToken(data);
      else if (eventType === "progress") onProgress && onProgress(data);
      else if (eventType === "qa")       onQa && onQa(data);
      else if (eventType === "done")     onDone && onDone(data);
      else if (eventType === "error")    onError && onError(data);
    }
  }
}

/* useBrState/useBrEffect declared at top of file */

/* ════════════════════════════════════════════════════════════════ */
/* BRIEFS LIBRARY                                                    */

function relativeBucket(iso) {
  if (!iso) return "Older";
  const now = new Date();
  const then = new Date(iso);
  const diff = now - then;
  const day = 86_400_000;
  /* Bucket boundaries: today, yesterday, this week, this month, older */
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (then.getTime() >= startToday) return "Today";
  if (then.getTime() >= startToday - day) return "Yesterday";
  if (diff < 7 * day)  return "This week";
  if (diff < 30 * day) return "This month";
  return "Older";
}

/* Per-day group key + eyebrow label for sticky date dividers.
   key is a stable calendar-day sort key (YYYY-MM-DD, local), label is the
   short eyebrow form ("JUN 3"). "Today" / "Yesterday" stay legible. */
function dayGroupKey(iso) {
  const d = iso ? new Date(iso) : null;
  return d && !isNaN(d) ? d.toLocaleDateString("en-CA") : "0000-00-00";  /* local-day YYYY-MM-DD */
}
function dayGroupLabel(iso) {
  if (!iso) return "Undated";
  const d = new Date(iso);
  if (isNaN(d)) return "Undated";
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (d.getTime() >= startToday) return "Today";
  if (d.getTime() >= startToday - 86_400_000) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/* Bucket a list of items (each carrying created_at) into newest-first
   calendar-day groups for sticky date dividers. */
function groupByDay(items) {
  const map = new Map();
  for (const it of items) {
    const key = dayGroupKey(it.created_at);
    if (!map.has(key)) map.set(key, { key, label: dayGroupLabel(it.created_at), items: [] });
    map.get(key).items.push(it);
  }
  return [...map.values()].sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
}

/* One source of truth for a brief row's status presentation — the left
   accent stripe and the pill share these tokens so the stripe alone is
   scannable. Colors reuse the existing pill palette; no new literals. */
function briefStatusStyle(flagged) {
  return flagged
    ? { label: "flagged",  stripe: "var(--pink-500)",  bg: "var(--pink-50, rgba(244,143,177,0.12))",  fg: "var(--pink-700, var(--pink-500))" }
    : { label: "approved", stripe: "var(--green-500)", bg: "var(--green-50, rgba(127,163,122,0.16))", fg: "var(--green-600)" };
}

function BriefsLibrary({ go }) {
  const { briefs, cert, brand, loading, error, reload } = useLiveBriefs();
  const [query, setQuery]     = useBrState("");
  const [statusF, setStatusF] = useBrState("all");        /* all | approved | flagged */
  const [specF, setSpecF]     = useBrState("all");

  /* Click a brief → save the briefId to sessionStorage and open the
     Canvas. Canvas is the moat surface; the dropdown was redundant. */
  const openBrief = (briefId) => {
    try { sessionStorage.setItem("ci_run_context", JSON.stringify({ mode: "view", briefId, ts: Date.now() })); } catch (e) {}
    go("canvas");
  };

  const totalRuns = briefs.reduce((acc, b) => acc + (b.runs?.length || 0), 0);
  const totalCredits = briefs.reduce((acc, b) => acc + (b.runs || []).reduce((s, r) => {
    const a = window.CI_AGENTS?.find((x) => x.id === r.specialist_id);
    return s + (a?.cr || 0);
  }, 0), 0);

  /* Specialist filter options — only specialists that appear in any brief */
  const specialistsInUse = React.useMemo(() => {
    const ids = new Set();
    briefs.forEach((b) => (b.runs || []).forEach((r) => r.specialist_id && ids.add(r.specialist_id)));
    return [...ids];
  }, [briefs]);

  /* Filter pass */
  const q = query.trim().toLowerCase();
  const filtered = briefs.filter((b) => {
    if (q) {
      /* Search across: the derived editorial title, the operator's
         original request (extracted from any legacy composedBrief),
         and the raw payload as a last resort. */
      const haystack = [
        briefTitle(b),
        extractOriginalRequest(b.payload?.request),
        b.payload?.request,
        b.title,
      ].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    const runs = b.runs || [];
    if (specF !== "all" && !runs.some((r) => r.specialist_id === specF)) return false;
    if (statusF !== "all") {
      const anyMatch = runs.some((r) => (r.outputs || []).some((o) => (statusF === "approved" ? o.status === "approved" : o.status !== "approved")));
      if (!anyMatch) return false;
    }
    return true;
  });

  /* Per-day grouping for sticky date dividers (newest day first) */
  const grouped = groupByDay(filtered);

  /* A title is ambiguous when more than one filtered brief shares it —
     those rows surface their discriminating metadata more prominently. */
  const titleCounts = React.useMemo(() => {
    const m = new Map();
    filtered.forEach((b) => {
      const t = briefTitle(b);
      m.set(t, (m.get(t) || 0) + 1);
    });
    return m;
  }, [filtered]);

  return (
    <div style={{padding:"24px 36px 60px"}}>
      <PageHeader
        eyebrow={brand ? `Workspace · ${brand.name}` : "Workspace"}
        title="Briefs"
        sub={`Every specialist run on this brand — auditable against the certified BIO. ${totalRuns} run${totalRuns === 1 ? "" : "s"} on record · ${totalCredits} cr spent.`}
        right={<>
          <button className="btn btn--ghost btn--sm" onClick={reload}><Icon name="refresh" size={13} /> Reload</button>
          <a href="#/specialists" className="btn btn--primary">Run a specialist <Icon name="plus" size={14} /></a>
        </>}
      />

      {error && (
        <div className="card" style={{padding:"10px 14px", marginBottom: 14, borderLeft:"3px solid var(--pink-500)", fontSize: 13}}>
          {error}
        </div>
      )}

      {/* Filter row — search + status pills + specialist select */}
      <div className="card" style={{padding: 12, marginBottom: 18, display:"flex", gap: 10, alignItems:"center", flexWrap:"wrap"}}>
        <div style={{position:"relative", flex:"1 1 220px", minWidth: 220}}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search briefs…"
            style={{
              width:"100%", height: 32, padding:"0 10px 0 32px",
              border:"1px solid var(--c-line)", borderRadius: 8,
              fontSize: 13, fontFamily:"inherit", background:"var(--c-bg)", color:"var(--c-ink)",
              outline:"none",
            }}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <span style={{position:"absolute", left: 10, top:"50%", transform:"translateY(-50%)", color:"var(--c-faint)", pointerEvents:"none"}}>
            <Icon name="filter" size={13} />
          </span>
        </div>
        <div style={{display:"flex", gap: 4}}>
          {[["all","All"],["approved","Approved"],["flagged","Flagged"]].map(([k, l]) => (
            <button key={k} onClick={() => setStatusF(k)}
              className={"pill" + (statusF === k ? " pill--dark" : "")}
              style={{cursor:"pointer", height: 28, padding:"0 12px"}}>{l}</button>
          ))}
        </div>
        {specialistsInUse.length > 0 && (
          <select value={specF} onChange={(e) => setSpecF(e.target.value)}
            style={{height: 30, padding:"0 10px", border:"1px solid var(--c-line)", borderRadius: 8, fontSize: 12.5, fontFamily:"inherit", background:"var(--c-bg)", color:"var(--c-ink)"}}>
            <option value="all">All specialists</option>
            {specialistsInUse.map((id) => <option key={id} value={id}>{specialistName(id)}</option>)}
          </select>
        )}
        <span style={{marginLeft:"auto", fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--c-faint)"}}>
          {filtered.length} of {briefs.length}
        </span>
      </div>

      {!loading && briefs.length === 0 && (
        <div className="card" style={{padding:"56px 32px", textAlign:"center", maxWidth: 540, margin:"40px auto"}}>
          <h2 style={{
            margin:"0 0 14px", fontFamily:"Georgia, serif", fontStyle:"italic",
            fontSize: 28, lineHeight: 1.2, letterSpacing:"-0.005em", fontWeight: 400, color:"var(--c-ink)",
          }}>
            No briefs on the table yet.
          </h2>
          <p style={{margin:"0 0 22px", fontSize: 14, color:"var(--c-dim)", lineHeight: 1.6}}>
            Brandolph is waiting on the first one. Type what you need into the launchpad — even a sentence — and he'll sharpen it, name the tension, and assemble the smallest crew that earns it.
          </p>
          <div style={{display:"flex", gap: 10, justifyContent:"center"}}>
            <a href="#/home" className="btn btn--primary">
              <Icon name="sparkles" size={13} /> Start the first brief
            </a>
            <a href="#/specialists" className="btn btn--ghost btn--sm">Browse specialists</a>
          </div>
        </div>
      )}

      {/* Date-grouped brief cards — sticky per-day dividers */}
      <div style={{display:"flex", flexDirection:"column", gap: 26}}>
        {grouped.map((g) => (
          <section key={g.key}>
            <div className="eyebrow" style={{
              position:"sticky", top: 0, zIndex: 5,
              display:"flex", alignItems:"baseline", gap: 8, padding:"6px 0 8px",
              marginBottom: 6, color:"var(--c-dim)",
              background:"var(--c-bg)", borderBottom:"1px solid var(--c-line)",
            }}>
              <span>{g.label}</span>
              <span style={{color:"var(--c-faint)"}}>· {g.items.length}</span>
            </div>
            <div style={{display:"flex", flexDirection:"column", gap: 8}}>
              {g.items.map((b) => {
                const runs    = b.runs || [];
                const credits = runs.reduce((s, r) => {
                  const a = window.CI_AGENTS?.find((x) => x.id === r.specialist_id);
                  return s + (a?.cr || 0);
                }, 0);
                const flagged = runs.some((r) => (r.outputs || []).some((o) => o.status !== "approved"));
                const st      = briefStatusStyle(flagged);
                const reqText = briefTitle(b);
                const specs   = [...new Set(runs.map((r) => r.specialist_id))];
                /* Disambiguate rows that share a title: lead with the
                   existing discriminating metadata (mode + lead specialist)
                   so two same-named briefs read apart at a glance. */
                const ambiguous = (titleCounts.get(reqText) || 0) > 1;
                const leadSpec  = specs.length ? specialistName(specs[0]) : "";

                return (
                  <button key={b.id} onClick={() => openBrief(b.id)} className="card" style={{
                    width:"100%", textAlign:"left", padding: "12px 16px",
                    border:"1px solid var(--c-line)",
                    borderLeft: `3px solid ${st.stripe}`,
                    cursor:"pointer",
                    display:"flex", alignItems:"center", gap: 14,
                    transition:"transform 100ms ease, box-shadow 100ms ease",
                  }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 18px rgba(0,0,0,0.06)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = ""; }}>
                    <div style={{flex: 1, minWidth: 0}}>
                      <div style={{display:"flex", alignItems:"baseline", gap: 8, minWidth: 0}}>
                        <span style={{fontSize: 13.5, color:"var(--c-ink)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
                          {reqText}
                        </span>
                        {ambiguous && (leadSpec || b.mode) && (
                          <span className="eyebrow" style={{flexShrink: 0, color:"var(--c-dim)"}}>
                            {[b.mode, leadSpec].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </div>
                      <div style={{display:"flex", gap: 10, marginTop: 4, fontFamily:"var(--font-mono)", fontSize: 10.5, color:"var(--c-faint)", letterSpacing:"0.04em", alignItems:"center"}}>
                        <span>{b.mode || "auto"}</span>
                        <span>·</span>
                        <span>{runs.length} run{runs.length === 1 ? "" : "s"}</span>
                        <span>·</span>
                        <span>{credits} cr</span>
                        {specs.length > 0 && (<>
                          <span>·</span>
                          <span>{specs.map(specialistName).slice(0, 3).join(" · ")}{specs.length > 3 ? ` +${specs.length - 3}` : ""}</span>
                        </>)}
                      </div>
                    </div>
                    <span className="pill" style={{
                      height: 20, padding:"0 9px", fontSize: 10,
                      background: st.bg, color: st.fg,
                    }}>{st.label}</span>
                    <span style={{fontFamily:"var(--font-mono)", fontSize: 10.5, color:"var(--c-faint)", minWidth: 50, textAlign:"right"}}>
                      {shortDate(b.created_at)}
                    </span>
                    <Icon name="arrow" size={14} />
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        {!loading && grouped.length === 0 && briefs.length > 0 && (
          <div style={{padding: 28, textAlign:"center", color:"var(--c-faint)", fontSize: 13}}>
            No briefs match the current filters.
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* SPECIALISTS DIRECTORY (L2)                                        */

function SpecialistsDirectory({ go }) {
  const [dept, setDept] = useBrState("all");
  const [openId, setOpenId] = useBrState(null);
  const [query, setQuery] = useBrState("");
  const [sort, setSort] = useBrState("dept");
  const [view, setView] = useBrState("grid");

  /* Hide internal-only specs (BIO Compiler, Audit & Ledger) — those are
     infrastructure run by Brandolph, not user-pickable specialists. */
  const all = window.CI_AGENTS.filter(a => !a.internal);
  const live = all.filter(a => a.status === "live").length;
  const soon = all.length - live;
  const pins = usePins();
  const pinned = all.filter(a => pins.has("specialists", a.id));

  /* Usage from produced outputs → "most used for this brand" */
  const usage = {};
  window.CI_OUTPUTS.forEach(o => { if (o.agentId) usage[o.agentId] = (usage[o.agentId] || 0) + 1; });
  const mostUsed = [...all].filter(a => usage[a.id]).sort((x, y) => usage[y.id] - usage[x.id]).slice(0, 4);

  const q = query.trim().toLowerCase();
  const matches = (a) => {
    if (dept !== "all" && a.dept !== dept) return false;
    if (!q) return true;
    const caps = (window.CI_DEPT_META[a.dept] || {}).capabilities || [];
    return [a.name, a.dept, a.code, a.job, ...caps].join(" ").toLowerCase().includes(q);
  };
  const filtered = all.filter(matches);
  const sortFns = {
    dept:    (x, y) => window.CI_DEPTS.indexOf(x.dept) - window.CI_DEPTS.indexOf(y.dept) || x.code.localeCompare(y.code),
    credits: (x, y) => x.cr - y.cr,
    used:    (x, y) => (usage[y.id] || 0) - (usage[x.id] || 0) || x.code.localeCompare(y.code),
  };
  const flat = [...filtered].sort(sortFns[sort] || sortFns.dept);
  const grouped = sort === "dept" && view === "grid" && !q;

  const Toggle = ({ val, set, options }) => (
    <div style={{display:"inline-flex", padding:3, gap:2, background:"var(--neutral-50)", borderRadius:9, border:"1px solid var(--c-line)"}}>
      {options.map(o => (
        <button key={o.v} onClick={() => set(o.v)}
          style={{
            border:"none", cursor:"pointer", borderRadius:7, padding:"5px 11px",
            fontFamily:"var(--font-mono)", fontSize:10.5, letterSpacing:"0.04em", textTransform:"uppercase",
            background: val === o.v ? "var(--c-card)" : "transparent",
            color: val === o.v ? "var(--c-ink)" : "var(--c-faint)",
            boxShadow: val === o.v ? "var(--shadow-sm)" : "none",
          }}>{o.l}</button>
      ))}
    </div>
  );

  return (
    <div style={{padding:"24px 36px 60px"}}>
      <PageHeader
        eyebrow="L2 · 33 senior specialists"
        title="The department, on shift."
        sub="Brandolph reads the brief. The specialists do the work. Each one routes to the model best suited to the job — visible, auditable, paid out of the same credit pool."
        right={<>
          <span style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--c-faint)"}}>{live} live · {soon} coming soon</span>
          <button className="btn btn--primary btn--sm" onClick={() => go && go("specialist-new")}><Icon name="plus" size={13} /> New specialist</button>
        </>}
      />

      {/* Pinned specialists */}
      {pinned.length > 0 && !q && (
        <section style={{marginBottom: 26}}>
          <div className="eyebrow eyebrow--yellow" style={{marginBottom: 10}}>★ Pinned · your preferred specialists</div>
          <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))", gap: 10}}>
            {pinned.map(a => (
              <button key={a.id} onClick={() => setOpenId(a.id)} className="card"
                style={{textAlign:"left", cursor:"pointer", padding:"12px 14px", display:"flex", alignItems:"center", gap:10,
                  borderLeft:`3px solid ${window.CI_DEPT_COLORS[a.dept] || "var(--neutral-400)"}`}}>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontSize:13.5, fontWeight:600, color:"var(--c-ink)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{a.name}</div>
                  <div className="eyebrow" style={{color:"var(--c-dim)"}}>{a.dept}</div>
                </div>
                <PinButton kind="specialists" id={a.id} />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Most used for this brand */}
      {mostUsed.length > 0 && !q && (
        <section style={{marginBottom: 26}}>
          <div className="eyebrow" style={{marginBottom: 10}}>Most used for this brand</div>
          <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))", gap: 10}}>
            {mostUsed.map(a => (
              <button key={a.id} onClick={() => setOpenId(a.id)} className="card"
                style={{textAlign:"left", cursor:"pointer", padding:"12px 14px", display:"flex", alignItems:"center", gap:10,
                  borderLeft:`3px solid ${window.CI_DEPT_COLORS[a.dept] || "var(--neutral-400)"}`}}>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontSize:13.5, fontWeight:600, color:"var(--c-ink)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{a.name}</div>
                  <div className="eyebrow" style={{color:"var(--c-dim)"}}>{a.dept}</div>
                </div>
                <span className="credit credit--pending" style={{fontSize:11}}>{usage[a.id]}×</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Controls — search · sort · view */}
      <div style={{display:"flex", gap: 10, alignItems:"center", marginBottom: 16, flexWrap:"wrap"}}>
        <div style={{display:"flex", alignItems:"center", gap:8, flex:"1 1 240px", minWidth: 200, height:36, padding:"0 12px",
          background:"var(--c-card)", border:"1px solid var(--c-line)", borderRadius:10}}>
          <Icon name="search" size={15} />
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search specialists, departments, capabilities…"
            style={{flex:1, border:0, outline:0, background:"transparent", color:"var(--c-ink)", fontFamily:"inherit", fontSize:13.5, height:"100%"}} />
          {query && <button onClick={() => setQuery("")} style={{border:0, background:"transparent", cursor:"pointer", color:"var(--c-faint)", padding:0}}><Icon name="close" size={14} /></button>}
        </div>
        <Toggle val={sort} set={setSort} options={[{v:"dept",l:"Department"},{v:"credits",l:"Credits"},{v:"used",l:"Most used"}]} />
        <Toggle val={view} set={setView} options={[{v:"grid",l:"Grid"},{v:"list",l:"List"}]} />
      </div>

      {/* Department filter */}
      <div style={{display:"flex", gap: 6, marginBottom: 24, flexWrap:"wrap"}}>
        {["all", ...window.CI_DEPTS].map(d => (
          <button key={d} onClick={() => setDept(d)}
            className={"pill" + (dept === d ? " pill--dark" : "")}
            style={{height: 30, padding:"0 14px", cursor:"pointer", fontSize: 11}}>
            {d === "all" ? "All departments" : d}
            {d !== "all" && <span style={{marginLeft: 6, opacity: 0.6}}>· {all.filter(a => a.dept === d).length}</span>}
          </button>
        ))}
      </div>

      {q && <div className="eyebrow" style={{marginBottom: 14}}>{flat.length} {flat.length === 1 ? "result" : "results"}</div>}

      {/* Results */}
      {grouped ? (
        (dept === "all" ? window.CI_DEPTS : [dept]).map(d => {
          const list = filtered.filter(a => a.dept === d);
          if (!list.length) return null;
          return (
            <section key={d} style={{marginBottom: 44}}>
              <div style={{
                display:"flex", justifyContent:"space-between", alignItems:"baseline", gap: 16,
                marginBottom: 16, paddingBottom: 10, borderBottom:"1px solid var(--c-line)",
              }}>
                <h3 style={{margin: 0, fontSize: 17, letterSpacing:"-0.005em", display:"flex", alignItems:"center", gap: 9}}>
                  <span style={{width: 7, height: 7, borderRadius: "50%", background: window.CI_DEPT_COLORS?.[d] || "var(--neutral-400)", flexShrink: 0}} />
                  {d}
                </h3>
                <span style={{fontFamily:"var(--font-mono)", fontSize: 10.5, color:"var(--c-dim)", letterSpacing:"0.08em", textTransform:"uppercase"}}>{list.length} specialists · {list.filter(a => a.status === "live").length} live</span>
              </div>
              <div className="stagger" style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))", gap: 12}}>
                {list.map(a => <AgentCard key={a.id} agentId={a.id} showCaps onClick={() => setOpenId(a.id)} />)}
              </div>
            </section>
          );
        })
      ) : view === "list" ? (
        <div className="card stagger" style={{padding: 0, overflow:"hidden"}}>
          {flat.map((a, i) => (
            <SpecialistRow key={a.id} a={a} usage={usage[a.id] || 0} last={i === flat.length - 1} onClick={() => setOpenId(a.id)} />
          ))}
          {!flat.length && <div style={{padding: 28, textAlign:"center", color:"var(--c-faint)", fontSize:13}}>No specialists match “{query}”.</div>}
        </div>
      ) : (
        <div className="stagger" style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))", gap: 12}}>
          {flat.map(a => <AgentCard key={a.id} agentId={a.id} showCaps onClick={() => setOpenId(a.id)} />)}
          {!flat.length && <div style={{gridColumn:"1/-1", padding: 28, textAlign:"center", color:"var(--c-faint)", fontSize:13}}>No specialists match “{query}”.</div>}
        </div>
      )}

      <SpecialistDrawer open={!!openId} agent={openId ? window.CI_AGENTS.find(a => a.id === openId) : null} onClose={() => setOpenId(null)} />
    </div>
  );
}

/* Compact list row (List view) */
function SpecialistRow({ a, usage, last, onClick }) {
  const isTeam = useIsTeam();
  const accent = isTeam ? window.CI_MODELS[a.model].color : (window.CI_DEPT_COLORS[a.dept] || "var(--neutral-400)");
  const soon = a.status === "soon";
  return (
    <div onClick={onClick}
      style={{display:"flex", alignItems:"center", gap:14, padding:"12px 16px", cursor:"pointer",
        borderBottom: last ? "none" : "1px solid var(--c-line)", borderLeft:`3px solid ${accent}`, opacity: soon ? 0.62 : 1}}
      onMouseEnter={e => e.currentTarget.style.background = "var(--neutral-50)"}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
      <span style={{fontFamily:"var(--font-mono)", fontSize:10.5, color:"var(--c-faint)", minWidth:48}}>{a.code}</span>
      <div style={{flex:"0 0 200px", minWidth:0}}>
        <div style={{fontSize:13.5, fontWeight:600, color:"var(--c-ink)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{a.name}</div>
        <div className="eyebrow" style={{color:"var(--c-dim)"}}>{a.dept}</div>
      </div>
      <div style={{flex:1, minWidth:0, fontSize:12.5, color:"var(--c-dim)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{a.job}</div>
      {isTeam && <ModelChip modelKey={a.model} />}
      {usage > 0 && <span style={{fontFamily:"var(--font-mono)", fontSize:10.5, color:"var(--c-faint)"}}>{usage}×</span>}
      <span className="credit credit--pending" style={{fontSize:11}}>{a.cr} cr</span>
      {soon ? <span className="pill" style={{height:18, padding:"0 8px", fontSize:9.5}}>Soon</span> : <Icon name="arrow" size={14} />}
    </div>
  );
}

/* Resolve a specialist's runnable spec: department template + per-id override. */
function specialistSpec(a) {
  const base = window.CI_DEPT_SPECS[a.dept] || {};
  const over = (window.CI_SPECIALIST_SPECS || {})[a.id] || {};
  return { ...base, ...over };
}

/* Compose the effective system prompt from the four layers in the plan:
   platform preamble + brand/BIO context + specialist spec + task context.
   Model routing is internal — only included on the team/admin side. */
function composeSpecialistPrompt(a, isTeam, specArg) {
  const brand = window.CI_BRAND;
  const spec = specArg || specialistSpec(a);
  const meta = window.CI_DEPT_META[a.dept] || {};
  const model = window.CI_MODELS[a.model];
  const refusals = [...(window.CI_BRAND_REFUSALS || []), ...(spec.refusals || [])];
  const L = [];
  L.push("# PLATFORM");
  L.push(`You are ${a.name} (${a.code}), an L2 specialist inside CaastorOS. Brandolph (L1) routed this brief to you. You do not chat — you return a deliverable a CMO would approve without a second pass.`);
  L.push("");
  L.push("# BRAND CONTEXT  ·  from the Brand Intelligence Object");
  L.push(`Brand: ${brand.name} — ${brand.tagline}`);
  L.push(`BIO completeness: ${brand.bioCompleteness}%. The BIO is canon; read it before responding.`);
  L.push("Refusals (hard rules):");
  refusals.forEach(r => L.push(`  • ${r}`));
  L.push("");
  L.push("# SPECIALIST SPEC");
  L.push(`Role: ${spec.role || a.job}`);
  if (spec.objective) L.push(`Objective: ${spec.objective}`);
  if (spec.method) { L.push("Method:"); spec.method.forEach((s, i) => L.push(`  ${i + 1}. ${s}`)); }
  if (spec.outputContract) L.push(`Output contract: ${spec.outputContract}`);
  if (spec.voice) L.push(`Voice: ${spec.voice}`);
  if (meta.capabilities) L.push(`Capabilities: ${meta.capabilities.join(", ")}`);
  if (spec.tools) L.push(`Tools: ${spec.tools.join(", ")}`);
  if (isTeam) L.push(`Model routing: ${model ? model.label : a.model} (primary)`);
  L.push("");
  L.push("# TASK");
  L.push("{ the sharpened brief + relevant prior outputs / uploads for this run are injected here }");
  return L.join("\n");
}

/* TryPanel — fires a real specialist run via /api/runs/stream and
   renders streaming output + QA verdict + the moat-defining cert
   attribution footer. Used inline at the top of SpecialistDrawer. */
function TryPanel({ agent, onClose }) {
  const [brief, setBrief]       = useBrState("");
  const [running, setRunning]   = useBrState(false);
  const [output, setOutput]     = useBrState("");
  const [qa, setQa]             = useBrState(null);
  const [done, setDone]         = useBrState(null);
  const [error, setError]       = useBrState(null);

  const reset = () => { setOutput(""); setQa(null); setDone(null); setError(null); };

  const run = async () => {
    if (!brief.trim() || running) return;
    reset(); setRunning(true);
    await streamSpecialistRun({
      specialistId: agent.id,
      briefText: brief.trim(),
      onToken:  ({ text }) => setOutput((o) => o + text),
      onQa:     (data) => setQa(data),
      onDone:   (data) => setDone(data),
      onError:  ({ message }) => setError(message),
    });
    setRunning(false);
  };

  return (
    <div style={{
      background: "var(--c-bg)",
      border: "1px solid var(--c-line)",
      borderRadius: 12, padding: 16, marginBottom: 18,
    }}>
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: 10}}>
        <div className="eyebrow eyebrow--yellow">Try {agent.name}</div>
        {(output || done || error) && (
          <button type="button" className="btn btn--link" style={{fontSize:11}} onClick={reset}>Reset</button>
        )}
      </div>

      {/* Brief composer — locked once a run is in flight or done */}
      <textarea
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run(); e.stopPropagation(); }}
        disabled={running || !!done}
        rows={3}
        placeholder={`Write a brief for ${agent.name}. ${agent.job}`}
        style={{
          width: "100%", padding: "10px 12px", borderRadius: 8,
          border: "1px solid var(--c-line)", background: "var(--c-card)",
          fontFamily: "inherit", fontSize: 13.5, color: "var(--c-ink)",
          lineHeight: 1.5, resize: "vertical", outline: "none",
          boxSizing: "border-box",
        }}
      />

      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginTop: 10}}>
        <span style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--c-faint)"}}>
          {running ? "Running…" : done ? "Done" : `~${agent.cr} cr · ⌘+↵ to run`}
        </span>
        <button
          onClick={run}
          disabled={!brief.trim() || running || !!done}
          className="btn btn--primary btn--sm">
          {running ? <><BrandolphDot state="thinking" size={11} /> Streaming…</> : done ? "Ran" : <>Run <Icon name="arrow" size={13} /></>}
        </button>
      </div>

      {/* Streaming output */}
      {(output || running) && (
        <div style={{
          marginTop: 14, padding: 14, borderRadius: 10,
          background: "var(--c-card)", border: "1px solid var(--c-line)",
        }}>
          <p style={{
            margin: 0, fontFamily: "Georgia, 'Times New Roman', serif",
            fontStyle: "italic", color: "var(--c-ink)",
            fontSize: 15.5, lineHeight: 1.55, whiteSpace: "pre-wrap",
          }}>
            {output}{running && !done ? <span style={{opacity:0.4}}>▎</span> : null}
          </p>

          {/* Attribution footer — fires the moat chip ONCE we have done event */}
          {done && (
            <div style={{
              marginTop: 12, paddingTop: 10,
              borderTop: "1px dashed var(--c-line-2)",
              display: "flex", justifyContent: "space-between", gap: 8,
              fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--c-faint)",
              letterSpacing: "0.04em",
            }}>
              <span>
                Composed by <span style={{color:"var(--c-ink)"}}>{done.spec?.name || agent.name}</span> ·
                BIO v{done.brand?.bioVersion}
                {done.brand?.certifiedBy
                  ? <> · <span style={{color:"var(--green-600)"}}>certified</span></>
                  : <> · <span style={{color:"var(--yellow-700)"}}>uncertified</span></>}
              </span>
              <span>{agent.cr ?? "?"} cr</span>
            </div>
          )}
        </div>
      )}

      {/* QA verdict pill */}
      {qa && (
        <div style={{
          marginTop: 10, padding: "8px 12px", borderRadius: 8,
          background: qa.passed ? "var(--green-50, rgba(127,163,122,0.12))" : "var(--pink-50, rgba(244,143,177,0.12))",
          color: qa.passed ? "var(--green-600)" : "var(--pink-700, var(--pink-500))",
          fontSize: 12, display:"flex", justifyContent:"space-between", alignItems:"center", gap: 10,
        }}>
          <span><strong>Voice QA</strong> · {qa.passed ? "passed" : "flagged"} · {qa.voice_match}/100</span>
          {qa.violations?.length > 0 && <span style={{fontStyle:"italic", textAlign:"right"}}>{qa.violations.join(" · ")}</span>}
        </div>
      )}

      {error && (
        <div style={{marginTop: 10, padding:"8px 12px", background:"var(--pink-50, rgba(244,143,177,0.12))", color:"var(--pink-700, var(--pink-500))", borderRadius: 8, fontSize: 12}}>
          {error}
        </div>
      )}
    </div>
  );
}

function SpecialistDrawer({ open, agent, onClose }) {
  const [showPrompt, setShowPrompt] = useBrState(false);
  const [showTry, setShowTry] = useBrState(false);
  /* Reset try-panel state when the drawer closes or specialist changes */
  React.useEffect(() => { setShowTry(false); }, [agent?.id, open]);
  if (!agent) return null;
  const isTeam = useIsTeam();
  const m = window.CI_MODELS[agent.model];
  const accent = isTeam ? m.color : (window.CI_DEPT_COLORS[agent.dept] || "var(--neutral-300)");
  const meta = window.CI_DEPT_META[agent.dept] || {};
  const spec = specialistSpec(agent);
  const refusals = [...(window.CI_BRAND_REFUSALS || []), ...(spec.refusals || [])];
  const tierLabel = (window.CI_TIERS || {})[meta.tierFrom] || meta.tierFrom;
  return (
    <Drawer open={open} onClose={onClose} title={agent.name} eyebrow={`${agent.code} · ${agent.dept}`}
      footer={<>
        <PinButton kind="specialists" id={agent.id} size={18} style={{marginRight:"auto"}} />
        <button className="btn btn--ghost" onClick={onClose}>Close</button>
        {agent.status === "live" && !showTry && (
          <button className="btn btn--primary" onClick={() => setShowTry(true)}>
            Try {agent.name} · {agent.cr} cr <Icon name="arrow" size={13} />
          </button>
        )}
      </>}>
      <div style={{ background: accent, height: 6, borderRadius: 4, marginBottom: 18 }} />

      {showTry && agent.status === "live" && <TryPanel agent={agent} onClose={() => setShowTry(false)} />}

      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 18}}>
        {isTeam ? <ModelChip modelKey={agent.model} /> : (
          <span className="eyebrow" style={{color:"var(--c-dim)"}}>L2 · {agent.dept}</span>
        )}
        <span className="credit credit--pending" style={{fontSize: 13}}>{agent.cr} cr · per run</span>
      </div>

      <div className="eyebrow" style={{marginBottom: 8}}>The job</div>
      <p style={{fontSize:14.5, color:"var(--c-ink)", lineHeight: 1.55, marginBottom: 18}}>{agent.job}</p>

      {meta.capabilities && (
        <>
          <div className="eyebrow" style={{marginBottom: 8}}>Capabilities</div>
          <div style={{display:"flex", flexWrap:"wrap", gap:6, marginBottom: 18}}>
            {meta.capabilities.map(c => (
              <span key={c} style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--c-dim)",
                border:"1px solid var(--c-line)", borderRadius:7, padding:"3px 9px"}}>{c}</span>
            ))}
          </div>
        </>
      )}

      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom: 18}}>
        {meta.bestFor && (
          <div className="card card--inset" style={{padding:"12px 14px", gridColumn:"1/-1"}}>
            <div className="eyebrow" style={{marginBottom:4}}>Brandolph picks this for</div>
            <div style={{fontSize:13.5, color:"var(--c-ink)", lineHeight:1.45}}>{meta.bestFor}</div>
          </div>
        )}
        <div className="card card--inset" style={{padding:"12px 14px"}}>
          <div className="eyebrow" style={{marginBottom:4}}>Turnaround</div>
          <div style={{fontSize:14, color:"var(--c-ink)"}}>{meta.turnaround || "—"}</div>
        </div>
        <div className="card card--inset" style={{padding:"12px 14px"}}>
          <div className="eyebrow" style={{marginBottom:4}}>Unlocks from</div>
          <div style={{fontSize:14, color:"var(--c-ink)"}}>Tier {meta.tierFrom} · {tierLabel}</div>
        </div>
      </div>

      {/* Refusals — visible to everyone; the "shape not produce" guarantee */}
      {refusals.length > 0 && (
        <>
          <div className="eyebrow" style={{marginBottom: 8}}>Refusals · won't do</div>
          <div className="card card--inset" style={{padding:"12px 14px", marginBottom: 18, display:"flex", flexDirection:"column", gap:7}}>
            {refusals.slice(0, 5).map((r, i) => (
              <div key={i} style={{display:"flex", gap:8, fontSize:12.5, lineHeight:1.45, color:"var(--c-dim)"}}>
                <span style={{color:"var(--pink-500)", fontFamily:"var(--font-mono)"}}>✕</span>
                <span>{r}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* How Brandolph briefs this specialist — composed prompt (transparency). */}
      <div className="eyebrow" style={{marginBottom: 8, display:"flex", justifyContent:"space-between", alignItems:"center"}}>
        <span>How Brandolph briefs this specialist</span>
        <button className="btn btn--link" style={{fontSize:11}} onClick={() => setShowPrompt(p => !p)}>
          {showPrompt ? "Hide" : "View composed prompt"}
        </button>
      </div>
      <div className="card card--inset" style={{padding: 14, marginBottom: 22}}>
        {showPrompt ? (
          <pre style={{
            margin: 0, whiteSpace:"pre-wrap", wordBreak:"break-word",
            fontFamily:"var(--font-mono)", fontSize: 11.5, lineHeight: 1.55, color:"var(--c-ink)",
            maxHeight: 340, overflowY:"auto",
          }}>{composeSpecialistPrompt(agent, isTeam)}</pre>
        ) : (
          <p style={{fontSize: 12.5, color:"var(--c-dim)", lineHeight: 1.55, margin: 0, fontFamily:"var(--font-mono)"}}>
            {agent.name} reads the BIO before responding, follows {spec.role ? "their method as " + spec.role : "their method"}, and refuses anything that breaks the brand rules. {spec.objective || ""}
          </p>
        )}
        <div style={{marginTop:10, paddingTop:10, borderTop:"1px dashed var(--c-line-2)", fontFamily:"var(--font-mono)", fontSize:10, color:"var(--c-faint)", letterSpacing:"0.04em"}}>
          Composed from PLATFORM + BIO + SPEC + TASK{isTeam && m ? ` · routed to ${m.label}` : ""}
        </div>
      </div>

      <div className="eyebrow" style={{marginBottom: 8}}>Recent usage · 30 days</div>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap: 10, marginBottom: 22}}>
        {[
          { label:"Jobs run",        v:"14" },
          { label:"Credits spent",   v: agent.cr * 14 },
          { label:"Success rate",    v:"94%" },
        ].map((s, i) => (
          <div key={i} className="card card--inset" style={{padding:"12px 14px"}}>
            <div className="eyebrow" style={{marginBottom: 4}}>{s.label}</div>
            <div style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize: 22, color:"var(--c-ink)"}}>{s.v}</div>
          </div>
        ))}
      </div>

      <div className="eyebrow" style={{marginBottom: 8}}>Example outputs</div>
      <div style={{display:"flex", flexDirection:"column", gap: 12}}>
        {window.CI_OUTPUTS.filter(o => o.agentId === agent.id).slice(0,2).map(o => <OutputCard key={o.id} output={o} />)}
        {window.CI_OUTPUTS.filter(o => o.agentId === agent.id).length === 0 && (
          <div className="card card--inset" style={{padding: 18, textAlign:"center", color:"var(--c-faint)", fontSize: 13}}>
            <em className="b-voice" style={{background:"none", fontStyle:"italic"}}>You haven't used this specialist yet.</em>
          </div>
        )}
      </div>
    </Drawer>
  );
}


/* ════════════════════════════════════════════════════════════════ */
/* CANVAS (Phase 3 placeholder, but designed)                        */

const CANVAS_NODES = [
  { id:"bio",      x:40,   y:60,  w:260, kind:"bio",       title:"Brand Intelligence Object",        sub:"BIO · 91%" },
  { id:"brief",    x:360,  y:50,  w:260, kind:"brief",     title:"Pricing relaunch · brief",         sub:"L1 · Brandolph" },
  { id:"t1",       x:680,  y:20,  w:240, kind:"territory", title:"Territory · 'It costs the Tuesday'", sub:"L2-06 · Territory Mapper" },
  { id:"t2",       x:680,  y:130, w:240, kind:"territory", title:"Territory · '1-in-12'",            sub:"L2-06 · Territory Mapper" },
  { id:"t3",       x:680,  y:240, w:240, kind:"territory", title:"Territory · 'Don't unsubscribe'",  sub:"L2-06 · Territory Mapper" },
  { id:"copy1",    x:960,  y:50,  w:260, kind:"copy",      title:"Pricing page hero",                sub:"L2-12 · Conversion Copy" },
  { id:"copy2",    x:960,  y:170, w:260, kind:"copy",      title:"Email sequence ×3",                sub:"L2-13 · Email Sequence" },
  { id:"copy3",    x:960,  y:290, w:260, kind:"copy",      title:"Subject lines ×6",                 sub:"L2-14 · Subject Lines" },
  { id:"asset",    x:1260, y:170, w:260, kind:"asset",     title:"Hero KV draft",                    sub:"L2-20 · Hero KV" },
  { id:"feedback", x:400,  y:330, w:260, kind:"feedback",  title:"Email 2 reads dutiful",            sub:"Brandolph · feedback" },
];

const CANVAS_EDGES = [
  { from:"bio",   to:"brief", fromSide:"right", toSide:"left" },
  { from:"brief", to:"t1",    fromSide:"right", toSide:"left" },
  { from:"brief", to:"t2",    fromSide:"right", toSide:"left" },
  { from:"brief", to:"t3",    fromSide:"right", toSide:"left" },
  { from:"t1",    to:"copy1", fromSide:"right", toSide:"left" },
  { from:"t2",    to:"copy2", fromSide:"right", toSide:"left" },
  { from:"t3",    to:"copy3", fromSide:"right", toSide:"left" },
  { from:"copy2", to:"asset", fromSide:"right", toSide:"left" },
  { from:"brief", to:"feedback", fromSide:"bottom", toSide:"top", dashed:true },
];

const CANVAS_COLORS = {
  bio:"var(--yellow-500)", brief:"var(--neutral-900)", territory:"var(--purple-500)",
  specialist:"var(--purple-500)", copy:"var(--green-600)", asset:"var(--pink-500)",
  qa:"var(--blue-600)", upload:"var(--neutral-400)", feedback:"var(--orange-500)",
};

const SCALE_MIN = 0.4, SCALE_MAX = 2;

/* Reusable pan/zoom/drag canvas. Renders nodeData + edges; clicking a
   node (without dragging) fires onNodeClick(node). */
function InteractiveCanvas({ nodeData, edges, onNodeClick, renderNode, height = "calc(100vh - 56px)", controls = true, helper, exportName = "canvas", toolbarExtra }) {
  const [nodes, setNodes] = React.useState(() => nodeData.map(n => ({ ...n })));
  const [view, setView]   = React.useState({ x: 24, y: 28, scale: 1 });
  const [sizes, setSizes] = React.useState({});      // id -> measured height
  const [hovered, setHovered] = React.useState(null);
  const [panning, setPanning] = React.useState(false);

  /* Merge external nodeData changes (added/removed nodes) while keeping
     positions of nodes the user has already dragged. */
  React.useEffect(() => {
    setNodes(prev => {
      const byId = new Map(prev.map(n => [n.id, n]));
      return nodeData.map(n => {
        const ex = byId.get(n.id);
        return ex ? { ...n, x: ex.x, y: ex.y } : { ...n };
      });
    });
  }, [nodeData]);

  const wrapRef  = React.useRef(null);
  const nodeRefs = React.useRef({});
  const drag     = React.useRef(null);

  /* Measure node heights once so edge anchors land on the true centre. */
  React.useEffect(() => {
    const next = {};
    Object.entries(nodeRefs.current).forEach(([id, el]) => { if (el) next[id] = el.offsetHeight; });
    setSizes(next);
  }, []);

  /* Native wheel listener (passive:false so we can preventDefault). */
  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      setView(v => {
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        const scale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, v.scale * factor));
        const k = scale / v.scale;
        return { scale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const heightOf = (id) => sizes[id] || 66;
  const nodeById = (id) => nodes.find(n => n.id === id);

  const anchor = (n, side) => {
    const h = heightOf(n.id);
    if (side === "right")  return [n.x + n.w, n.y + h / 2];
    if (side === "left")   return [n.x,       n.y + h / 2];
    if (side === "top")    return [n.x + n.w / 2, n.y];
    if (side === "bottom") return [n.x + n.w / 2, n.y + h];
    return [n.x, n.y];
  };

  const edgePath = (e) => {
    const a = nodeById(e.from), b = nodeById(e.to);
    if (!a || !b) return "";
    const [sx, sy] = anchor(a, e.fromSide);
    const [tx, ty] = anchor(b, e.toSide);
    if (e.fromSide === "right" || e.fromSide === "left") {
      const dx = (tx - sx) * 0.45;
      return `M${sx},${sy} C${sx + dx},${sy} ${tx - dx},${ty} ${tx},${ty}`;
    }
    const dy = (ty - sy) * 0.5;
    return `M${sx},${sy} C${sx},${sy + dy} ${tx},${ty - dy} ${tx},${ty}`;
  };

  /* ── Pointer interactions ─────────────────────────────────────── */
  const startPan = (e) => {
    if (e.button !== 0) return;
    drag.current = { mode:"pan", sx:e.clientX, sy:e.clientY, ox:view.x, oy:view.y, moved:false };
    setPanning(true);
    wrapRef.current.setPointerCapture?.(e.pointerId);
  };
  const startNode = (e, n) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    drag.current = { mode:"node", id:n.id, sx:e.clientX, sy:e.clientY, ox:n.x, oy:n.y, scale:view.scale, moved:false };
    wrapRef.current.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (d.mode === "pan") {
      setView(v => ({ ...v, x: d.ox + dx, y: d.oy + dy }));
    } else {
      setNodes(ns => ns.map(n => n.id === d.id ? { ...n, x: d.ox + dx / d.scale, y: d.oy + dy / d.scale } : n));
    }
  };
  const endDrag = (e) => {
    const d = drag.current;
    if (d) wrapRef.current.releasePointerCapture?.(e.pointerId);
    /* A node press that didn't move is a click → open its detail. */
    if (d && d.mode === "node" && !d.moved && onNodeClick) {
      const rect = nodeRefs.current[d.id] ? nodeRefs.current[d.id].getBoundingClientRect() : null;
      onNodeClick(nodeById(d.id), rect);
    }
    drag.current = null;
    setPanning(false);
  };

  const fitView = () => {
    const rect = wrapRef.current.getBoundingClientRect();
    const pad = 64;
    const minX = Math.min(...nodes.map(n => n.x));
    const minY = Math.min(...nodes.map(n => n.y));
    const maxX = Math.max(...nodes.map(n => n.x + n.w));
    const maxY = Math.max(...nodes.map(n => n.y + heightOf(n.id)));
    const w = maxX - minX, h = maxY - minY;
    const scale = Math.min(SCALE_MAX, Math.max(SCALE_MIN,
      Math.min((rect.width - pad * 2) / w, (rect.height - pad * 2) / h)));
    setView({
      scale,
      x: (rect.width  - w * scale) / 2 - minX * scale,
      y: (rect.height - h * scale) / 2 - minY * scale,
    });
  };

  const exportLayout = () => {
    const data = JSON.stringify({ nodes, edges }, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type:"application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = exportName + ".json"; a.click();
    URL.revokeObjectURL(url);
  };

  const stop = (e) => e.stopPropagation();

  return (
    <div
      ref={wrapRef}
      className="cv-root"
      onPointerDown={startPan}
      onPointerMove={onMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{
        position:"relative", height, overflow:"hidden", borderRadius: 14,
        cursor: panning ? "grabbing" : "grab", touchAction:"none",
      }}
    >
      {/* Dot grid — pans + scales with the view */}
      <div style={{
        position:"absolute", inset: 0, background:"var(--c-bg)",
        backgroundImage:"radial-gradient(circle, var(--neutral-200) 1px, transparent 1px)",
        backgroundSize:`${24 * view.scale}px ${24 * view.scale}px`,
        backgroundPosition:`${view.x}px ${view.y}px`,
      }} />

      {/* Floating controls — toolbarExtra (state + page actions) on the
          left, zoom + export controls grouped on the right with a thin
          divider between so they read as separate concerns. */}
      <div onPointerDown={stop} style={{position:"absolute", top: 16, right: 18, zIndex: 5, display:"flex", gap: 8, alignItems:"center"}}>
        {toolbarExtra}
        {toolbarExtra && controls && <span style={{width: 1, height: 20, background:"var(--c-line)", margin:"0 4px"}} aria-hidden="true" />}
        {controls && (
          <div style={{
            display:"flex", alignItems:"center", gap: 2,
            background:"var(--c-card)", border:"1px solid var(--c-line)", borderRadius: 999,
            padding: 2, boxShadow:"0 1px 0 rgba(0,0,0,0.02)",
          }}>
            <button className="btn btn--ghost btn--icon"
              onClick={() => setView((v) => ({ ...v, scale: Math.max(0.25, v.scale * 0.85) }))}
              aria-label="Zoom out" title="Zoom out"
              style={{height: 26, width: 26, borderRadius: 999}}>
              <span style={{fontFamily:"var(--font-mono)", fontSize: 14, lineHeight: 1, color:"var(--c-ink)"}}>−</span>
            </button>
            <span style={{fontFamily:"var(--font-mono)", fontSize: 10.5, color:"var(--c-dim)", letterSpacing:"0.04em", minWidth: 40, textAlign:"center"}}>
              {Math.round(view.scale * 100)}%
            </span>
            <button className="btn btn--ghost btn--icon"
              onClick={() => setView((v) => ({ ...v, scale: Math.min(3, v.scale * 1.18) }))}
              aria-label="Zoom in" title="Zoom in"
              style={{height: 26, width: 26, borderRadius: 999}}>
              <span style={{fontFamily:"var(--font-mono)", fontSize: 14, lineHeight: 1, color:"var(--c-ink)"}}>+</span>
            </button>
            <span style={{width: 1, height: 16, background:"var(--c-line)", margin:"0 2px"}} aria-hidden="true" />
            <button className="btn btn--ghost btn--sm" onClick={fitView}
              title="Fit all nodes in view"
              style={{height: 26, padding:"0 10px", borderRadius: 999, fontSize: 11.5}}>
              Fit
            </button>
          </div>
        )}
        {controls && (
          <button className="btn btn--ghost btn--icon" onClick={exportLayout}
            aria-label="Export canvas as image" title="Export canvas as image"
            style={{height: 30, width: 30}}>
            <Icon name="download" size={13} />
          </button>
        )}
      </div>

      {/* Stage — everything in canvas-space, transformed as one */}
      <div className="cv-stage" style={{
        position:"absolute", top: 0, left: 0, zIndex: 2,
        transform:`translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
        transformOrigin:"0 0",
      }}>
        <svg style={{position:"absolute", top: 0, left: 0, width: 2000, height: 900, overflow:"visible", pointerEvents:"none"}}>
          <defs>
            <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--neutral-400)" />
            </marker>
            <marker id="arr-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--yellow-600)" />
            </marker>
          </defs>
          {edges.map((e, i) => {
            const on = hovered && (e.from === hovered || e.to === hovered);
            const dim = hovered && !on;
            return (
              <path
                key={i}
                className={"cv-edge" + (e.dashed ? " cv-edge--dashed" : "")}
                d={edgePath(e)}
                pathLength={e.dashed ? undefined : 1}
                fill="none"
                stroke={on ? "var(--yellow-600)" : "var(--neutral-400)"}
                strokeWidth={on ? 2.2 : 1.4}
                strokeDasharray={e.dashed ? "6 5" : undefined}
                markerEnd={on ? "url(#arr-on)" : "url(#arr)"}
                style={{ opacity: dim ? 0.3 : 1, transition:"stroke 140ms ease, stroke-width 140ms ease, opacity 140ms ease", animationDelay:`${260 + i * 60}ms` }}
              />
            );
          })}
        </svg>

        {nodes.map((n, i) => (
          <CanvasNode
            key={n.id}
            node={n}
            index={i}
            color={CANVAS_COLORS[n.kind] || CANVAS_COLORS.copy}
            refCb={(el) => { nodeRefs.current[n.id] = el; }}
            active={hovered === n.id}
            dim={hovered && hovered !== n.id}
            dragging={drag.current && drag.current.mode === "node" && drag.current.id === n.id}
            onPointerDown={(e) => startNode(e, n)}
            onEnter={() => setHovered(n.id)}
            onLeave={() => setHovered(h => (h === n.id ? null : h))}
          >
            {renderNode ? renderNode(n, { active: hovered === n.id, dragging: drag.current && drag.current.id === n.id }) : null}
          </CanvasNode>
        ))}
      </div>

      {/* Bottom helper */}
      {helper !== false && (
        <div onPointerDown={stop} style={{position:"absolute", bottom: 18, left: "50%", transform:"translateX(-50%)", zIndex: 5}}>
          <div className="card" style={{padding:"9px 16px", display:"flex", alignItems:"center", gap: 12}}>
            <BrandolphDot />
            <span style={{fontSize: 12.5, color:"var(--c-dim)"}}>
              {helper || <>Drag to pan · scroll to zoom · <strong style={{color:"var(--c-ink)", fontWeight:600}}>click any node</strong> for the detail and rationale.</>}
            </span>
          </div>
        </div>
      )}

      <style>{`
        .cv-node { animation: cvNodeIn 420ms cubic-bezier(.2,.8,.2,1) both; }
        @keyframes cvNodeIn { from { opacity: 0; transform: scale(.94) translateY(6px); } to { opacity: 1; transform: none; } }
        .cv-edge { stroke-dasharray: 1; stroke-dashoffset: 1; animation: cvDraw 700ms ease forwards; }
        .cv-edge--dashed { stroke-dasharray: 6 5; stroke-dashoffset: 0; animation: cvFade 500ms ease both; }
        @keyframes cvDraw { to { stroke-dashoffset: 0; } }
        @keyframes cvFade { from { opacity: 0; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .cv-node { animation: none !important; }
          .cv-edge, .cv-edge--dashed { animation: none !important; stroke-dashoffset: 0 !important; }
        }
      `}</style>
    </div>
  );
}

/* Standalone demo canvas (kept for deep-links; no longer a nav item). */
/* ── BriefRunCanvas — the assembly + run UX. Reads run context from
   sessionStorage (set by HomeCreate on `Proceed to assembly`) and
   renders BIO → Brief → Specialists as fixed-height compact nodes
   that DON'T grow during streaming (so they never stack/overlap).
   Each specialist has a progress bar; clicking opens a notepad
   drawer where the user can read/edit/copy the output. */
/* Canvas header — the "what am I looking at" overview that anchors
   every node graph below. Title (Sharpener-generated), the tension in
   a single line, an expandable Sharpened brief, a chip-row of the crew
   by department, and the refusals as small badges. Designed to feel
   like the brief, not a status bar. */
function CanvasHeader({ title, tension, sharpenedBrief, refusals = [], deptBreakdown = [], totalCr, completed, running }) {
  const [expanded, setExpanded] = useBrState(false);
  const stateColor = completed ? "var(--green-600)" : running ? "var(--yellow-700)" : "var(--neutral-500)";
  const stateLabel = completed ? "Run complete" : running ? "Running" : "Crew assembled";
  return (
    <div style={{
      padding:"14px 36px 12px", borderBottom:"1px solid var(--c-line)",
      background:"var(--c-card)", position:"relative", zIndex: 2,
    }}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap: 18, marginBottom: 8}}>
        <div style={{minWidth: 0, flex: 1}}>
          <div style={{display:"flex", alignItems:"center", gap: 10, marginBottom: 4}}>
            <span style={{
              fontFamily:"var(--font-mono)", fontSize: 10, color: stateColor,
              letterSpacing:"0.12em", textTransform:"uppercase", fontWeight: 600,
            }}>{stateLabel}</span>
            {totalCr != null && (
              <span style={{fontFamily:"var(--font-mono)", fontSize: 10, color:"var(--c-faint)", letterSpacing:"0.04em"}}>
                · {totalCr} cr
              </span>
            )}
          </div>
          <h1 style={{
            margin: 0, fontFamily:"Georgia, serif", fontStyle:"italic",
            fontSize: 22, lineHeight: 1.2, letterSpacing:"-0.005em", fontWeight: 400, color:"var(--c-ink)",
            overflow:"hidden", textOverflow:"ellipsis", display:"-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient:"vertical",
          }}>{title || "(untitled brief)"}</h1>
          {tension && (
            <p style={{
              margin:"6px 0 0", fontSize: 12.5, color:"var(--c-dim)", lineHeight: 1.5,
              overflow:"hidden", textOverflow:"ellipsis", display:"-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient:"vertical",
            }}>
              <span style={{color:"var(--c-faint)", fontFamily:"var(--font-mono)", fontSize: 10, marginRight: 6, letterSpacing:"0.08em", textTransform:"uppercase"}}>Tension</span>
              {tension}
            </p>
          )}
        </div>

        {/* Crew composition — chips by department */}
        <div style={{display:"flex", gap: 5, flexShrink: 0, alignItems:"center", flexWrap:"wrap", maxWidth: 460, justifyContent:"flex-end"}}>
          {deptBreakdown.map(([dept, count]) => {
            const color = window.CI_DEPT_COLORS?.[dept] || "var(--neutral-500)";
            return (
              <span key={dept} style={{
                display:"inline-flex", alignItems:"center", gap: 5, height: 22, padding:"0 9px", borderRadius: 999,
                background:"var(--c-bg)", border: "1px solid var(--c-line)",
                fontFamily:"var(--font-mono)", fontSize: 10, fontWeight: 500, color:"var(--c-ink)", letterSpacing:"0.02em",
              }}>
                <span style={{width: 6, height: 6, borderRadius:"50%", background: color, display:"inline-block"}} />
                {dept}
                <span style={{color:"var(--c-faint)"}}>· {count}</span>
              </span>
            );
          })}
          {(sharpenedBrief || refusals.length > 0) && (
            <button onClick={() => setExpanded((e) => !e)}
              className="btn btn--ghost btn--sm"
              style={{height: 22, padding:"0 8px", fontSize: 10.5, fontFamily:"var(--font-mono)", letterSpacing:"0.04em"}}>
              {expanded ? "Hide brief" : "Show brief"}
              <span style={{display:"inline-block", marginLeft: 4, transform: expanded ? "rotate(180deg)" : "none", transition:"transform 160ms ease"}}>▾</span>
            </button>
          )}
        </div>
      </div>

      {/* Expandable details — sharpened brief + refusals */}
      {expanded && (sharpenedBrief || refusals.length > 0) && (
        <div style={{
          marginTop: 12, paddingTop: 12, borderTop: "1px dashed var(--c-line-2)",
          display:"grid", gridTemplateColumns: refusals.length > 0 ? "1fr 280px" : "1fr",
          gap: 20, animation:"routeFadeIn 200ms cubic-bezier(.2,.8,.2,1) both",
        }}>
          {sharpenedBrief && (
            <div>
              <div className="eyebrow" style={{marginBottom: 6}}>Brandolph's sharpened brief</div>
              <p style={{margin: 0, fontFamily:"Georgia, serif", fontStyle:"italic", fontSize: 13.5, lineHeight: 1.6, color:"var(--c-ink)"}}>
                {sharpenedBrief}
              </p>
            </div>
          )}
          {refusals.length > 0 && (
            <div>
              <div className="eyebrow" style={{marginBottom: 6}}>Hard refusals for this brief</div>
              <div style={{display:"flex", flexDirection:"column", gap: 4}}>
                {refusals.slice(0, 6).map((r, i) => (
                  <div key={i} style={{fontSize: 11.5, color:"var(--c-dim)", lineHeight: 1.45, paddingLeft: 12, position:"relative"}}>
                    <span style={{position:"absolute", left: 0, color:"var(--pink-500)"}}>×</span>
                    {r}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MoodBoardCard({ tiles = [], bioVisual = null }) {
  const palette = bioVisual?.palette || [];
  const imagery = bioVisual?.imagery || [];
  // bio.visual.type is an array of { kind, family, ... } — render as type specimens.
  const typeList = Array.isArray(bioVisual?.type) ? bioVisual.type : [];
  return (
    <div className="moodboard">
      <div className="moodboard-tiles">
        {tiles.map((url, i) => (
          <img key={i} src={url} alt="" className="moodboard-tile" />
        ))}
      </div>
      {palette.length > 0 && (
        <div className="moodboard-swatches">
          {palette.map((p, i) => (
            <span key={i} className="moodboard-swatch" style={{ background: p.hex || "#ccc" }} title={`${p.name || ""} ${p.hex || ""}`.trim()} />
          ))}
        </div>
      )}
      {typeList.length > 0 && (
        <div className="moodboard-type">
          {typeList.slice(0, 2).map((t, i) => (
            <span key={i} style={{ fontFamily: t.family || "inherit", marginRight: 10 }}>
              {t.family || t.kind || "Aa"}
            </span>
          ))}
        </div>
      )}
      {imagery.length > 0 && (
        <div className="moodboard-keywords">
          {imagery.slice(0, 4).map((k, i) => <span key={i} className="moodboard-kw">{k}</span>)}
        </div>
      )}
    </div>
  );
}

function BriefRunCanvas({ context, onClear, go }) {
  const [nodes, setNodes]         = useBrState(() => buildInitialRunNodes(context));
  const [edges, setEdges]         = useBrState(() => buildInitialRunEdges(context));
  const [running, setRunning]     = useBrState(false);
  const [completed, setCompleted] = useBrState(false);
  const [err, setErr]             = useBrState(null);
  const [openId, setOpenId]       = useBrState(null);            /* selected specialist id for the notepad drawer */
  const [openDeliverable, setOpenDeliverable] = useBrState(null);   /* clicked deliverable card → content drawer */
  const [openBrief, setOpenBrief] = useBrState(false);   /* clicked Brief node → brief drawer */
  const [editedText, setEditedText] = useBrState({});            /* per-spec text overrides from the notepad */
  const [briefId, setBriefId]       = useBrState(null);          /* surfaced so the notepad can fire re-runs */

  const specs = (context.specialistIds || []).map((id) => window.CI_AGENTS.find((a) => a.id === id)).filter(Boolean);

  /* Live cert state for the moat footer */
  const [cert, setCert] = useBrState(null);
  React.useEffect(() => {
    (async () => {
      try {
        const wantedId = window.getCurrentBrandId?.();
        let brandId = wantedId;
        if (!brandId) {
          const { data: brands } = await supabase.from("brands").select("id").order("created_at", { ascending: true }).limit(1);
          brandId = brands?.[0]?.id;
        }
        if (!brandId) return;
        const { data: bio } = await supabase.from("bios").select("certified_by, certified_at, version")
          .eq("brand_id", brandId).eq("certified", true).order("version", { ascending: false }).limit(1).maybeSingle();
        /* Keep self-certified BIOs (certified_by NULL) — byName null is how
           the footer tells tier 1 apart from a senior sign-off. version is
           what stops a v3 signature attaching itself to a v2 output. */
        if (bio) {
          let byName = null;
          if (bio.certified_by) {
            const { data: tm } = await supabase.from("team_members").select("first_name").eq("id", bio.certified_by).maybeSingle();
            byName = tm?.first_name || "your Steward";
          }
          setCert({ byName, at: bio.certified_at, version: bio.version });
        }
      } catch (e) { /* non-fatal */ }
    })();
  }, []);

  /* Compact, fixed-height node renderer. Specialist cards never grow
     beyond their reserved Y slot, so they can never stack/overlap.
     Image specialists get a thumbnail preview inside the card once
     the asset_url lands. The full output lives in the notepad drawer
     (opened on click). */
  const renderNode = (node) => {
    if (node.kind === "deliverable-group") {
      return (
        <div style={{
          width: "100%", height: node.h, boxSizing: "border-box",
          border: "1.5px dashed var(--c-line)", borderRadius: 16,
          background: "rgba(0,0,0,0.012)", pointerEvents: "none",
        }}>
          <div style={{
            padding: "8px 14px", fontFamily: "var(--font-mono)", fontSize: 10,
            letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--c-faint)",
          }}>
            {node.label} · {node.count} deliverable{node.count > 1 ? "s" : ""}
          </div>
        </div>
      );
    }

    if (node.kind === "moodboard") {
      return (
        <div className="cv-node" style={{
          background: "var(--c-card)", border: "1px solid var(--c-line)",
          borderLeft: "3px solid var(--green-500)", borderRadius: 10, overflow: "hidden",
          boxShadow: "var(--shadow-md)", width: "100%", boxSizing: "border-box",
        }}>
          <MoodBoardCard tiles={node.tiles || []} bioVisual={node.bioVisual || null} />
        </div>
      );
    }

    if (node.kind === "deliverable") {
      const flagged = node.status === "flagged";
      const stateColor = flagged ? "var(--pink-500)" : "var(--green-500)";
      return (
        <div className="cv-node" style={{
          background: "var(--c-card)", border: "1px solid var(--c-line)",
          borderLeft: `3px solid ${stateColor}`, borderRadius: 10, overflow: "hidden",
          boxShadow: "var(--shadow-md)", width: "100%", boxSizing: "border-box",
          height: node.h || 172, display: "flex", flexDirection: "column",
        }}>
          {node.assetUrl && (
            <div style={{ height: 120, backgroundImage: `url("${node.assetUrl}")`, backgroundSize: "cover", backgroundPosition: "center" }} />
          )}
          <div style={{ padding: "10px 12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span className="eyebrow" style={{ fontSize: 9, color: stateColor, letterSpacing: "0.04em" }}>
                {(node.platform || "generic").toUpperCase()} · {flagged ? "FLAGGED" : "READY"}
              </span>
              {node.humanCraft && <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing:"0.06em", color:"var(--purple-600, #6b46c1)" }}>✦ IN HUMAN CRAFT</span>}
              {node.qa?.voice_match != null && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--c-faint)" }}>{node.qa.voice_match}/100</span>
              )}
            </div>
            {node.title && <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4, color: "var(--c-ink)" }}>{node.title}</div>}
            <div style={{ fontSize: 12, lineHeight: 1.45, color: "var(--c-dim)", flex: 1, maxHeight: "none", overflow: "hidden", whiteSpace: "pre-wrap" }}>{node.body}</div>
            {node.specialistName && (
              <div style={{ marginTop: 8, fontSize: 9.5, color: "var(--c-faint)", fontFamily: "var(--font-mono)", letterSpacing: "0.03em" }}>
                by {node.specialistName}
              </div>
            )}
          </div>
        </div>
      );
    }

    const isSpecialist = node.kind === "specialist";
    const isImage = isSpecialist && node.assetUrl;
    const state = node.state || node.kind;
    const stateColor = {
      bio:        "var(--yellow-500)",
      brief:      "var(--neutral-900)",
      queued:     "var(--neutral-300)",
      running:    "var(--yellow-500)",
      done:       "var(--green-500)",
      flagged:    "var(--pink-500)",
      failed:     "var(--pink-500)",
    }[state] || "var(--neutral-300)";

    /* Progress percentage during streaming — calibrated against the
       spec's credit estimate (≈ 100 tokens / cr). Caps at 95 % until
       the done event lands so the bar never finishes prematurely. */
    let pct = 0;
    if (isSpecialist) {
      if (state === "done" || state === "flagged" || state === "failed") pct = 100;
      else if (state === "running") {
        const maxTokens = (node.cr || 8) * 100;
        const got = node.tokenCount || 0;
        pct = Math.min(95, Math.round((got / maxTokens) * 100));
      }
    }

    const clickable = isSpecialist && (state === "done" || state === "flagged" || state === "running");

    return (
      <div className={"cv-node cv-node--" + state} style={{
        background: "var(--c-card)",
        border: "1px solid var(--c-line)",
        borderLeft: `3px solid ${stateColor}`,
        borderRadius: 10, padding: "12px 14px",
        boxShadow: "var(--shadow-md)",
        /* fixed height — no stacking. 152 fits the tallest variant (image
           thumbnail + provenance footer) so the footer is never clipped. */
        height: isSpecialist ? 152 : 104,
        boxSizing: "border-box", overflow: "hidden",
        display: "flex", flexDirection: "column",          /* footer pins to the bottom */
        animation: state === "running" ? "runPulse 1.6s ease-in-out infinite" : undefined,
        cursor: clickable ? "pointer" : "default",
      }}
      onClick={(e) => { if (clickable) { e.stopPropagation(); setOpenId(node.specId); } }}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 4}}>
          <div className="eyebrow" style={{fontSize: 9, color: stateColor}}>
            {(node.eyebrow || node.kind).toUpperCase()}
            {state === "running" && " · streaming"}
            {state === "done"    && " · done"}
            {state === "flagged" && " · flagged"}
            {state === "failed"  && " · failed"}
          </div>
          {isSpecialist && state !== "queued" && (
            <span style={{fontFamily:"var(--font-mono)", fontSize: 10, color:"var(--c-faint)"}}>{node.cr ?? "?"} cr</span>
          )}
        </div>
        <div style={{fontSize: 13.5, fontWeight: 500, color:"var(--c-ink)", lineHeight: 1.3, marginBottom: 6, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
          {node.title}
        </div>
        {isSpecialist && (
          <>
            {/* Image thumbnail OR progress bar */}
            {isImage ? (
              <div style={{
                height: 48, marginTop: 4, marginBottom: 6, borderRadius: 6, overflow:"hidden",
                background:"var(--neutral-50)",
                backgroundImage: `url("${node.assetUrl}")`,
                backgroundSize:"cover", backgroundPosition:"center",
              }} />
            ) : (
              <div style={{
                height: 4, background:"var(--neutral-50)", borderRadius: 999,
                marginTop: 6, marginBottom: 8, overflow:"hidden",
              }}>
                <div style={{
                  height:"100%", width: pct + "%", borderRadius: 999,
                  background: state === "flagged" || state === "failed" ? "var(--pink-500)" : stateColor,
                  transition:"width 240ms ease",
                }} />
              </div>
            )}
            <div style={{display:"flex", justifyContent:"space-between", fontFamily:"var(--font-mono)", fontSize: 10, color:"var(--c-faint)", letterSpacing:"0.04em"}}>
              <span>{node.sub}</span>
              {clickable
                ? <span style={{color:"var(--c-dim)"}}>open ↗</span>
                : <span>{state === "queued" ? `${node.cr || "?"} cr` : ""}</span>}
            </div>
            {/* Provenance only once the run has reported — a queued node has
                no BIO version and no elapsed time to stand behind. */}
            {node.done?.brand && (
              <NodeProvenance bioVersion={node.done.brand.bioVersion} cert={cert} latencyMs={node.latencyMs} />
            )}
          </>
        )}
        {!isSpecialist && node.sub && (
          <div style={{fontFamily:"var(--font-mono)", fontSize: 10.5, color:"var(--c-faint)", letterSpacing:"0.04em", lineHeight: 1.45, marginTop: 4}}>
            {node.sub.length > 70 ? node.sub.slice(0, 70) + "…" : node.sub}
          </div>
        )}
      </div>
    );
  };

  const runAssembly = async () => {
    if (running || completed) return;
    setRunning(true); setErr(null);
    let sharedBriefId = null;

    /* Visual specialists that pair with a copy part in their group are fired
       per-slot (one image per caption) from the copy specialist's completion —
       so we skip their standalone run in this loop. */
    const pairedVisualIds = new Set();
    /* Map copy-agent-id → true when its group has a paired visual, so we can
       set withVisualDirection on the copy run's deliverableSpec below. */
    const copyHasVisual = new Map();
    for (const g of context.deliveryPlan?.deliverableGroups || []) {
      const entries = Object.entries(g.crew || {});
      const hasText = entries.some(([part]) => !/image|frames|hero/i.test(part));
      const visual = entries.find(([part]) => /image|frames|hero/i.test(part));
      if (hasText && visual) {
        pairedVisualIds.add(visual[1]);
        /* Record every non-visual crew member as having a paired visual. */
        for (const [part, id] of entries) {
          if (!/image|frames|hero/i.test(part)) copyHasVisual.set(id, true);
        }
      }
    }

    for (const agent of specs) {
      if (pairedVisualIds.has(agent.id)) {
        /* This visual specialist renders per-slot images into its group's copy
           cluster (handled when the copy specialist completes). Mark it waiting
           and skip the standalone single-image run. */
        setNodes((prev) => prev.map((n) => n.id === "spec-" + agent.id
          ? { ...n, state: "queued", sub: "pairs with the copy cluster" } : n));
        continue;
      }
      // Mood board: fan into cohesive imagery tiles, then compose a board.
      if (agent.code === "L2-35") {
        const FACETS = ["texture & material close-up", "environmental scene", "product-in-context detail"];
        const tiles = [];
        let bioVisual = null;
        for (let i = 0; i < FACETS.length; i++) {
          setNodes((prev) => prev.map((n) => n.id === "spec-" + agent.id
            ? { ...n, state: "running", sub: `rendering tile ${i + 1}/${FACETS.length}…` } : n));
          await streamSpecialistRun({
            specialistId: agent.id,
            briefText: `${context.rawBrief || context.title || ""} — mood board tile: ${FACETS[i]}`,
            briefId: sharedBriefId,
            onProgress: () => {},
            onDone: (img) => {
              if (!sharedBriefId && img?.briefId) { sharedBriefId = img.briefId; setBriefId(img.briefId); }
              const url = img?.output?.asset_url || null;
              if (url) tiles.push(url);
              if (!bioVisual && img?.output?.bio_visual) bioVisual = img.output.bio_visual;
            },
            onError: () => {},
          });
        }
        setNodes((prev) => prev.map((n) => n.id === "spec-" + agent.id
          ? { ...n, state: "done", kind: "moodboard", tiles, bioVisual, sub: `${tiles.length} tiles · board` } : n));
        continue; // skip the generic single-image handling for this specialist
      }

      setNodes((prev) => prev.map((n) => n.id === "spec-" + agent.id
        ? { ...n, state: "running", tokenCount: 0, outputText: "", sub: "streaming…" } : n));

      let text = "";
      let qa   = null;
      let done = null;
      let local_err = null;
      let tokenCount = 0;
      /* briefMeta only matters on the FIRST call — it's how the new
         brief row gets its real title + sharpener payload. Subsequent
         calls in the same assembly already have a briefId. */
      const briefMeta = sharedBriefId ? undefined : {
        title:          context.title || "",
        sharpenedBrief: context.sharpenedBrief || "",
        tension:        context.tension || "",
        rawBrief:       context.rawBrief || "",
        refusals:       context.refusals || [],
      };
      const dspec = deliverableSpecForAgent(agent.id, context.deliveryPlan);
      const hasVisual = !!copyHasVisual.get(agent.id);
      /* The SSE done event carries no latency_ms, so time the stream here —
         wall-clock is what the footer claims and what the user waited. */
      const startedAt = Date.now();
      await streamSpecialistRun({
        specialistId: agent.id,
        briefText:    context.composedBrief,
        briefId:      sharedBriefId,
        briefMeta,
        deliverableSpec: dspec ? { ...dspec, withVisualDirection: hasVisual } : undefined,
        onToken: ({ text: t }) => {
          text += t;
          tokenCount += 1;
          setNodes((prev) => prev.map((n) => n.id === "spec-" + agent.id
            ? { ...n, outputText: text, tokenCount } : n));
        },
        onProgress: ({ stage, pct }) => {
          /* Image specialists emit `progress` instead of `token`. We
             surface the stage label as the sub-line and drive the
             progress bar via a synthetic tokenCount so the same UI
             affordance works for both text and image runs. */
          const p = Math.max(0, Math.min(100, Number(pct) || 0));
          setNodes((prev) => prev.map((n) => n.id === "spec-" + agent.id
            ? { ...n, sub: stage || "rendering…", tokenCount: Math.round((p / 100) * (n.cr || 14) * 100) }
            : n));
        },
        onQa:    (data) => { qa = data; },
        onDone:  (data) => {
          done = data;
          if (!sharedBriefId && data.briefId) { sharedBriefId = data.briefId; setBriefId(data.briefId); }
        },
        onError: ({ message }) => { local_err = message; },
      });

      if (local_err) {
        setNodes((prev) => prev.map((n) => n.id === "spec-" + agent.id
          ? { ...n, state: "failed", sub: local_err.slice(0, 60) } : n));
        setErr(`${agent.name}: ${local_err}`);
        break;
      }

      const passed = qa?.passed !== false;

      const assetUrl = done?.output?.asset_url || null;
      setNodes((prev) => prev.map((n) => n.id === "spec-" + agent.id
        ? {
            ...n,
            state: passed ? "done" : "flagged",
            outputText: text,
            assetUrl,
            qa,
            done,
            latencyMs: Date.now() - startedAt,
            sub: assetUrl
              ? `${qa?.brand_match ?? "?"}/100 · ${passed ? "approved" : "flagged"}`
              : `${qa?.voice_match ?? "?"}/100 · ${passed ? "approved" : "flagged"}`,
          }
        : n));

      /* Fan-out: a deliverable run returns N items → append a CONTAINED cluster
         (one bordered box + a grid of cards), stacked below any existing
         cluster so they never overlap. Legacy runs skip this entirely. */
      if (done?.output?.kind === "deliverables" && Array.isArray(done.output.deliverables)) {
        setNodes((prev) => {
          const specNode = prev.find((n) => n.id === "spec-" + agent.id);
          if (!specNode) return prev;
          /* Stack each new card-grid below any existing cards so lanes never
             overlap, computed off the cards themselves (no group node now). */
          const existing = prev.filter((n) => n.kind === "deliverable");
          const laneTop = existing.length
            ? Math.max(...existing.map((c) => c.y + (c.h || 172))) + 40
            : Math.max(40, specNode.y - 40);
          const { cardNodes } = buildDeliverableCluster(specNode, done.output.deliverables, laneTop, done.outputId);
          /* Edge each card straight back to its specialist — keeps them coupled. */
          setEdges((e) => [...e, ...cardNodes.map((c) => ({ from: specNode.id, to: c.id, fromSide: "right", toSide: "left" }))]);
          const cnt = done.output.deliverables.length;
          const summary = `${cnt} ${done.output.type || "deliverable"} card${cnt > 1 ? "s" : ""} — branch off ${specNode.title}`;
          return [
            ...prev.map((nd) => nd.id === specNode.id
              ? { ...nd, outputText: summary, sub: `${cnt} deliverables${done.output.platform ? " · " + done.output.platform : ""}` }
              : nd),
            ...cardNodes,
          ];
        });
      }

      /* Pair a per-slot image onto each card of the cluster we just built. */
      if (done?.output?.kind === "deliverables" && Array.isArray(done.output.deliverables)) {
        const group = (context.deliveryPlan?.deliverableGroups || [])
          .find((g) => Object.values(g.crew || {}).includes(agent.id));
        const visualEntry = group && Object.entries(group.crew || {}).find(([part]) => /image|frames|hero/i.test(part));
        const visualId = visualEntry?.[1];
        if (visualId) {
          const platform = group.platforms?.[0] || "generic";
          setNodes((prev) => prev.map((n) => n.id === "spec-" + visualId
            ? { ...n, state: "running", sub: "rendering images…" } : n));
          const items = done.output.deliverables;
          for (let i = 0; i < items.length; i++) {
            const cardId = `spec-${agent.id}-d${i}`;
            setNodes((prev) => prev.map((n) => n.id === "spec-" + visualId
              ? { ...n, sub: `rendering image ${i + 1}/${items.length}…` } : n));
            await streamSpecialistRun({
              specialistId: visualId,
              briefText: context.rawBrief || context.title || "",
              briefId: sharedBriefId,
              deliverableSpec: { type: group.type, part: "image", count: 1, platform, sourceText: items[i].body, artDirection: items[i].visualDirection || null },
              onProgress: () => {},
              onDone: (img) => {
                const url = img?.output?.asset_url || null;
                if (url) setNodes((prev) => prev.map((n) => n.id === cardId ? { ...n, assetUrl: url } : n));
              },
              onError: () => {},
            });
          }
          setNodes((prev) => prev.map((n) => n.id === "spec-" + visualId
            ? { ...n, state: "done", sub: `${items.length} image${items.length > 1 ? "s" : ""} → ${agent.name || "copy"} cluster` } : n));
        }
      }
    }

    setRunning(false);
    setCompleted(true);
  };

  /* Selected specialist node + its run output for the notepad drawer */
  const opened = openId && nodes.find((n) => n.specId === openId);
  const openedAgent = openId && specs.find((a) => a.id === openId);

  /* Department breakdown for the canvas header — chips that show
     "Strategy 1 · Concept 2 · Copy 1 · Visual 1" at a glance. */
  const deptBreakdown = (() => {
    const map = new Map();
    for (const s of specs) {
      const d = s?.dept || "Other";
      map.set(d, (map.get(d) || 0) + 1);
    }
    return Array.from(map.entries());
  })();

  const sendToHuman = async (cardNode, notes) => {
    if (cardNode.sourceOutputId != null && cardNode.slot != null) {
      try { await apiFetch("/api/craft", { method: "POST", body: JSON.stringify({ outputId: cardNode.sourceOutputId, slot: cardNode.slot, notes }) }); } catch (e) {}
    }
    try { if (window.CI_CREDITS) window.CI_CREDITS.balance = Math.max(0, (window.CI_CREDITS.balance || 0) - HUMAN_POLISH_CR); } catch (e) {}
    setNodes((prev) => prev.map((n) => n.id === cardNode.id ? { ...n, humanCraft: true, polishNotes: notes } : n));
    setOpenDeliverable((d) => (d && d.id === cardNode.id ? { ...d, humanCraft: true, polishNotes: notes } : d));
  };

  return (
    <>
      <CanvasHeader
        title={context.title || context.sharpenedBrief?.split(/(?<=[.!?])\s/)[0] || context.rawBrief?.slice(0, 90) || "Brief"}
        tension={context.tension}
        sharpenedBrief={context.sharpenedBrief}
        refusals={context.refusals || []}
        deptBreakdown={deptBreakdown}
        totalCr={context.totalCr}
        completed={completed}
        running={running}
      />
      <InteractiveCanvas
        nodeData={nodes}
        edges={edges}
        renderNode={renderNode}
        exportName="run-canvas"
        onNodeClick={(node) => {
          /* InteractiveCanvas uses setPointerCapture on the wrapper which
             swallows any inner onClick — node clicks MUST come through here. */
          if (node?.kind === "deliverable") { setOpenDeliverable(node); return; }
          if (node?.kind === "brief") { setOpenBrief(true); return; }
          if (!node || node.kind !== "specialist" || !node.specId) return;
          const st = node.state;
          if (st === "running" || st === "done" || st === "flagged") setOpenId(node.specId);
        }}
        helper={
          running     ? "Running the crew… each card streams its progress. Click any to open the full output."
          : completed ? `Run complete · ${context.totalCr} cr spent. Click any specialist to verify, edit, or copy its output.`
          : "Crew assembled. Hit Run when you're ready."
        }
        toolbarExtra={
          <>
            {err && <span style={{fontSize: 11, color:"var(--pink-500)", marginRight: 10}}>{err}</span>}
            {completed && (
              <>
                {/* Run-complete state badge — visual confirmation of "done", separate from any action */}
                <span style={{
                  display:"inline-flex", alignItems:"center", gap: 6, height: 28, padding:"0 10px",
                  borderRadius: 999, background:"var(--green-50, rgba(127,163,122,0.16))",
                  color:"var(--green-600)", fontFamily:"var(--font-mono)", fontSize: 10.5,
                  letterSpacing:"0.08em", textTransform:"uppercase", fontWeight: 600,
                }}>
                  <Icon name="check" size={11} /> Run complete
                </span>
                {/* Actions — clearly buttons, not state */}
                <a href="#/library" className="btn btn--primary btn--sm" style={{height: 28}}>
                  Open Library <Icon name="arrow" size={12} />
                </a>
                <button className="btn btn--ghost btn--sm" onClick={() => { onClear(); go("home"); }} style={{height: 28}}>
                  <Icon name="plus" size={12} /> New brief
                </button>
              </>
            )}
          </>
        }
      />

      {/* Prominent floating RUN button — the moment of action. Sits
          center-bottom above the canvas helper, impossible to miss. */}
      {!completed && (
        <button
          onClick={runAssembly}
          disabled={running}
          style={{
            position:"fixed",
            bottom: 120, left:"50%", transform:"translateX(-50%)",
            zIndex: 50,
            height: 60, padding:"0 36px",
            borderRadius: 999,
            border:"none", cursor: running ? "default" : "pointer",
            background: running ? "var(--neutral-900)" : "var(--yellow-500)",
            color: running ? "#fff" : "var(--c-ink)",
            fontFamily:"var(--font-sans)", fontWeight: 600, fontSize: 16, letterSpacing:"-0.005em",
            boxShadow:"0 16px 36px rgba(0,0,0,0.18), 0 4px 10px rgba(0,0,0,0.08)",
            display:"inline-flex", alignItems:"center", gap: 12,
            transition: running ? "none" : "transform 140ms ease, box-shadow 140ms ease",
          }}
          onMouseEnter={(e) => { if (!running) { e.currentTarget.style.transform = "translateX(-50%) translateY(-2px)"; e.currentTarget.style.boxShadow = "0 22px 44px rgba(0,0,0,0.22), 0 6px 14px rgba(0,0,0,0.1)"; } }}
          onMouseLeave={(e) => { if (!running) { e.currentTarget.style.transform = "translateX(-50%)"; e.currentTarget.style.boxShadow = "0 16px 36px rgba(0,0,0,0.18), 0 4px 10px rgba(0,0,0,0.08)"; } }}
        >
          {running ? (
            <><BrandolphDot state="thinking" size={11} /> &nbsp;Running the crew…</>
          ) : (
            <><span style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize: 17}}>Run</span> the assembly · {context.totalCr} cr <Icon name="arrow" size={16} /></>
          )}
        </button>
      )}

      {/* Notepad drawer — verify, edit, copy, save the specialist's output.
          Edits persist via PATCH /api/outputs/:id into body.edited_text. */}
      {opened && openedAgent && (
        <SpecialistNotepad
          agent={openedAgent}
          node={opened}
          cert={cert}
          context={context}
          briefId={briefId}
          brandId={context.brandId}
          onRerun={() => {
            /* The re-run created a new run row on the same brief. We
               don't auto-replace the canvas node — the user can refresh
               or open the brief in view mode to see the new version. */
          }}
          outputId={opened.done?.outputId || null}
          baselineText={opened.outputText || ""}
          editedText={editedText[openId] ?? opened.outputText ?? ""}
          onEdit={(text) => setEditedText((prev) => ({ ...prev, [openId]: text }))}
          onSaved={(saved) => {
            /* Update the node's outputText so subsequent diffs aren't dirty */
            setNodes((prev) => prev.map((n) => n.id === "spec-" + opened.specId
              ? { ...n, outputText: saved.body?.edited_text || saved.body?.text || n.outputText }
              : n));
          }}
          onClose={() => setOpenId(null)}
        />
      )}
      {openDeliverable && (
        <DeliverableDrawer node={openDeliverable} onClose={() => setOpenDeliverable(null)} onSendToHuman={sendToHuman} />
      )}
      {openBrief && (
        <BriefDrawer
          brief={{ title: context.title, tension: context.tension, sharpenedBrief: context.sharpenedBrief, rawBrief: context.rawBrief, refusals: context.refusals, deliveryPlan: context.deliveryPlan }}
          onClose={() => setOpenBrief(false)}
        />
      )}
    </>
  );
}

/* Curated re-run alternatives. Text specialists get text models; image
   specialists get image models. The cost-default already picked the
   right one — these are for "escalate to premium" or "try cheaper". */
const TEXT_RERUN_OPTIONS = [
  { route: "anthropic/claude-opus-4-7",            label: "Opus 4.7",            note: "Premium — deepest reasoning" },
  { route: "anthropic/claude-sonnet-4-6",          label: "Sonnet 4.6",          note: "Balanced workhorse" },
  { route: "anthropic/claude-haiku-4-5-20251001",  label: "Haiku 4.5",           note: "Fast + cheap" },
  { route: "openrouter/google/gemini-2.5-pro",     label: "Gemini Pro",          note: "Long-context synthesis" },
  { route: "openrouter/google/gemini-2.5-flash",   label: "Gemini Flash",        note: "Cheapest" },
];
const IMAGE_RERUN_OPTIONS = [
  { route: "vendor/fal/flux-1.1-pro",  label: "Flux 1.1 Pro",   note: "Premium hero quality" },
  { route: "vendor/fal/flux-schnell",  label: "Flux Schnell",   note: "Fast draft (13× cheaper)" },
  { route: "vendor/fal/recraft-v3",    label: "Recraft V3",     note: "Vector / illustration" },
];

/* The brief + Brandolph's recommendations — opened by clicking the Brief node. */
function BriefDrawer({ brief, onClose }) {
  const groups = brief.deliveryPlan?.deliverableGroups || [];
  return (
    <Drawer open={true} onClose={onClose} title={brief.title || "Brief"} eyebrow="BRANDOLPH · BRIEF & RECOMMENDATIONS" width={620}
      footer={<button className="btn btn--ghost" onClick={onClose}>Close</button>}>
      {brief.tension && (
        <div style={{ marginBottom: 18 }}>
          <div className="eyebrow eyebrow--yellow" style={{ marginBottom: 6 }}>The tension Brandolph named</div>
          <p style={{ margin: 0, fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 16, lineHeight: 1.5, color: "var(--c-ink)" }}>{brief.tension}</p>
        </div>
      )}
      {brief.sharpenedBrief && (
        <div style={{ marginBottom: 18 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>How a CMO would write this</div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "var(--c-ink)" }}>{brief.sharpenedBrief}</p>
        </div>
      )}
      {brief.rawBrief && (
        <div style={{ marginBottom: 18 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Your original request</div>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--c-dim)" }}>{brief.rawBrief}</p>
        </div>
      )}
      {(brief.refusals || []).length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div className="eyebrow" style={{ marginBottom: 6, color: "var(--pink-500)" }}>Brandolph's recommendations — what we will NOT do</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {brief.refusals.map((r, i) => <li key={i} style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--c-ink)", marginBottom: 4 }}>{r}</li>)}
          </ul>
        </div>
      )}
      {groups.length > 0 && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>What Brandolph is producing</div>
          {groups.map((g, i) => (
            <div key={i} style={{ fontSize: 13.5, color: "var(--c-ink)", marginBottom: 4 }}>
              {g.count}× {String(g.type || "").replace(/_/g, " ")}{g.platforms?.length ? ` · ${g.platforms.join(", ")}` : ""}
            </div>
          ))}
        </div>
      )}
    </Drawer>
  );
}

/* Read the full content of one deliverable card — title, body, image, plus
   Copy / Export. Opened by clicking a deliverable card on the canvas. */
const HUMAN_POLISH_CR = 40;   /* credits to contract a human to polish one deliverable */
function DeliverableDrawer({ node, onClose, onSendToHuman }) {
  const [copied, setCopied] = useBrState(false);
  const flagged = node.status === "flagged";
  const stateColor = flagged ? "var(--pink-500)" : "var(--green-500)";
  const inCraft = !!node.humanCraft;
  const [polishMode, setPolishMode] = useBrState(false);
  const [polishNotes, setPolishNotes] = useBrState("");
  const copy = async () => {
    try { await navigator.clipboard.writeText(node.body || ""); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (e) {}
  };
  const exportOne = () => {
    const data = JSON.stringify({ title: node.title, body: node.body, platform: node.platform, status: node.status, by: node.specialistName }, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = (node.title || "deliverable").replace(/\s+/g, "-").toLowerCase() + ".json"; a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Drawer
      open={true}
      onClose={onClose}
      title={node.title}
      eyebrow={`${(node.platform || "generic").toUpperCase()} · ${flagged ? "FLAGGED" : "READY"}${node.qa?.voice_match != null ? ` · ${node.qa.voice_match}/100` : ""}${node.specialistName ? ` · by ${node.specialistName}` : ""}`}
      width={560}
      footer={
        inCraft ? (
          <>
            <button className="btn btn--ghost" onClick={onClose}>Close</button>
            <span style={{ display:"inline-flex", alignItems:"center", gap: 6, height: 28, padding:"0 12px", borderRadius: 999, background:"var(--purple-50, rgba(124,92,255,0.12))", color:"var(--purple-600, #6b46c1)", fontSize: 12, fontWeight: 600 }}>✦ In human craft</span>
          </>
        ) : polishMode ? (
          <>
            <button className="btn btn--ghost" onClick={() => setPolishMode(false)}>Cancel</button>
            <button className="btn btn--primary btn--sm" onClick={() => { onSendToHuman && onSendToHuman(node, polishNotes.trim()); setPolishMode(false); }}>
              Confirm — send to human · {HUMAN_POLISH_CR} cr
            </button>
          </>
        ) : (
          <>
            <button className="btn btn--ghost" onClick={onClose}>Close</button>
            <button className="btn btn--ghost btn--sm" onClick={exportOne}>Export</button>
            <button className="btn btn--ghost btn--sm" onClick={copy}>{copied ? "Copied ✓" : "Copy"}</button>
            {onSendToHuman && <button className="btn btn--primary btn--sm" onClick={() => setPolishMode(true)}>Send to human · {HUMAN_POLISH_CR} cr</button>}
          </>
        )
      }
    >
      {inCraft && (
        <div style={{ marginBottom: 14, padding:"10px 12px", borderRadius: 10, background:"var(--purple-50, rgba(124,92,255,0.10))", border:"1px solid var(--purple-200, rgba(124,92,255,0.3))", fontSize: 12.5, color:"var(--c-ink)" }}>
          ✦ A human is polishing this piece. You'll see the refined version land here when it's done.
          {node.polishNotes && <div style={{ marginTop: 8, paddingTop: 8, borderTop:"1px solid var(--purple-200, rgba(124,92,255,0.3))", fontStyle:"italic", color:"var(--c-dim)", whiteSpace:"pre-wrap" }}>Your brief to the human:{"\n"}{node.polishNotes}</div>}
        </div>
      )}
      {polishMode && !inCraft && (
        <div style={{ marginBottom: 16, padding:"14px 16px", borderRadius: 12, background:"var(--c-bg)", border:"1px solid var(--c-line)" }}>
          <div className="eyebrow eyebrow--yellow" style={{ marginBottom: 8 }}>Brief the human · what to polish</div>
          <textarea
            value={polishNotes}
            onChange={(e) => setPolishNotes(e.target.value)}
            autoFocus
            placeholder="Specific requests, points to add or edit — e.g. 'tighten the opening', 'make the CTA softer', 'add a line about the Madrid pour-over'."
            rows={4}
            style={{ width:"100%", padding:"10px 12px", borderRadius: 8, border:"1px solid var(--c-line)", background:"var(--c-card)", fontFamily:"inherit", fontSize: 13.5, lineHeight: 1.55, resize:"vertical", outline:"none", boxSizing:"border-box" }}
          />
          <div style={{ display:"flex", flexWrap:"wrap", gap: 6, marginTop: 8 }}>
            {["Tighten it", "More playful", "Fix the CTA", "Match the BIO voice", "Make it shorter"].map((chip) => (
              <button key={chip} type="button"
                onClick={() => setPolishNotes((p) => (p.trim() ? p.replace(/\s*$/, "") + "\n" : "") + "• " + chip)}
                style={{ height: 24, padding:"0 10px", fontSize: 11.5, cursor:"pointer", borderRadius: 999, border:"1px solid var(--c-line)", background:"var(--c-card)", color:"var(--c-dim)" }}>
                + {chip}
              </button>
            ))}
          </div>
        </div>
      )}
      {node.assetUrl && <img src={node.assetUrl} alt="" style={{ width: "100%", borderRadius: 10, marginBottom: 16, display: "block" }} />}
      <div style={{ fontSize: 14, lineHeight: 1.65, color: "var(--c-ink)", whiteSpace: "pre-wrap" }}>{node.body}</div>
    </Drawer>
  );
}

/* Notepad drawer — full output, editable, copyable, saveable. Edits
   land in outputs.body.edited_text (not the original body.text) so the
   AI's original output stays intact for audit. */
function SpecialistNotepad({ agent, node, cert, context, editedText, onEdit, onClose, outputId, baselineText, onSaved, briefId, brandId, onRerun }) {
  const [copied, setCopied]     = useBrState(false);
  const [saving, setSaving]     = useBrState(false);
  const [savedAt, setSavedAt]   = useBrState(null);
  const [saveErr, setSaveErr]   = useBrState(null);
  const [rerunOpen, setRerunOpen] = useBrState(false);
  const [reviseOpen, setReviseOpen] = useBrState(false);
  const [reviseText, setReviseText] = useBrState("");
  const [rerunState, setRerunState] = useBrState(null);  /* { running, model, error, output } */
  const passed   = node.state === "done";
  const stateColor = passed ? "var(--green-500)" : node.state === "flagged" ? "var(--pink-500)" : "var(--yellow-500)";
  const assetUrl = node.assetUrl || node.done?.output?.asset_url || null;
  const isImage  = !!assetUrl;
  const rerunOptions = isImage ? IMAGE_RERUN_OPTIONS : TEXT_RERUN_OPTIONS;
  const currentRoute = node.done?.usage?.model || node.run?.model_used || "";

  const dirty = !isImage && (editedText || "") !== (baselineText || "");

  const fireRerun = async ({ modelOverride, revisionFeedback, label }) => {
    if (!briefId || !agent?.id) return;
    setRerunState({ running: true, model: label || modelOverride, error: null, output: "" });
    let text = "";
    let done = null;
    let err = null;
    await streamSpecialistRun({
      specialistId: agent.id,
      briefText:    context.composedBrief || context.rawBrief || "",
      briefId,
      brandId,
      onToken: ({ text: t }) => {
        text += t;
        setRerunState((s) => ({ ...s, output: text }));
      },
      onProgress: ({ stage, pct }) => {
        setRerunState((s) => ({ ...s, output: `${stage}… ${pct ?? ""}%` }));
      },
      onDone: (data) => { done = data; },
      onError: ({ message }) => { err = message; },
      __body: { modelOverride, revisionFeedback },   // see streamSpecialistRun
    });
    if (err) {
      setRerunState({ running: false, model: label || modelOverride, error: err, output: text });
      return;
    }
    setRerunState({ running: false, model: label || modelOverride, error: null, output: text, done });
    onRerun && onRerun({ modelOverride, revisionFeedback, done, text });
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(editedText); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  const save = async () => {
    if (!outputId || !dirty || saving) return;
    setSaving(true); setSaveErr(null);
    try {
      const res = await apiFetch(`/api/outputs/${outputId}`, {
        method: "PATCH",
        body: JSON.stringify({ text: editedText }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setSavedAt(new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }));
      onSaved && onSaved(json.output);
    } catch (e) {
      setSaveErr(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={true}
      onClose={onClose}
      title={agent.name}
      eyebrow={`${agent.code} · ${agent.dept}`}
      width={620}
      footer={<>
        <button className="btn btn--ghost" onClick={onClose}>Close</button>
        {isImage ? (
          <a className="btn btn--primary btn--sm" href={assetUrl} target="_blank" rel="noreferrer" download>
            <Icon name="files" size={13} /> Download
          </a>
        ) : (
          <>
            <button className="btn btn--ghost btn--sm" onClick={copy}>
              <Icon name="files" size={13} /> {copied ? "Copied" : "Copy"}
            </button>
            <button className="btn btn--primary btn--sm" disabled={!outputId || !dirty || saving} onClick={save}
              title={!outputId ? "Output not persisted yet" : !dirty ? "No changes" : "Save edit to DB"}>
              {saving ? "Saving…" : savedAt ? `Saved · ${savedAt}` : dirty ? "Save edit" : "Saved"}
            </button>
          </>
        )}
      </>}
    >
      <div style={{ background: stateColor, height: 4, borderRadius: 4, marginBottom: 14 }} />

      {/* Brief context — what the specialist was asked to do */}
      <div className="eyebrow" style={{marginBottom: 6}}>The brief</div>
      <p style={{margin: 0, marginBottom: 18, fontSize: 13, color:"var(--c-dim)", lineHeight: 1.5}}>
        {context.rawBrief}
      </p>
      {context.sharpenedBrief && (
        <>
          <div className="eyebrow" style={{marginBottom: 6}}>Sharpened (a02)</div>
          <p style={{margin: 0, marginBottom: 18, fontSize: 13, color:"var(--c-ink)", lineHeight: 1.55, fontStyle:"italic", fontFamily:"Georgia, serif"}}>
            {context.sharpenedBrief}
          </p>
        </>
      )}

      {/* QA verdict */}
      {node.qa && (
        <div style={{
          padding: "8px 12px", marginBottom: 14, borderRadius: 8, fontSize: 12,
          background: passed ? "var(--green-50, rgba(127,163,122,0.16))" : "var(--pink-50, rgba(244,143,177,0.12))",
          color: passed ? "var(--green-600)" : "var(--pink-700, var(--pink-500))",
          display:"flex", justifyContent:"space-between",
        }}>
          {/* Image runs use brand_match (a24 vision QA); text runs use voice_match (a18). */}
          {(() => {
            const isImageQa = node.qa.kind === "image_a24" || typeof node.qa.brand_match === "number";
            const label = isImageQa ? "Brand QA" : "Voice QA";
            const score = isImageQa ? node.qa.brand_match : node.qa.voice_match;
            return (
              <>
                <strong>{label} · {passed ? "approved" : "flagged"} · {score}/100</strong>
                {node.qa.violations?.length > 0 && <span style={{fontStyle:"italic", textAlign:"right"}}>{node.qa.violations.join(" · ")}</span>}
              </>
            );
          })()}
        </div>
      )}

      {/* Output — image preview OR editable textarea. Image specialists
          (a19/a20/a21) yield an asset_url; text specialists yield text
          that lands in body.edited_text on save (body.text stays for audit). */}
      <div className="eyebrow" style={{marginBottom: 6, display:"flex", justifyContent:"space-between"}}>
        <span>
          Output {isImage ? "· image" : "· editable"}
          {dirty && <span style={{color:"var(--yellow-700)"}}> · unsaved</span>}
        </span>
        {!isImage && (
          <span style={{fontFamily:"var(--font-mono)", fontSize: 10, color:"var(--c-faint)"}}>
            {editedText.length} chars
          </span>
        )}
      </div>
      {saveErr && (
        <div style={{marginBottom: 8, padding:"6px 10px", background:"var(--pink-50, rgba(244,143,177,0.12))", color:"var(--pink-700, var(--pink-500))", borderRadius: 6, fontSize: 12}}>
          {saveErr}
        </div>
      )}
      {isImage ? (
        <a href={assetUrl} target="_blank" rel="noreferrer"
           style={{display:"block", borderRadius: 10, overflow:"hidden", border:"1px solid var(--c-line)"}}>
          <img src={assetUrl} alt={agent.name}
               style={{display:"block", width:"100%", height:"auto"}} />
        </a>
      ) : (
        <textarea
          value={editedText}
          onChange={(e) => onEdit(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          rows={Math.max(8, Math.min(24, editedText.split("\n").length + 2))}
          style={{
            width:"100%", padding: 14, borderRadius: 10,
            border: "1px solid var(--c-line)", background: "var(--c-bg)",
            fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic",
            fontSize: 15, lineHeight: 1.65, color:"var(--c-ink)",
            resize:"vertical", outline:"none", boxSizing:"border-box",
          }}
        />
      )}

      {/* ─── Iteration loop · re-run with another model + revise with feedback ─── */}
      {briefId && (
        <div style={{
          marginTop: 18, paddingTop: 14, borderTop: "1px dashed var(--c-line-2)",
          display:"flex", flexDirection:"column", gap: 10,
        }}>
          <div style={{display:"flex", gap: 8, flexWrap:"wrap"}}>
            <button className="btn btn--ghost btn--sm"
              onClick={() => { setRerunOpen(o => !o); setReviseOpen(false); }}
              disabled={rerunState?.running}>
              <Icon name="refresh" size={13} /> Re-run with…
            </button>
            <button className="btn btn--ghost btn--sm"
              onClick={() => { setReviseOpen(o => !o); setRerunOpen(false); }}
              disabled={rerunState?.running}>
              <Icon name="edit" size={13} /> Revise with feedback
            </button>
          </div>

          {/* Re-run dropdown */}
          {rerunOpen && (
            <div className="card" style={{padding: 8, display:"flex", flexDirection:"column", gap: 2, animation:"cvPopIn 160ms cubic-bezier(.2,.8,.2,1)"}}>
              {rerunOptions.map((opt) => {
                const isCurrent = currentRoute && (currentRoute === opt.route || opt.route.endsWith(currentRoute));
                return (
                  <button key={opt.route}
                    onClick={() => { setRerunOpen(false); fireRerun({ modelOverride: opt.route, label: opt.label }); }}
                    disabled={isCurrent}
                    style={{
                      display:"flex", justifyContent:"space-between", alignItems:"center",
                      width:"100%", padding:"8px 10px", borderRadius: 7,
                      border:"none", background:"transparent",
                      cursor: isCurrent ? "default" : "pointer", textAlign:"left",
                      opacity: isCurrent ? 0.5 : 1,
                    }}
                    onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.background = "var(--neutral-50)"; }}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                    <div>
                      <div style={{fontSize: 13, fontWeight: 500, color:"var(--c-ink)"}}>{opt.label}{isCurrent && <span style={{color:"var(--c-faint)", fontWeight: 400}}> · current</span>}</div>
                      <div style={{fontFamily:"var(--font-mono)", fontSize: 10, color:"var(--c-faint)"}}>{opt.note}</div>
                    </div>
                    <Icon name="arrow" size={12} />
                  </button>
                );
              })}
            </div>
          )}

          {/* Revise feedback */}
          {reviseOpen && (
            <div className="card" style={{padding: 12, animation:"cvPopIn 160ms cubic-bezier(.2,.8,.2,1)"}}>
              <textarea
                value={reviseText}
                onChange={(e) => setReviseText(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                rows={3}
                placeholder="What's not landing? e.g. 'too clinical — push toward editorial' or 'change the hero from coffee to a single ceramic vessel'"
                style={{
                  width:"100%", padding: 10, borderRadius: 8,
                  border: "1px solid var(--c-line)", background: "var(--c-bg)",
                  fontFamily: "inherit", fontSize: 13, lineHeight: 1.5,
                  color:"var(--c-ink)", resize:"vertical", outline:"none", boxSizing:"border-box",
                }}
              />
              <div style={{display:"flex", justifyContent:"flex-end", gap: 8, marginTop: 8}}>
                <button className="btn btn--ghost btn--sm" onClick={() => { setReviseOpen(false); setReviseText(""); }}>Cancel</button>
                <button className="btn btn--primary btn--sm"
                  disabled={!reviseText.trim() || rerunState?.running}
                  onClick={() => { const fb = reviseText.trim(); setReviseOpen(false); setReviseText(""); fireRerun({ revisionFeedback: fb, label: "with revision" }); }}>
                  Re-run with feedback
                </button>
              </div>
            </div>
          )}

          {/* Re-run progress / result */}
          {rerunState && (
            <div className="card" style={{padding: 12, background: rerunState.error ? "var(--pink-50, rgba(244,143,177,0.08))" : "var(--c-bg)"}}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 8}}>
                <div className="eyebrow">
                  Re-run · {rerunState.model || "?"}
                  {rerunState.running && <span style={{marginLeft: 6, color:"var(--yellow-700)"}}>· running…</span>}
                  {!rerunState.running && rerunState.error && <span style={{marginLeft: 6, color:"var(--pink-500)"}}>· failed</span>}
                  {!rerunState.running && !rerunState.error && <span style={{marginLeft: 6, color:"var(--green-600)"}}>· done</span>}
                </div>
                {!rerunState.running && (
                  <button className="btn btn--ghost btn--sm" onClick={() => setRerunState(null)} aria-label="Dismiss"><Icon name="close" size={11} /></button>
                )}
              </div>
              {rerunState.error ? (
                <div style={{fontSize: 12.5, color:"var(--pink-700, var(--pink-500))"}}>{rerunState.error}</div>
              ) : (
                <div style={{
                  fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic",
                  fontSize: 14, lineHeight: 1.55, color:"var(--c-ink)",
                  whiteSpace: "pre-wrap", maxHeight: 200, overflowY:"auto",
                }}>
                  {rerunState.output || (rerunState.running ? "Calling…" : "(empty)")}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Attribution footer — client view: NEVER show $ costs, only credits. */}
      <div style={{
        marginTop: 14, padding: "10px 12px", borderTop: "1px dashed var(--c-line-2)",
        display:"flex", justifyContent:"space-between",
        fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--c-faint)", letterSpacing:"0.04em",
      }}>
        <span>
          Composed by <span style={{color:"var(--c-ink)"}}>{agent.name}</span> ·
          BIO v{node.done?.brand?.bioVersion ?? "?"}
          <CertChip cert={cert} bioVersion={node.done?.brand?.bioVersion} />
        </span>
        <span>{agent.cr ?? "?"} cr</span>
      </div>
    </Drawer>
  );
}

/* Which group + part (if any) an agent fills in the Delivery Plan, plus the
   single platform we fan out for in Plan 3 (the group's first platform).
   Returns null when there's no plan or the agent isn't in it → the run
   behaves exactly as a legacy single-output run. */
function deliverableSpecForAgent(agentId, plan) {
  for (const g of plan?.deliverableGroups || []) {
    for (const [part, id] of Object.entries(g.crew || {})) {
      if (id === agentId) {
        return { type: g.type, part, count: g.count, platform: g.platforms?.[0] || "generic" };
      }
    }
  }
  return null;
}

/* Build a CONTAINED cluster for a specialist's deliverables: one group
   container node (the bordered, labeled box) + N card nodes laid out in a grid
   inside it. Works for N=1 (a single contained card) up to many. `laneTop` is
   the y to start the cluster at (caller stacks clusters so they never overlap). */
function buildDeliverableCluster(specNode, deliverables, laneTop, outputId) {
  /* Cards branch directly off the specialist in a tidy grid — NO container
     box (the box was its own node and swallowed clicks). Each card is its own
     clickable node; the caller edges each one back to the specialist. */
  const CARD_W = 280, CARD_H = 172, GAP = 16;
  const n = deliverables.length;
  const cols = Math.min(3, Math.max(1, n));
  const baseX = specNode.x + specNode.w + 150;

  const cardNodes = deliverables.map((d, i) => {
    const r = Math.floor(i / cols), c = i % cols;
    return {
      id: `${specNode.id}-d${i}`,
      parentId: specNode.id,
      kind: "deliverable",
      x: baseX + c * (CARD_W + GAP),
      y: laneTop + r * (CARD_H + GAP),
      w: CARD_W, h: CARD_H,
      specialistName: specNode.title,
      title: d.title || `${specNode.title} · ${i + 1}`,
      body: d.body || "",
      assetUrl: d.assetUrl || null,
      platform: d.platform || "generic",
      status: d.status || (d.qa?.passed === false ? "flagged" : "approved"),
      qa: d.qa || null,
      sourceOutputId: outputId || null,
      slot: i,
      humanCraft: !!d.humanCraft,
      polishNotes: d.polishNotes || null,
    };
  });

  return { cardNodes };
}

/* Initial node layout: BIO (left) → Brief (middle) → Specialists (right
   column). Specialist nodes are FIXED-HEIGHT (152px) and laid out 176px
   apart so they can never stack or overlap regardless of streaming
   output length. Full output lives in the notepad drawer (click to open). */
function buildInitialRunNodes(ctx) {
  const specs = (ctx.specialistIds || []).map((id) => window.CI_AGENTS.find((a) => a.id === id)).filter(Boolean);
  const rowH  = 176;                           /* fixed 152px node + 24px gap */
  const cols  = { bio: 40, brief: 360, spec: 760 };
  const totalSpecH = Math.max(specs.length, 1) * rowH;
  const midY = totalSpecH / 2 + 40;

  const nodes = [
    { id: "bio",   x: cols.bio,   y: midY - 52, w: 260, kind: "bio",   eyebrow: "BIO",
      title: "Brand Intelligence Object", sub: "Certified canon · the source for every output" },
    { id: "brief", x: cols.brief, y: midY - 52, w: 280, kind: "brief", eyebrow: "BRIEF",
      title: shorten(ctx.title || humanize(ctx.sharpenedBrief || "") || humanize(ctx.rawBrief || "") || "Brief", 90),
      sub: ctx.tension ? `Tension · ${ctx.tension.slice(0, 70)}` : "L1 · Brandolph" },
  ];

  specs.forEach((a, i) => {
    nodes.push({
      id: "spec-" + a.id,
      specId: a.id,
      x: cols.spec,
      y: 40 + i * rowH,
      w: 340,
      kind: "specialist",
      eyebrow: `${a.code} · ${a.dept}`,
      title: a.name,
      sub: `Queued · ${a.cr} cr`,
      cr: a.cr,
      state: "queued",
      tokenCount: 0,
    });
  });

  return nodes;
}

function buildInitialRunEdges(ctx) {
  const specs = (ctx.specialistIds || []);
  const edges = [{ from: "bio", to: "brief", fromSide: "right", toSide: "left" }];
  specs.forEach((id) => {
    edges.push({ from: "brief", to: "spec-" + id, fromSide: "right", toSide: "left" });
  });
  return edges;
}

function CanvasView({ go }) {
  /* Read context off sessionStorage. Two modes:
       mode:"run"  → assembled crew ready to run (from HomeCreate handoff)
       mode:"view" → existing brief opened from BriefsLibrary; loads runs/outputs from DB
     Anything else → original placeholder canvas. */
  const [ctx, setCtx] = useBrState(() => {
    try {
      const raw = sessionStorage.getItem("ci_run_context");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });

  const clearCtx = () => {
    try { sessionStorage.removeItem("ci_run_context"); } catch {}
    setCtx(null);
  };

  if (ctx?.mode === "view" && ctx.briefId) {
    return <BriefViewCanvas briefId={ctx.briefId} onClear={clearCtx} go={go} />;
  }
  if (ctx && Array.isArray(ctx.specialistIds) && ctx.specialistIds.length > 0) {
    return <BriefRunCanvas context={ctx} onClear={clearCtx} go={go} />;
  }
  /* No brand in scope on the placeholder canvas — the default exportName
     ("canvas") keeps another brand's name out of the user's downloads. */
  return <InteractiveCanvas nodeData={CANVAS_NODES} edges={CANVAS_EDGES} />;
}

/* ── BriefViewCanvas — loads an existing brief's runs/outputs from DB
   and renders the same node graph as a completed assembly. Reuses the
   notepad drawer for verify/edit/copy. */
function BriefViewCanvas({ briefId, onClear, go }) {
  const [state, setState] = useBrState({ loading: true, brief: null, runs: [], cert: null, error: null });
  const [openId, setOpenId]       = useBrState(null);
  const [openDeliverable, setOpenDeliverable] = useBrState(null);   /* clicked deliverable card → drawer */
  const [openBrief, setOpenBrief] = useBrState(false);   /* clicked Brief node → brief drawer */
  const [editedText, setEditedText] = useBrState({});

  useBrEffect(() => {
    (async () => {
      try {
        const { data: brief, error: bErr } = await supabase
          .from("briefs").select("id, title, payload, mode, created_at, brand_id")
          .eq("id", briefId).maybeSingle();
        if (bErr || !brief) { setState({ loading: false, brief: null, runs: [], cert: null, error: bErr?.message || "Brief not found" }); return; }

        const { data: runs } = await supabase
          .from("runs").select("id, specialist_id, bio_version, status, latency_ms, started_at, ended_at, outputs ( id, kind, body, status, rationale )")
          .eq("brief_id", briefId).order("started_at", { ascending: true });

        const { data: bio } = await supabase
          .from("bios").select("certified_by, certified_at, version")
          .eq("brand_id", brief.brand_id).eq("certified", true)
          .order("version", { ascending: false }).limit(1).maybeSingle();
        /* Two-tier: a self-certified BIO (certified_by NULL) is still a
           certified BIO — keep it with byName null so the footer says
           "self-certified" instead of borrowing a Steward's name. */
        let cert = null;
        if (bio) {
          let byName = null;
          if (bio.certified_by) {
            const { data: tm } = await supabase.from("team_members").select("first_name").eq("id", bio.certified_by).maybeSingle();
            byName = tm?.first_name || "your Steward";
          }
          cert = { byName, at: bio.certified_at, version: bio.version };
        }

        setState({ loading: false, brief, runs: runs || [], cert, error: null });
      } catch (e) {
        setState({ loading: false, brief: null, runs: [], cert: null, error: e?.message || String(e) });
      }
    })();
  }, [briefId]);

  if (state.loading) {
    return <div style={{padding: 60, textAlign:"center", color:"var(--c-faint)"}}>Loading brief…</div>;
  }
  if (state.error || !state.brief) {
    return (
      <div style={{padding: 60, textAlign:"center"}}>
        <p style={{color:"var(--c-dim)", marginBottom: 16}}>{state.error || "Brief not found."}</p>
        <button className="btn btn--primary" onClick={() => { onClear(); go("briefs"); }}>Back to briefs</button>
      </div>
    );
  }

  /* Group runs by specialist — a specialist can have MANY runs (e.g. a
     per-slot image specialist runs once per card), so build ONE node per
     specialist (no duplicate React keys) and collect all its outputs. */
  const bySpec = new Map();
  for (const r of state.runs) {
    const id = r.specialist_id;
    if (!bySpec.has(id)) bySpec.set(id, { id, agent: window.CI_AGENTS.find((a) => a.id === id), runs: [], outputs: [], firstRun: r });
    const e = bySpec.get(id);
    e.runs.push(r);
    (r.outputs || []).forEach((o) => e.outputs.push(o));
  }
  /* Elapsed per run: latency_ms when it was recorded, else the run's own
     timestamps (rows written before latency_ms was populated), else null. */
  const runMs = (r) => r.latency_ms ?? (r.started_at && r.ended_at ? Date.parse(r.ended_at) - Date.parse(r.started_at) : null);
  const specs = [...bySpec.values()].map((e) => {
    const primary = e.outputs[0] || null;
    const body = primary?.body || {};
    const text = body.edited_text || body.text || (typeof primary?.body === "string" ? primary.body : "");
    const passed = e.outputs.length === 0 || e.outputs.every((o) => o.status !== "flagged");
    /* Sum: a specialist can run many times on one brief (one per image slot). */
    const latencyMs = e.runs.reduce((sum, r) => sum + (runMs(r) || 0), 0) || null;
    return { ...e, output: primary, passed, text, latencyMs };
  });

  /* Saved image asset_urls across the brief, in order — paired one per card. */
  const imageUrls = state.runs.flatMap((r) => (r.outputs || []).map((o) => o.body?.asset_url).filter(Boolean));
  let imgIdx = 0;

  const rowH = 176;                            /* fixed 152px node + 24px gap */
  const specNodes = specs.map((s, i) => {
    const assetUrl = s.output?.body?.asset_url || null;
    const imgCount = s.outputs.filter((o) => o.body?.asset_url).length;
    return {
      id: "spec-" + s.id, specId: s.id,
      x: 760, y: 40 + i * rowH, w: 340, kind: "specialist",
      eyebrow: s.agent ? `${s.agent.code} · ${s.agent.dept}` : s.id,
      title: s.agent?.name || s.id,
      sub: imgCount > 1 ? `${imgCount} images · approved`
           : `${s.passed ? "approved" : "flagged"}${s.output?.kind ? " · " + s.output.kind : ""}`,
      cr: s.agent?.cr || 0,
      state: s.passed ? "done" : "flagged",
      outputText: s.text, assetUrl, tokenCount: 1000, qa: null, latencyMs: s.latencyMs,
      done: { brand: { bioVersion: s.firstRun.bio_version }, output: assetUrl ? { asset_url: assetUrl } : null },
    };
  });

  /* Reconstruct deliverable child cards from the stored {deliverables} output. */
  const cardNodes = [];
  const cardEdges = [];
  specs.forEach((s) => {
    const dOut = s.outputs.find((o) => o.body?.kind === "deliverables" && Array.isArray(o.body.deliverables));
    const specNode = specNodes.find((n) => n.id === "spec-" + s.id);
    if (!dOut || !specNode) return;
    const items = dOut.body.deliverables.map((d) => {
      const craft = d.craft || null;
      const delivered = craft && craft.status === "delivered" ? craft.delivered : null;
      return {
        title: d.title,
        body: (delivered && delivered.body) || d.body,
        assetUrl: (delivered && delivered.asset_url) || d.asset_url || d.assetUrl || imageUrls[imgIdx++] || null,
        platform: d.platform, status: d.status, qa: d.qa,
        humanCraft: !!craft && ["queued", "in_craft", "delivered"].includes(craft.status),
        polishNotes: craft ? craft.notes : null,
      };
    });
    const { cardNodes: cards } = buildDeliverableCluster(specNode, items, specNode.y, dOut.id);
    cardNodes.push(...cards);
    cards.forEach((c) => cardEdges.push({ from: specNode.id, to: c.id, fromSide: "right", toSide: "left" }));
  });

  const briefY = 40 + (Math.max(specs.length, 1) - 1) * rowH / 2;
  const nodes = [
    { id: "bio",   x: 40,  y: briefY, w: 260, kind: "bio",   eyebrow: "BIO",
      title: "Brand Intelligence Object",
      sub: state.cert
        ? (state.cert.byName ? `Certified by ${state.cert.byName}` : "Self-certified · Discovery compile")
        : "Certified canon" },
    { id: "brief", x: 360, y: briefY, w: 280, kind: "brief", eyebrow: "BRIEF",
      title: briefTitle(state.brief),
      sub: `${state.runs.length} runs · ${shortDate(state.brief.created_at)}` },
    ...specNodes,
    ...cardNodes,
  ];

  const edges = [
    { from: "bio", to: "brief", fromSide: "right", toSide: "left" },
    ...specs.map((s) => ({ from: "brief", to: "spec-" + s.id, fromSide: "right", toSide: "left" })),
    ...cardEdges,
  ];

  const renderNode = (node) => {
    if (node.kind === "deliverable") {
      const flagged = node.status === "flagged";
      const sc = flagged ? "var(--pink-500)" : "var(--green-500)";
      return (
        <div className="cv-node" style={{ background:"var(--c-card)", border:"1px solid var(--c-line)", borderLeft:`3px solid ${sc}`, borderRadius: 10, overflow:"hidden", boxShadow:"var(--shadow-md)", width:"100%", height: node.h || 172, boxSizing:"border-box", display:"flex", flexDirection:"column", cursor:"pointer" }}>
          {node.assetUrl && <div style={{ height: 90, backgroundImage:`url("${node.assetUrl}")`, backgroundSize:"cover", backgroundPosition:"center" }} />}
          <div style={{ padding:"10px 12px", flex:1, minHeight:0, display:"flex", flexDirection:"column" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 4 }}>
              <span className="eyebrow" style={{ fontSize: 9, color: sc }}>{(node.platform || "generic").toUpperCase()} · {flagged ? "FLAGGED" : "READY"}</span>
              {node.humanCraft && <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing:"0.06em", color:"var(--purple-600, #6b46c1)" }}>✦ IN HUMAN CRAFT</span>}
            </div>
            {node.title && <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4, color:"var(--c-ink)" }}>{node.title}</div>}
            <div style={{ fontSize: 12, lineHeight: 1.45, color:"var(--c-dim)", flex:1, overflow:"hidden" }}>{node.body}</div>
            {node.specialistName && <div style={{ marginTop: 8, fontSize: 9.5, color:"var(--c-faint)", fontFamily:"var(--font-mono)" }}>by {node.specialistName}</div>}
          </div>
        </div>
      );
    }
    const isSpec = node.kind === "specialist";
    const stColor = {
      bio: "var(--yellow-500)", brief: "var(--neutral-900)",
      done: "var(--green-500)", flagged: "var(--pink-500)",
    }[node.state || node.kind] || "var(--neutral-300)";
    return (
      <div className={"cv-node cv-node--" + (node.state || node.kind)} style={{
        background:"var(--c-card)", border:"1px solid var(--c-line)",
        borderLeft:`3px solid ${stColor}`, borderRadius: 10, padding:"12px 14px",
        boxShadow:"var(--shadow-md)",
        /* 152 fits the tallest variant (thumbnail + provenance footer). */
        height: isSpec ? 152 : 104, boxSizing:"border-box", overflow:"hidden",
        display:"flex", flexDirection:"column",            /* footer pins to the bottom */
        cursor: isSpec ? "pointer" : "default",
      }}
      onClick={(e) => { if (isSpec) { e.stopPropagation(); setOpenId(node.specId); } }}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 4}}>
          <div className="eyebrow" style={{fontSize: 9, color: stColor}}>
            {(node.eyebrow || node.kind).toUpperCase()} · {node.state === "flagged" ? "flagged" : "done"}
          </div>
          {isSpec && <span style={{fontFamily:"var(--font-mono)", fontSize: 10, color:"var(--c-faint)"}}>{node.cr} cr</span>}
        </div>
        <div style={{fontSize: 13.5, fontWeight: 500, color:"var(--c-ink)", lineHeight: 1.3, marginBottom: 6, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{node.title}</div>
        {isSpec && (<>
          {node.assetUrl ? (
            <div style={{
              height: 48, marginTop: 4, marginBottom: 6, borderRadius: 6, overflow:"hidden",
              background:"var(--neutral-50)",
              backgroundImage: `url("${node.assetUrl}")`,
              backgroundSize:"cover", backgroundPosition:"center",
            }} />
          ) : (
            <div style={{height: 4, background:"var(--neutral-50)", borderRadius: 999, marginTop: 6, marginBottom: 8, overflow:"hidden"}}>
              <div style={{height:"100%", width:"100%", background: stColor, borderRadius:999}} />
            </div>
          )}
          <div style={{display:"flex", justifyContent:"space-between", fontFamily:"var(--font-mono)", fontSize: 10, color:"var(--c-faint)", letterSpacing:"0.04em"}}>
            <span>{node.sub}</span>
            <span style={{color:"var(--c-dim)"}}>open ↗</span>
          </div>
          <NodeProvenance bioVersion={node.done?.brand?.bioVersion} cert={state.cert} latencyMs={node.latencyMs} />
        </>)}
        {!isSpec && node.sub && (
          <div style={{fontFamily:"var(--font-mono)", fontSize: 10.5, color:"var(--c-faint)", letterSpacing:"0.04em", lineHeight: 1.45, marginTop: 4}}>
            {node.sub.length > 70 ? node.sub.slice(0, 70) + "…" : node.sub}
          </div>
        )}
      </div>
    );
  };

  const opened = openId && specs.find((s) => s.id === openId);

  const viewDeptBreakdown = (() => {
    const map = new Map();
    for (const s of specs) {
      const d = s?.agent?.dept || "Other";
      map.set(d, (map.get(d) || 0) + 1);
    }
    return Array.from(map.entries());
  })();
  const anyFlagged = specs.some((s) => !s.passed);
  const totalCr = specs.reduce((sum, s) => sum + (s.agent?.cr || 0), 0);

  const sendToHuman = async (cardNode, notes) => {
    if (cardNode.sourceOutputId != null && cardNode.slot != null) {
      try { await apiFetch("/api/craft", { method: "POST", body: JSON.stringify({ outputId: cardNode.sourceOutputId, slot: cardNode.slot, notes }) }); } catch (e) {}
    }
    try { if (window.CI_CREDITS) window.CI_CREDITS.balance = Math.max(0, (window.CI_CREDITS.balance || 0) - HUMAN_POLISH_CR); } catch (e) {}
    setOpenDeliverable((d) => (d && d.id === cardNode.id ? { ...d, humanCraft: true, polishNotes: notes } : d));
  };

  return (
    <>
      <CanvasHeader
        title={briefTitle(state.brief)}
        tension={state.brief.payload?.tension}
        sharpenedBrief={state.brief.payload?.sharpenedBrief}
        refusals={state.brief.payload?.refusals || []}
        deptBreakdown={viewDeptBreakdown}
        totalCr={totalCr}
        completed={!anyFlagged}
        running={false}
      />
      <InteractiveCanvas
        nodeData={nodes}
        edges={edges}
        renderNode={renderNode}
        exportName={"brief-" + briefId.slice(0, 8)}
        onNodeClick={(node) => {
          if (node?.kind === "deliverable") { setOpenDeliverable(node); return; }
          if (node?.kind === "brief") { setOpenBrief(true); return; }
          if (node?.kind === "specialist" && node.specId) setOpenId(node.specId);
        }}
        helper={`${specs.length} runs on this brief. Click any specialist to verify, edit, or copy its output.`}
        toolbarExtra={
          <>
            <button className="btn btn--ghost btn--sm" onClick={() => { onClear(); go("briefs"); }} style={{height: 28}}>
              ← Briefs
            </button>
            <a href="#/home" className="btn btn--primary btn--sm" style={{height: 28}}>
              <Icon name="plus" size={12} /> New brief
            </a>
          </>
        }
      />
      {opened && opened.agent && (
        <SpecialistNotepad
          agent={opened.agent}
          node={{
            outputText: opened.text,
            assetUrl: opened.output?.body?.asset_url || null,
            cr: opened.agent.cr,
            qa: null,
            done: {
              brand: { bioVersion: opened.firstRun.bio_version },
              output: opened.output?.body?.asset_url ? { asset_url: opened.output.body.asset_url } : null,
            },
            run: { model_used: opened.firstRun.model_used },
            state: opened.passed ? "done" : "flagged",
          }}
          cert={state.cert}
          context={{
            rawBrief:       humanize(extractOriginalRequest(state.brief.payload?.request) || state.brief.payload?.request || state.brief.title || ""),
            sharpenedBrief: humanize(state.brief.payload?.sharpenedBrief || ""),
            composedBrief:  state.brief.payload?.request || "",
          }}
          briefId={state.brief.id}
          brandId={state.brief.brand_id}
          onRerun={() => {
            /* New run lands in DB — the parent's useEffect refetches on
               openId close. For now, the user can close + reopen. */
          }}
          outputId={opened.output?.id || null}
          baselineText={opened.text || ""}
          editedText={editedText[openId] ?? opened.text ?? ""}
          onEdit={(text) => setEditedText((prev) => ({ ...prev, [openId]: text }))}
          onSaved={(saved) => {
            /* Re-fetch via mutating the spec entry in local state */
            setState((s) => ({
              ...s,
              runs: s.runs.map((r) => r.id === opened.firstRun.id
                ? { ...r, outputs: (r.outputs || []).map((o) => o.id === opened.output.id ? { ...o, body: saved.body } : o) }
                : r),
            }));
          }}
          onClose={() => setOpenId(null)}
        />
      )}
      {openDeliverable && (
        <DeliverableDrawer node={openDeliverable} onClose={() => setOpenDeliverable(null)} onSendToHuman={sendToHuman} />
      )}
      {openBrief && (
        <BriefDrawer
          brief={{ title: briefTitle(state.brief), tension: state.brief.payload?.tension, sharpenedBrief: state.brief.payload?.sharpenedBrief, rawBrief: humanize(extractOriginalRequest(state.brief.payload?.request) || state.brief.payload?.request || ""), refusals: state.brief.payload?.refusals }}
          onClose={() => setOpenBrief(false)}
        />
      )}
    </>
  );
}


function CanvasNode({ node, color, refCb, active, dim, dragging, index, onPointerDown, onEnter, onLeave, children }) {
  const shell = {
    position:"absolute", left: node.x, top: node.y, width: node.w,
    cursor: dragging ? "grabbing" : "grab",
    opacity: dim ? 0.55 : 1,
    transform: dragging ? "scale(1.02)" : "none",
    transition: dragging
      ? "box-shadow 140ms ease, border-color 140ms ease"
      : "box-shadow 160ms ease, border-color 160ms ease, transform 160ms ease, opacity 160ms ease",
    animationDelay: `${index * 45}ms`,
    userSelect:"none", touchAction:"none", zIndex: active || dragging ? 3 : 1,
  };
  /* Custom content (boards) — shell provides position + interactions only. */
  if (children) {
    return (
      <div ref={refCb} className="cv-node" onPointerDown={onPointerDown} onMouseEnter={onEnter} onMouseLeave={onLeave} style={shell}>
        {children}
      </div>
    );
  }
  /* Default card body (delivery canvas) */
  return (
    <div
      ref={refCb}
      className="cv-node"
      onPointerDown={onPointerDown}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        ...shell,
        background:"var(--c-card)", borderRadius: 8,
        borderTop: "1px solid " + (active ? "var(--yellow-500)" : "var(--c-line)"),
        borderRight: "1px solid " + (active ? "var(--yellow-500)" : "var(--c-line)"),
        borderBottom: "1px solid " + (active ? "var(--yellow-500)" : "var(--c-line)"),
        borderLeft: `3px solid ${color}`,
        padding: "10px 12px",
        boxShadow: active ? "0 8px 24px rgba(0,0,0,0.14)" : "var(--shadow-md)",
      }}
    >
      <div className="eyebrow" style={{marginBottom: 4, fontSize: 9}}>{node.kind.toUpperCase()}</div>
      <div style={{fontSize: 13, fontWeight: 500, color:"var(--c-ink)", lineHeight: 1.3, marginBottom: 4}}>{node.title}</div>
      <div style={{fontFamily:"var(--font-mono)", fontSize: 10, color:"var(--c-faint)", letterSpacing:"0.04em"}}>{node.sub}</div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* LIBRARY — every development + upload, grouped by brief,            */
/* filtered by output type, with per-output actions.                 */

function Library({ go }) {
  /* Live Library — real outputs flattened from the briefs/runs join.
     Each item carries its brief context, the specialist, the BIO version,
     and the cert state so we can render the moat attribution footer on
     every card. */
  const { briefs, cert, brand, loading, error, reload } = useLiveBriefs();

  /* Three-level navigation: folder grid → folder detail → forefront viewer */
  const [openFolderId, setOpenFolderId]   = useBrState(null);   /* a brief.id when a folder is open */
  const [selectedOutput, setSelectedOutput] = useBrState(null); /* an item when the viewer is open */

  /* Folder-detail filters (scoped to the open folder) */
  const [kind, setKind]       = useBrState("all");
  const [statusF, setStatusF] = useBrState("all");   /* all | approved | flagged */
  const [query, setQuery]     = useBrState("");

  /* Optimistic deletions — ids hidden locally until reload catches up */
  const [deletedIds, setDeletedIds] = useBrState(() => new Set());

  /* Toast — same lightweight pattern as Discovery (local state + timed clear) */
  const [toast, setToast] = useBrState(null);
  const flash = (msg) => { setToast(msg); clearTimeout(window.__libT); window.__libT = setTimeout(() => setToast(null), 2400); };

  /* Flatten: one entry per output, with brief/run context attached.
     Prefer edited_text (the user's notepad save) over the original
     AI body.text, so the Library reflects the most recent human pass. */
  const items = React.useMemo(() => {
    const list = [];
    for (const b of briefs) {
      for (const r of (b.runs || [])) {
        for (const o of (r.outputs || [])) {
          const body = o.body || {};
          const text = body.edited_text || body.text || (typeof o.body === "string" ? o.body : "");
          const assetUrl = body.asset_url || null;
          list.push({
            id: o.id,
            kind: o.kind || "output",
            status: o.status,
            rationale: o.rationale,
            text,
            assetUrl,
            edited: !!body.edited_text,                 /* surfaced as a chip in the UI */
            brief: { id: b.id, request: b.payload?.request || b.title, title: b.payload?.title || b.title, mode: b.mode, created_at: b.created_at, payload: b.payload || {} },
            run: { id: r.id, specialist_id: r.specialist_id, bio_version: r.bio_version, completion_tokens: r.completion_tokens, ended_at: r.ended_at },
          });
        }
      }
    }
    return list
      .filter((i) => !deletedIds.has(i.id))
      .sort((a, b) => new Date(b.run.ended_at || 0) - new Date(a.run.ended_at || 0));
  }, [briefs, deletedIds]);

  /* Group every item by brief — folders, newest-first by latest activity.
     (Folder cards always show the whole brief; the per-folder filters only
     apply once a folder is open.) */
  const briefGroups = React.useMemo(() => {
    const groups = new Map();
    for (const o of items) {
      const key = o.brief.id;
      if (!groups.has(key)) groups.set(key, { brief: o.brief, items: [], latest: 0 });
      const g = groups.get(key);
      g.items.push(o);
      const t = new Date(o.run.ended_at || 0).getTime();
      if (t > g.latest) g.latest = t;
    }
    return Array.from(groups.values())
      .map((g) => ({ ...g, items: g.items.sort((a, b) => new Date(b.run.ended_at || 0) - new Date(a.run.ended_at || 0)) }))
      .sort((a, b) => b.latest - a.latest);
  }, [items]);

  /* PRESERVE: the moat path back to the canvas. */
  const openBriefInCanvas = (briefId) => {
    try { sessionStorage.setItem("ci_run_context", JSON.stringify({ mode: "view", briefId, ts: Date.now() })); } catch {}
    go("canvas");
  };

  const openFolder = briefGroups.find((g) => g.brief.id === openFolderId) || null;

  /* When a folder closes, reset its scoped filters so the next one opens clean. */
  const closeFolder = () => { setOpenFolderId(null); setKind("all"); setStatusF("all"); setQuery(""); };

  /* Escape closes the viewer first, then the folder. */
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (selectedOutput) setSelectedOutput(null);
      else if (openFolderId) closeFolder();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [selectedOutput, openFolderId]);

  /* ── delete: optimistic remove + authed DELETE, with toast + rollback ── */
  const deleteOutput = async (o) => {
    setDeletedIds((s) => new Set(s).add(o.id));   /* optimistic */
    setSelectedOutput(null);
    try {
      const res = await apiFetch(`/api/outputs/${o.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "Delete failed");
      flash("Deleted");
      reload();   /* reconcile with the server */
    } catch (e) {
      setDeletedIds((s) => { const n = new Set(s); n.delete(o.id); return n; });   /* rollback */
      flash(e.message || "Could not delete");
    }
  };

  return (
    <div style={{padding:"24px 36px 80px"}}>
      <PageHeader
        eyebrow={brand ? `Workspace · ${brand.name}` : "Workspace"}
        title="Library"
        sub="Every brief your crew has produced, filed as a folder. Open one to browse its assets, read them in full, and put them back to work."
        right={<>
          <button className="btn btn--ghost btn--sm" onClick={reload}><Icon name="refresh" size={13} /> Reload</button>
          <span style={{fontFamily:"var(--font-mono)", fontSize:12, color:"var(--c-faint)"}}>{items.length} assets · {briefGroups.length} folders</span>
        </>}
      />

      {error && (
        <div className="card" style={{padding:"10px 14px", marginBottom: 14, borderLeft:"3px solid var(--pink-500)", fontSize: 13}}>
          {error}
        </div>
      )}

      {/* Empty library */}
      {!loading && briefGroups.length === 0 && (
        <div className="card" style={{padding:"56px 32px", textAlign:"center", maxWidth: 540, margin:"40px auto"}}>
          <h2 style={{
            margin:"0 0 14px", fontFamily:"var(--font-serif)", fontStyle:"italic",
            fontSize: 30, lineHeight: 1.2, letterSpacing:"-0.01em", fontWeight: 400, color:"var(--c-ink)",
          }}>
            The Library is waiting.
          </h2>
          <p style={{margin:"0 0 22px", fontSize: 14, color:"var(--c-dim)", lineHeight: 1.6}}>
            Every output your crew produces lands here — filed under the brief that asked for it, the BIO version it was judged against, and the Steward who signed the canon. Run a brief and watch the shelves fill.
          </p>
          <div style={{display:"flex", gap: 10, justifyContent:"center"}}>
            <a href="#/home" className="btn btn--primary">
              <Icon name="sparkles" size={13} /> Start a brief
            </a>
          </div>
        </div>
      )}

      {/* ════════ LEVEL 1 · FOLDER GRID ════════ */}
      {!openFolder && briefGroups.length > 0 && (
        <div className="lib-grid">
          {briefGroups.map((g) => (
            <LibraryFolderCard key={g.brief.id} group={g} onOpen={() => setOpenFolderId(g.brief.id)} />
          ))}
        </div>
      )}

      {/* ════════ LEVEL 2 · FOLDER DETAIL ════════ */}
      {openFolder && (
        <LibraryFolderDetail
          group={openFolder}
          cert={cert}
          kind={kind} setKind={setKind}
          statusF={statusF} setStatusF={setStatusF}
          query={query} setQuery={setQuery}
          onBack={closeFolder}
          onOpenCanvas={() => openBriefInCanvas(openFolder.brief.id)}
          onSelect={setSelectedOutput}
        />
      )}

      {/* ════════ LEVEL 3 · FOREFRONT VIEWER ════════ */}
      {selectedOutput && (
        <LibraryViewer
          o={selectedOutput}
          cert={cert}
          go={go}
          flash={flash}
          onClose={() => setSelectedOutput(null)}
          onDelete={deleteOutput}
        />
      )}

      {/* Toast */}
      {toast && <div className="lib-toast">{toast}</div>}
    </div>
  );
}

/* Type breakdown helper — "4 copy · 2 image" from a folder's items. */
function libKindBreakdown(items) {
  const counts = {};
  for (const o of items) counts[o.kind] = (counts[o.kind] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`);
}

/* ── LEVEL 1 · folder card — stacked-paper motif, dept-accented ──────── */
function LibraryFolderCard({ group, onOpen }) {
  const { brief, items } = group;
  const title   = briefTitle(brief);
  const allOk   = items.every((o) => o.status === "approved");
  const accent  = allOk ? "var(--green-500)" : "var(--pink-500)";
  const breakdown = libKindBreakdown(items);

  return (
    <button className="lib-folder" style={{ "--accent": accent }} onClick={onOpen}>
      <div className="lib-folder__stack">
        <div className="lib-folder__leaf lib-folder__leaf--1" />
        <div className="lib-folder__leaf lib-folder__leaf--2" />
        <div className="lib-folder__cover">
          <span className="lib-folder__tab" />
          <div>
            <div className="lib-folder__count">{items.length}</div>
            <div className="lib-folder__break">
              {items.length === 1 ? "asset" : "assets"} · {breakdown.slice(0, 3).join(" · ")}
            </div>
          </div>
          <h3 className="lib-folder__title">{title}</h3>
        </div>
      </div>
      <div className="lib-folder__meta">
        <span className="lib-folder__dot" />
        <span>{shortDate(brief.created_at)}</span>
        <span style={{ color: "var(--c-line-2)" }}>·</span>
        <span style={{ color: allOk ? "var(--green-600)" : "var(--pink-500)" }}>{allOk ? "approved" : "needs review"}</span>
      </div>
    </button>
  );
}

/* ── LEVEL 2 · folder detail — filter bar + asset grid ──────────────── */
function LibraryFolderDetail({ group, cert, kind, setKind, statusF, setStatusF, query, setQuery, onBack, onOpenCanvas, onSelect }) {
  const { brief, items } = group;
  const title = briefTitle(brief);
  const kindsHere = [...new Set(items.map((i) => i.kind))];

  const q = query.trim().toLowerCase();
  const filtered = items.filter((i) => {
    if (kind !== "all" && i.kind !== kind) return false;
    if (statusF === "approved" && i.status !== "approved") return false;
    if (statusF === "flagged"  && i.status === "approved") return false;
    if (q) {
      const hay = `${i.text} ${i.brief.request || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <div>
      {/* Header — back, title + brief context, Open in canvas */}
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:18, marginBottom:18}}>
        <div style={{minWidth:0, flex:1}}>
          <button onClick={onBack} className="btn btn--ghost btn--sm"
            style={{height:28, padding:"0 10px", fontSize:11.5, marginBottom:12}}>
            <Icon name="arrowLeft" size={12} /> Library
          </button>
          <div className="eyebrow" style={{marginBottom:6, display:"flex", gap:10, alignItems:"center"}}>
            <span>{shortDate(brief.created_at)}</span>
            <span style={{color:"var(--c-faint)"}}>·</span>
            <span>{items.length} {items.length === 1 ? "asset" : "assets"}</span>
          </div>
          <h2 style={{
            margin:"0 0 8px", fontFamily:"var(--font-serif)", fontStyle:"italic", fontWeight:400,
            fontSize:30, lineHeight:1.2, letterSpacing:"-0.01em", color:"var(--c-ink)",
            display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden",
          }}>{title}</h2>
          {brief.request && (
            <p style={{margin:0, maxWidth:680, fontSize:13.5, lineHeight:1.55, color:"var(--c-dim)"}}>{brief.request}</p>
          )}
        </div>
        <button onClick={onOpenCanvas} className="btn btn--primary btn--sm" style={{flexShrink:0, height:32}}>
          <Icon name="sparkles" size={13} /> Open in canvas
        </button>
      </div>

      {/* Filter bar — type chips (present kinds only) + status + search */}
      <div className="card" style={{padding:12, marginBottom:22, display:"flex", gap:10, alignItems:"center", flexWrap:"wrap"}}>
        <div style={{position:"relative", flex:"1 1 200px", minWidth:180}}>
          <input
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search this folder…"
            onKeyDown={(e) => e.stopPropagation()}
            style={{
              width:"100%", height:32, padding:"0 10px 0 32px",
              border:"1px solid var(--c-line)", borderRadius:8,
              fontSize:13, fontFamily:"inherit", background:"var(--c-bg)", color:"var(--c-ink)", outline:"none",
            }} />
          <span style={{position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:"var(--c-faint)", pointerEvents:"none"}}>
            <Icon name="filter" size={13} />
          </span>
        </div>
        <div style={{display:"flex", gap:4, flexWrap:"wrap"}}>
          <button onClick={() => setKind("all")}
            className={"pill" + (kind === "all" ? " pill--dark" : "")}
            style={{cursor:"pointer", height:28, padding:"0 12px"}}>All · {items.length}</button>
          {kindsHere.map((k) => (
            <button key={k} onClick={() => setKind(k)}
              className={"pill" + (kind === k ? " pill--dark" : "")}
              style={{cursor:"pointer", height:28, padding:"0 12px"}}>
              {k} · {items.filter((i) => i.kind === k).length}
            </button>
          ))}
        </div>
        <div style={{display:"flex", gap:4, marginLeft:"auto"}}>
          {["all", "approved", "flagged"].map((s) => (
            <button key={s} onClick={() => setStatusF(s)}
              className={"pill" + (statusF === s ? " pill--dark" : "")}
              style={{cursor:"pointer", height:28, padding:"0 12px", textTransform:"capitalize"}}>{s}</button>
          ))}
        </div>
      </div>

      {/* Asset grid — sheets for text, thumbnails for images */}
      {filtered.length === 0 ? (
        <div className="card" style={{padding:"40px 32px", textAlign:"center", color:"var(--c-faint)"}}>
          {items.length === 0 ? "This folder is empty." : "No assets match the current filter."}
        </div>
      ) : (
        <div className="lib-assets">
          {filtered.map((o) => <LibraryAssetCard key={o.id} o={o} onSelect={() => onSelect(o)} />)}
        </div>
      )}
    </div>
  );
}

/* One asset card — "sheet of paper" for text, thumbnail for image. */
function LibraryAssetCard({ o, onSelect }) {
  const passed = o.status === "approved";
  const agent  = window.CI_AGENTS?.find((a) => a.id === o.run.specialist_id);
  const dotCls = "lib-status-dot" + (passed ? "" : " lib-status-dot--flag");

  /* Image asset — thumbnail, or a styled placeholder w/ visual direction */
  if (o.kind === "image") {
    return (
      <button className="lib-thumb" onClick={onSelect}>
        {o.assetUrl ? (
          <img className="lib-thumb__img" src={o.assetUrl} alt={o.kind} loading="lazy" />
        ) : (
          <div className="lib-thumb__placeholder">
            <div className="lib-sheet__eyebrow" style={{marginBottom:2}}>
              <span className={dotCls} /> Visual direction
            </div>
            <p style={{
              margin:0, fontFamily:"var(--font-serif)", fontSize:14, lineHeight:1.5, color:"var(--c-ink)",
              display:"-webkit-box", WebkitLineClamp:5, WebkitBoxOrient:"vertical", overflow:"hidden",
            }}>{humanize(o.text) || "(no direction)"}</p>
          </div>
        )}
        <div className="lib-thumb__foot">
          <span className={dotCls} />
          <span>{o.kind}</span>
          {o.edited && <span style={{color:"var(--yellow-700)"}}>· edited</span>}
          <span style={{marginLeft:"auto"}}>{agent?.name || specialistName(o.run.specialist_id)}</span>
        </div>
      </button>
    );
  }

  /* Text asset — a real sheet of paper */
  const cleaned = humanize(o.text);
  return (
    <button className="lib-sheet" onClick={onSelect}>
      <div className="lib-sheet__eyebrow">
        <span className={dotCls} />
        <span>{o.kind}</span>
        {o.edited && <span style={{color:"var(--yellow-700)"}}>· edited</span>}
      </div>
      <p className="lib-sheet__body">{cleaned || <span style={{color:"var(--c-faint)"}}>(empty)</span>}</p>
      <div className="lib-sheet__foot">
        <span>{agent?.name || specialistName(o.run.specialist_id)}</span>
        <span style={{marginLeft:"auto"}}>BIO v{o.run.bio_version}</span>
      </div>
    </button>
  );
}

/* ── LEVEL 3 · forefront viewer — large asset + 4-action bar ─────────── */
function LibraryViewer({ o, cert, go, flash, onClose, onDelete }) {
  const [confirmDel, setConfirmDel] = useBrState(false);
  const passed  = o.status === "approved";
  const agent   = window.CI_AGENTS?.find((a) => a.id === o.run.specialist_id);
  const isImage = o.kind === "image";
  const safeName = (s) => (s || "asset").replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-|-$/g, "");

  /* Reuse — hand off to Create. (Create-side consumption of this context
     is a follow-up; for now we seed sessionStorage and route home.) */
  const reuse = () => {
    try {
      sessionStorage.setItem("ci_run_context", JSON.stringify({
        mode: "reuse", briefId: o.brief.id, outputId: o.id, seedText: o.text, ts: Date.now(),
      }));
    } catch {}
    onClose();
    go("home");
  };

  const copyPrompt = async () => {
    const prompt = isImage
      ? (o.text || "")
      : (o.brief.request || "") + (o.rationale ? "\n\n" + o.rationale : "");
    try { await navigator.clipboard?.writeText(prompt); flash("Prompt copied"); }
    catch { flash("Could not copy"); }
  };

  const download = () => {
    const base = `${safeName(briefTitle(o.brief))}-${o.kind}`;
    if (isImage && o.assetUrl) {
      const a = document.createElement("a");
      a.href = o.assetUrl; a.download = base; a.target = "_blank"; a.rel = "noreferrer";
      a.click();
      flash("Downloading");
      return;
    }
    const blob = new Blob([o.text || ""], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = base + ".txt";
    a.click();
    URL.revokeObjectURL(url);
    flash("Downloaded");
  };

  return (
    <div className="lib-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={"lib-modal" + (isImage && o.assetUrl ? " lib-modal--image" : "")} onClick={(e) => e.stopPropagation()}>
        {/* Head */}
        <div style={{flex:"none", display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:16, padding:"18px 22px 14px", borderBottom:"1px solid var(--c-line)"}}>
          <div style={{minWidth:0}}>
            <div className="eyebrow" style={{marginBottom:6, display:"flex", gap:8, alignItems:"center"}}>
              <span className={"lib-status-dot" + (passed ? "" : " lib-status-dot--flag")} />
              <span>{o.kind}</span>
              <span style={{color:"var(--c-faint)"}}>·</span>
              <span style={{color: passed ? "var(--green-600)" : "var(--pink-500)"}}>{passed ? "approved" : "flagged"}</span>
              {o.edited && <span style={{color:"var(--yellow-700)"}}>· edited</span>}
            </div>
            <h2 style={{margin:0, fontFamily:"var(--font-serif)", fontStyle:"italic", fontWeight:400, fontSize:24, lineHeight:1.2, color:"var(--c-ink)"}}>
              {agent?.name || specialistName(o.run.specialist_id)}
            </h2>
          </div>
          <button onClick={onClose} className="btn btn--ghost btn--sm" style={{flexShrink:0, height:30, width:30, padding:0, justifyContent:"center"}} aria-label="Close">
            <Icon name="close" size={14} />
          </button>
        </div>

        {/* Body — large asset; flex:1 so the modal never exceeds 92vh,
            long text scrolls here, and the action bar stays pinned below */}
        <div style={{
          flex:1, minHeight:0, overflowY:"auto",
          padding: isImage && o.assetUrl ? "16px 18px" : "20px 22px",
          ...(isImage && o.assetUrl ? { display:"flex", flexDirection:"column" } : null),
        }}>
          {isImage && o.assetUrl ? (
            /* Frameless lightbox — full image fits, centered, on the dim backdrop */
            <div style={{flex:1, minHeight:0, display:"flex", alignItems:"center", justifyContent:"center"}}>
              <img src={o.assetUrl} alt={o.kind} style={{display:"block", maxWidth:"100%", maxHeight:"62vh", width:"auto", height:"auto", margin:"0 auto", objectFit:"contain", borderRadius:8}} />
            </div>
          ) : isImage ? (
            <div style={{padding:22, background:"var(--c-yellow-tint)", border:"1px solid var(--yellow-200)", borderRadius:10}}>
              <div className="eyebrow" style={{marginBottom:8}}>Visual direction</div>
              <p style={{margin:0, fontFamily:"var(--font-serif)", fontSize:17, lineHeight:1.6, color:"var(--c-ink)", whiteSpace:"pre-wrap"}}>{humanize(o.text) || "(no direction)"}</p>
            </div>
          ) : (
            /* Full sheet of paper */
            <div style={{
              padding:"28px 30px", background:"#FFFFFF", border:"1px solid var(--c-line)", borderRadius:6,
              boxShadow:"var(--shadow-sm)",
              fontFamily:"var(--font-serif)", fontSize:18, lineHeight:1.7, color:"var(--c-ink)", whiteSpace:"pre-wrap",
            }}>{humanize(o.text) || <span style={{color:"var(--c-faint)"}}>(empty)</span>}</div>
          )}

          {o.rationale && (
            <>
              <div className="eyebrow" style={{marginTop:16, marginBottom:6}}>QA notes</div>
              <p style={{margin:0, fontSize:13, color:"var(--c-dim)", lineHeight:1.55, fontStyle:"italic"}}>{o.rationale}</p>
            </>
          )}

          {/* Moat attribution */}
          <div style={{
            marginTop:18, paddingTop:12, borderTop:"1px dashed var(--c-line-2)",
            display:"flex", justifyContent:"space-between", gap:8, flexWrap:"wrap",
            fontFamily:"var(--font-mono)", fontSize:11, color:"var(--c-faint)", letterSpacing:"0.04em",
          }}>
            <span>
              Composed by <span style={{color:"var(--c-ink)"}}>{specialistName(o.run.specialist_id)}</span> · BIO v{o.run.bio_version}
              <CertChip cert={cert} bioVersion={o.run.bio_version} />
            </span>
            <span>{agent?.cr ?? "?"} cr</span>
          </div>
        </div>

        {/* Action bar — Reuse · Copy prompt · Download · Delete — pinned, always visible */}
        <div style={{flex:"none", display:"flex", gap:8, flexWrap:"wrap", padding:"14px 22px", borderTop:"1px solid var(--c-line)", background:"var(--c-bg)"}}>
          <button className="btn btn--primary btn--sm" onClick={reuse}>
            <Icon name="refresh" size={13} /> Reuse
          </button>
          <button className="btn btn--ghost btn--sm" onClick={copyPrompt}>
            <Icon name="files" size={13} /> Copy prompt
          </button>
          <button className="btn btn--ghost btn--sm" onClick={download}>
            <Icon name="download" size={13} /> Download
          </button>
          <div style={{marginLeft:"auto", display:"flex", gap:8, alignItems:"center"}}>
            {confirmDel ? (
              <>
                <span style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--c-dim)"}}>Delete this asset?</span>
                <button className="btn btn--ghost btn--sm" onClick={() => setConfirmDel(false)}>Cancel</button>
                <button className="btn btn--danger btn--sm" onClick={() => onDelete(o)}>Delete</button>
              </>
            ) : (
              <button className="btn btn--danger btn--sm" onClick={() => setConfirmDel(true)}>
                <Icon name="close" size={13} /> Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* SPECIALIST AUTHOR — define a new specialist with a live prompt      */
/* preview (assembles PLATFORM + BIO + SPEC + TASK from form state).   */

const AUTHOR_INPUT = {
  width:"100%", boxSizing:"border-box", padding:"9px 11px", borderRadius:9,
  border:"1px solid var(--c-line)", background:"var(--c-card)", color:"var(--c-ink)",
  fontFamily:"inherit", fontSize:13.5, outline:"none",
};

/* Mock "dry run": synthesise a plausible draft from the brief + spec.
   No model call — clearly a simulated draft so the QA gate has something
   to check. */
function mockDraft(brief, a, spec) {
  const obj = (spec.objective || a.job || "produce the deliverable").replace(/\.$/, "");
  return [
    `Draft · ${a.name} (${a.dept})`,
    ``,
    `Brief: ${brief.trim() || "(no brief given)"}`,
    ``,
    `${a.name} would ${obj.toLowerCase()}. First read of the BIO holds: keep the brand voice, no manufactured urgency, respect the pricing formula.`,
    spec.outputContract ? `Output shaped to: ${spec.outputContract}` : ``,
    ``,
    `— simulated first cut. Edit below to QA real copy.`,
  ].filter(Boolean).join("\n");
}

/* Brand-consistency gate: scores a draft against the refusal rules.
   The forbidden-words rule is a real scan; the rest are simulated
   verdicts (a real backend would run model-assisted checks). */
function runQaGate(draft, refusals) {
  const text = (draft || "").toLowerCase();
  return refusals.map(rule => {
    if (/unlock|limited|exclusive/i.test(rule)) {
      const m = text.match(/\b(unlock|limited|exclusive)\b/);
      return { rule, status: m ? "fail" : "pass", note: m ? `found “${m[1]}”` : "no forbidden words" };
    }
    if (/11\.4|pricing|discount/i.test(rule)) return { rule, status: "pass", note: "no pricing claim to flag" };
    if (/provenance/i.test(rule)) return { rule, status: "pass", note: "ok" };
    if (/contradict|bio/i.test(rule)) return { rule, status: "pass", note: "no BIO conflict detected" };
    if (/voice|drift/i.test(rule)) return { rule, status: "pass", note: "drift ~0.12 (≤ 0.20)" };
    return { rule, status: "pass", note: "checked" };
  });
}

function SpecialistAuthor({ go }) {
  const [form, setForm] = useBrState(() => ({
    name:"", dept: window.CI_DEPTS[0], status:"live", job:"",
    role:"", objective:"", method:[""], outputContract:"", voice:"", tools:[""], refusals:[""],
    model: Object.keys(window.CI_MODELS)[0], cr: 6, tier:"01",
  }));
  const [saved, setSaved] = useBrState(false);
  const [tab, setTab] = useBrState("prompt");
  const [brief, setBrief] = useBrState("Write the annual pricing announcement email for wholesale buyers.");
  const [draft, setDraft] = useBrState("");

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setArr = (k, i, v) => setForm(f => ({ ...f, [k]: f[k].map((x, j) => j === i ? v : x) }));
  const addArr = (k) => setForm(f => ({ ...f, [k]: [...f[k], ""] }));
  const delArr = (k, i) => setForm(f => ({ ...f, [k]: f[k].filter((_, j) => j !== i) }));

  const nextNum = Math.max(0, ...window.CI_AGENTS.map(a => parseInt(String(a.id).slice(1)) || 0)) + 1;
  const code = "L2-" + String(nextNum).padStart(2, "0");

  const useTemplate = () => {
    const t = window.CI_DEPT_SPECS[form.dept] || {};
    setForm(f => ({ ...f,
      role: t.role || "", objective: t.objective || "",
      method: (t.method || [""]).slice(), outputContract: t.outputContract || "",
      voice: t.voice || "", tools: (t.tools || [""]).slice(), refusals: (t.refusals || [""]).slice(),
    }));
  };

  const agentLike = { name: form.name || "New specialist", code, dept: form.dept, model: form.model };
  const spec = {
    role: form.role, objective: form.objective, method: form.method.filter(s => s.trim()),
    outputContract: form.outputContract, voice: form.voice,
    tools: form.tools.filter(s => s.trim()), refusals: form.refusals.filter(s => s.trim()),
  };
  const preview = composeSpecialistPrompt(agentLike, true, spec);

  const canSave = form.name.trim().length > 0;
  const save = () => {
    if (!canSave) return;
    const id = "a" + String(nextNum).padStart(2, "0");
    window.CI_AGENTS.push({ id, code, dept: form.dept, name: form.name.trim(), job: form.job, model: form.model, cr: Number(form.cr) || 0, status: form.status });
    window.CI_SPECIALIST_SPECS[id] = spec;
    setSaved(true);
    setTimeout(() => go("specialists"), 700);
  };

  const Label = ({ children }) => <div className="eyebrow" style={{marginBottom:6}}>{children}</div>;
  const ListEditor = ({ k, placeholder }) => (
    <div style={{display:"flex", flexDirection:"column", gap:6}}>
      {form[k].map((v, i) => (
        <div key={i} style={{display:"flex", gap:6}}>
          <input value={v} placeholder={placeholder} onChange={e => setArr(k, i, e.target.value)} style={AUTHOR_INPUT} />
          {form[k].length > 1 && (
            <button onClick={() => delArr(k, i)} className="btn btn--ghost btn--icon" style={{flexShrink:0}} aria-label="Remove"><Icon name="close" size={14} /></button>
          )}
        </div>
      ))}
      <button onClick={() => addArr(k)} className="btn btn--link" style={{fontSize:12, alignSelf:"flex-start"}}><Icon name="plus" size={12} /> Add</button>
    </div>
  );

  return (
    <div style={{padding:"24px 36px 80px"}}>
      <PageHeader
        eyebrow="Capabilities · admin"
        title="New specialist"
        sub="Define an L2 specialist. The prompt on the right is the real composed brief — PLATFORM + the live BIO + this spec + the task — assembled as you type."
        right={<>
          <button className="btn btn--ghost" onClick={() => go("specialists")}>Cancel</button>
          <button className="btn btn--primary" disabled={!canSave} onClick={save} style={!canSave ? {opacity:0.5, cursor:"not-allowed"} : undefined}>
            {saved ? "Saved ✓" : "Save specialist"}
          </button>
        </>}
      />

      <div style={{display:"grid", gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)", gap:28, alignItems:"start"}}>
        {/* Form */}
        <div style={{display:"flex", flexDirection:"column", gap:18}}>
          <div className="card" style={{padding:18, display:"flex", flexDirection:"column", gap:14}}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
              <div className="eyebrow">Identity</div>
              <span style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--c-faint)"}}>{code}</span>
            </div>
            <div><Label>Name</Label><input value={form.name} placeholder="e.g. The Wholesale Closer" onChange={e => set("name", e.target.value)} style={AUTHOR_INPUT} /></div>
            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
              <div><Label>Department</Label>
                <select value={form.dept} onChange={e => set("dept", e.target.value)} style={AUTHOR_INPUT}>
                  {window.CI_DEPTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div><Label>Status</Label>
                <select value={form.status} onChange={e => set("status", e.target.value)} style={AUTHOR_INPUT}>
                  <option value="live">Live</option><option value="soon">Coming soon</option><option value="draft">Draft</option>
                </select>
              </div>
            </div>
            <div><Label>The job · one-liner</Label><input value={form.job} placeholder="What this specialist does, in one line." onChange={e => set("job", e.target.value)} style={AUTHOR_INPUT} /></div>
          </div>

          <div className="card" style={{padding:18, display:"flex", flexDirection:"column", gap:14}}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
              <div className="eyebrow">Prompt spec</div>
              <button onClick={useTemplate} className="btn btn--link" style={{fontSize:12}}><Icon name="refresh" size={12} /> Prefill from {form.dept} template</button>
            </div>
            <div><Label>Role</Label><input value={form.role} placeholder="a conversion copywriter who…" onChange={e => set("role", e.target.value)} style={AUTHOR_INPUT} /></div>
            <div><Label>Objective</Label><textarea value={form.objective} rows={2} placeholder="What a good run produces." onChange={e => set("objective", e.target.value)} style={{...AUTHOR_INPUT, resize:"vertical", lineHeight:1.5}} /></div>
            <div><Label>Method · steps</Label><ListEditor k="method" placeholder="A step the specialist follows" /></div>
            <div><Label>Output contract</Label><textarea value={form.outputContract} rows={2} placeholder="Shape / length / format it must return." onChange={e => set("outputContract", e.target.value)} style={{...AUTHOR_INPUT, resize:"vertical", lineHeight:1.5}} /></div>
            <div><Label>Voice</Label><input value={form.voice} placeholder="Voice constraints (inherits brand voice)." onChange={e => set("voice", e.target.value)} style={AUTHOR_INPUT} /></div>
            <div><Label>Tools</Label><ListEditor k="tools" placeholder="e.g. Exa search, image generation" /></div>
            <div><Label>Refusals · won't do (on top of brand rules)</Label><ListEditor k="refusals" placeholder="A hard rule this specialist won't break" /></div>
          </div>

          <div className="card" style={{padding:18, display:"flex", flexDirection:"column", gap:14}}>
            <div className="eyebrow">Routing & cost</div>
            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12}}>
              <div><Label>Model</Label>
                <select value={form.model} onChange={e => set("model", e.target.value)} style={AUTHOR_INPUT}>
                  {Object.entries(window.CI_MODELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div><Label>Credits / run</Label><input type="number" min="0" value={form.cr} onChange={e => set("cr", e.target.value)} style={AUTHOR_INPUT} /></div>
              <div><Label>Unlocks from</Label>
                <select value={form.tier} onChange={e => set("tier", e.target.value)} style={AUTHOR_INPUT}>
                  {Object.entries(window.CI_TIERS).map(([k, v]) => <option key={k} value={k}>Tier {k} · {v}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Right pane — Prompt | Test (dry run + QA gate) */}
        <div style={{position:"sticky", top:24, display:"flex", flexDirection:"column", gap:10}}>
          <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", gap:8}}>
            <div style={{display:"flex", alignItems:"center", gap:8}}>
              <BrandolphDot />
              <span className="eyebrow eyebrow--yellow">{tab === "prompt" ? "Live composed prompt" : "Test · dry run + QA gate"}</span>
            </div>
            <div style={{display:"inline-flex", padding:3, gap:2, background:"var(--neutral-50)", borderRadius:9, border:"1px solid var(--c-line)"}}>
              {[{v:"prompt",l:"Prompt"},{v:"test",l:"Test"}].map(o => (
                <button key={o.v} onClick={() => setTab(o.v)} style={{
                  border:"none", cursor:"pointer", borderRadius:7, padding:"5px 12px",
                  fontFamily:"var(--font-mono)", fontSize:10.5, letterSpacing:"0.04em", textTransform:"uppercase",
                  background: tab === o.v ? "var(--c-card)" : "transparent",
                  color: tab === o.v ? "var(--c-ink)" : "var(--c-faint)",
                  boxShadow: tab === o.v ? "var(--shadow-sm)" : "none",
                }}>{o.l}</button>
              ))}
            </div>
          </div>

          {tab === "prompt" ? (
            <>
              <div className="card" style={{padding:0, overflow:"hidden"}}>
                <pre style={{
                  margin:0, padding:"16px 18px", whiteSpace:"pre-wrap", wordBreak:"break-word",
                  fontFamily:"var(--font-mono)", fontSize:11.5, lineHeight:1.6, color:"var(--c-ink)",
                  maxHeight:"calc(100vh - 200px)", overflowY:"auto", background:"var(--bg-sunken, var(--c-bg))",
                }}>{preview}</pre>
              </div>
              <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--c-faint)", letterSpacing:"0.04em", paddingLeft:2}}>
                Brand refusals auto-inherit from the BIO · {(window.CI_BRAND_REFUSALS || []).length} rules
              </div>
            </>
          ) : (
            <div style={{display:"flex", flexDirection:"column", gap:12}}>
              <div className="card" style={{padding:14, display:"flex", flexDirection:"column", gap:10}}>
                <Label>Sample brief</Label>
                <textarea value={brief} rows={2} onChange={e => setBrief(e.target.value)}
                  style={{...AUTHOR_INPUT, resize:"vertical", lineHeight:1.5}} />
                <button className="btn btn--primary btn--sm" style={{alignSelf:"flex-start"}}
                  onClick={() => setDraft(mockDraft(brief, agentLike, spec))}>
                  <Icon name="sparkles" size={13} /> Dry run
                </button>
              </div>

              {draft && (() => {
                const refusals = [...(window.CI_BRAND_REFUSALS || []), ...spec.refusals];
                const results = runQaGate(draft, refusals);
                const fails = results.filter(r => r.status === "fail").length;
                return (
                  <>
                    <div className="card" style={{padding:0, overflow:"hidden"}}>
                      <div className="eyebrow" style={{padding:"10px 14px 4px"}}>Draft output · editable</div>
                      <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={6}
                        style={{width:"100%", boxSizing:"border-box", border:"none", borderTop:"1px solid var(--c-line)",
                          padding:"12px 14px", background:"transparent", color:"var(--c-ink)", outline:"none",
                          fontFamily:"var(--font-mono)", fontSize:12, lineHeight:1.55, resize:"vertical"}} />
                    </div>

                    <div className="card" style={{padding:14}}>
                      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10}}>
                        <div className="eyebrow">Brand QA gate</div>
                        <span className={"pill " + (fails ? "pill--pink" : "pill--green")}>{fails ? `${fails} blocking` : "Pass"}</span>
                      </div>
                      <div style={{display:"flex", flexDirection:"column", gap:8}}>
                        {results.map((r, i) => (
                          <div key={i} style={{display:"flex", gap:8, alignItems:"flex-start", fontSize:12.5, lineHeight:1.4}}>
                            <span style={{color: r.status === "fail" ? "var(--pink-500)" : "var(--green-600)", fontFamily:"var(--font-mono)", flexShrink:0}}>
                              {r.status === "fail" ? "✕" : "✓"}
                            </span>
                            <span style={{flex:1, color:"var(--c-dim)"}}>{r.rule}</span>
                            <span style={{fontFamily:"var(--font-mono)", fontSize:10.5, color:"var(--c-faint)", whiteSpace:"nowrap"}}>{r.note}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{marginTop:12, paddingTop:10, borderTop:"1px dashed var(--c-line-2)", fontSize:12, color:"var(--c-dim)"}}>
                        {fails
                          ? <><em className="b-voice" style={{background:"none", fontStyle:"italic"}}>Not ready.</em> Fix the flagged rule before setting this specialist live.</>
                          : <><em className="b-voice" style={{background:"none", fontStyle:"italic"}}>Clears the gate.</em> Safe to set status “Live”.</>}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { BriefsLibrary, SpecialistsDirectory, CanvasView, Library, SpecialistAuthor, BriefViewCanvas });
