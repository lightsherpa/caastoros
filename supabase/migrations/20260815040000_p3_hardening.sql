-- ─────────────────────────────────────────────────────────────────────
-- Phase 3 hardening — close the residual write-lockdown gaps found in the
-- adversarial audit (docs/2026-08-15-phase3-gate-isolation-findings.md L1).
--
-- The M1 revoke (20260815000000) covered the BIO/cert/credit tables but
-- omitted team_members, users, and brand_signals. They're safe today only
-- because their RLS default-denies writes (no write policy) — but that's one
-- accidental policy away from privilege escalation. Revoke client-role writes
-- explicitly (defense in depth). Reads stay (governed by existing RLS: the
-- team directory read, users_self_read, etc.). All server writes go through
-- the service role (unaffected); the signup trigger is SECURITY DEFINER
-- (runs as postgres, unaffected).
-- ─────────────────────────────────────────────────────────────────────

revoke insert, update, delete on team_members, users, brand_signals
from anon, authenticated;
