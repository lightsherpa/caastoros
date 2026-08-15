import React from "react";
import { apiFetch } from "./lib/supabase-browser.js";
import { LOCALES, useLocale, getCoverage, getMissingKeys, getAllKeys, getSourceText, applyOverrides } from "./lib/i18n.js";
const { Icon, BrandolphDot } = window;

const { useState, useEffect, useMemo, useCallback } = React;

/* ─────────────────────────────────────────────────────────────────
   /admin/specs — the admin spec editor.

   Lists every spec at its latest version. Click a row → drawer
   opens with the editable fields. Save creates a new version
   (preserves prior-run lineage). Internal specs (BIO Compiler,
   Audit & Ledger) appear in their own section since they're
   infrastructure, not user-pickable specialists.
   ───────────────────────────────────────────────────────────────── */

function PageHeader({ eyebrow, title, sub, right }) {
  return (
    <div style={{
      display:"flex", justifyContent:"space-between", alignItems:"flex-start",
      gap: 24, marginBottom: 24, paddingBottom: 18,
      borderBottom: "1px solid var(--c-line)",
    }}>
      <div>
        {eyebrow && <div className="eyebrow" style={{marginBottom: 6}}>{eyebrow}</div>}
        <h1 style={{margin:0, fontSize: 26, letterSpacing:"-0.01em"}}>{title}</h1>
        {sub && <p style={{marginTop:8, fontSize: 14, color:"var(--c-dim)", maxWidth: 600}}>{sub}</p>}
      </div>
      {right && <div style={{display:"flex", gap: 10, alignItems:"center"}}>{right}</div>}
    </div>
  );
}

function useSpecs() {
  const [state, setState] = useState({ specs: [], loading: true, error: null });

  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await apiFetch("/api/admin/specs");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setState({ specs: json.specs || [], loading: false, error: null });
    } catch (e) {
      setState({ specs: [], loading: false, error: e?.message || String(e) });
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}

function AdminSpecs() {
  const { specs, loading, error, reload } = useSpecs();
  const [openId, setOpenId] = useState(null);
  const [query, setQuery] = useState("");

  // Group by department; internal specs in their own group
  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = specs.filter((s) => {
      if (!q) return true;
      const hay = `${s.payload?.name || ""} ${s.payload?.code || ""} ${s.payload?.department || ""} ${s.payload?.job || ""}`.toLowerCase();
      return hay.includes(q);
    });

    const byDept = new Map();
    for (const s of filtered) {
      const dept = s.payload?.internal ? "_internal" : (s.payload?.department || "Unassigned");
      if (!byDept.has(dept)) byDept.set(dept, []);
      byDept.get(dept).push(s);
    }
    // Stable dept order — Strategy first, Internal last
    const order = ["Strategy", "Concept", "Copy", "Visual", "Web & UX", "Motion & Sound", "Research & Ops"];
    return [
      ...order.map((d) => [d, byDept.get(d) || []]),
      ["_internal", byDept.get("_internal") || []],
    ].filter(([, list]) => list.length > 0);
  }, [specs, query]);

  const openSpec = specs.find((s) => s.specialist_id === openId) || null;

  return (
    <div style={{padding:"24px 36px 80px"}}>
      <PageHeader
        eyebrow="Admin · Spec editor"
        title="Specialists"
        sub="Edit any specialist's role, objective, method, voice, refusals, or model routing. Every save creates a new version — prior runs keep their lineage."
        right={<>
          <button className="btn btn--ghost btn--sm" onClick={reload}><Icon name="refresh" size={13} /> Reload</button>
          <span style={{fontFamily:"var(--font-mono)", fontSize: 12, color:"var(--c-faint)"}}>{specs.length} specs</span>
        </>}
      />

      <div className="card" style={{padding: 12, marginBottom: 18, display:"flex", gap: 10, alignItems:"center"}}>
        <div style={{position:"relative", flex:"1 1 220px"}}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, code, department, or job…"
            onKeyDown={(e) => e.stopPropagation()}
            style={{
              width:"100%", height: 32, padding:"0 10px 0 32px",
              border:"1px solid var(--c-line)", borderRadius: 8,
              fontSize: 13, fontFamily:"inherit", background:"var(--c-bg)", color:"var(--c-ink)",
              outline:"none",
            }}
          />
          <span style={{position:"absolute", left: 10, top:"50%", transform:"translateY(-50%)", color:"var(--c-faint)", pointerEvents:"none"}}>
            <Icon name="search" size={13} />
          </span>
        </div>
      </div>

      {error && (
        <div className="card" style={{padding:"10px 14px", marginBottom: 14, borderLeft:"3px solid var(--pink-500)", fontSize: 13}}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{padding: 40, textAlign:"center", color:"var(--c-faint)"}}>Loading specs…</div>
      )}

      <div style={{display:"flex", flexDirection:"column", gap: 28}}>
        {grouped.map(([dept, list]) => {
          const isInternal = dept === "_internal";
          const deptColor = isInternal ? "var(--neutral-500)" : (window.CI_DEPT_COLORS?.[dept] || "var(--neutral-500)");
          const deptLabel = isInternal ? "Internal · Infrastructure" : dept;
          const comingSoon = !isInternal && (window.CI_DEPT_META?.[dept]?.comingSoon === true);
          return (
            <section key={dept}>
              <header style={{
                display:"flex", alignItems:"baseline", gap: 10, paddingBottom: 8, marginBottom: 10,
                borderBottom: "1px solid var(--c-line)",
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%", background: deptColor, display:"inline-block",
                }} />
                <h2 style={{margin: 0, fontSize: 16, fontWeight: 600, letterSpacing:"-0.005em"}}>{deptLabel}</h2>
                <span className="eyebrow" style={{color:"var(--c-faint)"}}>{list.length}</span>
                {comingSoon && (
                  <span className="pill" style={{height: 20, padding:"0 8px", fontSize: 10, background:"var(--neutral-50)", color:"var(--c-dim)"}}>
                    coming soon
                  </span>
                )}
              </header>

              <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))", gap: 10}}>
                {list.map((s) => {
                  const p = s.payload || {};
                  return (
                    <button key={s.specialist_id}
                      onClick={() => setOpenId(s.specialist_id)}
                      className="card"
                      style={{
                        padding: "12px 14px", textAlign:"left", cursor:"pointer",
                        border:"1px solid var(--c-line)", borderLeft: `3px solid ${deptColor}`,
                        display:"flex", flexDirection:"column", gap: 6,
                        transition:"transform 100ms ease, box-shadow 100ms ease",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.06)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = ""; }}>
                      <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", gap: 8}}>
                        <span className="eyebrow" style={{color:"var(--c-faint)"}}>{p.code || s.specialist_id} · v{s.version}</span>
                        <div style={{display:"flex", gap: 4, alignItems:"center"}}>
                          {!s.active && (
                            <span className="pill" style={{height: 18, padding:"0 7px", fontSize: 10, background:"var(--neutral-50)", color:"var(--c-faint)"}}>inactive</span>
                          )}
                          {p.status === "soon" && (
                            <span className="pill" style={{height: 18, padding:"0 7px", fontSize: 10, background:"var(--yellow-50, rgba(248,192,54,0.18))", color:"var(--yellow-700)"}}>soon</span>
                          )}
                        </div>
                      </div>
                      <div style={{fontSize: 14, fontWeight: 600, color:"var(--c-ink)"}}>{p.name || s.specialist_id}</div>
                      <p style={{margin: 0, fontSize: 12.5, color:"var(--c-dim)", lineHeight: 1.45, display:"-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient:"vertical", overflow:"hidden"}}>
                        {p.job || p.objective || "(no description)"}
                      </p>
                      <div style={{display:"flex", gap: 8, fontFamily:"var(--font-mono)", fontSize: 10, color:"var(--c-faint)", marginTop: 2}}>
                        <span>{p.modelRouting?.primary || "?"}</span>
                        <span>·</span>
                        <span>{p.cr_estimate ?? "?"} cr</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {openSpec && (
        <SpecEditor
          spec={openSpec}
          onClose={() => setOpenId(null)}
          onSaved={() => { setOpenId(null); reload(); }}
        />
      )}
    </div>
  );
}

/* ─── Spec editor drawer ─────────────────────────────────────── */

function SpecEditor({ spec, onClose, onSaved }) {
  const initial = spec.payload || {};
  const [form, setForm] = useState({
    role:           initial.role || "",
    objective:      initial.objective || "",
    method:         Array.isArray(initial.method) ? initial.method.join("\n") : "",
    outputContract: initial.outputContract || "",
    voice:          initial.voice || "",
    refusals:       Array.isArray(initial.refusals) ? initial.refusals.join("\n") : "",
    modelRoute:     initial.modelRouting?.primary || "",
    job:            initial.job || "",
    cr_estimate:    initial.cr_estimate ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);
  const [history, setHistory] = useState(null);
  const [tab, setTab] = useState("edit");

  const dirty = useMemo(() => {
    const arr = (s) => s.split("\n").map((x) => x.trim()).filter(Boolean);
    return (
      form.role !== (initial.role || "") ||
      form.objective !== (initial.objective || "") ||
      JSON.stringify(arr(form.method)) !== JSON.stringify(initial.method || []) ||
      form.outputContract !== (initial.outputContract || "") ||
      form.voice !== (initial.voice || "") ||
      JSON.stringify(arr(form.refusals)) !== JSON.stringify(initial.refusals || []) ||
      form.modelRoute !== (initial.modelRouting?.primary || "") ||
      form.job !== (initial.job || "") ||
      Number(form.cr_estimate) !== Number(initial.cr_estimate || 0)
    );
  }, [form, initial]);

  const loadHistory = async () => {
    setHistory({ loading: true, rows: [] });
    try {
      const res = await apiFetch(`/api/admin/specs/${spec.specialist_id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setHistory({ loading: false, rows: json.history || [] });
    } catch (e) {
      setHistory({ loading: false, rows: [], error: e?.message || String(e) });
    }
  };

  const handleSave = async () => {
    if (!dirty || saving) return;
    setSaving(true); setError(null);
    const arr = (s) => s.split("\n").map((x) => x.trim()).filter(Boolean);
    const patch = {
      role:           form.role.trim(),
      objective:      form.objective.trim(),
      method:         arr(form.method),
      outputContract: form.outputContract.trim(),
      voice:          form.voice.trim(),
      refusals:       arr(form.refusals),
      modelRouting:   { ...(initial.modelRouting || {}), primary: form.modelRoute.trim() || initial.modelRouting?.primary, reason: "admin override" },
      job:            form.job.trim(),
      cr_estimate:    Number(form.cr_estimate) || initial.cr_estimate,
    };
    try {
      const res = await apiFetch(`/api/admin/specs/${spec.specialist_id}`, {
        method: "PATCH",
        body: JSON.stringify({ payload: patch }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      onSaved && onSaved(json.spec);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async (version) => {
    if (saving) return;
    setSaving(true); setError(null);
    try {
      const res = await apiFetch(`/api/admin/specs/${spec.specialist_id}/activate`, {
        method: "POST",
        body: JSON.stringify({ version }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      onSaved && onSaved(null);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div onClick={onClose} style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.16)", zIndex: 70, animation:"fadeIn 160ms ease both"}} />
      <aside className="drawer" style={{
        position:"fixed", top: 16, right: 16, bottom: 16,
        width: 640, maxWidth:"calc(100vw - 280px)",
        background:"var(--c-card)", border:"1px solid var(--c-line)", borderRadius: 14,
        boxShadow:"0 24px 56px rgba(0,0,0,0.14)", zIndex: 71,
        display:"flex", flexDirection:"column", overflow:"hidden",
        animation:"drawerIn 220ms cubic-bezier(.2,.8,.2,1) both",
      }}>
        <header style={{padding:"16px 22px", borderBottom:"1px solid var(--c-line)"}}>
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap: 14}}>
            <div style={{minWidth: 0}}>
              <div className="eyebrow" style={{marginBottom: 4}}>{initial.code || spec.specialist_id} · v{spec.version} · {initial.department || ""}</div>
              <h2 style={{margin: 0, fontSize: 20, letterSpacing:"-0.005em"}}>{initial.name || spec.specialist_id}</h2>
            </div>
            <button onClick={onClose} className="btn btn--icon btn--ghost" aria-label="Close"><Icon name="close" size={14} /></button>
          </div>
          <div style={{display:"flex", gap: 4, marginTop: 14, borderBottom:"1px solid var(--c-line)", marginBottom: -1}}>
            {[["edit","Edit"], ["history","Version history"]].map(([k, l]) => (
              <button key={k}
                onClick={() => { setTab(k); if (k === "history" && !history) loadHistory(); }}
                style={{
                  border:"none", background:"transparent", cursor:"pointer", padding:"8px 14px",
                  fontFamily:"var(--font-sans)", fontSize: 13, fontWeight: tab === k ? 600 : 500,
                  color: tab === k ? "var(--c-ink)" : "var(--c-faint)",
                  borderBottom: tab === k ? "2px solid var(--neutral-900)" : "2px solid transparent",
                }}>{l}</button>
            ))}
          </div>
        </header>

        <div className="scroll" style={{flex: 1, overflowY:"auto", padding:"18px 22px"}}>
          {tab === "edit" && (
            <>
              <Field label="Job description" hint="Public-facing description users see on specialist cards.">
                <textarea value={form.job} onChange={(e) => setForm({ ...form, job: e.target.value })}
                  rows={2} style={inputStyle} onKeyDown={(e) => e.stopPropagation()} />
              </Field>

              <Field label="Role" hint="The senior person this specialist embodies. e.g. 'a senior conversion copywriter who carries the brand voice'">
                <textarea value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                  rows={2} style={inputStyle} onKeyDown={(e) => e.stopPropagation()} />
              </Field>

              <Field label="Objective" hint="What this specialist is here to do. One or two sentences.">
                <textarea value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })}
                  rows={3} style={inputStyle} onKeyDown={(e) => e.stopPropagation()} />
              </Field>

              <Field label="Method" hint="One step per line. Numbered automatically in the prompt.">
                <textarea value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}
                  rows={5} style={{ ...inputStyle, fontFamily:"var(--font-mono)", fontSize: 12.5 }}
                  onKeyDown={(e) => e.stopPropagation()} />
              </Field>

              <Field label="Output contract" hint="What 'done' looks like — format, length, structure.">
                <textarea value={form.outputContract} onChange={(e) => setForm({ ...form, outputContract: e.target.value })}
                  rows={3} style={inputStyle} onKeyDown={(e) => e.stopPropagation()} />
              </Field>

              <Field label="Voice" hint="How this specialist writes. Distinct from the brand voice — it's the personality of the agent itself.">
                <textarea value={form.voice} onChange={(e) => setForm({ ...form, voice: e.target.value })}
                  rows={2} style={inputStyle} onKeyDown={(e) => e.stopPropagation()} />
              </Field>

              <Field label="Refusals" hint="One refusal per line. The specialist will refuse rather than violate any of these.">
                <textarea value={form.refusals} onChange={(e) => setForm({ ...form, refusals: e.target.value })}
                  rows={4} style={{ ...inputStyle, fontFamily:"var(--font-mono)", fontSize: 12.5 }}
                  onKeyDown={(e) => e.stopPropagation()} />
              </Field>

              <div style={{display:"grid", gridTemplateColumns:"1fr 100px", gap: 12}}>
                <Field label="Model route" hint="Vendor-prefixed route string. Examples: anthropic/claude-sonnet-4-6, openrouter/google/gemini-2.5-pro, vendor/fal/flux-1.1-pro">
                  <input value={form.modelRoute} onChange={(e) => setForm({ ...form, modelRoute: e.target.value })}
                    style={{ ...inputStyle, fontFamily:"var(--font-mono)", fontSize: 12.5 }}
                    onKeyDown={(e) => e.stopPropagation()} />
                </Field>
                <Field label="Credits" hint="Estimated cost.">
                  <input value={form.cr_estimate} onChange={(e) => setForm({ ...form, cr_estimate: e.target.value })}
                    type="number" min="0" style={{ ...inputStyle, fontFamily:"var(--font-mono)", fontSize: 13 }}
                    onKeyDown={(e) => e.stopPropagation()} />
                </Field>
              </div>
            </>
          )}

          {tab === "history" && (
            <>
              {!history || history.loading ? (
                <div style={{padding: 30, textAlign:"center", color:"var(--c-faint)"}}>Loading history…</div>
              ) : history.rows.length === 0 ? (
                <div style={{padding: 30, textAlign:"center", color:"var(--c-faint)"}}>No history.</div>
              ) : (
                <div style={{display:"flex", flexDirection:"column", gap: 8}}>
                  {history.rows.map((row) => (
                    <div key={row.id} className="card" style={{padding:"10px 12px", display:"flex", justifyContent:"space-between", alignItems:"center", gap: 12, border: row.active ? "1px solid var(--green-500)" : "1px solid var(--c-line)"}}>
                      <div style={{minWidth: 0, flex: 1}}>
                        <div style={{fontSize: 13, fontWeight: 600}}>v{row.version} {row.active && <span style={{color:"var(--green-600)", fontWeight: 500}}>· active</span>}</div>
                        <div style={{fontFamily:"var(--font-mono)", fontSize: 10.5, color:"var(--c-faint)", marginTop: 2}}>
                          {new Date(row.created_at).toLocaleString(undefined, { day:"numeric", month:"short", hour:"numeric", minute:"2-digit" })} · {row.payload?.modelRouting?.primary || "?"}
                        </div>
                      </div>
                      {!row.active && (
                        <button className="btn btn--ghost btn--sm" disabled={saving}
                          onClick={() => handleActivate(row.version)}>
                          Activate
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <footer style={{padding:"14px 22px", borderTop:"1px solid var(--c-line)", display:"flex", justifyContent:"space-between", alignItems:"center", gap: 10}}>
          <div style={{fontSize: 12, color: error ? "var(--pink-500)" : "var(--c-faint)"}}>
            {error || (tab === "edit" ? (dirty ? "Unsaved changes — saving creates v" + ((spec.version || 0) + 1) : "No changes") : "")}
          </div>
          <div style={{display:"flex", gap: 8}}>
            <button className="btn btn--ghost" onClick={onClose}>Close</button>
            {tab === "edit" && (
              <button className="btn btn--primary" disabled={!dirty || saving} onClick={handleSave}>
                {saving ? "Saving…" : `Save as v${(spec.version || 0) + 1}`}
              </button>
            )}
          </div>
        </footer>
      </aside>
    </>
  );
}

function Field({ label, hint, children }) {
  return (
    <div style={{marginBottom: 16}}>
      <label style={{display:"block", fontSize: 12, fontWeight: 600, color:"var(--c-ink)", marginBottom: 4}}>{label}</label>
      {hint && <p style={{margin:"0 0 8px", fontSize: 11.5, color:"var(--c-faint)", lineHeight: 1.4}}>{hint}</p>}
      {children}
    </div>
  );
}

const inputStyle = {
  width:"100%", padding:"8px 11px", borderRadius: 8,
  border:"1px solid var(--c-line)", background:"var(--c-bg)", color:"var(--c-ink)",
  fontFamily:"inherit", fontSize: 13.5, lineHeight: 1.5, outline:"none",
  resize:"vertical", boxSizing:"border-box",
};

/* ─────────────────────────────────────────────────────────────────
   /admin/brandolph — per-brand memory viewer.

   Shows what Brandolph has learned about each brand: which specialists
   are winning, where voice drifts, what gets re-run on premium vs.
   cheap, where the user is overriding refusals. Read-only for now;
   admin can drill into raw signals.
   ───────────────────────────────────────────────────────────────── */

function useBrandsList() {
  const [state, setState] = useState({ brands: [], loading: true });
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch("/api/admin/brandolph/brands");
        const json = await res.json();
        setState({ brands: json.brands || [], loading: false });
      } catch {
        setState({ brands: [], loading: false });
      }
    })();
  }, []);
  return state;
}

function useBrandMemory(brandId) {
  const [state, setState] = useState({ memory: null, loading: !!brandId, error: null });
  const reload = useCallback(async () => {
    if (!brandId) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await apiFetch(`/api/admin/brandolph/${brandId}/memory`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setState({ memory: json, loading: false, error: null });
    } catch (e) {
      setState({ memory: null, loading: false, error: e?.message || String(e) });
    }
  }, [brandId]);
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}

function AdminBrandolphMemory() {
  const { brands, loading: brandsLoading } = useBrandsList();
  const [selectedId, setSelectedId] = useState(null);
  const { memory, loading, error, reload } = useBrandMemory(selectedId);

  useEffect(() => {
    if (!selectedId && brands.length > 0) setSelectedId(brands[0].id);
  }, [brands, selectedId]);

  const current = brands.find((b) => b.id === selectedId);

  return (
    <div style={{padding:"24px 36px 80px"}}>
      <PageHeader
        eyebrow="Admin · Brandolph"
        title="Brand memory"
        sub="What Brandolph has learned about this brand. Approval rates per specialist, voice/brand match averages, recent operator signals."
        right={<>
          <button className="btn btn--ghost btn--sm" onClick={reload}><Icon name="refresh" size={13} /> Reload</button>
        </>}
      />

      {/* Brand picker */}
      <div className="card" style={{padding: 12, marginBottom: 18, display:"flex", gap: 10, alignItems:"center", flexWrap:"wrap"}}>
        <label style={{fontSize: 12, fontWeight: 600, color:"var(--c-ink)"}}>Brand</label>
        <select value={selectedId || ""} onChange={(e) => setSelectedId(e.target.value)}
          disabled={brandsLoading}
          style={{height: 32, padding:"0 10px", border:"1px solid var(--c-line)", borderRadius: 8, fontSize: 13, fontFamily:"inherit", background:"var(--c-bg)", color:"var(--c-ink)"}}>
          {brandsLoading && <option>Loading brands…</option>}
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        {current && <span style={{fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--c-faint)", marginLeft:"auto"}}>brand_id · {current.id.slice(0,8)}…</span>}
      </div>

      {error && (
        <div className="card" style={{padding:"10px 14px", marginBottom: 14, borderLeft:"3px solid var(--pink-500)", fontSize: 13}}>
          {error}
        </div>
      )}

      {memory && !memory.migrationApplied && (
        <div className="card" style={{padding: 16, marginBottom: 14, borderLeft:"3px solid var(--yellow-500)"}}>
          <div style={{fontSize: 13.5, fontWeight: 600, marginBottom: 6}}>Migration not yet applied.</div>
          <div style={{fontSize: 12.5, color:"var(--c-dim)", lineHeight: 1.5}}>
            The Brandolph memory schema (<code>brand_signals</code> + <code>brand_specialist_stats</code>) doesn't exist in the database yet. Apply <code>supabase/migrations/20260527000000_brandolph_memory.sql</code> via the Supabase dashboard's SQL editor, then reload this page.
            <br /><br />
            Until applied, the signal-writing code in <code>runs.js</code>/<code>outputs.js</code> swallows write failures and the run path continues normally — but no memory is being persisted.
          </div>
        </div>
      )}

      {loading && <div style={{padding: 30, textAlign:"center", color:"var(--c-faint)"}}>Loading memory…</div>}

      {memory && memory.migrationApplied && (
        <>
          {/* Stats table */}
          <section style={{marginBottom: 28}}>
            <h2 style={{margin:"0 0 12px", fontSize: 16, fontWeight: 600}}>Specialist scorecard</h2>
            {memory.stats.length === 0 ? (
              <div className="card" style={{padding: 24, textAlign:"center", color:"var(--c-faint)", fontSize: 13}}>
                No signals yet for this brand. Run a brief to populate.
              </div>
            ) : (
              <div className="card" style={{padding: 0, overflow:"hidden"}}>
                <table style={{width:"100%", borderCollapse:"collapse", fontSize: 13}}>
                  <thead>
                    <tr style={{background:"var(--c-bg)", borderBottom:"1px solid var(--c-line)"}}>
                      {["Specialist", "Runs", "Approved", "Flagged", "Edited", "Rerun↑ / ↓", "Voice", "Brand", "Approval %", "Last run"].map((h) => (
                        <th key={h} style={{textAlign:"left", padding:"8px 12px", fontFamily:"var(--font-mono)", fontSize: 10, fontWeight: 600, letterSpacing:"0.08em", textTransform:"uppercase", color:"var(--c-faint)"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {memory.stats.sort((a,b) => (b.runs_total||0) - (a.runs_total||0)).map((r) => {
                      const agent = window.CI_AGENTS?.find((a) => a.id === r.specialist_id);
                      return (
                        <tr key={r.specialist_id} style={{borderBottom:"1px solid var(--c-line-2)"}}>
                          <td style={{padding:"8px 12px"}}>
                            <div style={{fontWeight: 500}}>{agent?.name || r.specialist_id}</div>
                            <div style={{fontFamily:"var(--font-mono)", fontSize: 10, color:"var(--c-faint)"}}>{agent?.code || ""} · {agent?.dept || ""}</div>
                          </td>
                          <td style={{padding:"8px 12px", fontFamily:"var(--font-mono)"}}>{r.runs_total}</td>
                          <td style={{padding:"8px 12px", fontFamily:"var(--font-mono)", color:"var(--green-600)"}}>{r.runs_approved}</td>
                          <td style={{padding:"8px 12px", fontFamily:"var(--font-mono)", color: r.runs_flagged > 0 ? "var(--pink-500)" : "var(--c-faint)"}}>{r.runs_flagged}</td>
                          <td style={{padding:"8px 12px", fontFamily:"var(--font-mono)"}}>{r.runs_edited}</td>
                          <td style={{padding:"8px 12px", fontFamily:"var(--font-mono)", fontSize: 11.5}}>
                            <span style={{color:"var(--yellow-700)"}}>↑{r.reruns_premium}</span> / <span style={{color:"var(--c-dim)"}}>↓{r.reruns_cheap}</span>
                          </td>
                          <td style={{padding:"8px 12px", fontFamily:"var(--font-mono)"}}>{r.avg_voice_match ?? "—"}</td>
                          <td style={{padding:"8px 12px", fontFamily:"var(--font-mono)"}}>{r.avg_brand_match ?? "—"}</td>
                          <td style={{padding:"8px 12px", fontFamily:"var(--font-mono)"}}>{r.approval_pct ?? "—"}{r.approval_pct != null && "%"}</td>
                          <td style={{padding:"8px 12px", fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--c-faint)"}}>
                            {r.last_run_at ? new Date(r.last_run_at).toLocaleString(undefined, { day:"numeric", month:"short", hour:"numeric", minute:"2-digit" }) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Recent signals */}
          <section>
            <h2 style={{margin:"0 0 12px", fontSize: 16, fontWeight: 600}}>Recent signals · last {memory.signals.length}</h2>
            {memory.signals.length === 0 ? (
              <div className="card" style={{padding: 24, textAlign:"center", color:"var(--c-faint)", fontSize: 13}}>No events yet.</div>
            ) : (
              <div style={{display:"flex", flexDirection:"column", gap: 6}}>
                {memory.signals.map((s) => {
                  const agent = window.CI_AGENTS?.find((a) => a.id === s.specialist_id);
                  const kindColor = s.kind.startsWith("run.approved") ? "var(--green-600)"
                                  : s.kind.startsWith("run.flagged") ? "var(--pink-500)"
                                  : s.kind.startsWith("run.failed")  ? "var(--pink-700, var(--pink-500))"
                                  : s.kind.startsWith("spec.rerun_with_premium") ? "var(--yellow-700)"
                                  : "var(--c-dim)";
                  return (
                    <div key={s.id} className="card" style={{padding:"8px 12px", display:"flex", gap: 12, alignItems:"center", fontSize: 12.5}}>
                      <span style={{fontFamily:"var(--font-mono)", fontSize: 10.5, color: kindColor, width: 200, flexShrink: 0}}>
                        {s.kind}
                      </span>
                      <span style={{flex: 1, minWidth: 0, color:"var(--c-ink)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>
                        {agent?.name || s.specialist_id || "—"}
                        {s.payload?.voice_match != null && <span style={{color:"var(--c-faint)"}}> · voice {s.payload.voice_match}</span>}
                        {s.payload?.brand_match != null && <span style={{color:"var(--c-faint)"}}> · brand {s.payload.brand_match}</span>}
                        {s.payload?.to && <span style={{color:"var(--c-faint)"}}> · → {s.payload.to.split("/").slice(-1)[0]}</span>}
                        {s.payload?.feedback_preview && <span style={{color:"var(--c-dim)", fontStyle:"italic"}}> · "{s.payload.feedback_preview}"</span>}
                      </span>
                      <span style={{fontFamily:"var(--font-mono)", fontSize: 10, color:"var(--c-faint)"}}>
                        {new Date(s.created_at).toLocaleString(undefined, { day:"numeric", month:"short", hour:"numeric", minute:"2-digit" })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   /admin/languages — the client half of the language-management feature.

   Four sections:
     • Coverage    — translated/total per non-en locale + missing keys.
     • Fix inline  — edit any locale value and POST it to the live catalog.
     • Runtime gaps— keys the app requested live but had no translation for.
     • Governance  — which locales this workspace offers + the default.
   Talks to /api/i18n/* ; coverage/runtime-gaps read the in-browser i18n lib.
   ───────────────────────────────────────────────────────────────── */

const langThCell = {
  textAlign:"left", padding:"8px 12px", fontFamily:"var(--font-mono)", fontSize: 10,
  fontWeight: 600, letterSpacing:"0.08em", textTransform:"uppercase", color:"var(--c-faint)",
};

function AdminLanguages() {
  const { t } = useLocale();
  const nonEn = LOCALES.filter((l) => l.code !== "en");     // es, ar — en is the source
  const [overrides, setOverrides] = useState({ en:{}, es:{}, ar:{} });
  const [drafts, setDrafts] = useState({});                 // "loc::key" -> uncommitted value
  const [saving, setSaving] = useState(null);               // "loc::key" being POSTed
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    try {
      const r = await apiFetch("/api/i18n/translations");
      const j = await r.json();
      if (r.ok && j && j.overrides) {
        applyOverrides(j.overrides);                          // live coverage + runtime t()
        setOverrides({ en:{}, es:{}, ar:{}, ...j.overrides });
      }
    } catch (e) { /* keep prior */ }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const dk = (loc, key) => loc + "::" + key;
  const valueFor = (loc, key) => {
    const k = dk(loc, key);
    return k in drafts ? drafts[k] : (overrides[loc]?.[key] ?? "");
  };
  const dirty = (loc, key) => {
    const k = dk(loc, key);
    return (k in drafts) && drafts[k] !== (overrides[loc]?.[key] ?? "");
  };
  const save = async (loc, key) => {
    const value = valueFor(loc, key);
    setSaving(dk(loc, key)); setError(null);
    try {
      const r = await apiFetch("/api/i18n/admin/translations", {
        method: "POST",
        body: JSON.stringify({ locale: loc, key, value }),
      });
      if (!r.ok) throw new Error("save failed");
      setDrafts((d) => { const n = { ...d }; delete n[dk(loc, key)]; return n; });
      await reload();                                          // coverage updates live
    } catch (e) { setError(t("admin.lang.saveError")); }
    finally { setSaving(null); }
  };

  const allKeys = getAllKeys();
  const missingSet = new Set([...getCoverage("es").missing, ...getCoverage("ar").missing]);
  const ordered = [...allKeys].sort((a, b) =>
    ((missingSet.has(b) ? 1 : 0) - (missingSet.has(a) ? 1 : 0)) || a.localeCompare(b));
  const runtimeGaps = getMissingKeys();

  return (
    <div style={{padding:"24px 36px 80px"}}>
      <PageHeader
        eyebrow="Admin · Languages"
        title={t("admin.lang.title")}
        sub={t("admin.lang.sub")}
        right={<button className="btn btn--ghost btn--sm" onClick={reload}><Icon name="refresh" size={13} /> {t("admin.lang.reload")}</button>}
      />

      {error && (
        <div className="card" style={{padding:"10px 14px", marginBottom: 14, borderLeft:"3px solid var(--pink-500)", fontSize: 13}}>{error}</div>
      )}

      {/* 1 · Coverage */}
      <section style={{marginBottom: 32}}>
        <h2 style={{margin:"0 0 12px", fontSize: 16, fontWeight: 600}}>{t("admin.lang.coverage")}</h2>
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(260px, 1fr))", gap: 12}}>
          {nonEn.map((l) => {
            const c = getCoverage(l.code);
            const pct = c.total ? Math.round((c.translated / c.total) * 100) : 100;
            const done = c.missing.length === 0;
            return (
              <div key={l.code} className="card" style={{padding: 16}}>
                <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline"}}>
                  <strong style={{fontSize: 14}}>{l.native}</strong>
                  <span className="eyebrow">{l.code}</span>
                </div>
                <div style={{fontFamily:"var(--font-mono)", fontSize: 22, marginTop: 8, color:"var(--c-ink)"}}>
                  {c.translated}/{c.total} <span style={{fontSize: 13, color:"var(--c-faint)"}}>({pct}%)</span>
                </div>
                <div style={{height: 6, background:"var(--c-line)", borderRadius: 999, overflow:"hidden", marginTop: 10}}>
                  <div style={{height:"100%", width: pct + "%", background: done ? "var(--green-500)" : "var(--yellow-500)", borderRadius: 999}} />
                </div>
                {done ? (
                  <div style={{fontSize: 12.5, color:"var(--green-600)", marginTop: 10, fontWeight: 500}}>✓ {t("admin.lang.complete")}</div>
                ) : (
                  <details style={{marginTop: 10}}>
                    <summary style={{fontSize: 12.5, color:"var(--c-dim)", cursor:"pointer"}}>{t("admin.lang.missing")} · {c.missing.length}</summary>
                    <div style={{marginTop: 8, maxHeight: 160, overflowY:"auto", display:"flex", flexDirection:"column", gap: 2}}>
                      {c.missing.map((k) => <code key={k} style={{fontSize: 10.5, color:"var(--c-faint)"}}>{k}</code>)}
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 2 · Fix inline */}
      <section style={{marginBottom: 32}}>
        <h2 style={{margin:"0 0 6px", fontSize: 16, fontWeight: 600}}>{t("admin.lang.fixInline")}</h2>
        <p style={{margin:"0 0 12px", fontSize: 12.5, color:"var(--c-dim)", lineHeight: 1.5, maxWidth: 640}}>{t("admin.lang.fixDesc")}</p>
        <div className="card" style={{padding: 0, overflow:"hidden"}}>
          <table style={{width:"100%", borderCollapse:"collapse", fontSize: 12.5}}>
            <thead>
              <tr style={{background:"var(--c-bg)", borderBottom:"1px solid var(--c-line)"}}>
                <th style={langThCell}>{t("admin.lang.key")}</th>
                <th style={langThCell}>{t("admin.lang.reference")}</th>
                {nonEn.map((l) => <th key={l.code} style={langThCell}>{l.native}</th>)}
              </tr>
            </thead>
            <tbody>
              {ordered.map((key) => (
                <tr key={key} style={{borderBottom:"1px solid var(--c-line-2)"}}>
                  <td style={{padding:"8px 12px", fontFamily:"var(--font-mono)", fontSize: 10.5, color:"var(--c-dim)", verticalAlign:"top", whiteSpace:"nowrap"}}>
                    {missingSet.has(key) && <span title={t("admin.lang.missing")} style={{color:"var(--pink-500)", marginRight: 4}}>●</span>}
                    {key}
                  </td>
                  <td style={{padding:"8px 12px", color:"var(--c-ink)", verticalAlign:"top", maxWidth: 260, lineHeight: 1.4}}>{getSourceText(key)}</td>
                  {nonEn.map((l) => (
                    <td key={l.code} style={{padding:"6px 10px", verticalAlign:"top"}}>
                      <div style={{display:"flex", gap: 6, alignItems:"center"}}>
                        <input
                          value={valueFor(l.code, key)}
                          dir={l.code === "ar" ? "rtl" : "ltr"}
                          placeholder="—"
                          onChange={(e) => { const v = e.target.value; setDrafts((d) => ({ ...d, [dk(l.code, key)]: v })); }}
                          onKeyDown={(e) => e.stopPropagation()}
                          style={{flex: 1, minWidth: 120, padding:"5px 8px", border:"1px solid var(--c-line)", borderRadius: 6, background:"var(--c-bg)", color:"var(--c-ink)", fontSize: 12.5, outline:"none"}}
                        />
                        {dirty(l.code, key) && (
                          <button className="btn btn--ghost btn--sm" disabled={saving === dk(l.code, key)} onClick={() => save(l.code, key)}>
                            {saving === dk(l.code, key) ? "…" : t("admin.lang.save")}
                          </button>
                        )}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3 · Runtime gaps */}
      <section style={{marginBottom: 32}}>
        <h2 style={{margin:"0 0 6px", fontSize: 16, fontWeight: 600}}>{t("admin.lang.runtimeGaps")}</h2>
        <p style={{margin:"0 0 12px", fontSize: 12.5, color:"var(--c-dim)", lineHeight: 1.5, maxWidth: 640}}>{t("admin.lang.runtimeGapsDesc")}</p>
        {runtimeGaps.length === 0 ? (
          <div className="card" style={{padding:"18px 20px", color:"var(--c-faint)", fontSize: 13}}>{t("admin.lang.noGaps")}</div>
        ) : (
          <div className="card" style={{padding:"12px 16px", display:"flex", flexWrap:"wrap", gap: 6}}>
            {runtimeGaps.map((k) => (
              <code key={k} style={{fontSize: 11, padding:"3px 7px", background:"var(--c-bg)", border:"1px solid var(--c-line)", borderRadius: 6, color:"var(--c-dim)"}}>{k}</code>
            ))}
          </div>
        )}
      </section>

      {/* 4 · Governance */}
      <LanguageGovernance t={t} />
    </div>
  );
}

/* Per-workspace language policy — which locales are offered + the default.
   en is always enabled and can't be turned off; the default is limited to the
   enabled set. Reads/writes /api/i18n/policy. */
function LanguageGovernance({ t }) {
  const [policy, setPolicy] = useState(null);        // { enabled_locales, default_locale }
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await apiFetch("/api/i18n/policy");
        const d = await r.json();
        if (r.ok && alive) setPolicy({
          enabled_locales: Array.isArray(d.enabled_locales) && d.enabled_locales.length ? d.enabled_locales : ["en"],
          default_locale: d.default_locale || "en",
        });
      } catch (e) {
        if (alive) setPolicy({ enabled_locales: LOCALES.map((l) => l.code), default_locale: "en" });
      }
    })();
    return () => { alive = false; };
  }, []);

  const toggle = (code) => {
    if (code === "en") return;                        // en always enabled
    setPolicy((p) => {
      const on = p.enabled_locales.includes(code);
      const enabled_locales = on ? p.enabled_locales.filter((c) => c !== code) : [...p.enabled_locales, code];
      const default_locale = enabled_locales.includes(p.default_locale) ? p.default_locale : "en";
      return { enabled_locales, default_locale };
    });
  };

  const save = async () => {
    if (!policy) return;
    setSaving(true); setMsg(null);
    try {
      const r = await apiFetch("/api/i18n/admin/policy", {
        method: "PATCH",
        body: JSON.stringify({ enabled_locales: policy.enabled_locales, default_locale: policy.default_locale }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error("policy save failed");
      setPolicy({
        enabled_locales: Array.isArray(d.enabled_locales) ? d.enabled_locales : policy.enabled_locales,
        default_locale: d.default_locale || policy.default_locale,
      });
      setMsg(t("admin.lang.saved"));
    } catch (e) { setMsg(t("admin.lang.saveError")); }
    finally { setSaving(false); }
  };

  return (
    <section>
      <h2 style={{margin:"0 0 6px", fontSize: 16, fontWeight: 600}}>{t("admin.lang.governance")}</h2>
      <p style={{margin:"0 0 12px", fontSize: 12.5, color:"var(--c-dim)", lineHeight: 1.5, maxWidth: 640}}>{t("admin.lang.governanceDesc")}</p>
      {!policy ? (
        <div style={{color:"var(--c-faint)", fontSize: 13}}>…</div>
      ) : (
        <div className="card" style={{padding: 20, display:"flex", flexDirection:"column", gap: 20, maxWidth: 560}}>
          <div>
            <div style={{fontSize: 12, fontWeight: 600, marginBottom: 8}}>{t("admin.lang.enabledLocales")}</div>
            <div style={{display:"flex", flexDirection:"column", gap: 8}}>
              {LOCALES.map((l) => {
                const on = l.code === "en" || policy.enabled_locales.includes(l.code);
                return (
                  <label key={l.code} style={{display:"flex", alignItems:"center", gap: 10, fontSize: 14, color:"var(--c-ink)"}}>
                    <input type="checkbox" checked={on} disabled={l.code === "en"} onChange={() => toggle(l.code)} />
                    {l.native} <span style={{color:"var(--c-faint)", fontFamily:"var(--font-mono)", fontSize: 11}}>{l.code}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <div>
            <div style={{fontSize: 12, fontWeight: 600, marginBottom: 8}}>{t("admin.lang.defaultLocale")}</div>
            <div style={{display:"flex", flexDirection:"column", gap: 8}}>
              {LOCALES.filter((l) => l.code === "en" || policy.enabled_locales.includes(l.code)).map((l) => (
                <label key={l.code} style={{display:"flex", alignItems:"center", gap: 10, fontSize: 14, color:"var(--c-ink)"}}>
                  <input type="radio" name="lang-default-locale" checked={policy.default_locale === l.code} onChange={() => setPolicy((p) => ({ ...p, default_locale: l.code }))} />
                  {l.native}
                </label>
              ))}
            </div>
          </div>
          <div style={{display:"flex", alignItems:"center", gap: 12}}>
            <button className="btn btn--primary" disabled={saving} onClick={save}>{saving ? t("admin.lang.saving") : t("admin.lang.saveGovernance")}</button>
            {msg && <span style={{fontSize: 12.5, color:"var(--c-dim)"}}>{msg}</span>}
          </div>
        </div>
      )}
    </section>
  );
}

Object.assign(window, { AdminSpecs, AdminBrandolphMemory, AdminLanguages });
