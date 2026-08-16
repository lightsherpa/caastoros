import { Hono } from "hono";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { writeAuthorizationAudit } from "../lib/audit.js";
import { createOpexOverride, OPEX_OVERRIDE_OPERATIONS } from "../lib/opex-override.js";

const app = new Hono();
app.use("*", requireAuth);
app.use("*", requirePermission("opex.read"));

const costOf = (e) => Number(e.reconciled_cost_usd ?? e.reported_cost_usd ?? e.estimated_cost_usd ?? 0);
const sanitizeEvent = (event) => ({
  id: event.id,
  occurred_at: event.occurred_at,
  request_id: event.request_id,
  parent_run_id: event.parent_run_id,
  workflow_id: event.workflow_id,
  workspace_id: event.workspace_id,
  brand_id: event.brand_id,
  specialist_id: event.specialist_id,
  feature: event.feature,
  environment: event.environment,
  provider: event.provider,
  service: event.service,
  requested_model: event.requested_model,
  resolved_model: event.resolved_model,
  operation: event.operation,
  status: event.status,
  retry_number: event.retry_number,
  latency_ms: event.latency_ms,
  input_tokens: event.input_tokens,
  output_tokens: event.output_tokens,
  cache_read_tokens: event.cache_read_tokens,
  cache_write_tokens: event.cache_write_tokens,
  images: event.images,
  pages: event.pages,
  requests: event.requests,
  bytes: event.bytes,
  reported_cost_usd: event.reported_cost_usd,
  estimated_cost_usd: event.estimated_cost_usd,
  reconciled_cost_usd: event.reconciled_cost_usd,
  currency: event.currency,
  cost_source: event.cost_source,
  preflight_max_cost_usd: event.preflight_max_cost_usd,
  breaker_decision: event.breaker_decision,
  error_code: event.error_code,
});

function parsePeriod(c) {
  const now = new Date();
  const from = new Date(c.req.query("from") || Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(c.req.query("to") || now);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to) return null;
  if (to.getTime() - from.getTime() > 366 * 86400000) return null;
  return { from: from.toISOString(), to: to.toISOString() };
}
const group = (events, key) => Object.values(events.reduce((acc, e) => {
  const name = e[key] || "unallocated";
  const row = acc[name] ||= { name, cost: 0, requests: 0, failures: 0 };
  row.cost += costOf(e); row.requests += 1; row.failures += e.status === "succeeded" ? 0 : 1;
  return acc;
}, {})).sort((a, b) => b.cost - a.cost);

app.get("/overview", async (c) => {
  const now = new Date();
  const period = parsePeriod(c);
  if (!period) return c.json({ error: "Invalid period; from must precede to and span no more than 366 days" }, 400);
  const { from, to } = period;
  const periodMs = Math.max(1, Date.parse(to) - Date.parse(from));
  const priorFrom = new Date(Date.parse(from) - periodMs).toISOString();
  const [{ data: events, error }, { data: priorEvents }, { data: budgets }, { count: approved }, { data: creditRows }] = await Promise.all([
    supabaseAdmin.from("api_usage_events").select("*").gte("occurred_at", from).lte("occurred_at", to).order("occurred_at"),
    supabaseAdmin.from("api_usage_events").select("reported_cost_usd,estimated_cost_usd,reconciled_cost_usd").gte("occurred_at", priorFrom).lt("occurred_at", from),
    supabaseAdmin.from("api_budgets").select("*"),
    supabaseAdmin.from("outputs").select("id", { count: "exact", head: true }).eq("workflow_status", "client_approved").gte("client_reviewed_at", from).lte("client_reviewed_at", to),
    supabaseAdmin.from("ledger").select("credits").gt("credits",0).gte("created_at",from).lte("created_at",to),
  ]);
  if (error) return c.json({ error: error.message }, 500);
  const rows = events || [];
  const spend = rows.reduce((n, e) => n + costOf(e), 0);
  const priorSpend = (priorEvents || []).reduce((n,e)=>n+costOf(e),0);
  const creditsSpent = (creditRows || []).reduce((n,e)=>n+Number(e.credits||0),0);
  const covered = rows.filter((e) => e.cost_source && e.cost_source !== "unpriced").length;
  const daysElapsed = Math.max(1, (Date.parse(to) - Date.parse(from)) / 86400000);
  const daysInMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getUTCDate();
  const workspaceIds = new Set(rows.map((e) => e.workspace_id).filter(Boolean));
  const runs = new Set(rows.map((e) => e.parent_run_id).filter(Boolean));
  const daily = group(rows.map((e) => ({ ...e, day: e.occurred_at.slice(0, 10) })), "day").sort((a,b) => a.name.localeCompare(b.name));
  const totalBudget = (budgets || []).reduce((n, b) => n + Number(b.monthly_budget_usd || 0), 0);
  const forecast = spend / daysElapsed * daysInMonth;
  const alerts = [];
  if (totalBudget) {
    const utilization = spend / totalBudget * 100;
    for (const threshold of [70,85,100]) if (utilization >= threshold) alerts.push({ type:"budget_threshold", severity:threshold>=100?"critical":"warning", threshold, utilization });
    if (forecast > totalBudget) alerts.push({ type:"forecast_exceeds_budget", severity:"warning", forecast, budget:totalBudget });
  }
  return c.json({
    period: { from, to },
    metrics: {
      spend, forecast,
      priorSpend, priorPeriodChange: priorSpend ? (spend-priorSpend)/priorSpend : null,
      budget: totalBudget || null, budgetUtilization: totalBudget ? spend / totalBudget : null,
      activeWorkspaces: workspaceIds.size, requestCount: rows.length,
      costPerRun: runs.size ? spend / runs.size : 0,
      costPerApprovedDeliverable: approved ? spend / approved : 0,
      creditsToCostRatio: spend ? creditsSpent / spend : null,
      costCoverage: rows.length ? covered / rows.length : 1,
      inputTokens: rows.reduce((n,e)=>n+Number(e.input_tokens||0),0), outputTokens: rows.reduce((n,e)=>n+Number(e.output_tokens||0),0),
      cacheReadTokens: rows.reduce((n,e)=>n+Number(e.cache_read_tokens||0),0), cacheWriteTokens: rows.reduce((n,e)=>n+Number(e.cache_write_tokens||0),0),
      imageGenerations: rows.reduce((n,e)=>n+Number(e.images||0),0), pages: rows.reduce((n,e)=>n+Number(e.pages||0),0),
      failures: rows.filter(e=>e.status!=="succeeded").length, retries: rows.filter(e=>Number(e.retry_number)>0).length,
      averageLatencyMs: rows.length ? rows.reduce((n,e)=>n+Number(e.latency_ms||0),0)/rows.length : 0,
    },
    trends: daily,
    breakdowns: { provider: group(rows,"provider"), model: group(rows,"resolved_model"), feature: group(rows,"feature"), specialist: group(rows,"specialist_id"), workspace: group(rows,"workspace_id"), brand: group(rows,"brand_id"), environment: group(rows,"environment"), status: group(rows,"status"), costSource: group(rows,"cost_source") },
    budgets: budgets || [],
    alerts,
    recentEvents: rows.slice(-100).reverse().map(sanitizeEvent),
  });
});

app.put("/budgets/:id", requirePermission("opex.budgets.manage", { mfa: true }), async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const { data: prior, error: priorError } = await supabaseAdmin.from("api_budgets").select("*").eq("id", id).maybeSingle();
  if (priorError) return c.json({ error: priorError.message }, 400);
  if (!prior) return c.json({ error: "Budget policy not found" }, 404);
  const patch = { updated_by: c.get("auth").userId, updated_at:new Date().toISOString() };
  const nullableNumber = (value) => value === "" || value == null ? null : Number(value);
  if (body.monthlyBudgetUsd !== undefined) patch.monthly_budget_usd = nullableNumber(body.monthlyBudgetUsd);
  if (body.perRequestCeilingUsd !== undefined) patch.per_request_ceiling_usd = nullableNumber(body.perRequestCeilingUsd);
  if (body.maxRequestsPerMinute !== undefined) patch.max_requests_per_minute = nullableNumber(body.maxRequestsPerMinute);
  if (body.active !== undefined) patch.active = !!body.active;
  if (patch.monthly_budget_usd !== undefined && patch.monthly_budget_usd !== null && (!Number.isFinite(patch.monthly_budget_usd) || patch.monthly_budget_usd <= 0)) return c.json({ error: "Monthly budget must be greater than zero" }, 400);
  if (patch.per_request_ceiling_usd !== undefined && patch.per_request_ceiling_usd !== null && (!Number.isFinite(patch.per_request_ceiling_usd) || patch.per_request_ceiling_usd <= 0)) return c.json({ error: "Request ceiling must be greater than zero" }, 400);
  if (patch.max_requests_per_minute !== undefined && patch.max_requests_per_minute !== null && (!Number.isInteger(patch.max_requests_per_minute) || patch.max_requests_per_minute <= 0)) return c.json({ error: "Rate limit must be a positive integer" }, 400);
  const { data, error } = await supabaseAdmin.from("api_budgets").update(patch).eq("id", id).select().single();
  await writeAuthorizationAudit(c, { permission: "opex.budgets.manage", targetType: "api_budget", targetId: id, priorState: prior, newState: data, outcome: error ? "failure" : "success" });
  return error ? c.json({ error: error.message }, 400) : c.json({ budget: data });
});

app.get("/events", async (c) => {
  const limit=Math.min(250,Math.max(1,Number(c.req.query("limit"))||100));
  let query=supabaseAdmin.from("api_usage_events").select("*").order("occurred_at",{ascending:false}).limit(limit);
  for(const [queryKey,column] of [["provider","provider"],["model","resolved_model"],["feature","feature"],["workspaceId","workspace_id"],["brandId","brand_id"],["environment","environment"],["status","status"],["costSource","cost_source"]]){
    const value=c.req.query(queryKey); if(value)query=query.eq(column,value);
  }
  if(c.req.query("from"))query=query.gte("occurred_at",c.req.query("from"));
  if(c.req.query("to"))query=query.lte("occurred_at",c.req.query("to"));
  const {data,error}=await query;
  return error?c.json({error:error.message},500):c.json({events:(data||[]).map(sanitizeEvent)});
});

app.post("/overrides", requirePermission("opex.override", { mfa: true }), async (c) => {
  const auth=c.get("auth");
  const {operationKey,reason,ttlMinutes}=await c.req.json().catch(() => ({}));
  if(!OPEX_OVERRIDE_OPERATIONS.has(operationKey))return c.json({error:"Unsupported operation"},400);
  if(!reason?.trim()||reason.trim().length<8)return c.json({error:"A specific override reason is required"},400);
  const override=createOpexOverride({userId:auth.userId,operationKey,reason:reason.trim(),ttlMinutes});
  await writeAuthorizationAudit(c,{permission:"opex.override",action:"guardrail.override.issue",targetType:"api_operation",targetId:operationKey,outcome:"success",reason:reason.trim(),newState:{expiresAt:new Date(override.expiresAt).toISOString()}});
  return c.json({override:{token:override.token,operationKey,expiresAt:new Date(override.expiresAt).toISOString(),reason:override.reason}});
});

app.get("/export.csv", requirePermission("opex.export", { mfa: true }), async (c) => {
  const { data, error } = await supabaseAdmin.from("api_usage_events").select("occurred_at,request_id,workspace_id,provider,service,resolved_model,feature,status,input_tokens,output_tokens,reported_cost_usd,estimated_cost_usd,reconciled_cost_usd,cost_source").order("occurred_at", { ascending: false }).limit(10000);
  if (error) return c.json({ error: error.message }, 500);
  const columns = Object.keys(data?.[0] || { occurred_at: "" });
  const esc = (v) => `"${String(v ?? "").replaceAll('"','""')}"`;
  const csv = [columns.join(","), ...(data || []).map(r => columns.map(k => esc(r[k])).join(","))].join("\n");
  await writeAuthorizationAudit(c, { permission: "opex.export", targetType: "api_usage_events", outcome: "success", metadata: { rows: data?.length || 0 } });
  c.header("Content-Type", "text/csv; charset=utf-8"); c.header("Content-Disposition", "attachment; filename=caastor-api-opex.csv");
  return c.body(csv);
});

export default app;
