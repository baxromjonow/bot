import { rpc } from "./supabase.js";
import { getSchedule, nextScheduleLabel } from "./settings.js";

const CACHE_TTL_MS = 12_000;
let statsCache = null;
let statsCacheUntil = 0;

export function clearStatsCache() { statsCache = null; statsCacheUntil = 0; }

export async function getStats({ fresh = false } = {}) {
  const now = Date.now();
  if (!fresh && statsCache && now < statsCacheUntil) return statsCache;
  const schedule = await getSchedule();
  const rows = await rpc("get_track_stats", { p_timezone: schedule.timezone });
  const stats = Array.isArray(rows) ? rows[0] : rows;
  const result = {
    total: Number(stats?.total || 0), queued: Number(stats?.queued || 0), sent: Number(stats?.sent || 0), failed: Number(stats?.failed || 0),
    groups: Number(stats?.groups || 0), sentToday: Number(stats?.sent_today || 0), tracks: stats?.tracks || {}, schedule,
    nextLabel: nextScheduleLabel(schedule)
  };
  statsCache = result; statsCacheUntil = now + CACHE_TTL_MS; return result;
}
