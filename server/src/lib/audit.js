import crypto from "node:crypto";
import { supabaseAdmin } from "./supabase.js";

export function requestIdFrom(c) {
  return c?.req?.header?.("x-request-id") || crypto.randomUUID();
}

export async function writeAuthorizationAudit(contextOrEvent, event = null) {
  const context = event ? contextOrEvent : null;
  const {
  auth,
  permission,
  action,
  targetType = null,
  targetId = null,
  workspaceId = null,
  outcome = "allowed",
  reason = null,
  requestId = null,
  priorState = null,
  newState = null,
  metadata = {},
  } = event ? { ...event, auth: context.get("auth"), requestId: requestIdFrom(context) } : contextOrEvent;
  const normalizedOutcome = outcome === "success" ? "allowed" : outcome === "failure" ? "failed" : outcome;
  try {
    const { error } = await supabaseAdmin.from("authorization_audit_events").insert({
      actor_user_id: auth?.userId || null,
      permission,
      action: action || permission,
      target_type: targetType,
      target_id: targetId == null ? null : String(targetId),
      workspace_id: workspaceId,
      outcome: normalizedOutcome,
      reason,
      request_id: requestId,
      prior_state: priorState,
      new_state: newState,
      metadata,
    });
    if (error && error.code !== "42P01") console.warn("[audit] write failed:", error.message);
  } catch (error) {
    console.warn("[audit] write failed:", error?.message || error);
  }
}
