import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { serializeAuthorization } from "../lib/permissions.js";

const app = new Hono();
app.use("*", requireAuth);

const AVATAR_BUCKET = "avatars";
const AVATAR_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

async function updateUserMetadata(userId, changes) {
  const { data: current, error: currentError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (currentError || !current?.user) throw currentError || new Error("User not found");
  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: { ...(current.user.user_metadata || {}), ...changes },
  });
  if (error) throw error;
  return data.user;
}

app.get("/", async (c) => {
  const auth = c.get("auth");
  const { data: team } = await supabaseAdmin
    .from("team_members")
    .select("roles, name, avatar_url")
    .eq("user_id", auth.userId)
    .maybeSingle();
  return c.json({
    id: auth.userId,
    email: auth.email,
    legacyRole: auth.role,
    workspaceId: auth.workspaceId,
    ...serializeAuthorization(auth),
    qualifications: team?.roles || [],
    displayName: team?.name || null,
    avatarUrl: team?.avatar_url || null,
    assuranceLevel: auth.aal,
    mfaRequired: auth.mfaRequired,
    mfaSatisfied: auth.aal === "aal2",
  });
});

app.patch("/profile", async (c) => {
  const auth = c.get("auth");
  const body = await c.req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";

  if (name.length < 2 || name.length > 80) {
    return c.json({ error: "Name must be between 2 and 80 characters." }, 400);
  }

  try {
    const user = await updateUserMetadata(auth.userId, { name, full_name: name });
    return c.json({ name: user.user_metadata?.name || name });
  } catch (error) {
    console.error("Could not update personal profile", error);
    return c.json({ error: "Could not update your personal profile." }, 500);
  }
});

app.post("/avatar", async (c) => {
  const auth = c.get("auth");
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("avatar");
  if (!file || typeof file === "string" || !AVATAR_TYPES.has(file.type)) {
    return c.json({ error: "Choose a JPG, PNG, or WebP image." }, 400);
  }
  if (file.size > 2 * 1024 * 1024) {
    return c.json({ error: "Avatar images must be 2 MB or smaller." }, 400);
  }

  try {
    const { data: buckets, error: bucketListError } = await supabaseAdmin.storage.listBuckets();
    if (bucketListError) throw bucketListError;
    if (!buckets?.some((bucket) => bucket.name === AVATAR_BUCKET)) {
      const { error: bucketError } = await supabaseAdmin.storage.createBucket(AVATAR_BUCKET, {
        public: true,
        fileSizeLimit: "2MB",
        allowedMimeTypes: [...AVATAR_TYPES.keys()],
      });
      if (bucketError) throw bucketError;
    }

    const extension = AVATAR_TYPES.get(file.type);
    const path = `${auth.userId}/avatar.${extension}`;
    const { error: uploadError } = await supabaseAdmin.storage.from(AVATAR_BUCKET).upload(path, await file.arrayBuffer(), {
      contentType: file.type,
      upsert: true,
    });
    if (uploadError) throw uploadError;

    const { data: publicUrl } = supabaseAdmin.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    const avatarUrl = `${publicUrl.publicUrl}?v=${Date.now()}`;
    await updateUserMetadata(auth.userId, { avatar_url: avatarUrl });
    return c.json({ avatarUrl });
  } catch (error) {
    console.error("Could not upload avatar", error);
    return c.json({ error: "Could not upload your avatar." }, 500);
  }
});

export default app;
