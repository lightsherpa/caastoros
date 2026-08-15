import React from "react";
import { useLocale, t as tr } from "./lib/i18n.js";
import { apiFetch, supabase } from "./lib/supabase-browser.js";
import { BrandolphLine } from "./portal-shared.jsx";
const { BrandolphAvatar, BrandolphDot, Confidence, Counter, Icon, Reveal } = window;
/* Discovery (3-step intake) + BIO viewer. */

const { useState: useDState, useEffect: useDEffect } = React;
const SOURCE_FILE_ACCEPT = ".pdf,.doc,.docx,.txt,.md,image/*";

/* useLiveBio — fetches the user's first brand + latest BIO + cert state.
   Polls every `pollMs` while `pendingCert` is true (BIO not yet certified
   by Steward, or no BIO at all yet). Returns { brandId, bio, cert, refresh }. */
function useLiveBio({ pollMs = 6000, brandId: fixedBrandId = null } = {}) {
  const [state, setState] = useDState({ brandId: null, brandName: null, brandUrl: null, bio: null, cert: null, review: null, diff: [], reviewPending: false, focusCount: 0, error: null, loading: true });

  const tick = React.useCallback(async () => {
    try {
      /* Resolve current user's brand. Prefers the workspace switcher's
         selection (from localStorage); falls back to the first brand. RLS
         scopes results to the user's workspaces. */
      const wantedId = fixedBrandId || window.getCurrentBrandId?.();
      let brand = null;
      if (wantedId) {
        const { data } = await supabase.from("brands").select("id, name, url").eq("id", wantedId).maybeSingle();
        brand = data;
      }
      if (fixedBrandId && !brand) {
        setState((s) => ({ ...s, brandId: fixedBrandId, bio: null, cert: null, loading: false, error: "Brand is not available in this workspace" }));
        return;
      }
      if (!brand) {
        const { data: brands, error: bErr } = await supabase
          .from("brands").select("id, name, url").order("created_at", { ascending: true }).limit(1);
        if (bErr) throw bErr;
        brand = brands?.[0];
      }
      if (!brand) { setState((s) => ({ ...s, brandId: null, bio: null, cert: null, loading: false, error: "No brand in workspace" })); return; }
      const res = await apiFetch(`/api/bios/${brand.id}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setState({ brandId: brand.id, brandName: brand.name, brandUrl: brand.url, bio: null, cert: null, review: null, diff: [], focusCount: 0, loading: false, error: j.error || `HTTP ${res.status}` });
        return;
      }
      const { bio, reviewPending, focusCount, review, diff } = await res.json();
      let certInfo = null;
      if (bio?.certified) {
        let certName = "your Brand Steward";
        if (bio.certified_by) {
          const { data: tm } = await supabase.from("team_members").select("first_name, name").eq("id", bio.certified_by).maybeSingle();
          certName = tm?.first_name || tm?.name || certName;
        }
        certInfo = { byName: certName, at: bio.certified_at, notes: bio.steward_notes || null };
      }
      setState({ brandId: brand.id, brandName: brand.name, brandUrl: brand.url, bio, cert: certInfo, review: review || null, diff: Array.isArray(diff) ? diff : [], reviewPending: !!reviewPending, focusCount: Number(focusCount) || 0, loading: false, error: null });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e?.message || String(e) }));
    }
  }, [fixedBrandId]);

  useDEffect(() => {
    let alive = true;
    tick();
    const interval = setInterval(() => { if (alive) tick(); }, pollMs);
    return () => { alive = false; clearInterval(interval); };
  }, [tick, pollMs]);

  return { ...state, refresh: tick };
}

function formatCertDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  } catch { return ""; }
}

/* ════════════════════════════════════════════════════════════════ */
/* DISCOVERY — 3-step Mavity-style intake                            */

function DiscoveryStepper({ step }) {
  const { t } = useLocale();
  const steps = [
    { n:"01", label:t("discovery.stepper.connect") },
    { n:"02", label:t("discovery.stepper.extract") },
    { n:"03", label:t("discovery.stepper.confirm") },
  ];
  return (
    <div style={{display:"flex", alignItems:"center", gap: 12}}>
      {steps.map((s, i) => {
        const isActive = i + 1 === step;
        const isDone = i + 1 < step;
        return (
          <React.Fragment key={s.n}>
            <div style={{display:"flex", alignItems:"center", gap: 10}}>
              <span style={{
                width: 26, height: 26, borderRadius:"50%",
                background: isActive ? "var(--yellow-500)" : isDone ? "var(--green-500)" : "transparent",
                color: isActive ? "var(--c-ink)" : isDone ? "#fff" : "var(--c-faint)",
                border: isActive || isDone ? "none" : "1.5px solid var(--c-line-2)",
                display:"inline-flex", alignItems:"center", justifyContent:"center",
                fontFamily:"var(--font-mono)", fontSize:11, fontWeight:600,
              }}>
                {isDone ? <Icon name="check" size={12} /> : s.n}
              </span>
              <span style={{
                fontSize: 13, fontWeight: isActive ? 500 : 400,
                color: isActive ? "var(--c-ink)" : isDone ? "var(--c-dim)" : "var(--c-faint)",
              }}>{s.label}</span>
            </div>
            {i < 2 && <span style={{height: 1, flex: "0 0 60px", background: isDone ? "var(--green-300)" : "var(--c-line-2)"}} />}
          </React.Fragment>
        );
      })}
      <a href="#/home" className="btn btn--link" style={{marginLeft:"auto", fontSize:12}}>{t("discovery.stepper.skip")}</a>
    </div>
  );
}

/* Three-bucket source intake drop zone (rev-2 §5.3) — labelled per bucket
   so Steward review can read by department without re-bucketing. Files
   upload to /api/bios/:brandId/sources/upload and land in Supabase Storage
   plus bio_sources/uploads rows with the selected bucket. */
const BUCKETS = [
  { key:"foundations" },
  { key:"visual" },
  { key:"voice" },
];

function BucketDropZone({ bucket, files, onAdd, onRemove }) {
  const { t } = useLocale();
  const [over, setOver] = useDState(false);
  const inputRef = React.useRef(null);
  const onDrop = (e) => {
    e.preventDefault(); setOver(false);
    onAdd(Array.from(e.dataTransfer.files));
  };
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current && inputRef.current.click()}
      style={{
        border: over ? "1.5px dashed var(--yellow-500)" : "1.5px dashed var(--c-line-2)",
        background: over ? "var(--yellow-50, rgba(252,211,77,0.08))" : "var(--c-bg)",
        borderRadius: 12, padding: "16px 18px", cursor:"pointer",
        transition: "border-color 120ms ease, background 120ms ease",
      }}
    >
      <input
        ref={inputRef} type="file" multiple
        style={{display:"none"}}
        onChange={(e) => { onAdd(Array.from(e.target.files || [])); e.target.value = ""; }}
      />
      <div style={{display:"flex", alignItems:"baseline", justifyContent:"space-between", gap:12, marginBottom:4}}>
        <div style={{fontSize:13.5, fontWeight:600, color:"var(--c-ink)"}}>{t("discovery.bucket." + bucket.key + ".label")}</div>
        <span className="eyebrow" style={{color:"var(--c-faint)"}}>{t("discovery.bucket." + bucket.key + ".readBy")}</span>
      </div>
      <div style={{fontSize:12, color:"var(--c-dim)", lineHeight:1.45, marginBottom: files.length ? 10 : 4}}>
        {t("discovery.bucket." + bucket.key + ".help")}
        {bucket.key === "visual" && <> Visual files are stored for Steward review; automated extraction currently reads the website only.</>}
      </div>
      {files.length > 0 && (
        <div style={{display:"flex", flexWrap:"wrap", gap:6, marginTop: 8}}>
          {files.map((f, i) => (
            <span key={i} className="pill" style={{
              display:"inline-flex", alignItems:"center", gap:6,
              background:"var(--neutral-50)", color:"var(--c-ink)",
              padding:"4px 6px 4px 10px", fontSize:11.5,
            }}>
              <span style={{maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{f.name}</span>
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(i); }}
                aria-label={t("discovery.removeFile", { name: f.name })}
                style={{border:"none", background:"transparent", cursor:"pointer", color:"var(--c-faint)", padding:"0 4px", lineHeight:1}}
              >×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function DiscoveryStep1({ onNext, newBrand = false }) {
  const { t } = useLocale();
  /* Three-bucket source state (rev-2 §5.3). Empty arrays on mount.
     `Start extraction` fires the compile-bio Inngest event via
     /api/discovery/start; the SPA can then poll bios for the result. */
  const [uploadsByBucket, setUploadsByBucket] = useDState({ foundations: [], visual: [], voice: [] });
  const [brandName, setBrandName] = useDState("");
  const [url, setUrl] = useDState("");
  const [instagram, setInstagram] = useDState("");
  const [busy, setBusy] = useDState(false);
  const [error, setError] = useDState(null);
  const [uploading, setUploading] = useDState(false);
  const [createdBrandId, setCreatedBrandId] = useDState(null);
  const uploadedFilesRef = React.useRef(new Set());
  const addToBucket = (key) => (newFiles) =>
    setUploadsByBucket(prev => ({ ...prev, [key]: [...prev[key], ...newFiles] }));
  const removeFromBucket = (key) => (idx) =>
    setUploadsByBucket(prev => ({ ...prev, [key]: prev[key].filter((_, i) => i !== idx) }));
  const handleStart = async () => {
    if (newBrand && !brandName.trim()) { setError(t("discovery.step1.brandNameRequired")); return; }
    setBusy(true); setError(null);
    try {
      const cleaned = url.trim().replace(/^https?:\/\//i, "");
      const targetUrl = cleaned.startsWith("http") ? cleaned : `https://${cleaned}`;
      /* New-brand mode: create the brand first, then run the same
         discovery flow targeting it. Existing onboarding (newBrand=false)
         skips this block entirely and behaves exactly as before. */
      let newBrandId = createdBrandId;
      if (newBrand && !newBrandId) {
        const created = await apiFetch("/api/brands", {
          method: "POST",
          body: JSON.stringify({ name: brandName.trim() }),
        });
        if (created.status === 402) {
          /* Over plan limit — bounce to upgrade, don't create/scrape. */
          window.location.hash = "#/upgrade";
          return;
        }
        if (!created.ok) {
          const err = await created.json().catch(() => ({ error: `HTTP ${created.status}` }));
          throw new Error(err.error || `HTTP ${created.status}`);
        }
        const { brand } = await created.json();
        newBrandId = brand.id;
        setCreatedBrandId(brand.id);
        window.setCurrentBrandId?.(brand.id);
      }
      let brandId = newBrandId || window.getCurrentBrandId?.();
      if (!brandId) {
        const { data: brands, error: brandErr } = await supabase.from("brands")
          .select("id").order("created_at", { ascending: true }).limit(1);
        if (brandErr) throw brandErr;
        brandId = brands?.[0]?.id;
      }
      if (!brandId) throw new Error("No brand is available for Discovery.");

      let baselineVersion = 0;
      const baselineRes = await apiFetch(`/api/bios/${brandId}`);
      if (baselineRes.ok) {
        const baseline = await baselineRes.json();
        baselineVersion = Number(baseline.bio?.version) || 0;
      }
      const filesToUpload = BUCKETS.flatMap((bucket) =>
        uploadsByBucket[bucket.key].map((file) => ({ bucket: bucket.key, file }))
      );
      if (brandId && filesToUpload.length) {
        setUploading(true);
        for (const item of filesToUpload) {
          const uploadKey = `${item.bucket}:${item.file.name}:${item.file.size}:${item.file.lastModified}`;
          if (uploadedFilesRef.current.has(uploadKey)) continue;
          const form = new FormData();
          form.set("bucket", item.bucket);
          form.set("file", item.file);
          const up = await apiFetch(`/api/bios/${brandId}/sources/upload`, {
            method: "POST",
            body: form,
          });
          if (!up.ok) {
            const err = await up.json().catch(() => ({ error: `HTTP ${up.status}` }));
            throw new Error(`Upload failed for ${item.file.name}: ${err.error || `HTTP ${up.status}`}`);
          }
          uploadedFilesRef.current.add(uploadKey);
        }
      }
      const res = await apiFetch("/api/discovery/start", {
        method: "POST",
        body: JSON.stringify({ url: targetUrl, instagram, brandId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const { discoveryId, eventId } = await res.json();
      const runId = discoveryId || eventId;
      if (!runId) throw new Error("Discovery started without a correlation id. Please retry.");
      console.log("[Discovery] fired", { discoveryId: runId, brandId, url: targetUrl });
      onNext({ discoveryId: runId, eventId, brandId, baselineVersion });
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setUploading(false);
      setBusy(false);
    }
  };
  const totalFiles = BUCKETS.reduce((a, b) => a + uploadsByBucket[b.key].length, 0);

  return (
    <div style={{maxWidth: 580, margin:"40px auto 0"}}>
      <Reveal>
        <h1 style={{
          fontFamily:"Georgia, serif", fontStyle:"italic",
          fontSize: 38, letterSpacing:"-0.01em", lineHeight: 1.15,
          margin:0, marginBottom: 14, color:"var(--c-ink)",
        }}>
          <em style={{background:"var(--yellow-200)", padding:"0 4px", fontStyle:"normal", fontWeight:500}}>
            {newBrand ? t("discovery.step1.titleAddEm") : t("discovery.step1.titlePointEm")}
          </em>
          {" "}{newBrand ? t("discovery.step1.titleAddRest") : t("discovery.step1.titlePointRest")}
        </h1>
        <p style={{fontSize: 16, color:"var(--c-dim)", lineHeight: 1.55, marginBottom: 30}}>
          {t("discovery.step1.lead")}
        </p>
      </Reveal>

      <Reveal delay={150}>
        <div className="card" style={{padding: 28}}>
          <div style={{display:"flex", flexDirection:"column", gap: 18}}>
            {newBrand && (
              <div>
                <label style={{display:"block", fontSize:12, fontWeight:500, color:"var(--c-ink)", marginBottom: 8}}>
                  {t("discovery.step1.brandNameLabel")} <span style={{color:"var(--pink-500)"}}>·</span>
                </label>
                <input className="input" value={brandName} disabled={!!createdBrandId} onChange={(e) => setBrandName(e.target.value)} placeholder="e.g. North Star Studio" />
                {createdBrandId && <div style={{fontSize:11.5, color:"var(--c-faint)", marginTop:6}}>Brand created. Retrying will reuse this brand and any sources already uploaded.</div>}
              </div>
            )}
            <div>
              <label style={{display:"block", fontSize:12, fontWeight:500, color:"var(--c-ink)", marginBottom: 8}}>
                {t("discovery.step1.urlLabel")} <span style={{color:"var(--pink-500)"}}>·</span>
              </label>
              <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t("discovery.step1.urlPlaceholder")} />
            </div>
            <div>
              <label style={{display:"block", fontSize:12, fontWeight:500, color:"var(--c-ink)", marginBottom: 8}}>
                {t("discovery.step1.igLabel")} <span style={{color:"var(--c-faint)", fontWeight:400}}>{t("discovery.step1.igOptional")}</span>
              </label>
              <input className="input" value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder={t("discovery.step1.igPlaceholder")} />
            </div>

            <div>
              <label style={{display:"block", fontSize:12, fontWeight:500, color:"var(--c-ink)", marginBottom: 8}}>
                {t("discovery.step1.sourcesLabel")} <span style={{color:"var(--c-faint)", fontWeight:400}}>{t("discovery.step1.sourcesOptional")}</span>
              </label>
              <div style={{display:"flex", flexDirection:"column", gap: 10}}>
                {BUCKETS.map(b => (
                  <BucketDropZone
                    key={b.key}
                    bucket={b}
                    files={uploadsByBucket[b.key]}
                    onAdd={addToBucket(b.key)}
                    onRemove={removeFromBucket(b.key)}
                  />
                ))}
              </div>
            </div>
          </div>

          <div style={{
            marginTop: 22, paddingTop: 18,
            borderTop:"1px dashed var(--c-line-2)",
            display:"flex", justifyContent:"space-between", alignItems:"center",
          }}>
            <div style={{display:"flex", gap: 14, alignItems:"center"}}>
              <span style={{fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--c-faint)"}}>
                {t("discovery.step1.timing")}{totalFiles > 0 ? t("discovery.step1.filesReady", { count: totalFiles }) : ""}
              </span>
            </div>
            <button className="btn btn--primary" onClick={handleStart} disabled={busy || !url.trim() || (newBrand && !brandName.trim())}>
              {uploading ? t("discovery.step1.uploading") : busy ? t("discovery.step1.starting") : <>{t("discovery.step1.startExtraction")} <Icon name="arrow" size={14} /></>}
            </button>
          </div>
          {error && (
            <div style={{marginTop: 12, padding: "8px 12px", background: "var(--pink-50, rgba(244,143,177,0.12))", color: "var(--pink-700, var(--pink-500))", borderRadius: 8, fontSize: 12}}>
              {error}
            </div>
          )}
        </div>
      </Reveal>

      <div style={{display:"flex", gap: 18, justifyContent:"center", marginTop: 22}}>
        <button className="btn btn--link" style={{fontSize: 12}}>{t("discovery.step1.fromScratch")}</button>
        <span style={{color:"var(--c-line-2)"}}>·</span>
        <button className="btn btn--link" style={{fontSize: 12}}>{t("discovery.step1.clone")}</button>
      </div>
    </div>
  );
}

function DiscoveryStep2Running({ onDone, onExit, runContext }) {
  /* Real BIO-compile polling. Captures the current latest BIO version
     on mount; polls /api/bios/:brandId every 3s until a new (higher)
     version appears — that's the Inngest compile-bio function finishing.
     Falls back to onDone after 90s if the worker doesn't return so the
     UI doesn't hang forever. */
  const { t } = useLocale();
  const [stage, setStage] = useDState("scrape");                /* scrape → vision → compile → done */
  const [elapsed, setElapsed] = useDState(0);
  const [error, setError] = useDState(null);
  const [retryNonce, setRetryNonce] = useDState(0);

  const lines = [
    { state: stage === "scrape" ? "running" : "ok", text: t("discovery.step2.reading1") },
    { state: stage === "scrape" ? "queued" : stage === "vision" ? "running" : "ok", text: t("discovery.step2.reading2") },
    { state: ["scrape","vision"].includes(stage) ? "queued" : stage === "compile" ? "running" : "ok", text: t("discovery.step2.reading3") },
    { state: stage === "done" ? "ok" : "queued", text: t("discovery.step2.reading4") },
  ];

  useDEffect(() => {
    let alive = true;
    const discoveryId = runContext?.discoveryId;
    const startedAt = Date.now();
    setError(null);
    setElapsed(0);
    setStage("scrape");

    const tick = async () => {
      if (!alive) return;
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
      /* Crude stage progression based on elapsed time — real status
         tracking would require Inngest's GraphQL API. For visual
         feedback only; truth is "did a new bios row appear?" */
      const sec = (Date.now() - startedAt) / 1000;
      if (sec < 6) setStage("scrape");
      else if (sec < 12) setStage("vision");
      else setStage("compile");

      try {
        const brandId = runContext?.brandId;
        if (!brandId) return;
        const res = await apiFetch(`/api/bios/${brandId}`);
        if (!res.ok) return;
        const { bio } = await res.json();
        if (discoveryId && bio?.discovery_id === discoveryId) {
          setStage("done");
          alive = false;                 /* stop further polling */
          clearTimeout(fallback);        /* the 90s safety net is no longer needed */
          /* Brief beat so the user sees "done", then advance to Confirm.
             Fire onDone UNCONDITIONALLY — do NOT gate on `alive`, which we
             just set false. Gating here was the freeze bug: a new BIO landing
             before the 90s fallback set alive=false, which then blocked BOTH
             this transition and the fallback → the flow stuck on "done". */
          setTimeout(onDone, 400);
        }
      } catch (e) { /* network blip — keep polling */ }
    };

    tick();
    const id = setInterval(tick, 3000);
    /* A timeout is a recoverable error, never a successful extraction. */
    const fallback = setTimeout(() => {
      if (alive) {
        alive = false;
        clearInterval(id);
        setError("We haven't confirmed this extraction yet. It may still finish in the background; check again or open the BIO without activating this run.");
      }
    }, 90000);
    return () => { alive = false; clearInterval(id); clearTimeout(fallback); };
  }, [onDone, retryNonce, runContext?.brandId, runContext?.discoveryId]);

  const pct = Math.min(95, Math.round(elapsed * 4));            /* visual progress only */
  return (
    <div style={{maxWidth: 760, margin:"40px auto 0"}}>
      <div style={{display:"flex", alignItems:"center", gap: 12, marginBottom: 18}}>
        <BrandolphDot state={stage === "done" ? "ok" : "thinking"} size={12} />
        <h2 style={{margin: 0, fontSize: 20}}>{stage === "done" ? t("discovery.step2.compiledTitle") : t("discovery.step2.readingTitle")}</h2>
      </div>
      {error && <div className="card" style={{padding:14, marginBottom:14, borderColor:"var(--pink-500)"}}>
        <div style={{color:"var(--pink-600)", marginBottom:10}}>{error}</div>
        <div style={{display:"flex", gap:8}}>
          <button className="btn btn--ghost btn--sm" onClick={() => setRetryNonce(n => n + 1)}>Check again</button>
          <button className="btn btn--link" onClick={onExit}>Open current BIO</button>
        </div>
      </div>}
      <div className="card" style={{padding: 0, overflow:"hidden"}}>
        <div style={{padding:"16px 20px", borderBottom:"1px solid var(--c-line)", background:"var(--c-bg)"}}>
          <div style={{display:"flex", justifyContent:"space-between", fontFamily:"var(--font-mono)", fontSize:11, color:"var(--c-dim)", letterSpacing:"0.06em"}}>
            <span>{t("discovery.step2.extraction")} · <span style={{color: stage === "done" ? "var(--green-600)" : "var(--yellow-700)"}}>{stage === "done" ? "100%" : pct + "%"}</span></span>
            <span>{t("discovery.step2.elapsed", { sec: elapsed })}</span>
          </div>
          <div style={{height: 4, background:"var(--neutral-50)", borderRadius:999, marginTop: 10, overflow:"hidden"}}>
            <div style={{height:"100%", width: (stage === "done" ? 100 : pct) + "%", background: stage === "done" ? "var(--green-500)" : "var(--yellow-500)", borderRadius:999, transition:"width 800ms ease"}} />
          </div>
        </div>
        <div style={{padding: "18px 22px", borderLeft: "3px solid var(--yellow-500)", display:"flex", flexDirection:"column", gap: 10}} className="stream">
          {lines.map((l, i) => (
            <div key={i} style={{display:"flex", alignItems:"center", gap: 10, fontFamily:"var(--font-mono)", fontSize: 13, color:"var(--c-ink)"}}>
              <span style={{color:"var(--c-faint)"}}>›</span>
              <span className={"dot-state dot-state--" + l.state} />
              <span style={{color: l.state === "queued" ? "var(--c-faint)" : "var(--c-ink)"}}>{l.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   S3 DRAFT HUB + CHAPTERED REVIEW  (M3 discovery rebuild)
   Replaces the old hardcoded window.CI_DISCOVERY "Confirm" screen with
   the live discovery-session draft flow:
     GET   /api/discovery/session/:brandId          → seed on mount (create-on-read)
     PATCH /api/discovery/session/:brandId          → debounced autosave (~800ms)
     POST  /api/discovery/session/:brandId/attest   → promote draft → BIO + self-cert
     POST  /api/discovery/delegation                → hand a chapter to a teammate
   No invented brand data: a field with no value renders empty + flagged,
   never a guess.
   ─────────────────────────────────────────────────────────────────── */

/* Chapter map — one entry per BIO section, each with the 3–5 fields the
   user reviews. `multi` = string[] (chips); `list` = object[] (palette/type).
   Human-readable chapter/field labels + blurbs live in the i18n catalog under
   discovery.chapter.* / discovery.field.* and are resolved via the accessors
   below; the `key`s here stay language-neutral (they index draft/attest state). */
const DISCO_CHAPTERS = [
  { key:"identity", fields:[
    { key:"positioning", area:true, italic:true },
    { key:"category" },
    { key:"founded" },
    { key:"pillars", multi:true },
  ]},
  { key:"audience", fields:[
    { key:"primary",   area:true },
    { key:"secondary", area:true },
    { key:"tertiary",  area:true },
    { key:"jtbd",      multi:true },
  ]},
  { key:"voice", fields:[
    { key:"register",   area:true },
    { key:"rhythm",     area:true },
    { key:"forbidden",  multi:true },
    { key:"signatures", multi:true },
  ]},
  { key:"visual", fields:[
    { key:"palette", list:"palette" },
    { key:"type",    list:"type" },
    { key:"imagery", multi:true },
    { key:"avoid",   multi:true },
  ]},
  { key:"goals", fields:[
    { key:"northStar", area:true },
    { key:"q2",        area:true },
    { key:"q3",        area:true },
  ]},
  { key:"strategic", fields:[
    { key:"watchouts", multi:true },
    { key:"notList",   multi:true },
  ]},
];

/* i18n label accessors for the chapter map. These read the module-level `tr`
   with the live locale; the components that call them subscribe via useLocale()
   and re-render on locale change, so the resolved labels stay current. */
const chapterLabel = (ch) => tr("discovery.chapter." + ch.key + ".label");
const chapterBlurb = (ch) => tr("discovery.chapter." + ch.key + ".blurb");
const fieldLabel = (chapterKey, f) => tr("discovery.field." + chapterKey + "." + f.key);

function discoBlank(v) {
  if (v == null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

/* Per-field status → drives the chip + colour. A blank field is always
   "missing" (never surfaces a guessed value), regardless of any source. */
function discoFieldStatus({ value, meta, mark }) {
  /* `word` is resolved at render via t("discovery.fieldStatus." + kind). */
  if (discoBlank(value))       return { kind:"missing",      color:"var(--pink-500)" };
  if (mark === "accurate")     return { kind:"accurate",     color:"var(--green-600)" };
  if (mark === "aspirational") return { kind:"aspirational", color:"var(--purple-500)" };
  if (meta && meta.source)     return { kind:"inferred",     color:"var(--orange-600)" };
  return { kind:"stated", color:"var(--green-600)" };
}

/* Section roll-up for the Draft Hub cards + attest summary. */
function discoAnalyzeSection(chapter, draft, confMap, attested) {
  const sec = draft?.[chapter.key] || {};
  let confirmed = 0, toConfirm = 0, gaps = 0;
  for (const f of chapter.fields) {
    const st = discoFieldStatus({
      value: sec[f.key],
      meta: confMap[`${chapter.key}.${f.key}`],
      mark: attested[`${chapter.key}.${f.key}`],
    });
    if (st.kind === "missing") gaps++;
    else if (st.kind === "inferred") toConfirm++;
    else confirmed++;
  }
  const total = chapter.fields.length;
  let status;
  /* `word` is resolved at render via t("discovery.sectionStatus." + key). */
  if (gaps >= Math.ceil(total / 2)) status = { key:"needs",   color:"var(--pink-500)",   bg:"var(--pink-50, rgba(244,143,177,0.12))" };
  else if (gaps > 0 || toConfirm > 0) status = { key:"filling", color:"var(--orange-600)", bg:"var(--yellow-50, rgba(252,211,77,0.12))" };
  else status = { key:"well", color:"var(--green-600)", bg:"var(--green-50, rgba(127,163,122,0.12))" };
  return { confirmed, toConfirm, gaps, total, status };
}

/* Friendly copy for the attest endpoint's 400 codes. */
function discoAttestError(j) {
  switch (j && j.code) {
    case "STATEMENTS_REQUIRED":
      return tr("discovery.attestError.statements");
    case "HIGH_IMPORTANCE_GAPS":
      return tr("discovery.attestError.gaps", { fields: j.fields && j.fields.length ? `: ${j.fields.join(", ")}` : "" });
    case "BELOW_MIN_SCORE":
      return tr("discovery.attestError.belowScore", {
        score: j.score ?? "—",
        below: j.minScore ? tr("discovery.attestError.belowNeeded", { minScore: j.minScore }) : "",
      });
    default:
      return (j && j.error) || tr("discovery.attestError.default");
  }
}

/* Compact read/edit views for the object-array visual fields. */
function DiscoPaletteView({ items }) {
  return (
    <div style={{display:"flex", flexWrap:"wrap", gap:8}}>
      {items.map((c, i) => (
        <span key={i} style={{display:"inline-flex", alignItems:"center", gap:6, border:"1px solid var(--c-line)", borderRadius:8, padding:"3px 8px 3px 4px"}}>
          <span style={{width:18, height:18, borderRadius:4, background:c.hex || "#ccc", border:"1px solid var(--c-line)"}} />
          <span style={{fontSize:12.5, color:"var(--c-ink)"}}>{c.name || c.hex}</span>
        </span>
      ))}
    </div>
  );
}
function DiscoPaletteEdit({ items, onChange }) {
  const { t } = useLocale();
  const upd = (i, p) => onChange(items.map((x, j) => j === i ? { ...x, ...p } : x));
  return (
    <div style={{display:"flex", flexDirection:"column", gap:8}}>
      {items.map((c, i) => (
        <div key={i} style={{display:"flex", gap:8, alignItems:"center"}}>
          <input type="color" value={c.hex || "#888888"} onChange={(e) => upd(i, { hex: e.target.value })} style={{width:34, height:30, border:"none", background:"transparent", cursor:"pointer", padding:0}} />
          <div style={{flex:1}}><EditInput value={c.name || ""} onChange={(v) => upd(i, { name: v })} placeholder={t("discovery.palette.namePlaceholder")} /></div>
          <button onClick={() => onChange(items.filter((_, j) => j !== i))} style={CHIP_X} title={t("discovery.common.remove")}>×</button>
        </div>
      ))}
      <button className="btn btn--ghost btn--sm" onClick={() => onChange([...items, { hex:"#888888", name:"" }])}><Icon name="plus" size={12} /> {t("discovery.common.addColour")}</button>
    </div>
  );
}
function DiscoTypeView({ items }) {
  return (
    <div style={{display:"flex", flexWrap:"wrap", gap:8}}>
      {items.map((t, i) => (
        <span key={i} className="pill" style={{fontSize:12.5}}>{t.kind ? `${t.kind}: ` : ""}{t.family || "—"}</span>
      ))}
    </div>
  );
}
function DiscoTypeEdit({ items, onChange }) {
  const { t } = useLocale();
  const upd = (i, p) => onChange(items.map((x, j) => j === i ? { ...x, ...p } : x));
  return (
    <div style={{display:"flex", flexDirection:"column", gap:8}}>
      {items.map((tf, i) => (
        <div key={i} style={{display:"flex", gap:8, alignItems:"center"}}>
          <div style={{width:120}}><EditInput value={tf.kind || ""} onChange={(v) => upd(i, { kind: v })} placeholder={t("discovery.type.rolePlaceholder")} /></div>
          <div style={{flex:1}}><EditInput value={tf.family || ""} onChange={(v) => upd(i, { family: v })} placeholder={t("discovery.type.familyPlaceholder")} /></div>
          <button onClick={() => onChange(items.filter((_, j) => j !== i))} style={CHIP_X} title={t("discovery.common.remove")}>×</button>
        </div>
      ))}
      <button className="btn btn--ghost btn--sm" onClick={() => onChange([...items, { kind:"", family:"" }])}><Icon name="plus" size={12} /> {t("discovery.common.addTypeface")}</button>
    </div>
  );
}

/* One reviewable field: status chip, value (or "we couldn't find this"),
   and the per-field controls (mark accurate/aspirational, edit, leave blank). */
function DiscoFieldRow({ field, chapterKey, value, meta, mark, onChange, onMark, onLeaveBlank }) {
  const { t } = useLocale();
  const [editing, setEditing] = useDState(false);
  const st = discoFieldStatus({ value, meta, mark });
  const blank = st.kind === "missing";

  const renderValue = () => {
    if (field.list === "palette") return <DiscoPaletteView items={value || []} />;
    if (field.list === "type") return <DiscoTypeView items={value || []} />;
    if (field.multi) return <div style={{display:"flex", flexWrap:"wrap", gap:6}}>{(value || []).map((v, i) => <span key={i} className="pill">{v}</span>)}</div>;
    return field.italic ? <em style={{fontStyle:"italic"}}>{value}</em> : <span>{value}</span>;
  };

  const renderEditor = () => {
    if (field.list === "palette") return <DiscoPaletteEdit items={value || []} onChange={onChange} />;
    if (field.list === "type") return <DiscoTypeEdit items={value || []} onChange={onChange} />;
    if (field.multi) return <ChipEditor items={value || []} onChange={onChange} />;
    return <EditInput area={field.area} value={value || ""} onChange={onChange} placeholder={t("discovery.field.editPlaceholder")} />;
  };

  return (
    <div style={{padding:"16px 0", borderBottom:"1px solid var(--c-line)"}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:12, marginBottom:8}}>
        <div>
          <span style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--c-faint)", letterSpacing:"0.06em", textTransform:"uppercase"}}>{fieldLabel(chapterKey, field)}</span>
          {meta && meta.source && <span style={{fontSize:11, color:"var(--c-faint)", fontStyle:"italic", marginLeft:10}}>{t("discovery.field.from", { source: meta.source })}</span>}
        </div>
        <span className="pill" style={{background:"transparent", border:`1px solid ${st.color}`, color:st.color, fontSize:10.5, whiteSpace:"nowrap"}}>{t("discovery.fieldStatus." + st.kind)}</span>
      </div>

      {/* Value / editor / empty-state — NEVER a guessed value */}
      <div style={{
        borderLeft: `3px solid ${st.kind === "inferred" ? "var(--orange-600)" : st.kind === "missing" ? "var(--pink-500)" : "var(--c-line-2)"}`,
        background: st.kind === "inferred" ? "var(--yellow-50, rgba(252,211,77,0.08))" : st.kind === "missing" ? "var(--pink-50, rgba(244,143,177,0.06))" : "transparent",
        borderRadius:"0 8px 8px 0", padding:"10px 14px", fontSize:14, color:"var(--c-ink)", lineHeight:1.55,
      }}>
        {editing
          ? renderEditor()
          : blank
            ? <span style={{color:"var(--c-faint)", fontStyle:"italic"}}>{t("discovery.field.emptyState")}</span>
            : renderValue()}
      </div>

      {/* Per-field controls */}
      <div style={{display:"flex", gap:10, marginTop:10, flexWrap:"wrap", alignItems:"center"}}>
        {!blank && (mark ? (
          <button className="btn btn--link" style={{fontSize:12}} onClick={() => onMark(null)}>
            <Icon name="check" size={12} /> {t("discovery.field.markedUndo", { mark: t("discovery.mark." + mark) })}
          </button>
        ) : (
          <>
            <button className="btn btn--ghost btn--sm" onClick={() => onMark("accurate")}>{t("discovery.field.markAccurate")}</button>
            <button className="btn btn--ghost btn--sm" onClick={() => onMark("aspirational")}>{t("discovery.field.markAspirational")}</button>
          </>
        ))}
        <button className="btn btn--link" style={{fontSize:12}} onClick={() => setEditing(e => !e)}>
          <Icon name="edit" size={12} /> {editing ? t("discovery.field.doneEditing") : blank ? t("discovery.field.addIt") : t("discovery.field.edit")}
        </button>
        {!blank && (
          <button className="btn btn--link" style={{fontSize:12, color:"var(--c-faint)"}} onClick={() => { onLeaveBlank(); setEditing(false); }}>{t("discovery.field.leaveBlank")}</button>
        )}
      </div>
    </div>
  );
}

/* Hand a single chapter to a teammate — POST /discovery/delegation. */
function DiscoDelegatePanel({ brandId, chapter }) {
  const { t } = useLocale();
  const [email, setEmail] = useDState("");
  const [note, setNote] = useDState("");
  const [busy, setBusy] = useDState(false);
  const [link, setLink] = useDState(null);
  const [err, setErr] = useDState(null);
  const [copied, setCopied] = useDState(false);

  const send = async () => {
    if (!email.trim() || busy || !brandId) return;
    setBusy(true); setErr(null); setLink(null);
    try {
      const res = await apiFetch(`/api/discovery/delegation`, {
        method: "POST",
        body: JSON.stringify({ brandId, chapter: chapter.key, invitee_email: email.trim(), note: note.trim() || undefined }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setLink(j.link || null);
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(false); }
  };
  const copy = () => { if (link && navigator.clipboard) { navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1600); } };

  return (
    <div className="card card--inset" style={{padding:16, marginTop:18}}>
      <div style={{fontSize:13.5, fontWeight:600, color:"var(--c-ink)", marginBottom:4}}>{t("discovery.delegate.title")}</div>
      <div style={{fontSize:12, color:"var(--c-faint)", marginBottom:12}}>{t("discovery.delegate.desc", { chapter: chapterLabel(chapter) })}</div>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input className="input" style={{flex:"1 1 200px"}} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("discovery.delegate.emailPlaceholder")} />
        <input className="input" style={{flex:"1 1 200px"}} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("discovery.delegate.notePlaceholder")} />
        <button className="btn btn--primary btn--sm" disabled={busy || !email.trim()} onClick={send}>
          <Icon name="mail" size={13} /> {busy ? t("discovery.delegate.sending") : t("discovery.delegate.sendInvite")}
        </button>
      </div>
      {err && <div style={{fontSize:12, color:"var(--pink-500)", marginTop:8}}>{err}</div>}
      {link && (
        <div style={{marginTop:10, display:"flex", gap:8, alignItems:"center", fontSize:12}}>
          <span style={{color:"var(--green-600)", whiteSpace:"nowrap"}}>{t("discovery.delegate.inviteReady")}</span>
          <code style={{flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontFamily:"var(--font-mono)", fontSize:11, color:"var(--c-dim)", background:"var(--neutral-50)", padding:"4px 8px", borderRadius:6}}>{link}</code>
          <button className="btn btn--ghost btn--sm" onClick={copy}>{copied ? t("discovery.delegate.copied") : t("discovery.delegate.copyLink")}</button>
        </div>
      )}
    </div>
  );
}

function DiscoveryStep2Results({ onConfirm, runContext }) {
  const { t } = useLocale();
  /* Live brand + cert + score — drives the Steward chip (flips in real
     time if certification lands) and the completion meter. */
  const live = useLiveBio({ pollMs: 6000, brandId: runContext?.brandId });
  const brandId = live.brandId;

  /* Discovery-session state, hydrated from GET /session on mount. */
  const [draft, setDraft] = useDState({});
  const [attested, setAttested] = useDState({});
  const [chapterStatus, setChapterStatus] = useDState({});
  const [cursor, setCursor] = useDState("hub");
  const [view, setView] = useDState("hub");                // hub | chapter | attest
  const [activeChapter, setActiveChapter] = useDState(null);
  const [loading, setLoading] = useDState(true);
  const [saveState, setSaveState] = useDState("idle");     // idle | saving | saved | error
  const [rev, setRev] = useDState(0);                      // bumps on every user edit → debounced save
  const [toast, setToast] = useDState(null);

  /* Attest UI */
  const [statements, setStatements] = useDState({ authority:false, reflects:false, aspirationalMarked:false });
  const [attestBusy, setAttestBusy] = useDState(false);
  const [attestErr, setAttestErr] = useDState(null);

  /* Refs mirror state so the debounced saver + attest flush always send
     the freshest snapshot without re-subscribing. */
  const draftRef = React.useRef(draft);
  const attestedRef = React.useRef(attested);
  const chapterStatusRef = React.useRef(chapterStatus);
  const cursorRef = React.useRef(cursor);
  const hydratedRef = React.useRef(false);
  useDEffect(() => { draftRef.current = draft; }, [draft]);
  useDEffect(() => { attestedRef.current = attested; }, [attested]);
  useDEffect(() => { chapterStatusRef.current = chapterStatus; }, [chapterStatus]);
  useDEffect(() => { cursorRef.current = cursor; }, [cursor]);

  const confMap = draft?.confidence || {};
  const bump = () => setRev(r => r + 1);
  const flash = (m) => { setToast(m); clearTimeout(window.__discoT); window.__discoT = setTimeout(() => setToast(null), 2600); };

  /* ── Load (create-on-read) ──────────────────────────────────────── */
  useDEffect(() => {
    if (!brandId) return;
    let alive = true;
    setLoading(true);
    hydratedRef.current = false;
    (async () => {
      try {
        const res = await apiFetch(`/api/discovery/session/${brandId}`);
        const j = await res.json().catch(() => ({}));
        if (!alive) return;
        const s = j.session || {};
        setDraft(s.draft_payload || live.bio?.payload || {});
        setAttested(s.attested || {});
        setChapterStatus(s.chapter_status || {});
        const cur = typeof s.cursor === "string" && s.cursor ? s.cursor : "hub";
        setCursor(cur);
        if (cur.startsWith("chapter:")) { setActiveChapter(cur.slice("chapter:".length)); setView("chapter"); }
        else if (cur === "attest") setView("attest");
        else setView("hub");
      } catch (e) {
        /* Fall back to the live BIO payload so the user still sees real data. */
        if (alive) setDraft(live.bio?.payload || {});
      } finally {
        if (alive) { hydratedRef.current = true; setLoading(false); }
      }
    })();
    return () => { alive = false; };
  }, [brandId]);

  /* ── Debounced autosave ─────────────────────────────────────────── */
  const saveSession = React.useCallback(async () => {
    if (!brandId || !hydratedRef.current) return;
    setSaveState("saving");
    try {
      const res = await apiFetch(`/api/discovery/session/${brandId}`, {
        method: "PATCH",
        body: JSON.stringify({
          draft_payload: draftRef.current,
          attested: attestedRef.current,
          chapter_status: chapterStatusRef.current,
          cursor: cursorRef.current,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSaveState("saved");
    } catch (e) {
      setSaveState("error");
    }
  }, [brandId]);

  useDEffect(() => {
    if (rev === 0 || !hydratedRef.current) return;
    const t = setTimeout(saveSession, 800);
    return () => clearTimeout(t);
  }, [rev, saveSession]);

  /* ── Field mutations (each bump schedules an autosave) ───────────── */
  const setFieldValue = (section, fkey, value) => {
    setDraft(d => ({ ...d, [section]: { ...(d[section] || {}), [fkey]: value } }));
    bump();
  };
  const setMark = (section, fkey, mark) => {
    const akey = `${section}.${fkey}`;
    setAttested(a => { const n = { ...a }; if (mark == null) delete n[akey]; else n[akey] = mark; return n; });
    bump();
  };
  const leaveBlank = (section, fkey) => {
    const cur = draft?.[section]?.[fkey];
    setFieldValue(section, fkey, Array.isArray(cur) ? [] : "");
    setMark(section, fkey, null);
  };

  /* ── Navigation (persists cursor + chapter progress) ────────────── */
  const openChapter = (key) => { setActiveChapter(key); setView("chapter"); setCursor(`chapter:${key}`); bump(); };
  const backToHub = (reviewedKey) => {
    if (reviewedKey) setChapterStatus(cs => ({ ...cs, [reviewedKey]: "reviewed" }));
    setView("hub"); setCursor("hub"); bump();
  };
  const openAttest = () => { setView("attest"); setCursor("attest"); bump(); };
  const saveAndExit = async () => { await saveSession(); flash(t("discovery.results.savedExit")); setTimeout(() => { window.location.hash = "#/home"; }, 700); };

  /* ── Attest → promote draft to a certified BIO version ──────────── */
  const submitAttest = async () => {
    if (attestBusy || !brandId) return;
    setAttestBusy(true); setAttestErr(null);
    await saveSession();                          // flush latest draft + marks first
    try {
      const res = await apiFetch(`/api/discovery/session/${brandId}/attest`, {
        method: "POST",
        body: JSON.stringify({ statements, fieldMarks: attestedRef.current, statementVersion: "1" }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setAttestErr(discoAttestError(j)); return; }
      flash(t("discovery.results.bioSigned"));
      onConfirm && onConfirm();                   // advance to the live S13 step
    } catch (e) { setAttestErr(e?.message || String(e)); }
    finally { setAttestBusy(false); }
  };

  /* ── Derived: per-section + overall roll-ups ────────────────────── */
  const analyses = DISCO_CHAPTERS.map(ch => ({ ch, a: discoAnalyzeSection(ch, draft, confMap, attested) }));
  const totals = analyses.reduce((acc, { a }) => ({
    confirmed: acc.confirmed + a.confirmed,
    toConfirm: acc.toConfirm + a.toConfirm,
    gaps: acc.gaps + a.gaps,
    total: acc.total + a.total,
  }), { confirmed:0, toConfirm:0, gaps:0, total:0 });

  const score = live.bio?.score ?? (totals.total ? Math.round(100 * totals.confirmed / totals.total) : 0);
  const tone = score >= 85
    ? { color:"var(--green-600)", word:t("discovery.completion.well") }
    : score >= 65
    ? { color:"var(--orange-600)", word:t("discovery.completion.filling") }
    : { color:"var(--pink-500)", word:t("discovery.completion.needs") };

  const chapter = DISCO_CHAPTERS.find(c => c.key === activeChapter);
  const chapterAnalysis = chapter ? discoAnalyzeSection(chapter, draft, confMap, attested) : null;

  /* Still-open fields for the attest summary (missing or inferred). */
  const flaggedFields = [];
  analyses.forEach(({ ch }) => {
    ch.fields.forEach(f => {
      const st = discoFieldStatus({
        value: draft?.[ch.key]?.[f.key],
        meta: confMap[`${ch.key}.${f.key}`],
        mark: attested[`${ch.key}.${f.key}`],
      });
      if (st.kind === "missing" || st.kind === "inferred") flaggedFields.push({ ch, f, st });
    });
  });
  const allChecked = statements.authority && statements.reflects && statements.aspirationalMarked;

  const noBrand = !brandId && !live.loading;
  const showLoader = (!brandId && live.loading) || (brandId && loading);

  return (
    <div style={{maxWidth: 1080, margin:"24px auto 0"}}>
      {/* Utility row — save state + resume-anytime exit (on every screen) */}
      <div style={{display:"flex", justifyContent:"flex-end", alignItems:"center", gap:14, marginBottom:10}}>
        <span style={{color:"var(--c-faint)", fontFamily:"var(--font-mono)", fontSize:11}}>
          {saveState === "saving" ? t("discovery.results.saving") : saveState === "saved" ? t("discovery.results.saved") : saveState === "error" ? t("discovery.results.saveError") : ""}
        </span>
        <button className="btn btn--link" style={{fontSize:12}} onClick={saveAndExit}>{t("discovery.results.finishLater")}</button>
      </div>

      {noBrand ? (
        <div className="card" style={{padding:"48px 24px", textAlign:"center", color:"var(--c-dim)", fontSize:14}}>
          {t("discovery.results.noBrand")} <a href="#/discovery" style={{color:"var(--purple-500)"}}>{t("discovery.results.startDiscovery")}</a>.
        </div>
      ) : showLoader ? (
        <div className="card" style={{padding:"48px 24px", textAlign:"center", color:"var(--c-faint)", display:"flex", alignItems:"center", justifyContent:"center", gap:10}}>
          <BrandolphDot state="thinking" /> {t("discovery.results.loading")}
        </div>
      ) : (
        <>
          {/* Steward / cert chip — flips live if certification lands. */}
          <Reveal>
            <div style={{
              background: live.cert ? "var(--green-50, rgba(127,163,122,0.10))" : "var(--yellow-50, rgba(252,211,77,0.10))",
              border: `1px solid ${live.cert ? "var(--green-300, rgba(127,163,122,0.4))" : "var(--yellow-300, rgba(252,211,77,0.4))"}`,
              borderRadius: 12, padding:"12px 18px", marginBottom:16, display:"flex", alignItems:"center", gap:12,
            }}>
              <span style={{width:8, height:8, borderRadius:"50%", background: live.cert ? "var(--green-500)" : "var(--yellow-500)", animation: live.cert ? "none" : "pulse 1.4s ease-in-out infinite", flexShrink:0}} />
              <div style={{fontSize:13, color:"var(--c-ink)", lineHeight:1.5}}>
                {live.cert
                  ? <>{t("discovery.results.certifiedBy")} <span style={{color:"var(--green-600)", fontWeight:500}}>{live.cert.byName}</span>.</>
                  : <>{t("discovery.results.certPending")}</>}
              </div>
            </div>
          </Reveal>

          {/* Brand row + completion meter */}
          <Reveal>
            <div style={{display:"grid", gridTemplateColumns:"1fr auto", gap:20, alignItems:"center", marginBottom:20}}>
              <div>
                <div className="eyebrow" style={{marginBottom:6}}>{t("discovery.results.draftEyebrow")}</div>
                <h2 style={{margin:0, fontSize:24, letterSpacing:"-0.01em"}}>{live.brandName || t("discovery.results.yourBrand")}</h2>
                {live.brandUrl && <p style={{margin:"4px 0 0", color:"var(--c-dim)", fontSize:13}}>{live.brandUrl}</p>}
              </div>
              <div style={{textAlign:"right", minWidth:180}}>
                <div className="eyebrow eyebrow--yellow" style={{marginBottom:2}}>{t("discovery.results.completion")}</div>
                <div style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize:44, lineHeight:1, color:tone.color, fontWeight:500}}>
                  <Counter to={score} format={n => Math.round(n)} />
                </div>
                <div style={{height:6, background:"var(--neutral-50)", borderRadius:999, overflow:"hidden", marginTop:8, width:180, marginLeft:"auto"}}>
                  <div style={{height:"100%", width: Math.max(0, Math.min(100, score)) + "%", background: tone.color, borderRadius:999, transition:"width 700ms ease"}} />
                </div>
                <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--c-faint)", marginTop:4, textTransform:"uppercase", letterSpacing:"0.06em"}}>{tone.word}</div>
              </div>
            </div>
          </Reveal>

          {/* ── DRAFT HUB — chapter map ─────────────────────────────── */}
          {view === "hub" && (
            <>
              <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(320px, 1fr))", gap:14}}>
                {analyses.map(({ ch, a }) => {
                  const reviewed = chapterStatus[ch.key] === "reviewed";
                  return (
                    <button key={ch.key} onClick={() => openChapter(ch.key)} className="card"
                      style={{textAlign:"left", cursor:"pointer", padding:18, display:"flex", flexDirection:"column", gap:12, borderLeft:`3px solid ${a.status.color}`}}>
                      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", gap:8}}>
                        <div style={{display:"flex", alignItems:"center", gap:8}}>
                          <h3 style={{margin:0, fontSize:16, letterSpacing:"-0.01em"}}>{chapterLabel(ch)}</h3>
                          {reviewed && <span style={{color:"var(--green-600)", display:"inline-flex"}} title={t("discovery.hub.reviewed")}><Icon name="check" size={13} /></span>}
                        </div>
                        <span className="pill" style={{background:a.status.bg, color:a.status.color, border:"none", fontSize:10.5, whiteSpace:"nowrap"}}>{t("discovery.sectionStatus." + a.status.key)}</span>
                      </div>
                      <p style={{margin:0, fontSize:12.5, color:"var(--c-faint)", lineHeight:1.45}}>{chapterBlurb(ch)}</p>
                      <div style={{display:"flex", gap:14, fontFamily:"var(--font-mono)", fontSize:11, color:"var(--c-dim)"}}>
                        <span>{t("discovery.hub.gaps", { count: a.gaps })}</span>
                        <span style={{color: a.toConfirm ? "var(--orange-600)" : "var(--c-faint)"}}>{t("discovery.hub.toConfirm", { count: a.toConfirm })}</span>
                        <span style={{color:"var(--green-600)"}}>{a.confirmed} ✓</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div style={{marginTop:22, padding:"18px 20px", background:"var(--c-card)", border:"1px solid var(--c-line)", borderRadius:12, display:"flex", justifyContent:"space-between", alignItems:"center", gap:14, flexWrap:"wrap"}}>
                <div style={{fontSize:13.5, color:"var(--c-ink)"}}>
                  <strong>{totals.confirmed}/{totals.total}</strong> {t("discovery.hub.fieldsConfirmed")} · {totals.toConfirm} {t("discovery.hub.inferredToConfirm")} · {totals.gaps} {t("discovery.hub.gapsWord")}
                </div>
                <button className="btn btn--primary btn--lg" onClick={openAttest}>{t("discovery.hub.confirmAttest")} <Icon name="arrow" size={14} /></button>
              </div>
            </>
          )}

          {/* ── CHAPTER — field-level review ────────────────────────── */}
          {view === "chapter" && chapter && (
            <>
              <button className="btn btn--link" style={{marginBottom:10, fontSize:13}} onClick={() => backToHub(chapter.key)}>{t("discovery.chapterView.allChapters")}</button>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:12, marginBottom:4}}>
                <h2 style={{margin:0, fontSize:22, letterSpacing:"-0.01em"}}>{chapterLabel(chapter)}</h2>
                {chapterAnalysis && <span className="pill" style={{background:chapterAnalysis.status.bg, color:chapterAnalysis.status.color, border:"none"}}>{t("discovery.sectionStatus." + chapterAnalysis.status.key)}</span>}
              </div>
              <p style={{margin:"0 0 16px", fontSize:13, color:"var(--c-faint)"}}>{chapterBlurb(chapter)} {t("discovery.chapterView.instruction")}</p>

              <div className="card" style={{padding:"4px 20px"}}>
                {chapter.fields.map(field => (
                  <DiscoFieldRow
                    key={field.key}
                    field={field}
                    chapterKey={chapter.key}
                    value={draft?.[chapter.key]?.[field.key]}
                    meta={confMap[`${chapter.key}.${field.key}`]}
                    mark={attested[`${chapter.key}.${field.key}`]}
                    onChange={(v) => setFieldValue(chapter.key, field.key, v)}
                    onMark={(m) => setMark(chapter.key, field.key, m)}
                    onLeaveBlank={() => leaveBlank(chapter.key, field.key)}
                  />
                ))}
              </div>

              <DiscoDelegatePanel brandId={brandId} chapter={chapter} />

              <div style={{display:"flex", gap:10, marginTop:18}}>
                <button className="btn btn--primary" onClick={() => backToHub(chapter.key)}><Icon name="check" size={14} /> {t("discovery.chapterView.doneBack")}</button>
              </div>
            </>
          )}

          {/* ── S12 — CONFIRM & ATTEST ──────────────────────────────── */}
          {view === "attest" && (
            <>
              <button className="btn btn--link" style={{marginBottom:10, fontSize:13}} onClick={() => backToHub()}>{t("discovery.attest.back")}</button>
              <h2 style={{margin:"0 0 4px", fontSize:24, letterSpacing:"-0.01em"}}>{t("discovery.attest.title")}</h2>
              <p style={{margin:"0 0 20px", fontSize:14, color:"var(--c-dim)", lineHeight:1.55}}>
                {t("discovery.attest.desc")}
              </p>

              {/* Summary tiles */}
              <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:12, marginBottom:18}}>
                {[
                  [t("discovery.attest.confirmed"), totals.confirmed, "var(--green-600)"],
                  [t("discovery.attest.inferredToConfirm"), totals.toConfirm, "var(--orange-600)"],
                  [t("discovery.attest.gaps"), totals.gaps, "var(--pink-500)"],
                ].map(([label, n, color]) => (
                  <div key={label} className="card" style={{padding:"14px 16px"}}>
                    <div style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize:32, lineHeight:1, color, fontWeight:500}}>{n}</div>
                    <div className="eyebrow" style={{marginTop:6}}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Still-open fields */}
              {flaggedFields.length > 0 && (
                <div className="card" style={{padding:"14px 18px", marginBottom:18, borderLeft:"3px solid var(--yellow-500)"}}>
                  <div className="eyebrow eyebrow--yellow" style={{marginBottom:8}}>{t("discovery.attest.stillOpen", { count: flaggedFields.length })}</div>
                  <div style={{display:"flex", flexDirection:"column", gap:6}}>
                    {flaggedFields.map(({ ch, f, st }, i) => (
                      <button key={i} className="btn btn--link" style={{fontSize:12.5, textAlign:"left", padding:0, color:"var(--c-dim)"}} onClick={() => openChapter(ch.key)}>
                        <span style={{color:st.color, marginRight:6}}>●</span> {chapterLabel(ch)} · {fieldLabel(ch.key, f)} — {t("discovery.fieldStatus." + st.kind)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Three attestation statements */}
              <div className="card" style={{padding:"18px 20px", marginBottom:16}}>
                <div className="eyebrow" style={{marginBottom:12}}>{t("discovery.attest.attestation")}</div>
                <div style={{display:"flex", flexDirection:"column", gap:12}}>
                  {[
                    ["authority", t("discovery.statement.authority")],
                    ["reflects", t("discovery.statement.reflects")],
                    ["aspirationalMarked", t("discovery.statement.aspirational")],
                  ].map(([k, label]) => (
                    <label key={k} style={{display:"flex", gap:10, alignItems:"flex-start", fontSize:13.5, color:"var(--c-ink)", cursor:"pointer", lineHeight:1.5}}>
                      <input type="checkbox" checked={statements[k]} onChange={(e) => setStatements(s => ({ ...s, [k]: e.target.checked }))} style={{marginTop:3}} />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {attestErr && (
                <div className="card" style={{padding:"12px 16px", marginBottom:16, borderLeft:"3px solid var(--pink-500)", fontSize:13, color:"var(--c-ink)"}}>{attestErr}</div>
              )}

              <div style={{display:"flex", gap:12, alignItems:"center", flexWrap:"wrap"}}>
                <button className="btn btn--primary btn--lg" disabled={!allChecked || attestBusy} onClick={submitAttest}>
                  {attestBusy ? t("discovery.attest.signing") : <>{t("discovery.attest.signActivate")} <Icon name="arrow" size={14} /></>}
                </button>
                {!allChecked && <span style={{fontSize:12, color:"var(--c-faint)"}}>{t("discovery.attest.confirmAllThree")}</span>}
              </div>
            </>
          )}
        </>
      )}

      {/* Learning toast */}
      {toast && (
        <div style={{position:"fixed", bottom:28, left:"50%", transform:"translateX(-50%)", zIndex:60, background:"var(--c-inverse)", color:"#fff", borderRadius:10, padding:"11px 18px", fontSize:13.5, boxShadow:"var(--shadow-lg)", display:"flex", alignItems:"center", gap:9, maxWidth:560}}>
          <BrandolphDot /> {toast}
        </div>
      )}
    </div>
  );
}

function DiscoveryStep3({ go, runContext }) {
  const { t } = useLocale();
  const live = useLiveBio({ pollMs: 10000, brandId: runContext?.brandId });
  const positioning = live.bio?.payload?.identity?.positioning || "the clearest supported version of your positioning";
  const gapCount = Array.isArray(live.bio?.payload?.missing) ? live.bio.payload.missing.length : 0;
  return (
    <div style={{maxWidth: 580, margin:"80px auto 0", textAlign:"center"}}>
      <div style={{display:"flex", justifyContent:"center", marginBottom: 22}}>
        <BrandolphAvatar size={64} />
      </div>
      <h1 style={{fontSize: 28, letterSpacing:"-0.01em", marginBottom: 14}}>{t("discovery.step3.title")}</h1>
      <div className="stream" style={{display:"flex", flexDirection:"column", gap: 12, marginBottom: 28, textAlign:"left"}}>
        <BrandolphLine html={`*I've read the sources for ${live.brandName || "your brand"}.* The BIO now anchors on: ${positioning}`} />
        <BrandolphLine html={`*Two things to know before we go further.* One — the BIO is editable. If I got something wrong, fix it. Two — I don't pretend to know what I don't know. I left ${gapCount} ${gapCount === 1 ? "field" : "fields"} flagged for evidence or Steward review.`} />
        <BrandolphLine html="*The first brief is on you.* When you have something to ship, brief me on the change you want — not the deliverable. I'll do the deliverable part." />
      </div>
      <button className="btn btn--primary btn--lg" onClick={() => go("home")}>
        {t("discovery.step3.openBrandolph")} <Icon name="arrow" size={14} />
      </button>
    </div>
  );
}

function Discovery({ go, newBrand = false }) {
  const [step, setStep] = useDState(1);
  const [phase, setPhase] = useDState("form"); // form | running | results
  const [runContext, setRunContext] = useDState(null);
  return (
    <div style={{padding:"24px 36px 60px", maxWidth: 1180, margin:"0 auto"}}>
      <DiscoveryStepper step={step} />
      {step === 1 && <DiscoveryStep1 newBrand={newBrand} onNext={(context) => { setRunContext(context); setStep(2); setPhase("running"); }} />}
      {step === 2 && phase === "running"  && <DiscoveryStep2Running runContext={runContext} onDone={() => setPhase("results")} onExit={() => go("bio")} />}
      {step === 2 && phase === "results"  && <DiscoveryStep2Results runContext={runContext} onConfirm={() => setStep(3)} />}
      {step === 3 && <DiscoveryStep3 go={go} runContext={runContext} />}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* BIO VIEWER                                                        */

/* ─── API payload ↔ BioFieldList shape mappers ─────────────────────
   The BIO viewer's tabs render flat arrays of `{ label, value, multi? }`.
   The API payload is nested per-section. These functions translate
   between the two so we can keep the existing UI but consume real data.
   Round-trip stable: payloadToFields → user edits → fieldsToPayload =
   the same shape the API expects. */
function payloadToFields(payload) {
  const p = payload || {};
  /* Live confidence map: payload.confidence["<section>.<key>"] = { conf, source }.
     Old BIOs have no map → cf() returns {} → conf/source stay undefined and the
     downstream Confidence/EditableField components render exactly as before. */
  const cmap = p.confidence || {};
  const fieldMeta = p.fieldMeta || {};
  const cf = (section, key) => cmap[`${section}.${key}`] || {};
  const field = (section, key, label, extra = {}) => {
    const { conf, source } = cf(section, key);
    const meta = fieldMeta?.[section]?.[key] || {};
    return { key, label: meta.label || label, conf, source, ...extra, ...(typeof meta.multi === "boolean" ? { multi: meta.multi } : {}) };
  };
  const humanize = (key) => String(key)
    .replace(/^custom_/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
  const customFields = (section, known) => Object.entries(p[section] || {})
    .filter(([key]) => !known.includes(key))
    .map(([key, value]) => ({
      ...field(section, key, humanize(key), { multi: Array.isArray(value) }),
      value,
    }));
  return {
    identity: [
      { ...field("identity", "positioning", "Positioning", { italic: true }), value: p.identity?.positioning || "" },
      { ...field("identity", "category", "Category"), value: p.identity?.category || "" },
      { ...field("identity", "founded", "Founded"),   value: p.identity?.founded || "" },
      { ...field("identity", "pillars", "Pillars", { multi: true }), value: p.identity?.pillars || [] },
      ...customFields("identity", ["positioning", "category", "founded", "pillars"]),
    ],
    audience: [
      { ...field("audience", "primary", "Primary"),     value: p.audience?.primary || "" },
      { ...field("audience", "secondary", "Secondary"), value: p.audience?.secondary || "" },
      { ...field("audience", "tertiary", "Tertiary"),   value: p.audience?.tertiary || "" },
      { ...field("audience", "jtbd", "Jobs to be done", { multi: true }), value: p.audience?.jtbd || [] },
      ...customFields("audience", ["primary", "secondary", "tertiary", "jtbd"]),
    ],
    voice: [
      { ...field("voice", "register", "Register"),    value: p.voice?.register || "" },
      { ...field("voice", "forbidden", "Forbidden", { multi: true }), value: p.voice?.forbidden || [] },
      { ...field("voice", "rhythm", "Rhythm"),        value: p.voice?.rhythm || "" },
      { ...field("voice", "signatures", "Signatures", { multi: true }), value: p.voice?.signatures || [] },
      ...customFields("voice", ["register", "forbidden", "rhythm", "signatures"]),
    ],
    goals: [
      { ...field("goals", "northStar", "North star"), value: p.goals?.northStar || "" },
      { ...field("goals", "q2", "This quarter"),      value: p.goals?.q2 || "" },
      { ...field("goals", "q3", "Next quarter"),      value: p.goals?.q3 || "" },
      ...customFields("goals", ["northStar", "q2", "q3"]),
    ],
    strategic: {
      watchouts: p.strategic?.watchouts || [],
      notList:   p.strategic?.notList || [],
      /* Gaps now come from the live payload's `missing` list (each
         { field, why }). The Gaps list + StringListEditor render plain
         strings, so flatten each entry to "field — why". Old BIOs have no
         `missing` → empty → UI hides it. Tolerate plain strings too. */
      gaps:      (p.missing || []).map(m =>
                   typeof m === "string" ? m
                   : [m?.field, m?.why].filter(Boolean).join(" — ")),
      diagnosis: p.strategic?.diagnosis || "",
    },
    /* Visual tab consumes these arrays directly. */
    palette: p.visual?.palette || [],
    type:    p.visual?.type || [],
    imagery: p.visual?.imagery || [],
    avoid:   p.visual?.avoid || [],
    grade:   p.visual?.grade || "",
  };
}

function fieldsToPayload(bio, prevPayload) {
  const toSection = (fields) => Object.fromEntries((fields || []).map((f) => [f.key, f.value]));
  const confidence = { ...(prevPayload?.confidence || {}) };
  const fieldMeta = { ...(prevPayload?.fieldMeta || {}) };
  for (const [section, fields] of [["identity", bio.identity], ["audience", bio.audience], ["voice", bio.voice], ["goals", bio.goals]]) {
    for (const key of Object.keys(confidence)) {
      if (key.startsWith(`${section}.`)) delete confidence[key];
    }
    fieldMeta[section] = {};
    for (const f of fields || []) {
      const parsedConfidence = Number(f.conf);
      if (Number.isFinite(parsedConfidence)) confidence[`${section}.${f.key}`] = { conf: parsedConfidence, source: f.source || "manual entry" };
      fieldMeta[section][f.key] = { label: f.label || f.key, multi: !!f.multi };
    }
  }
  const missing = (bio.strategic?.gaps || []).filter(Boolean).map((entry) => {
    const [field, ...why] = String(entry).split(" — ");
    return { field: why.length ? field : "manual", why: why.length ? why.join(" — ") : field };
  });
  return {
    ...(prevPayload || {}),
    confidence,
    fieldMeta,
    missing,
    identity: toSection(bio.identity),
    audience: toSection(bio.audience),
    voice: toSection(bio.voice),
    goals: toSection(bio.goals),
    strategic: {
      ...(prevPayload?.strategic || {}),
      watchouts: bio.strategic?.watchouts || [],
      notList:   bio.strategic?.notList || [],
      diagnosis: bio.strategic?.diagnosis || "",
    },
    visual: {
      ...(prevPayload?.visual || {}),
      palette: bio.palette || [],
      type:    bio.type || [],
      imagery: bio.imagery || [],
      avoid:   bio.avoid || [],
      grade:   bio.grade || "",
    },
  };
}

/* SelfCertPanel — stage-1 client attestation. Three statements → POST
   /self-certify → flips self_certified, which UNLOCKS briefing. Production
   still waits for a human Steward. (The richer per-field accurate/aspirational
   marking lands with the discovery S12 rebuild in M3.) */
function SelfCertPanel({ brandId, bio, onDone }) {
  const { t } = useLocale();
  const [st, setSt] = useDState({ authority: false, reflects: false, aspirationalMarked: false });
  const [busy, setBusy] = useDState(false);
  const [err, setErr] = useDState(null);
  const allChecked = st.authority && st.reflects && st.aspirationalMarked;

  if (bio?.self_certified) {
    return (
      <div className="card" style={{padding:"10px 14px", marginBottom: 18, borderLeft:"3px solid var(--green-500)", display:"flex", alignItems:"center", gap: 10}}>
        <Icon name="check" size={15} />
        <div style={{fontSize: 13, color:"var(--c-ink)"}}>
          <strong>{t("discovery.selfCert.attestedBold")}</strong> — {t("discovery.selfCert.attestedRest")}
        </div>
      </div>
    );
  }

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await apiFetch(`/api/bios/${brandId}/self-certify`, {
        method: "POST",
        body: JSON.stringify({ statements: { authority: st.authority, reflects: st.reflects, aspirationalMarked: st.aspirationalMarked }, statementVersion: "1" }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (j.code === "HIGH_IMPORTANCE_GAPS") throw new Error(t("discovery.selfCert.fillBefore", { fields: (j.fields || []).join(", ") }));
        if (j.code === "BELOW_MIN_SCORE") throw new Error(t("discovery.selfCert.belowScore", { score: j.score, minScore: j.minScore }));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      if (onDone) onDone();
    } catch (e) { setErr(e?.message || String(e)); } finally { setBusy(false); }
  };

  const Check = ({ k, children }) => (
    <label style={{display:"flex", gap: 8, alignItems:"flex-start", fontSize: 12.5, color:"var(--c-ink)", cursor:"pointer", lineHeight: 1.45}}>
      <input type="checkbox" checked={st[k]} onChange={(e) => setSt((s) => ({ ...s, [k]: e.target.checked }))} style={{marginTop: 2}} />
      <span>{children}</span>
    </label>
  );

  return (
    <div className="card" style={{padding:"14px 16px", marginBottom: 18, borderLeft:"3px solid var(--yellow-500)"}}>
      <div className="eyebrow eyebrow--yellow" style={{marginBottom: 8}}>{t("discovery.selfCert.eyebrow")}</div>
      <div style={{fontSize: 12.5, color:"var(--c-dim)", marginBottom: 10, lineHeight: 1.5}}>
        {t("discovery.selfCert.desc")}
      </div>
      <div style={{display:"flex", flexDirection:"column", gap: 8, marginBottom: 12}}>
        <Check k="authority">{t("discovery.statement.authority")}</Check>
        <Check k="reflects">{t("discovery.statement.reflects")}</Check>
        <Check k="aspirationalMarked">{t("discovery.statement.aspirational")}</Check>
      </div>
      {err && <div style={{fontSize: 12, color:"var(--pink-500)", marginBottom: 8}}>{err}</div>}
      <button className="btn btn--primary btn--sm" disabled={!allChecked || busy} onClick={submit}>
        {busy ? t("discovery.selfCert.submitting") : t("discovery.selfCert.submit")}
      </button>
    </div>
  );
}

/* humanizeReasonCode — turn a Steward `reject_reason_code` (snake_case enum)
   into human-readable copy. Known codes get curated phrasing; anything else
   falls back to Title Case so the client never sees a raw enum value. */
function humanizeReasonCode(code) {
  if (!code) return "";
  const known = new Set([
    "insufficient_evidence", "out_of_scope", "brand_mismatch", "inaccurate",
    "incomplete", "low_quality", "aspirational_unmarked", "needs_sources", "duplicate",
  ]);
  if (known.has(code)) return tr("discovery.reasonCode." + code);
  /* Unknown enum → Title Case fallback (never surface a raw snake_case value). */
  return String(code).replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/* diffText — render a before/after value that may be a string, array, or
   object. Empty/missing values show as an em dash so a "→ —" reads cleanly. */
function diffText(v) {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (typeof v === "object") { try { return JSON.stringify(v); } catch { return String(v); } }
  return String(v);
}

/* StewardReviewPanel — "From your Steward". Surfaces the Steward's decision
   when it needs the client's attention: requested changes, a returned BIO, or
   conditions attached to certification. Styled to match the cert chip (card +
   left accent + eyebrow). `approve` / null render nothing. */
function StewardReviewPanel({ review, onEdit }) {
  const { t } = useLocale();
  const decision = review?.decision;
  if (!decision || !["return_changes", "reject", "approve_with_conditions"].includes(decision)) return null;

  const by = review.steward_first_name || t("discovery.steward.defaultName");
  const when = formatCertDate(review.decided_at);
  const notes = review.steward_notes;

  /* Per-decision presentation. All colors come from tokens, never literals. */
  const cfg = {
    return_changes: {
      accent: "var(--yellow-500)", eyebrowCls: "eyebrow--yellow",
      heading: t("discovery.steward.returnHeading"),
      items: review.required_changes || [], marker: "→", markerColor: "var(--orange-600)",
      cta: t("discovery.steward.returnCta"),
    },
    reject: {
      accent: "var(--pink-500)", eyebrowCls: "eyebrow--pink",
      heading: t("discovery.steward.rejectHeading"),
      items: [], marker: null, markerColor: null,
      cta: t("discovery.steward.rejectCta"),
    },
    approve_with_conditions: {
      accent: "var(--green-500)", eyebrowCls: "eyebrow--green",
      heading: t("discovery.steward.conditionsHeading"),
      items: review.conditions || [], marker: "✓", markerColor: "var(--green-600)",
      cta: null,
    },
  }[decision];

  const reason = decision === "reject" ? humanizeReasonCode(review.reject_reason_code) : "";
  const hasBody = !!reason || cfg.items.length > 0 || !!notes;

  return (
    <div className="card" style={{padding:"14px 16px", marginBottom: 18, borderLeft:`3px solid ${cfg.accent}`}}>
      <div className={"eyebrow " + cfg.eyebrowCls} style={{marginBottom: 6}}>{t("discovery.steward.fromSteward")}</div>
      <div style={{fontSize: 14.5, fontWeight: 600, color:"var(--c-ink)", marginBottom: 4}}>{cfg.heading}</div>
      <div style={{fontSize: 12, color:"var(--c-faint)", marginBottom: hasBody ? 10 : (cfg.cta ? 12 : 0)}}>
        {by}{when ? ` · ${when}` : ""}
      </div>

      {reason && (
        <div style={{marginBottom: (cfg.items.length || notes) ? 10 : (cfg.cta ? 12 : 0)}}>
          <span className="pill" style={{color:"var(--pink-500)", fontSize: 11.5}}>{reason}</span>
        </div>
      )}

      {cfg.items.length > 0 && (
        <ul style={{margin:"0 0 " + (notes || cfg.cta ? "10px" : "0"), padding: 0, listStyle:"none", display:"flex", flexDirection:"column", gap: 7}}>
          {cfg.items.map((it, i) => (
            <li key={i} style={{display:"flex", gap: 8, alignItems:"flex-start", fontSize: 13, color:"var(--c-ink)", lineHeight: 1.5}}>
              {cfg.marker && <span style={{color: cfg.markerColor}}>{cfg.marker}</span>}
              <span>{it}</span>
            </li>
          ))}
        </ul>
      )}

      {notes && (
        <div style={{fontSize: 12.5, color:"var(--c-dim)", lineHeight: 1.5, fontStyle:"italic", borderLeft:`2px solid ${cfg.accent}`, paddingLeft: 10, marginBottom: cfg.cta ? 12 : 0}}>
          “{notes}” <span style={{fontStyle:"normal", color:"var(--c-faint)"}}>— {by}</span>
        </div>
      )}

      {cfg.cta && (
        <button className="btn btn--primary btn--sm" onClick={onEdit}>
          <Icon name="edit" size={14} /> {cfg.cta}
        </button>
      )}
    </div>
  );
}

/* StewardDiffPanel — collapsible "What your Steward changed". Lists each edit
   the Steward made vs. the prior version as before → after (muted/struck
   "before", emphasized "after"). Hidden when the Steward changed nothing. */
function StewardDiffPanel({ diff }) {
  const { t } = useLocale();
  const [open, setOpen] = useDState(false);
  if (!Array.isArray(diff) || diff.length === 0) return null;
  return (
    <div className="card" style={{padding:"12px 16px", marginBottom: 18, borderLeft:"3px solid var(--green-500)"}}>
      <button onClick={() => setOpen((o) => !o)}
        style={{display:"flex", alignItems:"center", gap: 8, width:"100%", background:"transparent", border:"none", cursor:"pointer", padding: 0, textAlign:"left"}}>
        <Icon name="check" size={14} />
        <span style={{fontSize: 13.5, fontWeight: 500, color:"var(--c-ink)"}}>
          {t("discovery.diff.title", { count: diff.length })}
        </span>
        <span style={{marginLeft:"auto", fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--c-faint)"}}>{open ? t("discovery.diff.hide") : t("discovery.diff.show")}</span>
      </button>
      {open && (
        <div style={{marginTop: 12, display:"flex", flexDirection:"column", gap: 10}}>
          {diff.map((d, i) => (
            <div key={i} style={{display:"grid", gridTemplateColumns:"140px 1fr", gap: 12, alignItems:"start", paddingBottom: i < diff.length - 1 ? 10 : 0, borderBottom: i < diff.length - 1 ? "1px solid var(--c-line)" : "none"}}>
              <div style={{fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--c-faint)", letterSpacing:"0.04em", textTransform:"uppercase"}}>{d.label || d.field}</div>
              <div style={{fontSize: 13, lineHeight: 1.55}}>
                <span style={{color:"var(--c-faint)", textDecoration:"line-through"}}>{diffText(d.before)}</span>
                <span style={{color:"var(--c-faint)", margin:"0 6px"}}>→</span>
                <span style={{color:"var(--c-ink)", fontWeight: 500}}>{diffText(d.after)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* BIO viewer field labels double as round-trip lookup keys in
   payloadToFields/fieldsToPayload, so the stored label stays English; this map
   translates it for DISPLAY only. Labels not in the map (user-added fields)
   render as-is. */
const BIO_FIELD_LABEL_KEYS = {
  "Positioning": "positioning", "Category": "category", "Founded": "founded", "Pillars": "pillars",
  "Primary": "primary", "Secondary": "secondary", "Tertiary": "tertiary", "Jobs to be done": "jtbd",
  "Register": "register", "Forbidden": "forbidden", "Rhythm": "rhythm", "Signatures": "signatures",
  "North star": "northStar", "This quarter": "thisQuarter", "Next quarter": "nextQuarter",
};
const bioFieldLabel = (label) => {
  const key = BIO_FIELD_LABEL_KEYS[label];
  return key ? tr("discovery.bioField." + key) : label;
};

function BioViewer({ go, bioScore = 91 }) {
  const { t } = useLocale();
  const [tab, setTab] = useDState("identity");
  const [feed, setFeed] = useDState("");
  const [reading, setReading] = useDState(false);
  const [toast, setToast] = useDState(null);
  const [editing, setEditing] = useDState(false);
  const [saving, setSaving] = useDState(false);
  const [saveErr, setSaveErr] = useDState(null);
  const [reviewBusy, setReviewBusy] = useDState(false);
  const [hasUnappliedSourceChanges, setHasUnappliedSourceChanges] = useDState(false);

  /* Live cert state + payload — polls /api/bios/:brandId. The BIO body
     below renders from `live.bio.payload`; the cert chip from `live.cert`. */
  const live = useLiveBio({ pollMs: 5000 });

  /* Local editable view; hydrated from the live payload each time the
     server's BIO changes (version bump). Discards in-flight edits when
     a new server version arrives — that's the right behavior because the
     server version is the truth and our edits are based off the prior. */
  const [bio, setBio] = useDState(null);
  const [sources, setSources] = useDState([]);

  useDEffect(() => {
    if (live.bio?.payload) setBio(payloadToFields(live.bio.payload));
  }, [live.bio?.id]);

  useDEffect(() => {
    if (!live.brandId) return;
    let alive = true;
    supabase.from("bio_sources").select("id, kind, bucket, src, signals, raw_ref, created_at")
      .eq("brand_id", live.brandId).order("created_at", { ascending: false })
      .then(({ data }) => { if (alive && data) setSources(data.map(s => ({ src: s.src, date: new Date(s.created_at).toLocaleDateString(undefined,{day:"numeric",month:"short"}), n: s.signals?.markdown_chars ? Math.round(s.signals.markdown_chars / 200) : 6, bucket: s.bucket, raw_ref: s.raw_ref }))); });
    return () => { alive = false; };
  }, [live.brandId, live.bio?.id]);

  const score = live.bio?.score ?? 0;
  const patch = (key, value) => setBio(b => b ? { ...b, [key]: value } : b);
  const patchStrategic = (key, value) => setBio(b => b ? { ...b, strategic: { ...b.strategic, [key]: value } } : b);

  const saveBio = async () => {
    if (!bio || !live.brandId) return;
    setSaving(true); setSaveErr(null);
    try {
      const payload = fieldsToPayload(bio, live.bio?.payload);
      const res = await apiFetch(`/api/bios/${live.brandId}`, {
        method: "PATCH",
        body: JSON.stringify({ payload, score }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      flash(t("discovery.bio.savedVersion", { version: json.bio?.version }));
      setEditing(false);
      live.refresh();
    } catch (e) {
      setSaveErr(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const flash = (msg) => { setToast(msg); clearTimeout(window.__bioT); window.__bioT = setTimeout(() => setToast(null), 2800); };

  /* Client-initiated human review of the CURRENT BIO — no edit required.
     Enqueues a Steward job server-side (idempotent). */
  const requestReview = async () => {
    if (!live.brandId || reviewBusy) return;
    if (hasUnappliedSourceChanges) {
      flash("Update the BIO with pending evidence before requesting review");
      return;
    }
    setReviewBusy(true);
    try {
      const res = await apiFetch(`/api/bios/${live.brandId}/request-review`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      flash(json.reused ? t("discovery.bio.reviewInProgress") : t("discovery.bio.sentForReview"));
      live.refresh();
    } catch (e) {
      flash(t("discovery.bio.couldntRequestReview", { error: e?.message || e }));
    } finally {
      setReviewBusy(false);
    }
  };

  const addReference = async (labelArg, kind) => {
    const ref = (labelArg ?? feed).trim();
    if (!ref || reading || !live.brandId) return;
    setReading(true); setFeed("");
    try {
      const res = await apiFetch(`/api/bios/${live.brandId}/sources`, {
        method: "POST",
        body: JSON.stringify({ sources: [{ kind: kind || "url_reference", bucket: null, src: ref }] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      /* Optimistic prepend so user sees it immediately; the next poll
         will hydrate the real signals/markdown_chars. */
      setSources(s => [{ src: ref, date: t("discovery.sources.justNow"), n: 0, fresh: true }, ...s]);
      setHasUnappliedSourceChanges(true);
      flash(t("discovery.bio.added", { ref: ref.slice(0, 40) }));
    } catch (e) {
      flash(t("discovery.bio.couldntAdd", { error: e?.message || e }));
    } finally {
      setReading(false);
    }
  };

  const tabs = ["identity", "audience", "competitive", "voice", "visual", "goals", "strategic", "sources"];

  const conf = score;
  const tone = conf >= 85
    ? { color:"var(--green-600)", word:t("discovery.bioTone.well.word"), hint:t("discovery.bioTone.well.hint") }
    : conf >= 65
    ? { color:"var(--orange-600)", word:t("discovery.bioTone.filling.word"), hint:t("discovery.bioTone.filling.hint") }
    : { color:"var(--pink-500)", word:t("discovery.bioTone.needs.word"), hint:t("discovery.bioTone.needs.hint") };

  return (
    <div style={{padding:"24px 36px 60px"}}>
      {/* Live cert chip — pulls real DB state, polls every 5s */}
      {live.brandId && (
        <div className="card" style={{
          padding:"10px 14px", marginBottom: 18,
          borderLeft: `3px solid ${live.cert ? "var(--green-500)" : "var(--yellow-500)"}`,
          display:"flex", alignItems:"center", justifyContent:"space-between", gap: 12,
        }}>
          <div style={{display:"flex", alignItems:"center", gap: 10}}>
            <span style={{
              width: 8, height: 8, borderRadius:"50%",
              background: live.cert ? "var(--green-500)" : "var(--yellow-500)",
              animation: live.cert ? "none" : "pulse 1.4s ease-in-out infinite",
            }} />
            <div>
              <div style={{fontSize: 13.5, color:"var(--c-ink)", fontWeight: 500}}>
                {live.cert ? (
                  <>{t("discovery.results.certifiedBy")} <span style={{color:"var(--green-600)"}}>{live.cert.byName}</span> · {formatCertDate(live.cert.at)}</>
                ) : live.reviewPending && live.bio ? (
                  <>{t("discovery.bio.reviewingThis")}</>
                ) : live.bio ? (
                  <>{t("discovery.bio.awaitingCert")}</>
                ) : (
                  <>{t("discovery.bio.noBioYet")}</>
                )}
              </div>
              {live.bio && (
                <div style={{fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--c-faint)", marginTop: 2}}>
                  {live.brandName} · {t("discovery.bio.versionScore", { version: live.bio.version, score: live.bio.score ?? "—" })}
                </div>
              )}
              {!live.cert && live.focusCount > 0 && (
                <div style={{fontSize: 12, color:"var(--c-dim)", marginTop: 6, lineHeight: 1.5}}>
                  {t("discovery.bio.flaggedAreas", { count: live.focusCount })}
                </div>
              )}
              {live.cert?.notes && (
                <div style={{fontSize: 12.5, color:"var(--c-dim)", marginTop: 6, lineHeight: 1.5, fontStyle:"italic", borderLeft:"2px solid var(--green-300, rgba(127,163,122,0.4))", paddingLeft: 10}}>
                  “{live.cert.notes}” <span style={{fontStyle:"normal", color:"var(--c-faint)"}}>— {live.cert.byName}</span>
                </div>
              )}
            </div>
          </div>
          {!live.cert && live.bio && (
            <span style={{fontSize: 11.5, color:"var(--c-dim)", fontStyle:"italic", whiteSpace:"nowrap"}}>
              {live.reviewPending ? t("discovery.bio.inReview") : t("discovery.bio.within24h")}
            </span>
          )}
        </div>
      )}

      {/* From your Steward — change requests / returned BIO / conditions.
          CTA drops the BIO into the existing edit flow (Save → re-certify). */}
      {live.brandId && <StewardReviewPanel review={live.review} onEdit={() => setEditing(true)} />}

      {/* What your Steward changed — before → after diff of the Steward's edits */}
      {live.brandId && <StewardDiffPanel diff={live.diff} />}

      {/* Stage-1 self-certification — unlocks briefing (shown until human cert lands) */}
      {live.brandId && live.bio && !live.cert && (
        <SelfCertPanel brandId={live.brandId} bio={live.bio} onDone={live.refresh} />
      )}

      {/* Hero */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 320px", gap: 28, marginBottom: 28, alignItems:"end"}}>
        <div>
          <div className="eyebrow" style={{marginBottom: 6}}>{t("discovery.bio.eyebrow")} · {live.brandName || "Your brand"}</div>
          <div style={{display:"flex", alignItems:"baseline", gap: 14}}>
            <span style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize: 88, lineHeight: 1, color: tone.color, fontWeight: 500}}>
              <Counter to={conf} />
            </span>
            <div>
              <div style={{fontFamily:"var(--font-mono)", fontSize:11, color: tone.color, letterSpacing:"0.06em", textTransform:"uppercase"}} title={tone.hint}>{t("discovery.bio.of100")} · {tone.word}</div>
              <div style={{fontSize: 13, color:"var(--c-faint)", marginTop: 4, lineHeight: 1.5, maxWidth: 320}}>{tone.hint}</div>
              <div style={{fontSize: 14, color:"var(--c-dim)", marginTop: 6}}>
                {live.cert
                  ? t("discovery.bio.certifiedDate", { date: formatCertDate(live.cert.at) })
                  : live.bio
                  ? <>{t("discovery.bio.uncertified")} <span style={{color:"var(--c-faint)", fontFamily:"var(--font-mono)", fontSize:11}} title={t("discovery.bio.versionTitle", { version: live.bio.version })}>· v{live.bio.version}</span></>
                  : ""}
              </div>
            </div>
          </div>
          <div style={{marginTop: 14, height: 6, background:"var(--neutral-50)", borderRadius:999, overflow:"hidden", maxWidth: 600}}>
            <div style={{height:"100%", width: conf + "%", background: tone.color, borderRadius:999, transition:"width 800ms ease"}} />
          </div>
        </div>
        <div style={{display:"flex", flexDirection:"column", gap: 10, alignItems:"flex-end"}}>
          <button className="btn btn--primary" onClick={() => setTab("sources")} disabled={!live.brandId}>
            <Icon name="plus" size={14} /> {t("discovery.bio.feedBrandolph")}
          </button>
          {!editing ? (
            <button className="btn btn--ghost btn--sm" onClick={() => setEditing(true)} disabled={!bio}>
              <Icon name="edit" size={14} /> {t("discovery.bio.editBio")}
            </button>
          ) : (
            <div style={{display:"flex", gap: 6, alignItems:"center"}}>
              <button className="btn btn--ghost btn--sm" disabled={saving}
                onClick={() => { setEditing(false); if (live.bio?.payload) setBio(payloadToFields(live.bio.payload)); setSaveErr(null); }}>
                {t("discovery.common.cancel")}
              </button>
              <button className="btn btn--primary btn--sm" disabled={saving || !bio} onClick={saveBio}>
                <Icon name="check" size={14} /> {saving ? t("discovery.bio.savingChanges") : t("discovery.bio.saveChanges")}
              </button>
            </div>
          )}
          <button className="btn btn--ghost btn--sm" onClick={() => go("discovery")}>
            <Icon name="refresh" size={14} /> {t("discovery.bio.rerunDiscovery")}
          </button>
          {live.bio && (
            <button className="btn btn--ghost btn--sm" onClick={requestReview}
              disabled={reviewBusy || live.reviewPending || hasUnappliedSourceChanges}
              title={hasUnappliedSourceChanges ? "Update the BIO with pending evidence before requesting review" : live.reviewPending ? t("discovery.bio.reviewInProgressTitle") : t("discovery.bio.requestReviewTitle")}>
              <Icon name="mail" size={14} /> {live.reviewPending ? t("discovery.bio.inReviewShort") : reviewBusy ? t("discovery.bio.sending") : t("discovery.bio.requestHumanReview")}
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div className="card" style={{padding:"10px 16px", marginBottom:14, borderLeft:"3px solid var(--brand, var(--yellow-500))", display:"flex", alignItems:"center", gap:10}}>
          <Icon name="edit" size={15} />
          <span style={{fontSize:13, color:"var(--c-ink)"}}>{t("discovery.bio.editingBanner")}</span>
        </div>
      )}
      {hasUnappliedSourceChanges && (
        <div className="card" style={{padding:"10px 14px", marginBottom:14, borderLeft:"3px solid var(--yellow-500)", display:"flex", justifyContent:"space-between", alignItems:"center", gap:12}}>
          <span style={{fontSize:13}}>Review the changes before requesting certification.</span>
          <button className="btn btn--primary btn--sm" onClick={() => go("discovery")}>Update BIO</button>
        </div>
      )}
      {saveErr && (
        <div className="card" style={{padding:"10px 14px", marginBottom: 14, borderLeft:"3px solid var(--pink-500)", color:"var(--c-ink)", fontSize: 13}}>{saveErr}</div>
      )}

      {/* Empty state — no BIO extracted yet */}
      {!live.loading && !live.bio && live.brandId && (
        <div className="card" style={{padding:"56px 32px", textAlign:"center", maxWidth: 580, margin:"40px auto"}}>
          <h2 style={{
            margin:"0 0 14px", fontFamily:"Georgia, serif", fontStyle:"italic",
            fontSize: 28, lineHeight: 1.2, letterSpacing:"-0.005em", fontWeight: 400, color:"var(--c-ink)",
          }}>
            {t("discovery.bio.noCanon")}
          </h2>
          <p style={{margin:"0 0 22px", fontSize: 14, color:"var(--c-dim)", lineHeight: 1.6}}>
            {t("discovery.bio.noCanonDesc")}
          </p>
          <div style={{display:"flex", gap: 10, justifyContent:"center"}}>
            <button className="btn btn--primary" onClick={() => go("discovery")}>
              <Icon name="sparkles" size={13} /> {t("discovery.bio.startDiscovery")}
            </button>
          </div>
        </div>
      )}

      {/* Tabs — only when we have a BIO */}
      {bio && (
        <div className="card" style={{padding: 0, overflow:"hidden"}}>
          <div className="tabs">
            {tabs.map((k) => (
              <button key={k} className={"tab" + (tab === k ? " tab--active" : "")} onClick={() => setTab(k)}>{t("discovery.tab." + k)}</button>
            ))}
          </div>
          <div style={{padding: 28}}>
            {["identity","audience","voice","goals"].includes(tab) && (
              <div style={{display:"grid", gridTemplateColumns:"180px 1fr 110px", gap:18, paddingBottom:10, marginBottom:2, borderBottom:"1px solid var(--c-line)", alignItems:"baseline"}}>
                <div className="eyebrow" style={{margin:0}}>{t("discovery.table.field")}</div>
                <div className="eyebrow" style={{margin:0}}>{t("discovery.table.whatWeKnow")}</div>
                <div style={{textAlign:"right"}}>
                  <div className="eyebrow" style={{margin:0}} title={t("discovery.table.confidenceTitle")}>{t("discovery.table.confidence")}</div>
                  <div style={{fontFamily:"var(--font-mono)", fontSize:9.5, color:"var(--c-faint)", letterSpacing:"0.04em", textTransform:"uppercase", marginTop:3}}>{t("discovery.table.lowHigh")}</div>
                </div>
              </div>
            )}
            {tab === "identity"    && <BioFieldList items={bio.identity}    editing={editing} onChange={v => patch("identity", v)} />}
            {tab === "audience"    && <BioFieldList items={bio.audience}    editing={editing} onChange={v => patch("audience", v)} />}
            {tab === "competitive" && (
              <div style={{padding: 24, textAlign:"center", color:"var(--c-faint)", fontSize: 13, fontStyle:"italic"}}>
                {t("discovery.competitive.placeholder")}
              </div>
            )}
            {tab === "voice"       && <BioFieldList items={bio.voice}       editing={editing} onChange={v => patch("voice", v)} />}
            {tab === "visual"      && <BioVisual bio={bio} patch={patch} editing={editing} />}
            {tab === "goals"       && <BioFieldList items={bio.goals}       editing={editing} onChange={v => patch("goals", v)} />}
            {tab === "strategic"   && <BioStrategic strat={bio.strategic} patchStrategic={patchStrategic} editing={editing} />}
            {tab === "sources"     && <BioSources brandId={live.brandId} sources={sources} setSources={setSources} feed={feed} setFeed={setFeed} reading={reading} addReference={addReference} onSourceAdded={() => setHasUnappliedSourceChanges(true)} editing={editing} go={go} />}
          </div>
        </div>
      )}

      {/* Learning toast */}
      {toast && (
        <div style={{position:"fixed", bottom:28, left:"50%", transform:"translateX(-50%)", zIndex:60, background:"var(--c-inverse)", color:"#fff", borderRadius:10, padding:"11px 18px", fontSize:13.5, boxShadow:"var(--shadow-lg)", display:"flex", alignItems:"center", gap:9, maxWidth:560, animation:"cvPopIn 200ms ease"}}>
          <BrandolphDot /> {toast}
        </div>
      )}
    </div>
  );
}

/* ---- Editing primitives ----------------------------------------- */
const EDIT_INPUT = { width:"100%", border:"1px solid var(--c-line-2)", borderRadius:7, background:"var(--c-bg)", padding:"7px 10px", fontSize:13.5, color:"var(--c-ink)", outline:"none", fontFamily:"inherit", boxSizing:"border-box" };
const CHIP_X = { border:"none", background:"transparent", cursor:"pointer", color:"var(--c-faint)", fontSize:14, lineHeight:1, padding:"0 2px" };

function EditInput({ value, onChange, placeholder, mono, area }) {
  const st = { ...EDIT_INPUT, ...(mono ? { fontFamily:"var(--font-mono)", fontSize:11.5 } : {}), ...(area ? { resize:"vertical", minHeight:60, lineHeight:1.5 } : { height:34 }) };
  return area
    ? <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2} style={st} />
    : <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={st} />;
}

function ChipEditor({ items, onChange }) {
  const { t } = useLocale();
  const set = (i, v) => onChange(items.map((x, j) => j === i ? v : x));
  return (
    <div style={{display:"flex", flexWrap:"wrap", gap:6, alignItems:"center"}}>
      {items.map((v, i) => (
        <span key={i} className="pill" style={{paddingRight:4, gap:2}}>
          <input value={v} onChange={(e) => set(i, e.target.value)} style={{border:"none", background:"transparent", outline:"none", font:"inherit", color:"inherit", width: Math.max(36, (v.length || 4) * 7) + "px"}} />
          <button onClick={() => onChange(items.filter((_, j) => j !== i))} style={CHIP_X} title={t("discovery.common.remove")}>×</button>
        </span>
      ))}
      <button className="pill" onClick={() => onChange([...items, ""])} style={{borderStyle:"dashed", cursor:"pointer", color:"var(--c-dim)"}}>{t("discovery.editPrimitive.chipAdd")}</button>
    </div>
  );
}

function StringListEditor({ items, onChange, marker, color }) {
  const { t } = useLocale();
  const set = (i, v) => onChange(items.map((x, j) => j === i ? v : x));
  return (
    <ul style={{margin:0, padding:0, listStyle:"none", display:"flex", flexDirection:"column", gap:8}}>
      {items.map((x, i) => (
        <li key={i} style={{display:"flex", gap:8, alignItems:"flex-start"}}>
          {marker && <span style={{color, lineHeight:"34px"}}>{marker}</span>}
          <div style={{flex:1}}><EditInput value={x} onChange={(v) => set(i, v)} /></div>
          <button onClick={() => onChange(items.filter((_, j) => j !== i))} style={{...CHIP_X, lineHeight:"34px"}} title={t("discovery.common.remove")}>×</button>
        </li>
      ))}
      <li><button className="btn btn--ghost btn--sm" onClick={() => onChange([...items, ""])}><Icon name="plus" size={12} /> {t("discovery.editPrimitive.addItem")}</button></li>
    </ul>
  );
}

function EditableField({ f, editing, onChange, onRemove }) {
  const { t } = useLocale();
  if (!editing) {
    return (
      <div style={{display:"grid", gridTemplateColumns: "180px 1fr 110px", gap: 18, padding:"14px 0", borderBottom:"1px solid var(--c-line)", alignItems:"start"}}>
        <div>
          <div style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--c-faint)", letterSpacing:"0.06em", textTransform:"uppercase"}}>{bioFieldLabel(f.label)}</div>
          {f.source && <div style={{fontSize: 11, color:"var(--c-faint)", marginTop: 4, fontStyle:"italic"}}>{t("discovery.field.from", { source: f.source })}</div>}
        </div>
        <div style={{fontSize: 14, color:"var(--c-ink)", lineHeight: 1.55}}>
          {f.multi
            ? <div style={{display:"flex", flexWrap:"wrap", gap: 6}}>{(f.value || []).map((v, i) => <span key={i} className="pill">{v}</span>)}</div>
            : (f.italic ? <em style={{fontStyle:"italic"}}>{f.value}</em> : f.value)}
        </div>
        <div style={{textAlign:"right"}}><Confidence value={f.conf} /></div>
      </div>
    );
  }
  return (
    <div style={{display:"grid", gridTemplateColumns: "180px 1fr 110px", gap: 18, padding:"14px 0", borderBottom:"1px solid var(--c-line)", alignItems:"start"}}>
      <div style={{display:"flex", flexDirection:"column", gap:6}}>
        <EditInput value={f.label} onChange={(v) => onChange({ label: v })} placeholder={t("discovery.editPrimitive.labelPlaceholder")} mono />
        <EditInput value={f.source || ""} onChange={(v) => onChange({ source: v })} placeholder={t("discovery.editPrimitive.sourcePlaceholder")} />
      </div>
      <div>
        {f.multi
          ? <ChipEditor items={f.value || []} onChange={(v) => onChange({ value: v })} />
          : <EditInput area value={f.value} onChange={(v) => onChange({ value: v })} placeholder={t("discovery.editPrimitive.valuePlaceholder")} />}
      </div>
      <div style={{display:"flex", flexDirection:"column", alignItems:"flex-end", gap:8}}>
        <div style={{display:"flex", alignItems:"center", gap:4}}>
          <input type="number" min={0} max={100} value={f.conf} onChange={(e) => onChange({ conf: Math.max(0, Math.min(100, +e.target.value || 0)) })} style={{...EDIT_INPUT, width:56, height:30, textAlign:"right", fontFamily:"var(--font-mono)", fontSize:12}} />
          <span style={{fontSize:11, color:"var(--c-faint)"}}>%</span>
        </div>
        <button className="btn btn--link" style={{fontSize:11, color:"var(--pink-500)"}} onClick={onRemove}>{t("discovery.editPrimitive.removeField")}</button>
      </div>
    </div>
  );
}

function BioFieldList({ items, editing, onChange }) {
  const { t } = useLocale();
  const upd = (i, p) => onChange(items.map((x, j) => j === i ? { ...x, ...p } : x));
  const rm = (i) => onChange(items.filter((_, j) => j !== i));
  const add = (multi) => onChange([...items, { key: `custom_${Date.now().toString(36)}`, label: "New field", value: multi ? [] : "", conf: 50, source: "manual entry", multi }]);
  return (
    <div>
      {items.map((f, i) => <EditableField key={f.key || i} f={f} editing={editing} onChange={(p) => upd(i, p)} onRemove={() => rm(i)} />)}
      {editing && (
        <div style={{display:"flex", gap:8, marginTop:14}}>
          <button className="btn btn--ghost btn--sm" onClick={() => add(false)}><Icon name="plus" size={13} /> {t("discovery.editPrimitive.addField")}</button>
          <button className="btn btn--ghost btn--sm" onClick={() => add(true)}><Icon name="plus" size={13} /> {t("discovery.editPrimitive.addListField")}</button>
        </div>
      )}
    </div>
  );
}
function BioSectionHead({ label, source, conf }) {
  const { t } = useLocale();
  return (
    <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:14}}>
      <div>
        <div style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--c-faint)", letterSpacing:"0.08em", textTransform:"uppercase"}}>{label}</div>
        {source && <div style={{fontSize:11, color:"var(--c-faint)", marginTop:3, fontStyle:"italic"}}>{t("discovery.field.from", { source })}</div>}
      </div>
      {conf != null && <Confidence value={conf} />}
    </div>
  );
}

function BioVisual({ bio, patch, editing }) {
  const { t } = useLocale();
  const dark = (hex) => {
    const n = parseInt((hex || "#000").slice(1), 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) < 140;
  };
  const updPal = (i, p) => patch("palette", bio.palette.map((x, j) => j === i ? { ...x, ...p } : x));
  const updType = (i, p) => patch("type", bio.type.map((x, j) => j === i ? { ...x, ...p } : x));
  return (
    <div style={{display:"flex", flexDirection:"column", gap:30}}>
      {/* PALETTE */}
      <section>
        <BioSectionHead label={t("discovery.visual.paletteHead")} source="visual extraction" />
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(160px, 1fr))", gap:12}}>
          {bio.palette.map((c, i) => (
            <div key={i} className="card" style={{padding:0, overflow:"hidden"}}>
              <div style={{height:92, background:c.hex, display:"flex", alignItems:"flex-end", justifyContent:"space-between", padding:10}}>
                {editing
                  ? <input type="color" value={c.hex} onChange={(e) => updPal(i, { hex: e.target.value })} style={{width:30, height:24, border:"none", background:"transparent", cursor:"pointer", padding:0}} />
                  : <span style={{fontFamily:"var(--font-mono)", fontSize:10.5, color: dark(c.hex) ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.6)", letterSpacing:"0.04em"}}>{c.hex}</span>}
                {editing && <button onClick={() => patch("palette", bio.palette.filter((_, j) => j !== i))} style={{...CHIP_X, color: dark(c.hex) ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.6)", fontSize:16}} title={t("discovery.visual.removeColour")}>×</button>}
              </div>
              <div style={{padding:"10px 12px"}}>
                {editing
                  ? <div style={{display:"flex", flexDirection:"column", gap:6}}>
                      <EditInput value={c.name} onChange={(v) => updPal(i, { name: v })} placeholder={t("discovery.visual.namePlaceholder")} />
                      <div style={{display:"flex", gap:6}}>
                        <EditInput value={c.wcag} onChange={(v) => updPal(i, { wcag: v })} placeholder={t("discovery.visual.wcagPlaceholder")} mono />
                        <input type="number" min={0} max={100} value={c.conf} onChange={(e) => updPal(i, { conf: +e.target.value || 0 })} style={{...EDIT_INPUT, width:60, height:34, fontFamily:"var(--font-mono)", fontSize:11.5}} />
                      </div>
                    </div>
                  : <>
                      <div style={{fontSize:13.5, fontWeight:600, color:"var(--c-ink)"}}>{c.name}</div>
                      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:8}}>
                        <span className="pill" style={{height:18, padding:"0 8px", fontSize:9.5}}>{t("discovery.visual.wcag", { value: c.wcag })}</span>
                        <span style={{fontFamily:"var(--font-mono)", fontSize:10, color: c.conf >= 85 ? "var(--green-600)" : c.conf >= 65 ? "var(--orange-600)" : "var(--pink-500)"}}>{c.conf}%</span>
                      </div>
                    </>}
              </div>
            </div>
          ))}
          {editing && (
            <button className="card" onClick={() => patch("palette", [...bio.palette, { hex:"#888888", name:"New colour", conf:50, wcag:"—" }])}
              style={{display:"flex", alignItems:"center", justifyContent:"center", minHeight:150, borderStyle:"dashed", cursor:"pointer", color:"var(--c-dim)", gap:6}}>
              <Icon name="plus" size={16} /> {t("discovery.common.addColour")}
            </button>
          )}
        </div>
      </section>

      {/* TYPOGRAPHY */}
      <section>
        <BioSectionHead label={t("discovery.visual.typographyHead")} source={t("discovery.visual.typographySource")} conf={88} />
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
          {bio.type.map((tf, i) => {
            const serif = /sectra|serif|display/i.test(tf.family) && tf.kind === "Body";
            const ff = serif ? "Georgia, 'Times New Roman', serif" : "var(--font-sans)";
            return (
              <div key={i} className="card" style={{padding:18}}>
                <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8}}>
                  {editing
                    ? <input value={tf.kind} onChange={(e) => updType(i, { kind: e.target.value })} style={{...EDIT_INPUT, width:130, height:28}} />
                    : <span className="eyebrow">{tf.kind}</span>}
                  {editing
                    ? <button className="btn btn--link" style={{fontSize:11, color:"var(--pink-500)"}} onClick={() => patch("type", bio.type.filter((_, j) => j !== i))}>{t("discovery.common.remove")}</button>
                    : <span className="pill" style={{height:18, padding:"0 8px", fontSize:9.5}}>{tf.license}</span>}
                </div>
                <div style={{fontFamily:ff, fontSize:52, lineHeight:1, color:"var(--c-ink)", fontWeight:600, letterSpacing:"-0.02em"}}>Aa Gg</div>
                <div style={{fontFamily:ff, fontSize:15, color:"var(--c-dim)", marginTop:8, lineHeight:1.4}}>ABCDEFGHIJKLMNOPQRSTUVWXYZ · 0123456789</div>
                <div style={{marginTop:14, paddingTop:12, borderTop:"1px dashed var(--c-line-2)"}}>
                  {editing
                    ? <div style={{display:"flex", flexDirection:"column", gap:6}}>
                        <EditInput value={tf.family} onChange={(v) => updType(i, { family: v })} placeholder={t("discovery.visual.familyPlaceholder")} />
                        <div style={{display:"flex", gap:6}}>
                          <EditInput value={tf.size} onChange={(v) => updType(i, { size: v })} placeholder={t("discovery.visual.sizePlaceholder")} mono />
                          <EditInput value={tf.license} onChange={(v) => updType(i, { license: v })} placeholder={t("discovery.visual.licensePlaceholder")} />
                        </div>
                        <EditInput value={tf.suggest} onChange={(v) => updType(i, { suggest: v })} placeholder={t("discovery.visual.webAltPlaceholder")} />
                      </div>
                    : <>
                        <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline"}}>
                          <span style={{fontSize:13, fontWeight:500, color:"var(--c-ink)"}}>{tf.family}</span>
                          <span style={{fontFamily:"var(--font-mono)", fontSize:10.5, color:"var(--c-faint)"}}>{tf.size}</span>
                        </div>
                        <div style={{fontSize:11.5, color:"var(--c-faint)", marginTop:4}}>{t("discovery.visual.webAlt")} · {tf.suggest}</div>
                      </>}
                </div>
              </div>
            );
          })}
          {editing && (
            <button className="card" onClick={() => patch("type", [...bio.type, { kind:"New face", family:"Family name", size:"16/24", license:"free", suggest:"system" }])}
              style={{display:"flex", alignItems:"center", justifyContent:"center", minHeight:120, borderStyle:"dashed", cursor:"pointer", color:"var(--c-dim)", gap:6}}>
              <Icon name="plus" size={16} /> {t("discovery.common.addTypeface")}
            </button>
          )}
        </div>
      </section>

      {/* IMAGERY */}
      <section>
        <BioSectionHead label={t("discovery.visual.imageryHead")} source="visual evidence" />
        <div className="card card--inset" style={{padding:"14px 16px", marginBottom:12}}>
          <div className="eyebrow" style={{marginBottom:6}}>{t("discovery.visual.grade")}</div>
          {editing
            ? <EditInput area value={bio.grade} onChange={(v) => patch("grade", v)} />
            : <p style={{fontSize:14, color:"var(--c-ink)", lineHeight:1.5, margin:0}}>{bio.grade}</p>}
        </div>
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
          <div className="card" style={{padding:16, borderLeft:"3px solid var(--green-600)"}}>
            <div className="eyebrow eyebrow--green" style={{marginBottom:10}}>{t("discovery.visual.shootThis")}</div>
            {editing
              ? <StringListEditor items={bio.imagery} onChange={(v) => patch("imagery", v)} marker="✓" color="var(--green-600)" />
              : <ul style={{margin:0, padding:0, listStyle:"none", display:"flex", flexDirection:"column", gap:7}}>
                  {bio.imagery.map((x, i) => <li key={i} style={{fontSize:13, color:"var(--c-ink)", display:"flex", gap:8, lineHeight:1.45}}><span style={{color:"var(--green-600)"}}>✓</span> {x}</li>)}
                </ul>}
          </div>
          <div className="card" style={{padding:16, borderLeft:"3px solid var(--pink-500)"}}>
            <div className="eyebrow eyebrow--pink" style={{marginBottom:10}}>{t("discovery.visual.neverThis")}</div>
            {editing
              ? <StringListEditor items={bio.avoid} onChange={(v) => patch("avoid", v)} marker="✕" color="var(--pink-500)" />
              : <ul style={{margin:0, padding:0, listStyle:"none", display:"flex", flexDirection:"column", gap:7}}>
                  {bio.avoid.map((x, i) => <li key={i} style={{fontSize:13, color:"var(--c-ink)", display:"flex", gap:8, lineHeight:1.45}}><span style={{color:"var(--pink-500)"}}>✕</span> {x}</li>)}
                </ul>}
          </div>
        </div>
      </section>
    </div>
  );
}

function BioStrategic({ strat, patchStrategic, editing }) {
  const { t } = useLocale();
  return (
    <div style={{display:"grid", gridTemplateColumns: "1fr 1fr", gap: 18}}>
      <div className="card" style={{padding: 18, borderLeft: "3px solid var(--yellow-500)"}}>
        <div className="eyebrow eyebrow--yellow" style={{marginBottom: 8}}>{t("discovery.strategic.watchouts")}</div>
        {editing
          ? <StringListEditor items={strat.watchouts} onChange={(v) => patchStrategic("watchouts", v)} />
          : <ul style={{margin: 0, paddingLeft: 0, listStyle:"none", display:"flex", flexDirection:"column", gap: 10}}>
              {strat.watchouts.map((x, i) => <li key={i} style={{fontSize: 13.5, color:"var(--c-ink)"}}>{x}</li>)}
            </ul>}
      </div>
      <div className="card" style={{padding: 18, borderLeft:"3px solid var(--orange-500)"}}>
        <div className="eyebrow" style={{color:"var(--orange-600)", marginBottom: 8}}>{t("discovery.strategic.gaps")}</div>
        {editing
          ? <StringListEditor items={strat.gaps} onChange={(v) => patchStrategic("gaps", v)} />
          : <ul style={{margin:0, paddingLeft: 0, listStyle:"none", display:"flex", flexDirection:"column", gap: 10}}>
              {strat.gaps.map((x, i) => <li key={i} style={{fontSize: 13.5, color:"var(--c-ink)"}}>{x}</li>)}
            </ul>}
      </div>
      <div className="card" style={{padding: 18, borderLeft:"3px solid var(--pink-500)", gridColumn: "1 / -1"}}>
        <div className="eyebrow eyebrow--pink" style={{marginBottom: 8}}>{t("discovery.strategic.whatNot")}</div>
        {editing
          ? <StringListEditor items={strat.notList} onChange={(v) => patchStrategic("notList", v)} marker="✕" color="var(--pink-500)" />
          : <ul style={{margin: 0, paddingLeft: 0, listStyle:"none", display:"grid", gridTemplateColumns: "1fr 1fr", gap: 10}}>
              {strat.notList.map((x, i) => <li key={i} style={{fontSize:13.5}}>✕ {x}</li>)}
            </ul>}
      </div>
      <div className="card" style={{padding: 18, gridColumn: "1 / -1"}}>
        <div className="eyebrow eyebrow--purple" style={{marginBottom: 8}}>{t("discovery.strategic.diagnosis")}</div>
        {editing
          ? <EditInput area value={strat.diagnosis} onChange={(v) => patchStrategic("diagnosis", v)} />
          : <p style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize: 16, lineHeight: 1.55, color:"var(--c-ink)", margin: 0}}>"{strat.diagnosis}"</p>}
      </div>
    </div>
  );
}
function BioSources({ brandId, sources, setSources, feed, setFeed, reading, addReference, onSourceAdded, editing, go }) {
  const { t } = useLocale();
  const fileRef = React.useRef(null);
  const [uploadingFile, setUploadingFile] = useDState(false);
  const total = sources.reduce((a, s) => a + s.n, 0);
  const onKey = (e) => { if (e.key === "Enter") { e.preventDefault(); addReference(); } };
  const uploadFile = async (file) => {
    if (!file || !brandId || uploadingFile) return;
    setUploadingFile(true);
    try {
      const form = new FormData();
      form.set("bucket", "foundations");
      form.set("file", file);
      const res = await apiFetch(`/api/bios/${brandId}/sources/upload`, { method:"POST", body:form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setSources(s => [{ src:file.name, date:t("discovery.sources.justNow"), n:0, fresh:true }, ...s]);
      onSourceAdded?.();
    } finally {
      setUploadingFile(false);
    }
  };
  return (
    <div>
      {/* Feed composer */}
      <div className="card card--inset" style={{padding:18, marginBottom:22}}>
        <div style={{display:"flex", alignItems:"center", gap:9, marginBottom:12}}>
          <BrandolphDot state={reading ? "thinking" : "idle"} />
          <div>
            <div style={{fontSize:14, fontWeight:600, color:"var(--c-ink)"}}>{t("discovery.sources.feedBrandolph")}</div>
            <div style={{fontSize:12, color:"var(--c-faint)"}}>{t("discovery.sources.feedDesc")}</div>
          </div>
        </div>
        <div style={{display:"flex", gap:10}}>
          <input
            value={feed}
            onChange={(e) => setFeed(e.target.value)}
            onKeyDown={onKey}
            disabled={reading}
            placeholder={t("discovery.sources.pastePlaceholder")}
            style={{flex:1, height:42, borderRadius:9, border:"1px solid var(--c-line-2)", background:"var(--c-bg)", padding:"0 14px", fontSize:14, color:"var(--c-ink)", outline:"none"}}
          />
          <button className="btn btn--primary" disabled={reading || !feed.trim()} onClick={() => addReference()}>
            {reading ? <><BrandolphDot state="thinking" size={11} /> {t("discovery.sources.reading")}</> : <><Icon name="plus" size={14} /> {t("discovery.sources.readIt")}</>}
          </button>
        </div>
        <div style={{display:"flex", gap:8, marginTop:12, flexWrap:"wrap"}}>
          <input ref={fileRef} type="file" accept={SOURCE_FILE_ACCEPT} style={{display:"none"}} onChange={(e) => { uploadFile(e.target.files?.[0]); e.target.value = ""; }} />
          <button className="btn btn--ghost btn--sm" disabled={reading || uploadingFile} onClick={() => fileRef.current?.click()}><Icon name="files" size={13} /> {uploadingFile ? "Uploading…" : t("discovery.sources.uploadDoc")}</button>
        </div>
      </div>

      {/* Ledger header */}
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:6}}>
        <div className="eyebrow">{t("discovery.sources.ledger", { sources: sources.length, signals: total })}</div>
        <div style={{fontSize:11.5, color:"var(--c-faint)", fontStyle:"italic"}}>{t("discovery.sources.compounds")}</div>
      </div>

      {/* Source ledger */}
      <div>
        {sources.map((s, i) => (
          <div key={i} style={{display:"grid", gridTemplateColumns:"1fr auto auto", gap: 14, padding:"12px 0", borderBottom: "1px solid var(--c-line)", alignItems:"center", animation: s.fresh ? "cvPopIn 260ms ease" : "none"}}>
            <div>
              <div style={{fontSize: 13.5, color:"var(--c-ink)", fontWeight:500, display:"flex", alignItems:"center", gap:8}}>
                {s.src}
                {s.fresh && <span className="pill" style={{height:18, padding:"0 8px", fontSize:9.5, background:"var(--green-50, rgba(127,163,122,0.16))", color:"var(--green-600)"}}>{t("discovery.sources.new")}</span>}
              </div>
              <div style={{fontFamily:"var(--font-mono)", fontSize: 10.5, color:"var(--c-faint)", marginTop: 2, letterSpacing:"0.04em"}}>{s.date}</div>
            </div>
            <span className="pill">{t("discovery.sources.signals", { count: s.n })}</span>
            {editing
              ? <button className="btn btn--link" style={{fontSize: 12, color:"var(--pink-500)"}} onClick={() => setSources(sources.filter((_, j) => j !== i))}>{t("discovery.common.remove")}</button>
              : <button className="btn btn--link" style={{fontSize: 12}} onClick={() => go("discovery")}>{t("discovery.sources.reExtract")}</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { Discovery, BioViewer });
