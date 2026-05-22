/* Caastor Intelligence — mock data shared across all screens. */
/* Loaded as a regular script so all globals attach to window.       */

window.CI_BRAND = {
  id: "vinilo",
  name: "Vinilo",
  tagline: "Specialty coffee for slow Tuesdays.",
  website: "vinilo.coffee",
  bioCompleteness: 91,
  bioLastUpdated: "Updated 14 May — 09:42",
  tier: "Tier 02 — Brandolph",
};

window.CI_USER = {
  name: "Marina Reyes",
  role: "Founder",
  email: "marina@vinilo.coffee",
  avatar: "intelligence/assets/profile-3.jpg",
};

window.CI_CREDITS = {
  balance: 563,
  monthly: 900,
  resetsInDays: 14,
  split: [
    { kind: "AI work",     credits: 234, pct: 41, color: "var(--yellow-500)" },
    { kind: "Human craft", credits: 188, pct: 33, color: "var(--mint-500)"  },
    { kind: "QA / utility", credits: 46,  pct: 8,  color: "var(--purple-300)" },
    { kind: "Refunds",     credits: -25, pct: 0,  color: "var(--green-300)" },
  ],
};

/* AI models referenced by agents ---------------------------------- */
window.CI_MODELS = {
  opus:        { label: "Opus 4.1",        color: "var(--model-opus)"        },
  sonnet:      { label: "Sonnet 4.6",      color: "var(--model-sonnet)"      },
  haiku:       { label: "Haiku 4.5",       color: "var(--model-haiku)"       },
  gpt5:        { label: "GPT-5",           color: "var(--model-gpt5)"        },
  gptimage:    { label: "GPT-Image",       color: "var(--model-gptimage)"    },
  gemPro:      { label: "Gemini Pro",      color: "var(--model-gem-pro)"     },
  gemFlash:    { label: "Gemini Flash",    color: "var(--model-gem-flash)"   },
  flux:        { label: "Flux 2",          color: "var(--model-flux)"        },
  recraft:     { label: "Recraft",         color: "var(--model-recraft)"     },
  exa:         { label: "Exa",             color: "var(--model-exa)"         },
  elevenlabs:  { label: "ElevenLabs",      color: "var(--model-elevenlabs)"  },
  v0:          { label: "v0",              color: "var(--model-v0)"          },
  gamma:       { label: "Gamma",           color: "var(--model-gamma)"       },
  framer:      { label: "Framer",          color: "var(--model-framer)"      },
};

/* 33 senior agents (L2) — 6 departments.
   Each agent: id, code (mono "L2-NN"), name, dept, job, model, credit, status. */
window.CI_AGENTS = [
  // CMO Suite (5)
  { id:"a01", code:"L2-01", dept:"CMO Suite", name:"The Diagnostician", job:"Reads the brand right now. Names tensions before assembly.", model:"opus",     cr:8,  status:"live" },
  { id:"a02", code:"L2-02", dept:"CMO Suite", name:"The Sharpener",      job:"Turns vague briefs into single-minded propositions.",        model:"sonnet",   cr:5,  status:"live" },
  { id:"a03", code:"L2-03", dept:"CMO Suite", name:"The Strategist",     job:"Comms plan, channel rationale, sequencing.",                  model:"sonnet",   cr:6,  status:"live" },
  { id:"a04", code:"L2-04", dept:"CMO Suite", name:"The Tension-Finder", job:"Surfaces the contradictions a CMO would want named.",         model:"opus",     cr:8,  status:"live" },
  { id:"a05", code:"L2-05", dept:"CMO Suite", name:"The Refuser",        job:"Says no with reasons. Owns the 'what we are not doing'.",     model:"sonnet",   cr:4,  status:"live" },

  // Concept (6)
  { id:"a06", code:"L2-06", dept:"Concept", name:"The Territory Mapper", job:"Three creative territories per brief.",                       model:"sonnet",   cr:6,  status:"live" },
  { id:"a07", code:"L2-07", dept:"Concept", name:"The Namer",            job:"Names for products, lines, campaigns — with rationale.",      model:"opus",     cr:7,  status:"live" },
  { id:"a08", code:"L2-08", dept:"Concept", name:"The Metaphor Smith",   job:"Founds territories on metaphor, not adjective lists.",        model:"opus",     cr:7,  status:"soon" },
  { id:"a09", code:"L2-09", dept:"Concept", name:"The Pull-Quote",       job:"Editorial pull quotes. The line that ends up on the wall.",   model:"sonnet",   cr:4,  status:"live" },
  { id:"a10", code:"L2-10", dept:"Concept", name:"The Reframer",         job:"Takes a tired concept and gives it a new spine.",              model:"opus",     cr:6,  status:"soon" },
  { id:"a11", code:"L2-11", dept:"Concept", name:"The Anti-Brief",       job:"Writes the brief you should refuse to do. Useful sanity.",     model:"opus",     cr:5,  status:"soon" },

  // Copy (7)
  { id:"a12", code:"L2-12", dept:"Copy", name:"Conversion Copy",     job:"Landing, pricing, hero work that has to move a number.",   model:"gpt5",     cr:12, status:"live" },
  { id:"a13", code:"L2-13", dept:"Copy", name:"Email Sequence",       job:"Onboarding, lifecycle, retention sequences.",              model:"sonnet",   cr:12, status:"live" },
  { id:"a14", code:"L2-14", dept:"Copy", name:"Subject Lines",        job:"Subjects, previews, A/B variants by intent.",              model:"gemFlash", cr:2,  status:"live" },
  { id:"a15", code:"L2-15", dept:"Copy", name:"Long-form Editor",     job:"Essays, manifestos, foundational doc copy.",               model:"opus",     cr:14, status:"live" },
  { id:"a16", code:"L2-16", dept:"Copy", name:"Social Captions",      job:"Captions that hold voice across platforms.",               model:"sonnet",   cr:3,  status:"live" },
  { id:"a17", code:"L2-17", dept:"Copy", name:"Microcopy & UX",       job:"Form labels, error states, onboarding micro.",             model:"haiku",    cr:2,  status:"live" },
  { id:"a18", code:"L2-18", dept:"Copy", name:"Voice QA",             job:"Reads finished copy against the BIO. Flags drift.",        model:"haiku",    cr:2,  status:"live" },

  // Design (6)
  { id:"a19", code:"L2-19", dept:"Design", name:"Identity Drafts",    job:"Logo + system first cuts. Hand off to L3 for craft.",      model:"recraft",  cr:18, status:"live" },
  { id:"a20", code:"L2-20", dept:"Design", name:"Hero KV",            job:"Hero visuals for campaigns and launches.",                 model:"flux",     cr:14, status:"live" },
  { id:"a21", code:"L2-21", dept:"Design", name:"Editorial Image",    job:"Image-led storytelling. In-feed + content.",               model:"gptimage", cr:10, status:"live" },
  { id:"a22", code:"L2-22", dept:"Design", name:"Pack & Packaging",   job:"Pack architecture, dielines, label layouts.",              model:"flux",     cr:18, status:"soon" },
  { id:"a23", code:"L2-23", dept:"Design", name:"Iconography",        job:"Custom icons consistent with the visual identity.",        model:"recraft",  cr:6,  status:"soon" },
  { id:"a24", code:"L2-24", dept:"Design", name:"Brand Consistency QA",job:"Checks visual outputs against BIO + asset rules.",        model:"haiku",    cr:2,  status:"live" },

  // Web & Email (5)
  { id:"a25", code:"L2-25", dept:"Web & Email", name:"Page Composer", job:"Landing + product pages, structured for v0/Framer.",       model:"v0",       cr:16, status:"live" },
  { id:"a26", code:"L2-26", dept:"Web & Email", name:"Email Build",   job:"Email HTML w/ Klaviyo + Customer.io conventions.",         model:"v0",       cr:10, status:"live" },
  { id:"a27", code:"L2-27", dept:"Web & Email", name:"Deck Build",    job:"Deck output via Gamma — for sales + investor work.",       model:"gamma",    cr:12, status:"live" },
  { id:"a28", code:"L2-28", dept:"Web & Email", name:"Motion Brief",  job:"Briefs for video/animation. Hands off to ElevenLabs + L3.",model:"elevenlabs",cr:8, status:"soon" },
  { id:"a29", code:"L2-29", dept:"Web & Email", name:"Framer Builder",job:"Framer-native sites for marketing surfaces.",              model:"framer",   cr:14, status:"soon" },

  // AI Discovery & Ops (4)
  { id:"a30", code:"L2-30", dept:"AI Discovery & Ops", name:"BIO Compiler",  job:"Compiles the Brand Intelligence Object from intake.",  model:"opus",     cr:10, status:"live" },
  { id:"a31", code:"L2-31", dept:"AI Discovery & Ops", name:"Site Scanner",   job:"Scrapes + scores brand surfaces. Powers extraction.",   model:"exa",      cr:3,  status:"live" },
  { id:"a32", code:"L2-32", dept:"AI Discovery & Ops", name:"Competitor Map", job:"Maps the category. Names the table around the brand.",  model:"exa",      cr:4,  status:"live" },
  { id:"a33", code:"L2-33", dept:"AI Discovery & Ops", name:"Audit & Ledger", job:"Reconciles spend, flags variance, writes invoices.",    model:"haiku",    cr:1,  status:"live" },
];

window.CI_DEPTS = ["CMO Suite","Concept","Copy","Design","Web & Email","AI Discovery & Ops"];

/* Department accent colors — used on agent cards / canvas / brief dots
   on the CLIENT side, in place of the (internal-only) model colors.   */
window.CI_DEPT_COLORS = {
  "CMO Suite":               "var(--yellow-600)",
  "Concept":                 "var(--purple-500)",
  "Copy":                    "var(--green-600)",
  "Design":                  "var(--pink-500)",
  "Web & Email":             "var(--blue-600)",
  "AI Discovery & Ops":      "var(--orange-600)",
};

/* Department-level metadata — capabilities, typical turnaround, and the
   subscription tier each department unlocks from. Specialists inherit
   this for the directory (capability chips, "best for", tier, SLA)
   without bloating all 33 records; per-specialist `job` is the blurb. */
window.CI_DEPT_META = {
  "CMO Suite":          { capabilities:["Brief sharpening","Positioning","Refusals","Audience read"], bestFor:"Shaping the request before any work runs", turnaround:"instant", tierFrom:"02" },
  "Concept":            { capabilities:["Territories","Naming","Big idea","Campaign lines"],          bestFor:"Finding the angle a campaign hangs on",   turnaround:"~3 min",  tierFrom:"01" },
  "Copy":               { capabilities:["Long-form","Conversion","Email","Subject lines"],            bestFor:"Words that carry the voice and convert",  turnaround:"~2 min",  tierFrom:"00" },
  "Design":             { capabilities:["Key visuals","Layout","Identity","Image gen"],               bestFor:"Turning a concept into something you can see", turnaround:"~5 min", tierFrom:"01" },
  "Web & Email":        { capabilities:["Landing pages","Email build","Sequences","Components"],       bestFor:"Shipping the page or the send, built",    turnaround:"~4 min",  tierFrom:"01" },
  "AI Discovery & Ops": { capabilities:["Research","SEO / AEO","Brand QA","Model routing"],            bestFor:"Finding signal and keeping work on-brand", turnaround:"~2 min", tierFrom:"00" },
};

/* Subscription tier labels (for "unlocks from" copy). */
window.CI_TIERS = { "00":"Free", "01":"Studio", "02":"Brandolph", "03":"Suite" };

/* ── Specialist prompting (Phase A) ───────────────────────────────── */
/* Brand-global refusal rules. Every specialist inherits these; the QA
   specialist gates outputs against them. Sourced from the BIO + the
   patterns the QA output already checks. */
window.CI_BRAND_REFUSALS = [
  "Never use the words “unlock”, “limited”, or “exclusive” — they cheapen the brand.",
  "Respect the 11.4× annual pricing formula; never invent a discount.",
  "Reference provenance (origin, grower) only where the BIO marks it mandatory — once, never as decoration.",
  "Refuse anything that contradicts the BIO; flag the conflict instead of complying.",
  "Keep voice-drift ≤ 0.20 against the brand voice — no hype, no manufactured urgency.",
];

/* Per-department prompt spec templates. A specialist's runnable spec is
   its department template, specialised by its name/job. (Per-specialist
   overrides can live in CI_SPECIALIST_SPECS, keyed by id.) */
window.CI_DEPT_SPECS = {
  "CMO Suite": {
    role: "a senior brand operator who reads the brand before it writes",
    objective: "Sharpen the request into a brief a CMO would approve — naming the real tension and the refusals before any production runs.",
    method: ["Read the BIO end to end", "Name the tension behind the request", "Propose the smallest crew that earns the brief", "Surface what NOT to do"],
    outputContract: "A sharpened brief: objective · audience · the one idea · explicit refusals. ≤ 250 words.",
    voice: "Plain, senior, opinionated. Italic + yellow for the one line that matters.",
    tools: ["judgment only"],
    refusals: ["Won’t assemble a crew before the brief is sharp."],
  },
  "Concept": {
    role: "a concept lead who finds the angle a campaign hangs on",
    objective: "Produce 2–3 distinct territories, recommend one, and say why it ladders to the BIO positioning.",
    method: ["Read positioning + audience from the BIO", "Generate distinct territories", "Pressure-test each against positioning", "Recommend one with rationale"],
    outputContract: "2–3 named territories, one recommended, ≤ 60 words each.",
    voice: "Editorial, declarative. No mood-board fluff.",
    tools: ["judgment only"],
    refusals: ["Won’t ship a territory that contradicts the positioning."],
  },
  "Copy": {
    role: "a conversion copywriter who carries the brand voice",
    objective: "Write copy that converts without breaking voice — every line earns its place.",
    method: ["Load voice + forbidden-words list from the BIO", "Draft to the output contract", "Self-edit for voice drift", "Cut anything that hedges"],
    outputContract: "Copy in the requested format, within length, voice-checked.",
    voice: "The brand voice, narrowed to the format. Conviction over cleverness.",
    tools: ["judgment only"],
    refusals: ["Won’t use forbidden words.", "Won’t write fake urgency."],
  },
  "Design": {
    role: "a designer who turns a concept into something you can see",
    objective: "Produce on-brand visual artefacts a CMO would approve without a second pass.",
    method: ["Load palette + type + imagery rules from the BIO", "Compose to the brief", "Run a brand-consistency check", "Export with crops + ratios"],
    outputContract: "Visual artefact(s) with specs — on-brand, print/web-ready.",
    voice: "Restraint. The brand’s visual system, never decoration.",
    tools: ["image generation", "layout"],
    refusals: ["Won’t introduce off-system colour or type."],
  },
  "Web & Email": {
    role: "a builder who ships the page or the send",
    objective: "Build the landing page / email / sequence — on-brand and ready to ship.",
    method: ["Load voice + components from the BIO", "Build to the brief", "QA links + responsiveness", "Hand off build-ready"],
    outputContract: "Built page / email / sequence: components + copy, ship-ready.",
    voice: "Functional, on-voice. Clarity first.",
    tools: ["component build"],
    refusals: ["Won’t ship without a brand-QA pass."],
  },
  "AI Discovery & Ops": {
    role: "a research + QA specialist who keeps the work on-brand",
    objective: "Find signal (research / SEO / AEO) or run the brand-consistency gate on an output.",
    method: ["Define the question or the gate", "Search / inspect", "Score against BIO rules", "Return findings or a pass/fail with reasons"],
    outputContract: "A research brief OR a QA verdict naming the specific rules checked.",
    voice: "Precise, evidence-led. No hand-waving.",
    tools: ["Exa search", "brand-QA"],
    refusals: ["Won’t pass an output that breaks a refusal rule."],
  },
};

/* Per-specialist spec overrides (optional; merged over the dept template). */
window.CI_SPECIALIST_SPECS = {};

/* Briefs ------------------------------------------------------------ */
window.CI_BRIEFS = [
  {
    id: "b-pricing-relaunch",
    title: "Pricing relaunch — Tuesday",
    type: "Conversion",
    smp: "We are the coffee for the Tuesday you decide to slow down on purpose.",
    background: "Quarterly pricing relaunch. Subscription tier consolidation plus a new annual option.",
    objective: "Lift annual conversion +25% over Q1 baseline. Hold churn below 2.4%.",
    audience: "Existing subscribers (warm), trial-ending cohort (lukewarm), wholesale leads (cold).",
    strategy: "Reframe price as cost-of-pause. The objection isn't dollars; it's the implicit promise to commit to a slower Tuesday.",
    tone: "Calm conviction. No urgency manipulation. A little funny, never cute.",
    direction: "Pricing page lead with editorial pull quote. Email sequence three-part. Subjects under 40 chars.",
    mandatories: "Mention provenance once (Honduras). Avoid 'unlock' / 'limited'. Lead with annual option.",
    deliverables: ["Pricing page hero (web)","Email 1: announce","Email 2: case for annual","Email 3: last call","Subjects ×6","Brand consistency QA"],
    metrics: "Annual conversion %, time-on-page, sequence open + click, churn delta.",
    notDoing: "Not 'limited-time' urgency. Not a discount. Not a referral push. Not bundling with the brewing kit.",
    watchouts: ["Annual price ≠ 12× monthly. Apply the 11.4× formula consistently.","Trial-ending cohort opens twice as much; don't waste subject line position 1 on subscribers."],
    assumptions: ["Klaviyo flow is the channel. No paid social spend this push.","Wholesale audience receives sequence variant B only."],
    status: "in-production",
    credits: 37,
    agents: ["a02","a03","a12","a13","a14","a18","a24"],
    createdAt: "Mon · 14 May",
  },
  {
    id: "b-honduras-microlot",
    title: "Honduras single-origin launch",
    type: "Story",
    smp: "Sometimes a coffee deserves to be named after the person who grew it.",
    background: "Quarterly microlot launch. Producer relationship is the story, not the tasting notes.",
    objective: "Sell through 480kg in 21 days. Establish microlot cadence as a brand pillar.",
    audience: "Existing subscribers + specialty subscribers on third-party platforms.",
    strategy: "Lead with the producer, not the coffee. Long-form story sets up the buy.",
    tone: "Editorial. Slightly elevated. Patient.",
    direction: "Long-form web piece, single product page, accompanying email + IG.",
    mandatories: "Producer's name on hero. No 'exotic' / 'rare' / 'limited' (we'll do limited differently).",
    deliverables: ["Long-form essay (web)","Product page hero","Email announce","IG caption series (5)","Hero image direction"],
    metrics: "Sell-through rate, average order value, scroll depth on essay.",
    notDoing: "Not a 'limited release' frame. Not flavor-note led. Not bundled with the equipment store.",
    watchouts: ["Producer profile photos need licensing review before publication.","Avoid 'fair trade' phrasing — we're not the right certifier."],
    assumptions: ["Roasting schedule aligns to ship-by-week-3."],
    status: "approved",
    credits: 52,
    agents: ["a02","a04","a15","a13","a20","a18"],
    createdAt: "Fri · 10 May",
  },
  {
    id: "b-summer-tuesdays",
    title: "Summer Tuesdays — seasonal campaign",
    type: "Campaign",
    smp: "Summer is when we earn the slow Tuesday back.",
    background: "Seasonal campaign covering June–August. Café footfall + subscription lifts.",
    objective: "Build mid-week visit cadence. Lift Tuesday DAU at café by 18%.",
    audience: "Locals within 2.5km of the two cafés. Subscribers as halo.",
    strategy: "Reframe summer as the season the routine stretches, not breaks.",
    tone: "Warm. Less editorial than the launch — more conversational.",
    direction: "Café posters, IG, two pieces of merch, an email.",
    mandatories: "Café address + opening hours on every printed surface.",
    deliverables: ["Poster set (A2)","IG carousel (3)","Email","Merch sketch — tote + ceramic"],
    metrics: "Café Tuesday footfall, subscription net adds, IG saves.",
    notDoing: "Not a discount summer. Not a 'free coffee with X'. Not influencer-led.",
    watchouts: ["Print proof needed by 28 May."],
    assumptions: ["Both cafés agree the Tuesday slot. Confirm with operations."],
    status: "draft",
    credits: 0,
    agents: ["a02","a06","a09","a20","a16"],
    createdAt: "Today · 09:14",
  },
  {
    id: "b-investor-deck",
    title: "Investor deck — pre-seed close",
    type: "Internal",
    smp: "The platform is the rail; the cafés are the cathedral.",
    background: "Closing pre-seed. Need a deck that doesn't apologise for the café revenue.",
    objective: "Get to YES on the remaining €420k.",
    audience: "Three angels + one micro-VC. Pre-read materials matter more than the deck itself.",
    strategy: "Lead with the rail. Cafés are operational proof, not the thesis.",
    tone: "Direct. No founder-myth. Numbers in front.",
    direction: "12 slides. One-pager appendix.",
    mandatories: "Founder bios on slide 11. Use of funds explicit on slide 9.",
    deliverables: ["12-slide deck","One-pager (PDF)","Speaker notes"],
    metrics: "Close rate. Not a marketing brief.",
    notDoing: "Not a customer narrative. Not a hockey stick. Not 'we are the Substack for coffee'.",
    watchouts: ["Specialist café operator (TL) signoff on operations slide."],
    assumptions: ["Pre-read is sent 48h before."],
    status: "shipped",
    credits: 64,
    agents: ["a02","a03","a15","a27"],
    createdAt: "27 Apr",
  },
];

/* Example agent outputs tied to briefs ----------------------------- */
/* Output `kind` drives the Library type filter. Labels in CI_OUTPUT_KINDS. */
window.CI_OUTPUT_KINDS = [
  { key:"copy",     label:"Copy" },
  { key:"page",     label:"Web page" },
  { key:"email",    label:"Email" },
  { key:"longform", label:"Long-form" },
  { key:"image",    label:"Image" },
  { key:"deck",     label:"Deck" },
  { key:"social",   label:"Social" },
  { key:"qa",       label:"QA" },
  { key:"upload",   label:"Uploads" },
];

window.CI_OUTPUTS = [
  /* ── Pricing relaunch ── */
  {
    id:"o1", briefId:"b-pricing-relaunch", kind:"page",
    type:"PRICING PAGE · HERO", agentId:"a12", status:"approved",
    body:"Stay for the year, and the coffee stays the price. Annual takes 1 in 12 off the bill — but the point isn't the dollar; the point is the decision to commit to a slower Tuesday on purpose.",
    meta:"38 words · est. 9.4 readability"
  },
  {
    id:"o2", briefId:"b-pricing-relaunch", kind:"email",
    type:"EMAIL 1 · ANNOUNCE", agentId:"a13", status:"in-production",
    body:"Annual is now an option. It isn't cheaper because we ran the numbers and got generous; it's cheaper because we asked you to commit to something. Annual subscribers told us they don't want flexibility — they want the bag on the kitchen counter on the same day each month.",
    meta:"247 words · 3-part sequence"
  },
  {
    id:"o3", briefId:"b-pricing-relaunch", kind:"copy",
    type:"SUBJECT LINES · ×6", agentId:"a14", status:"approved",
    body:"01 · There's a slower Tuesday in here  ·  02 · Annual is now an option  ·  03 · A small case for committing  ·  04 · One-in-twelve, on us  ·  05 · The Tuesday plan  ·  06 · Re: that subscription",
    meta:"6 variants · A/B intent split"
  },
  {
    id:"o4", briefId:"b-pricing-relaunch", kind:"qa",
    type:"BRAND CONSISTENCY QA", agentId:"a24", status:"approved",
    body:"Pass. No use of 'unlock' or 'limited'. Annual price respects 11.4× formula. Provenance (Honduras) referenced once in Email 1 paragraph 3, in line with mandatory. Voice drift index 0.14 (target ≤0.20).",
    meta:"1 page · QA gate green"
  },
  {
    id:"o6", briefId:"b-pricing-relaunch", kind:"image",
    type:"PRICING HERO · KEY VISUAL", agentId:"a18", status:"in-production",
    body:"A single bag on a sunlit kitchen counter, Tuesday-morning light. Annual band wraps the lower third in warm amber. No price on the visual — the price lives in the copy.",
    meta:"1600×900 · 3 crops · Flux 2"
  },

  /* ── Honduras single-origin ── */
  {
    id:"o5", briefId:"b-honduras-microlot", kind:"longform",
    type:"LONG-FORM · ESSAY OPENER", agentId:"a15", status:"review",
    body:"Don José grew this. He has 1.4 hectares and the inheritance of a name that, in his town, you don't introduce because everyone knows it already. We don't need to tell you the elevation or the variety. We need to tell you that the coffee is named after the person, and that's where you'll start.",
    meta:"1,840 words · editorial register"
  },
  {
    id:"o7", briefId:"b-honduras-microlot", kind:"image",
    type:"BAG LABEL · FRONT", agentId:"a20", status:"draft",
    body:"Hand-set serial number, Don José's signature reproduced under the lot code. Kraft stock, single-colour amber. The label is the provenance — nothing decorative.",
    meta:"label dieline · print-ready"
  },
  {
    id:"o8", briefId:"b-honduras-microlot", kind:"social",
    type:"INSTAGRAM · CAROUSEL ×4", agentId:"a14", status:"draft",
    body:"Slide 1: the name. Slide 2: the hectares. Slide 3: the cup. Slide 4: where to get it. No 'link in bio' energy — it reads like a short letter.",
    meta:"4 frames · caption + alt text"
  },

  /* ── Summer Tuesdays ── */
  {
    id:"o9", briefId:"b-summer-tuesdays", kind:"copy",
    type:"TERRITORY · ×3 CONCEPTS", agentId:"a06", status:"draft",
    body:"01 · 'The slow afternoon, on purpose.'  02 · 'Iced, but make it a ritual.'  03 · 'Summer is when we earn the slow Tuesday back.' — recommend 03, it ladders to the BIO positioning.",
    meta:"3 territories · 1 recommended"
  },
  {
    id:"o10", briefId:"b-summer-tuesdays", kind:"image",
    type:"CAMPAIGN HERO · KV", agentId:"a18", status:"draft",
    body:"Cold brew sweating on a shaded balcony table, afternoon shadow long across the wood. Editorial, not stocky. Amber type lockup bottom-left.",
    meta:"1920×1080 · 2 ratios"
  },
  {
    id:"o11", briefId:"b-summer-tuesdays", kind:"email",
    type:"TEASER · PRE-LAUNCH", agentId:"a13", status:"draft",
    body:"Something slower is coming for the warm months. Not a sale. A reason to keep the Tuesday even when the city speeds up. Watch this space — or don't, and we'll tell you when it lands.",
    meta:"96 words · single send"
  },

  /* ── Investor deck ── */
  {
    id:"o12", briefId:"b-investor-deck", kind:"deck",
    type:"DECK · 12-SLIDE OUTLINE", agentId:"a09", status:"shipped",
    body:"Cold open on the retention curve, not the team slide. Problem framed as 'subscription coffee churns because it's a commodity relationship.' The bet: provenance + ritual = a brand, not a SKU.",
    meta:"12 slides · narrative spine"
  },
  {
    id:"o13", briefId:"b-investor-deck", kind:"copy",
    type:"ONE-LINER · ×5", agentId:"a02", status:"shipped",
    body:"'We sell the Tuesday, not the bag.' · 'Coffee with a name attached.' · 'The anti-commodity subscription.' · 'Provenance you can taste, ritual you can keep.' · 'A brand, not a SKU.'",
    meta:"5 lines · for cover + cold email"
  },
  {
    id:"o14", briefId:"b-investor-deck", kind:"image",
    type:"MARKET MAP · DIAGRAM", agentId:"a18", status:"review",
    body:"2×2 with 'commodity ↔ provenance' on x and 'transactional ↔ ritual' on y. Competitors clustered bottom-left; Vinilo alone top-right. Clean, no gradient soup.",
    meta:"vector · light + dark variants"
  },

  /* ── Client uploads (reference material the brand brought in) ── */
  {
    id:"u1", briefId:"b-honduras-microlot", kind:"upload", source:"upload",
    type:"UPLOAD · FARM PHOTOS", agentId:null, status:"draft",
    body:"12 photos from Don José's farm — harvest, drying beds, the signature on the lot ledger. Source material for the bag label and the essay.",
    meta:"12 images · 48 MB · client upload"
  },
  {
    id:"u2", briefId:"b-pricing-relaunch", kind:"upload", source:"upload",
    type:"UPLOAD · BRAND GUIDELINES", agentId:null, status:"draft",
    body:"Vinilo brand book v2 (PDF). Type, colour, the 11.4× pricing formula, the forbidden-words list Brandolph QAs against.",
    meta:"PDF · 18 pp · client upload"
  },
];

/* Brandolph's opening lines (4 contexts) --------------------------- */
window.CI_BRANDOLPH_OPENERS = {
  welcome:  "*You haven't shipped anything this week.* Either we're in a thinking phase, or something is blocked. Tell me which one — I have one of two next moves to suggest depending.",
  midway:   "*The pricing relaunch you briefed Monday is two cards short of ready.* The conversion copy and the subject lines look strong. The Email 2 case-for-annual reads dutiful, not persuasive. I'd assign Sonnet a second pass before we ship. You want me to do that, or want to read it first?",
  cold:     "*Your last brief was the Christmas campaign.* That was four months ago. I assume the season has changed. What are you planning for now — or do you want me to look at the calendar and propose three?",
  fresh:    "*Welcome back.* The BIO is current. Nothing is in flight. The fastest way to start is to tell me what you're trying to ship this month — not the deliverable, the change you want made.",
};

/* Discovery — extraction signals (used in /discovery results) ----- */
window.CI_DISCOVERY = {
  brand: "Vinilo Coffee",
  url:   "vinilo.coffee",
  confidence: 91,
  duration: "38.4s",
  signals: 94,
  flags: 1,
  identity: [
    { key:"Brand name",    val:"Vinilo Coffee",                       conf:99 },
    { key:"One-liner",     val:"Specialty coffee for slow Tuesdays.", conf:88 },
    { key:"Origin year",   val:"2021",                                conf:94 },
    { key:"Headquarters",  val:"Barcelona, Spain",                    conf:96 },
  ],
  palette: [
    { hex:"#1F1A14", name:"Espresso", conf:96, wcag:"AA+" },
    { hex:"#C97B3F", name:"Ember",    conf:94, wcag:"AA" },
    { hex:"#F4ECDD", name:"Cream",    conf:91, wcag:"—" },
    { hex:"#7FA37A", name:"Sage",     conf:78, wcag:"AA" },
    { hex:"#E8A020", name:"Honey",    conf:62, wcag:"AA" },
  ],
  type: [
    { kind:"Display", family:"Söhne Breit", size:"variable 32–80", license:"paid", suggest:"Söhne Breit (kept)" },
    { kind:"Body",    family:"GT Sectra Display", size:"16/26", license:"paid", suggest:"Söhne (kept)" },
  ],
  voice: [
    { dim:"Formality", val:0.4, sample:"Annual is now an option." },
    { dim:"Warmth",    val:0.75, sample:"We'll be here on a Tuesday." },
    { dim:"Play",      val:0.45, sample:"You can stop reading. The coffee is ready." },
    { dim:"Urgency",   val:0.15, sample:"Take the week to decide." },
  ],
  imagery: ["Hands + craft tools","Café interiors low light","Producer portraits","Coffee bag detail (no model)"],
  avoid: ["B&W documentary","Latte art top-down","Group lifestyle shots"],
  audience: {
    segments: ["Café-warm regulars","Online subscribers","Wholesale buyers"],
    channels: ["Klaviyo email","Instagram","In-café"],
    languages: ["Catalan","Spanish","English"],
  },
};

/* Team queue (jobs) ----------------------------------------------- */
window.CI_JOBS = [
  { id:"j-9f2a1c", client:"Vinilo Coffee",   type:"Hero KV finish",      cr:220, submitted:"2h ago",  sla:"48h",     status:"unassigned", assignee:null },
  { id:"j-d4e8b7", client:"Vinilo Coffee",   type:"Email build polish",  cr:120, submitted:"5h ago",  sla:"32h",     status:"in-progress", assignee:"Aitana V." },
  { id:"j-3b6c2a", client:"Vinilo Coffee",   type:"Pricing page review", cr:80,  submitted:"yesterday", sla:"18h overdue", status:"review",  assignee:"Marc P." },
  { id:"j-77a9d1", client:"Plaza Hortelana", type:"Identity finalisation",cr:550,submitted:"3d ago", sla:"8h",      status:"delivered",  assignee:"Aitana V." },
  { id:"j-22e6f5", client:"Plaza Hortelana", type:"Deck polish",         cr:300, submitted:"4d ago", sla:"24h",      status:"in-progress", assignee:"Diego M." },
  { id:"j-55c0a3", client:"Bandera",         type:"Minor polish",        cr:80,  submitted:"1h ago", sla:"40h",      status:"unassigned",  assignee:null },
  { id:"j-91b8e0", client:"Bandera",         type:"Subject line set",    cr:60,  submitted:"yesterday", sla:"4h",   status:"in-progress", assignee:"Lia R." },
  { id:"j-cc4011", client:"Faro Lab",        type:"Custom illustration", cr:350, submitted:"2d ago", sla:"6h",       status:"in-progress", assignee:"Marc P." },
  { id:"j-fff213", client:"Faro Lab",        type:"Packaging dieline",   cr:700, submitted:"yesterday", sla:"36h",   status:"review",      assignee:"Aitana V." },
  { id:"j-eee402", client:"Olivar Real",     type:"Medium polish",       cr:120, submitted:"6h ago", sla:"28h",      status:"unassigned",  assignee:null },
  { id:"j-aaa099", client:"Olivar Real",     type:"Brand guidelines",    cr:650, submitted:"5d ago", sla:"2 days",   status:"in-progress", assignee:"Diego M." },
  { id:"j-bbb501", client:"Maizal",          type:"Video edit (30s)",    cr:330, submitted:"3h ago", sla:"24h",      status:"unassigned",  assignee:null },
];

window.CI_TEAM = [
  { id:"t1", name:"Aitana V.", role:"Senior designer",   load:0.78, slots:3, jobsThisMonth:14, photo:"intelligence/assets/profile-1.jpg" },
  { id:"t2", name:"Marc P.",   role:"Senior designer",   load:0.62, slots:5, jobsThisMonth:11, photo:"intelligence/assets/profile-2.jpg" },
  { id:"t3", name:"Diego M.",  role:"Brand strategist",  load:0.91, slots:1, jobsThisMonth:9,  photo:"intelligence/assets/profile-3.jpg" },
  { id:"t4", name:"Lia R.",    role:"Copywriter",        load:0.34, slots:7, jobsThisMonth:18, photo:"intelligence/assets/profile-4.jpg" },
  { id:"t5", name:"Nuria T.",  role:"Art director",      load:0.55, slots:4, jobsThisMonth:7,  photo:"intelligence/assets/profile-5.jpg" },
];

/* Craft packs ----------------------------------------------------- */
window.CI_CRAFT = [
  { cr:80,  label:"Minor polish",          eta:"1–2h",  desc:"Small craft pass on one piece of work. Type, alignment, small art-direction notes." },
  { cr:120, label:"Medium polish",         eta:"2–3h",  desc:"Considered craft pass on a single output. One revision included." },
  { cr:220, label:"Hero KV finish",        eta:"3–4h",  desc:"Take an AI draft into a print-ready hero. Includes one art-direction note." },
  { cr:280, label:"Art direction",         eta:"½ day", desc:"A senior designer reads the BIO, writes direction, points the team." },
  { cr:300, label:"Deck polish",           eta:"4–6h",  desc:"Take an AI-generated deck into the kind a buyer takes seriously." },
  { cr:330, label:"Video edit (30s)",      eta:"4–6h",  desc:"Concept-led 30-second cut. Sound design included." },
  { cr:350, label:"Custom illustration",   eta:"1 day", desc:"Bespoke illustration in your brand's visual register." },
  { cr:400, label:"Print collateral set",  eta:"1–2 days", desc:"Posters, flyers, cards — print-ready, brand-aligned." },
  { cr:550, label:"Identity finalisation", eta:"3–5 days", desc:"Take an AI draft identity through to system." },
  { cr:650, label:"Brand guidelines",      eta:"5–7 days", desc:"The book. Voice, visual, behavioural rules. PDF + web." },
  { cr:700, label:"Packaging dieline",     eta:"1 week",   desc:"A finished pack: layout, copy, dieline, prepress files." },
];

/* Recent ledger entries ------------------------------------------- */
window.CI_LEDGER = [
  { date:"14 May · 11:42", desc:"Pricing relaunch — Conversion copy", who:"Conversion Copy · L2-12", cr:-12, layer:"L2" },
  { date:"14 May · 11:42", desc:"Pricing relaunch — Email sequence",  who:"Email Sequence · L2-13",  cr:-12, layer:"L2" },
  { date:"14 May · 11:42", desc:"Pricing relaunch — Subject lines",   who:"Subject Lines · L2-14",   cr:-2,  layer:"L2" },
  { date:"14 May · 11:43", desc:"Pricing relaunch — Brand QA",        who:"Brand Consistency QA · L2-24", cr:-2,  layer:"L2" },
  { date:"13 May · 17:08", desc:"Hero KV finish — Vinilo",            who:"Aitana V. · Senior designer", cr:-220, layer:"L3" },
  { date:"12 May · 09:31", desc:"Discovery compile — Vinilo",         who:"BIO Compiler · L2-30",    cr:-10, layer:"L2" },
  { date:"11 May · 14:55", desc:"Brandolph turn — assembly proposal", who:"Brandolph",   cr:-3,  layer:"L1" },
  { date:"08 May · 10:12", desc:"Investor deck — Build",              who:"Deck Build · L2-27",       cr:-12, layer:"L2" },
  { date:"06 May · 16:40", desc:"Honduras essay — Long-form",         who:"Long-form Editor · L2-15",cr:-14, layer:"L2" },
  { date:"05 May · 09:00", desc:"Cycle credit refresh",                who:"—",          cr:900, layer:"—" },
];
