// ─────────────────────────────────────────────────────────────────────
// CAA-33 · Gated teardown report — pure server-rendered HTML (no build step).
//
// The scorecard (score + section bars + gaps) is always visible: it's the
// teaser. The full BIO is withheld until the visitor gives an email (the gate,
// which writes the PQL + funnel event). Post-claim the page shows the full BIO,
// a "Download your BIO" link, and the pilot CTA.
//
// Polished marketing landing is CAA-13/19's job — this is the honest 0a surface
// Growth can point paid traffic at to validate the wedge.
// ─────────────────────────────────────────────────────────────────────

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const BAND_COLOR = { strong: "#1f9d55", partial: "#d9822b", thin: "#c0392b" };

function bar(section) {
  const color = BAND_COLOR[section.band] || "#888";
  return `<div class="row">
    <div class="row-h"><span>${esc(section.label)}</span><b>${section.score}</b></div>
    <div class="track"><div class="fill" style="width:${section.score}%;background:${color}"></div></div>
    <div class="meta">${section.covered}/${section.total} fields${section.missingFields.length ? ` · gaps: ${esc(section.missingFields.join(", "))}` : ""}</div>
  </div>`;
}

function gapsList(gaps) {
  if (!gaps.length) return `<p class="muted">No material gaps — this brand communicates itself clearly.</p>`;
  return `<ul class="gaps">${gaps.slice(0, 8).map((g) => `<li><b>${esc(g.section)}</b> — ${esc(g.why)}</li>`).join("")}</ul>`;
}

function bioField(label, value) {
  if (value == null || (Array.isArray(value) && value.length === 0) || String(value).trim() === "") return "";
  const body = Array.isArray(value) ? `<ul>${value.map((v) => `<li>${esc(v)}</li>`).join("")}</ul>` : `<p>${esc(value)}</p>`;
  return `<div class="bf"><h4>${esc(label)}</h4>${body}</div>`;
}

function fullBio(p = {}) {
  const id = p.identity || {}, au = p.audience || {}, vo = p.voice || {}, go = p.goals || {}, st = p.strategic || {};
  return `<div class="bio">
    <h3>Identity</h3>${bioField("Positioning", id.positioning)}${bioField("Category", id.category)}${bioField("Founded", id.founded)}${bioField("Pillars", id.pillars)}
    <h3>Audience</h3>${bioField("Primary", au.primary)}${bioField("Secondary", au.secondary)}${bioField("Jobs to be done", au.jtbd)}
    <h3>Voice</h3>${bioField("Register", vo.register)}${bioField("Forbidden words", vo.forbidden)}${bioField("Signatures", vo.signatures)}
    <h3>Goals</h3>${bioField("North star", go.northStar)}${bioField("Near-term", go.q2)}
    <h3>Strategic tensions</h3>${bioField("Watchouts", st.watchouts)}${bioField("Is NOT", st.notList)}
  </div>`;
}

/**
 * @param {object} args
 * @param {string} args.brand
 * @param {string} args.url
 * @param {object} args.scorecard  - teardownScorecard(payload)
 * @param {object} args.offer      - getOffer()
 * @param {boolean} args.claimed
 * @param {object} [args.bioPayload] - only rendered when claimed
 * @param {string} args.leadId
 * @param {string} [args.apiBase]  - e.g. "" (same origin)
 */
export function renderReport({ brand, url, scorecard, offer, claimed, bioPayload, leadId, apiBase = "" }) {
  const sc = scorecard;
  const gate = claimed
    ? `<section class="card unlocked">
         <h2>Full Brand Intelligence Object</h2>
         ${fullBio(bioPayload)}
         <a class="btn" href="${esc(apiBase)}/api/teardown/${esc(leadId)}/bio.json" download>⬇ Download your BIO (JSON)</a>
       </section>
       <section class="card pilot">
         <h2>${esc(offer.pilotHeading)}</h2>
         <p>${esc(offer.pilotBody)}</p>
         <a class="btn primary" href="${esc(offer.pilotCtaUrl)}" onclick="track('teardown_pilot_cta_clicked')">${esc(offer.pilotCtaLabel)}</a>
       </section>`
    : `<section class="card gate">
         <h2>${esc(offer.gateHeading)}</h2>
         <p>${esc(offer.gateSub)}</p>
         <form onsubmit="return claim(event)">
           <input id="email" type="email" required placeholder="you@company.com" autocomplete="email"/>
           <button class="btn primary" type="submit">${esc(offer.gateCta)}</button>
           <div id="err" class="err"></div>
         </form>
       </section>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(offer.reportTitle(brand))}</title>
<style>
  :root{--ink:#14110f;--mut:#6b625b;--line:#e7e1da;--bg:#faf8f5;--accent:#14110f}
  *{box-sizing:border-box}body{margin:0;font:16px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:var(--bg)}
  .wrap{max-width:720px;margin:0 auto;padding:40px 20px 80px}
  .kicker{text-transform:uppercase;letter-spacing:.12em;font-size:12px;color:var(--mut)}
  h1{font-size:30px;margin:6px 0 2px}h2{font-size:20px;margin:0 0 12px}h3{font-size:15px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);margin:22px 0 8px}h4{margin:12px 0 2px;font-size:14px}
  .src{color:var(--mut);font-size:14px;word-break:break-all}
  .card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:22px;margin:18px 0}
  .score-hero{display:flex;align-items:center;gap:20px}
  .ring{--v:0;width:110px;height:110px;border-radius:50%;flex:0 0 auto;display:grid;place-items:center;
        background:conic-gradient(var(--accent) calc(var(--v)*1%),#eee 0)}
  .ring b{background:#fff;width:84px;height:84px;border-radius:50%;display:grid;place-items:center;font-size:30px}
  .headline{font-size:16px;color:var(--ink)}
  .row{margin:14px 0}.row-h{display:flex;justify-content:space-between;font-size:14px}
  .track{height:8px;background:#eee;border-radius:6px;overflow:hidden;margin:5px 0}.fill{height:100%}
  .meta{font-size:12px;color:var(--mut)}
  .gaps{margin:8px 0 0;padding-left:18px}.gaps li{margin:5px 0;font-size:14px}
  .muted{color:var(--mut)}
  .btn{display:inline-block;margin-top:14px;padding:11px 18px;border-radius:10px;border:1px solid var(--ink);background:#fff;color:var(--ink);font-weight:600;text-decoration:none;cursor:pointer;font-size:15px}
  .btn.primary{background:var(--ink);color:#fff}
  input{width:100%;max-width:340px;padding:11px 12px;border:1px solid var(--line);border-radius:10px;font-size:15px;margin-right:8px}
  .bf ul{margin:4px 0;padding-left:18px}.bf p{margin:4px 0}
  .err{color:#c0392b;font-size:13px;margin-top:8px}
  footer{color:var(--mut);font-size:12px;margin-top:30px}
</style></head>
<body><div class="wrap">
  <div class="kicker">${esc(offer.reportKicker)}</div>
  <h1>${esc(brand)}</h1>
  <div class="src">${esc(url)}</div>

  <section class="card">
    <div class="score-hero">
      <div class="ring" style="--v:${sc.overall}"><b>${sc.overall}</b></div>
      <div>
        <div class="kicker">Brand Intelligence Score</div>
        <div class="headline">${esc(sc.headline)}</div>
        <div class="meta" style="margin-top:6px">${sc.gapCount} gap${sc.gapCount === 1 ? "" : "s"} · ${sc.sourceCount} source${sc.sourceCount === 1 ? "" : "s"} read</div>
      </div>
    </div>
    <div style="margin-top:18px">${sc.sections.map(bar).join("")}</div>
    <h3>Where your brand leaks signal</h3>
    ${gapsList(sc.gaps)}
  </section>

  ${gate}
  <footer>Generated by Caastor · scorecard is a view over the compiled BIO · a Steward can certify it.</footer>
</div>
<script>
  var API=${JSON.stringify(apiBase)}, LEAD=${JSON.stringify(leadId)};
  function track(name){try{navigator.sendBeacon(API+"/api/teardown/"+LEAD+"/event",new Blob([JSON.stringify({name:name})],{type:"application/json"}))}catch(e){}}
  async function claim(e){
    e.preventDefault();
    var email=document.getElementById('email').value.trim();
    var err=document.getElementById('err'); err.textContent='';
    try{
      var r=await fetch(API+"/api/teardown/"+LEAD+"/claim",{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email})});
      if(!r.ok){var j=await r.json().catch(function(){return{}});err.textContent=j.error||'Something went wrong.';return false;}
      location.reload();
    }catch(x){err.textContent='Network error — try again.';}
    return false;
  }
</script>
</body></html>`;
}
