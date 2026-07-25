import { insert, remove, select } from "./supabase.js";

export async function getState(adminId) {
  const rows = await select(
    "admin_states",
    `admin_id=eq.${encodeURIComponent(adminId)}&select=admin_id,step,data&limit=1`
  );
  return rows?.[0] || null;
}

export async function setState(adminId, step, data = {}) {
  const rows = await insert(
    "admin_states",
    { admin_id: adminId, step, data },
    { upsert: true, onConflict: "admin_id" }
  );
  return rows?.[0] || null;
}

export async function clearState(adminId) {
  return remove("admin_states", `admin_id=eq.${encodeURIComponent(adminId)}`);
}
