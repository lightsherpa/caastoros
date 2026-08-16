import React from "react";
import { supabase, apiFetch } from "./lib/supabase-browser.js";
import { LOCALES, useLocale } from "./lib/i18n.js";
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
          { title:"Hero KV finish · spring campaign", who:"Aitana V.", state:"in-progress", eta:"in 36h", cr:220 },
          { title:"Collection essay · finishing pass",   who:"Lia R.",    state:"review",      eta:"awaiting your approval", cr:120 },
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

/* Platform language — Profile → Language. Mirrors NotificationPrefs. The
   enabled locales come from the workspace policy (/api/i18n/policy); choosing
   one flips the whole shell via setLocale() and persists to the user's account
   (/api/i18n/me-locale). Optimistic: on PATCH failure the local switch stands
   and a small inline error shows. */
function LanguagePrefs() {
  const { locale, setLocale, t } = useLocale();
  const [enabled, setEnabled] = useCState(LOCALES.map((l) => l.code));
  const [error, setError] = useCState(null);
  useCEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await apiFetch("/api/i18n/policy");
        if (r.ok && alive) {
          const d = await r.json();
          if (Array.isArray(d.enabled_locales) && d.enabled_locales.length) setEnabled(d.enabled_locales);
        }
      } catch (e) { /* fall back to all locales */ }
    })();
    return () => { alive = false; };
  }, []);
  const choose = async (code) => {
    if (code === locale) return;
    setError(null);
    setLocale(code);                                               // optimistic, platform-wide
    try {
      const r = await apiFetch("/api/i18n/me-locale", { method: "PATCH", body: JSON.stringify({ locale: code }) });
      if (!r.ok) throw new Error("locale save failed");
    } catch (e) { setError(t("settings.language.saveError")); }    // keep the local switch
  };
  const options = LOCALES.filter((l) => enabled.includes(l.code));
  return (
    <div style={{display:"flex", flexDirection:"column", gap: 4, maxWidth: 520}}>
      <h3 style={{margin: "0 0 4px"}}>{t("settings.language.title")}</h3>
      <p style={{fontSize:13, color:"var(--c-dim)", margin:"0 0 12px", lineHeight:1.5}}>
        {t("settings.language.desc")}
      </p>
      <div style={{display:"flex", flexDirection:"column", gap: 8}}>
        {options.map((l) => {
          const active = l.code === locale;
          return (
            <button key={l.code} type="button" onClick={() => choose(l.code)} aria-pressed={active}
              style={{display:"flex", alignItems:"center", justifyContent:"space-between", gap:12,
                padding:"12px 14px", borderRadius:10, cursor:"pointer", textAlign:"left", width:"100%",
                border: active ? "1.5px solid var(--brand)" : "1px solid var(--c-line)",
                background: active ? "rgba(var(--brand-glow),0.06)" : "var(--c-card)"}}>
              <span style={{fontSize:14, fontWeight:500, color:"var(--c-ink)"}}>{l.native}</span>
              {active && <Icon name="check" size={15} />}
            </button>
          );
        })}
      </div>
      {error && <div style={{fontSize:12, color:"var(--pink-500)", marginTop:10}}>{error}</div>}
    </div>
  );
}

const TIER_LABELS = {
  "00":"The Creek", "01":"Brandolph", "02":"The River", "03":"The Colony",
};
const BRAND_LIMITS = { "00":1, "01":2, "02":3, "03":Infinity };

function useAccountData() {
  const session = window.useSession?.() || window.CI_AUTH?.getSession?.();
  const membership = session?.memberships?.[0] || session?.assignments?.[0] || null;
  const [state, setState] = useCState({ loading:true, error:null, workspace:membership, brands:[], credits:null });
  useCEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [creditsResponse, brandsResponse] = await Promise.all([
          apiFetch(`/api/credits${membership?.id ? `?workspaceId=${encodeURIComponent(membership.id)}` : ""}`),
          supabase.from("brands").select("id,name,url,created_at").order("created_at", { ascending:true }),
        ]);
        const credits = creditsResponse.ok ? await creditsResponse.json() : null;
        if (!alive) return;
        setState({ loading:false, error:creditsResponse.ok ? null : "Credit usage is unavailable right now.", workspace:membership, brands:brandsResponse.data || [], credits });
      } catch (error) {
        if (alive) setState((current) => ({ ...current, loading:false, error:"Account data could not be loaded." }));
      }
    })();
    return () => { alive = false; };
  }, [membership?.id]);
  return state;
}

function SettingsPanelHeader({ title, description, action }) {
  return <header className="settings-panel__header"><div><h2>{title}</h2><p>{description}</p></div>{action}</header>;
}

function WorkspaceSettings({ data }) {
  const workspace = data.workspace;
  const name = workspace?.name || "Your workspace";
  const tier = data.credits?.tier || workspace?.tier || "00";
  const session = window.CI_AUTH?.getSession?.();
  return <div>
    <SettingsPanelHeader title="Workspace" description="The shared space that owns your brands, members, briefs, and credit balance." />
    <dl className="settings-facts">
      <div><dt>Workspace name</dt><dd>{name}</dd></div>
      <div><dt>Your access</dt><dd>{workspace?.role?.replaceAll("_", " ") || "Member"}</dd></div>
      <div><dt>Current tier</dt><dd>{TIER_LABELS[tier]} · Tier {tier}</dd></div>
      <div><dt>Account email</dt><dd>{session?.email || "—"}</dd></div>
    </dl>
    <p className="settings-note">Workspace identity is managed from the account owner profile. Brand names and people are managed in their own sections.</p>
  </div>;
}

function BrandsSettings({ data, go, canManage = true }) {
  const tier = data.credits?.tier || data.workspace?.tier || "00";
  const limit = BRAND_LIMITS[tier] ?? 1;
  const atLimit = limit !== Infinity && data.brands.length >= limit;
  return <div>
    <SettingsPanelHeader title="Brands" description="Every brand has its own BIO, briefs, library, and memory inside this workspace."
      action={canManage ? <button className="btn btn--primary btn--sm" onClick={() => go?.("discovery/new")} disabled={atLimit}>Add brand</button> : null} />
    <div className="settings-allowance"><strong>{data.brands.length}</strong><span>of {limit === Infinity ? "unlimited" : limit} brands used on {TIER_LABELS[tier]}</span></div>
    <div className="settings-list">
      {data.loading ? <div className="settings-empty">Loading brands…</div> : data.brands.length ? data.brands.map((brand) => <div className="settings-list__row" key={brand.id}>
        <span className="settings-brandmark" aria-hidden="true">{(brand.name || "B")[0].toUpperCase()}</span>
        <div><strong>{brand.name}</strong><small>{brand.url || "No source URL saved"}</small></div>
        <span className="pill">Brand</span>
      </div>) : <div className="settings-empty">No brands have been added yet.</div>}
    </div>
    {atLimit && <div className="settings-note">This tier’s brand allowance is full. Change plan to add another brand.</div>}
  </div>;
}

function BillingSettings({ data, go }) {
  const credits = data.credits;
  const tier = credits?.tier || data.workspace?.tier || "00";
  const monthly = Number(credits?.monthly || 0);
  const spent = Number(credits?.monthlyDebited || 0);
  const remaining = Number(credits?.balance || 0);
  const pct = monthly > 0 ? Math.min(100, Math.round((spent / monthly) * 100)) : 0;
  return <div>
    <SettingsPanelHeader title="Plan & billing" description="Your tier, monthly credit allowance, and the controls that change your plan."
      action={<button className="btn btn--primary btn--sm" onClick={() => go?.("upgrade")}>Change plan</button>} />
    {data.error && <div className="ops-alert">{data.error}</div>}
    <div className="settings-plan">
      <div><span>Current plan</span><strong>{TIER_LABELS[tier]}</strong><small>Tier {tier}</small></div>
      <div><span>Available now</span><strong>{remaining.toLocaleString()} cr</strong><small>Workspace balance</small></div>
      <div><span>Used this month</span><strong>{spent.toLocaleString()} cr</strong><small>{monthly > 0 ? `of ${monthly.toLocaleString()} included` : "Unlimited tier"}</small></div>
    </div>
    {monthly > 0 && <div className="settings-meter" aria-label={`${pct}% of monthly credits used`}><span style={{width:`${pct}%`}} /></div>}
    <div className="settings-note">Invoices and payment-method management will appear here when the billing portal is connected. No placeholder invoice data is shown.</div>
  </div>;
}

const USAGE_COLORS = { "Specialist work":"var(--yellow-500)", "Human craft":"var(--mint-500)", "Brand intelligence":"var(--purple-300)", "Other usage":"var(--neutral-400)", "Refunds":"var(--green-400)", "Credits added":"var(--blue-300)" };
function CreditUsageSettings({ data }) {
  const credits = data.credits;
  const categories = credits?.usage?.categories || [];
  const recent = credits?.usage?.recent || [];
  const positiveTotal = categories.reduce((sum, item) => sum + Math.max(0, Number(item.credits) || 0), 0);
  return <div>
    <SettingsPanelHeader title="Credit usage" description="See exactly where this workspace used credits during the current billing month." />
    {data.loading ? <div className="settings-empty">Loading credit activity…</div> : data.error ? <div className="ops-alert">{data.error}</div> : <>
      <div className="settings-usage-summary">
        <div><span>Available</span><strong>{Number(credits?.balance || 0).toLocaleString()} cr</strong></div>
        <div><span>Used this month</span><strong>{Number(credits?.monthlyDebited || 0).toLocaleString()} cr</strong></div>
      </div>
      <div className="settings-breakdown" aria-label="Credits used by category">
        {categories.filter((item) => Number(item.credits) > 0).map((item) => <div key={item.category}>
          <div><span><i style={{background:USAGE_COLORS[item.category]}} />{item.category}</span><strong>{Number(item.credits).toLocaleString()} cr</strong></div>
          <div className="settings-breakdown__bar"><span style={{width:`${positiveTotal ? Math.round((item.credits / positiveTotal) * 100) : 0}%`, background:USAGE_COLORS[item.category]}} /></div>
        </div>)}
        {!categories.length && <div className="settings-empty">No credits have been used this month.</div>}
      </div>
      <h3 className="settings-subheading">Recent credit activity</h3>
      <div className="settings-activity">
        {recent.length ? recent.map((entry) => <div className="settings-activity__row" key={entry.id}>
          <div><strong>{entry.description}</strong><small>{entry.brand ? `${entry.brand} · ` : ""}{new Date(entry.createdAt).toLocaleString()}</small></div>
          <span className={entry.credits > 0 ? "is-spent" : "is-added"}>{entry.credits > 0 ? "−" : "+"}{Math.abs(entry.credits).toLocaleString()} cr</span>
        </div>) : <div className="settings-empty">No ledger entries in this billing month.</div>}
      </div>
    </>}
  </div>;
}

function BrandRulesSettings({ go }) {
  return <div><SettingsPanelHeader title="Brand rules" description="Voice, positioning, constraints, and evidence are governed per brand—not as hidden workspace-wide form fields." />
    <div className="settings-callout"><div><strong>The BIO is the source of truth</strong><p>Open the active brand’s BIO to review and update the rules every specialist reads before working.</p></div><button className="btn btn--primary btn--sm" onClick={() => go?.("bio")}>Open BIO</button></div>
  </div>;
}

function ConnectionsSettings({ developer = false }) {
  const items = developer ? [{name:"API access",desc:"Programmatic access for approved Colony workspaces."},{name:"MCP connection",desc:"Connect CaastorOS to supported AI tools."}] : [
    {name:"Slack",desc:"Workspace notifications and approvals"},{name:"Klaviyo",desc:"Campaign handoff and sequence sync"},{name:"Stripo",desc:"Email build handoff"},{name:"Gamma",desc:"Presentation export"},
  ];
  return <div><SettingsPanelHeader title={developer ? "API & MCP" : "Integrations"} description={developer ? "Developer access and external tool connections." : "Services that can receive work or notifications from this workspace."} />
    <div className="settings-list">{items.map((item) => <div className="settings-list__row" key={item.name}><div><strong>{item.name}</strong><small>{item.desc}</small></div><span className="pill">Not configured</span></div>)}</div>
    <div className="settings-note">Connections are shown as unavailable until a real authorization flow is configured.</div>
  </div>;
}

function SecurityDataSettings() {
  return <div><SettingsPanelHeader title="Security & data" description="Workspace ownership, exports, and destructive actions live together here." />
    <div className="settings-security-row"><div><strong>Export workspace data</strong><p>Export will become available when the workspace archive endpoint is connected.</p></div><button className="btn btn--ghost" disabled>Export unavailable</button></div>
    <div className="settings-security-row settings-security-row--danger"><div><strong>Delete workspace</strong><p>Deletion remains unavailable here until owner verification and MFA are fully connected.</p></div><button className="btn btn--danger" disabled>Delete unavailable</button></div>
  </div>;
}

function PersonalAccountSettings({ session }) {
  const [name, setName] = useCState(session?.name || "");
  const [avatarUrl, setAvatarUrl] = useCState(session?.avatar || "");
  const [status, setStatus] = useCState("");
  const [saving, setSaving] = useCState(false);
  const initial = (name || session?.email || "A").trim().slice(0, 1).toUpperCase();

  useCEffect(() => { setName(session?.name || ""); setAvatarUrl(session?.avatar || ""); }, [session?.name, session?.avatar]);

  const saveName = async () => {
    setSaving(true); setStatus("");
    try {
      const response = await apiFetch("/api/me/profile", { method: "PATCH", body: JSON.stringify({ name }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save your name.");
      setName(result.name); setStatus("Name saved");
    } catch (error) { setStatus(error.message || "Could not save your name."); }
    finally { setSaving(false); }
  };

  const uploadAvatar = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setSaving(true); setStatus("");
    try {
      const form = new FormData(); form.append("avatar", file);
      const response = await apiFetch("/api/me/avatar", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not upload your avatar.");
      setAvatarUrl(result.avatarUrl); setStatus("Avatar updated");
    } catch (error) { setStatus(error.message || "Could not upload your avatar."); }
    finally { setSaving(false); }
  };

  return <div><SettingsPanelHeader title="Your profile" description="The identity people see when you collaborate in CaastorOS." />
    <section className="settings-profile" aria-label="Your profile details">
      <div className="settings-profile__avatar">
        {avatarUrl ? <img src={avatarUrl} alt="Your avatar" /> : <span aria-hidden="true">{initial}</span>}
        <div><strong>Profile photo</strong><small>JPG, PNG, or WebP. Up to 2 MB.</small><label className="btn btn--ghost btn--sm" htmlFor="personal-avatar">{avatarUrl ? "Replace photo" : "Upload photo"}</label><input id="personal-avatar" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar} disabled={saving} /></div>
      </div>
      <div className="settings-profile__field"><label htmlFor="personal-name">Name</label><div><input id="personal-name" value={name} maxLength="80" onChange={(event) => setName(event.target.value)} autoComplete="name" /><button className="btn btn--primary btn--sm" onClick={saveName} disabled={saving || name.trim().length < 2}>{saving ? "Saving…" : "Save"}</button></div></div>
      {status && <p className="settings-profile__status" role="status">{status}</p>}
    </section>
    <dl className="settings-facts"><div><dt>Email</dt><dd>{session?.email || "—"}</dd></div><div><dt>Role</dt><dd>{String(session?.persona || session?.role || "member").replaceAll("_", " ")}</dd></div><div><dt>Portal</dt><dd>{session?.portal || session?.role || "client"}</dd></div><div><dt>Account status</dt><dd>Active</dd></div></dl>
    <p className="settings-note">Email changes require verification and are kept out of this quick profile flow.</p>
  </div>;
}

function AssignedClientsSettings({ session }) {
  const assignments = session?.assignments || [];
  return <div><SettingsPanelHeader title="Assigned clients" description="The client workspaces currently included in your operational scope." />
    <div className="settings-list">{assignments.length ? assignments.map((workspace) => <div className="settings-list__row" key={workspace.id}><span className="settings-brandmark" aria-hidden="true">{(workspace.name || "W")[0].toUpperCase()}</span><div><strong>{workspace.name || "Client workspace"}</strong><small>Tier {workspace.tier || "—"} · assigned workspace</small></div><span className="pill">Active</span></div>) : <div className="settings-empty">No client workspaces are assigned.</div>}</div>
  </div>;
}

function SessionSettings({ session }) {
  return <div><SettingsPanelHeader title="Sessions" description="Your current authenticated session and security posture." />
    <dl className="settings-facts"><div><dt>Signed in as</dt><dd>{session?.email || "—"}</dd></div><div><dt>Assurance level</dt><dd>{String(session?.assuranceLevel || "aal1").toUpperCase()}</dd></div></dl>
    <p className="settings-note">Sensitive mutations can request stronger verification without blocking normal Account access.</p>
  </div>;
}

function SettingsView({ section = null, go = null, accountBase = "settings", onLogout = null, includeAdministration = false }) {
  const { t } = useLocale();
  const data = useAccountData();
  const session = window.useSession?.() || window.CI_AUTH?.getSession?.();
  const portal = session?.portal || session?.role;
  const persona = session?.persona || null;
  const permissions = new Set(session?.permissions || []);
  const teamAccount = portal === "team";
  const administration = [
    ["access","People & access","team"],
    ["specs","Agent specs","settings"],
    ["languages","Platform languages","settings"],
    ["brandolph","Brandolph memory","sparkles"],
    ...(portal === "super_admin" ? [["opex","Usage & OPEX","credit"]] : []),
  ];
  const groups = teamAccount ? [
    { label:"My account", items:[["profile","Profile","settings"],["assignments","Assigned clients","team"],...(persona === "creative_director" ? [["invite-designers","Invite designers","team"]] : [])] },
    { label:"Credits", items:[["usage",persona === "creative_director" ? "Team usage" : "Workspace usage","timer"]] },
    { label:"Preferences", items:[["notifications","Notifications","bell"],["language",t("settings.language.nav"),"settings"]] },
    { label:"Security", items:[["sessions","Sessions","check"]] },
  ] : [
    { label:"Account", items:[["profile","Your profile","settings"],["workspace","Workspace","settings"],...(permissions.has("workspace.members.manage") || includeAdministration ? [["members","Members","team"]] : []),["brands","Brands","files"]] },
    { label:"Billing & usage", items:[...(permissions.has("workspace.billing.manage") || includeAdministration ? [["billing","Plan & billing","credit"]] : []),["usage","Credit usage","timer"]] },
    { label:"Brand & product", items:[["rules","Brand rules","bio"],...(permissions.has("workspace.billing.manage") || includeAdministration ? [["integrations","Integrations","sparkles"]] : [])] },
    { label:"Preferences", items:[["notifications","Notifications","bell"],["language",t("settings.language.nav"),"settings"]] },
    ...(permissions.has("workspace.billing.manage") || includeAdministration ? [{ label:"Developer", items:[["api","API & MCP","code"]] }] : []),
    ...(permissions.has("workspace.delete") || includeAdministration ? [{ label:"Security & data", items:[["security","Export & deletion","check"]] }] : []),
    ...(includeAdministration && administration.length ? [{ label:"Administration", items:administration }] : []),
  ];
  const valid = new Set(groups.flatMap((group) => group.items.map(([id]) => id)));
  const defaultTab = teamAccount ? "profile" : "workspace";
  const [localTab, setLocalTab] = useCState(valid.has(section) ? section : defaultTab);
  const [query, setQuery] = useCState("");
  const tab = valid.has(section) ? section : localTab;
  const open = (id) => { setLocalTab(id); if (go) go(`${accountBase}/${id}`); };
  const accountItems = groups.flatMap((group) => group.items.map((item) => ({ item, group:group.label })));
  const normalizedQuery = query.trim().toLowerCase();
  const visibleItems = normalizedQuery
    ? accountItems.filter(({ item:[,label], group }) => `${label} ${group}`.toLowerCase().includes(normalizedQuery))
    : accountItems;
  const closeAccount = () => go?.(teamAccount ? "team-review" : "home");

  let content = tab === "workspace" ? <WorkspaceSettings data={data} />
    : tab === "members" ? React.createElement(window.WorkspaceMembers)
    : tab === "brands" ? <BrandsSettings data={data} go={go} canManage={permissions.has("brand.manage") || includeAdministration} />
    : tab === "billing" ? <BillingSettings data={data} go={go} />
    : tab === "usage" ? <CreditUsageSettings data={data} />
    : tab === "rules" ? <BrandRulesSettings go={go} />
    : tab === "integrations" ? <ConnectionsSettings />
    : tab === "notifications" ? <><SettingsPanelHeader title="Notifications" description="Choose how CaastorOS contacts you about work and approvals." /><NotificationPrefs /></>
    : tab === "language" ? <><SettingsPanelHeader title={t("settings.language.title")} description={t("settings.language.desc")} /><LanguagePrefs /></>
    : tab === "api" ? <ConnectionsSettings developer />
    : tab === "access" ? React.createElement(window.AdminAccess)
    : tab === "specs" ? React.createElement(window.AdminSpecs)
    : tab === "languages" ? React.createElement(window.AdminLanguages)
    : tab === "brandolph" ? React.createElement(window.AdminBrandolphMemory)
    : tab === "opex" ? React.createElement(window.AdminOpex)
    : tab === "profile" ? <PersonalAccountSettings session={session} />
    : tab === "assignments" ? <AssignedClientsSettings session={session} />
    : tab === "invite-designers" ? React.createElement(window.DesignerInvites)
    : tab === "sessions" ? <SessionSettings session={session} />
    : <SecurityDataSettings />;

  return <div className="settings-page">
    <div className="settings-dialog" role="region" aria-label={teamAccount ? "My account settings" : "Workspace account settings"}>
      <aside className="settings-dialog__sidebar">
        <button type="button" className="settings-dialog__close" onClick={closeAccount} aria-label="Close account settings"><Icon name="close" size={20}/></button>
        <label className="settings-search">
          <Icon name="search" size={16}/>
          <span className="sr-only">Search account settings</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search settings" autoComplete="off" />
        </label>
        <nav className="settings-nav" aria-label="Account settings">
          <div className="settings-nav__items">
            {visibleItems.map(({ item:[id,label,icon], group }, index) => <React.Fragment key={id}>
              {group === "Administration" && visibleItems[index - 1]?.group !== group && <div className="settings-nav__divider">Administration</div>}
              <button className={tab === id ? "is-active" : ""} aria-current={tab === id ? "page" : undefined} onClick={() => open(id)} title={group}><Icon name={icon} size={18}/><span>{label}</span></button>
            </React.Fragment>)}
            {!visibleItems.length && <div className="settings-nav__empty">No settings match “{query}”.</div>}
          </div>
          {onLogout && <div className="settings-nav__session"><button type="button" className="settings-nav__logout" onClick={onLogout} aria-label={t("common.logOut")}><Icon name="arrowLeft" size={18}/><span>{t("common.logOut")}</span></button></div>}
        </nav>
      </aside>
      <section className="settings-panel" aria-live="polite">{content}</section>
    </div>
  </div>;
}

Object.assign(window, { CraftMarketplace, CreditsLedger, SettingsView });
