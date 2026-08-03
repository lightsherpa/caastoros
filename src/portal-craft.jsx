import React from "react";
import { apiFetch } from "./lib/supabase-browser.js";
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
          { title:"Maker's essay · finishing pass",     who:"Lia R.",    state:"review",      eta:"awaiting your approval", cr:120 },
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
        <textarea className="input" rows={4} defaultValue="Take this through to print-ready. Tone is calm conviction — see BIO voice. The image direction is craft-led, low-light interiors, no top-down flat-lay clichés. Final files in PDF + EPS." />
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

function SettingsView() {
  const [tab, setTab] = useCState("workspace");
  return (
    <div style={{padding:"24px 36px 60px"}}>
      <PageHeader eyebrow="Workspace governance" title="Settings" sub="Workspace, billing, members, BIO governance. The rules that hold across every brief, every specialist." />

      <div style={{display:"grid", gridTemplateColumns:"220px 1fr", gap: 32}}>
        <nav style={{display:"flex", flexDirection:"column", gap: 2, position:"sticky", top: 0, alignSelf:"start"}}>
          {[
            ["workspace","Workspace"],
            ["members","Members"],
            ["brands","Brands (Tier 03)"],
            ["billing","Tier & billing"],
            ["bio","BIO governance"],
            ["integrations","Integrations"],
            ["notifications","Notifications"],
            ["api","API & MCP (Tier 03)"],
            ["danger","Danger"],
          ].map(([k, l]) => (
            <button key={k} className={"navitem" + (tab === k ? " navitem--active" : "")} onClick={() => setTab(k)} style={{border:"none", background: undefined, textAlign:"left", width:"100%"}}>
              {l}
            </button>
          ))}
        </nav>

        <section className="card" style={{padding: 28}}>
          {tab === "notifications" && <NotificationPrefs />}
          {tab === "workspace" && (
            <div style={{display:"flex", flexDirection:"column", gap: 18, maxWidth: 480}}>
              <h3 style={{margin: 0}}>Workspace</h3>
              <div><label style={{display:"block", fontSize:12, fontWeight:500, marginBottom: 6}}>Name</label><input className="input" defaultValue="Loam Studio" /></div>
              <div><label style={{display:"block", fontSize:12, fontWeight:500, marginBottom: 6}}>Time zone</label><input className="input" defaultValue="Europe/Madrid" /></div>
              <div><label style={{display:"block", fontSize:12, fontWeight:500, marginBottom: 6}}>Workspace logo</label>
                <div style={{display:"flex", gap: 12, alignItems:"center"}}>
                  <div style={{width:56, height:56, borderRadius: 10, background:"var(--neutral-900)", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"var(--font-mono)", fontWeight:600, fontSize:24}}>L</div>
                  <button className="btn btn--ghost">Upload</button>
                  <button className="btn btn--link" style={{fontSize: 12, color:"var(--c-faint)"}}>Remove</button>
                </div>
              </div>
              <button className="btn btn--primary" style={{alignSelf:"flex-start"}}>Save changes →</button>
            </div>
          )}
          {tab === "members" && (
            <div>
              <h3 style={{margin: 0, marginBottom: 18}}>Members · 3</h3>
              <div style={{display:"flex", flexDirection:"column", gap: 8}}>
                {[
                  { name:"Marina Reyes", email:"marina@loam.studio", role:"Owner", p:"caastor/assets/profile-3.jpg" },
                  { name:"Aleix Roca",   email:"aleix@loam.studio", role:"Member", p:"caastor/assets/profile-2.jpg" },
                  { name:"Júlia Bonet",  email:"julia@loam.studio", role:"Viewer", p:"caastor/assets/profile-4.jpg" },
                ].map((m, i) => (
                  <div key={i} style={{display:"flex", alignItems:"center", gap: 12, padding: 12, border:"1px solid var(--c-line)", borderRadius: 10}}>
                    <img src={m.p} alt="" style={{width: 36, height: 36, borderRadius:"50%", objectFit:"cover"}} />
                    <div style={{flex:1}}>
                      <div style={{fontSize: 14, fontWeight: 500}}>{m.name}</div>
                      <div style={{fontSize: 12, color:"var(--c-faint)"}}>{m.email}</div>
                    </div>
                    <select className="input" style={{width: 110, height: 32, fontSize: 12}} defaultValue={m.role}><option>Owner</option><option>Member</option><option>Viewer</option></select>
                    <button className="btn btn--icon btn--ghost" aria-label="Remove"><Icon name="close" size={13} /></button>
                  </div>
                ))}
              </div>
              <button className="btn btn--primary" style={{marginTop: 18}}>Invite member <Icon name="plus" size={13} /></button>
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
          {tab === "integrations" && (
            <div>
              <h3 style={{margin: 0, marginBottom: 18}}>Integrations</h3>
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap: 12}}>
                {[
                  { name:"Slack", desc:"Brandolph posts updates to a channel", on:true },
                  { name:"Stripo", desc:"Email build handoff", on:true },
                  { name:"Klaviyo", desc:"Sequence + flow sync", on:true },
                  { name:"Gamma", desc:"Deck export", on:false },
                  { name:"v0", desc:"Page composer handoff", on:false },
                  { name:"Framer", desc:"Marketing site builder", on:false },
                ].map((i, k) => (
                  <div key={k} className="card card--inset" style={{padding: 14, display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                    <div>
                      <div style={{fontSize: 14, fontWeight: 500}}>{i.name}</div>
                      <div style={{fontSize: 12, color:"var(--c-faint)"}}>{i.desc}</div>
                    </div>
                    <span className={"pill " + (i.on ? "pill--green" : "")}>{i.on ? "Connected" : "Connect"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {tab === "billing" && (
            <div style={{display:"flex", flexDirection:"column", gap: 18}}>
              <h3 style={{margin: 0}}>Tier & billing</h3>
              <div className="card card--inset" style={{padding: 22, background:"var(--yellow-50)", border:"1px solid var(--yellow-200)"}}>
                <div className="eyebrow eyebrow--yellow" style={{marginBottom: 6}}>Current plan</div>
                <div style={{fontSize: 22, fontWeight: 600, marginBottom: 6}}>Tier 02 · The River 🌊</div>
                <div style={{fontSize: 14, color:"var(--c-dim)"}}>900 cr / month · €399 · billed monthly · next renewal 4 Jun</div>
                <div style={{marginTop: 14, display:"flex", gap: 8}}>
                  <button className="btn btn--ghost btn--sm">Change plan</button>
                  <button className="btn btn--link" style={{fontSize: 12, color:"var(--c-faint)"}}>Downgrade →</button>
                </div>
              </div>
            </div>
          )}
          {(tab === "brands" || tab === "api") && (
            <div style={{padding: 40, textAlign:"center"}}>
              <BrandolphAvatar size={56} />
              <h3 style={{marginTop: 16}}>Tier 03 · The Colony 🐜</h3>
              <p style={{color:"var(--c-dim)", fontSize: 14, maxWidth: 380, margin:"8px auto 18px"}}>
                <em className="b-voice" style={{background:"none", fontStyle:"italic"}}>This panel lives in The Colony 🐜.</em> Multi-brand workspaces, API + MCP tokens, and webhook config.
              </p>
              <button className="btn btn--primary">See The Colony 🐜 plan</button>
            </div>
          )}
          {tab === "danger" && (
            <div style={{display:"flex", flexDirection:"column", gap: 14, maxWidth: 480}}>
              <h3 style={{margin: 0, color:"var(--pink-500)"}}>Danger</h3>
              <p style={{fontSize: 13, color:"var(--c-dim)", margin: 0, lineHeight: 1.5}}>Export your BIO + all data, or delete the workspace. Both irreversible.</p>
              <button className="btn btn--ghost" style={{alignSelf:"flex-start"}}>Export BIO + data</button>
              <button className="btn btn--danger" style={{alignSelf:"flex-start"}}>Delete workspace</button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

Object.assign(window, { CraftMarketplace, CreditsLedger, SettingsView });
