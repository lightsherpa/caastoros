import React from "react";
import { apiFetch, supabase } from "./lib/supabase-browser.js";
const { BrandolphAvatar, BrandolphDot, Confidence, Counter, Icon, Reveal } = window;
/* Discovery (3-step intake) + BIO viewer. */

const { useState: useDState, useEffect: useDEffect } = React;

/* useLiveBio — fetches the user's first brand + latest BIO + cert state.
   Polls every `pollMs` while `pendingCert` is true (BIO not yet certified
   by Steward, or no BIO at all yet). Returns { brandId, bio, cert, refresh }. */
function useLiveBio({ pollMs = 6000 } = {}) {
  const [state, setState] = useDState({ brandId: null, brandName: null, brandUrl: null, bio: null, cert: null, reviewPending: false, focusCount: 0, error: null, loading: true });

  const tick = React.useCallback(async () => {
    try {
      /* Resolve current user's brand. Prefers the workspace switcher's
         selection (from localStorage); falls back to the first brand. RLS
         scopes results to the user's workspaces. */
      const wantedId = window.getCurrentBrandId?.();
      let brand = null;
      if (wantedId) {
        const { data } = await supabase.from("brands").select("id, name, url").eq("id", wantedId).maybeSingle();
        brand = data;
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
        setState({ brandId: brand.id, brandName: brand.name, brandUrl: brand.url, bio: null, cert: null, focusCount: 0, loading: false, error: j.error || `HTTP ${res.status}` });
        return;
      }
      const { bio, reviewPending, focusCount } = await res.json();
      let certInfo = null;
      if (bio?.certified) {
        let certName = "your Brand Steward";
        if (bio.certified_by) {
          const { data: tm } = await supabase.from("team_members").select("first_name, name").eq("id", bio.certified_by).maybeSingle();
          certName = tm?.first_name || tm?.name || certName;
        }
        certInfo = { byName: certName, at: bio.certified_at, notes: bio.steward_notes || null };
      }
      setState({ brandId: brand.id, brandName: brand.name, brandUrl: brand.url, bio, cert: certInfo, reviewPending: !!reviewPending, focusCount: Number(focusCount) || 0, loading: false, error: null });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e?.message || String(e) }));
    }
  }, []);

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
  const steps = [
    { n:"01", label:"Connect" },
    { n:"02", label:"Extract" },
    { n:"03", label:"Confirm" },
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
      <a href="#/home" className="btn btn--link" style={{marginLeft:"auto", fontSize:12}}>Skip onboarding →</a>
    </div>
  );
}

/* Three-bucket source intake drop zone (rev-2 §5.3) — labelled per bucket
   so Steward review can read by department without re-bucketing. Files
   upload to /api/bios/:brandId/sources/upload and land in Supabase Storage
   plus bio_sources/uploads rows with the selected bucket. */
const BUCKETS = [
  { key:"foundations", label:"Brand foundations", help:"Brand book, decks, manifestos, “about us” docs",       readBy:"All specialists" },
  { key:"visual",      label:"Visual references", help:"Moodboards, examples of work you admire",                       readBy:"Design dept" },
  { key:"voice",       label:"Voice references",  help:"Emails, posts, talks where you sound like yourself",            readBy:"Copy dept" },
];

function BucketDropZone({ bucket, files, onAdd, onRemove }) {
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
        <div style={{fontSize:13.5, fontWeight:600, color:"var(--c-ink)"}}>{bucket.label}</div>
        <span className="eyebrow" style={{color:"var(--c-faint)"}}>{bucket.readBy}</span>
      </div>
      <div style={{fontSize:12, color:"var(--c-dim)", lineHeight:1.45, marginBottom: files.length ? 10 : 4}}>
        {bucket.help}
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
                aria-label={`Remove ${f.name}`}
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
  /* Three-bucket source state (rev-2 §5.3). Empty arrays on mount.
     `Start extraction` fires the compile-bio Inngest event via
     /api/discovery/start; the SPA can then poll bios for the result. */
  const [uploadsByBucket, setUploadsByBucket] = useDState({ foundations: [], visual: [], voice: [] });
  const [brandName, setBrandName] = useDState("");
  const [url, setUrl] = useDState("vinilo.coffee");
  const [instagram, setInstagram] = useDState("");
  const [busy, setBusy] = useDState(false);
  const [error, setError] = useDState(null);
  const [uploading, setUploading] = useDState(false);
  const addToBucket = (key) => (newFiles) =>
    setUploadsByBucket(prev => ({ ...prev, [key]: [...prev[key], ...newFiles] }));
  const removeFromBucket = (key) => (idx) =>
    setUploadsByBucket(prev => ({ ...prev, [key]: prev[key].filter((_, i) => i !== idx) }));
  const handleStart = async () => {
    if (newBrand && !brandName.trim()) { setError("Brand name is required."); return; }
    setBusy(true); setError(null);
    try {
      const cleaned = url.trim().replace(/^https?:\/\//i, "");
      const targetUrl = cleaned.startsWith("http") ? cleaned : `https://${cleaned}`;
      /* New-brand mode: create the brand first, then run the same
         discovery flow targeting it. Existing onboarding (newBrand=false)
         skips this block entirely and behaves exactly as before. */
      let newBrandId = null;
      if (newBrand) {
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
        window.setCurrentBrandId?.(brand.id);
      }
      const res = await apiFetch("/api/discovery/start", {
        method: "POST",
        body: JSON.stringify({ url: targetUrl, instagram, ...(newBrandId ? { brandId: newBrandId } : {}) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const { eventId, brandId } = await res.json();
      const filesToUpload = BUCKETS.flatMap((bucket) =>
        uploadsByBucket[bucket.key].map((file) => ({ bucket: bucket.key, file }))
      );
      if (brandId && filesToUpload.length) {
        setUploading(true);
        for (const item of filesToUpload) {
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
        }
      }
      console.log("[Discovery] fired", { eventId, brandId, url: targetUrl });
      onNext();
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
            {newBrand ? "Add a brand." : "Point us at your brand."}
          </em>
          {" "}{newBrand ? "Name it, point us at it, and Brandolph reads the rest." : "Brandolph will read the rest."}
        </h1>
        <p style={{fontSize: 16, color:"var(--c-dim)", lineHeight: 1.55, marginBottom: 30}}>
          A URL is enough. If you have guidelines, hand them over. If you don't — we'll work from what's already public, and tell you what we couldn't find.
        </p>
      </Reveal>

      <Reveal delay={150}>
        <div className="card" style={{padding: 28}}>
          <div style={{display:"flex", flexDirection:"column", gap: 18}}>
            {newBrand && (
              <div>
                <label style={{display:"block", fontSize:12, fontWeight:500, color:"var(--c-ink)", marginBottom: 8}}>
                  Brand name <span style={{color:"var(--pink-500)"}}>·</span>
                </label>
                <input className="input" value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="e.g. Vinilo Coffee" />
              </div>
            )}
            <div>
              <label style={{display:"block", fontSize:12, fontWeight:500, color:"var(--c-ink)", marginBottom: 8}}>
                Primary website URL <span style={{color:"var(--pink-500)"}}>·</span>
              </label>
              <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="brand.com" />
            </div>
            <div>
              <label style={{display:"block", fontSize:12, fontWeight:500, color:"var(--c-ink)", marginBottom: 8}}>
                Instagram handle <span style={{color:"var(--c-faint)", fontWeight:400}}>· optional</span>
              </label>
              <input className="input" value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@handle" />
            </div>

            <div>
              <label style={{display:"block", fontSize:12, fontWeight:500, color:"var(--c-ink)", marginBottom: 8}}>
                Sources <span style={{color:"var(--c-faint)", fontWeight:400}}>· optional — drag in or click to upload</span>
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
                ⏱ ~40s · 🔒 Sources save to your BIO ledger{totalFiles > 0 ? ` · ${totalFiles} file${totalFiles===1?"":"s"} ready` : ""}
              </span>
            </div>
            <button className="btn btn--primary" onClick={handleStart} disabled={busy || !url.trim() || (newBrand && !brandName.trim())}>
              {uploading ? "Uploading sources…" : busy ? "Starting…" : <>Start extraction <Icon name="arrow" size={14} /></>}
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
        <button className="btn btn--link" style={{fontSize: 12}}>Start from scratch</button>
        <span style={{color:"var(--c-line-2)"}}>·</span>
        <button className="btn btn--link" style={{fontSize: 12}}>Clone a space (Tier 03)</button>
      </div>
    </div>
  );
}

function DiscoveryStep2Running({ onDone }) {
  /* Real BIO-compile polling. Captures the current latest BIO version
     on mount; polls /api/bios/:brandId every 3s until a new (higher)
     version appears — that's the Inngest compile-bio function finishing.
     Falls back to onDone after 90s if the worker doesn't return so the
     UI doesn't hang forever. */
  const [stage, setStage] = useDState("scrape");                /* scrape → vision → compile → done */
  const [elapsed, setElapsed] = useDState(0);

  const lines = [
    { state: stage === "scrape" ? "running" : "ok", text: "Brandolph is reading every page of your site" },
    { state: stage === "scrape" ? "queued" : stage === "vision" ? "running" : "ok", text: "The design crew is mapping your palette and typography" },
    { state: ["scrape","vision"].includes(stage) ? "queued" : stage === "compile" ? "running" : "ok", text: "Brandolph is sharpening your brand into a BIO" },
    { state: stage === "done" ? "ok" : "queued", text: "Filing the draft for your Brand Steward to certify" },
  ];

  useDEffect(() => {
    let alive = true;
    let baselineVersion = null;
    const startedAt = Date.now();

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
        const wantedId = window.getCurrentBrandId?.();
        let brandId = wantedId;
        if (!brandId) {
          const { data: brands } = await supabase.from("brands").select("id").order("created_at", { ascending: true }).limit(1);
          brandId = brands?.[0]?.id;
        }
        if (!brandId) return;
        const res = await apiFetch(`/api/bios/${brandId}`);
        if (!res.ok) return;
        const { bio } = await res.json();
        const v = bio?.version ?? null;
        if (baselineVersion === null) {
          /* First poll just records what version (if any) exists right now. */
          baselineVersion = v ?? 0;
        } else if ((v ?? 0) > baselineVersion) {
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
    /* Safety fallback: if we hit 90s without a new BIO, advance anyway. */
    const fallback = setTimeout(() => { if (alive) { alive = false; onDone(); } }, 90000);
    return () => { alive = false; clearInterval(id); clearTimeout(fallback); };
  }, [onDone]);

  const pct = Math.min(95, Math.round(elapsed * 4));            /* visual progress only */
  return (
    <div style={{maxWidth: 760, margin:"40px auto 0"}}>
      <div style={{display:"flex", alignItems:"center", gap: 12, marginBottom: 18}}>
        <BrandolphDot state={stage === "done" ? "ok" : "thinking"} size={12} />
        <h2 style={{margin: 0, fontSize: 20}}>{stage === "done" ? "Brandolph compiled your BIO" : "Brandolph is reading your brand"}</h2>
      </div>
      <div className="card" style={{padding: 0, overflow:"hidden"}}>
        <div style={{padding:"16px 20px", borderBottom:"1px solid var(--c-line)", background:"var(--c-bg)"}}>
          <div style={{display:"flex", justifyContent:"space-between", fontFamily:"var(--font-mono)", fontSize:11, color:"var(--c-dim)", letterSpacing:"0.06em"}}>
            <span>EXTRACTION · <span style={{color: stage === "done" ? "var(--green-600)" : "var(--yellow-700)"}}>{stage === "done" ? "100%" : pct + "%"}</span></span>
            <span>{elapsed}s elapsed</span>
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
   user reviews. `multi` = string[] (chips); `list` = object[] (palette/type). */
const DISCO_CHAPTERS = [
  { key:"identity", label:"Identity", blurb:"Who you are and what you stand for.", fields:[
    { key:"positioning", label:"Positioning", area:true, italic:true },
    { key:"category",    label:"Category" },
    { key:"founded",     label:"Founded" },
    { key:"pillars",     label:"Pillars", multi:true },
  ]},
  { key:"audience", label:"Audience", blurb:"Who you're for.", fields:[
    { key:"primary",   label:"Primary audience", area:true },
    { key:"secondary", label:"Secondary audience", area:true },
    { key:"tertiary",  label:"Tertiary audience", area:true },
    { key:"jtbd",      label:"Jobs to be done", multi:true },
  ]},
  { key:"voice", label:"Voice", blurb:"How you sound.", fields:[
    { key:"register",   label:"Register", area:true },
    { key:"rhythm",     label:"Sentence rhythm", area:true },
    { key:"forbidden",  label:"Forbidden words", multi:true },
    { key:"signatures", label:"Signature moves", multi:true },
  ]},
  { key:"visual", label:"Visual", blurb:"How you look.", fields:[
    { key:"palette", label:"Palette", list:"palette" },
    { key:"type",    label:"Typography", list:"type" },
    { key:"imagery", label:"Shoot this", multi:true },
    { key:"avoid",   label:"Never this", multi:true },
  ]},
  { key:"goals", label:"Goals", blurb:"Where you're headed.", fields:[
    { key:"northStar", label:"North star", area:true },
    { key:"q2",        label:"This quarter", area:true },
    { key:"q3",        label:"Next quarter", area:true },
  ]},
  { key:"strategic", label:"Strategic", blurb:"Tensions and no-gos.", fields:[
    { key:"watchouts", label:"Watchouts", multi:true },
    { key:"notList",   label:"What you're NOT", multi:true },
  ]},
];

function discoBlank(v) {
  if (v == null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

/* Per-field status → drives the chip + colour. A blank field is always
   "missing" (never surfaces a guessed value), regardless of any source. */
function discoFieldStatus({ value, meta, mark }) {
  if (discoBlank(value))       return { kind:"missing",      word:"we couldn't find this",          color:"var(--pink-500)" };
  if (mark === "accurate")     return { kind:"accurate",     word:"confirmed accurate",             color:"var(--green-600)" };
  if (mark === "aspirational") return { kind:"aspirational", word:"aspirational",                   color:"var(--purple-500)" };
  if (meta && meta.source)     return { kind:"inferred",     word:"confirm — inferred, not stated", color:"var(--orange-600)" };
  return { kind:"stated", word:"your words", color:"var(--green-600)" };
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
  if (gaps >= Math.ceil(total / 2)) status = { key:"needs",   word:"needs sources", color:"var(--pink-500)",   bg:"var(--pink-50, rgba(244,143,177,0.12))" };
  else if (gaps > 0 || toConfirm > 0) status = { key:"filling", word:"filling in",    color:"var(--orange-600)", bg:"var(--yellow-50, rgba(252,211,77,0.12))" };
  else status = { key:"well", word:"well sourced", color:"var(--green-600)", bg:"var(--green-50, rgba(127,163,122,0.12))" };
  return { confirmed, toConfirm, gaps, total, status };
}

/* Friendly copy for the attest endpoint's 400 codes. */
function discoAttestError(j) {
  switch (j && j.code) {
    case "STATEMENTS_REQUIRED":
      return "Confirm all three statements to attest.";
    case "HIGH_IMPORTANCE_GAPS":
      return `A few important fields still need answers${j.fields && j.fields.length ? `: ${j.fields.join(", ")}` : ""}. Fill or mark them, then attest.`;
    case "BELOW_MIN_SCORE":
      return `Your BIO is at ${j.score ?? "—"}/100${j.minScore ? `, below the ${j.minScore} needed` : ""}. Confirm more fields or add sources to raise it.`;
    default:
      return (j && j.error) || "Couldn't attest just yet — try again.";
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
  const upd = (i, p) => onChange(items.map((x, j) => j === i ? { ...x, ...p } : x));
  return (
    <div style={{display:"flex", flexDirection:"column", gap:8}}>
      {items.map((c, i) => (
        <div key={i} style={{display:"flex", gap:8, alignItems:"center"}}>
          <input type="color" value={c.hex || "#888888"} onChange={(e) => upd(i, { hex: e.target.value })} style={{width:34, height:30, border:"none", background:"transparent", cursor:"pointer", padding:0}} />
          <div style={{flex:1}}><EditInput value={c.name || ""} onChange={(v) => upd(i, { name: v })} placeholder="Colour name" /></div>
          <button onClick={() => onChange(items.filter((_, j) => j !== i))} style={CHIP_X} title="Remove">×</button>
        </div>
      ))}
      <button className="btn btn--ghost btn--sm" onClick={() => onChange([...items, { hex:"#888888", name:"" }])}><Icon name="plus" size={12} /> Add colour</button>
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
  const upd = (i, p) => onChange(items.map((x, j) => j === i ? { ...x, ...p } : x));
  return (
    <div style={{display:"flex", flexDirection:"column", gap:8}}>
      {items.map((t, i) => (
        <div key={i} style={{display:"flex", gap:8, alignItems:"center"}}>
          <div style={{width:120}}><EditInput value={t.kind || ""} onChange={(v) => upd(i, { kind: v })} placeholder="Role" /></div>
          <div style={{flex:1}}><EditInput value={t.family || ""} onChange={(v) => upd(i, { family: v })} placeholder="Family" /></div>
          <button onClick={() => onChange(items.filter((_, j) => j !== i))} style={CHIP_X} title="Remove">×</button>
        </div>
      ))}
      <button className="btn btn--ghost btn--sm" onClick={() => onChange([...items, { kind:"", family:"" }])}><Icon name="plus" size={12} /> Add typeface</button>
    </div>
  );
}

/* One reviewable field: status chip, value (or "we couldn't find this"),
   and the per-field controls (mark accurate/aspirational, edit, leave blank). */
function DiscoFieldRow({ field, value, meta, mark, onChange, onMark, onLeaveBlank }) {
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
    return <EditInput area={field.area} value={value || ""} onChange={onChange} placeholder="Type what's true — leave blank if you're not sure" />;
  };

  return (
    <div style={{padding:"16px 0", borderBottom:"1px solid var(--c-line)"}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:12, marginBottom:8}}>
        <div>
          <span style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--c-faint)", letterSpacing:"0.06em", textTransform:"uppercase"}}>{field.label}</span>
          {meta && meta.source && <span style={{fontSize:11, color:"var(--c-faint)", fontStyle:"italic", marginLeft:10}}>from {meta.source}</span>}
        </div>
        <span className="pill" style={{background:"transparent", border:`1px solid ${st.color}`, color:st.color, fontSize:10.5, whiteSpace:"nowrap"}}>{st.word}</span>
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
            ? <span style={{color:"var(--c-faint)", fontStyle:"italic"}}>Empty — we couldn't find this. Add it if you know it, or leave it blank.</span>
            : renderValue()}
      </div>

      {/* Per-field controls */}
      <div style={{display:"flex", gap:10, marginTop:10, flexWrap:"wrap", alignItems:"center"}}>
        {!blank && (mark ? (
          <button className="btn btn--link" style={{fontSize:12}} onClick={() => onMark(null)}>
            <Icon name="check" size={12} /> Marked {mark} · undo
          </button>
        ) : (
          <>
            <button className="btn btn--ghost btn--sm" onClick={() => onMark("accurate")}>Mark accurate</button>
            <button className="btn btn--ghost btn--sm" onClick={() => onMark("aspirational")}>Mark aspirational</button>
          </>
        ))}
        <button className="btn btn--link" style={{fontSize:12}} onClick={() => setEditing(e => !e)}>
          <Icon name="edit" size={12} /> {editing ? "Done editing" : blank ? "Add it" : "Edit"}
        </button>
        {!blank && (
          <button className="btn btn--link" style={{fontSize:12, color:"var(--c-faint)"}} onClick={() => { onLeaveBlank(); setEditing(false); }}>Leave blank</button>
        )}
      </div>
    </div>
  );
}

/* Hand a single chapter to a teammate — POST /discovery/delegation. */
function DiscoDelegatePanel({ brandId, chapter }) {
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
      <div style={{fontSize:13.5, fontWeight:600, color:"var(--c-ink)", marginBottom:4}}>Delegate this chapter</div>
      <div style={{fontSize:12, color:"var(--c-faint)", marginBottom:12}}>Hand {chapter.label} to a teammate who knows it best. They get a link to fill just this section.</div>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input className="input" style={{flex:"1 1 200px"}} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@brand.com" />
        <input className="input" style={{flex:"1 1 200px"}} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" />
        <button className="btn btn--primary btn--sm" disabled={busy || !email.trim()} onClick={send}>
          <Icon name="mail" size={13} /> {busy ? "Sending…" : "Send invite"}
        </button>
      </div>
      {err && <div style={{fontSize:12, color:"var(--pink-500)", marginTop:8}}>{err}</div>}
      {link && (
        <div style={{marginTop:10, display:"flex", gap:8, alignItems:"center", fontSize:12}}>
          <span style={{color:"var(--green-600)", whiteSpace:"nowrap"}}>Invite ready.</span>
          <code style={{flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontFamily:"var(--font-mono)", fontSize:11, color:"var(--c-dim)", background:"var(--neutral-50)", padding:"4px 8px", borderRadius:6}}>{link}</code>
          <button className="btn btn--ghost btn--sm" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
        </div>
      )}
    </div>
  );
}

function DiscoveryStep2Results({ onConfirm }) {
  /* Live brand + cert + score — drives the Steward chip (flips in real
     time if certification lands) and the completion meter. */
  const live = useLiveBio({ pollMs: 6000 });
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
  const saveAndExit = async () => { await saveSession(); flash("Saved — pick up right here anytime."); setTimeout(() => { window.location.hash = "#/home"; }, 700); };

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
      flash("BIO signed — briefing unlocked.");
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
    ? { color:"var(--green-600)", word:"well sourced" }
    : score >= 65
    ? { color:"var(--orange-600)", word:"filling in" }
    : { color:"var(--pink-500)", word:"needs more sources" };

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
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "All changes saved" : saveState === "error" ? "Save failed — retries on next edit" : ""}
        </span>
        <button className="btn btn--link" style={{fontSize:12}} onClick={saveAndExit}>Save &amp; finish later</button>
      </div>

      {noBrand ? (
        <div className="card" style={{padding:"48px 24px", textAlign:"center", color:"var(--c-dim)", fontSize:14}}>
          Couldn't find a brand to review. <a href="#/discovery" style={{color:"var(--purple-500)"}}>Start discovery</a>.
        </div>
      ) : showLoader ? (
        <div className="card" style={{padding:"48px 24px", textAlign:"center", color:"var(--c-faint)", display:"flex", alignItems:"center", justifyContent:"center", gap:10}}>
          <BrandolphDot state="thinking" /> Loading your draft…
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
                  ? <>Certified by <span style={{color:"var(--green-600)", fontWeight:500}}>{live.cert.byName}</span>.</>
                  : <>A senior Brand Steward certifies this BIO within 24h. Confirm the draft below to unlock briefing now.</>}
              </div>
            </div>
          </Reveal>

          {/* Brand row + completion meter */}
          <Reveal>
            <div style={{display:"grid", gridTemplateColumns:"1fr auto", gap:20, alignItems:"center", marginBottom:20}}>
              <div>
                <div className="eyebrow" style={{marginBottom:6}}>Draft BIO · review before you sign</div>
                <h2 style={{margin:0, fontSize:24, letterSpacing:"-0.01em"}}>{live.brandName || "Your brand"}</h2>
                {live.brandUrl && <p style={{margin:"4px 0 0", color:"var(--c-dim)", fontSize:13}}>{live.brandUrl}</p>}
              </div>
              <div style={{textAlign:"right", minWidth:180}}>
                <div className="eyebrow eyebrow--yellow" style={{marginBottom:2}}>Completion</div>
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
                          <h3 style={{margin:0, fontSize:16, letterSpacing:"-0.01em"}}>{ch.label}</h3>
                          {reviewed && <span style={{color:"var(--green-600)", display:"inline-flex"}} title="Reviewed"><Icon name="check" size={13} /></span>}
                        </div>
                        <span className="pill" style={{background:a.status.bg, color:a.status.color, border:"none", fontSize:10.5, whiteSpace:"nowrap"}}>{a.status.word}</span>
                      </div>
                      <p style={{margin:0, fontSize:12.5, color:"var(--c-faint)", lineHeight:1.45}}>{ch.blurb}</p>
                      <div style={{display:"flex", gap:14, fontFamily:"var(--font-mono)", fontSize:11, color:"var(--c-dim)"}}>
                        <span>{a.gaps} gap{a.gaps === 1 ? "" : "s"}</span>
                        <span style={{color: a.toConfirm ? "var(--orange-600)" : "var(--c-faint)"}}>{a.toConfirm} to confirm</span>
                        <span style={{color:"var(--green-600)"}}>{a.confirmed} ✓</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div style={{marginTop:22, padding:"18px 20px", background:"var(--c-card)", border:"1px solid var(--c-line)", borderRadius:12, display:"flex", justifyContent:"space-between", alignItems:"center", gap:14, flexWrap:"wrap"}}>
                <div style={{fontSize:13.5, color:"var(--c-ink)"}}>
                  <strong>{totals.confirmed}/{totals.total}</strong> fields confirmed · {totals.toConfirm} inferred to confirm · {totals.gaps} gaps
                </div>
                <button className="btn btn--primary btn--lg" onClick={openAttest}>Confirm &amp; attest <Icon name="arrow" size={14} /></button>
              </div>
            </>
          )}

          {/* ── CHAPTER — field-level review ────────────────────────── */}
          {view === "chapter" && chapter && (
            <>
              <button className="btn btn--link" style={{marginBottom:10, fontSize:13}} onClick={() => backToHub(chapter.key)}>← All chapters</button>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:12, marginBottom:4}}>
                <h2 style={{margin:0, fontSize:22, letterSpacing:"-0.01em"}}>{chapter.label}</h2>
                {chapterAnalysis && <span className="pill" style={{background:chapterAnalysis.status.bg, color:chapterAnalysis.status.color, border:"none"}}>{chapterAnalysis.status.word}</span>}
              </div>
              <p style={{margin:"0 0 16px", fontSize:13, color:"var(--c-faint)"}}>{chapter.blurb} Confirm what's right, fix what's not, leave blank what you don't know.</p>

              <div className="card" style={{padding:"4px 20px"}}>
                {chapter.fields.map(field => (
                  <DiscoFieldRow
                    key={field.key}
                    field={field}
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
                <button className="btn btn--primary" onClick={() => backToHub(chapter.key)}><Icon name="check" size={14} /> Done — back to chapters</button>
              </div>
            </>
          )}

          {/* ── S12 — CONFIRM & ATTEST ──────────────────────────────── */}
          {view === "attest" && (
            <>
              <button className="btn btn--link" style={{marginBottom:10, fontSize:13}} onClick={() => backToHub()}>← Back to chapters</button>
              <h2 style={{margin:"0 0 4px", fontSize:24, letterSpacing:"-0.01em"}}>Confirm &amp; sign your BIO</h2>
              <p style={{margin:"0 0 20px", fontSize:14, color:"var(--c-dim)", lineHeight:1.55}}>
                Signing promotes this draft to a certified BIO version and unlocks briefing. A senior Brand Steward still reviews it before production.
              </p>

              {/* Summary tiles */}
              <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:12, marginBottom:18}}>
                {[
                  ["Confirmed", totals.confirmed, "var(--green-600)"],
                  ["Inferred to confirm", totals.toConfirm, "var(--orange-600)"],
                  ["Gaps", totals.gaps, "var(--pink-500)"],
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
                  <div className="eyebrow eyebrow--yellow" style={{marginBottom:8}}>Still open ({flaggedFields.length})</div>
                  <div style={{display:"flex", flexDirection:"column", gap:6}}>
                    {flaggedFields.map(({ ch, f, st }, i) => (
                      <button key={i} className="btn btn--link" style={{fontSize:12.5, textAlign:"left", padding:0, color:"var(--c-dim)"}} onClick={() => openChapter(ch.key)}>
                        <span style={{color:st.color, marginRight:6}}>●</span> {ch.label} · {f.label} — {st.word}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Three attestation statements */}
              <div className="card" style={{padding:"18px 20px", marginBottom:16}}>
                <div className="eyebrow" style={{marginBottom:12}}>Attestation</div>
                <div style={{display:"flex", flexDirection:"column", gap:12}}>
                  {[
                    ["authority", "I'm authorized to represent this brand."],
                    ["reflects", "This BIO reflects the brand as it actually is."],
                    ["aspirationalMarked", "I've separated what's factual from what's aspirational."],
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
                  {attestBusy ? "Signing…" : <>Sign &amp; activate brand space <Icon name="arrow" size={14} /></>}
                </button>
                {!allChecked && <span style={{fontSize:12, color:"var(--c-faint)"}}>Confirm all three statements to continue.</span>}
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

function DiscoveryStep3({ go }) {
  return (
    <div style={{maxWidth: 580, margin:"80px auto 0", textAlign:"center"}}>
      <div style={{display:"flex", justifyContent:"center", marginBottom: 22}}>
        <BrandolphAvatar size={64} />
      </div>
      <h1 style={{fontSize: 28, letterSpacing:"-0.01em", marginBottom: 14}}>Brand Space is live.</h1>
      <div className="stream" style={{display:"flex", flexDirection:"column", gap: 12, marginBottom: 28, textAlign:"left"}}>
        <BrandolphLine html="*I've read the site, the IG, and three competitors.* You sell coffee. You also sell a decision to slow down on purpose. Most people in the category sell the first; almost none sell the second. That's your unfair advantage." />
        <BrandolphLine html="*Two things to know before we go further.* One — the BIO is editable. If I got something wrong, fix it. Two — I don't pretend to know what I don't know. I left three fields flagged amber. I'd rather ask you than guess." />
        <BrandolphLine html="*The first brief is on you.* When you have something to ship, brief me on the change you want — not the deliverable. I'll do the deliverable part." />
      </div>
      <button className="btn btn--primary btn--lg" onClick={() => go("home")}>
        Open Brandolph <Icon name="arrow" size={14} />
      </button>
    </div>
  );
}

function Discovery({ go, newBrand = false }) {
  const [step, setStep] = useDState(1);
  const [phase, setPhase] = useDState("form"); // form | running | results
  return (
    <div style={{padding:"24px 36px 60px", maxWidth: 1180, margin:"0 auto"}}>
      <DiscoveryStepper step={step} />
      {step === 1 && <DiscoveryStep1 newBrand={newBrand} onNext={() => { setStep(2); setPhase("running"); }} />}
      {step === 2 && phase === "running"  && <DiscoveryStep2Running onDone={() => setPhase("results")} />}
      {step === 2 && phase === "results"  && <DiscoveryStep2Results onConfirm={() => setStep(3)} />}
      {step === 3 && <DiscoveryStep3 go={go} />}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* BIO VIEWER                                                        */

const BIO_SEED_SOURCES = [
  { src: "vinilo.coffee · homepage", date: "scraped 14 May 09:31", n: 18 },
  { src: "vinilo.coffee · about", date: "scraped 14 May 09:31", n: 12 },
  { src: "vinilo.coffee · pricing", date: "scraped 14 May 09:31", n: 7 },
  { src: "Instagram · @vinilo.coffee · 90 posts", date: "scraped 14 May 09:34", n: 22 },
  { src: "Founder intake answers", date: "14 May 09:42", n: 14 },
  { src: "Brand book v1.pdf · uploaded", date: "14 May 09:42", n: 9 },
  { src: "Competitor map · 9 in-category", date: "Brandolph 14 May 09:50", n: 12 },
];

const BIO_IDENTITY = [
  { label:"Name",        value:"Vinilo Coffee",                       conf:99, source:"intake answer" },
  { label:"Positioning", value:"Specialty coffee for slow Tuesdays.", conf:88, source:"extracted from homepage hero + about page", italic:true },
  { label:"Category",    value:"Specialty coffee · subscription + café", conf:94, source:"scrape + competitor map" },
  { label:"Founded",     value:"2021 · Barcelona",                    conf:96, source:"about page" },
  { label:"Ownership",   value:"Founder-led · 2 co-founders · 8 FTEs", conf:72, source:"intake answer + LinkedIn" },
  { label:"Pillars",     multi:true, value:["Provenance","Routine","Patience","Café-as-rest"], conf:84, source:"Brandolph synthesis from 47 scraped pages" },
];
const BIO_AUDIENCE = [
  { label:"Primary",   value:"Subscribers, 28–48, urban, recurring purchase behaviour. Value routine over discovery.", conf:86, source:"IG + Klaviyo intake" },
  { label:"Secondary", value:"Café-warm locals. Walks-in within 2.5km. Tuesday afternoon over Saturday morning.", conf:78, source:"café footfall + observation" },
  { label:"Tertiary",  value:"Wholesale buyers. Specialty hotels + co-working spaces.", conf:62, source:"intake answer" },
  { label:"JTBD",      multi:true, value:["The decision to slow down","The ritual that holds the week together","A weekly bag arriving on time"], conf:80, source:"Brandolph synthesis" },
];
const BIO_COMPETITIVE = [
  { label:"Direct",   multi:true, value:["Café Granell","Nomad Coffee","Three Marks","Caravelle"], conf:92, source:"competitor map · 9 in-category" },
  { label:"Adjacent", multi:true, value:["The Slow Café (UK)","Onyx (US)","La Marzocco Home"], conf:78, source:"competitor map" },
  { label:"The table you sit at", value:"Specialty roasters who lead with provenance + ritual. NOT the 'limited drop' microlot table.", conf:84, source:"Brandolph diagnosis" },
  { label:"Where you don't fit",  value:"High-energy 'third wave' branding. Aesthetic-led without infrastructure.", conf:80, source:"Brandolph diagnosis" },
];
const BIO_VOICE = [
  { label:"Register",        value:"Editorial, low-urgency, second person. Funny only when it's earned.", conf:88, source:"50 paragraphs sampled from site + IG" },
  { label:"Forbidden",       multi:true, value:["unlock","limited time","FOMO","drop","exclusive","kit","journey"], conf:94, source:"rules + Brandolph QA" },
  { label:"Sentence rhythm", value:"Short. Then longer, with a slight ramp. Periods over commas. No dashes-for-pace.", conf:82, source:"rhythm analysis (Opus)" },
  { label:"Signature moves", multi:true, value:["The phrase 'on purpose'","'It isn't X — it's Y'","First-person plural only in brand voice"], conf:86, source:"Brandolph synthesis" },
];
const BIO_GOALS = [
  { label:"2026 north star", value:"Be the coffee that earns the Tuesday back, for 10,000 households.", conf:70, source:"intake" },
  { label:"Q2 priority",     value:"Pricing relaunch + summer Tuesdays campaign.", conf:90, source:"founder calendar" },
  { label:"Q3 priority",     value:"Honduras + Aug microlot. Brand book v2.", conf:62, source:"intake" },
];
const BIO_STRATEGIC = {
  watchouts: [
    "The \"slow Tuesday\" line is doing a lot of work. If you outgrow it without retiring it cleanly, the brand reads contradictory.",
    "The café revenue is half the business. The site reads like it's only the subscription. There's a tension to resolve, not hide.",
    "Wholesale audience is on the BIO but invisible everywhere else. Decide if it stays.",
  ],
  gaps: [
    "No documented behaviour around producer relationships. Critical for the microlot cadence.",
    "No declared price ceiling. The annual conversation needs one.",
  ],
  notList: [
    "A discount-led subscription.",
    "A \"drop\" culture roaster.",
    "An aesthetic-led brand. The taste is the brand.",
    "A coffee-cult evangelism brand. Quiet conviction over loud taste.",
  ],
  diagnosis: "Vinilo's writing is consistently better than its visual system. The site reads with conviction; the system around it doesn't earn that conviction yet. The Q3 priority should be the book — not new campaigns. The summer campaign is fine, but a brand book is the unlock you've been compounding the cost of for two years.",
};
const BIO_GRADE = "Warm, slightly sunny. Editorial framing. Hands + craft + low-light interiors.";

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
  const cf = (section, key) => cmap[`${section}.${key}`] || {};
  const field = (section, key, label, extra = {}) => {
    const { conf, source } = cf(section, key);
    return { label, conf, source, ...extra };
  };
  return {
    identity: [
      { ...field("identity", "positioning", "Positioning", { italic: true }), value: p.identity?.positioning || "" },
      { ...field("identity", "category", "Category"), value: p.identity?.category || "" },
      { ...field("identity", "founded", "Founded"),   value: p.identity?.founded || "" },
      { ...field("identity", "pillars", "Pillars", { multi: true }), value: p.identity?.pillars || [] },
    ],
    audience: [
      { ...field("audience", "primary", "Primary"),     value: p.audience?.primary || "" },
      { ...field("audience", "secondary", "Secondary"), value: p.audience?.secondary || "" },
      { ...field("audience", "tertiary", "Tertiary"),   value: p.audience?.tertiary || "" },
      { ...field("audience", "jtbd", "Jobs to be done", { multi: true }), value: p.audience?.jtbd || [] },
    ],
    voice: [
      { ...field("voice", "register", "Register"),    value: p.voice?.register || "" },
      { ...field("voice", "forbidden", "Forbidden", { multi: true }), value: p.voice?.forbidden || [] },
      { ...field("voice", "rhythm", "Rhythm"),        value: p.voice?.rhythm || "" },
      { ...field("voice", "signatures", "Signatures", { multi: true }), value: p.voice?.signatures || [] },
    ],
    goals: [
      { ...field("goals", "northStar", "North star"), value: p.goals?.northStar || "" },
      { ...field("goals", "q2", "This quarter"),      value: p.goals?.q2 || "" },
      { ...field("goals", "q3", "Next quarter"),      value: p.goals?.q3 || "" },
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
      diagnosis: "",
    },
    /* Visual tab consumes these arrays directly. */
    palette: p.visual?.palette || [],
    type:    p.visual?.type || [],
    imagery: p.visual?.imagery || [],
    avoid:   p.visual?.avoid || [],
    grade:   "",
  };
}

function fieldsToPayload(bio, prevPayload) {
  const getStr = (fields, label) => fields.find(f => f.label === label)?.value || "";
  const getArr = (fields, label) => fields.find(f => f.label === label)?.value || [];
  /* Confidence + missing are Brandolph/Steward-side metadata, not user-editable
     here. Carry them through on save so a user edit never clobbers them. */
  const carry = {};
  if (prevPayload?.confidence) carry.confidence = prevPayload.confidence;
  if (prevPayload?.missing) carry.missing = prevPayload.missing;
  return {
    ...carry,
    identity: {
      positioning: getStr(bio.identity, "Positioning"),
      category:    getStr(bio.identity, "Category"),
      founded:     getStr(bio.identity, "Founded"),
      pillars:     getArr(bio.identity, "Pillars"),
    },
    audience: {
      primary:   getStr(bio.audience, "Primary"),
      secondary: getStr(bio.audience, "Secondary"),
      tertiary:  getStr(bio.audience, "Tertiary"),
      jtbd:      getArr(bio.audience, "Jobs to be done"),
    },
    voice: {
      register:   getStr(bio.voice, "Register"),
      forbidden:  getArr(bio.voice, "Forbidden"),
      rhythm:     getStr(bio.voice, "Rhythm"),
      signatures: getArr(bio.voice, "Signatures"),
    },
    goals: {
      northStar: getStr(bio.goals, "North star"),
      q2:        getStr(bio.goals, "This quarter"),
      q3:        getStr(bio.goals, "Next quarter"),
    },
    strategic: {
      watchouts: bio.strategic?.watchouts || [],
      notList:   bio.strategic?.notList || [],
    },
    visual: {
      palette: bio.palette || [],
      type:    bio.type || [],
      imagery: bio.imagery || [],
      avoid:   bio.avoid || [],
    },
  };
}

/* SelfCertPanel — stage-1 client attestation. Three statements → POST
   /self-certify → flips self_certified, which UNLOCKS briefing. Production
   still waits for a human Steward. (The richer per-field accurate/aspirational
   marking lands with the discovery S12 rebuild in M3.) */
function SelfCertPanel({ brandId, bio, onDone }) {
  const [st, setSt] = useDState({ authority: false, reflects: false, aspirationalMarked: false });
  const [busy, setBusy] = useDState(false);
  const [err, setErr] = useDState(null);
  const allChecked = st.authority && st.reflects && st.aspirationalMarked;

  if (bio?.self_certified) {
    return (
      <div className="card" style={{padding:"10px 14px", marginBottom: 18, borderLeft:"3px solid var(--green-500)", display:"flex", alignItems:"center", gap: 10}}>
        <Icon name="check" size={15} />
        <div style={{fontSize: 13, color:"var(--c-ink)"}}>
          <strong>Self-attested</strong> — briefing is unlocked. Production stays gated until your Brand Steward certifies.
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
        if (j.code === "HIGH_IMPORTANCE_GAPS") throw new Error(`Fill these before self-certifying: ${(j.fields || []).join(", ")}`);
        if (j.code === "BELOW_MIN_SCORE") throw new Error(`BIO score ${j.score} is below the ${j.minScore} needed — add sources to raise it.`);
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
      <div className="eyebrow eyebrow--yellow" style={{marginBottom: 8}}>Self-certify to start briefing</div>
      <div style={{fontSize: 12.5, color:"var(--c-dim)", marginBottom: 10, lineHeight: 1.5}}>
        Confirm the BIO is accurate enough to brief against. This unlocks briefing now; a senior Brand Steward still certifies before production.
      </div>
      <div style={{display:"flex", flexDirection:"column", gap: 8, marginBottom: 12}}>
        <Check k="authority">I'm authorized to represent this brand.</Check>
        <Check k="reflects">This BIO reflects the brand as it actually is.</Check>
        <Check k="aspirationalMarked">I've separated what's factual from what's aspirational.</Check>
      </div>
      {err && <div style={{fontSize: 12, color:"var(--pink-500)", marginBottom: 8}}>{err}</div>}
      <button className="btn btn--primary btn--sm" disabled={!allChecked || busy} onClick={submit}>
        {busy ? "Submitting…" : "Self-certify & unlock briefing"}
      </button>
    </div>
  );
}

function BioViewer({ go, bioScore = 91 }) {
  const [tab, setTab] = useDState("identity");
  const [feed, setFeed] = useDState("");
  const [reading, setReading] = useDState(false);
  const [toast, setToast] = useDState(null);
  const [editing, setEditing] = useDState(false);
  const [saving, setSaving] = useDState(false);
  const [saveErr, setSaveErr] = useDState(null);
  const [reviewBusy, setReviewBusy] = useDState(false);

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
      flash(`Saved · BIO v${json.bio?.version}. Steward will re-certify.`);
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
    setReviewBusy(true);
    try {
      const res = await apiFetch(`/api/bios/${live.brandId}/request-review`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      flash(json.reused ? "A human review is already in progress." : "Sent to your Brand Steward for review.");
      live.refresh();
    } catch (e) {
      flash(`Couldn't request review: ${e?.message || e}`);
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
      setSources(s => [{ src: ref, date: "just now", n: 0, fresh: true }, ...s]);
      flash(`Added "${ref.slice(0, 40)}". Brandolph will read it on next discovery.`);
    } catch (e) {
      flash(`Couldn't add: ${e?.message || e}`);
    } finally {
      setReading(false);
    }
  };

  const tabs = [
    ["identity", "Identity"],
    ["audience", "Audience"],
    ["competitive", "Competitive"],
    ["voice", "Voice"],
    ["visual", "Visual"],
    ["goals", "Goals"],
    ["strategic", "Strategic"],
    ["sources", "Sources"],
  ];

  const conf = score;
  const tone = conf >= 85
    ? { color:"var(--green-600)", word:"well sourced", hint:"Brandolph has enough evidence to trust this." }
    : conf >= 65
    ? { color:"var(--orange-600)", word:"filling in", hint:"Getting there — a few more sources will firm it up." }
    : { color:"var(--pink-500)", word:"needs more sources", hint:"Feed Brandolph more pages or files to raise this." };

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
                  <>Certified by <span style={{color:"var(--green-600)"}}>{live.cert.byName}</span> · {formatCertDate(live.cert.at)}</>
                ) : live.reviewPending && live.bio ? (
                  <>Your Brand Steward is reviewing this BIO</>
                ) : live.bio ? (
                  <>Awaiting certification by your Brand Steward</>
                ) : (
                  <>No BIO yet — type a URL on Discovery to extract one</>
                )}
              </div>
              {live.bio && (
                <div style={{fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--c-faint)", marginTop: 2}}>
                  {live.brandName} · BIO v{live.bio.version} · score {live.bio.score ?? "—"}/100
                </div>
              )}
              {!live.cert && live.focusCount > 0 && (
                <div style={{fontSize: 12, color:"var(--c-dim)", marginTop: 6, lineHeight: 1.5}}>
                  Brandolph flagged {live.focusCount} area{live.focusCount === 1 ? "" : "s"} for your Steward to confirm.
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
              {live.reviewPending ? "in review" : "within 24h"}
            </span>
          )}
        </div>
      )}

      {/* Stage-1 self-certification — unlocks briefing (shown until human cert lands) */}
      {live.brandId && live.bio && !live.cert && (
        <SelfCertPanel brandId={live.brandId} bio={live.bio} onDone={live.refresh} />
      )}

      {/* Hero */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 320px", gap: 28, marginBottom: 28, alignItems:"end"}}>
        <div>
          <div className="eyebrow" style={{marginBottom: 6}}>Brand Intelligence Object · {live.brandName || "Vinilo Coffee"}</div>
          <div style={{display:"flex", alignItems:"baseline", gap: 14}}>
            <span style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize: 88, lineHeight: 1, color: tone.color, fontWeight: 500}}>
              <Counter to={conf} />
            </span>
            <div>
              <div style={{fontFamily:"var(--font-mono)", fontSize:11, color: tone.color, letterSpacing:"0.06em", textTransform:"uppercase"}} title={tone.hint}>OF 100 · {tone.word}</div>
              <div style={{fontSize: 13, color:"var(--c-faint)", marginTop: 4, lineHeight: 1.5, maxWidth: 320}}>{tone.hint}</div>
              <div style={{fontSize: 14, color:"var(--c-dim)", marginTop: 6}}>
                {live.cert
                  ? `Certified ${formatCertDate(live.cert.at)}`
                  : live.bio
                  ? <>Uncertified <span style={{color:"var(--c-faint)", fontFamily:"var(--font-mono)", fontSize:11}} title={`BIO version ${live.bio.version}`}>· v{live.bio.version}</span></>
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
            <Icon name="plus" size={14} /> Feed Brandolph
          </button>
          {!editing ? (
            <button className="btn btn--ghost btn--sm" onClick={() => setEditing(true)} disabled={!bio}>
              <Icon name="edit" size={14} /> Edit BIO
            </button>
          ) : (
            <div style={{display:"flex", gap: 6, alignItems:"center"}}>
              <button className="btn btn--ghost btn--sm" disabled={saving}
                onClick={() => { setEditing(false); if (live.bio?.payload) setBio(payloadToFields(live.bio.payload)); setSaveErr(null); }}>
                Cancel
              </button>
              <button className="btn btn--primary btn--sm" disabled={saving || !bio} onClick={saveBio}>
                <Icon name="check" size={14} /> {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          )}
          <button className="btn btn--ghost btn--sm" onClick={() => go("discovery")}>
            <Icon name="refresh" size={14} /> Re-run discovery
          </button>
          {live.bio && (
            <button className="btn btn--ghost btn--sm" onClick={requestReview}
              disabled={reviewBusy || live.reviewPending}
              title={live.reviewPending ? "A human review is already in progress" : "Send this BIO to your Brand Steward for a human review — no edit required"}>
              <Icon name="mail" size={14} /> {live.reviewPending ? "In review…" : reviewBusy ? "Sending…" : "Request human review"}
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div className="card" style={{padding:"10px 16px", marginBottom:14, borderLeft:"3px solid var(--brand, var(--yellow-500))", display:"flex", alignItems:"center", gap:10}}>
          <Icon name="edit" size={15} />
          <span style={{fontSize:13, color:"var(--c-ink)"}}>Editing the BIO — saving creates a new version your Brand Steward will re-certify.</span>
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
            No canon yet.
          </h2>
          <p style={{margin:"0 0 22px", fontSize: 14, color:"var(--c-dim)", lineHeight: 1.6}}>
            The BIO is the source of truth every output is judged against. Point Discovery at your URL or paste what you have — Brandolph will compile the first draft in about thirty seconds. A senior Steward signs it before it becomes canon.
          </p>
          <div style={{display:"flex", gap: 10, justifyContent:"center"}}>
            <button className="btn btn--primary" onClick={() => go("discovery")}>
              <Icon name="sparkles" size={13} /> Start Discovery
            </button>
          </div>
        </div>
      )}

      {/* Tabs — only when we have a BIO */}
      {bio && (
        <div className="card" style={{padding: 0, overflow:"hidden"}}>
          <div className="tabs">
            {tabs.map(([k, l]) => (
              <button key={k} className={"tab" + (tab === k ? " tab--active" : "")} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
          <div style={{padding: 28}}>
            {["identity","audience","voice","goals"].includes(tab) && (
              <div style={{display:"grid", gridTemplateColumns:"180px 1fr 110px", gap:18, paddingBottom:10, marginBottom:2, borderBottom:"1px solid var(--c-line)", alignItems:"baseline"}}>
                <div className="eyebrow" style={{margin:0}}>Field</div>
                <div className="eyebrow" style={{margin:0}}>What we know</div>
                <div style={{textAlign:"right"}}>
                  <div className="eyebrow" style={{margin:0}} title="How sure Brandolph is about this field, based on its sources. Red = thin evidence, green = well sourced.">Confidence</div>
                  <div style={{fontFamily:"var(--font-mono)", fontSize:9.5, color:"var(--c-faint)", letterSpacing:"0.04em", textTransform:"uppercase", marginTop:3}}>low → high</div>
                </div>
              </div>
            )}
            {tab === "identity"    && <BioFieldList items={bio.identity}    editing={editing} onChange={v => patch("identity", v)} />}
            {tab === "audience"    && <BioFieldList items={bio.audience}    editing={editing} onChange={v => patch("audience", v)} />}
            {tab === "competitive" && (
              <div style={{padding: 24, textAlign:"center", color:"var(--c-faint)", fontSize: 13, fontStyle:"italic"}}>
                Competitive map comes from a32 (Competitor Map specialist) — wired in a later phase. The BIO Compiler doesn't extract competitors today.
              </div>
            )}
            {tab === "voice"       && <BioFieldList items={bio.voice}       editing={editing} onChange={v => patch("voice", v)} />}
            {tab === "visual"      && <BioVisual bio={bio} patch={patch} editing={editing} />}
            {tab === "goals"       && <BioFieldList items={bio.goals}       editing={editing} onChange={v => patch("goals", v)} />}
            {tab === "strategic"   && <BioStrategic strat={bio.strategic} patchStrategic={patchStrategic} editing={editing} />}
            {tab === "sources"     && <BioSources sources={sources} setSources={setSources} feed={feed} setFeed={setFeed} reading={reading} addReference={addReference} editing={editing} go={go} />}
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
  const set = (i, v) => onChange(items.map((x, j) => j === i ? v : x));
  return (
    <div style={{display:"flex", flexWrap:"wrap", gap:6, alignItems:"center"}}>
      {items.map((v, i) => (
        <span key={i} className="pill" style={{paddingRight:4, gap:2}}>
          <input value={v} onChange={(e) => set(i, e.target.value)} style={{border:"none", background:"transparent", outline:"none", font:"inherit", color:"inherit", width: Math.max(36, (v.length || 4) * 7) + "px"}} />
          <button onClick={() => onChange(items.filter((_, j) => j !== i))} style={CHIP_X} title="Remove">×</button>
        </span>
      ))}
      <button className="pill" onClick={() => onChange([...items, ""])} style={{borderStyle:"dashed", cursor:"pointer", color:"var(--c-dim)"}}>+ add</button>
    </div>
  );
}

function StringListEditor({ items, onChange, marker, color }) {
  const set = (i, v) => onChange(items.map((x, j) => j === i ? v : x));
  return (
    <ul style={{margin:0, padding:0, listStyle:"none", display:"flex", flexDirection:"column", gap:8}}>
      {items.map((x, i) => (
        <li key={i} style={{display:"flex", gap:8, alignItems:"flex-start"}}>
          {marker && <span style={{color, lineHeight:"34px"}}>{marker}</span>}
          <div style={{flex:1}}><EditInput value={x} onChange={(v) => set(i, v)} /></div>
          <button onClick={() => onChange(items.filter((_, j) => j !== i))} style={{...CHIP_X, lineHeight:"34px"}} title="Remove">×</button>
        </li>
      ))}
      <li><button className="btn btn--ghost btn--sm" onClick={() => onChange([...items, ""])}><Icon name="plus" size={12} /> Add item</button></li>
    </ul>
  );
}

function EditableField({ f, editing, onChange, onRemove }) {
  if (!editing) {
    return (
      <div style={{display:"grid", gridTemplateColumns: "180px 1fr 110px", gap: 18, padding:"14px 0", borderBottom:"1px solid var(--c-line)", alignItems:"start"}}>
        <div>
          <div style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--c-faint)", letterSpacing:"0.06em", textTransform:"uppercase"}}>{f.label}</div>
          {f.source && <div style={{fontSize: 11, color:"var(--c-faint)", marginTop: 4, fontStyle:"italic"}}>from {f.source}</div>}
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
        <EditInput value={f.label} onChange={(v) => onChange({ label: v })} placeholder="Label" mono />
        <EditInput value={f.source || ""} onChange={(v) => onChange({ source: v })} placeholder="Source" />
      </div>
      <div>
        {f.multi
          ? <ChipEditor items={f.value || []} onChange={(v) => onChange({ value: v })} />
          : <EditInput area value={f.value} onChange={(v) => onChange({ value: v })} placeholder="Value" />}
      </div>
      <div style={{display:"flex", flexDirection:"column", alignItems:"flex-end", gap:8}}>
        <div style={{display:"flex", alignItems:"center", gap:4}}>
          <input type="number" min={0} max={100} value={f.conf} onChange={(e) => onChange({ conf: Math.max(0, Math.min(100, +e.target.value || 0)) })} style={{...EDIT_INPUT, width:56, height:30, textAlign:"right", fontFamily:"var(--font-mono)", fontSize:12}} />
          <span style={{fontSize:11, color:"var(--c-faint)"}}>%</span>
        </div>
        <button className="btn btn--link" style={{fontSize:11, color:"var(--pink-500)"}} onClick={onRemove}>Remove field</button>
      </div>
    </div>
  );
}

function BioFieldList({ items, editing, onChange }) {
  const upd = (i, p) => onChange(items.map((x, j) => j === i ? { ...x, ...p } : x));
  const rm = (i) => onChange(items.filter((_, j) => j !== i));
  const add = (multi) => onChange([...items, { label: "New field", value: multi ? [] : "", conf: 50, source: "manual entry", multi }]);
  return (
    <div>
      {items.map((f, i) => <EditableField key={i} f={f} editing={editing} onChange={(p) => upd(i, p)} onRemove={() => rm(i)} />)}
      {editing && (
        <div style={{display:"flex", gap:8, marginTop:14}}>
          <button className="btn btn--ghost btn--sm" onClick={() => add(false)}><Icon name="plus" size={13} /> Add field</button>
          <button className="btn btn--ghost btn--sm" onClick={() => add(true)}><Icon name="plus" size={13} /> Add list field</button>
        </div>
      )}
    </div>
  );
}
function BioSectionHead({ label, source, conf }) {
  return (
    <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:14}}>
      <div>
        <div style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--c-faint)", letterSpacing:"0.08em", textTransform:"uppercase"}}>{label}</div>
        {source && <div style={{fontSize:11, color:"var(--c-faint)", marginTop:3, fontStyle:"italic"}}>from {source}</div>}
      </div>
      {conf != null && <Confidence value={conf} />}
    </div>
  );
}

function BioVisual({ bio, patch, editing }) {
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
        <BioSectionHead label="Colour palette" source="extracted from 47 pages + logo" conf={94} />
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(160px, 1fr))", gap:12}}>
          {bio.palette.map((c, i) => (
            <div key={i} className="card" style={{padding:0, overflow:"hidden"}}>
              <div style={{height:92, background:c.hex, display:"flex", alignItems:"flex-end", justifyContent:"space-between", padding:10}}>
                {editing
                  ? <input type="color" value={c.hex} onChange={(e) => updPal(i, { hex: e.target.value })} style={{width:30, height:24, border:"none", background:"transparent", cursor:"pointer", padding:0}} />
                  : <span style={{fontFamily:"var(--font-mono)", fontSize:10.5, color: dark(c.hex) ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.6)", letterSpacing:"0.04em"}}>{c.hex}</span>}
                {editing && <button onClick={() => patch("palette", bio.palette.filter((_, j) => j !== i))} style={{...CHIP_X, color: dark(c.hex) ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.6)", fontSize:16}} title="Remove colour">×</button>}
              </div>
              <div style={{padding:"10px 12px"}}>
                {editing
                  ? <div style={{display:"flex", flexDirection:"column", gap:6}}>
                      <EditInput value={c.name} onChange={(v) => updPal(i, { name: v })} placeholder="Name" />
                      <div style={{display:"flex", gap:6}}>
                        <EditInput value={c.wcag} onChange={(v) => updPal(i, { wcag: v })} placeholder="WCAG" mono />
                        <input type="number" min={0} max={100} value={c.conf} onChange={(e) => updPal(i, { conf: +e.target.value || 0 })} style={{...EDIT_INPUT, width:60, height:34, fontFamily:"var(--font-mono)", fontSize:11.5}} />
                      </div>
                    </div>
                  : <>
                      <div style={{fontSize:13.5, fontWeight:600, color:"var(--c-ink)"}}>{c.name}</div>
                      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:8}}>
                        <span className="pill" style={{height:18, padding:"0 8px", fontSize:9.5}}>WCAG {c.wcag}</span>
                        <span style={{fontFamily:"var(--font-mono)", fontSize:10, color: c.conf >= 85 ? "var(--green-600)" : c.conf >= 65 ? "var(--orange-600)" : "var(--pink-500)"}}>{c.conf}%</span>
                      </div>
                    </>}
              </div>
            </div>
          ))}
          {editing && (
            <button className="card" onClick={() => patch("palette", [...bio.palette, { hex:"#888888", name:"New colour", conf:50, wcag:"—" }])}
              style={{display:"flex", alignItems:"center", justifyContent:"center", minHeight:150, borderStyle:"dashed", cursor:"pointer", color:"var(--c-dim)", gap:6}}>
              <Icon name="plus" size={16} /> Add colour
            </button>
          )}
        </div>
      </section>

      {/* TYPOGRAPHY */}
      <section>
        <BioSectionHead label="Typography" source="visual extraction" conf={88} />
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
          {bio.type.map((t, i) => {
            const serif = /sectra|serif|display/i.test(t.family) && t.kind === "Body";
            const ff = serif ? "Georgia, 'Times New Roman', serif" : "var(--font-sans)";
            return (
              <div key={i} className="card" style={{padding:18}}>
                <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8}}>
                  {editing
                    ? <input value={t.kind} onChange={(e) => updType(i, { kind: e.target.value })} style={{...EDIT_INPUT, width:130, height:28}} />
                    : <span className="eyebrow">{t.kind}</span>}
                  {editing
                    ? <button className="btn btn--link" style={{fontSize:11, color:"var(--pink-500)"}} onClick={() => patch("type", bio.type.filter((_, j) => j !== i))}>Remove</button>
                    : <span className="pill" style={{height:18, padding:"0 8px", fontSize:9.5}}>{t.license}</span>}
                </div>
                <div style={{fontFamily:ff, fontSize:52, lineHeight:1, color:"var(--c-ink)", fontWeight:600, letterSpacing:"-0.02em"}}>Aa Gg</div>
                <div style={{fontFamily:ff, fontSize:15, color:"var(--c-dim)", marginTop:8, lineHeight:1.4}}>The decision to slow down, on purpose.</div>
                <div style={{marginTop:14, paddingTop:12, borderTop:"1px dashed var(--c-line-2)"}}>
                  {editing
                    ? <div style={{display:"flex", flexDirection:"column", gap:6}}>
                        <EditInput value={t.family} onChange={(v) => updType(i, { family: v })} placeholder="Family" />
                        <div style={{display:"flex", gap:6}}>
                          <EditInput value={t.size} onChange={(v) => updType(i, { size: v })} placeholder="Size" mono />
                          <EditInput value={t.license} onChange={(v) => updType(i, { license: v })} placeholder="License" />
                        </div>
                        <EditInput value={t.suggest} onChange={(v) => updType(i, { suggest: v })} placeholder="Web alternative" />
                      </div>
                    : <>
                        <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline"}}>
                          <span style={{fontSize:13, fontWeight:500, color:"var(--c-ink)"}}>{t.family}</span>
                          <span style={{fontFamily:"var(--font-mono)", fontSize:10.5, color:"var(--c-faint)"}}>{t.size}</span>
                        </div>
                        <div style={{fontSize:11.5, color:"var(--c-faint)", marginTop:4}}>Web alternative · {t.suggest}</div>
                      </>}
                </div>
              </div>
            );
          })}
          {editing && (
            <button className="card" onClick={() => patch("type", [...bio.type, { kind:"New face", family:"Family name", size:"16/24", license:"free", suggest:"system" }])}
              style={{display:"flex", alignItems:"center", justifyContent:"center", minHeight:120, borderStyle:"dashed", cursor:"pointer", color:"var(--c-dim)", gap:6}}>
              <Icon name="plus" size={16} /> Add typeface
            </button>
          )}
        </div>
      </section>

      {/* IMAGERY */}
      <section>
        <BioSectionHead label="Imagery" source="image analysis · 90 posts" conf={84} />
        <div className="card card--inset" style={{padding:"14px 16px", marginBottom:12}}>
          <div className="eyebrow" style={{marginBottom:6}}>Grade</div>
          {editing
            ? <EditInput area value={bio.grade} onChange={(v) => patch("grade", v)} />
            : <p style={{fontSize:14, color:"var(--c-ink)", lineHeight:1.5, margin:0}}>{bio.grade}</p>}
        </div>
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
          <div className="card" style={{padding:16, borderLeft:"3px solid var(--green-600)"}}>
            <div className="eyebrow eyebrow--green" style={{marginBottom:10}}>Shoot this</div>
            {editing
              ? <StringListEditor items={bio.imagery} onChange={(v) => patch("imagery", v)} marker="✓" color="var(--green-600)" />
              : <ul style={{margin:0, padding:0, listStyle:"none", display:"flex", flexDirection:"column", gap:7}}>
                  {bio.imagery.map((x, i) => <li key={i} style={{fontSize:13, color:"var(--c-ink)", display:"flex", gap:8, lineHeight:1.45}}><span style={{color:"var(--green-600)"}}>✓</span> {x}</li>)}
                </ul>}
          </div>
          <div className="card" style={{padding:16, borderLeft:"3px solid var(--pink-500)"}}>
            <div className="eyebrow eyebrow--pink" style={{marginBottom:10}}>Never this</div>
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
  return (
    <div style={{display:"grid", gridTemplateColumns: "1fr 1fr", gap: 18}}>
      <div className="card" style={{padding: 18, borderLeft: "3px solid var(--yellow-500)"}}>
        <div className="eyebrow eyebrow--yellow" style={{marginBottom: 8}}>Strategic watchouts</div>
        {editing
          ? <StringListEditor items={strat.watchouts} onChange={(v) => patchStrategic("watchouts", v)} />
          : <ul style={{margin: 0, paddingLeft: 0, listStyle:"none", display:"flex", flexDirection:"column", gap: 10}}>
              {strat.watchouts.map((x, i) => <li key={i} style={{fontSize: 13.5, color:"var(--c-ink)"}}>{x}</li>)}
            </ul>}
      </div>
      <div className="card" style={{padding: 18, borderLeft:"3px solid var(--orange-500)"}}>
        <div className="eyebrow" style={{color:"var(--orange-600)", marginBottom: 8}}>Gaps</div>
        {editing
          ? <StringListEditor items={strat.gaps} onChange={(v) => patchStrategic("gaps", v)} />
          : <ul style={{margin:0, paddingLeft: 0, listStyle:"none", display:"flex", flexDirection:"column", gap: 10}}>
              {strat.gaps.map((x, i) => <li key={i} style={{fontSize: 13.5, color:"var(--c-ink)"}}>{x}</li>)}
            </ul>}
      </div>
      <div className="card" style={{padding: 18, borderLeft:"3px solid var(--pink-500)", gridColumn: "1 / -1"}}>
        <div className="eyebrow eyebrow--pink" style={{marginBottom: 8}}>What Vinilo is NOT</div>
        {editing
          ? <StringListEditor items={strat.notList} onChange={(v) => patchStrategic("notList", v)} marker="✕" color="var(--pink-500)" />
          : <ul style={{margin: 0, paddingLeft: 0, listStyle:"none", display:"grid", gridTemplateColumns: "1fr 1fr", gap: 10}}>
              {strat.notList.map((x, i) => <li key={i} style={{fontSize:13.5}}>✕ {x}</li>)}
            </ul>}
      </div>
      <div className="card" style={{padding: 18, gridColumn: "1 / -1"}}>
        <div className="eyebrow eyebrow--purple" style={{marginBottom: 8}}>Brandolph's diagnosis · this week</div>
        {editing
          ? <EditInput area value={strat.diagnosis} onChange={(v) => patchStrategic("diagnosis", v)} />
          : <p style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize: 16, lineHeight: 1.55, color:"var(--c-ink)", margin: 0}}>"{strat.diagnosis}"</p>}
      </div>
    </div>
  );
}
function BioSources({ sources, setSources, feed, setFeed, reading, addReference, editing, go }) {
  const total = sources.reduce((a, s) => a + s.n, 0);
  const onKey = (e) => { if (e.key === "Enter") { e.preventDefault(); addReference(); } };
  return (
    <div>
      {/* Feed composer */}
      <div className="card card--inset" style={{padding:18, marginBottom:22}}>
        <div style={{display:"flex", alignItems:"center", gap:9, marginBottom:12}}>
          <BrandolphDot state={reading ? "thinking" : "idle"} />
          <div>
            <div style={{fontSize:14, fontWeight:600, color:"var(--c-ink)"}}>Feed Brandolph</div>
            <div style={{fontSize:12, color:"var(--c-faint)"}}>Drop a link, a doc, or a note. Brandolph reads it and tightens the BIO.</div>
          </div>
        </div>
        <div style={{display:"flex", gap:10}}>
          <input
            value={feed}
            onChange={(e) => setFeed(e.target.value)}
            onKeyDown={onKey}
            disabled={reading}
            placeholder="Paste a URL — site, article, competitor, social…"
            style={{flex:1, height:42, borderRadius:9, border:"1px solid var(--c-line-2)", background:"var(--c-bg)", padding:"0 14px", fontSize:14, color:"var(--c-ink)", outline:"none"}}
          />
          <button className="btn btn--primary" disabled={reading || !feed.trim()} onClick={() => addReference()}>
            {reading ? <><BrandolphDot state="thinking" size={11} /> Reading…</> : <><Icon name="plus" size={14} /> Read it</>}
          </button>
        </div>
        <div style={{display:"flex", gap:8, marginTop:12, flexWrap:"wrap"}}>
          <button className="btn btn--ghost btn--sm" disabled={reading} onClick={() => addReference("Document upload · brand-deck.pdf", "doc")}><Icon name="files" size={13} /> Upload document</button>
          <button className="btn btn--ghost btn--sm" disabled={reading} onClick={() => addReference("Instagram · @vinilo.coffee · latest 30 posts")}><Icon name="refresh" size={13} /> Re-pull social</button>
          <button className="btn btn--ghost btn--sm" disabled={reading} onClick={() => addReference("Competitor · blue-bottle.com")}><Icon name="plus" size={13} /> Add competitor</button>
        </div>
      </div>

      {/* Ledger header */}
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:6}}>
        <div className="eyebrow">{sources.length} sources · {total} signals learned</div>
        <div style={{fontSize:11.5, color:"var(--c-faint)", fontStyle:"italic"}}>Every source compounds the BIO.</div>
      </div>

      {/* Source ledger */}
      <div>
        {sources.map((s, i) => (
          <div key={i} style={{display:"grid", gridTemplateColumns:"1fr auto auto", gap: 14, padding:"12px 0", borderBottom: "1px solid var(--c-line)", alignItems:"center", animation: s.fresh ? "cvPopIn 260ms ease" : "none"}}>
            <div>
              <div style={{fontSize: 13.5, color:"var(--c-ink)", fontWeight:500, display:"flex", alignItems:"center", gap:8}}>
                {s.src}
                {s.fresh && <span className="pill" style={{height:18, padding:"0 8px", fontSize:9.5, background:"var(--green-50, rgba(127,163,122,0.16))", color:"var(--green-600)"}}>new</span>}
              </div>
              <div style={{fontFamily:"var(--font-mono)", fontSize: 10.5, color:"var(--c-faint)", marginTop: 2, letterSpacing:"0.04em"}}>{s.date}</div>
            </div>
            <span className="pill">{s.n} signals</span>
            {editing
              ? <button className="btn btn--link" style={{fontSize: 12, color:"var(--pink-500)"}} onClick={() => setSources(sources.filter((_, j) => j !== i))}>Remove</button>
              : <button className="btn btn--link" style={{fontSize: 12}} onClick={() => go("discovery")}>Re-extract</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { Discovery, BioViewer });
