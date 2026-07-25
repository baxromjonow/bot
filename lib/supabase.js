import { getConfig } from "./config.js";

async function request(path, { method = "GET", body, prefer } = {}) {
  const { supabaseUrl, supabaseServiceKey } = getConfig();
  const headers = {
    apikey: supabaseServiceKey,
    Authorization: `Bearer ${supabaseServiceKey}`,
    "Content-Type": "application/json"
  };
  if (prefer) headers.Prefer = prefer;

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    throw new Error(`Supabase xatosi (${response.status}): ${typeof data === "string" ? data : JSON.stringify(data)}`);
  }
  return data;
}

export function select(table, query = "") {
  return request(`${table}?${query}`);
}

export async function selectAll(table, query = "", chunkSize = 1000) {
  const rows = [];
  let offset = 0;
  while (true) {
    const suffix = query ? `${query}&` : "";
    const batch = await select(table, `${suffix}limit=${chunkSize}&offset=${offset}`);
    rows.push(...(batch || []));
    if (!batch || batch.length < chunkSize) break;
    offset += chunkSize;
  }
  return rows;
}

export function insert(table, body, { upsert = false, ignoreDuplicates = false, onConflict = "" } = {}) {
  const suffix = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : "";
  let resolution = "";
  if (upsert) resolution = "resolution=merge-duplicates,";
  if (ignoreDuplicates) resolution = "resolution=ignore-duplicates,";
  return request(`${table}${suffix}`, {
    method: "POST",
    body,
    prefer: `${resolution}return=representation`
  });
}

export function update(table, query, body) {
  return request(`${table}?${query}`, {
    method: "PATCH",
    body,
    prefer: "return=representation"
  });
}

export function remove(table, query) {
  return request(`${table}?${query}`, {
    method: "DELETE",
    prefer: "return=representation"
  });
}

export function rpc(name, body = {}) {
  return request(`rpc/${name}`, {
    method: "POST",
    body,
    prefer: "return=representation"
  });
}
