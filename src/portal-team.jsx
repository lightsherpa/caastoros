import React from "react";
import { useLocale } from "./lib/i18n.js";
import { apiFetch } from "./lib/supabase-browser.js";
const { BrandolphDot, Confidence, Counter, Icon, ModelChip, PageHeader, SlaHeat, StatusPill } = window;
/* Team portal — queue, job workspace, capacity, clients, earnings. */

const { useState: useTState, useEffect: useTEffect } = React;

/* ════════════════════════════════════════════════════════════════ */
/* Steward jobs hooks — fetch real data from /api/steward/jobs       */

function useStewardJobs() {
  const [data, setData] = useTState({ jobs: null, you: null, error: null, loading: true });
  const reload = async () => {
    setData(d => ({ ...d, loading: true, error: null }));
    try {
      const res = await apiFetch("/api/steward/jobs");
      if (res.status === 403) { setData({ jobs: [], you: null, error: "Steward role required. Run: EMAIL=<your> npm run grant:steward", loading: false }); return; }
      if (!res.ok) { setData({ jobs: [], you: null, error: `HTTP ${res.status}`, loading: false }); return; }
      const json = await res.json();
      setData({ jobs: json.jobs || [], you: json.you, error: null, loading: false });
    } catch (e) {
      setData({ jobs: [], you: null, error: e?.message || String(e), loading: false });
    }
  };
  useTEffect(() => { reload(); }, []);
  return { ...data, reload };
}

function useStewardJob(jobId) {
  const empty = { job: null, sources: [], you: null, focus: [], rubric: null, autoSignals: null };
  const [data, setData] = useTState({ ...empty, error: null, loading: true });
  const reload = async () => {
    if (!jobId) { setData({ ...empty, error: "No job id", loading: false }); return; }
    setData(d => ({ ...d, loading: true, error: null }));
    try {
      const res = await apiFetch(`/api/steward/jobs/${jobId}`);
      if (!res.ok) { setData({ ...empty, error: `HTTP ${res.status}`, loading: false }); return; }
      const json = await res.json();
      setData({
        job: json.job, sources: json.sources || [], you: json.you || null, focus: json.focus || [],
        rubric: json.rubric || null, autoSignals: json.autoSignals || null, error: null, loading: false,
      });
    } catch (e) {
      setData({ ...empty, error: e?.message || String(e), loading: false });
    }
  };
  useTEffect(() => { reload(); }, [jobId]);
  return { ...data, reload };
}

function relativeTime(iso) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/* ════════════════════════════════════════════════════════════════ */
/* JOB QUEUE                                                          */

/* TeamQueue — real Steward queue.
   Pulls from /api/steward/jobs. Each job is a BIO certification waiting
   for a senior human (rev-2 §5). Clicking a row opens the review screen
   (TeamJob) where the Steward reads the candidate BIO + sources and
   submits a certification.                                              */
function TeamQueue({ go }) {
  const { t } = useLocale();
  const { jobs, you, error, loading, reload } = useStewardJobs();
  const [filter, setFilter] = useTState("all");

  const list = (jobs || []).filter(j => {
    if (filter === "all") return true;
    if (filter === "mine") return you && j.assigned_to === you.id;
    if (filter === "unassigned") return !j.assigned_to;
    return j.status === filter;
  });

  const mineCount = (jobs || []).filter(j => you && j.assigned_to === you.id && j.status !== "completed").length;
  const queuedCount = (jobs || []).filter(j => j.status === "queued").length;
  const reviewCount = (jobs || []).filter(j => j.status === "in_review").length;
  const overrideCount = (jobs || []).filter(j => j.override_reason).length;

  return (
    <div className="tqueue">
      <section className="scroll" style={{padding: "24px 32px 40px", overflowY:"auto"}}>
        <div className="stagger" style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap: 14, marginBottom: 24}}>
          {[
            { kpi: queuedCount,   label:t("team.queued")            },
            { kpi: reviewCount,    label:t("team.inReview")          },
            { kpi: mineCount,      label:t("team.yoursOpen")         },
            { kpi: overrideCount,  label:t("team.capacityOverrides") },
          ].map((s, i) => (
            <div key={i} className="card" style={{padding: 18}}>
              <div className="eyebrow" style={{marginBottom: 6}}>{s.label}</div>
              <div style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontWeight: 500, fontSize: 36, color:"var(--c-ink)", lineHeight: 1}}>
                {typeof s.kpi === "number" ? <Counter to={s.kpi} /> : s.kpi}
              </div>
            </div>
          ))}
        </div>

        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 14}}>
          <h2 style={{fontSize: 20, margin: 0, letterSpacing:"-0.01em"}}>
            {t("team.stewardQueue")} · {loading ? "…" : list.length}
          </h2>
          <div style={{display:"flex", gap: 6, flexWrap:"wrap", alignItems:"center"}}>
            {[["all",t("team.filterAll")],["queued",t("team.queued")],["in_review",t("team.inReview")],["pending_lead_review",t("team.filterPendingLead")],["unassigned",t("team.unassigned")],["mine",t("team.filterMine")]].map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)}
                className={"pill" + (filter === k ? " pill--dark" : "")}
                style={{cursor:"pointer", height: 28, padding:"0 12px"}}>{l}</button>
            ))}
            <button onClick={reload} className="btn btn--ghost btn--sm" style={{height: 28}} title={t("team.reload")}>
              <Icon name="refresh" size={13} />
            </button>
          </div>
        </div>

        {error && (
          <div className="card" style={{padding: 14, marginBottom: 14, borderLeft:"3px solid var(--pink-500)", background:"var(--pink-50, rgba(244,143,177,0.10))"}}>
            <div style={{fontSize: 13, color:"var(--c-ink)"}}>{error}</div>
          </div>
        )}

        <div className="card" style={{padding: 0, overflow:"hidden"}}>
          <table style={{width:"100%", borderCollapse:"collapse", fontSize: 13}}>
            <thead>
              <tr style={{background:"var(--c-bg)", borderBottom:"1px solid var(--c-line)"}}>
                {[t("team.colBrand"),t("team.colKind"),t("team.queued"),t("team.colStatus"),t("team.colAssignee"),""].map((h, i) => (
                  <th key={i} style={{textAlign:"left", padding:"10px 14px", fontFamily:"var(--font-mono)", fontSize: 10.5, color:"var(--c-faint)", letterSpacing:"0.1em", textTransform:"uppercase", fontWeight: 500}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="stagger">
              {!loading && list.length === 0 && (
                <tr><td colSpan={6} style={{padding: 28, textAlign:"center", color:"var(--c-faint)", fontSize: 13}}>
                  {t("team.queueEmpty")} <code style={{fontFamily:"var(--font-mono)", fontSize:12}}>npm run test:discovery</code>
                </td></tr>
              )}
              {list.map((j, i) => {
                const mine = you && j.assigned_to === you.id;
                const unassigned = !j.assigned_to;
                let borderLeft = "none";
                if (j.override_reason) borderLeft = "2px solid var(--pink-500)";
                else if (mine) borderLeft = "2px solid var(--yellow-500)";
                else if (unassigned) borderLeft = "2px solid var(--mint-500)";
                const brandName = j.brand?.name || t("team.brandFallback");
                const initial = brandName[0]?.toUpperCase() || "?";
                return (
                  <tr key={j.id} onClick={() => go("team-job/" + j.id)} style={{
                    borderBottom: i < list.length - 1 ? "1px solid var(--c-line)" : "none",
                    cursor:"pointer", borderLeft,
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--neutral-50)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <td style={{padding:"12px 14px"}}>
                      <div style={{display:"flex", alignItems:"center", gap: 8}}>
                        <div style={{width: 22, height: 22, borderRadius:5, background:"var(--neutral-900)", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"var(--font-mono)", fontSize: 11, fontWeight: 600}}>{initial}</div>
                        <div>
                          <div style={{fontSize: 13, color:"var(--c-ink)"}}>{brandName}</div>
                          {j.brand?.url && <div style={{fontSize: 11, color:"var(--c-faint)", fontFamily:"var(--font-mono)"}}>{j.brand.url}</div>}
                        </div>
                      </div>
                    </td>
                    <td style={{padding:"12px 14px"}}>
                      <span className="pill" style={{height:22, padding:"0 9px", fontSize:11}}>{j.kind}</span>
                      {j.override_reason && <span className="pill" style={{height:22, padding:"0 9px", fontSize:11, marginLeft: 6, background:"var(--pink-50, rgba(244,143,177,0.16))", color:"var(--pink-500)"}}>{j.override_reason}</span>}
                    </td>
                    <td style={{padding:"12px 14px", color:"var(--c-faint)", fontSize: 12}}>{relativeTime(j.queued_at)}</td>
                    <td style={{padding:"12px 14px"}}><StatusPill status={j.status === "in_review" ? "review" : j.status === "queued" ? "unassigned" : j.status === "pending_lead_review" ? "review" : j.status} /></td>
                    <td style={{padding:"12px 14px"}}>
                      {mine ? (
                        <span style={{fontSize: 12.5, color:"var(--c-ink)", fontWeight:500}}>{t("team.you")}</span>
                      ) : j.assigned_to ? (
                        <span style={{fontSize: 12.5, color:"var(--c-dim)"}}>{t("team.assigned")}</span>
                      ) : (
                        <span style={{fontSize: 12.5, color:"var(--c-faint)"}}>{t("team.unassigned")}</span>
                      )}
                    </td>
                    <td style={{padding:"12px 8px"}}><Icon name="arrow" size={14} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <aside className="tqueue-right scroll" style={{borderLeft:"1px solid var(--c-line)", background:"var(--c-card)", overflowY:"auto"}}>
        <div style={{padding: "20px"}}>
          <div className="eyebrow" style={{marginBottom: 12}}>{t("team.you")}</div>
          <div className="card" style={{padding: 14, marginBottom: 18}}>
            {you ? (
              <>
                <div style={{fontSize: 14, fontWeight: 500, color:"var(--c-ink)", marginBottom: 4}}>{you.name}</div>
                <div style={{display:"flex", gap: 6, flexWrap:"wrap"}}>
                  {(you.roles || []).map(r => (
                    <span key={r} className="pill" style={{height: 20, padding:"0 8px", fontSize: 10.5, letterSpacing:"0.04em"}}>{r}</span>
                  ))}
                </div>
              </>
            ) : (
              <div style={{fontSize: 12, color:"var(--c-faint)"}}>{t("team.notSteward")}<code>EMAIL=you npm run grant:steward</code></div>
            )}
          </div>

          <div className="eyebrow" style={{marginBottom: 12}}>{t("team.aboutJobs")}</div>
          <div style={{fontSize: 12.5, color:"var(--c-dim)", lineHeight: 1.55}}>
            {t("team.aboutJobsBody")}<em>"{t("team.certifiedByName", { name: you?.first_name || "Marina" })}"</em>.
            <div style={{marginTop: 12, fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--c-faint)"}}>rev-2 §5 · P1.5</div>
          </div>
        </div>
      </aside>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* ACTIVE JOB WORKSPACE                                              */

/* ───── Editable BIO controls (Steward review screen) ─────────────
   Each field is always editable — the Steward IS the editor. No
   separate "edit mode" toggle. Changes flow up via onChange; the
   parent TeamJob keeps the patched payload in state and sends it
   as `bioPatch` when the Steward certifies. */

function EditableText({ label, value, onChange, placeholder, multiline = true, accent = null }) {
  const eyebrowClass = accent === "pink" ? "eyebrow eyebrow--pink" : accent === "yellow" ? "eyebrow eyebrow--yellow" : "eyebrow";
  return (
    <div style={{marginBottom: 14}}>
      <div className={eyebrowClass} style={{marginBottom: 4}}>{label}</div>
      {multiline ? (
        <textarea
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || "—"}
          rows={Math.max(1, Math.min(6, String(value ?? "").split("\n").length))}
          style={{
            width: "100%", minHeight: 32, padding: "6px 10px",
            border: "1px solid transparent", borderRadius: 6,
            fontFamily: "inherit", fontSize: 13.5, color: "var(--c-ink)",
            lineHeight: 1.5, background: "transparent", resize: "vertical",
            outline: "none",
          }}
          onFocus={(e) => { e.target.style.background = "var(--c-bg)"; e.target.style.borderColor = "var(--c-line)"; }}
          onBlur={(e)  => { e.target.style.background = "transparent"; e.target.style.borderColor = "transparent"; }}
        />
      ) : (
        <input
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || "—"}
          style={{
            width: "100%", height: 32, padding: "0 10px",
            border: "1px solid transparent", borderRadius: 6,
            fontFamily: "inherit", fontSize: 13.5, color: "var(--c-ink)",
            background: "transparent", outline: "none",
          }}
          onFocus={(e) => { e.target.style.background = "var(--c-bg)"; e.target.style.borderColor = "var(--c-line)"; }}
          onBlur={(e)  => { e.target.style.background = "transparent"; e.target.style.borderColor = "transparent"; }}
        />
      )}
    </div>
  );
}

function EditableChipList({ label, value, onChange, placeholder, strike = false, accent = null }) {
  const { t } = useLocale();
  const ph = placeholder ?? t("team.addGeneric");
  const [draft, setDraft] = useTState("");
  const list = Array.isArray(value) ? value : [];
  const commit = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...list, v]);
    setDraft("");
  };
  const remove = (i) => onChange(list.filter((_, idx) => idx !== i));
  const eyebrowClass = accent === "pink" ? "eyebrow eyebrow--pink" : accent === "yellow" ? "eyebrow eyebrow--yellow" : "eyebrow";
  const pillBg   = strike ? "var(--pink-50, rgba(244,143,177,0.12))" : "var(--neutral-50)";
  const pillCol  = strike ? "var(--pink-700, var(--pink-500))" : "var(--c-ink)";
  const pillTd   = strike ? "line-through" : "none";
  return (
    <div style={{marginBottom: 14}}>
      <div className={eyebrowClass} style={{marginBottom: 6}}>{label}</div>
      <div style={{display:"flex", flexWrap:"wrap", gap: 5, alignItems:"center"}}>
        {list.map((v, i) => (
          <span key={i} className="pill" style={{
            height: 24, padding:"0 4px 0 10px", fontSize:11.5,
            background: pillBg, color: pillCol, textDecoration: pillTd,
            display:"inline-flex", alignItems:"center", gap: 4,
          }}>
            <span>{String(v)}</span>
            <button type="button" onClick={() => remove(i)} aria-label={t("team.removeItem", { item: v })}
              style={{border:"none", background:"transparent", cursor:"pointer", color:"inherit", opacity: 0.55, lineHeight: 1, padding:"2px 4px"}}
              onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
              onMouseLeave={(e) => e.currentTarget.style.opacity = 0.55}>×</button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } e.stopPropagation(); }}
          onBlur={() => draft.trim() && commit()}
          placeholder={ph}
          style={{
            height: 24, padding:"0 8px", borderRadius: 999,
            border: "1px dashed var(--c-line-2)", background: "transparent",
            fontSize: 11.5, fontFamily: "inherit", color: "var(--c-ink)",
            outline: "none", minWidth: 80,
          }}
        />
      </div>
    </div>
  );
}

function EditablePalette({ value, onChange }) {
  const { t } = useLocale();
  const list = Array.isArray(value) ? value : [];
  const update = (i, patch) => onChange(list.map((c, idx) => idx === i ? { ...c, ...patch } : c));
  const remove = (i) => onChange(list.filter((_, idx) => idx !== i));
  const add    = () => onChange([...list, { hex: "#1F1A14", name: "" }]);
  return (
    <div style={{marginBottom: 14}}>
      <div className="eyebrow" style={{marginBottom: 6}}>{t("team.palette")}</div>
      <div style={{display:"flex", flexWrap:"wrap", gap: 8}}>
        {list.map((c, i) => (
          <div key={i} style={{display:"flex", alignItems:"center", gap: 6, padding: 4, border:"1px solid var(--c-line)", borderRadius: 8}}>
            <input type="color" value={c.hex || "#000000"} onChange={(e) => update(i, { hex: e.target.value })}
              style={{width: 28, height: 28, border:"none", padding: 0, background:"transparent", cursor:"pointer", borderRadius: 4}} />
            <input value={c.name || ""} onChange={(e) => update(i, { name: e.target.value })}
              placeholder={t("team.namePlaceholder")}
              style={{width: 80, border:"none", outline:"none", fontSize: 12, fontFamily:"inherit", background:"transparent", color:"var(--c-ink)"}} />
            <button type="button" onClick={() => remove(i)} aria-label={t("team.removeColor")}
              style={{border:"none", background:"transparent", cursor:"pointer", color:"var(--c-faint)", padding:"0 4px"}}>×</button>
          </div>
        ))}
        <button type="button" onClick={add}
          style={{height: 36, padding:"0 12px", border:"1px dashed var(--c-line-2)", borderRadius: 8, background:"transparent", cursor:"pointer", fontSize: 12, color:"var(--c-dim)"}}>
          {t("team.addColor")}
        </button>
      </div>
    </div>
  );
}

/* AddReferencePanel — lets the Steward add an extra URL source or
   upload a file (PDF / image / doc) directly from the review screen.
   Files land in the `bio-sources` Storage bucket and write rows to
   uploads + bio_sources. */
function AddReferencePanel({ brandId, onAdded }) {
  const { t } = useLocale();
  const [bucket, setBucket] = useTState("foundations");
  const [url, setUrl] = useTState("");
  const [busy, setBusy] = useTState(false);
  const [err, setErr] = useTState(null);
  const [info, setInfo] = useTState(null);
  const fileRef = React.useRef(null);

  const reset = () => { setUrl(""); setErr(null); };

  const submitUrl = async () => {
    if (!url.trim()) return;
    setBusy(true); setErr(null); setInfo(null);
    try {
      const res = await apiFetch(`/api/bios/${brandId}/sources`, {
        method: "POST",
        body: JSON.stringify({ sources: [{ kind: "url_reference", bucket, src: url.trim() }] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setInfo(t("team.addedUrlTo", { bucket }));
      reset();
      onAdded && onAdded();
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(false); }
  };

  const submitFile = async (file) => {
    if (!file) return;
    setBusy(true); setErr(null); setInfo(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("bucket", bucket);
      /* apiFetch sets Content-Type to JSON by default — drop the JSON
         body hint here since FormData sets multipart boundaries itself. */
      const res = await apiFetch(`/api/bios/${brandId}/sources/upload`, {
        method: "POST",
        body: fd,
        headers: {},                                /* let browser set multipart Content-Type */
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setInfo(t("team.uploadedTo", { name: file.name, bucket }));
      if (fileRef.current) fileRef.current.value = "";
      onAdded && onAdded();
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div style={{padding: 16, border:"1px dashed var(--c-line-2)", borderRadius: 10, background:"var(--c-bg)", marginTop: 14}}>
      <div className="eyebrow" style={{marginBottom: 8}}>{t("team.addReference")}</div>
      <div style={{display:"flex", gap: 4, marginBottom: 10}}>
        {[["foundations",t("team.bucketFoundations")],["visual",t("team.bucketVisual")],["voice",t("team.bucketVoice")]].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setBucket(k)}
            className={"pill" + (bucket === k ? " pill--dark" : "")}
            style={{cursor:"pointer", height: 22, padding:"0 9px", fontSize: 11}}>{l}</button>
        ))}
      </div>

      <div style={{display:"flex", gap: 6, marginBottom: 8}}>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitUrl(); } e.stopPropagation(); }}
          disabled={busy}
          placeholder={t("team.pasteUrl")}
          style={{flex: 1, height: 30, padding:"0 10px", border:"1px solid var(--c-line)", borderRadius: 6, fontSize: 12, fontFamily:"inherit", background:"var(--c-card)", outline:"none"}}
        />
        <button type="button" onClick={submitUrl} disabled={busy || !url.trim()}
          className="btn btn--ghost btn--sm" style={{height: 30}}>{t("team.addUrl")}</button>
      </div>

      <label style={{display:"flex", alignItems:"center", gap: 8, fontSize: 12, color:"var(--c-dim)", cursor:"pointer"}}>
        <input ref={fileRef} type="file" disabled={busy}
          accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.md,.doc,.docx"
          onChange={(e) => submitFile(e.target.files?.[0])}
          style={{flex: 1, fontSize: 12}}
        />
      </label>
      <div style={{fontSize: 10.5, color:"var(--c-faint)", marginTop: 6}}>{t("team.fileHint")}</div>

      {err  && <div style={{marginTop: 8, padding:"6px 10px", background:"var(--pink-50, rgba(244,143,177,0.12))", color:"var(--pink-700, var(--pink-500))", borderRadius: 6, fontSize: 11.5}}>{err}</div>}
      {info && <div style={{marginTop: 8, padding:"6px 10px", background:"var(--green-50, rgba(127,163,122,0.16))", color:"var(--green-600)", borderRadius: 6, fontSize: 11.5}}>{info}</div>}
    </div>
  );
}

function EditableTypeList({ value, onChange }) {
  const { t } = useLocale();
  const list = Array.isArray(value) ? value : [];
  const update = (i, patch) => onChange(list.map((ty, idx) => idx === i ? { ...ty, ...patch } : ty));
  const remove = (i) => onChange(list.filter((_, idx) => idx !== i));
  const add    = () => onChange([...list, { kind: "Body", family: "" }]);
  return (
    <div style={{marginBottom: 14}}>
      <div className="eyebrow" style={{marginBottom: 6}}>{t("team.typography")}</div>
      <div style={{display:"flex", flexDirection:"column", gap: 6}}>
        {list.map((ty, i) => (
          <div key={i} style={{display:"flex", alignItems:"center", gap: 8}}>
            <input value={ty.kind || ""} onChange={(e) => update(i, { kind: e.target.value })}
              placeholder={t("team.typeKindPlaceholder")}
              style={{width: 130, height: 28, padding:"0 10px", border:"1px solid var(--c-line)", borderRadius: 6, fontSize: 12.5, fontFamily:"inherit", background:"var(--c-card)", outline:"none"}} />
            <input value={ty.family || ""} onChange={(e) => update(i, { family: e.target.value })}
              placeholder={t("team.typeFamilyPlaceholder")}
              style={{flex: 1, height: 28, padding:"0 10px", border:"1px solid var(--c-line)", borderRadius: 6, fontSize: 12.5, fontFamily:"inherit", background:"var(--c-card)", outline:"none"}} />
            <button type="button" onClick={() => remove(i)} aria-label={t("team.removeTypeface")}
              style={{border:"none", background:"transparent", cursor:"pointer", color:"var(--c-faint)", padding:"0 6px"}}>×</button>
          </div>
        ))}
        <button type="button" onClick={add}
          style={{alignSelf:"flex-start", height: 28, padding:"0 12px", border:"1px dashed var(--c-line-2)", borderRadius: 6, background:"transparent", cursor:"pointer", fontSize: 12, color:"var(--c-dim)"}}>
          {t("team.addTypeface")}
        </button>
      </div>
    </div>
  );
}

/* RubricPanel — the Steward scores each human criterion 0–4 (anchored) with a
   confidence. Auto criteria (coverage, grounding) are computed from the BIO's
   signals and shown read-only. The rubric ENGINE decides the band + decision
   from these scores server-side — the reviewer scores, the rubric decides. */
function RubricPanel({ rubric, autoSignals, scores, setScores }) {
  const { t } = useLocale();
  const ANCHORS = [t("team.anchorAbsent"), t("team.anchorWeak"), t("team.anchorAdequate"), t("team.anchorStrong"), t("team.anchorExemplary")];
  const CONF_OPTS = [[t("team.confLow"), 0], [t("team.confMed"), 1], [t("team.confHigh"), 2]];
  if (!rubric?.criteria) return null;
  const human = rubric.criteria.filter((c) => c.source === "human");
  const auto  = rubric.criteria.filter((c) => c.source === "auto");
  const sig = autoSignals || {};
  const autoPct = (c) => c.signal === "coverage"
    ? Math.round((sig.coverage ?? 0) * 100)
    : Math.round(((sig.avgConf ?? 0) * 0.7 + (sig.sourceDiversity ?? 0) * 0.3) * 100);
  const set = (id, patch) => setScores((s) => ({ ...s, [id]: { ...(s[id] || { confidence: 2 }), ...patch } }));

  return (
    <div style={{padding: 20, borderBottom:"1px solid var(--c-line)"}}>
      <div className="eyebrow eyebrow--yellow" style={{marginBottom: 12}}>{t("team.rubricScore")}</div>
      {auto.map((c) => (
        <div key={c.id} style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"5px 0", fontSize: 12.5}}>
          <span style={{color:"var(--c-dim)"}}>{c.label}{c.gating && <span style={{color:"var(--c-faint)"}}> · {t("team.gateFloor", { floor: c.floor })}</span>}</span>
          <span className="pill" style={{height: 18, padding:"0 7px", fontSize: 10}}>{t("team.autoPct", { pct: autoPct(c) })}</span>
        </div>
      ))}
      {human.map((c) => {
        const cur = scores[c.id] || {};
        return (
          <div key={c.id} style={{padding:"10px 0", borderTop:"1px dashed var(--c-line-2)"}}>
            <div style={{fontSize: 12.5, color:"var(--c-ink)", marginBottom: 6}}>
              {c.label}
              {c.gating && <span className="pill" style={{marginLeft: 6, height: 16, padding:"0 6px", fontSize: 9, background:"var(--neutral-50)", color:"var(--c-dim)"}}>{t("team.gateFloor", { floor: c.floor })}</span>}
            </div>
            <div style={{display:"flex", gap: 4, marginBottom: 6}}>
              {[0, 1, 2, 3, 4].map((n) => (
                <button key={n} type="button" title={ANCHORS[n]} onClick={() => set(c.id, { score: n })}
                  style={{flex: 1, padding:"5px 0", fontSize: 12, borderRadius: 6, cursor:"pointer",
                    border: cur.score === n ? "1px solid var(--yellow-600)" : "1px solid var(--c-line)",
                    background: cur.score === n ? "var(--yellow-50, rgba(212,175,55,0.16))" : "var(--c-card)",
                    color: cur.score === n ? "var(--yellow-800)" : "var(--c-dim)", fontWeight: cur.score === n ? 600 : 400}}>
                  {n}
                </button>
              ))}
            </div>
            <div style={{display:"flex", gap: 6, alignItems:"center"}}>
              <span style={{fontSize: 10.5, color:"var(--c-faint)"}}>{cur.score != null ? ANCHORS[cur.score] : t("team.notScored")}</span>
              <span style={{marginLeft:"auto", fontSize: 10.5, color:"var(--c-faint)"}}>{t("team.confidence")}</span>
              {CONF_OPTS.map(([lbl, val]) => (
                <button key={val} type="button" onClick={() => set(c.id, { confidence: val })}
                  style={{padding:"2px 7px", fontSize: 10.5, borderRadius: 5, cursor:"pointer", background:"var(--c-card)",
                    border: (cur.confidence ?? 2) === val ? "1px solid var(--c-ink)" : "1px solid var(--c-line)",
                    color: (cur.confidence ?? 2) === val ? "var(--c-ink)" : "var(--c-faint)"}}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* TeamJob — Steward review of a candidate BIO.
   Pulls /api/steward/jobs/:id. The Steward reads the BIO + sources, scores the
   rubric, and submits — the engine computes the decision (approve /
   approve_with_conditions / return_changes / reject). May patch the BIO first. */
function TeamJob({ id, go }) {
  const { t } = useLocale();
  const { job, sources, you, focus, rubric, autoSignals, error, loading, reload } = useStewardJob(id);
  const [notes, setNotes] = useTState("");
  const [edited, setEdited] = useTState(null);                /* edited BIO payload — null until job loads */
  const [scores, setScores] = useTState({});                 /* { C3: {score, confidence}, ... } */
  const [actionItems, setActionItems] = useTState("");       /* one per line → conditions / required_changes */
  const [rejectReason, setRejectReason] = useTState("");
  const [submitting, setSubmitting] = useTState(false);
  const [submitErr, setSubmitErr] = useTState(null);
  const [submitInfo, setSubmitInfo] = useTState(null);

  /* Hydrate the editable copy of the BIO payload whenever the job loads. */
  useTEffect(() => {
    if (job?.bio?.payload) setEdited(JSON.parse(JSON.stringify(job.bio.payload)));
  }, [job?.bio?.id]);

  /* Initialize the scoring form from the active rubric's human criteria. */
  useTEffect(() => {
    if (rubric?.criteria) {
      const init = {};
      rubric.criteria.filter((c) => c.source === "human").forEach((c) => { init[c.id] = { score: null, confidence: 2 }; });
      setScores(init);
    }
  }, [rubric]);

  const humanCriteria = (rubric?.criteria || []).filter((c) => c.source === "human");
  const allScored = humanCriteria.length > 0 && humanCriteria.every((c) => scores[c.id]?.score != null);

  const setPath = (path, value) => {
    setEdited((prev) => {
      const next = prev ? JSON.parse(JSON.stringify(prev)) : {};
      let cur = next;
      for (let i = 0; i < path.length - 1; i++) {
        if (cur[path[i]] == null || typeof cur[path[i]] !== "object") cur[path[i]] = {};
        cur = cur[path[i]];
      }
      cur[path[path.length - 1]] = value;
      return next;
    });
  };

  const isDirty = edited && job?.bio?.payload && JSON.stringify(edited) !== JSON.stringify(job.bio.payload);

  /* Submit the rubric decision. The Steward scores criteria; the engine
     computes approve / approve_with_conditions / return_changes / reject and
     records it to cert_decisions server-side. */
  const submitReview = async () => {
    setSubmitting(true); setSubmitErr(null); setSubmitInfo(null);
    try {
      const reviewerScores = {};
      humanCriteria.forEach((c) => {
        if (scores[c.id]?.score != null) reviewerScores[c.id] = { score: scores[c.id].score, confidence: scores[c.id].confidence ?? 2 };
      });
      const items = actionItems.split("\n").map((s) => s.trim()).filter(Boolean);
      const body = { reviewerScores, notes: notes || null };
      if (items.length) { body.conditions = items; body.required_changes = items; } // server keeps the one the decision needs
      if (rejectReason.trim()) body.reject_reason_code = rejectReason.trim();
      if (isDirty) body.bioPatch = edited; // server creates a new BIO version when present

      const res = await apiFetch(`/api/steward/jobs/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || (json.missingScores ? t("team.scoreEveryCriterion", { list: json.missingScores.join(", ") }) : `HTTP ${res.status}`));

      const gate = (json.gateFailures || []).length ? t("team.gateSuffix", { ids: json.gateFailures.map((g) => g.id).join(", ") }) : "";
      setSubmitInfo(json.needsLeadApproval
        ? t("team.submittedForLead", { decision: json.decision, composite: json.composite, gate })
        : t("team.decisionResult", { decision: json.decision, composite: json.composite, band: json.band, gate, cal: json.needsCalibration ? t("team.calibrationSuffix") : "" }));
      setTimeout(() => go("team"), 1600);
    } catch (e) {
      setSubmitErr(e?.message || String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async () => {
    setSubmitting(true); setSubmitErr(null); setSubmitInfo(null);
    try {
      const res = await apiFetch(`/api/steward/jobs/${id}`, { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setSubmitInfo(t("team.cancelled"));
      setTimeout(() => go("team"), 1000);
    } catch (e) {
      setSubmitErr(e?.message || String(e));
    } finally {
      setSubmitting(false);
    }
  };

  /* Decertify — Lead/super_admin pulls a live certification. */
  const decertify = async () => {
    if (!window.confirm(t("team.confirmDecertify"))) return;
    setSubmitting(true); setSubmitErr(null); setSubmitInfo(null);
    try {
      const res = await apiFetch(`/api/steward/decertify`, { method: "POST", body: JSON.stringify({ brandId: job.brand_id, reason_code: "manual_review", notes: notes || null }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setSubmitInfo(t("team.decertified", { version: json.decertifiedVersion }));
      setTimeout(() => go("team"), 1400);
    } catch (e) {
      setSubmitErr(e?.message || String(e));
    } finally {
      setSubmitting(false);
    }
  };

  /* Lead approval path — for pending_lead_review jobs viewed by a Lead.
     `approve=true` finalizes the cert; `false` sends the job back to the
     original Steward with leadNotes as the reason. */
  const leadReview = async (approve) => {
    setSubmitting(true); setSubmitErr(null); setSubmitInfo(null);
    try {
      const res = await apiFetch(`/api/steward/jobs/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ leadApprove: approve, leadNotes: notes || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setSubmitInfo(approve
        ? t("team.approvedAsLead", { version: json.certifiedVersion })
        : t("team.sentBackRevision")
      );
      setTimeout(() => go("team"), 1100);
    } catch (e) {
      setSubmitErr(e?.message || String(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div style={{padding: 40, textAlign:"center", color:"var(--c-faint)"}}>{t("team.loading")}</div>;
  }
  if (error || !job) {
    return (
      <div style={{padding: 40}}>
        <button onClick={() => go("team")} className="btn btn--link" style={{fontSize: 12, marginBottom: 16}}>
          <Icon name="arrowLeft" size={13} /> {t("team.jobQueue")}
        </button>
        <div className="card" style={{padding: 18, borderLeft:"3px solid var(--pink-500)"}}>
          <div style={{fontSize: 14}}>{error || t("team.jobNotFound")}</div>
        </div>
      </div>
    );
  }

  const bio = job.bio || {};
  const payload = edited || bio.payload || {};
  const isLead = (you?.roles || []).includes("lead_steward");
  const isPendingLead = job.status === "pending_lead_review";
  const sourcesByBucket = {
    foundations: sources.filter(s => s.bucket === "foundations"),
    visual:      sources.filter(s => s.bucket === "visual"),
    voice:       sources.filter(s => s.bucket === "voice"),
    other:       sources.filter(s => !s.bucket),
  };
  const BUCKET_LABEL = {
    foundations: t("team.bucketFoundations"),
    visual:      t("team.bucketVisual"),
    voice:       t("team.bucketVoice"),
    other:       t("team.bucketOther"),
  };
  const completed = job.status === "completed";

  return (
    <div className="tjob" style={{gridTemplateColumns: "minmax(0,1fr) 360px"}}>
      {/* Main — candidate BIO review */}
      <main className="scroll" style={{overflowY:"auto", padding: "20px 28px 40px"}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom: 18}}>
          <div>
            <button onClick={() => go("team")} className="btn btn--link" style={{fontSize: 12, marginBottom: 8}}>
              <Icon name="arrowLeft" size={13} /> {t("team.stewardQueue")}
            </button>
            <div style={{display:"flex", alignItems:"baseline", gap: 10, marginBottom: 4}}>
              <h1 style={{margin: 0, fontSize: 26, letterSpacing:"-0.01em"}}>{job.brand?.name || t("team.brandFallback")}</h1>
              <span className="pill" style={{height: 22, padding:"0 9px", fontSize: 11}}>{job.kind}</span>
              {bio.certified && <span className="pill" style={{height: 22, padding:"0 9px", fontSize: 11, background:"var(--green-50, rgba(127,163,122,0.16))", color:"var(--green-600)"}}>{t("team.certifiedV", { version: bio.version })}</span>}
              {job.override_reason && <span className="pill" style={{height: 22, padding:"0 9px", fontSize: 11, background:"var(--pink-50, rgba(244,143,177,0.16))", color:"var(--pink-500)"}}>{job.override_reason}</span>}
            </div>
            <div style={{fontSize: 12.5, color:"var(--c-dim)", fontFamily:"var(--font-mono)"}}>
              {job.brand?.url} · {t("team.queuedRel", { rel: relativeTime(job.queued_at) })} · {t("team.bioV", { version: bio.version })}
            </div>
          </div>
        </div>

        <div className="card" style={{padding: 22}}>
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 14}}>
            <div className="eyebrow eyebrow--yellow">{t("team.candidateBio", { version: bio.version })}{isDirty && <span style={{marginLeft: 8, color:"var(--yellow-700)"}}>{t("team.editedTag")}</span>}</div>
            {isDirty && <button type="button" onClick={() => setEdited(JSON.parse(JSON.stringify(bio.payload || {})))} className="btn btn--link" style={{fontSize: 11}}>{t("team.resetEdits")}</button>}
          </div>

          <EditableText  label={t("team.fldPositioning")} value={payload.identity?.positioning} onChange={(v) => setPath(["identity","positioning"], v)} placeholder={t("team.phPositioning")} />
          <EditableText  label={t("team.fldCategory")} value={payload.identity?.category} onChange={(v) => setPath(["identity","category"], v)} multiline={false} />
          <EditableChipList label={t("team.fldPillars")} value={payload.identity?.pillars} onChange={(v) => setPath(["identity","pillars"], v)} placeholder={t("team.addPillar")} />

          <hr style={{border:"none", borderTop:"1px dashed var(--c-line-2)", margin:"18px 0"}} />

          <EditableText  label={t("team.fldPrimaryAudience")}   value={payload.audience?.primary}   onChange={(v) => setPath(["audience","primary"], v)} />
          <EditableText  label={t("team.fldSecondaryAudience")} value={payload.audience?.secondary} onChange={(v) => setPath(["audience","secondary"], v)} />
          <EditableChipList label={t("team.fldJtbd")} value={payload.audience?.jtbd}      onChange={(v) => setPath(["audience","jtbd"], v)} placeholder={t("team.addJtbd")} />

          <hr style={{border:"none", borderTop:"1px dashed var(--c-line-2)", margin:"18px 0"}} />

          <EditableText label={t("team.fldVoiceRegister")} value={payload.voice?.register} onChange={(v) => setPath(["voice","register"], v)} multiline={false} />
          <EditableText label={t("team.fldRhythm")}          value={payload.voice?.rhythm}   onChange={(v) => setPath(["voice","rhythm"], v)} />
          <EditableChipList label={t("team.fldSignatureMoves")} value={payload.voice?.signatures} onChange={(v) => setPath(["voice","signatures"], v)} placeholder={t("team.addSignature")} />
          <EditableChipList label={t("team.fldForbiddenWords")} value={payload.voice?.forbidden}  onChange={(v) => setPath(["voice","forbidden"], v)} placeholder={t("team.addForbidden")} strike accent="pink" />

          <hr style={{border:"none", borderTop:"1px dashed var(--c-line-2)", margin:"18px 0"}} />

          <EditableText label={t("team.fldNorthStar")}    value={payload.goals?.northStar} onChange={(v) => setPath(["goals","northStar"], v)} />
          <EditableText label={t("team.fldThisQuarter")}  value={payload.goals?.q2}        onChange={(v) => setPath(["goals","q2"], v)} multiline={false} />
          <EditableText label={t("team.fldNextQuarter")}  value={payload.goals?.q3}        onChange={(v) => setPath(["goals","q3"], v)} multiline={false} />

          <hr style={{border:"none", borderTop:"1px dashed var(--c-line-2)", margin:"18px 0"}} />

          <EditableChipList label={t("team.fldWatchouts")} value={payload.strategic?.watchouts} onChange={(v) => setPath(["strategic","watchouts"], v)} placeholder={t("team.addWatchout")} />
          <EditableChipList label={t("team.fldNotList")} value={payload.strategic?.notList}  onChange={(v) => setPath(["strategic","notList"], v)} placeholder={t("team.addNotList")} />

          <hr style={{border:"none", borderTop:"1px dashed var(--c-line-2)", margin:"18px 0"}} />

          <EditablePalette value={payload.visual?.palette} onChange={(v) => setPath(["visual","palette"], v)} />
          <EditableTypeList value={payload.visual?.type} onChange={(v) => setPath(["visual","type"], v)} />
          <EditableChipList label={t("team.fldImagery")} value={payload.visual?.imagery} onChange={(v) => setPath(["visual","imagery"], v)} placeholder={t("team.addImagery")} />
          <EditableChipList label={t("team.fldVisualAvoid")}      value={payload.visual?.avoid}   onChange={(v) => setPath(["visual","avoid"], v)} placeholder={t("team.addVisualAvoid")} accent="pink" />
        </div>

        <div style={{marginTop: 14, fontSize: 11.5, color:"var(--c-faint)", fontFamily:"var(--font-mono)"}}>
          {t("team.bioEditHint")}
        </div>
      </main>

      {/* Right rail — focus list + sources + actions */}
      <aside className="tjob-right scroll" style={{borderLeft:"1px solid var(--c-line)", background:"var(--c-card)", overflowY:"auto", display:"flex", flexDirection:"column"}}>
        {/* Focus first — where the Steward should look (ranked: gaps, then thin/low-confidence fields) */}
        <div style={{padding: 20, borderBottom:"1px solid var(--c-line)"}}>
          <div className="eyebrow eyebrow--yellow" style={{marginBottom: 12}}>{t("team.focusFirst")} · {focus.length}</div>
          {focus.length === 0 ? (
            <div style={{fontSize: 11.5, color:"var(--c-faint)"}}>{t("team.nothingFlagged")}</div>
          ) : (
            <div style={{display:"flex", flexDirection:"column", gap: 8}}>
              {focus.map((f, i) => {
                const isMissing = f.status === "missing";
                const pillBg  = isMissing ? "var(--pink-50, rgba(244,143,177,0.16))" : "var(--yellow-50, rgba(212,175,55,0.16))";
                const pillCol = isMissing ? "var(--pink-500)" : "var(--yellow-800)";
                const highStakes = typeof f.importance === "number" && f.importance >= 1.0;
                return (
                  <div key={f.field || i} className="card card--inset" style={{padding:"9px 11px"}}>
                    <div style={{display:"flex", alignItems:"center", gap: 6, flexWrap:"wrap", marginBottom: 4}}>
                      <span style={{fontSize: 12.5, color:"var(--c-ink)", fontWeight: 500}}>{f.label || f.field}</span>
                      <span className="pill" style={{height: 18, padding:"0 7px", fontSize: 9.5, letterSpacing:"0.03em", background: pillBg, color: pillCol}}>
                        {isMissing ? t("team.statusMissing") : t("team.statusLowConf")}
                      </span>
                      {typeof f.conf === "number" && (
                        <span style={{fontSize: 10.5, color:"var(--c-dim)", fontFamily:"var(--font-mono)"}}>{f.conf}%</span>
                      )}
                      {highStakes && (
                        <span className="pill" style={{height: 18, padding:"0 7px", fontSize: 9.5, letterSpacing:"0.03em", background:"var(--neutral-50)", color:"var(--c-dim)"}}>{t("team.highStakes")}</span>
                      )}
                    </div>
                    {f.source && (
                      <div style={{fontSize: 10.5, color:"var(--c-faint)", fontFamily:"var(--font-mono)", marginBottom: 3, wordBreak:"break-word"}}>{f.source}</div>
                    )}
                    {f.action && (
                      <div style={{fontSize: 11.5, color:"var(--c-dim)", lineHeight: 1.4}}>{f.action}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div style={{padding: 20, borderBottom:"1px solid var(--c-line)"}}>
          <div className="eyebrow" style={{marginBottom: 12}}>{t("team.sourcesRead")} · {sources.length}</div>
          {Object.entries(sourcesByBucket).map(([bucket, list]) => (
            list.length === 0 ? null : (
              <div key={bucket} style={{marginBottom: 14}}>
                <div className="eyebrow" style={{color:"var(--c-faint)", fontSize: 9.5, marginBottom: 4}}>{BUCKET_LABEL[bucket] || bucket}</div>
                <div style={{display:"flex", flexDirection:"column", gap: 6}}>
                  {list.map(s => (
                    <div key={s.id} className="card card--inset" style={{padding:"8px 10px"}}>
                      <div style={{fontSize: 12, color:"var(--c-ink)", wordBreak:"break-all"}}>
                        {s.raw_ref ? <a href={s.raw_ref} target="_blank" rel="noreferrer" style={{color:"var(--c-ink)"}}>{s.src}</a> : s.src}
                      </div>
                      {s.signals?.title && <div style={{fontSize: 11, color:"var(--c-dim)", marginTop: 2}}>{s.signals.title}</div>}
                      {s.signals?.size && <div style={{fontSize: 10.5, color:"var(--c-faint)", marginTop: 2, fontFamily:"var(--font-mono)"}}>{Math.round(s.signals.size/1024).toLocaleString()} KB · {s.signals.mime || s.signals.ext}</div>}
                      {s.signals?.markdown_chars && <div style={{fontSize: 10.5, color:"var(--c-faint)", marginTop: 2, fontFamily:"var(--font-mono)"}}>{t("team.charsScraped", { chars: s.signals.markdown_chars.toLocaleString() })}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )
          ))}
          <AddReferencePanel brandId={job.brand_id} onAdded={reload} />
        </div>

        {!isPendingLead && !completed && (
          <RubricPanel rubric={rubric} autoSignals={autoSignals} scores={scores} setScores={setScores} />
        )}

        <div style={{padding: 20, flex: 1, display:"flex", flexDirection:"column"}}>
          {isPendingLead && (
            <div style={{marginBottom: 14, padding:"10px 12px", background:"var(--purple-50, rgba(160,140,210,0.10))", borderLeft:"3px solid var(--purple-500)", borderRadius: 6, fontSize: 12.5, color:"var(--c-ink)", lineHeight: 1.5}}>
              <strong>{t("team.pendingLeadReview")}</strong> · {isLead
                ? t("team.pendingLeadIsLead")
                : t("team.pendingLeadNotLead")}
            </div>
          )}

          <div className="eyebrow" style={{marginBottom: 8}}>
            {isPendingLead && isLead ? t("team.leadNotesPrivate") : t("team.certNotesClient")}
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={submitting || completed}
            placeholder={isPendingLead && isLead
              ? t("team.notesPlaceholderLead")
              : t("team.notesPlaceholderCert")}
            rows={6}
            className="input"
            style={{resize:"vertical", fontSize: 13, lineHeight: 1.45, padding: 10}}
          />

          {!isPendingLead && !completed && (
            <>
              <div className="eyebrow" style={{margin:"14px 0 6px"}}>{t("team.conditionsLabel")}</div>
              <textarea
                value={actionItems}
                onChange={(e) => setActionItems(e.target.value)}
                disabled={submitting}
                placeholder={t("team.conditionsPlaceholder")}
                rows={3}
                className="input"
                style={{resize:"vertical", fontSize: 12.5, lineHeight: 1.4, padding: 9}}
              />
              <div className="eyebrow" style={{margin:"12px 0 6px"}}>{t("team.rejectReasonLabel")}</div>
              <input
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                disabled={submitting}
                placeholder={t("team.rejectReasonPlaceholder")}
                className="input"
                style={{fontSize: 12.5, padding: 9}}
              />
            </>
          )}

          {submitErr  && <div style={{marginTop: 12, padding:"8px 10px", background:"var(--pink-50, rgba(244,143,177,0.12))", color:"var(--pink-700, var(--pink-500))", borderRadius: 8, fontSize: 12}}>{submitErr}</div>}
          {submitInfo && <div style={{marginTop: 12, padding:"8px 10px", background:"var(--green-50, rgba(127,163,122,0.16))", color:"var(--green-600)", borderRadius: 8, fontSize: 12}}>{submitInfo}</div>}

          {/* ── Action buttons branch on state + role ─────────────── */}
          {isPendingLead ? (
            isLead ? (
              <div style={{marginTop: 16, display:"flex", gap: 8}}>
                <button onClick={() => leadReview(true)} disabled={submitting} className="btn btn--primary" style={{flex: 1}}>
                  {submitting ? "…" : <>{t("team.approveAsLead")} <Icon name="check" size={13} /></>}
                </button>
                <button onClick={() => { if (window.confirm(t("team.confirmSendBack"))) leadReview(false); }}
                  disabled={submitting} className="btn btn--ghost btn--sm">
                  {t("team.sendBack")}
                </button>
              </div>
            ) : (
              <div style={{marginTop: 16, padding:"10px 12px", background:"var(--c-bg)", borderRadius: 6, fontSize: 12.5, color:"var(--c-dim)", textAlign:"center"}}>
                {t("team.awaitingLead")}
              </div>
            )
          ) : (
            <div style={{marginTop: 16}}>
              <div style={{display:"flex", gap: 8}}>
                <button
                  onClick={submitReview}
                  disabled={submitting || completed || !allScored}
                  className="btn btn--primary"
                  style={{flex: 1}}>
                  {submitting ? "…" : completed ? t("team.alreadyReviewed") : isDirty ? <>{t("team.saveEditsSubmit")} <Icon name="check" size={13} /></> : <>{t("team.submitReview")} <Icon name="check" size={13} /></>}
                </button>
                <button
                  onClick={() => { if (window.confirm(t("team.confirmCancelJob"))) cancel(); }}
                  disabled={submitting || completed}
                  className="btn btn--ghost btn--sm">
                  {t("team.cancel")}
                </button>
              </div>
              {!allScored && !completed && (
                <div style={{marginTop: 8, fontSize: 11, color:"var(--c-faint)"}}>{t("team.scoreAllToSubmit")}</div>
              )}
            </div>
          )}

          <div style={{marginTop: 12, fontSize: 11, color:"var(--c-faint)", lineHeight: 1.5}}>
            {isLead && isPendingLead
              ? <>{t("team.leadHelpA1")}<code>lead_reviewed_by</code>{t("team.leadHelpA2")}<code>certified_by</code>{t("team.leadHelpA3")}</>
              : <>{t("team.rubricHelpB1")}<code>cert_decisions</code>{t("team.rubricHelpB2")}</>}
          </div>

          {bio.certified && isLead && (
            <div style={{marginTop: 18, paddingTop: 14, borderTop:"1px solid var(--c-line)"}}>
              <div className="eyebrow" style={{marginBottom: 6, color:"var(--pink-500)"}}>{t("team.decertify")}</div>
              <button onClick={decertify} disabled={submitting} className="btn btn--ghost btn--sm"
                style={{color:"var(--pink-500)", borderColor:"var(--pink-300, rgba(244,143,177,0.4))"}}>
                {t("team.decertifyThisBio")}
              </button>
              <div style={{marginTop: 6, fontSize: 11, color:"var(--c-faint)", lineHeight: 1.5}}>
                {t("team.decertifyHint")}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}


/* ════════════════════════════════════════════════════════════════ */
/* CAPACITY & SLA DASHBOARD                                          */

function TeamCapacity() {
  const { t } = useLocale();
  const days = [t("team.dayMon"), t("team.dayTue"), t("team.dayWed"), t("team.dayThu"), t("team.dayFri")];
  return (
    <div style={{padding:"24px 36px 60px"}}>
      <PageHeader eyebrow={t("team.capEyebrow")} title={t("team.capTitle")} sub={t("team.capSub")} />

      <div style={{display:"grid", gridTemplateColumns:"2fr 1fr", gap: 22, marginBottom: 30}}>
        <div className="card" style={{padding: 22}}>
          <div className="eyebrow" style={{marginBottom: 16}}>{t("team.teamLoadWeek")}</div>
          <div style={{display:"grid", gridTemplateColumns:"180px repeat(5, 1fr)", gap: 6}}>
            <div></div>
            {days.map(d => <div key={d} className="eyebrow" style={{textAlign:"center"}}>{d}</div>)}
            {window.CI_TEAM.map(t => (
              <React.Fragment key={t.id}>
                <div style={{display:"flex", alignItems:"center", gap: 8, padding: 8}}>
                  <img src={t.photo} alt="" style={{width: 28, height: 28, borderRadius:"50%", objectFit:"cover"}} />
                  <div>
                    <div style={{fontSize: 13, fontWeight: 500}}>{t.name}</div>
                    <div style={{fontSize: 11, color:"var(--c-faint)"}}>{t.role}</div>
                  </div>
                </div>
                {days.map((d, i) => {
                  const load = Math.max(0.1, Math.min(1, t.load + (i - 2) * 0.08 + Math.random() * 0.1));
                  const color = load > 0.85 ? "#FCDDDD" : load > 0.65 ? "#FFE9C0" : load > 0.35 ? "#FFF4D5" : "#E8FBF2";
                  const textColor = load > 0.85 ? "var(--pink-700)" : load > 0.65 ? "var(--orange-600)" : load > 0.35 ? "var(--yellow-800)" : "var(--green-700)";
                  return (
                    <div key={i} style={{
                      background: color, borderRadius: 6, padding:"10px 8px",
                      textAlign:"center", color: textColor,
                      fontFamily:"var(--font-mono)", fontSize: 11, letterSpacing:"0.04em", fontWeight: 500,
                    }}>{Math.round(load * 100)}%</div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="card" style={{padding: 22}}>
          <div className="eyebrow" style={{marginBottom: 14, color:"var(--pink-500)"}}>{t("team.slaRiskJobs")}</div>
          <div style={{display:"flex", flexDirection:"column", gap: 10}}>
            {window.CI_JOBS.filter(j => /overdue/.test(j.sla) || (/^\d+h/.test(j.sla) && parseInt(j.sla) <= 8)).map(j => (
              <div key={j.id} style={{padding: 12, border:"1px solid var(--c-line)", borderRadius: 8, borderLeft:"3px solid var(--pink-500)"}}>
                <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                  <div>
                    <div style={{fontSize: 13, fontWeight: 500}}>{j.client}</div>
                    <div style={{fontSize: 12, color:"var(--c-dim)"}}>{j.type}</div>
                  </div>
                  <SlaHeat text={j.sla} />
                </div>
                <button className="btn btn--ghost btn--sm" style={{marginTop: 10, fontSize: 11}}>{t("team.reassign")}</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap: 22}}>
        <div className="card" style={{padding: 22}}>
          <div className="eyebrow" style={{marginBottom: 14}}>{t("team.dailyThroughput")}</div>
          <div style={{display:"flex", alignItems:"flex-end", gap: 6, height: 140}}>
            {[6,8,5,9,11,4,7,9,12,8,10,9,11,14].map((n, i) => (
              <div key={i} style={{flex:1, height: `${(n/14)*100}%`, background: i >= 12 ? "var(--yellow-500)" : "var(--purple-200)", borderRadius:"3px 3px 0 0"}} title={t("team.jobsCount", { count: n })} />
            ))}
          </div>
          <div style={{display:"flex", justifyContent:"space-between", marginTop: 8, fontFamily:"var(--font-mono)", fontSize: 10, color:"var(--c-faint)"}}>
            <span>{t("team.twoWeeksAgo")}</span>
            <span>{t("team.today")}</span>
          </div>
        </div>

        <div className="card" style={{padding: 22}}>
          <div className="eyebrow" style={{marginBottom: 14}}>{t("team.backlog")}</div>
          <div style={{display:"flex", flexDirection:"column", gap: 8}}>
            {window.CI_JOBS.filter(j => j.status === "unassigned").map(j => (
              <div key={j.id} style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 12px", border:"1px solid var(--c-line)", borderRadius: 8}}>
                <div>
                  <div style={{fontSize: 13, fontWeight: 500}}>{j.client}</div>
                  <div style={{fontSize: 12, color:"var(--c-dim)"}}>{j.type} · {t("team.submittedAt", { when: j.submitted })}</div>
                </div>
                <button className="btn btn--primary btn--sm">{t("team.assign")}</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* CLIENT ROSTER                                                     */

function TeamClients() {
  const { t } = useLocale();
  const clients = [
    { name:"Marés Studio",    bio: 91, tier:"02", active: 4, lifetime: 38, last:"2h ago",   primary:"Marina Reyes" },
    { name:"Plaza Hortelana", bio: 78, tier:"03", active: 2, lifetime: 22, last:"yesterday", primary:"Pere Sallés" },
    { name:"Bandera",         bio: 84, tier:"02", active: 2, lifetime: 31, last:"4h ago",    primary:"Joana Vidal" },
    { name:"Faro Lab",        bio: 66, tier:"02", active: 2, lifetime: 19, last:"yesterday", primary:"Alma Castro" },
    { name:"Olivar Real",     bio: 92, tier:"03", active: 2, lifetime: 44, last:"6h ago",    primary:"Iván Mestres" },
    { name:"Maizal",          bio: 58, tier:"01", active: 1, lifetime: 4,  last:"3h ago",    primary:"Sofía Romero" },
  ];
  return (
    <div style={{padding:"24px 36px 60px"}}>
      <PageHeader eyebrow={t("team.clientsEyebrow")} title={t("team.clientsCount", { count: clients.length })} sub={t("team.clientsSub")} />
      <div className="card" style={{padding: 0, overflow:"hidden"}}>
        <table style={{width:"100%", borderCollapse:"collapse", fontSize: 13}}>
          <thead>
            <tr style={{background:"var(--c-bg)", borderBottom:"1px solid var(--c-line)"}}>
              {[t("team.colBrand"),t("team.colBio"),t("team.colTier"),t("team.colActiveJobs"),t("team.colLifetime"),t("team.colLastActivity"),t("team.colPrimaryContact")].map((h, hi) => (
                <th key={hi} style={{textAlign:"left", padding:"12px 18px", fontFamily:"var(--font-mono)", fontSize:10.5, color:"var(--c-faint)", letterSpacing:"0.1em", textTransform:"uppercase", fontWeight: 500}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="stagger">
            {clients.map((c, i) => (
              <tr key={c.name} style={{borderBottom: i < clients.length - 1 ? "1px solid var(--c-line)" : "none"}}>
                <td style={{padding:"14px 18px"}}>
                  <div style={{display:"flex", alignItems:"center", gap: 10}}>
                    <div style={{width: 28, height: 28, borderRadius: 6, background:"var(--neutral-900)", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"var(--font-mono)", fontWeight:600, fontSize: 12}}>{c.name[0]}</div>
                    <span style={{fontWeight: 500, color:"var(--c-ink)"}}>{c.name}</span>
                  </div>
                </td>
                <td style={{padding:"14px 18px"}}><Confidence value={c.bio} /></td>
                <td style={{padding:"14px 18px"}}><span className="pill pill--yellow">{t("team.tierN", { tier: c.tier })}</span></td>
                <td style={{padding:"14px 18px", fontFamily:"var(--font-mono)"}}>{c.active}</td>
                <td style={{padding:"14px 18px", fontFamily:"var(--font-mono)", color:"var(--c-dim)"}}>{c.lifetime}</td>
                <td style={{padding:"14px 18px", color:"var(--c-faint)"}}>{c.last}</td>
                <td style={{padding:"14px 18px"}}>{c.primary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* MY EARNINGS                                                       */

function TeamMe() {
  const { t } = useLocale();
  const [scope, setScope] = useTState("month");
  return (
    <div style={{padding:"24px 36px 60px"}}>
      <PageHeader
        eyebrow={t("team.meEyebrow")}
        title={t("team.meTitle", { name: "Aitana V." })}
        sub={t("team.meSub")}
        right={
          <div style={{display:"flex", gap: 6}}>
            {[["month",t("team.scopeMonth")],["quarter",t("team.scopeQuarter")],["lifetime",t("team.scopeLifetime")]].map(([k, l]) => (
              <button key={k} onClick={() => setScope(k)} className={"pill" + (scope === k ? " pill--dark" : "")} style={{cursor:"pointer", height:28, padding:"0 12px"}}>{l}</button>
            ))}
          </div>
        }
      />

      <div className="stagger" style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap: 14, marginBottom: 28}}>
        {[
          { label:t("team.statJobsDelivered"), v: 14 },
          { label:t("team.statHoursLogged"),   v: 38 },
          { label:t("team.statAvgSatisfaction"), v:"4.7" },
          { label:t("team.statCreditsEarned"), v:"€1,847" },
        ].map((s, i) => (
          <div key={i} className="card" style={{padding: 20}}>
            <div className="eyebrow" style={{marginBottom: 6}}>{s.label}</div>
            <div style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize: 36, color:"var(--c-ink)", letterSpacing:"-0.01em", fontWeight: 500, lineHeight: 1}}>
              {typeof s.v === "number" ? <Counter to={s.v} /> : s.v}
            </div>
          </div>
        ))}
      </div>

      <div style={{display:"grid", gridTemplateColumns:"2fr 1fr", gap: 22, marginBottom: 28}}>
        <div className="card" style={{padding: 22}}>
          <div className="eyebrow" style={{marginBottom: 14}}>{t("team.hoursLoggedMonth")}</div>
          <div style={{display:"flex", alignItems:"flex-end", gap: 4, height: 160}}>
            {Array.from({length: 28}, (_, i) => 2 + Math.sin(i * 0.4) * 1.5 + Math.random() * 3).map((h, i) => (
              <div key={i} style={{flex:1, height: `${(h/8)*100}%`, background:"var(--yellow-500)", opacity: 0.3 + (i / 28) * 0.7, borderRadius:"2px 2px 0 0"}} />
            ))}
          </div>
        </div>
        <div className="card" style={{padding: 22}}>
          <div className="eyebrow" style={{marginBottom: 14}}>{t("team.topClientsMonth")}</div>
          <div style={{display:"flex", flexDirection:"column", gap: 12}}>
            {[
              { name:"Marés Studio", hrs: 14 },
              { name:"Faro Lab", hrs: 11 },
              { name:"Plaza Hortelana", hrs: 9 },
              { name:"Bandera", hrs: 4 },
            ].map((c, i) => (
              <div key={i}>
                <div style={{display:"flex", justifyContent:"space-between", fontSize: 13, marginBottom: 4}}>
                  <span>{c.name}</span>
                  <span style={{fontFamily:"var(--font-mono)", color:"var(--c-faint)"}}>{c.hrs}h</span>
                </div>
                <div style={{height: 4, background:"var(--neutral-50)", borderRadius: 999, overflow:"hidden"}}>
                  <div style={{height:"100%", width: `${(c.hrs/14)*100}%`, background:"var(--yellow-500)", borderRadius:999}} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{padding: 22}}>
        <div className="eyebrow" style={{marginBottom: 14}}>{t("team.recentDeliveries")}</div>
        <div style={{display:"flex", flexDirection:"column", gap: 6}}>
          {[
            { title:"Hero KV finish · Marés Studio", state:"delivered", time:"38m ago", cr: 220 },
            { title:"Packaging dieline · Faro Lab",    state:"in-progress", time:"yesterday", cr: 700 },
            { title:"Brand guidelines · Olivar Real",  state:"in-progress", time:"3d ago", cr: 650 },
            { title:"Identity finalisation · Plaza",   state:"delivered",  time:"5d ago", cr: 550 },
            { title:"Deck polish · Bandera",            state:"delivered", time:"6d ago", cr: 300 },
          ].map((d, i) => (
            <div key={i} style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 14px", borderRadius: 8, border:"1px solid var(--c-line)"}}>
              <div style={{display:"flex", alignItems:"center", gap: 10}}>
                <span className={"dot-state dot-state--" + (d.state === "delivered" ? "ok" : "running")} />
                <span style={{fontSize: 13.5}}>{d.title}</span>
              </div>
              <div style={{display:"flex", alignItems:"center", gap: 14}}>
                <span style={{fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--c-faint)"}}>{d.time}</span>
                <span className="credit credit--earned">+{d.cr} cr</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* CraftQueue — human polish jobs. Each piece was sent from a brand's canvas
   ("Send to human") with a polish brief. The crafter refines the copy and
   delivers it back onto the card. Pulls /api/craft/queue. */
function CraftQueue() {
  const { t } = useLocale();
  const [data, setData] = useTState({ jobs: null, error: null, loading: true });
  const [drafts, setDrafts] = useTState({});
  const [busy, setBusy] = useTState(null);

  const load = async () => {
    setData((d) => ({ ...d, loading: true }));
    try {
      const res = await apiFetch("/api/craft/queue");
      const json = await res.json();
      if (!res.ok) { setData({ jobs: [], error: json.error || `HTTP ${res.status}`, loading: false }); return; }
      setData({ jobs: json.jobs || [], error: null, loading: false });
    } catch (e) { setData({ jobs: [], error: String(e), loading: false }); }
  };
  useTEffect(() => { load(); }, []);

  const deliver = async (job) => {
    const key = job.outputId + ":" + job.slot;
    const polished = (drafts[key] ?? job.body) || "";
    setBusy(key);
    try {
      await apiFetch("/api/craft/deliver", { method: "PATCH", body: JSON.stringify({ outputId: job.outputId, slot: job.slot, body: polished }) });
      await load();
    } catch (e) {}
    setBusy(null);
  };

  const jobs = data.jobs || [];
  return (
    <div style={{ padding: "24px 28px", maxWidth: 1100, margin: "0 auto" }}>
      <div className="eyebrow eyebrow--yellow" style={{ marginBottom: 6 }}>{t("team.craftEyebrow")}</div>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 6, color: "var(--c-ink)" }}>{t("team.craftTitle")}</h1>
      <p style={{ color: "var(--c-dim)", fontSize: 13.5, marginBottom: 20 }}>
        {t("team.craftSub")}
      </p>
      {data.loading && <div style={{ color: "var(--c-faint)" }}>{t("team.loadingQueue")}</div>}
      {data.error && <div style={{ color: "var(--pink-500)", marginBottom: 16 }}>{data.error}</div>}
      {!data.loading && jobs.length === 0 && (
        <div className="card" style={{ padding: 28, textAlign: "center", color: "var(--c-dim)" }}>
          {t("team.craftEmpty")}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {jobs.map((job) => {
          const key = job.outputId + ":" + job.slot;
          return (
            <div key={key} className="card" style={{ padding: "16px 18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div className="eyebrow" style={{ marginBottom: 2 }}>{job.brand} · {(job.platform || "").toUpperCase()}</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--c-ink)" }}>{job.title || t("team.untitled")}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--c-faint)" }}>{job.briefTitle}</div>
                </div>
                <span className="pill" style={{ height: 22, padding: "0 10px", fontSize: 11 }}>{job.credits} cr</span>
              </div>
              {job.notes && (
                <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 8, background: "var(--c-bg)", border: "1px solid var(--c-line)" }}>
                  <div className="eyebrow eyebrow--yellow" style={{ marginBottom: 4 }}>{t("team.polishBrief")}</div>
                  <div style={{ fontSize: 13, color: "var(--c-ink)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{job.notes}</div>
                </div>
              )}
              <div className="eyebrow" style={{ marginBottom: 4 }}>{t("team.refineIt")}</div>
              <textarea
                value={drafts[key] ?? job.body}
                onChange={(e) => setDrafts((p) => ({ ...p, [key]: e.target.value }))}
                rows={5}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--c-line)", background: "var(--c-card)", fontFamily: "inherit", fontSize: 13.5, lineHeight: 1.55, resize: "vertical", outline: "none", boxSizing: "border-box" }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                <button className="btn btn--primary btn--sm" disabled={busy === key} onClick={() => deliver(job)}>
                  {busy === key ? t("team.delivering") : t("team.deliverPolished")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { TeamQueue, TeamJob, TeamCapacity, TeamClients, TeamMe, CraftQueue });
