import React from "react";
import { apiFetch, supabase } from "./lib/supabase-browser.js";
const { BrandolphAvatar, BrandolphDot, Counter, Drawer, Icon, LayerTag, ModelChip, PageHeader } = window;
/* Craft marketplace + Credits ledger + Settings. */

const { useState: useCState, useEffect: useCEffect } = React;

/* ════════════════════════════════════════════════════════════════ */
/* CRAFT MARKETPLACE (L3)                                            */

function CraftMarketplace({ go, tier }) {
  const [pack, setPack] = useCState(null);
  const locked = tier === "00" || tier === "01";

  if (locked) {
    return (
      <div style={{padding:"60px 36px", display:"flex", justifyContent:"center"}}>
        <TierLock />
      </div>
    );
  }

  return (
    <div style={{padding:"24px 36px 60px"}}>
      <PageHeader
        eyebrow="L3 · The human creative team"
        title="Hand the work that needs hands."
        sub="Brandolph drafts the first cut. Caastor's creative team — the same one that's served 50+ brands — finishes the work where craft is the difference. Same credit pool, same BIO, no fabricated middle."
        right={<>
          <span style={{fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--c-dim)", letterSpacing:"0.06em"}}>
            Available: <strong style={{color:"var(--c-ink)", fontWeight: 600}}>{window.CI_CREDITS.balance} cr</strong>
          </span>
          <a href="#/credits" className="btn btn--ghost btn--sm">Top up →</a>
        </>}
      />

      <div className="stagger" style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))", gap: 12, marginBottom: 32}}>
        {window.CI_CRAFT.map((c, i) => (
          <button key={i} onClick={() => setPack(c)} className="card" style={{
            padding: 18, textAlign:"left", cursor:"pointer", border:"1px solid var(--c-line)",
            background:"var(--c-card)", transition:"border-color 140ms ease, transform 120ms ease",
            display:"flex", flexDirection:"column", gap: 8,
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--mint-500)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--c-line)"; }}
          >
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline"}}>
              <span style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize: 26, color:"var(--c-ink)", lineHeight: 1, fontWeight: 500}}>{c.cr}</span>
              <span className="eyebrow" style={{color:"var(--c-faint)"}}>cr</span>
            </div>
            <div style={{fontSize: 14.5, fontWeight: 500, color:"var(--c-ink)", marginTop: 4}}>{c.label}</div>
            <div style={{fontSize: 12.5, color:"var(--c-dim)", lineHeight: 1.45, marginTop: 4, minHeight: 36}}>{c.desc}</div>
            <div style={{
              marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--c-line-2)",
              display:"flex", justifyContent:"space-between", alignItems:"center",
            }}>
              <span style={{fontFamily:"var(--font-mono)", fontSize: 10.5, color:"var(--c-faint)", letterSpacing:"0.06em"}}>{c.eta}</span>
              <LayerTag layer="L3" />
            </div>
          </button>
        ))}
        <div className="card" style={{
          padding: 18, display:"flex", flexDirection:"column", justifyContent:"center", alignItems:"center", gap: 8,
          background:"var(--c-bg)", border:"1px dashed var(--c-line-2)", boxShadow:"none",
        }}>
          <span style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize: 24, color:"var(--c-faint)"}}>—</span>
          <div style={{fontSize: 13, color:"var(--c-ink)", fontWeight: 500}}>Quote on request</div>
          <div style={{fontSize: 12, color:"var(--c-dim)", textAlign:"center", lineHeight: 1.4}}>For work outside this menu. Brandolph briefs the team.</div>
          <button className="btn btn--link" style={{fontSize: 12}}>Start a custom request →</button>
        </div>
      </div>

      {/* In flight section */}
      <h3 style={{fontSize: 18, letterSpacing:"-0.01em", marginBottom: 14}}>In flight · 3</h3>
      <div style={{display:"grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 30}}>
        {[
          { title:"Hero KV finish · pricing relaunch", who:"Aitana V.", state:"in-progress", eta:"in 36h", cr:220 },
          { title:"Honduras essay · finishing pass",   who:"Lia R.",    state:"review",      eta:"awaiting your approval", cr:120 },
          { title:"Investor deck · polish",            who:"Diego M.",  state:"delivered",   eta:"delivered yesterday",     cr:300 },
        ].map((j, i) => (
          <div key={i} className="card" style={{padding: 16}}>
            <div style={{display:"flex", alignItems:"center", gap: 10, marginBottom: 10}}>
              <span className={"dot-state dot-state--" + (j.state === "delivered" ? "ok" : j.state === "review" ? "warn" : "running")} />
              <span className="eyebrow" style={{color: j.state === "delivered" ? "var(--green-700)" : "var(--c-dim)"}}>{j.state.replace("-", " ")}</span>
            </div>
            <div style={{fontSize: 14, fontWeight: 500, color:"var(--c-ink)", marginBottom: 6}}>{j.title}</div>
            <div style={{fontSize: 12, color:"var(--c-dim)", marginBottom: 10}}>{j.who} · {j.eta}</div>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
              <span className="credit">−{j.cr} cr</span>
              {j.state === "delivered" ? (
                <button className="btn btn--primary btn--sm">Accept delivery</button>
              ) : (
                <button className="btn btn--link" style={{fontSize: 11}}>View status →</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {pack && <CraftModal pack={pack} onClose={() => setPack(null)} />}
    </div>
  );
}

function CraftModal({ pack, onClose }) {
  return (
    <Drawer
      open={true}
      onClose={onClose}
      eyebrow={`Humans · ${pack.eta}`}
      title={pack.label}
      footer={<>
        <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn--primary">Submit · {pack.cr} cr</button>
      </>}
    >
      <div className="card card--inset" style={{padding: 16, marginBottom: 20}}>
        <p style={{fontSize: 13.5, color:"var(--c-dim)", margin: 0, lineHeight: 1.55}}>{pack.desc}</p>
      </div>

      <div className="eyebrow" style={{marginBottom: 8}}>What to finish</div>
      <div className="card card--inset" style={{padding: 16, marginBottom: 20, display:"flex", flexDirection:"column", gap: 8}}>
        <div style={{padding: 12, border:"1px solid var(--c-line)", borderRadius: 8, background:"var(--c-card)", display:"flex", alignItems:"center", gap: 10}}>
          <ModelChip modelKey="gpt5" />
          <span style={{flex:1, fontSize: 13}}>Pricing page hero · draft v3</span>
          <button className="btn btn--icon btn--ghost" aria-label="Remove" style={{height: 26, width: 26}}><Icon name="close" size={12} /></button>
        </div>
        <button className="btn btn--ghost btn--sm" style={{alignSelf:"flex-start", height: 30}}>
          <Icon name="plus" size={13} /> Add from briefs library
        </button>
      </div>

      <div className="eyebrow" style={{marginBottom: 8}}>Direction</div>
      <div style={{position:"relative", marginBottom: 20}}>
        <textarea className="input" rows={4} defaultValue="Take this through to print-ready. Tone is calm conviction — see BIO voice. The image direction is craft-led, low-light interiors, no top-down latte art. Final files in PDF + EPS." />
        <div style={{position:"absolute", bottom: 10, right: 12, display:"flex", alignItems:"center", gap: 6, fontFamily:"var(--font-mono)", fontSize: 10, color:"var(--c-faint)", letterSpacing:"0.04em"}}>
          <BrandolphDot /> Pre-filled by Brandolph from BIO
        </div>
      </div>

      <div className="eyebrow" style={{marginBottom: 8}}>Deadline · priority</div>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap: 10, marginBottom: 18}}>
        <div className="card card--inset" style={{padding: 12}}>
          <div className="eyebrow" style={{marginBottom: 4}}>SLA · Tier 02</div>
          <div style={{fontSize: 14, color:"var(--c-ink)", fontWeight: 500}}>2–4 days standard</div>
        </div>
        <div className="card card--inset" style={{padding: 12}}>
          <div className="eyebrow" style={{marginBottom: 4}}>Rush · +50% cr</div>
          <label style={{display:"flex", alignItems:"center", gap: 8, fontSize: 14, color:"var(--c-ink)"}}>
            <input type="checkbox" /> Rush · in 24h
          </label>
        </div>
      </div>

      <div style={{padding: 14, background:"var(--yellow-50)", borderRadius: 10, border:"1px solid var(--yellow-200)", display:"flex", justifyContent:"space-between", alignItems:"center"}}>
        <div>
          <div style={{fontSize: 13, color:"var(--c-ink)", fontWeight: 500}}>Total · {pack.cr} cr</div>
          <div style={{fontSize: 12, color:"var(--c-dim)"}}>Deducted on submit · refundable until job accepted by team</div>
        </div>
        <span className="credit credit--pending" style={{fontSize: 16}}>−{pack.cr} cr</span>
      </div>
    </Drawer>
  );
}

function TierLock() {
  return (
    <div className="card" style={{
      padding: 40, maxWidth: 520, textAlign:"center",
      border:"2px solid var(--yellow-500)",
      background:"linear-gradient(180deg, var(--yellow-50), #fff 70%)",
    }}>
      <div style={{display:"flex", justifyContent:"center", marginBottom: 16}}>
        <BrandolphAvatar size={56} />
      </div>
      <h2 style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize: 28, color:"var(--c-ink)", letterSpacing:"-0.01em", margin: 0, marginBottom: 14, fontWeight: 500}}>
        <em style={{background:"var(--yellow-200)", padding:"0 4px", fontStyle:"normal"}}>This lives in Brandolph.</em>
      </h2>
      <p style={{fontSize: 14.5, color:"var(--c-dim)", lineHeight: 1.55, margin: 0, marginBottom: 22}}>
        Humans — the L3 layer — are the difference between an AI draft and finished work a buyer takes seriously. They come with Brandolph and up.
      </p>
      <div style={{display:"flex", gap: 10, justifyContent:"center"}}>
        <button className="btn btn--primary btn--lg">Upgrade to The River 🌊</button>
        <button className="btn btn--ghost">See plans</button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* CREDITS LEDGER                                                    */

function CreditsLedger() {
  const c = window.CI_CREDITS;
  const [layer, setLayer] = useCState("all");
  const entries = layer === "all" ? window.CI_LEDGER : window.CI_LEDGER.filter(e => e.layer === layer);

  return (
    <div style={{padding:"24px 36px 60px"}}>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap: 28, marginBottom: 30, alignItems:"start"}}>
        {/* Big balance */}
        <div>
          <div className="eyebrow" style={{marginBottom: 10}}>Available credits · this cycle</div>
          <div style={{display:"flex", alignItems:"baseline", gap: 14}}>
            <span style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontWeight: 500, fontSize: 112, lineHeight: 1, color:"var(--c-ink)", letterSpacing:"-0.02em"}}>
              <Counter to={c.balance} />
            </span>
            <div>
              <div style={{fontFamily:"var(--font-mono)", fontSize: 12, color:"var(--c-faint)", letterSpacing:"0.06em", textTransform:"uppercase"}}>cr</div>
              <div style={{fontSize: 13, color:"var(--c-dim)", marginTop: 4}}>of {c.monthly} · resets in {c.resetsInDays} days</div>
            </div>
          </div>
          <div style={{marginTop: 16, display:"flex", gap: 10}}>
            <button className="btn btn--primary">Top up</button>
            <button className="btn btn--ghost">Change plan</button>
            <button className="btn btn--ghost btn--sm">Export ledger</button>
          </div>
        </div>

        {/* Split */}
        <div className="card" style={{padding: 22}}>
          <div className="eyebrow" style={{marginBottom: 14}}>Spent this cycle · by layer</div>
          <div style={{display:"flex", height: 16, borderRadius: 4, overflow:"hidden", border:"1px solid var(--c-line)", marginBottom: 16}}>
            {c.split.filter(s => s.credits > 0).map((s, i) => (
              <div key={i} style={{flex: s.pct || 1, background: s.color}} title={`${s.kind} · ${s.credits}cr`} />
            ))}
          </div>
          {c.split.map((s, i) => (
            <div key={i} style={{display:"flex", justifyContent:"space-between", padding:"6px 0", fontSize: 13}}>
              <span style={{display:"flex", alignItems:"center", gap: 8}}>
                <span style={{width: 10, height: 10, borderRadius: 2, background: s.color}} />
                <span style={{color:"var(--c-ink)"}}>{s.kind}</span>
              </span>
              <span className={"credit " + (s.credits > 0 ? "credit--spent" : "credit--earned")}>{s.credits > 0 ? "−" : "+"}{Math.abs(s.credits)} cr</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top-up packs */}
      <h3 style={{fontSize: 18, marginBottom: 12, letterSpacing:"-0.005em"}}>Top-up packs</h3>
      <div className="stagger" style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap: 14, marginBottom: 30}}>
        {[
          { cr: 200,  price: "€90",  rate: "€0.45/cr", featured: false },
          { cr: 600,  price: "€240", rate: "€0.40/cr", featured: true  },
          { cr: 1500, price: "€525", rate: "€0.35/cr", featured: false },
          { cr: 4000, price: "€1,200", rate: "€0.30/cr", featured: false },
        ].map((p, i) => (
          <div key={i} className="card" style={{
            padding: 22, position:"relative",
            border: p.featured ? "2px solid var(--yellow-500)" : "1px solid var(--c-line)",
          }}>
            {p.featured && <span style={{position:"absolute", top:-10, left: 14}} className="pill pill--yellow">Most popular</span>}
            <div style={{fontFamily:"Georgia, serif", fontStyle:"italic", fontSize: 36, color:"var(--c-ink)", letterSpacing:"-0.01em", fontWeight: 500}}>{p.cr}</div>
            <div className="eyebrow" style={{marginBottom: 10}}>credits</div>
            <div style={{fontSize: 22, fontWeight: 600, color:"var(--c-ink)"}}>{p.price}</div>
            <div style={{fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--c-faint)", marginTop: 4}}>{p.rate}</div>
            <button className="btn btn--dark btn--sm" style={{marginTop: 16, width:"100%", justifyContent:"center"}}>Buy</button>
          </div>
        ))}
      </div>

      {/* Ledger */}
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 14}}>
        <h3 style={{fontSize: 18, margin: 0, letterSpacing:"-0.005em"}}>Ledger</h3>
        <div style={{display:"flex", gap: 6}}>
          {[["all","All"],["L1","L1 · Brandolph"],["L2","L2 · Specialists"],["L3","L3 · Humans"]].map(([k, l]) => (
            <button key={k} onClick={() => setLayer(k)}
              className={"pill" + (layer === k ? " pill--dark" : "")}
              style={{cursor:"pointer", height: 28, padding:"0 12px"}}>{l}</button>
          ))}
        </div>
      </div>
      <div className="card" style={{padding: 0, overflow:"hidden"}}>
        <table style={{width:"100%", borderCollapse:"collapse", fontSize: 13}}>
          <thead>
            <tr style={{background:"var(--c-bg)", borderBottom:"1px solid var(--c-line)"}}>
              {["Date","Description","Who","Layer","Amount"].map((h, i) => (
                <th key={h} style={{textAlign: i === 4 ? "right" : "left", padding:"12px 18px", fontFamily:"var(--font-mono)", fontSize:10.5, color:"var(--c-faint)", letterSpacing:"0.1em", textTransform:"uppercase", fontWeight: 500}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i} style={{borderBottom: i < entries.length - 1 ? "1px solid var(--c-line)" : "none"}}>
                <td style={{padding:"14px 18px", fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--c-dim)"}}>{e.date}</td>
                <td style={{padding:"14px 18px", color:"var(--c-ink)"}}>{e.desc}</td>
                <td style={{padding:"14px 18px", color:"var(--c-dim)"}}>{e.who}</td>
                <td style={{padding:"14px 18px"}}>{e.layer !== "—" ? <LayerTag layer={e.layer} /> : <span style={{color:"var(--c-faint)"}}>—</span>}</td>
                <td style={{padding:"14px 18px", textAlign:"right"}}>
                  <span className={"credit " + (e.cr > 0 ? "credit--earned" : "credit--spent")}>
                    {e.cr > 0 ? "+" : "−"}{Math.abs(e.cr)} cr
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{marginTop: 30, paddingTop: 24, borderTop: "1px solid var(--c-line)", display:"grid", gridTemplateColumns:"1fr 1fr", gap: 20}}>
        <div>
          <div className="eyebrow" style={{marginBottom: 6}}>Invoices · Stripe</div>
          <p style={{fontSize: 13, color:"var(--c-dim)", margin: 0, marginBottom: 8, lineHeight: 1.5}}>Your invoices live in Stripe. We'll email a copy each cycle.</p>
          <button className="btn btn--link" style={{fontSize: 12}}>Open Stripe portal →</button>
        </div>
        <div>
          <div className="eyebrow" style={{marginBottom: 6}}>Downgrade · cancel</div>
          <p style={{fontSize: 13, color:"var(--c-dim)", margin: 0, marginBottom: 8, lineHeight: 1.5}}>If Brandolph isn't right for you, this is here. We'd rather you stay, but the door isn't locked.</p>
          <button className="btn btn--link" style={{fontSize: 12, color:"var(--c-faint)"}}>Manage plan →</button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* SETTINGS                                                          */

/* Per-channel notification toggles — Profile → Notifications. Writes to
   /api/notifications/prefs; the notify() dispatcher honours these per channel. */
function NotifToggleRow({ label, desc, on, onChange }) {
  return (
    <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", gap:16, padding:"14px 0", borderBottom:"1px solid var(--c-line)"}}>
      <div>
        <div style={{fontSize:14, fontWeight:500, color:"var(--c-ink)"}}>{label}</div>
        <div style={{fontSize:12.5, color:"var(--c-dim)", marginTop:2}}>{desc}</div>
      </div>
      <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
        style={{position:"relative", width:44, height:26, borderRadius:999, border:"none", cursor:"pointer",
          background: on ? "var(--brand)" : "var(--neutral-300)", transition:"background 160ms ease", flexShrink:0}}>
        <span style={{position:"absolute", top:3, left: on ? 21 : 3, width:20, height:20, borderRadius:"50%", background:"#fff", transition:"left 160ms ease", boxShadow:"0 1px 3px rgba(0,0,0,0.25)"}} />
      </button>
    </div>
  );
}

function NotificationPrefs() {
  const [prefs, setPrefs] = useCState({ in_app: true, email: true });
  const [loaded, setLoaded] = useCState(false);
  useCEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await apiFetch("/api/notifications/prefs");
        if (r.ok && alive) { const d = await r.json(); setPrefs({ in_app: d.in_app !== false, email: d.email !== false }); }
      } catch (e) { /* keep defaults */ }
      if (alive) setLoaded(true);
    })();
    return () => { alive = false; };
  }, []);
  const set = async (key, val) => {
    if (!loaded) return;                                           // don't let the initial load race/clobber a toggle
    setPrefs((p) => ({ ...p, [key]: val }));                       // optimistic
    try {
      const r = await apiFetch("/api/notifications/prefs", { method: "PATCH", body: JSON.stringify({ [key]: val }) });
      if (!r.ok) throw new Error("prefs update failed");
    } catch (e) { setPrefs((p) => ({ ...p, [key]: !val })); }      // revert on failure
  };
  return (
    <div style={{display:"flex", flexDirection:"column", gap: 4, maxWidth: 520}}>
      <h3 style={{margin: "0 0 4px"}}>Notifications</h3>
      <p style={{fontSize:13, color:"var(--c-dim)", margin:"0 0 12px", lineHeight:1.5}}>
        How you hear about craft handoffs, BIO certifications, and completed work. Turn a channel off to stop receiving it there.
      </p>
      <NotifToggleRow label="In-app" desc="A bell notification inside CaastorOS." on={prefs.in_app} onChange={(v) => set("in_app", v)} />
      <NotifToggleRow label="Email"  desc="A message to your account email."      on={prefs.email}  onChange={(v) => set("email", v)} />
      {!loaded && <div style={{fontSize:12, color:"var(--c-faint)", marginTop:10}}>Loading…</div>}
    </div>
  );
}

const ROLE_LABEL = { client: "Client", team: "Caastor team", admin: "Admin" };

/* A failed load must not read as "you have nothing" — say so instead. */
const ErrCard = ({ children }) => (
  <div className="card" style={{padding:"10px 14px", marginBottom: 14, borderLeft:"3px solid var(--pink-500)", fontSize: 13}}>{children}</div>
);

/* Workspace identity + roster. The `workspaces` row comes straight from the
   browser client (RLS ws_workspaces scopes it to the caller's own workspace);
   members must go through the server because `users` RLS is self-read only. */
function useWorkspace() {
  const [state, setState] = useCState({ loading: true, name: null, tier: null, members: [], brands: [], credits: null, error: null });

  const load = React.useCallback(async () => {
    try {
      const [wsRes, memRes, brandRes, credRes, briefRes, ledgerRes] = await Promise.all([
        supabase.from("workspaces").select("name, tier").maybeSingle(),
        apiFetch("/api/workspace/members"),
        supabase.from("brands").select("id, name, url, created_at").order("created_at", { ascending: true }),
        apiFetch("/api/credits").then((r) => (r.ok ? r.json() : null)).catch(() => null),
        supabase.from("briefs").select("id, brand_id, created_at, runs ( id )"),
        supabase.from("ledger").select("credits, run_id"),
      ]);
      if (wsRes.error) throw new Error(wsRes.error.message);
      if (!memRes.ok) throw new Error((await memRes.json().catch(() => ({}))).error || `HTTP ${memRes.status}`);
      const { members } = await memRes.json();

      /* Per-brand spend has to be joined: `ledger` carries run_id, not
         brand_id, so credits attribute through runs -> briefs -> brand.
         Only positive rows are debits (negative = a grant), and rows with
         no run_id are workspace-level, not attributable to any brand. */
      const runBrand = {}, briefCount = {}, lastAt = {};
      for (const b of briefRes.data || []) {
        briefCount[b.brand_id] = (briefCount[b.brand_id] || 0) + 1;
        if (!lastAt[b.brand_id] || b.created_at > lastAt[b.brand_id]) lastAt[b.brand_id] = b.created_at;
        for (const r of b.runs || []) runBrand[r.id] = b.brand_id;
      }
      const spent = {};
      for (const l of ledgerRes.data || []) {
        const bid = l.run_id && runBrand[l.run_id];
        if (bid && Number(l.credits) > 0) spent[bid] = (spent[bid] || 0) + Number(l.credits);
      }

      const brands = (brandRes.data || []).map((b) => ({
        ...b,
        briefs: briefCount[b.id] || 0,
        spent: spent[b.id] || 0,
        lastAt: lastAt[b.id] || null,
      }));

      setState({
        loading: false,
        name: wsRes.data?.name || null,
        tier: wsRes.data?.tier || null,
        members: members || [],
        brands,
        credits: credRes,
        error: null,
      });
    } catch (e) {
      setState({ loading: false, name: null, tier: null, members: [], brands: [], credits: null, error: e?.message || String(e) });
    }
  }, []);

  useCEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

/* One brand, with what it has actually consumed and produced, plus the
   two lifecycle actions. Rename and delete go straight through the
   browser client: the `ws_brands` RLS policy is `for all`, scoped to the
   caller's own workspace, so no endpoint is needed to do it safely.

   Deleting a brand cascades its BIO, briefs, runs and outputs. Rather
   than ask the user to type the name, the confirm step states the blast
   radius in the counts they can already see — that is the information
   that makes the decision, and typing a name proves nothing about
   whether they understood the consequence. */
function BrandRow({ brand, canDelete, onChanged }) {
  const [editing, setEditing] = useCState(false);
  const [name, setName]       = useCState(brand.name || "");
  const [confirming, setConf] = useCState(false);
  const [busy, setBusy]       = useCState(false);
  const [err, setErr]         = useCState(null);

  const save = async () => {
    const next = name.trim();
    if (!next || next === brand.name) { setEditing(false); setName(brand.name || ""); return; }
    setBusy(true); setErr(null);
    const { error } = await supabase.from("brands").update({ name: next }).eq("id", brand.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setEditing(false);
    window.dispatchEvent(new Event("brand:changed"));   // dock switcher + data hooks refetch
    onChanged();
  };

  const destroy = async () => {
    setBusy(true); setErr(null);
    const { error } = await supabase.from("brands").delete().eq("id", brand.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    /* The dock may still be pointing at the brand that just went away. */
    try { if (window.getCurrentBrandId?.() === brand.id) window.setCurrentBrandId?.(null); } catch (e) {}
    window.dispatchEvent(new Event("brand:changed"));
    onChanged();
  };

  const stat = (label, value) => (
    <div>
      <div className="eyebrow" style={{marginBottom: 2}}>{label}</div>
      <div style={{fontFamily:"var(--font-mono)", fontSize: 12.5, color:"var(--c-ink)"}}>{value}</div>
    </div>
  );

  return (
    <div style={{border:"1px solid var(--c-line)", borderRadius: 10, padding: 14, display:"flex", flexDirection:"column", gap: 12}}>
      <div style={{display:"flex", alignItems:"center", gap: 12}}>
        <div style={{width: 30, height: 30, borderRadius: 8, background:"var(--neutral-900)", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"var(--font-mono)", fontWeight:600, fontSize:12, flexShrink:0}}>
          {(brand.name || "?").trim().charAt(0).toUpperCase()}
        </div>
        {editing ? (
          <input className="input" value={name} autoFocus disabled={busy}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setEditing(false); setName(brand.name || ""); } }}
            style={{flex:1, height: 32, fontSize: 14}} aria-label="Brand name" />
        ) : (
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontSize: 14, fontWeight: 500}}>{brand.name}</div>
            {brand.url && <div style={{fontSize: 11.5, color:"var(--c-faint)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{brand.url}</div>}
          </div>
        )}
        <div style={{display:"flex", gap: 6, flexShrink:0}}>
          {editing ? (
            <>
              <button className="btn btn--primary btn--sm" onClick={save} disabled={busy}>{busy ? "…" : "Save"}</button>
              <button className="btn btn--ghost btn--sm" onClick={() => { setEditing(false); setName(brand.name || ""); }} disabled={busy}>Cancel</button>
            </>
          ) : (
            <>
              <button className="btn btn--ghost btn--sm" onClick={() => setEditing(true)}>Rename</button>
              <button className="btn btn--ghost btn--sm" onClick={() => setConf(true)}
                disabled={!canDelete} style={{opacity: canDelete ? 1 : 0.45}}
                title={canDelete ? "Delete this brand" : "A workspace needs at least one brand"}>Delete</button>
            </>
          )}
        </div>
      </div>

      <div style={{display:"flex", gap: 26, flexWrap:"wrap", paddingTop: 10, borderTop:"1px dashed var(--c-line-2)"}}>
        {stat("Briefs", brand.briefs)}
        {stat("Credits spent", `${brand.spent} cr`)}
        {stat("Last brief", brand.lastAt ? new Date(brand.lastAt).toLocaleDateString(undefined, { day:"numeric", month:"short", year:"numeric" }) : "—")}
      </div>

      {err && <ErrCard>Couldn't update this brand — {err}</ErrCard>}

      {confirming && (
        <div className="card card--inset" style={{padding: 14, borderLeft:"3px solid var(--pink-500)", display:"flex", flexDirection:"column", gap: 10}}>
          <div style={{fontSize: 13.5, lineHeight: 1.5, color:"var(--c-ink)"}}>
            Delete <strong>{brand.name}</strong>? This also removes its BIO
            {brand.briefs > 0 && <> and <strong>{brand.briefs}</strong> brief{brand.briefs === 1 ? "" : "s"}</>}
            {brand.spent > 0 && <> ({brand.spent} cr of work)</>}. There is no undo.
          </div>
          <div style={{display:"flex", gap: 8}}>
            <button className="btn btn--danger btn--sm" onClick={destroy} disabled={busy}>{busy ? "Deleting…" : "Delete brand"}</button>
            <button className="btn btn--ghost btn--sm" onClick={() => setConf(false)} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* A destination we intend to build. Says so plainly instead of showing
   invented connections or a plan upsell for something that doesn't exist. */
function ComingSoon({ title, body }) {
  return (
    <div style={{padding: "40px 24px", textAlign: "center", maxWidth: 420, margin: "0 auto"}}>
      <BrandolphAvatar size={52} />
      <h3 style={{marginTop: 16, marginBottom: 8}}>{title}</h3>
      <p style={{color: "var(--c-dim)", fontSize: 13.5, lineHeight: 1.55, margin: 0}}>{body}</p>
      <span className="pill" style={{marginTop: 16, display: "inline-flex"}}>Coming soon</span>
    </div>
  );
}

/* Deleting a workspace destroys every brand, BIO, brief, run and output
   in it, with no undo and no export. Two deliberate gates: an arm step,
   then typing the workspace name. Deletion is blocked while other members
   remain — one person must not be able to erase a team's work from a
   settings page. */
function DangerZone({ workspaceName, memberCount }) {
  const [armed, setArmed]   = useCState(false);
  const [typed, setTyped]   = useCState("");
  const [busy, setBusy]     = useCState(false);
  const [err, setErr]       = useCState(null);
  const soloOwner = memberCount <= 1;
  const nameMatches = workspaceName && typed.trim() === workspaceName;

  const destroy = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await apiFetch("/api/workspace", { method: "DELETE", body: JSON.stringify({ confirmName: typed.trim() }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      try { localStorage.clear(); } catch (e) {}
      window.location.assign("#/login");
      window.location.reload();
    } catch (e) {
      setErr(e?.message || String(e));
      setBusy(false);
    }
  };

  return (
    <div style={{display:"flex", flexDirection:"column", gap: 14, maxWidth: 520}}>
      <h3 style={{margin: 0, color:"var(--pink-500)"}}>Danger</h3>
      <p style={{fontSize: 13, color:"var(--c-dim)", margin: 0, lineHeight: 1.55}}>
        Deleting this workspace permanently removes every brand, BIO, brief, specialist run and
        output inside it. There is no undo, and no copy is kept.
      </p>

      {!soloOwner && (
        <div className="card card--inset" style={{padding: 14, fontSize: 13, color:"var(--c-dim)"}}>
          This workspace has {memberCount} members. Remove the others first — deleting would
          destroy their work too.
        </div>
      )}
      {err && <ErrCard>Couldn't delete the workspace — {err}</ErrCard>}

      {!armed ? (
        <button className="btn btn--danger" disabled={!soloOwner} style={{alignSelf:"flex-start", opacity: soloOwner ? 1 : 0.5}}
          onClick={() => setArmed(true)}>Delete workspace</button>
      ) : (
        <div className="card card--inset" style={{padding: 16, display:"flex", flexDirection:"column", gap: 10, borderLeft:"3px solid var(--pink-500)"}}>
          <div style={{fontSize: 13.5, color:"var(--c-ink)"}}>
            Type <strong>{workspaceName || "the workspace name"}</strong> to confirm.
          </div>
          <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)}
            placeholder={workspaceName || ""} autoFocus aria-label="Confirm workspace name" />
          <div style={{display:"flex", gap: 8}}>
            <button className="btn btn--danger btn--sm" disabled={!nameMatches || busy} onClick={destroy}
              style={{opacity: nameMatches && !busy ? 1 : 0.5}}>
              {busy ? "Deleting…" : "Permanently delete"}
            </button>
            <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => { setArmed(false); setTyped(""); setErr(null); }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsView() {
  const [tab, setTab] = useCState("workspace");
  const ws = useWorkspace();
  return (
    <div style={{padding:"24px 36px 60px"}}>
      <PageHeader eyebrow="Workspace governance" title="Settings" sub="Workspace, billing, members, BIO governance. The rules that hold across every brief, every specialist." />

      <div style={{display:"grid", gridTemplateColumns:"220px 1fr", gap: 32}}>
        <nav style={{display:"flex", flexDirection:"column", gap: 2, position:"sticky", top: 0, alignSelf:"start"}}>
          {/* Was nine items. "Brands (Tier 03)" and "API & MCP (Tier 03)"
              rendered the SAME upsell panel, Workspace held one field and an
              apology, and Members is one row on a solo account — so brands
              folded into Subscription (your plan is what sets the allowance)
              and Members folded into Workspace. Integrations and API are
              real destinations we haven't built; they say so instead of
              showing invented connections. */}
          {[
            ["workspace",     "Workspace",     false],
            ["subscription",  "Subscription",  false],
            ["bio",           "BIO governance",false],
            ["notifications", "Notifications", false],
            ["integrations",  "Integrations",  true],
            ["api",           "API & MCP",     true],
            ["danger",        "Danger",        false],
          ].map(([k, l, soon]) => (
            <button key={k} className={"navitem" + (tab === k ? " navitem--active" : "")} onClick={() => setTab(k)}
              style={{border:"none", background: undefined, textAlign:"left", width:"100%", display:"flex", alignItems:"center", gap:8}}>
              <span style={soon ? {color:"var(--c-faint)"} : undefined}>{l}</span>
              {soon && <span className="pill" style={{marginLeft:"auto", height:18, padding:"0 7px", fontSize:9.5, letterSpacing:"0.06em"}}>SOON</span>}
            </button>
          ))}
        </nav>

        <section className="card" style={{padding: 28}}>
          {tab === "notifications" && <NotificationPrefs />}
          {tab === "workspace" && (
            <div style={{display:"flex", flexDirection:"column", gap: 18, maxWidth: 480}}>
              <h3 style={{margin: 0}}>Workspace</h3>
              {ws.error && <ErrCard>Couldn't load your workspace — {ws.error}</ErrCard>}
              <div style={{display:"flex", gap: 12, alignItems:"center"}}>
                <div style={{width:56, height:56, borderRadius: 10, background:"var(--neutral-900)", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"var(--font-mono)", fontWeight:600, fontSize:24}}>
                  {(ws.name || "?").trim().charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{fontSize: 15, fontWeight: 500}}>{ws.loading ? "Loading…" : (ws.name || "—")}</div>
                  <div style={{fontSize: 12, color:"var(--c-faint)"}}>
                    {ws.tier ? `${window.CI_TIERS?.[ws.tier] || "Tier " + ws.tier} · renaming isn't available yet` : "Renaming isn't available yet."}
                  </div>
                </div>
              </div>

              {/* Members lived on its own tab, which on a solo account was a
                  single row. Both answer "who and what is this workspace". */}
              <div style={{marginTop: 10}}>
                <div className="eyebrow" style={{marginBottom: 10}}>
                  Members{ws.loading || ws.error ? "" : ` · ${ws.members.length}`}
                </div>
                {ws.loading && <div style={{fontSize: 12, color:"var(--c-faint)"}}>Loading…</div>}
                <div style={{display:"flex", flexDirection:"column", gap: 8}}>
                  {ws.members.map((m) => (
                    <div key={m.id} style={{display:"flex", alignItems:"center", gap: 12, padding: 12, border:"1px solid var(--c-line)", borderRadius: 10}}>
                      <div style={{width: 36, height: 36, borderRadius:"50%", background:"var(--neutral-900)", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"var(--font-mono)", fontWeight:600, fontSize:14}}>
                        {(m.email || "?").charAt(0).toUpperCase()}
                      </div>
                      <div style={{flex:1, fontSize: 14, fontWeight: 500}}>{m.email}</div>
                      <span className="pill">{ROLE_LABEL[m.role] || m.role}</span>
                    </div>
                  ))}
                </div>
                <div style={{fontSize: 12, color:"var(--c-faint)", marginTop: 10}}>Inviting teammates isn't available yet.</div>
              </div>
            </div>
          )}
          {tab === "bio" && (
            <div style={{display:"flex", flexDirection:"column", gap: 18, maxWidth: 580}}>
              <h3 style={{margin: 0}}>BIO governance</h3>
              <p style={{fontSize: 13, color:"var(--c-dim)", margin: 0, lineHeight:1.55}}>
                <em className="b-voice" style={{background:"none", fontStyle:"italic"}}>The BIO is the canon.</em> Every agent reads it before responding. These rules become hard constraints across every brief.
              </p>
              <div>
                <label style={{display:"block", fontSize:12, fontWeight:500, marginBottom: 6}}>Auto-approve threshold (confidence ≥)</label>
                <input className="input" type="number" defaultValue="85" />
              </div>
              <div>
                <label style={{display:"block", fontSize:12, fontWeight:500, marginBottom: 6}}>Forbidden language (one per line)</label>
                <textarea className="input" rows={5} defaultValue={"unlock\nlimited time\ndrop\nexclusive\nFOMO\nkit\njourney"} />
              </div>
              <div>
                <label style={{display:"flex", alignItems:"center", gap: 10, fontSize: 14, color:"var(--c-ink)"}}>
                  <input type="checkbox" defaultChecked /> Lock brand voice — refuse outputs that drift &gt; 20%
                </label>
                <label style={{display:"flex", alignItems:"center", gap: 10, fontSize: 14, color:"var(--c-ink)", marginTop: 8}}>
                  <input type="checkbox" defaultChecked /> Require Brandolph to surface what's NOT being done on every brief
                </label>
              </div>
              <button className="btn btn--primary" style={{alignSelf:"flex-start"}}>Save governance →</button>
            </div>
          )}
          {/* Was a grid of six services with Slack, Stripo and Klaviyo
              showing a green "Connected" pill. None of them were. */}
          {tab === "integrations" && <ComingSoon title="Integrations" body="Handing work off to the tools you already use — Slack, email builders, deck and page composers. Not built yet." />}
          {tab === "api" && <ComingSoon title="API & MCP" body="Programmatic access to briefs, specialists and the BIO, plus an MCP server so your own agents can read the canon. Not built yet." />}
          {/* Brands merged in here: your plan is what sets the allowance,
              so the count and the upgrade path belong on one page. Every
              number is live — this panel used to hardcode "Tier 02 · The
              River · 900 cr · €399 · next renewal 4 Jun" for every user. */}
          {tab === "subscription" && (
            <div style={{display:"flex", flexDirection:"column", gap: 18, maxWidth: 560}}>
              <h3 style={{margin: 0}}>Subscription</h3>
              {ws.error && <ErrCard>Couldn't load your plan — {ws.error}</ErrCard>}
              <div className="card card--inset" style={{padding: 22, background:"var(--yellow-50)", border:"1px solid var(--yellow-200)"}}>
                <div className="eyebrow eyebrow--yellow" style={{marginBottom: 6}}>Current plan</div>
                <div style={{fontSize: 22, fontWeight: 600, marginBottom: 8}}>
                  {ws.loading ? "Loading…" : ws.tier ? `Tier ${ws.tier} · ${window.CI_TIERS?.[ws.tier] || ""}` : "—"}
                </div>
                <div style={{display:"flex", gap: 26, flexWrap:"wrap", fontSize: 13.5, color:"var(--c-dim)"}}>
                  <div>
                    <div className="eyebrow" style={{marginBottom: 3}}>Credits</div>
                    {ws.credits
                      ? <span><strong style={{color:"var(--c-ink)"}}>{ws.credits.balance}</strong>{ws.credits.monthly ? ` / ${ws.credits.monthly} per month` : " · unlimited pool"}</span>
                      : "—"}
                  </div>
                  <div>
                    <div className="eyebrow" style={{marginBottom: 3}}>Brands</div>
                    <span><strong style={{color:"var(--c-ink)"}}>{ws.brands.length}</strong>
                      {(() => { const lim = window.CI_BRAND_LIMITS?.[ws.tier]; return lim === Infinity ? " · unlimited" : lim ? ` / ${lim}` : ""; })()}
                    </span>
                  </div>
                </div>
                <div style={{marginTop: 16}}>
                  <a href="#/upgrade" className="btn btn--ghost btn--sm">Change plan</a>
                </div>
              </div>
              {ws.brands.length > 0 && (
                <div>
                  <div className="eyebrow" style={{marginBottom: 10}}>Your brands</div>
                  <div style={{display:"flex", flexDirection:"column", gap: 10}}>
                    {ws.brands.map((b) => (
                      <BrandRow key={b.id} brand={b} canDelete={ws.brands.length > 1} onChanged={ws.reload} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {tab === "danger" && <DangerZone workspaceName={ws.name} memberCount={ws.members.length} />}
        </section>
      </div>
    </div>
  );
}

Object.assign(window, { CraftMarketplace, CreditsLedger, SettingsView });
