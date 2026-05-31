// server/src/lib/platforms.js
// Platform-spec registry. The single source of truth for how a deliverable
// part is re-fitted per channel: image dimensions, copy length, tone. Read
// by both the copy contract (compose-specialist-prompt) and image gen
// (compose-image-prompt) in later phases.

export const PLATFORM_SPECS = {
  instagram:       { label: "Instagram",       image: { w: 1080, h: 1080 }, copyMaxChars: 2200, tone: "visual-first, hooky" },
  instagram_story: { label: "Instagram Story", image: { w: 1080, h: 1920 }, copyMaxChars: 160,  tone: "vertical, ephemeral" },
  linkedin:        { label: "LinkedIn",        image: { w: 1200, h: 627 },  copyMaxChars: 1300, tone: "professional, POV-led" },
  x:               { label: "X (Twitter)",     image: { w: 1600, h: 900 },  copyMaxChars: 280,  tone: "terse, punchy" },
  tiktok:          { label: "TikTok",          image: { w: 1080, h: 1920 }, copyMaxChars: 300,  tone: "native, casual" },
  facebook:        { label: "Facebook",        image: { w: 1200, h: 630 },  copyMaxChars: 600,  tone: "broad reach" },
  blog:            { label: "Blog / Web",      image: { w: 1600, h: 900 },  copyMaxChars: null, tone: "editorial, long-form" },
  deck:            { label: "Deck",            image: { w: 1920, h: 1080 }, copyMaxChars: null, tone: "presentation" },
  email:           { label: "Email",           image: { w: 600,  h: 400 },  copyMaxChars: null, tone: "direct, scannable" },
  generic:         { label: "Generic",         image: { w: 1080, h: 1080 }, copyMaxChars: null, tone: "brand-default" },
};

export const DEFAULT_PLATFORM = "generic";

export function isPlatform(id) {
  return Object.prototype.hasOwnProperty.call(PLATFORM_SPECS, id);
}

export function platformSpec(id) {
  return PLATFORM_SPECS[id] || PLATFORM_SPECS[DEFAULT_PLATFORM];
}
