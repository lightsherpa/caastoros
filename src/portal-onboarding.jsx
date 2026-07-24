import React from "react";
import { supabase } from "./lib/supabase-browser.js";

const { Icon } = window;
const { useEffect, useMemo, useRef, useState } = React;

const ROLES = [
  "Founder / owner",
  "Brand / marketing lead",
  "Creative lead",
  "Agency / consultant",
  "Operations",
  "Other",
];
const COMPANY_SIZES = ["Just me", "2-10", "11-50", "51-200", "201+"];

const STORY = [
  ["Let's make this yours.", "A name is enough to begin. Everything else should earn its place."],
  ["The canon learns who decides.", "Your role changes the questions Caastor asks and the language used in review."],
  ["Context makes the work sharper.", "A small team and a global brand should not receive the same operating advice."],
  ["Now name the world we're learning.", "This becomes the workspace every source, BIO decision, and brief belongs to."],
  ["Point us to the truth.", "Official evidence comes first. Caastor will show what it found, what it inferred, and what is missing."],
];

function cleanSiteUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function brandIsPlaceholder(brand) {
  const name = String(brand?.name || "").trim().toLowerCase();
  return !name || ["my brand", "untitled brand", "new brand"].includes(name);
}

function QuestionHeader({ number, title, help }) {
  return (
    <header className="onboarding__question-header">
      <div className="onboarding__question-number"><span>{String(number).padStart(2, "0")}</span><Icon name="arrow" size={14} /></div>
      <h2>{title}</h2>
      {help && <p>{help}</p>}
    </header>
  );
}

function ChoiceGrid({ value, options, onChoose, columns = 2 }) {
  return (
    <div className={`onboarding__choices onboarding__choices--${columns}`} role="radiogroup">
      {options.map((option, index) => {
        const selected = value === option;
        return (
          <button
            type="button"
            role="radio"
            aria-checked={selected}
            className={"onboarding__choice" + (selected ? " is-selected" : "")}
            style={{ "--choice-index": index }}
            key={option}
            onClick={() => onChoose(option)}
          >
            <span className="onboarding__choice-key">{String.fromCharCode(65 + index)}</span>
            <span>{option}</span>
            <span className="onboarding__choice-check"><Icon name="check" size={13} /></span>
          </button>
        );
      })}
    </div>
  );
}

function Onboarding({ go, initialStep }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState(null);
  const [brand, setBrand] = useState(null);
  const [screen, setScreen] = useState(initialStep === 2 ? 3 : 0);
  const [direction, setDirection] = useState("forward");
  const firstFieldRef = useRef(null);
  const [profile, setProfile] = useState({ firstName: "", lastName: "", role: "", company: "", companySize: "" });
  const [brandForm, setBrandForm] = useState({ name: "", url: "", instagram: "" });

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      const metadata = authData?.user?.user_metadata || {};
      const { data: brands } = await supabase
        .from("brands")
        .select("id, name, url, created_at")
        .order("created_at", { ascending: true });
      if (!alive) return;
      const currentId = window.getCurrentBrandId?.();
      const current = (brands || []).find((item) => item.id === currentId) || brands?.[0] || null;
      setBrand(current);
      setProfile({
        firstName: metadata.first_name || metadata.name?.split(" ")?.[0] || "",
        lastName: metadata.last_name || "",
        role: metadata.role_title || "",
        company: metadata.company || "",
        companySize: metadata.company_size || "",
      });
      setBrandForm({
        name: brandIsPlaceholder(current) ? "" : (current?.name || ""),
        url: (current?.url || "").replace(/^https?:\/\//i, ""),
        instagram: "",
      });
      if (!initialStep && metadata.onboarding_profile_completed) setScreen(3);
      setLoading(false);
    })().catch((cause) => {
      if (!alive) return;
      setError(cause?.message || "We could not load your workspace.");
      setLoading(false);
    });
    return () => { alive = false; };
  }, [initialStep]);

  useEffect(() => {
    if (!loading && !complete) window.requestAnimationFrame(() => firstFieldRef.current?.focus());
  }, [screen, loading, complete]);

  const canAdvance = useMemo(() => {
    if (screen === 0) return Boolean(profile.firstName.trim());
    if (screen === 1) return Boolean(profile.role);
    if (screen === 2) return Boolean(profile.company.trim() && profile.companySize);
    if (screen === 3) return Boolean(brandForm.name.trim());
    if (screen === 4) return Boolean(brandForm.url.trim());
    return false;
  }, [screen, profile, brandForm]);

  const patchProfile = (key) => (event) => {
    setProfile((current) => ({ ...current, [key]: event.target.value }));
    setError(null);
  };
  const patchBrand = (key) => (event) => {
    setBrandForm((current) => ({ ...current, [key]: event.target.value }));
    setError(null);
  };

  const moveTo = (next, nextDirection = "forward") => {
    setDirection(nextDirection);
    setError(null);
    setScreen(Math.max(0, Math.min(4, next)));
  };
  const goBack = () => moveTo(screen - 1, "back");

  const saveAndContinue = async () => {
    if (!canAdvance || !brand?.id) return;
    setBusy(true);
    setError(null);
    try {
      const fullName = [profile.firstName.trim(), profile.lastName.trim()].filter(Boolean).join(" ");
      const normalizedUrl = cleanSiteUrl(brandForm.url);
      const [{ error: profileError }, { error: brandError }] = await Promise.all([
        supabase.auth.updateUser({
          data: {
            name: fullName,
            first_name: profile.firstName.trim(),
            last_name: profile.lastName.trim(),
            role_title: profile.role,
            company: profile.company.trim(),
            company_size: profile.companySize,
            onboarding_profile_completed: true,
            onboarding_brand_completed: true,
          },
        }),
        supabase.from("brands").update({ name: brandForm.name.trim(), url: normalizedUrl }).eq("id", brand.id),
      ]);
      if (profileError) throw profileError;
      if (brandError) throw brandError;
      window.setCurrentBrandId?.(brand.id);
      sessionStorage.setItem("ci_onboarding_discovery", JSON.stringify({
        brandName: brandForm.name.trim(),
        url: normalizedUrl,
        instagram: brandForm.instagram.trim(),
      }));
      setComplete(true);
      window.setTimeout(() => go("discovery"), 720);
    } catch (cause) {
      setError(cause?.message || "We could not save this setup. Check the fields and try again.");
    } finally {
      setBusy(false);
    }
  };

  const submitCurrent = (event) => {
    event?.preventDefault();
    if (!canAdvance || busy) return;
    if (screen === 4) saveAndContinue();
    else moveTo(screen + 1);
  };

  const chooseRole = (role) => {
    setProfile((current) => ({ ...current, role }));
    setError(null);
    window.setTimeout(() => moveTo(2), 180);
  };

  useEffect(() => {
    const onKey = (event) => {
      if (busy || complete) return;
      if (event.key === "ArrowLeft" && screen > 0) {
        event.preventDefault();
        goBack();
        return;
      }
      if (screen === 1 && /^[1-6a-f]$/i.test(event.key)) {
        const index = /\d/.test(event.key) ? Number(event.key) - 1 : event.key.toLowerCase().charCodeAt(0) - 97;
        if (ROLES[index]) chooseRole(ROLES[index]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, busy, complete]);

  if (loading) {
    return <div className="onboarding onboarding--loading"><span className="onboarding__spinner" aria-hidden="true" /><span>Preparing your workspace...</span></div>;
  }

  const storyIndex = Math.min(screen, STORY.length - 1);
  const brandStage = screen >= 3;
  const progress = complete ? 100 : ((screen + 1) / 5) * 100;

  return (
    <div className="onboarding">
      <aside className="onboarding__story">
        <img src="caastor/assets/login-story.png" alt="" className="onboarding__story-image" />
        <div className="onboarding__story-shade" />
        <div className="onboarding__story-content">
          <div className="onboarding__brand"><img src="caastor/assets/icon-white.svg" alt="" /><strong>Caastor</strong><span>OS</span></div>
          <div key={storyIndex} className="onboarding__story-copy onboarding__story-copy--motion">
            <p className="onboarding__kicker">Your first brand</p>
            <h1>{STORY[storyIndex][0]}</h1>
            <p>{STORY[storyIndex][1]}</p>
          </div>
          <ol className="onboarding__story-steps" aria-label="Setup progress">
            <li className={!brandStage ? "is-active" : "is-complete"}><span>{brandStage ? <Icon name="check" size={11} /> : 1}</span> You</li>
            <li className={brandStage ? "is-active" : ""}><span>2</span> Brand</li>
            <li className={complete ? "is-active" : ""}><span>3</span> Evidence</li>
            <li><span>4</span> BIO review</li>
          </ol>
        </div>
      </aside>

      <main className="onboarding__panel">
        <div className="onboarding__mobile-brand"><img src="caastor/assets/logo-full-yellow.png" alt="CaastorOS" /><span>OS</span></div>
        <div className="onboarding__form-wrap">
          <div className="onboarding__progress"><span style={{ width: `${progress}%` }} /></div>
          <div className="onboarding__step-label">{complete ? "Ready for evidence" : `Question ${screen + 1} of 5`}</div>

          {complete ? (
            <div className="onboarding__success" role="status">
              <span className="onboarding__success-mark"><Icon name="check" size={24} /></span>
              <h2>{brandForm.name.trim()} is ready.</h2>
              <p>Opening evidence collection...</p>
            </div>
          ) : (
            <form key={screen} onSubmit={submitCurrent} className={`onboarding__question is-${direction}`}>
              {screen === 0 && (
                <>
                  <QuestionHeader number={1} title="What should we call you?" help="This is how your Steward and workspace will address you." />
                  <div className="onboarding__name-grid">
                    <label>First name<input ref={firstFieldRef} className="onboarding__answer" value={profile.firstName} onChange={patchProfile("firstName")} autoComplete="given-name" placeholder="Oscar" required /></label>
                    <label><span className="onboarding__field-label">Last name <em>Optional</em></span><input className="onboarding__answer" value={profile.lastName} onChange={patchProfile("lastName")} autoComplete="family-name" placeholder="Motta" /></label>
                  </div>
                </>
              )}

              {screen === 1 && (
                <>
                  <QuestionHeader number={2} title="What seat are you in?" help="Pick the closest match. It changes the questions Caastor asks later." />
                  <ChoiceGrid value={profile.role} options={ROLES} onChoose={chooseRole} />
                </>
              )}

              {screen === 2 && (
                <>
                  <QuestionHeader number={3} title="Where are you building?" help="A little operating context keeps the recommendations proportionate." />
                  <label>Company<input ref={firstFieldRef} className="onboarding__answer" value={profile.company} onChange={patchProfile("company")} autoComplete="organization" placeholder="Company or studio name" required /></label>
                  <div className="onboarding__subquestion">How many people are on the team?</div>
                  <ChoiceGrid value={profile.companySize} options={COMPANY_SIZES} onChoose={(companySize) => setProfile((current) => ({ ...current, companySize }))} columns={3} />
                </>
              )}

              {screen === 3 && (
                <>
                  <QuestionHeader number={4} title="Which brand are we learning?" help="This name becomes the home for the BIO, briefs, and every approved output." />
                  <label>Brand name<input ref={firstFieldRef} className="onboarding__answer onboarding__answer--hero" value={brandForm.name} onChange={patchBrand("name")} placeholder="Your brand" required /></label>
                </>
              )}

              {screen === 4 && (
                <>
                  <QuestionHeader number={5} title="Where does the brand live?" help="Start with the canonical domain. You will choose documents and additional evidence next." />
                  <label>Official website<input ref={firstFieldRef} className="onboarding__answer" value={brandForm.url} onChange={patchBrand("url")} inputMode="url" placeholder="yourbrand.com" required /><small>Use the primary website, not a temporary campaign page.</small></label>
                  <label><span className="onboarding__field-label">Instagram <em>Optional</em></span><input className="onboarding__answer" value={brandForm.instagram} onChange={patchBrand("instagram")} placeholder="@yourbrand" /></label>
                  <div className="onboarding__evidence-note"><Icon name="bio" size={18} /><div><strong>Next: choose the evidence.</strong><span>Website pages, guidelines, visual references, and known refusals.</span></div></div>
                </>
              )}

              {error && <div className="onboarding__error" role="alert">{error}</div>}
              {screen !== 1 && (
                <div className="onboarding__actions">
                  {screen > 0 ? <button type="button" className="btn btn--ghost" onClick={goBack} disabled={busy}><Icon name="arrowLeft" size={15} /> Back</button> : <span />}
                  <button className="btn btn--primary btn--lg onboarding__continue" disabled={!canAdvance || busy}>{busy ? "Saving..." : screen === 4 ? "Choose evidence" : "Continue"}<Icon name="arrow" size={15} /></button>
                </div>
              )}
              {screen === 1 && <button type="button" className="btn btn--link onboarding__back-link" onClick={goBack}><Icon name="arrowLeft" size={13} /> Back</button>}
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

Object.assign(window, { Onboarding });
