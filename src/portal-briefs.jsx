import React from "react";
import { apiFetch, supabase } from "./lib/supabase-browser.js";
const { AgentCard, BrandolphDot, Drawer, Icon, ModelChip, OutputCard, PageHeader, Reveal, StatusPill, useIsTeam, PinButton, usePins } = window;
const { useState: useBrState, useEffect: useBrEffect } = React;

/* useLiveBriefs — fetches real briefs + their runs + outputs from
   Supabase via RLS (workspace auto-filtered). Each brief now carries
   the actual runs (spec_id, model_used, cost) and outputs (body text,
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
          runs ( id, specialist_id, spec_version, bio_version, model_used, status, cost_usd, prompt_tokens, completion_tokens, ended_at,
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
        let byName = "your Brand Steward";
        if (bio.certified_by) {
          const { data: tm } = await supabase.from("team_members").select("first_name").eq("id", bio.certified_by).maybeSingle();
          byName = tm?.first_name || byName;
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

  /* Date-bucket grouping */
  const buckets = ["Today", "Yesterday", "This week", "This month", "Older"];
  const grouped = buckets
    .map((label) => ({ label, items: filtered.filter((b) => relativeBucket(b.created_at) === label) }))
    .filter((g) => g.items.length > 0);

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

      {/* Date-bucketed brief cards */}
      <div style={{display:"flex", flexDirection:"column", gap: 26}}>
        {grouped.map((g) => (
          <section key={g.label}>
            <div className="eyebrow" style={{marginBottom: 10, color:"var(--c-faint)"}}>{g.label} · {g.items.length}</div>
            <div style={{display:"flex", flexDirection:"column", gap: 8}}>
              {g.items.map((b) => {
                const runs    = b.runs || [];
                const credits = runs.reduce((s, r) => {
                  const a = window.CI_AGENTS?.find((x) => x.id === r.specialist_id);
                  return s + (a?.cr || 0);
                }, 0);
                const flagged = runs.some((r) => (r.outputs || []).some((o) => o.status !== "approved"));
                const reqText = briefTitle(b);
                const specs   = [...new Set(runs.map((r) => r.specialist_id))];

                return (
                  <button key={b.id} onClick={() => openBrief(b.id)} className="card" style={{
                    width:"100%", textAlign:"left", padding: "12px 16px",
                    border:"1px solid var(--c-line)",
                    borderLeft: `3px solid ${flagged ? "var(--pink-500)" : "var(--green-500)"}`,
                    cursor:"pointer",
                    display:"flex", alignItems:"center", gap: 14,
                    transition:"transform 100ms ease, box-shadow 100ms ease",
                  }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 18px rgba(0,0,0,0.06)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = ""; }}>
                    <div style={{flex: 1, minWidth: 0}}>
                      <div style={{fontSize: 13.5, color:"var(--c-ink)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
                        {reqText}
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
                      background: flagged ? "var(--pink-50, rgba(244,143,177,0.12))" : "var(--green-50, rgba(127,163,122,0.16))",
                      color: flagged ? "var(--pink-700, var(--pink-500))" : "var(--green-600)",
                    }}>{flagged ? "flagged" : "approved"}</span>
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
/* BRIEF DETAIL                                                      */

function BriefDetail({ id, go }) {
  const brief = window.CI_BRIEFS.find(b => b.id === id) || window.CI_BRIEFS[0];
  const outputs = window.CI_OUTPUTS.filter(o => o.briefId === brief.id);
  const [win, setWin] = useBrState(null);   // "overview" | "recommendation" | null — open as floating windows
  const depts = [...new Set(brief.agents.map(aid => window.CI_AGENTS.find(a => a.id === aid)?.dept))].filter(Boolean).length;

  const TABS = [["overview","Overview"],["recommendation","Recommendation"],["delivery","Delivery"]];
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setWin(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div style={{padding:"22px 36px 60px", maxWidth: 1100, margin: "0 auto"}}>
      <button onClick={() => go("briefs")} className="btn btn--link" style={{fontSize: 12, marginBottom: 14}}>
        <Icon name="arrowLeft" size={13} /> All briefs
      </button>

      {/* Persistent header */}
      <div style={{display:"grid", gridTemplateColumns:"1fr auto", gap: 24, alignItems:"start", marginBottom: 18}}>
        <div>
          <div className="eyebrow" style={{marginBottom: 8}}>{brief.type} · {brief.createdAt} · {brief.credits} cr · {brief.agents.length} specialists</div>
          <h1 style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize: 36, letterSpacing:"-0.015em", lineHeight: 1.1, margin: 0, color:"var(--c-ink)", fontWeight: 500}}>{brief.title}</h1>
        </div>
        <div style={{display:"flex", flexDirection:"column", gap: 10, alignItems:"flex-end"}}>
          <StatusPill status={brief.status} />
          <div style={{display:"flex", gap: 8}}>
            {brief.status === "draft" && <button className="btn btn--primary btn--sm">Approve <Icon name="check" size={13} /></button>}
            <button className="btn btn--ghost btn--sm">Revise with Brandolph</button>
            <button className="btn btn--ghost btn--icon" aria-label="Export PDF"><Icon name="download" size={14} /></button>
          </div>
        </div>
      </div>

      {/* Deck tabs — Overview/Recommendation open as floating windows; Delivery opens the board */}
      <div style={{display:"flex", gap: 2, borderBottom:"1px solid var(--c-line)", marginBottom: 26}}>
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => k === "delivery" ? go("board/" + brief.id) : setWin(w => w === k ? null : k)} style={{
            border:"none", background:"transparent", cursor:"pointer", padding:"10px 16px",
            fontFamily:"var(--font-sans)", fontSize: 14, fontWeight: win === k ? 600 : 500,
            color: win === k ? "var(--c-ink)" : "var(--c-faint)",
            borderBottom: win === k ? "2px solid var(--yellow-500)" : "2px solid transparent", marginBottom: -1,
            display:"inline-flex", alignItems:"center", gap:6,
          }}>{l}{k === "delivery" && <Icon name="canvas" size={13} />}</button>
        ))}
      </div>

      {/* Base — calm proposition summary; the detail lives in the windows / board */}
      <div style={{maxWidth: 900}}>
        <div style={{background:"var(--yellow-500)", borderRadius: 14, padding:"30px 36px", marginBottom: 22, position:"relative", overflow:"hidden"}}>
          <div style={{position:"absolute", top: 16, right: 20, fontFamily:"var(--font-mono)", fontSize: 10, letterSpacing:"0.18em", color:"rgba(48,48,48,0.6)", textTransform:"uppercase", fontWeight:500}}>Single-minded proposition</div>
          <p style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize: 28, letterSpacing:"-0.005em", lineHeight: 1.25, margin: 0, color:"#1a1f36", fontWeight: 500, maxWidth: 820}}>"{brief.smp}"</p>
        </div>
        <div style={{display:"flex", gap:12, flexWrap:"wrap", alignItems:"center"}}>
          <button className="btn btn--primary" onClick={() => go("board/" + brief.id)}><Icon name="canvas" size={14} /> Open the board</button>
          <button className="btn btn--ghost btn--sm" onClick={() => setWin("overview")}>Overview</button>
          <button className="btn btn--ghost btn--sm" onClick={() => setWin("recommendation")}>Recommendation</button>
          <span style={{fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--c-faint)", letterSpacing:"0.06em"}}>{outputs.length} outputs · {depts} departments · {brief.credits} cr</span>
        </div>
      </div>

      {/* Small floating window — opens on the same page, no full-screen modal */}
      {win && (
        <>
          <div onClick={() => setWin(null)} style={{position:"fixed", inset:0, zIndex:60}} />
          <div className="card" style={{position:"fixed", top:170, left:284, width:440, maxHeight:"calc(100vh - 200px)", overflowY:"auto", zIndex:61, boxShadow:"var(--shadow-xl)", animation:"cvPopIn 180ms cubic-bezier(.2,.8,.2,1)"}}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 18px", borderBottom:"1px solid var(--c-line)", position:"sticky", top:0, background:"var(--c-card)"}}>
              <h3 style={{margin:0, fontSize:17}}>{win === "overview" ? "Overview" : "Recommendation"}</h3>
              <button onClick={() => setWin(null)} className="btn btn--icon btn--ghost" aria-label="Close"><Icon name="close" size={15} /></button>
            </div>
            <div style={{padding:"20px 22px"}}>
              {win === "overview" ? (
                <>
                  <div style={{display:"grid", gridTemplateColumns:"1fr", gap: 14, marginBottom: 18}}>
                    <BriefSection title="Background"          body={brief.background} />
                    <BriefSection title="Objective"           body={brief.objective} />
                    <BriefSection title="Audience"            body={brief.audience} />
                    <BriefSection title="Metrics that matter" body={brief.metrics} />
                  </div>
                  <div className="card card--inset" style={{padding: 18}}>
                    <div className="eyebrow" style={{marginBottom: 12}}>Deliverables · {brief.deliverables.length}</div>
                    <div style={{display:"flex", gap: 8, flexWrap:"wrap"}}>
                      {brief.deliverables.map((d, i) => <span key={i} className="pill" style={{height: 28, padding:"0 14px", fontSize:11.5}}>{d}</span>)}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{display:"grid", gridTemplateColumns:"1fr", gap: 14, marginBottom: 18}}>
                    <BriefSection title="Creative strategy" body={brief.strategy} />
                    <BriefSection title="Tone"              body={brief.tone} />
                    <BriefSection title="Direction"         body={brief.direction} />
                    <BriefSection title="Mandatories"       body={brief.mandatories} />
                  </div>
                  <div style={{background:"var(--pink-50)", border:"1px solid var(--pink-200)", borderRadius: 12, padding: 18, marginBottom: 18}}>
                    <div className="eyebrow eyebrow--pink" style={{marginBottom: 12}}>What this brief is NOT doing</div>
                    <p style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize: 16, lineHeight: 1.55, color:"var(--c-ink)", margin: 0}}>"{brief.notDoing}"</p>
                  </div>
                  <div style={{display:"grid", gridTemplateColumns:"1fr", gap: 14}}>
                    <div className="card card--inset" style={{padding: 18, borderLeft: "3px solid var(--yellow-500)"}}>
                      <div className="eyebrow eyebrow--yellow" style={{marginBottom: 12}}>Strategic assumptions</div>
                      <ul style={{margin:0, padding:0, listStyle:"none", display:"flex", flexDirection:"column", gap: 8}}>
                        {brief.assumptions.map((a, i) => <li key={i} style={{fontSize: 13.5, color:"var(--c-ink)", display:"flex", gap: 8, lineHeight: 1.5}}><span style={{color:"var(--yellow-700)", fontFamily:"var(--font-mono)"}}>~</span> {a}</li>)}
                      </ul>
                    </div>
                    <div className="card card--inset" style={{padding: 18, borderLeft: "3px solid var(--orange-500)"}}>
                      <div className="eyebrow" style={{color:"var(--orange-600)", marginBottom: 12}}>Production watchouts</div>
                      <ul style={{margin:0, padding:0, listStyle:"none", display:"flex", flexDirection:"column", gap: 8}}>
                        {brief.watchouts.map((w, i) => <li key={i} style={{fontSize: 13.5, color:"var(--c-ink)", display:"flex", gap: 8, lineHeight: 1.5}}><span style={{color:"var(--orange-600)", fontFamily:"var(--font-mono)"}}>!</span> {w}</li>)}
                      </ul>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function BriefSection({ title, body }) {
  return (
    <div className="card" style={{padding: 20}}>
      <div className="eyebrow" style={{marginBottom: 10}}>{title}</div>
      <p style={{fontSize: 14, lineHeight: 1.55, color:"var(--c-ink)", margin: 0}}>{body}</p>
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
                  <div className="eyebrow">{a.dept}</div>
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
          <div className="eyebrow" style={{marginBottom: 10}}>Most used for Vinilo</div>
          <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))", gap: 10}}>
            {mostUsed.map(a => (
              <button key={a.id} onClick={() => setOpenId(a.id)} className="card"
                style={{textAlign:"left", cursor:"pointer", padding:"12px 14px", display:"flex", alignItems:"center", gap:10,
                  borderLeft:`3px solid ${window.CI_DEPT_COLORS[a.dept] || "var(--neutral-400)"}`}}>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontSize:13.5, fontWeight:600, color:"var(--c-ink)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{a.name}</div>
                  <div className="eyebrow">{a.dept}</div>
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
            <section key={d} style={{marginBottom: 32}}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom: 14}}>
                <h3 style={{margin: 0, fontSize: 17, letterSpacing:"-0.005em"}}>{d}</h3>
                <span style={{fontFamily:"var(--font-mono)", fontSize: 10.5, color:"var(--c-faint)", letterSpacing:"0.08em", textTransform:"uppercase"}}>{list.length} specialists · {list.filter(a => a.status === "live").length} live</span>
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
        <div className="eyebrow">{a.dept}</div>
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

      <div className="eyebrow" style={{marginBottom: 8}}>Example outputs · for Vinilo</div>
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

function BriefRunCanvas({ context, onClear, go }) {
  const [nodes, setNodes]         = useBrState(() => buildInitialRunNodes(context));
  const [edges, setEdges]         = useBrState(() => buildInitialRunEdges(context));
  const [running, setRunning]     = useBrState(false);
  const [completed, setCompleted] = useBrState(false);
  const [err, setErr]             = useBrState(null);
  const [totalCost, setTotalCost] = useBrState(0);
  const [openId, setOpenId]       = useBrState(null);            /* selected specialist id for the notepad drawer */
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
        if (bio?.certified_by) {
          const { data: tm } = await supabase.from("team_members").select("first_name").eq("id", bio.certified_by).maybeSingle();
          setCert({ byName: tm?.first_name || "your Steward", at: bio.certified_at });
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
        height: isSpecialist ? 116 : 104,                  /* fixed height — no stacking */
        boxSizing: "border-box", overflow: "hidden",
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

    for (const agent of specs) {
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
      await streamSpecialistRun({
        specialistId: agent.id,
        briefText:    context.composedBrief,
        briefId:      sharedBriefId,
        briefMeta,
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
      const cost   = done?.usage?.total_cost_usd ?? 0;
      setTotalCost((c) => c + cost);

      const assetUrl = done?.output?.asset_url || null;
      setNodes((prev) => prev.map((n) => n.id === "spec-" + agent.id
        ? {
            ...n,
            state: passed ? "done" : "flagged",
            outputText: text,
            assetUrl,
            cost,
            qa,
            done,
            sub: assetUrl
              ? `${qa?.brand_match ?? "?"}/100 · ${passed ? "approved" : "flagged"}`
              : `${qa?.voice_match ?? "?"}/100 · ${passed ? "approved" : "flagged"}`,
          }
        : n));
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
            bottom: 64, left:"50%", transform:"translateX(-50%)",
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
          {cert
            ? <> · certified by <span style={{color:"var(--green-600)"}}>{cert.byName}</span></>
            : <> · <span style={{color:"var(--yellow-700)"}}>uncertified</span></>}
        </span>
        <span>{agent.cr ?? "?"} cr</span>
      </div>
    </Drawer>
  );
}

/* Initial node layout: BIO (left) → Brief (middle) → Specialists (right
   column). Specialist nodes are FIXED-HEIGHT (116px) and laid out 140px
   apart so they can never stack or overlap regardless of streaming
   output length. Full output lives in the notepad drawer (click to open). */
function buildInitialRunNodes(ctx) {
  const specs = (ctx.specialistIds || []).map((id) => window.CI_AGENTS.find((a) => a.id === id)).filter(Boolean);
  const rowH  = 140;                           /* fixed 116px node + 24px gap */
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
  return <InteractiveCanvas nodeData={CANVAS_NODES} edges={CANVAS_EDGES} exportName="vinilo-canvas" />;
}

/* ── BriefViewCanvas — loads an existing brief's runs/outputs from DB
   and renders the same node graph as a completed assembly. Reuses the
   notepad drawer for verify/edit/copy. */
function BriefViewCanvas({ briefId, onClear, go }) {
  const [state, setState] = useBrState({ loading: true, brief: null, runs: [], cert: null, error: null });
  const [openId, setOpenId]       = useBrState(null);
  const [editedText, setEditedText] = useBrState({});

  useBrEffect(() => {
    (async () => {
      try {
        const { data: brief, error: bErr } = await supabase
          .from("briefs").select("id, title, payload, mode, created_at, brand_id")
          .eq("id", briefId).maybeSingle();
        if (bErr || !brief) { setState({ loading: false, brief: null, runs: [], cert: null, error: bErr?.message || "Brief not found" }); return; }

        const { data: runs } = await supabase
          .from("runs").select("id, specialist_id, bio_version, status, outputs ( id, kind, body, status, rationale )")
          .eq("brief_id", briefId).order("started_at", { ascending: true });

        const { data: bio } = await supabase
          .from("bios").select("certified_by, certified_at, version")
          .eq("brand_id", brief.brand_id).eq("certified", true)
          .order("version", { ascending: false }).limit(1).maybeSingle();
        let cert = null;
        if (bio?.certified_by) {
          const { data: tm } = await supabase.from("team_members").select("first_name").eq("id", bio.certified_by).maybeSingle();
          cert = { byName: tm?.first_name || "your Steward", at: bio.certified_at, version: bio.version };
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

  /* Build canvas nodes from real DB data. Show edited_text if present
     (the user's save from a prior session); fall back to AI's original. */
  const specs = state.runs.map((r) => {
    const a = window.CI_AGENTS.find((x) => x.id === r.specialist_id);
    const out = r.outputs?.[0];
    const passed = out?.status === "approved";
    const body  = out?.body || {};
    const text  = body.edited_text || body.text || (typeof out?.body === "string" ? out.body : "");
    return {
      run: r,
      agent: a,
      output: out,
      passed,
      text,
    };
  });

  const rowH = 140;
  const totalSpecH = Math.max(specs.length, 1) * rowH;
  const midY = totalSpecH / 2 + 40;

  const nodes = [
    { id: "bio",   x: 40,  y: midY - 52, w: 260, kind: "bio",   eyebrow: "BIO",
      title: "Brand Intelligence Object", sub: state.cert ? `Certified by ${state.cert.byName}` : "Certified canon" },
    { id: "brief", x: 360, y: midY - 52, w: 280, kind: "brief", eyebrow: "BRIEF",
      title: briefTitle(state.brief),
      sub: `${state.runs.length} runs · ${shortDate(state.brief.created_at)}` },
    ...specs.map((s, i) => {
      const assetUrl = s.output?.body?.asset_url || null;
      return {
        id: "spec-" + (s.agent?.id || s.run.specialist_id),
        specId: s.agent?.id || s.run.specialist_id,
        x: 760,
        y: 40 + i * rowH,
        w: 340,
        kind: "specialist",
        eyebrow: s.agent ? `${s.agent.code} · ${s.agent.dept}` : s.run.specialist_id,
        title: s.agent?.name || s.run.specialist_id,
        sub: assetUrl
          ? `image · ${s.passed ? "approved" : "flagged"}`
          : `${s.passed ? "approved" : "flagged"}${s.output?.kind ? " · " + s.output.kind : ""}`,
        cr: s.agent?.cr || 0,
        state: s.passed ? "done" : "flagged",
        outputText: s.text,
        assetUrl,
        tokenCount: 1000,                         /* full progress bar */
        qa: null,
        done: { brand: { bioVersion: s.run.bio_version }, output: assetUrl ? { asset_url: assetUrl } : null },
      };
    }),
  ];

  const edges = [
    { from: "bio", to: "brief", fromSide: "right", toSide: "left" },
    ...specs.map((s) => ({ from: "brief", to: "spec-" + (s.agent?.id || s.run.specialist_id), fromSide: "right", toSide: "left" })),
  ];

  const renderNode = (node) => {
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
        height: isSpec ? 116 : 104, boxSizing:"border-box", overflow:"hidden",
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
        </>)}
        {!isSpec && node.sub && (
          <div style={{fontFamily:"var(--font-mono)", fontSize: 10.5, color:"var(--c-faint)", letterSpacing:"0.04em", lineHeight: 1.45, marginTop: 4}}>
            {node.sub.length > 70 ? node.sub.slice(0, 70) + "…" : node.sub}
          </div>
        )}
      </div>
    );
  };

  const opened = openId && specs.find((s) => (s.agent?.id || s.run.specialist_id) === openId);

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
              brand: { bioVersion: opened.run.bio_version },
              output: opened.output?.body?.asset_url ? { asset_url: opened.output.body.asset_url } : null,
            },
            run: { model_used: opened.run.model_used },
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
              runs: s.runs.map((r) => r.id === opened.run.id
                ? { ...r, outputs: (r.outputs || []).map((o) => o.id === opened.output.id ? { ...o, body: saved.body } : o) }
                : r),
            }));
          }}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}

/* Build a brief's logic graph: BIO → brief → specialist → output(s). */
function buildBriefGraph(brief, outputs) {
  const brand = window.CI_BRAND;
  const rowH = 104, gapBlock = 26;
  const specIds = [...new Set(outputs.map(o => o.agentId).filter(Boolean))];
  const useSpecs = specIds.length ? specIds : (brief.agents || []);
  const kindFor = (o) => o.kind === "upload" ? "upload" : o.kind === "qa" ? "qa" : (o.kind === "image" ? "asset" : "copy");

  const nodes = [], edges = [];
  let y = 40;
  useSpecs.forEach((sid) => {
    const a = window.CI_AGENTS.find(x => x.id === sid);
    const outs = outputs.filter(o => o.agentId === sid);
    const blockStart = y;
    const n = Math.max(1, outs.length);
    nodes.push({ id:"spec-"+sid, x:700, y: blockStart + (n * rowH) / 2 - rowH / 2, w:240, kind:"specialist",
      title: a ? a.name : sid, sub: `${a ? a.code : ""}${a ? " · " + a.dept : ""}`, ref:{ type:"specialist", id:sid } });
    edges.push({ from:"brief", to:"spec-"+sid, fromSide:"right", toSide:"left" });
    outs.forEach((o, j) => {
      const oy = blockStart + j * rowH;
      nodes.push({ id:"out-"+o.id, x:1040, y: oy, w:260, kind: kindFor(o), title:o.type, sub:o.meta, ref:{ type:"output", id:o.id } });
      edges.push({ from:"spec-"+sid, to:"out-"+o.id, fromSide:"right", toSide:"left" });
    });
    y = blockStart + n * rowH + gapBlock;
  });

  const ys = nodes.map(n => n.y);
  const midY = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 120;
  nodes.unshift({ id:"brief", x:360, y:midY, w:260, kind:"brief", title:brief.title, sub:"L1 · Brandolph", ref:{ type:"brief" } });
  nodes.unshift({ id:"bio", x:40, y:midY, w:260, kind:"bio", title:"Brand Intelligence Object", sub:`BIO · ${brand.bioCompleteness}%`, ref:{ type:"bio" } });
  edges.unshift({ from:"bio", to:"brief", fromSide:"right", toSide:"left" });
  return { nodes, edges };
}

/* Why a specialist made its creative choice — explicit field or derived. */
function outputRationale(o, specialist) {
  if (o && o.rationale) return o.rationale;
  const spec = specialist ? specialistSpec(specialist) : {};
  const who = specialist ? specialist.name : "The specialist";
  if (spec.voice) return `${who} wrote to the brand voice — ${spec.voice.toLowerCase()} — and shaped it to: ${spec.outputContract || "the brief"}.`;
  return `${who} read the BIO first, then ${spec.objective ? spec.objective.toLowerCase() : "produced the deliverable to the brief"}`;
}

/* Per-brief Delivery view: the canvas + a node-detail drawer. */
function BriefDelivery({ brief, outputs }) {
  const [sel, setSel] = useBrState(null);
  const graph = React.useMemo(() => buildBriefGraph(brief, outputs), [brief.id]);

  const open = (node) => { if (node && node.ref) setSel(node.ref); };
  const ref = sel || {};
  const output = ref.type === "output" ? outputs.find(o => o.id === ref.id) : null;
  const specialist =
    ref.type === "specialist" ? window.CI_AGENTS.find(a => a.id === ref.id)
    : output ? window.CI_AGENTS.find(a => a.id === output.agentId) : null;

  let title = "", eyebrow = "", body = null;
  if (ref.type === "bio") {
    eyebrow = "Source · the canon"; title = "Brand Intelligence Object";
    body = <p style={{fontSize:14.5, color:"var(--c-ink)", lineHeight:1.55}}>Everything downstream is judged against the BIO. <em className="b-voice">{window.CI_BRAND.tagline}</em> · {window.CI_BRAND.bioCompleteness}% complete.</p>;
  } else if (ref.type === "brief") {
    eyebrow = "L1 · Brandolph"; title = brief.title;
    body = <><p style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize:17, lineHeight:1.5, color:"var(--c-ink)", marginBottom:12}}>"{brief.smp}"</p><p style={{fontSize:13.5, color:"var(--c-dim)", lineHeight:1.5}}>{brief.objective}</p></>;
  } else if (ref.type === "specialist" && specialist) {
    const spec = specialistSpec(specialist);
    eyebrow = `${specialist.code} · ${specialist.dept}`; title = specialist.name;
    body = <>
      <p style={{fontSize:14, color:"var(--c-ink)", lineHeight:1.5, marginBottom:14}}>{specialist.job}</p>
      <div className="eyebrow" style={{marginBottom:6}}>Why Brandolph routed this here</div>
      <p style={{fontSize:13.5, color:"var(--c-dim)", lineHeight:1.5}}>{spec.objective || "Best fit for this part of the brief."}</p>
    </>;
  } else if (output) {
    eyebrow = `${output.type}${specialist ? " · " + specialist.name : ""}`; title = "Output";
    body = <>
      {output.status && <div style={{marginBottom:12}}><StatusPill status={output.status} /></div>}
      <p style={{fontFamily:"Georgia, 'Times New Roman', serif", fontStyle:"italic", fontSize:16, lineHeight:1.55, color:"var(--c-ink)", marginBottom:14}}>"{output.body}"</p>
      <div style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--c-faint)", marginBottom:18}}>{output.meta}</div>
      <div className="card card--inset" style={{padding:"14px 16px", borderLeft:"3px solid var(--yellow-500)"}}>
        <div className="eyebrow eyebrow--yellow" style={{marginBottom:6}}>Why this creative choice</div>
        <p style={{fontSize:13.5, color:"var(--c-ink)", lineHeight:1.5, margin:0}}>{outputRationale(output, specialist)}</p>
      </div>
    </>;
  }

  return (
    <div>
      <InteractiveCanvas
        key={brief.id}
        nodeData={graph.nodes}
        edges={graph.edges}
        onNodeClick={open}
        height="calc(100vh - 250px)"
        exportName={brief.id}
      />
      <Drawer open={!!sel} onClose={() => setSel(null)} title={title} eyebrow={eyebrow} width={440}>
        {body}
      </Drawer>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* BRIEF BOARD — the whole brief as a Miro-style canvas workspace.    */
/* Floating launcher + toolbar; Ask-Brandolph, specialists, results   */
/* as draggable nodes; +Add to drop another ask or specialist.        */

const BOARD_LAUNCH = [
  { id:"home",        icon:"sparkles", label:"Create" },
  { id:"briefs",      icon:"brief",    label:"Briefs" },
  { id:"library",     icon:"files",    label:"Library" },
  { id:"specialists", icon:"team",     label:"Specialists" },
  { id:"credits",     icon:"credit",   label:"Credits" },
  { id:"settings",    icon:"settings", label:"Settings" },
];

function boardReply(text) {
  const m = text.toLowerCase();
  if (/why|reason|rational/.test(m)) return "Because the BIO frames price as cost-of-pause — the work leans on the decision to slow down, not the discount.";
  if (/change|revise|tweak|edit/.test(m)) return "On it. I'll route that back to the specialist and hold the QA gate until it clears the brand rules.";
  if (/who|specialist|which/.test(m)) return "For this I'd add Conversion Copy and Brand Consistency QA — smallest crew that earns the change.";
  return "Heard. I'll sharpen that into a sub-brief and assemble the right specialist — give me a beat.";
}

function BriefBoard({ id, go }) {
  const brief = window.CI_BRIEFS.find(b => b.id === id) || window.CI_BRIEFS[0];
  const outputs = window.CI_OUTPUTS.filter(o => o.briefId === brief.id);
  const base = React.useMemo(() => buildBriefGraph(brief, outputs), [brief.id]);

  const [extraNodes, setExtraNodes] = useBrState([]);
  const [extraEdges, setExtraEdges] = useBrState([]);
  const [pop, setPop] = useBrState(null);   // { ref, rect } — floating detail near the node
  const [addOpen, setAddOpen] = useBrState(false);
  const [connectFrom, setConnectFrom] = useBrState(null);
  const [win, setWin] = useBrState(null);   // "overview" | "recommendation" | null — small windows
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { setWin(null); setPop(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [panel, setPanel] = useBrState(null);   // "brief" | "ask" | null
  const [ask, setAsk] = useBrState("");
  const seq = React.useRef(0);

  const allNodes = React.useMemo(() => [...base.nodes, ...extraNodes], [base, extraNodes]);
  const allEdges = React.useMemo(() => [...base.edges, ...extraEdges], [base, extraEdges]);
  const nodeName = (nid) => { const n = allNodes.find(x => x.id === nid); return n ? n.title : nid; };

  const addSpecialist = (a) => {
    const nid = "specx-" + a.id + "-" + (++seq.current);
    setExtraNodes(ns => [...ns, { id:nid, x:700, y: 480 + ns.length * 44, w:240, kind:"specialist", title:a.name, sub:`${a.code} · ${a.dept}`, ref:{ type:"specialist", id:a.id } }]);
    setAddOpen(false);
    setConnectFrom(nid);
  };
  const sendAsk = () => {
    const text = ask.trim(); if (!text) return;
    const rid = "ans-" + (++seq.current);
    setExtraNodes(ns => [...ns, { id:rid, x: 380, y: 480 + ns.length * 44, w:300, kind:"note", title:"Brandolph", body: boardReply(text), ref:{ type:"note" } }]);
    setExtraEdges(es => [...es, { from:"brief", to:rid, fromSide:"bottom", toSide:"top", dashed:true }]);
    setAsk(""); setPanel(null);
  };

  const onNodeClick = (node, rect) => {
    if (!node) return;
    if (connectFrom && connectFrom !== node.id) {
      setExtraEdges(es => [...es, { from: connectFrom, to: node.id, fromSide:"right", toSide:"left" }]);
      setConnectFrom(null);
      return;
    }
    if (node.ref && node.ref.type !== "note") setPop({ ref: node.ref, rect });
  };

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { setConnectFrom(null); setAddOpen(false); setPanel(null); setPop(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ConnectHandle = ({ nid }) => (
    <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setConnectFrom(nid); }}
      title="Connect to another node"
      style={{position:"absolute", right:-9, top:"calc(50% - 9px)", width:18, height:18, borderRadius:"50%",
        border:"1px solid var(--c-line)", background:"var(--c-card)", color:"var(--c-faint)", cursor:"crosshair",
        display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"var(--shadow-sm)", zIndex:4}}>
      <Icon name="plus" size={11} />
    </button>
  );

  const renderNode = (n, { active }) => {
    const accent = CANVAS_COLORS[n.kind] || CANVAS_COLORS.copy;
    const edge = (connectFrom === n.id) ? "var(--accent)" : (active ? "var(--yellow-500)" : "var(--c-line)");
    const card = (extra) => ({
      position:"relative", background:"var(--c-card)", borderRadius:12,
      borderTop:`1px solid ${edge}`, borderRight:`1px solid ${edge}`, borderBottom:`1px solid ${edge}`,
      borderLeft:`3px solid ${accent}`,
      boxShadow: active ? "0 14px 32px rgba(0,0,0,0.16)" : "var(--shadow-sm)",
      transform: active ? "translateY(-2px)" : "none",
      transition: "transform 180ms cubic-bezier(.34,1.56,.64,1), box-shadow 180ms ease, border-color 140ms ease",
      ...extra,
    });
    const handle = n.kind !== "note" ? <ConnectHandle nid={n.id} /> : null;

    if (n.kind === "brief") {
      return (
        <div style={card({ padding:0, overflow:"hidden" })}>
          <div style={{padding:"12px 14px", background:"var(--yellow-50)", borderBottom:"1px solid var(--c-line)"}}>
            <div className="eyebrow eyebrow--yellow" style={{marginBottom:6}}>The brief · L1 Brandolph</div>
            <p style={{fontFamily:"Georgia,serif", fontStyle:"italic", fontSize:14.5, lineHeight:1.4, color:"var(--c-ink)", margin:0}}>"{brief.smp}"</p>
          </div>
          {brief.clarifications && (
            <div style={{padding:"12px 14px"}}>
              <div className="eyebrow" style={{marginBottom:8}}>Brandolph asked first</div>
              <div style={{display:"flex", flexDirection:"column", gap:10}}>
                {brief.clarifications.map((c, i) => (
                  <div key={i}>
                    <div style={{display:"flex", gap:7, fontSize:12.5, fontWeight:600, color:"var(--c-ink)", lineHeight:1.35}}>
                      <span style={{fontFamily:"var(--font-mono)", color:"var(--yellow-700)"}}>{String(i+1).padStart(2,"0")}</span>{c.q}
                    </div>
                    <div style={{fontSize:11.5, color:"var(--c-dim)", lineHeight:1.4, marginTop:3, paddingLeft:18}}>{c.why}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {handle}
        </div>
      );
    }
    if (n.kind === "note") {
      return (
        <div style={card({ padding:14 })}>
          <div style={{display:"flex", alignItems:"center", gap:6, marginBottom:8}}><BrandolphDot /><span className="eyebrow eyebrow--yellow">Brandolph</span></div>
          <p style={{fontFamily:"Georgia,serif", fontStyle:"italic", fontSize:14, lineHeight:1.5, color:"var(--c-ink)", margin:0}}>{n.body}</p>
        </div>
      );
    }
    if (n.kind === "bio") {
      return <div style={card({ padding:13 })}><div className="eyebrow" style={{marginBottom:4, fontSize:9}}>Source · canon</div><div style={{fontSize:13.5, fontWeight:600, color:"var(--c-ink)"}}>{n.title}</div><div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--c-faint)", marginTop:2}}>{n.sub}</div>{handle}</div>;
    }
    if (n.kind === "specialist") {
      return <div style={card({ padding:13 })}><div className="eyebrow" style={{marginBottom:4, fontSize:9}}>Specialist · {n.sub}</div><div style={{fontSize:13.5, fontWeight:600, color:"var(--c-ink)"}}>{n.title}</div>{handle}</div>;
    }
    const o = window.CI_OUTPUTS.find(x => "out-" + x.id === n.id);
    return (
      <div style={card({ padding:13 })}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:6, marginBottom:5}}>
          <span className="eyebrow eyebrow--yellow" style={{fontSize:9, maxWidth:"70%"}}>{n.title}</span>
          {o && o.status && <StatusPill status={o.status} />}
        </div>
        {o && <p style={{fontSize:12, color:"var(--c-dim)", lineHeight:1.4, margin:"0 0 5px", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden"}}>{o.body}</p>}
        <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--c-faint)"}}>{n.sub}</div>
        {handle}
      </div>
    );
  };

  // Floating detail content — derived from the clicked node
  const ref = (pop && pop.ref) || {};
  const output = ref.type === "output" ? outputs.find(o => o.id === ref.id) : null;
  const specialist = ref.type === "specialist" ? window.CI_AGENTS.find(a => a.id === ref.id)
    : output ? window.CI_AGENTS.find(a => a.id === output.agentId) : null;
  let dEye = "", dBody = null;
  if (ref.type === "bio") { dEye = "Source · the canon"; dBody = <><h3 style={{margin:"0 0 10px", fontSize:18}}>Brand Intelligence Object</h3><p style={{fontSize:14, lineHeight:1.55, color:"var(--c-dim)"}}><em className="b-voice" style={{background:"none", fontStyle:"italic"}}>{window.CI_BRAND.tagline}</em> · {window.CI_BRAND.bioCompleteness}% complete.</p></>; }
  else if (ref.type === "brief") { dEye = "L1 · Brandolph"; dBody = <><p style={{fontFamily:"Georgia,serif", fontStyle:"italic", fontSize:19, lineHeight:1.45, color:"var(--c-ink)", margin:"0 0 12px"}}>"{brief.smp}"</p><p style={{fontSize:13.5, color:"var(--c-dim)", lineHeight:1.5, margin:0}}>{brief.objective}</p></>; }
  else if (ref.type === "specialist" && specialist) { const sp = specialistSpec(specialist); dEye = `${specialist.code} · ${specialist.dept}`; dBody = <><h3 style={{margin:"0 0 8px", fontSize:18}}>{specialist.name}</h3><p style={{fontSize:14, lineHeight:1.5, color:"var(--c-ink)", margin:"0 0 16px"}}>{specialist.job}</p><div style={{height:1, background:"var(--c-line)", margin:"0 -16px 12px"}} /><div className="eyebrow" style={{marginBottom:6, color:"var(--c-faint)"}}>Why Brandolph routes here</div><p style={{fontSize:12.5, color:"var(--c-dim)", lineHeight:1.5, margin:0}}>{sp.objective}</p></>; }
  else if (output) {
    dEye = `${output.type}${specialist ? " · " + specialist.name : ""}`;
    dBody = (
      <>
        {output.status && <div style={{marginBottom:14}}><StatusPill status={output.status} /></div>}
        {/* THE OUTPUT — the hero of the card: big, italic, roomy */}
        <div className="eyebrow" style={{marginBottom:10}}>The output</div>
        <p style={{
          fontFamily:"Georgia, 'Times New Roman', serif", fontStyle:"italic",
          fontSize:21, lineHeight:1.5, letterSpacing:"-0.005em", color:"var(--c-ink)", margin:"0 0 12px",
        }}>"{output.body}"</p>
        <div style={{fontFamily:"var(--font-mono)", fontSize:10.5, color:"var(--c-faint)", letterSpacing:"0.04em"}}>{output.meta}</div>
        {/* divider — clearly separates output from rationale */}
        <div style={{height:1, background:"var(--c-line)", margin:"16px -16px 14px"}} />
        {/* THE RATIONALE — clearly secondary */}
        <div className="eyebrow" style={{marginBottom:6, color:"var(--c-faint)"}}>Why this choice</div>
        <p style={{fontSize:12.5, lineHeight:1.5, color:"var(--c-dim)", margin:0}}>{outputRationale(output, specialist)}</p>
      </>
    );
  }

  const addMenu = (
    <div style={{position:"relative"}}>
      <button className="btn btn--primary btn--sm" onClick={() => setAddOpen(o => !o)}><Icon name="plus" size={13} /> Add specialist</button>
      {addOpen && (
        <>
          <div onClick={() => setAddOpen(false)} style={{position:"fixed", inset:0, zIndex:40}} />
          <div style={{position:"absolute", top:"calc(100% + 6px)", right:0, zIndex:41, width:240, background:"var(--c-card)", border:"1px solid var(--c-line)", borderRadius:12, boxShadow:"var(--shadow-lg)", padding:6}}>
            <div className="eyebrow" style={{padding:"6px 10px 4px"}}>Drop a specialist, then connect it</div>
            <div style={{maxHeight:240, overflowY:"auto"}}>
              {window.CI_AGENTS.filter(a => a.status === "live").slice(0, 10).map(a => (
                <button key={a.id} onClick={() => addSpecialist(a)} style={{display:"block", width:"100%", textAlign:"left", border:"none", background:"transparent", padding:"7px 10px", borderRadius:8, cursor:"pointer", fontSize:12.5, color:"var(--c-ink)"}}
                  onMouseEnter={e => e.currentTarget.style.background="var(--neutral-50)"} onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                  {a.name} <span style={{color:"var(--c-faint)", fontFamily:"var(--font-mono)", fontSize:10}}>· {a.dept}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );

  const tabActive = (k) => k === "delivery" ? !win : win === k;
  return (
    <div style={{display:"flex", flexDirection:"column", height:"calc(100vh - 56px)", minHeight:0}}>
      {/* Brief header — integrated into the flow page (one page) */}
      <div style={{padding:"18px 32px 0", flexShrink:0}}>
        <button onClick={() => go("briefs")} className="btn btn--link" style={{fontSize:12, marginBottom:10}}><Icon name="arrowLeft" size={13} /> All briefs</button>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:24, marginBottom:12}}>
          <div>
            <div className="eyebrow" style={{marginBottom:6}}>{brief.type} · {brief.createdAt} · {brief.credits} cr · {brief.agents.length} specialists</div>
            <h1 style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize:30, letterSpacing:"-0.015em", lineHeight:1.05, margin:0, color:"var(--c-ink)", fontWeight:500}}>{brief.title}</h1>
          </div>
          <div style={{display:"flex", flexDirection:"column", gap:8, alignItems:"flex-end"}}>
            <StatusPill status={brief.status} />
            <div style={{display:"flex", gap:8}}>
              <button className="btn btn--ghost btn--sm">Revise with Brandolph</button>
              <button className="btn btn--ghost btn--icon" aria-label="Export"><Icon name="download" size={14} /></button>
            </div>
          </div>
        </div>
        <div style={{display:"flex", gap:2, borderBottom:"1px solid var(--c-line)"}}>
          {[["overview","Overview"],["recommendation","Recommendation"],["delivery","Delivery"]].map(([k, l]) => (
            <button key={k} onClick={() => k === "delivery" ? setWin(null) : setWin(w => w === k ? null : k)} style={{
              border:"none", background:"transparent", cursor:"pointer", padding:"10px 16px",
              fontFamily:"var(--font-sans)", fontSize:14, fontWeight: tabActive(k) ? 600 : 500,
              color: tabActive(k) ? "var(--c-ink)" : "var(--c-faint)",
              borderBottom: tabActive(k) ? "2px solid var(--yellow-500)" : "2px solid transparent", marginBottom:-1,
              display:"inline-flex", alignItems:"center", gap:6,
            }}>{l}{k === "delivery" && <Icon name="canvas" size={13} />}</button>
          ))}
        </div>
      </div>

      {/* Delivery — the flow canvas, filling the page */}
      <div style={{flex:1, position:"relative", minHeight:0}}>
        {connectFrom && (
          <div style={{position:"absolute", bottom:64, left:"50%", transform:"translateX(-50%)", zIndex:20}}>
            <div className="card" style={{padding:"9px 14px", display:"flex", alignItems:"center", gap:12, border:"1px solid var(--accent)"}}>
              <span style={{fontSize:13, color:"var(--c-ink)"}}>Connecting from <strong>{nodeName(connectFrom)}</strong> — click a node to link.</span>
              <button className="btn btn--ghost btn--sm" onClick={() => setConnectFrom(null)}>Cancel</button>
            </div>
          </div>
        )}
        <InteractiveCanvas
          key={brief.id}
          nodeData={allNodes}
          edges={allEdges}
          renderNode={renderNode}
          onNodeClick={onNodeClick}
          height="100%"
          exportName={brief.id + "-board"}
          toolbarExtra={addMenu}
          helper={connectFrom ? <>Click a node to connect · Esc to cancel.</> : <>Drag to pan · scroll to zoom · <strong style={{color:"var(--c-ink)", fontWeight:600}}>+</strong> on a node to connect it · click a result for the rationale.</>}
        />
      </div>

      {/* Overview / Recommendation — small windows on the same page */}
      {win && (
        <>
          <div onClick={() => setWin(null)} style={{position:"fixed", inset:0, zIndex:55}} />
          <div className="card" style={{position:"fixed", top:120, right:36, width:440, maxHeight:"calc(100vh - 160px)", overflowY:"auto", zIndex:56, boxShadow:"var(--shadow-xl)", animation:"cvPopIn 180ms cubic-bezier(.2,.8,.2,1)"}}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 18px", borderBottom:"1px solid var(--c-line)", position:"sticky", top:0, background:"var(--c-card)"}}>
              <h3 style={{margin:0, fontSize:17}}>{win === "overview" ? "Overview" : "Recommendation"}</h3>
              <button onClick={() => setWin(null)} className="btn btn--icon btn--ghost" aria-label="Close"><Icon name="close" size={15} /></button>
            </div>
            <div style={{padding:"18px"}}>
              {win === "overview" ? (
                <div style={{display:"flex", flexDirection:"column", gap:14}}>
                  <div style={{background:"var(--yellow-500)", borderRadius:12, padding:"18px 20px"}}>
                    <div className="eyebrow" style={{marginBottom:8, color:"rgba(48,48,48,0.6)"}}>Single-minded proposition</div>
                    <p style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize:18, lineHeight:1.35, margin:0, color:"#1a1f36", fontWeight:500}}>"{brief.smp}"</p>
                  </div>
                  <BriefSection title="Background"          body={brief.background} />
                  <BriefSection title="Objective"           body={brief.objective} />
                  <BriefSection title="Audience"            body={brief.audience} />
                  <BriefSection title="Metrics that matter" body={brief.metrics} />
                  <div className="card card--inset" style={{padding:16}}>
                    <div className="eyebrow" style={{marginBottom:10}}>Deliverables · {brief.deliverables.length}</div>
                    <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>{brief.deliverables.map((d, i) => <span key={i} className="pill" style={{height:28, padding:"0 14px", fontSize:11.5}}>{d}</span>)}</div>
                  </div>
                </div>
              ) : (
                <div style={{display:"flex", flexDirection:"column", gap:14}}>
                  <BriefSection title="Creative strategy" body={brief.strategy} />
                  <BriefSection title="Tone"              body={brief.tone} />
                  <BriefSection title="Direction"         body={brief.direction} />
                  <BriefSection title="Mandatories"       body={brief.mandatories} />
                  <div style={{background:"var(--pink-50)", border:"1px solid var(--pink-200)", borderRadius:12, padding:16}}>
                    <div className="eyebrow eyebrow--pink" style={{marginBottom:10}}>What this brief is NOT doing</div>
                    <p style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize:15, lineHeight:1.5, color:"var(--c-ink)", margin:0}}>"{brief.notDoing}"</p>
                  </div>
                  <div className="card card--inset" style={{padding:16, borderLeft:"3px solid var(--yellow-500)"}}>
                    <div className="eyebrow eyebrow--yellow" style={{marginBottom:10}}>Strategic assumptions</div>
                    <ul style={{margin:0, padding:0, listStyle:"none", display:"flex", flexDirection:"column", gap:8}}>
                      {brief.assumptions.map((a, i) => <li key={i} style={{fontSize:13, color:"var(--c-ink)", display:"flex", gap:8, lineHeight:1.5}}><span style={{color:"var(--yellow-700)", fontFamily:"var(--font-mono)"}}>~</span> {a}</li>)}
                    </ul>
                  </div>
                  <div className="card card--inset" style={{padding:16, borderLeft:"3px solid var(--orange-500)"}}>
                    <div className="eyebrow" style={{color:"var(--orange-600)", marginBottom:10}}>Production watchouts</div>
                    <ul style={{margin:0, padding:0, listStyle:"none", display:"flex", flexDirection:"column", gap:8}}>
                      {brief.watchouts.map((w, i) => <li key={i} style={{fontSize:13, color:"var(--c-ink)", display:"flex", gap:8, lineHeight:1.5}}><span style={{color:"var(--orange-600)", fontFamily:"var(--font-mono)"}}>!</span> {w}</li>)}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Floating detail — opens next to the clicked node, not on the side */}
      {pop && (() => {
        const r = pop.rect, W = 384, gap = 14;
        const vw = window.innerWidth, vh = window.innerHeight;
        let left = r ? r.right + gap : vw / 2 - W / 2;
        if (r && left + W > vw - 12) left = r.left - gap - W;
        if (left < 12) left = 12;
        const top = r ? Math.max(12, Math.min(r.top, vh - 360)) : 90;
        return (
          <>
            <div onClick={() => setPop(null)} style={{position:"fixed", inset:0, zIndex:49}} />
            <div className="card" style={{position:"fixed", top, left, width:W, zIndex:50, maxHeight:"calc(100vh - 24px)", overflowY:"auto", boxShadow:"var(--shadow-xl)", animation:"cvPopIn 160ms cubic-bezier(.2,.8,.2,1)"}}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8, padding:"14px 16px 0"}}>
                <span className="eyebrow eyebrow--yellow" style={{paddingTop:3}}>{dEye}</span>
                <div style={{display:"flex", alignItems:"center", gap:2, flexShrink:0}}>
                  {ref.type === "output" && <PinButton kind="outputs" id={ref.id} size={16} />}
                  {ref.type === "specialist" && <PinButton kind="specialists" id={ref.id} size={16} />}
                  <button onClick={() => setPop(null)} className="btn btn--icon btn--ghost" aria-label="Close" style={{height:26, width:26}}><Icon name="close" size={14} /></button>
                </div>
              </div>
              <div style={{padding:"6px 16px 16px"}}>{dBody}</div>
            </div>
          </>
        );
      })()}
    </div>
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
  const [kind, setKind]     = useBrState("all");
  const [query, setQuery]   = useBrState("");
  const [selected, setSelected] = useBrState(null);    /* full-content drawer */

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
    return list.sort((a, b) => new Date(b.run.ended_at || 0) - new Date(a.run.ended_at || 0));
  }, [briefs]);

  const kinds = [...new Set(items.map((i) => i.kind))];

  const q = query.trim().toLowerCase();
  const filtered = items.filter((i) => {
    if (kind !== "all" && i.kind !== kind) return false;
    if (q) {
      const text = `${i.text} ${i.brief.request || ""}`.toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });

  /* Group filtered items by brief. Briefs are the org unit; outputs are
     children. Sort briefs by most-recent activity, sort outputs within a
     brief by completion time (newest first). */
  const briefGroups = React.useMemo(() => {
    const groups = new Map();
    for (const o of filtered) {
      const key = o.brief.id;
      if (!groups.has(key)) {
        groups.set(key, { brief: o.brief, items: [], latest: 0 });
      }
      const g = groups.get(key);
      g.items.push(o);
      const t = new Date(o.run.ended_at || 0).getTime();
      if (t > g.latest) g.latest = t;
    }
    return Array.from(groups.values())
      .map((g) => ({ ...g, items: g.items.sort((a, b) => new Date(b.run.ended_at || 0) - new Date(a.run.ended_at || 0)) }))
      .sort((a, b) => b.latest - a.latest);
  }, [filtered]);

  const openBriefInCanvas = (briefId) => {
    try { sessionStorage.setItem("ci_run_context", JSON.stringify({ mode: "view", briefId, ts: Date.now() })); } catch {}
    go("canvas");
  };

  /* Collapse state — first brief expanded by default, the rest collapsed
     so the page lands quiet. Toggle via header click. */
  const [collapsed, setCollapsed] = useBrState(() => new Set());
  React.useEffect(() => {
    if (briefGroups.length > 1) {
      const initial = new Set(briefGroups.slice(1).map((g) => g.brief.id));
      setCollapsed(initial);
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [briefGroups.length]);
  const toggleCollapsed = (id) => setCollapsed((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allCollapsed = briefGroups.length > 0 && briefGroups.every((g) => collapsed.has(g.brief.id));
  const expandAll  = () => setCollapsed(new Set());
  const collapseAll = () => setCollapsed(new Set(briefGroups.map((g) => g.brief.id)));

  const countFor = (k) => k === "all" ? items.length : items.filter((i) => i.kind === k).length;

  return (
    <div style={{padding:"24px 36px 80px"}}>
      <PageHeader
        eyebrow={brand ? `Workspace · ${brand.name}` : "Workspace"}
        title="Library"
        sub="Every output your Specialists have produced, with the full content. Click an item to read it in full and copy the body."
        right={<>
          <button className="btn btn--ghost btn--sm" onClick={reload}><Icon name="refresh" size={13} /> Reload</button>
          <span style={{fontFamily:"var(--font-mono)", fontSize:12, color:"var(--c-faint)"}}>{items.length} items · {briefs.length} briefs</span>
        </>}
      />

      {error && (
        <div className="card" style={{padding:"10px 14px", marginBottom: 14, borderLeft:"3px solid var(--pink-500)", fontSize: 13}}>
          {error}
        </div>
      )}

      {/* Filter row */}
      <div className="card" style={{padding: 12, marginBottom: 18, display:"flex", gap: 10, alignItems:"center", flexWrap:"wrap"}}>
        <div style={{position:"relative", flex:"1 1 220px", minWidth: 220}}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search outputs and briefs…"
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
        <div style={{display:"flex", gap: 4, flexWrap:"wrap"}}>
          <button onClick={() => setKind("all")}
            className={"pill" + (kind === "all" ? " pill--dark" : "")}
            style={{cursor:"pointer", height: 28, padding:"0 12px"}}>All · {countFor("all")}</button>
          {kinds.map((k) => (
            <button key={k} onClick={() => setKind(k)}
              className={"pill" + (kind === k ? " pill--dark" : "")}
              style={{cursor:"pointer", height: 28, padding:"0 12px"}}>{k} · {countFor(k)}</button>
          ))}
        </div>
        <span style={{marginLeft:"auto", fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--c-faint)"}}>
          {filtered.length} of {items.length}
        </span>
      </div>

      {!loading && items.length === 0 && (
        <div className="card" style={{padding:"56px 32px", textAlign:"center", maxWidth: 540, margin:"40px auto"}}>
          <h2 style={{
            margin:"0 0 14px", fontFamily:"Georgia, serif", fontStyle:"italic",
            fontSize: 28, lineHeight: 1.2, letterSpacing:"-0.005em", fontWeight: 400, color:"var(--c-ink)",
          }}>
            The Library is waiting.
          </h2>
          <p style={{margin:"0 0 22px", fontSize: 14, color:"var(--c-dim)", lineHeight: 1.6}}>
            Every output your crew produces lands here — with the brief that asked for it, the BIO version it was judged against, and the Steward who signed the canon. Run a brief and watch it populate.
          </p>
          <div style={{display:"flex", gap: 10, justifyContent:"center"}}>
            <a href="#/home" className="btn btn--primary">
              <Icon name="sparkles" size={13} /> Start a brief
            </a>
          </div>
        </div>
      )}

      {/* Expand/collapse all — small affordance for power users with many briefs */}
      {briefGroups.length > 1 && (
        <div style={{display:"flex", justifyContent:"flex-end", marginBottom: 8}}>
          <button onClick={allCollapsed ? expandAll : collapseAll}
            className="btn btn--ghost btn--sm"
            style={{height: 26, fontSize: 11.5, padding:"0 10px"}}>
            {allCollapsed ? "Expand all" : "Collapse all"}
          </button>
        </div>
      )}

      {/* Briefs are the organizational unit. Each section has a nice
          editorial title + a chevron to collapse/expand its outputs. */}
      <div style={{display:"flex", flexDirection:"column", gap: 28}}>
        {briefGroups.map((group) => {
          const isCollapsed = collapsed.has(group.brief.id);
          const title = briefTitle(group.brief);
          return (
          <section key={group.brief.id}>
            {/* Click anywhere on the header → toggle. The "Open in canvas"
                button is stopPropagation'd. */}
            <header
              onClick={() => toggleCollapsed(group.brief.id)}
              style={{
                display:"flex", justifyContent:"space-between", alignItems:"flex-end",
                gap: 18, paddingBottom: 12, marginBottom: isCollapsed ? 0 : 14,
                borderBottom: "1px solid var(--c-line)",
                cursor: "pointer", userSelect:"none",
              }}>
              <div style={{display:"flex", alignItems:"flex-start", gap: 10, minWidth: 0, flex: 1}}>
                {/* Chevron — rotates 90° when expanded */}
                <span style={{
                  display:"inline-flex", alignItems:"center", justifyContent:"center",
                  width: 18, height: 18, marginTop: 16, color:"var(--c-faint)",
                  transform: isCollapsed ? "rotate(0deg)" : "rotate(90deg)",
                  transition: "transform 160ms ease",
                  fontFamily:"var(--font-mono)", fontSize: 12, lineHeight: 1,
                }}>›</span>
                <div style={{minWidth: 0, flex: 1}}>
                  <div className="eyebrow" style={{marginBottom: 6, display:"flex", gap: 10, alignItems:"center"}}>
                    <span>{shortDate(group.brief.created_at)}</span>
                    <span style={{color:"var(--c-faint)"}}>·</span>
                    <span>{group.items.length} {group.items.length === 1 ? "output" : "outputs"}</span>
                  </div>
                  <h2 style={{
                    margin: 0,
                    fontFamily: "Georgia, 'Times New Roman', serif",
                    fontStyle: "italic", fontWeight: 400,
                    fontSize: 22, lineHeight: 1.25, color: "var(--c-ink)",
                    letterSpacing: "-0.005em",
                    overflow: "hidden", textOverflow: "ellipsis",
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                  }}>{title}</h2>
                </div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); openBriefInCanvas(group.brief.id); }}
                className="btn btn--ghost btn--sm"
                style={{height: 30, flexShrink: 0}}>
                Open in canvas <Icon name="arrow" size={12} />
              </button>
            </header>

            {/* Outputs grid for this brief — hidden when collapsed */}
            {!isCollapsed && (
            <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(320px, 1fr))", gap: 14}}>
              {group.items.map((o) => {
          const passed  = o.status === "approved";
          const cleaned = humanize(o.text);
          const preview = cleaned.length > 220 ? cleaned.slice(0, 220) + "…" : cleaned;
          const agent = window.CI_AGENTS?.find((a) => a.id === o.run.specialist_id);
          const accent = (agent && window.CI_DEPT_COLORS?.[agent.dept]) || (passed ? "var(--green-500)" : "var(--pink-500)");
          return (
            <button key={o.id} onClick={() => setSelected(o)} className="card" style={{
              padding: 0, textAlign:"left", cursor:"pointer",
              border: "1px solid var(--c-line)", borderLeft: `3px solid ${accent}`,
              display:"flex", flexDirection:"column", overflow:"hidden",
              transition: "transform 120ms ease, box-shadow 120ms ease",
            }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.06)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = ""; }}>
              {/* Designed heading: specialist name + kind pill in corner */}
              <header style={{
                padding:"14px 16px 10px", borderBottom:"1px solid var(--c-line)",
                display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap: 10,
                background:"var(--c-bg)",
              }}>
                <div style={{minWidth: 0, flex: 1}}>
                  <div style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize: 17, color:"var(--c-ink)", lineHeight: 1.2, marginBottom: 2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
                    {agent?.name || specialistName(o.run.specialist_id)}
                  </div>
                  <div style={{fontFamily:"var(--font-mono)", fontSize: 9.5, color:"var(--c-faint)", letterSpacing:"0.1em", textTransform:"uppercase"}}>
                    {agent?.dept || ""}
                  </div>
                </div>
                <div style={{display:"flex", flexDirection:"column", alignItems:"flex-end", gap: 4}}>
                  <span className="pill" style={{
                    height: 22, padding:"0 10px", fontSize: 10.5, letterSpacing:"0.04em",
                    background: accent, color:"#fff", fontWeight: 500,
                  }}>{o.kind}</span>
                  {o.edited && (
                    <span className="pill" style={{
                      height: 18, padding:"0 8px", fontSize: 9.5, letterSpacing:"0.04em",
                      background:"var(--neutral-50)", color:"var(--c-dim)", fontWeight: 500,
                    }}>edited</span>
                  )}
                </div>
              </header>

              {/* Body — image preview OR editorial type */}
              {o.assetUrl ? (
                <div style={{
                  flex: 1, minHeight: 180, background:"var(--neutral-50)",
                  backgroundImage: `url("${o.assetUrl}")`,
                  backgroundSize:"cover", backgroundPosition:"center",
                }} />
              ) : (
                <div style={{padding: 16, flex: 1}}>
                  <p style={{margin: 0, fontFamily:"Georgia, 'Times New Roman', serif", fontStyle:"italic", color:"var(--c-ink)", fontSize: 14, lineHeight: 1.55, whiteSpace:"pre-wrap"}}>
                    {preview || <span style={{color:"var(--c-faint)"}}>(empty)</span>}
                  </p>
                </div>
              )}

              {/* Footer — credits only, no $ */}
              <footer style={{display:"flex", justifyContent:"space-between", padding: "10px 16px", borderTop:"1px dashed var(--c-line-2)", fontFamily:"var(--font-mono)", fontSize: 10, color:"var(--c-faint)", letterSpacing:"0.04em"}}>
                <span>BIO v{o.run.bio_version}{cert ? <> · certified by <span style={{color:"var(--green-600)"}}>{cert.byName}</span></> : <> · <span style={{color:"var(--yellow-700)"}}>uncertified</span></>}</span>
                <span style={{color: passed ? "var(--green-600)" : "var(--pink-500)"}}>{passed ? "approved" : "flagged"} · {agent?.cr ?? "?"} cr</span>
              </footer>
            </button>
          );
              })}
            </div>
            )}
          </section>
        );
        })}
      </div>

      {!loading && briefGroups.length === 0 && items.length > 0 && (
        <div className="card" style={{padding: 32, textAlign:"center", color:"var(--c-faint)", marginTop: 14}}>
          No outputs match the current filter.
        </div>
      )}

      {/* Full-content drawer */}
      {selected && (
        <Drawer open={true} onClose={() => setSelected(null)}
          title={selected.kind} eyebrow={`${specialistName(selected.run.specialist_id)} · BIO v${selected.run.bio_version}`}
          footer={<>
            {selected.assetUrl ? (
              <a className="btn btn--primary btn--sm" href={selected.assetUrl} target="_blank" rel="noreferrer" download>
                <Icon name="files" size={14} /> Download
              </a>
            ) : (
              <button className="btn btn--ghost btn--sm" onClick={async () => { await navigator.clipboard?.writeText(selected.text); setSelected({ ...selected, _copied: true }); setTimeout(() => setSelected((s) => s && { ...s, _copied: false }), 1500); }}>
                <Icon name="files" size={14} /> {selected._copied ? "Copied" : "Copy text"}
              </button>
            )}
            {/* Reuse — start a new brief with this output as upstream context */}
            <button className="btn btn--ghost btn--sm" onClick={() => {
              const agentName = specialistName(selected.run.specialist_id);
              const preview = selected.assetUrl
                ? `[image from ${agentName}]`
                : (selected.text.length > 600 ? selected.text.slice(0, 600) + "…" : selected.text);
              const prefill = `Continuing from ${agentName}'s output:\n\n${preview}\n\n— The next ask is: `;
              try { sessionStorage.setItem("ci_home_prefill", JSON.stringify({ text: prefill, ts: Date.now() })); } catch {}
              setSelected(null);
              go("home");
            }}>
              <Icon name="refresh" size={14} /> Reuse
            </button>
            <button className="btn btn--ghost" onClick={() => setSelected(null)}>Close</button>
          </>}>
          <div className="eyebrow" style={{marginBottom: 6}}>Brief</div>
          <p style={{margin: 0, marginBottom: 18, fontSize: 13.5, color:"var(--c-dim)", lineHeight: 1.55}}>{selected.brief.request || "(no brief text)"}</p>
          <div className="eyebrow" style={{marginBottom: 6}}>Output</div>
          {selected.assetUrl ? (
            <a href={selected.assetUrl} target="_blank" rel="noreferrer"
               style={{display:"block", borderRadius: 10, overflow:"hidden", border:"1px solid var(--c-line)"}}>
              <img src={selected.assetUrl} alt={selected.kind} style={{display:"block", width:"100%", height:"auto"}} />
            </a>
          ) : (
            <div style={{
              padding: 16, background:"var(--c-bg)", border:"1px solid var(--c-line)", borderRadius: 10,
              fontFamily:"Georgia, 'Times New Roman', serif", fontStyle:"italic",
              fontSize: 15.5, lineHeight: 1.65, color:"var(--c-ink)", whiteSpace:"pre-wrap",
            }}>{humanize(selected.text)}</div>
          )}
          {selected.rationale && (
            <>
              <div className="eyebrow" style={{marginTop: 14, marginBottom: 6}}>QA notes</div>
              <p style={{margin: 0, fontSize: 12.5, color:"var(--c-dim)", lineHeight: 1.5, fontStyle:"italic"}}>{selected.rationale}</p>
            </>
          )}
          <div style={{
            marginTop: 16, padding:"10px 12px",
            borderTop:"1px dashed var(--c-line-2)",
            display:"flex", justifyContent:"space-between", gap: 8,
            fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--c-faint)", letterSpacing:"0.04em",
          }}>
            <span>
              Composed by <span style={{color:"var(--c-ink)"}}>{specialistName(selected.run.specialist_id)}</span> ·
              BIO v{selected.run.bio_version}
              {cert ? <> · certified by <span style={{color:"var(--green-600)"}}>{cert.byName}</span> · {shortDate(cert.at)}</> : <> · <span style={{color:"var(--yellow-700)"}}>uncertified</span></>}
            </span>
            <span>{(window.CI_AGENTS?.find((a) => a.id === selected.run.specialist_id)?.cr) ?? "?"} cr</span>
          </div>
        </Drawer>
      )}
    </div>
  );
}

function LibraryOutput({ o, go, flash, isTeam, briefs, menuOpen, onMenu, closeMenu }) {
  const agent = window.CI_AGENTS.find(a => a.id === o.agentId);
  const isUpload = o.kind === "upload";

  const download = () => {
    const blob = new Blob([`${o.type}\n\n${o.body}\n\n— ${o.meta}`], { type:"text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = o.type.replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-|-$/g, "") + ".txt";
    a.click();
    URL.revokeObjectURL(url);
    flash("Downloaded " + o.type);
  };

  const Action = ({ icon, label, onClick, primary }) => (
    <button onClick={onClick}
      className={"btn btn--sm " + (primary ? "btn--ghost" : "btn--ghost")}
      style={{height:28, padding:"0 9px", fontSize:11.5, gap:5}}>
      <Icon name={icon} size={13} /> {label}
    </button>
  );

  return (
    <div className="card" style={{padding:16, display:"flex", flexDirection:"column", gap:10, position:"relative"}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8}}>
        <span className="eyebrow eyebrow--yellow" style={{maxWidth:"62%"}}>{o.type}</span>
        <div style={{display:"flex", alignItems:"center", gap:6}}>
          {o.status && <StatusPill status={o.status} />}
          <PinButton kind="outputs" id={o.id} />
        </div>
      </div>

      <p style={{
        margin:0, fontSize:13.5, lineHeight:1.5, color:"var(--c-dim)",
        display:"-webkit-box", WebkitLineClamp:3, WebkitBoxOrient:"vertical", overflow:"hidden",
      }}>{o.body}</p>

      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", gap:8,
        fontFamily:"var(--font-mono)", fontSize:10.5, color:"var(--c-faint)", letterSpacing:"0.03em"}}>
        <span>{isUpload ? "Client upload" : (agent ? agent.name : "Brandolph")}</span>
        <span>{o.meta}</span>
      </div>

      {/* Actions */}
      <div style={{display:"flex", flexWrap:"wrap", gap:6, paddingTop:10, borderTop:"1px dashed var(--c-line-2)"}}>
        <Action icon="download" label="Download" onClick={download} primary />
        {!isUpload && <Action icon="refresh" label="Reuse" onClick={() => flash("Saved as a starting point for a new brief")} />}
        <div style={{position:"relative"}}>
          <Action icon="plus" label="Add to project" onClick={onMenu} />
          {menuOpen && (
            <>
              <div onClick={closeMenu} style={{position:"fixed", inset:0, zIndex:40}} />
              <div style={{
                position:"absolute", top:"calc(100% + 4px)", left:0, zIndex:41, minWidth:220,
                background:"var(--c-card)", border:"1px solid var(--c-line)", borderRadius:10,
                boxShadow:"var(--shadow-lg)", padding:6,
              }}>
                <div className="eyebrow" style={{padding:"6px 8px"}}>Add to project</div>
                {briefs.filter(b => b.id !== o.briefId).map(b => (
                  <button key={b.id} onClick={() => { closeMenu(); flash("Added to “" + b.title + "”"); }}
                    style={{display:"block", width:"100%", textAlign:"left", border:"none", background:"transparent",
                      padding:"8px 8px", borderRadius:7, fontSize:13, color:"var(--c-ink)", cursor:"pointer"}}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--neutral-50)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    {b.title}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        {!isUpload && <Action icon="craft" label="Send to polish" onClick={() => { flash("Sent to Humans for finishing"); go("craft"); }} />}
        {!isUpload && <Action icon="sparkles" label="Revise" onClick={() => flash("Brandolph is revising this — check back shortly")} />}
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

Object.assign(window, { BriefsLibrary, BriefDetail, SpecialistsDirectory, CanvasView, Library, SpecialistAuthor, BriefBoard });
