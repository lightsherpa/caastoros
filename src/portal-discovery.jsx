import React from "react";
import { apiFetch, supabase } from "./lib/supabase-browser.js";
import { BrandolphLine } from "./portal-shared.jsx";
const { BrandolphAvatar, BrandolphDot, Confidence, Counter, Icon, Reveal } = window;
/* Discovery (3-step intake) + BIO viewer. */

const { useState: useDState, useEffect: useDEffect } = React;
const SOURCE_FILE_ACCEPT = ".pdf,.docx,.pptx,.txt,.md";
const MAX_SOURCE_FILE_BYTES = 20 * 1024 * 1024;

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
        /* Two-tier cert. Discovery self-certifies its own compile
           (certified = true, certified_by NULL). byName MUST stay null in
           that case — the old default put "your Brand Steward" on work no
           human ever read, which is a fabricated human endorsement. Only a
           real certified_by may produce a name. */
        let certName = null;
        if (bio.certified_by) {
          const { data: tm } = await supabase.from("team_members").select("first_name, name").eq("id", bio.certified_by).maybeSingle();
          certName = tm?.first_name || tm?.name || "your Brand Steward";
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
  const [url, setUrl] = useDState("");
  const [instagram, setInstagram] = useDState("");
  const [intake, setIntake] = useDState({ offer: "", audience: "", never: "", priority: "", competitors: "" });
  const [busy, setBusy] = useDState(false);
  const [error, setError] = useDState(null);
  const [uploading, setUploading] = useDState(false);
  const addToBucket = (key) => (newFiles) =>
    setUploadsByBucket(prev => ({ ...prev, [key]: [...prev[key], ...newFiles] }));
  const removeFromBucket = (key) => (idx) =>
    setUploadsByBucket(prev => ({ ...prev, [key]: prev[key].filter((_, i) => i !== idx) }));
  const patchIntake = (key) => (e) => setIntake(prev => ({ ...prev, [key]: e.target.value }));
  const intakeAnswers = () => Object.entries({
    offer: intake.offer.trim(),
    audience: intake.audience.trim(),
    never: intake.never.trim(),
    priority: intake.priority.trim(),
    competitors: intake.competitors.trim(),
  }).filter(([, value]) => value);

  const resolveExistingBrandId = async () => {
    const current = window.getCurrentBrandId?.();
    if (current) return current;
    const res = await apiFetch("/api/brands");
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    const brand = json.brands?.[0];
    if (!brand?.id) throw new Error("No brand in workspace yet.");
    window.setCurrentBrandId?.(brand.id);
    return brand.id;
  };

  const handleStart = async () => {
    if (newBrand && !brandName.trim()) { setError("Brand name is required."); return; }
    if (!url.trim()) { setError("Primary website URL is required."); return; }
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
      const brandId = newBrandId || await resolveExistingBrandId();

      const answers = intakeAnswers();
      if (answers.length) {
        const sourceRes = await apiFetch(`/api/bios/${brandId}/sources`, {
          method: "POST",
          body: JSON.stringify({
            sources: [{
              kind: "client_intake",
              bucket: "foundations",
              src: "Discovery intake",
              signals: Object.fromEntries(answers),
            }],
          }),
        });
        if (!sourceRes.ok) {
          const err = await sourceRes.json().catch(() => ({ error: `HTTP ${sourceRes.status}` }));
          throw new Error(err.error || `HTTP ${sourceRes.status}`);
        }
      }

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
      const res = await apiFetch("/api/discovery/start", {
        method: "POST",
        body: JSON.stringify({ url: targetUrl, instagram, brandId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const { eventId } = await res.json();
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
                <input className="input" value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="e.g. Hermes" />
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
                Quick intake <span style={{color:"var(--c-faint)", fontWeight:400}}>· optional, improves accuracy</span>
              </label>
              <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))", gap: 10}}>
                <textarea className="input" rows={2} value={intake.offer} onChange={patchIntake("offer")} placeholder="What do you sell?" style={{resize:"vertical"}} />
                <textarea className="input" rows={2} value={intake.audience} onChange={patchIntake("audience")} placeholder="Primary customer" style={{resize:"vertical"}} />
                <textarea className="input" rows={2} value={intake.never} onChange={patchIntake("never")} placeholder="What should we never say?" style={{resize:"vertical"}} />
                <textarea className="input" rows={2} value={intake.priority} onChange={patchIntake("priority")} placeholder="Next 90-day priority" style={{resize:"vertical"}} />
                <textarea className="input" rows={2} value={intake.competitors} onChange={patchIntake("competitors")} placeholder="Competitors or references" style={{resize:"vertical", gridColumn:"1 / -1"}} />
              </div>
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

function DiscoveryStep2Results({ onConfirm }) {
  const [tab, setTab] = useDState("identity");
  /* Pull live BIO + cert state so the Steward chip flips in real time
     if a certification lands while the user is on this screen. */
  const live = useLiveBio({ pollMs: 5000 });
  const payload = live.bio?.payload || null;
  const bio = payload ? payloadToFields(payload) : null;
  const score = live.bio?.score ?? 0;
  const evidence = payload?.evidence || {};
  const statusMap = payload?.fieldStatus || {};
  const confidence = payload?.confidence || {};

  const confFor = (item) => typeof item?.conf === "number" ? item.conf : null;
  const pathFor = (section, item) => {
    const key = {
      Positioning: "positioning",
      Category: "category",
      Founded: "founded",
      Pillars: "pillars",
      Primary: "primary",
      Secondary: "secondary",
      Tertiary: "tertiary",
      "Jobs to be done": "jtbd",
      Register: "register",
      Forbidden: "forbidden",
      Rhythm: "rhythm",
      Signatures: "signatures",
      "North star": "northStar",
      "This quarter": "q2",
      "Next quarter": "q3",
    }[item.label];
    return key ? `${section}.${key}` : null;
  };
  const valueText = (value) => Array.isArray(value) ? value.join(", ") : value || "Missing";
  const evidenceText = (section, item) => {
    const path = pathFor(section, item);
    return path ? evidence[path] || confidence[path]?.source || item.source || "" : item.source || "";
  };
  const statusText = (section, item) => {
    const path = pathFor(section, item);
    return path ? statusMap[path] || "" : "";
  };
  const renderRows = (section, rows = []) => (
    <table style={{width:"100%", borderCollapse:"collapse", fontSize: 14}}>
      <tbody>
        {rows.map((row, i) => (
          <tr key={row.label} style={{borderBottom: i < rows.length - 1 ? "1px solid var(--c-line)" : "none"}}>
            <td style={{padding:"11px 0", color:"var(--c-faint)", width: 150, fontSize: 12}}>{row.label}</td>
            <td style={{padding:"11px 12px 11px 0", color: valueText(row.value) === "Missing" ? "var(--orange-600)" : "var(--c-ink)", lineHeight: 1.45}}>
              {valueText(row.value)}
              {(evidenceText(section, row) || statusText(section, row)) && (
                <div style={{fontSize: 11, color:"var(--c-faint)", marginTop: 4}}>
                  {[statusText(section, row), evidenceText(section, row)].filter(Boolean).join(" · ")}
                </div>
              )}
            </td>
            <td style={{padding:"11px 0", textAlign:"right", width: 72}}>
              {confFor(row) != null ? <Confidence value={confFor(row)} /> : <span style={{fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--c-faint)"}}>—</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  const empty = (label) => (
    <div style={{padding: 18, border:"1px dashed var(--c-line-2)", borderRadius: 8, color:"var(--c-faint)", fontSize: 13}}>
      {label}
    </div>
  );
  const missingCount = Array.isArray(payload?.missing) ? payload.missing.length : 0;
  const tabs = [
    ["identity", "Identity", bio?.identity?.length || 0],
    ["audience", "Audience", bio?.audience?.length || 0],
    ["voice", "Voice", bio?.voice?.length || 0],
    ["visual", "Visual", (bio?.palette?.length || 0) + (bio?.type?.length || 0) + (bio?.imagery?.length || 0)],
    ["goals", "Goals", bio?.goals?.length || 0],
    ["strategic", "Strategic", (bio?.strategic?.watchouts?.length || 0) + (bio?.strategic?.notList?.length || 0) + missingCount],
  ];

  if (live.loading && !bio) {
    return (
      <div style={{maxWidth: 760, margin:"40px auto 0"}}>
        <div className="card" style={{padding: 24, display:"flex", alignItems:"center", gap: 12}}>
          <BrandolphDot state="thinking" size={12} />
          <span style={{fontSize: 14, color:"var(--c-ink)"}}>Loading the compiled BIO…</span>
        </div>
      </div>
    );
  }

  if (!bio) {
    return (
      <div style={{maxWidth: 760, margin:"40px auto 0"}}>
        <div className="card" style={{padding: 24}}>
          <h2 style={{margin:"0 0 8px", fontSize: 20}}>No compiled BIO found yet.</h2>
          <p style={{margin: 0, color:"var(--c-dim)", fontSize: 14}}>{live.error || "Discovery is still running or needs to be started again."}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{maxWidth: 1080, margin:"24px auto 0"}}>
      {/* Brand Steward notice — the moat-defining trust signal per rev-2 §17 */}
      <Reveal>
        <div style={{
          background: live.cert ? "var(--green-50, rgba(127,163,122,0.10))" : "var(--yellow-50, rgba(252,211,77,0.10))",
          border: `1px solid ${live.cert ? "var(--green-300, rgba(127,163,122,0.4))" : "var(--yellow-300, rgba(252,211,77,0.4))"}`,
          borderRadius: 14, padding: "16px 22px", marginBottom: 16,
          display:"flex", alignItems:"center", gap: 16,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: "50%",
            background: live.cert ? "var(--green-500)" : "var(--yellow-500)",
            color:"#fff", display:"flex", alignItems:"center", justifyContent:"center",
            fontFamily:"Georgia, serif", fontStyle:"italic", fontWeight: 500, fontSize: 18,
            flexShrink: 0,
          }}>{live.cert ? "✓" : (live.cert?.byName?.[0] || "S")}</div>
          <div style={{flex: 1}}>
            <div style={{fontSize: 14, fontWeight: 500, color:"var(--c-ink)", marginBottom: 2}}>
              {live.cert?.byName
                ? <>Your BIO is certified by <span style={{color:"var(--green-600)"}}>{live.cert.byName}</span></>
                : live.cert
                ? <>Your BIO is self-certified and ready to use</>
                : <>A senior human will certify your BIO within 24h</>}
            </div>
            <div style={{fontSize: 12.5, color:"var(--c-dim)", lineHeight: 1.5}}>
              {live.cert?.byName
                ? <>Your BIO now carries {live.cert.byName}'s certification — every run is grounded in it, and you can add human finishing to any output. <button onClick={() => onConfirm && onConfirm()} className="btn btn--link" style={{fontSize: 12.5, padding: 0}}>Continue to your workspace →</button></>
                : live.cert
                ? <>Brandolph compiled it, so briefs can run against it now — but no senior human has read it yet. Your Brand Steward signs the BIO next; from then on every run is grounded in a human-certified BIO. <button onClick={() => onConfirm && onConfirm()} className="btn btn--link" style={{fontSize: 12.5, padding: 0}}>Continue to your workspace →</button></>
                : <>Your Brand Steward — a senior La&nbsp;Mesa designer — reads what Brandolph extracted, refines anything that's not quite right, and signs the BIO. From that moment every run is grounded in a BIO a senior human certified — and you can add their finishing to any output.</>}
            </div>
          </div>
        </div>
      </Reveal>

      <Reveal>
        <div style={{
          background:"var(--c-card)", border:"1px solid var(--c-line)", borderRadius: 14,
          padding: "22px 26px",
          display:"grid", gridTemplateColumns:"1fr auto", gap: 20, alignItems:"center", marginBottom: 18,
        }}>
          <div>
            <div style={{display:"flex", alignItems:"center", gap:12, marginBottom: 6}}>
              <span style={{width:36, height: 36, borderRadius: 8, background:"var(--neutral-900)", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"var(--font-mono)", fontWeight:600, fontSize: 18}}>{(live.brandName || "B").slice(0, 1).toUpperCase()}</span>
              <h2 style={{margin:0, fontSize: 22, letterSpacing:"-0.01em"}}>{live.brandName || "Brand"}</h2>
            </div>
            <p style={{margin: 0, color:"var(--c-dim)", fontSize: 14}}>
              {payload.identity?.positioning || "Candidate BIO compiled."}
              {live.brandUrl && <> · <a href={live.brandUrl} style={{color:"var(--purple-500)"}}>{live.brandUrl.replace(/^https?:\/\//, "")}</a></>}
            </p>
            <div style={{marginTop: 12, display:"flex", gap: 14, alignItems:"center", fontFamily:"var(--font-mono)", fontSize:11, color:"var(--c-dim)", letterSpacing:"0.06em"}}>
              <span><span className="dot-state dot-state--ok" /> EXTRACTION COMPLETE</span>
              <span>· BIO v{live.bio?.version}</span>
              <span>· {live.reviewPending ? "Steward review queued" : live.cert ? "certified" : "review pending"}</span>
              {missingCount > 0 && <span style={{color:"var(--orange-600)"}}>· {missingCount} gap{missingCount === 1 ? "" : "s"}</span>}
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div className="eyebrow eyebrow--yellow" style={{marginBottom: 4}}>Overall confidence</div>
            <div style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize: 56, lineHeight: 1, color:"var(--green-600)", fontWeight: 500}}>
              <Counter to={score} format={n => Math.round(n)} />
            </div>
            <div style={{fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--c-faint)", marginTop: 2}}>OF 100</div>
          </div>
        </div>
      </Reveal>

      {missingCount > 0 && <Reveal>
        <div style={{
          marginBottom: 14,
          background:"var(--yellow-50)", border:"1px solid var(--yellow-200)", borderRadius: 10,
          padding:"12px 16px",
          display:"flex", justifyContent:"space-between", alignItems:"center", gap: 14,
        }}>
          <div style={{display:"flex", alignItems:"center", gap: 10}}>
            <Icon name="flag" size={14} />
            <span style={{fontSize: 13, color:"var(--c-ink)"}}>
              <strong style={{fontWeight: 600}}>{missingCount} gap{missingCount === 1 ? "" : "s"} to resolve.</strong> The Steward will review unsupported or missing fields before certification.
            </span>
          </div>
        </div>
      </Reveal>}

      <Reveal>
        <div className="card" style={{padding: 0, overflow:"hidden"}}>
          <div className="tabs">
            {[
              ...tabs,
            ].map(([k, l, count]) => (
              <button key={k} className={"tab" + (tab === k ? " tab--active" : "")} onClick={() => setTab(k)}>
                {l} <span className="tab__count">{count}</span>
              </button>
            ))}
          </div>
          <div style={{padding: 24}}>
            {tab === "identity" && (
              <div>
                <div className="eyebrow" style={{marginBottom: 12}}>Facts captured</div>
                {renderRows("identity", bio.identity)}
              </div>
            )}
            {tab === "audience" && (
              <div>
                <div className="eyebrow" style={{marginBottom: 12}}>Audience read</div>
                {renderRows("audience", bio.audience)}
              </div>
            )}
            {tab === "voice" && (
              <div>
                <div className="eyebrow" style={{marginBottom: 12}}>Voice read</div>
                {renderRows("voice", bio.voice)}
              </div>
            )}
            {tab === "visual" && (
              <div style={{display:"flex", flexDirection:"column", gap: 24}}>
                <div>
                  <div className="eyebrow" style={{marginBottom: 12}}>Palette</div>
                  {bio.palette.length ? (
                    <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(130px, 1fr))", gap: 14}}>
                      {bio.palette.map((c, i) => (
                        <div key={`${c.hex || c.name}-${i}`} className="card" style={{padding: 0, overflow:"hidden"}}>
                          <div style={{aspectRatio:"1.4/1", background: c.hex || "#ddd"}} />
                          <div style={{padding:"10px 12px"}}>
                            <div style={{fontSize: 13, fontWeight: 500, color:"var(--c-ink)"}}>{c.name || "Colour"}</div>
                            <div style={{fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--c-faint)", marginTop: 2}}>{c.hex || "—"}</div>
                            <div style={{marginTop: 10, display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                              {typeof c.conf === "number" ? <Confidence value={c.conf} /> : <span />}
                              <span style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--c-faint)", letterSpacing:"0.06em"}}>WCAG {c.wcag || "—"}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : empty("No palette extracted from the source yet.")}
                </div>
                <div>
                  <div className="eyebrow" style={{marginBottom: 12}}>Typography</div>
                  {bio.type.length ? (
                    <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))", gap: 16}}>
                      {bio.type.map((t, i) => (
                        <div key={`${t.family || t.kind}-${i}`} className="card" style={{padding: 18}}>
                          <div className="eyebrow" style={{marginBottom: 8}}>{t.kind || "Type"}</div>
                          <div style={{fontSize: 22, fontWeight: 700, color:"var(--c-ink)", marginBottom: 4}}>{t.family || "Unknown family"}</div>
                          <div style={{fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--c-faint)"}}>{[t.size, t.license, t.suggest && `substitute ${t.suggest}`].filter(Boolean).join(" · ") || "No metadata"}</div>
                        </div>
                      ))}
                    </div>
                  ) : empty("No typography extracted from the source yet.")}
                </div>
                <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(240px, 1fr))", gap: 18}}>
                  <div>
                    <div className="eyebrow" style={{marginBottom: 10}}>Imagery</div>
                    {bio.imagery.length ? (
                      <ul style={{margin:0, padding:0, listStyle:"none", display:"flex", flexDirection:"column", gap:8}}>
                        {bio.imagery.map((item, i) => <li key={i} style={{fontSize:13, color:"var(--c-ink)", lineHeight:1.45}}>✓ {item}</li>)}
                      </ul>
                    ) : empty("No imagery direction extracted yet.")}
                  </div>
                  <div>
                    <div className="eyebrow eyebrow--pink" style={{marginBottom: 10}}>Avoid</div>
                    {bio.avoid.length ? (
                      <ul style={{margin:0, padding:0, listStyle:"none", display:"flex", flexDirection:"column", gap:8}}>
                        {bio.avoid.map((item, i) => <li key={i} style={{fontSize:13, color:"var(--c-faint)", lineHeight:1.45}}>✕ {item}</li>)}
                      </ul>
                    ) : empty("No visual avoid-list extracted yet.")}
                  </div>
                </div>
              </div>
            )}
            {tab === "goals" && (
              <div>
                <div className="eyebrow" style={{marginBottom: 12}}>Goals</div>
                {renderRows("goals", bio.goals)}
              </div>
            )}
            {tab === "strategic" && (
              <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(260px, 1fr))", gap: 22}}>
                {[
                  ["Watchouts", bio.strategic.watchouts],
                  ["Not-list", bio.strategic.notList],
                  ["Gaps", bio.strategic.gaps],
                ].map(([title, items]) => (
                  <div key={title}>
                    <div className="eyebrow" style={{marginBottom: 12}}>{title}</div>
                    {items.length ? (
                      <ul style={{margin:0, padding:0, listStyle:"none", display:"flex", flexDirection:"column", gap: 8}}>
                        {items.map((item, i) => (
                          <li key={i} style={{fontSize: 13, color:"var(--c-ink)", lineHeight: 1.45, padding:"10px 12px", border:"1px solid var(--c-line)", borderRadius: 8}}>{item}</li>
                        ))}
                      </ul>
                    ) : empty(`No ${title.toLowerCase()} yet.`)}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Reveal>

      {/* Sticky confirm bar */}
      <div style={{
        position:"sticky", bottom: 0, marginTop: 22, marginLeft: -36, marginRight: -36,
        padding:"16px 36px",
        background:"linear-gradient(180deg, rgba(249,249,249,0), var(--c-bg) 30%)",
        display:"flex", justifyContent:"space-between", alignItems:"center", gap: 12,
      }}>
        <div style={{display:"flex", alignItems:"center", gap: 12}}>
          <Icon name="check" size={18} />
          <span style={{fontSize: 14, color:"var(--c-ink)"}}>Candidate BIO compiled. It needs Steward certification before client outputs run.</span>
        </div>
        <div style={{display:"flex", gap: 10}}>
          <button className="btn btn--ghost" onClick={onConfirm}>Review later</button>
          <button className="btn btn--primary btn--lg" onClick={onConfirm}>
            Continue <Icon name="arrow" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function DiscoveryStep3({ go }) {
  const live = useLiveBio({ pollMs: 8000 });
  const brand = live.brandName || "this brand";
  const gapCount = Array.isArray(live.bio?.payload?.missing) ? live.bio.payload.missing.length : 0;
  return (
    <div style={{maxWidth: 580, margin:"80px auto 0", textAlign:"center"}}>
      <div style={{display:"flex", justifyContent:"center", marginBottom: 22}}>
        <BrandolphAvatar size={64} />
      </div>
      <h1 style={{fontSize: 28, letterSpacing:"-0.01em", marginBottom: 14}}>{brand} is ready for review.</h1>
      <div className="stream" style={{display:"flex", flexDirection:"column", gap: 12, marginBottom: 28, textAlign:"left"}}>
        <BrandolphLine html={`*I've compiled the candidate BIO for ${brand}.* The next step is certification, not blind activation. A Steward needs to check the fields with weak evidence before this becomes canon.`} />
        <BrandolphLine html={`*I don't pretend to know what I don't know.* ${gapCount ? `I left ${gapCount} gap${gapCount === 1 ? "" : "s"} for review.` : "I did not find any declared gaps, but the Steward still needs to confirm the read."} Unsupported claims stay out of the BIO instead of becoming brand truth.`} />
        <BrandolphLine html="*Once certified, every brief and specialist run will read this BIO.* Until then, the workspace is in review mode." />
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

function BioViewer({ go, bioScore = 0 }) {
  const [tab, setTab] = useDState("identity");
  const [feed, setFeed] = useDState("");
  const [reading, setReading] = useDState(false);
  const [toast, setToast] = useDState(null);
  const [editing, setEditing] = useDState(false);
  const [saving, setSaving] = useDState(false);
  const [saveErr, setSaveErr] = useDState(null);
  const [reviewBusy, setReviewBusy] = useDState(false);
  const [uploading, setUploading] = useDState(false);
  const [recompilingFromVersion, setRecompilingFromVersion] = useDState(null);
  const [sourceSetChanged, setSourceSetChanged] = useDState(false);
  const [sourcesReady, setSourcesReady] = useDState(false);

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

  const refreshSources = React.useCallback(async () => {
    if (!live.brandId) return;
    const { data, error } = await supabase.from("bio_sources")
      .select("id, kind, bucket, src, signals, raw_ref, created_at")
      .eq("brand_id", live.brandId).order("created_at", { ascending: false });
    if (error) throw error;
    const bioCreated = live.bio?.created_at ? new Date(live.bio.created_at).getTime() : 0;
    setSources((data || []).map(s => {
      const created = new Date(s.created_at).getTime();
      const learned = s.signals?.markdown_chars ? Math.max(1, Math.round(s.signals.markdown_chars / 200)) : 0;
      const invalidPlaceholder =
        (s.kind === "doc" && s.src === "Document upload · brand-deck.pdf") ||
        s.src === "Instagram · latest posts" ||
        s.src === "Competitor · category reference";
      return {
        ...s,
        date: new Date(s.created_at).toLocaleDateString(undefined, { day:"numeric", month:"short" }),
        n: learned,
        invalidPlaceholder,
        pending: !invalidPlaceholder && (!bioCreated || created > bioCreated),
      };
    }));
    setSourcesReady(true);
  }, [live.brandId, live.bio?.id, live.bio?.created_at]);

  useDEffect(() => {
    let alive = true;
    setSourcesReady(false);
    refreshSources().catch((e) => { if (alive) console.warn("[BIO sources] refresh failed:", e?.message || e); });
    return () => { alive = false; };
  }, [refreshSources]);

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
  const pendingSourceCount = sources.filter(s => s.pending).length;
  const hasUnappliedSourceChanges = pendingSourceCount > 0 || sourceSetChanged;

  const requestReview = async () => {
    if (!live.brandId || !sourcesReady || reviewBusy || hasUnappliedSourceChanges || recompilingFromVersion != null) return;
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

  const addReference = async (labelArg, kind = "url_reference", bucket = "foundations") => {
    const ref = (labelArg ?? feed).trim();
    if (!ref || reading || !live.brandId) return;
    if (["url_reference", "competitor_url", "social_reference"].includes(kind)) {
      try {
        const parsed = new URL(ref);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("protocol");
      } catch {
        flash("Paste a complete link beginning with http:// or https://.");
        return false;
      }
    }
    setReading(true);
    try {
      const res = await apiFetch(`/api/bios/${live.brandId}/sources`, {
        method: "POST",
        body: JSON.stringify({ sources: [{ kind, bucket, src: ref }] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setFeed("");
      await refreshSources();
      flash("Evidence saved. Update the BIO when you're ready to incorporate it.");
      return true;
    } catch (e) {
      flash(`Couldn't add: ${e?.message || e}`);
      return false;
    } finally {
      setReading(false);
    }
  };

  const uploadDocument = async (file, bucket) => {
    if (!file || !live.brandId || uploading) return false;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["pdf", "docx", "pptx", "txt", "md"].includes(ext)) {
      flash("Choose a PDF, DOCX, PPTX, TXT, or Markdown file.");
      return false;
    }
    if (file.size > MAX_SOURCE_FILE_BYTES) {
      flash("That file is larger than the 20 MB upload limit.");
      return false;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.set("bucket", bucket);
      form.set("file", file);
      const res = await apiFetch(`/api/bios/${live.brandId}/sources/upload`, { method:"POST", body:form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      await refreshSources();
      flash(`${file.name} uploaded. Update the BIO to incorporate it.`);
      return true;
    } catch (e) {
      flash(`Upload failed: ${e?.message || e}`);
      return false;
    } finally {
      setUploading(false);
    }
  };

  const removeSource = async (source) => {
    if (!source?.id || !live.brandId) return;
    try {
      const res = await apiFetch(`/api/bios/${live.brandId}/sources/${source.id}`, { method:"DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setSources(current => current.filter(item => item.id !== source.id));
      setSourceSetChanged(true);
      flash("Source removed. Update the BIO so the next version reflects the current evidence.");
    } catch (e) {
      flash(`Couldn't remove source: ${e?.message || e}`);
    }
  };

  const updateBioFromSources = async () => {
    if (!live.brandId || !live.brandUrl || recompilingFromVersion != null || !hasUnappliedSourceChanges) return;
    try {
      const baseline = live.bio?.version || 0;
      const res = await apiFetch("/api/discovery/start", {
        method:"POST",
        body: JSON.stringify({ url:live.brandUrl, brandId:live.brandId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setRecompilingFromVersion(baseline);
      flash("BIO update queued. Brandolph is reading the new evidence.");
    } catch (e) {
      flash(`Couldn't update the BIO: ${e?.message || e}`);
    }
  };

  useDEffect(() => {
    if (recompilingFromVersion == null || !live.bio?.version || live.bio.version <= recompilingFromVersion) return;
    setRecompilingFromVersion(null);
    setSourceSetChanged(false);
    refreshSources();
    flash(`BIO v${live.bio.version} is ready. Review the changes before requesting certification.`);
  }, [live.bio?.version, recompilingFromVersion, refreshSources]);

  useDEffect(() => {
    if (recompilingFromVersion == null) return;
    const timeout = setTimeout(() => {
      setRecompilingFromVersion(null);
      flash("The BIO update is taking longer than expected. Your evidence is safe; try Update BIO again shortly.");
    }, 180000);
    return () => clearTimeout(timeout);
  }, [recompilingFromVersion]);

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
                {live.cert?.byName ? (
                  <>Certified by <span style={{color:"var(--green-600)"}}>{live.cert.byName}</span> · {formatCertDate(live.cert.at)}</>
                ) : live.cert ? (
                  /* Self-certified: certified = true, certified_by NULL. Name nobody. */
                  <>Self-certified · {formatCertDate(live.cert.at)} — awaiting your Brand Steward</>
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
              {/* Still keyed on "no senior signature yet" — self-certification
                  made live.cert permanently truthy, which silently hid this. */}
              {!live.cert?.byName && live.focusCount > 0 && (
                <div style={{fontSize: 12, color:"var(--c-dim)", marginTop: 6, lineHeight: 1.5}}>
                  Brandolph flagged {live.focusCount} area{live.focusCount === 1 ? "" : "s"} for your Steward to confirm.
                </div>
              )}
              {/* Steward notes are attributed, so only render them when a
                  real Steward is named — never signed "— null". */}
              {live.cert?.notes && live.cert.byName && (
                <div style={{fontSize: 12.5, color:"var(--c-dim)", marginTop: 6, lineHeight: 1.5, fontStyle:"italic", borderLeft:"2px solid var(--green-300, rgba(127,163,122,0.4))", paddingLeft: 10}}>
                  “{live.cert.notes}” <span style={{fontStyle:"normal", color:"var(--c-faint)"}}>— {live.cert.byName}</span>
                </div>
              )}
            </div>
          </div>
          {!live.cert?.byName && live.bio && (
            <span style={{fontSize: 11.5, color:"var(--c-dim)", fontStyle:"italic", whiteSpace:"nowrap"}}>
              {live.reviewPending ? "in review" : "within 24h"}
            </span>
          )}
        </div>
      )}

      {/* Hero */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 320px", gap: 28, marginBottom: 28, alignItems:"end"}}>
        <div>
          <div className="eyebrow" style={{marginBottom: 6}}>Brand Intelligence Object · {live.brandName || "Brand"}</div>
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
              disabled={!sourcesReady || reviewBusy || live.reviewPending || hasUnappliedSourceChanges || recompilingFromVersion != null}
              title={!sourcesReady ? "Checking whether this BIO has pending evidence" : hasUnappliedSourceChanges ? "Update the BIO with pending evidence before requesting review" : live.reviewPending ? "A human review is already in progress" : "Send this BIO to your Brand Steward for a human review — no edit required"}>
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
            {tab === "strategic"   && <BioStrategic strat={bio.strategic} patchStrategic={patchStrategic} editing={editing} brand={live.brandName || "this brand"} />}
            {tab === "sources"     && <BioSources sources={sources} feed={feed} setFeed={setFeed} reading={reading} uploading={uploading} addReference={addReference} uploadDocument={uploadDocument} removeSource={removeSource} pendingCount={pendingSourceCount} sourceSetChanged={sourceSetChanged} recompiling={recompilingFromVersion != null} updateBio={updateBioFromSources} canUpdate={Boolean(live.brandUrl)} />}
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
                <div style={{fontFamily:ff, fontSize:15, color:"var(--c-dim)", marginTop:8, lineHeight:1.4}}>The quick brown fox jumps over the lazy dog.</div>
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

function BioStrategic({ strat, patchStrategic, editing, brand = "this brand" }) {
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
        <div className="eyebrow eyebrow--pink" style={{marginBottom: 8}}>What {brand} is NOT</div>
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
function BioSources({ sources, feed, setFeed, reading, uploading, addReference, uploadDocument, removeSource, pendingCount, sourceSetChanged, recompiling, updateBio, canUpdate }) {
  const [mode, setMode] = useDState("url");
  const [kind, setKind] = useDState("url_reference");
  const [bucket, setBucket] = useDState("foundations");
  const fileRef = React.useRef(null);
  const includedCount = sources.filter(s => !s.invalidPlaceholder && !s.pending && s.signals?.extraction_status !== "failed").length;
  const submit = () => addReference(feed, mode === "note" ? "manual_note" : kind, bucket);
  const onKey = (e) => { if (mode === "url" && e.key === "Enter") { e.preventDefault(); submit(); } };
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) await uploadDocument(file, bucket);
  };
  const sourceLabel = (s) => s.kind === "file_upload" ? s.src : s.src.length > 120 ? `${s.src.slice(0, 117)}…` : s.src;
  const kindLabel = (s) => ({ file_upload:"Document", manual_note:"Manual note", competitor_url:"Competitor", social_reference:"Social", client_intake:"Discovery intake" }[s.kind] || "Web reference");
  const bucketLabel = (key) => BUCKETS.find(b => b.key === key)?.label || "Unsorted";
  const formatBytes = (n) => n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n || 0} B`;
  return (
    <div>
      {/* Feed composer */}
      <div className="card card--inset" style={{padding:18, marginBottom:22}}>
        <div style={{display:"flex", alignItems:"center", gap:9, marginBottom:12}}>
          <BrandolphDot state={reading ? "thinking" : "idle"} />
          <div>
            <div style={{fontSize:14, fontWeight:600, color:"var(--c-ink)"}}>Add evidence</div>
            <div style={{fontSize:12, color:"var(--c-dim)"}}>Save sources first. Then ask Brandolph to build a new BIO version for you to review.</div>
          </div>
        </div>
        <div style={{display:"flex", gap:6, marginBottom:12}} role="tablist" aria-label="Evidence type">
          {[['url','Link'], ['note','Note']].map(([key, label]) => (
            <button key={key} className={`btn btn--sm ${mode === key ? "btn--primary" : "btn--ghost"}`} onClick={() => { setMode(key); setFeed(""); }} role="tab" aria-selected={mode === key}>{label}</button>
          ))}
        </div>
        <div style={{display:"flex", gap:10}}>
          {mode === "note" ? (
            <textarea value={feed} onChange={(e) => setFeed(e.target.value)} disabled={reading} rows={3} placeholder="Add a correction, brand belief, audience insight, or voice rule…" style={{...EDIT_INPUT, flex:1, minHeight:76, resize:"vertical", lineHeight:1.5}} />
          ) : (
            <input value={feed} onChange={(e) => setFeed(e.target.value)} onKeyDown={onKey} disabled={reading} type="url" placeholder="https://…" style={{flex:1, height:42, borderRadius:9, border:"1px solid var(--c-line-2)", background:"var(--c-bg)", padding:"0 14px", fontSize:14, color:"var(--c-ink)", outline:"none"}} />
          )}
          <button className="btn btn--primary" disabled={reading || !feed.trim()} onClick={submit}>
            {reading ? <><BrandolphDot state="thinking" size={11} /> Saving…</> : <>Save evidence</>}
          </button>
        </div>
        <div style={{display:"flex", gap:8, marginTop:12, flexWrap:"wrap", alignItems:"center"}}>
          {mode === "url" && <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Link type" style={{...EDIT_INPUT, width:"auto", height:34}}><option value="url_reference">Website or article</option><option value="competitor_url">Competitor</option><option value="social_reference">Social profile or post</option></select>}
          <select value={bucket} onChange={(e) => setBucket(e.target.value)} aria-label="Evidence area" style={{...EDIT_INPUT, width:"auto", height:34}}>{BUCKETS.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}</select>
          <input ref={fileRef} type="file" accept={SOURCE_FILE_ACCEPT} onChange={onFile} style={{display:"none"}} />
          <button className="btn btn--ghost btn--sm" disabled={reading || uploading} onClick={() => fileRef.current?.click()}><Icon name="files" size={13} /> {uploading ? "Uploading…" : "Upload document"}</button>
          <span style={{fontSize:11, color:"var(--c-faint)"}}>PDF, DOCX, PPTX, TXT, MD · max 20 MB</span>
        </div>
      </div>

      {(pendingCount > 0 || sourceSetChanged || recompiling) && (
        <div style={{padding:"14px 16px", marginBottom:22, border:"1px solid var(--yellow-500)", borderRadius:12, background:"var(--yellow-50, rgba(252,211,77,0.08))", display:"flex", justifyContent:"space-between", alignItems:"center", gap:18}}>
          <div>
            <div style={{fontSize:13.5, fontWeight:600, color:"var(--c-ink)"}}>{recompiling ? "Brandolph is updating the BIO" : pendingCount > 0 ? `${pendingCount} ${pendingCount === 1 ? "source is" : "sources are"} waiting` : "The evidence set changed"}</div>
            <div style={{fontSize:12, color:"var(--c-dim)", marginTop:3, lineHeight:1.45}}>{recompiling ? "You can stay on this page. The new version will appear when it is ready." : "This evidence is saved but is not part of the current BIO yet. Update it, review the changes, then request human certification."}</div>
          </div>
          <button className="btn btn--primary" disabled={recompiling || !canUpdate} onClick={updateBio}>{recompiling ? "Updating…" : "Update BIO"}</button>
        </div>
      )}

      {/* Ledger header */}
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:6}}>
        <div className="eyebrow">{sources.length} sources · {includedCount} included in current BIO</div>
        <div style={{fontSize:11.5, color:"var(--c-faint)", fontStyle:"italic"}}>Evidence is versioned before it becomes canon.</div>
      </div>

      {/* Source ledger */}
      <div>
        {sources.length === 0 && <div style={{padding:"30px 0", color:"var(--c-dim)", fontSize:13.5}}>No evidence added yet. Upload a real document, paste a link, or write a note above.</div>}
        {sources.map((s) => (
          <div key={s.id} style={{display:"grid", gridTemplateColumns:"1fr auto auto", gap: 14, padding:"13px 0", borderBottom: "1px solid var(--c-line)", alignItems:"center"}}>
            <div>
              <div style={{fontSize: 13.5, color:"var(--c-ink)", fontWeight:500, display:"flex", alignItems:"center", gap:8}}>
                {sourceLabel(s)}
                {s.invalidPlaceholder ? <span className="pill" style={{height:18, padding:"0 8px", fontSize:9.5, color:"var(--pink-500)"}}>invalid placeholder</span> : s.pending && <span className="pill" style={{height:18, padding:"0 8px", fontSize:9.5, background:"var(--yellow-50, rgba(252,211,77,0.14))", color:"var(--orange-600)"}}>awaiting update</span>}
              </div>
              <div style={{fontSize: 11, color:"var(--c-faint)", marginTop: 3}}>{kindLabel(s)} · {bucketLabel(s.bucket)} · {s.date}{s.signals?.size ? ` · ${formatBytes(s.signals.size)}` : ""}</div>
            </div>
            <span className="pill" title={s.signals?.extraction_status === "failed" ? s.signals?.extraction_error || "Brandolph could not read this source" : undefined}>{s.invalidPlaceholder ? "never used" : s.pending ? "not included" : s.signals?.extraction_status === "failed" ? "couldn't read" : s.n ? `${s.n} signals` : "included"}</span>
            <button className="btn btn--link" style={{fontSize: 12, color:"var(--pink-500)"}} onClick={() => removeSource(s)}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { Discovery, BioViewer });
