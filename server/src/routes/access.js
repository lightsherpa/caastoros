import { Hono } from "hono";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { writeAuthorizationAudit } from "../lib/audit.js";
import { hasPermission } from "../lib/permissions.js";

const app = new Hono();
app.use("*", requireAuth);

async function findAuthUserByEmail(email) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLowerCase() === email);
    if (found || data.users.length < 1000) return found || null;
  }
  return null;
}

app.get("/directory", requirePermission("platform.people.manage"), async (c) => {
  const [{ data: people, error: pErr }, { data: workspaces, error: wErr }, { data: assignments }, { data: invitations }] = await Promise.all([
    supabaseAdmin.from("platform_memberships").select("user_id,role,active,created_at,user:users!platform_memberships_user_id_fkey(email)"),
    supabaseAdmin.from("workspaces").select("id,name,tier,created_at,workspace_memberships(user_id,role,is_owner,status,user:users!workspace_memberships_user_id_fkey(email))").order("name"),
    supabaseAdmin.from("workspace_assignments").select("user_id,workspace_id,assigned_by,created_at"),
    supabaseAdmin.from("access_invitations").select("id,email,workspace_id,workspace_role,platform_role,status,expires_at,created_at").order("created_at", { ascending: false }).limit(100),
  ]);
  if (pErr || wErr) return c.json({ error: pErr?.message || wErr?.message }, 500);
  return c.json({ people: people || [], workspaces: workspaces || [], assignments: assignments || [], invitations: invitations || [] });
});

app.patch("/platform-members/:userId", requirePermission("platform.roles.manage", { mfa: true }), async (c) => {
  const auth = c.get("auth");
  const userId = c.req.param("userId");
  const body = await c.req.json().catch(() => ({}));
  const allowed = auth.persona === "super_admin"
    ? ["platform_admin", "creative_director", "designer"]
    : ["creative_director", "designer"];
  if (!allowed.includes(body.role)) return c.json({ error: "Role cannot be granted by this persona" }, 403);
  const { data: prior, error: priorError } = await supabaseAdmin.from("platform_memberships").select("role,active").eq("user_id", userId).maybeSingle();
  if (priorError) return c.json({ error: priorError.message }, 400);
  if (prior?.role === "super_admin") return c.json({ error: "Super Admin membership cannot be changed here" }, 403);
  const { data, error } = await supabaseAdmin.from("platform_memberships")
    .upsert({ user_id: userId, role: body.role, active: body.active !== false, created_by: auth.userId, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
    .select().single();
  await writeAuthorizationAudit(c, { permission: "platform.roles.manage", targetType: "platform_membership", targetId: userId, priorState: prior, newState: data, outcome: error ? "failure" : "success" });
  return error ? c.json({ error: error.message }, 400) : c.json({ membership: data });
});

app.post("/assignments", async (c) => {
  const auth = c.get("auth");
  const { userId, workspaceId } = await c.req.json().catch(() => ({}));
  if (!userId || !workspaceId) return c.json({ error: "userId and workspaceId are required" }, 400);
  if (!hasPermission(auth, "team.assignments.manage", workspaceId) || auth.aal !== "aal2") return c.json({ error: "Forbidden or MFA required" }, 403);
  const { data: target, error: targetError } = await supabaseAdmin.from("platform_memberships").select("role,active").eq("user_id", userId).maybeSingle();
  if (targetError) return c.json({ error: targetError.message }, 400);
  if (!target?.active || !["creative_director", "designer"].includes(target.role)) return c.json({ error: "Only active Creative Directors and Designers can be assigned" }, 409);
  if (auth.persona === "creative_director" && target.role !== "designer") return c.json({ error: "Creative Directors may assign Designers only" }, 403);
  const { data, error } = await supabaseAdmin.from("workspace_assignments")
    .upsert({ user_id: userId, workspace_id: workspaceId, assigned_by: auth.userId }, { onConflict: "workspace_id,user_id" }).select().single();
  await writeAuthorizationAudit(c, { permission: "team.assignments.manage", action: "workspace_assignment.create", targetType: "workspace_assignment", targetId: `${workspaceId}:${userId}`, workspaceId, newState: data, outcome: error ? "failure" : "success" });
  return error ? c.json({ error: error.message }, 400) : c.json({ assignment: data });
});

app.delete("/assignments/:workspaceId/:userId", async (c) => {
  const auth = c.get("auth");
  const workspaceId = c.req.param("workspaceId"), userId = c.req.param("userId");
  if (!hasPermission(auth, "team.assignments.manage", workspaceId) || auth.aal !== "aal2") return c.json({ error: "Forbidden or MFA required" }, 403);
  const { data: prior } = await supabaseAdmin.from("workspace_assignments").select("*").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
  const { error } = await supabaseAdmin.from("workspace_assignments").delete().eq("workspace_id", workspaceId).eq("user_id", userId);
  await writeAuthorizationAudit(c, { permission: "team.assignments.manage", action: "workspace_assignment.delete", targetType: "workspace_assignment", targetId: `${workspaceId}:${userId}`, workspaceId, priorState: prior, outcome: error ? "failure" : "success" });
  return error ? c.json({ error: error.message }, 400) : c.body(null, 204);
});

app.get("/audit", requirePermission("audit.read", { mfa: true }), async (c) => {
  const { data, error } = await supabaseAdmin.from("authorization_audit_events").select("*").order("created_at", { ascending: false }).limit(200);
  return error ? c.json({ error: error.message }, 500) : c.json({ events: data || [] });
});

app.get("/workspace/:workspaceId", async (c) => {
  const auth = c.get("auth");
  const workspaceId = c.req.param("workspaceId");
  if (!hasPermission(auth, "workspace.members.manage", workspaceId)) return c.json({ error:"Forbidden" },403);
  const { data, error } = await supabaseAdmin.from("workspace_memberships")
    .select("user_id,role,is_owner,status,created_at,user:users!workspace_memberships_user_id_fkey(email)").eq("workspace_id",workspaceId).order("created_at");
  return error ? c.json({error:error.message},500) : c.json({members:data||[]});
});

app.post("/invitations", async (c) => {
  const auth = c.get("auth");
  if (auth.aal !== "aal2") return c.json({ error: "Multi-factor authentication required", code: "MFA_REQUIRED" }, 403);
  const body = await c.req.json().catch(() => ({}));
  const platform = !!body.platformRole;
  const permission = platform ? "platform.people.manage" : "workspace.members.manage";
  if (!hasPermission(auth, permission, body.workspaceId || null)) return c.json({error:"Forbidden"},403);
  const allowedPlatformRoles = auth.persona === "super_admin"
    ? ["platform_admin", "creative_director", "designer"]
    : ["creative_director", "designer"];
  if (platform && !allowedPlatformRoles.includes(body.platformRole)) return c.json({error:"This platform role cannot be invited by your persona"},403);
  if (!platform && !body.workspaceId) return c.json({ error: "workspaceId is required" }, 400);
  if (!platform && !["workspace_admin", "user"].includes(body.workspaceRole || "user")) return c.json({ error: "Invalid workspace role" }, 400);
  const row = { email:String(body.email||"").trim().toLowerCase(), invited_by:auth.userId,
    workspace_id:platform?null:body.workspaceId, workspace_role:platform?null:(body.workspaceRole||"user"),
    platform_role:platform?body.platformRole:null };
  if (!row.email.includes("@")) return c.json({error:"Valid email required"},400);
  const { data,error }=await supabaseAdmin.from("access_invitations").insert(row).select().single();
  if (!error) {
    try {
      const existing = await findAuthUserByEmail(row.email);
      if (existing) {
        if (platform) {
          const { data: clientMembership } = await supabaseAdmin.from("workspace_memberships").select("user_id").eq("user_id", existing.id).limit(1);
          if (clientMembership?.length) throw new Error("This account already belongs to a client workspace");
          const { error: userError } = await supabaseAdmin.from("users").update({ workspace_id:null, role:body.platformRole === "platform_admin" ? "admin" : "team" }).eq("id",existing.id);
          if (userError) throw userError;
          const { error: membershipError } = await supabaseAdmin.from("platform_memberships").upsert({user_id:existing.id,role:body.platformRole,active:true,created_by:auth.userId,updated_at:new Date().toISOString()},{onConflict:"user_id"});
          if (membershipError) throw membershipError;
        } else {
          const { data: platformMembership } = await supabaseAdmin.from("platform_memberships").select("user_id").eq("user_id", existing.id).maybeSingle();
          if (platformMembership) throw new Error("Internal accounts cannot be added as client members");
          const { error: userError } = await supabaseAdmin.from("users").update({ workspace_id:row.workspace_id, role:"client" }).eq("id",existing.id);
          if (userError) throw userError;
          const { error: membershipError } = await supabaseAdmin.from("workspace_memberships").upsert({workspace_id:row.workspace_id,user_id:existing.id,role:row.workspace_role,status:"active",invited_by:auth.userId},{onConflict:"workspace_id,user_id"});
          if (membershipError) throw membershipError;
        }
        const { error: acceptError } = await supabaseAdmin.from("access_invitations").update({status:"accepted",accepted_at:new Date().toISOString()}).eq("id",data.id);
        if (acceptError) throw acceptError;
      } else {
        const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(row.email, { redirectTo: process.env.APP_URL || undefined });
        if (inviteError) throw inviteError;
      }
    } catch (inviteError) {
      await supabaseAdmin.from("access_invitations").update({status:"revoked"}).eq("id",data.id);
      await writeAuthorizationAudit(c,{permission,action:"invitation.create",targetType:"access_invitation",targetId:data.id,workspaceId:row.workspace_id,outcome:"failure",reason:inviteError.message});
      return c.json({error:inviteError.message},400);
    }
  }
  await writeAuthorizationAudit(c,{permission,action:"invitation.create",targetType:"access_invitation",targetId:data?.id,workspaceId:row.workspace_id,newState:data,outcome:error?"failure":"success"});
  return error?c.json({error:error.message},400):c.json({invitation:data},201);
});

app.post("/invitations/:id/revoke", async (c) => {
  const auth=c.get("auth"),id=c.req.param("id");
  const {data:invite}=await supabaseAdmin.from("access_invitations").select("*").eq("id",id).maybeSingle();
  if(!invite)return c.json({error:"Invitation not found"},404);
  const permission=invite.platform_role?"platform.people.manage":"workspace.members.manage";
  if(!hasPermission(auth,permission,invite.workspace_id)||auth.aal!=="aal2")return c.json({error:"Forbidden or MFA required"},403);
  const {data,error}=await supabaseAdmin.from("access_invitations").update({status:"revoked"}).eq("id",id).eq("status","pending").select().maybeSingle();
  await writeAuthorizationAudit(c,{permission,action:"invitation.revoke",targetType:"access_invitation",targetId:id,workspaceId:invite.workspace_id,priorState:invite,newState:data,outcome:error?"failure":"success"});
  return error?c.json({error:error.message},400):c.json({invitation:data});
});

app.patch("/workspace/:workspaceId/members/:userId", async (c) => {
  const auth=c.get("auth"),workspaceId=c.req.param("workspaceId"),userId=c.req.param("userId");
  if (!hasPermission(auth,"workspace.members.manage",workspaceId)||auth.aal!=="aal2") return c.json({error:"Forbidden or MFA required"},403);
  const body=await c.req.json().catch(() => ({}));
  const {data:prior,error:priorError}=await supabaseAdmin.from("workspace_memberships").select("*").eq("workspace_id",workspaceId).eq("user_id",userId).maybeSingle();
  if(priorError)return c.json({error:priorError.message},400);
  if(!prior)return c.json({error:"Workspace member not found"},404);
  if (prior?.is_owner && body.status!=="active") return c.json({error:"Transfer ownership before suspending the owner"},409);
  if(prior?.is_owner&&body.role==="user")return c.json({error:"Transfer ownership before demoting the owner"},409);
  const patch={}; if(["workspace_admin","user"].includes(body.role))patch.role=body.role;if(["active","suspended"].includes(body.status))patch.status=body.status;
  if(!Object.keys(patch).length)return c.json({error:"A valid role or status change is required"},400);
  const {data,error}=await supabaseAdmin.from("workspace_memberships").update(patch).eq("workspace_id",workspaceId).eq("user_id",userId).select().single();
  await writeAuthorizationAudit(c,{permission:"workspace.members.manage",action:"workspace_member.update",targetType:"workspace_membership",targetId:userId,workspaceId,priorState:prior,newState:data,outcome:error?"failure":"success"});
  return error?c.json({error:error.message},400):c.json({membership:data});
});

app.post("/workspace/:workspaceId/transfer-ownership", async (c) => {
  const auth=c.get("auth"),workspaceId=c.req.param("workspaceId");
  if (!hasPermission(auth,"workspace.members.manage",workspaceId)||auth.aal!=="aal2") return c.json({error:"Forbidden or MFA required"},403);
  const {userId,reason}=await c.req.json().catch(() => ({})); if(!userId||!reason?.trim())return c.json({error:"userId and reason are required"},400);
  const {data:target,error:targetError}=await supabaseAdmin.from("workspace_memberships").select("user_id,status").eq("workspace_id",workspaceId).eq("user_id",userId).maybeSingle();
  if(targetError)return c.json({error:targetError.message},400);
  if(!target)return c.json({error:"New owner must already be a workspace member"},404);
  const {data:current,error:currentError}=await supabaseAdmin.from("workspace_memberships").select("user_id").eq("workspace_id",workspaceId).eq("is_owner",true).maybeSingle();
  if(currentError)return c.json({error:currentError.message},400);
  const {data,error}=await supabaseAdmin.rpc("transfer_workspace_ownership",{p_workspace_id:workspaceId,p_new_owner_id:userId});
  await writeAuthorizationAudit(c,{permission:"workspace.members.manage",action:"workspace.ownership.transfer",targetType:"workspace",targetId:workspaceId,workspaceId,priorState:current,newState:data,outcome:error?"failure":"success",reason});
  return error?c.json({error:error.message},400):c.json({owner:data});
});

export default app;
