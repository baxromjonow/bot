import { rpc } from "./supabase.js";
import { getSchedule, nextScheduleLabel } from "./settings.js";

export async function getStats() {
  const schedule = await getSchedule();
  const rows = await rpc("get_quiz_stats", { p_timezone: schedule.timezone });
  const stats = Array.isArray(rows) ? rows[0] : rows;
  return {
    total: Number(stats?.total || 0),
    queued: Number(stats?.queued || 0),
    sent: Number(stats?.sent || 0),
    failed: Number(stats?.failed || 0),
    groups: Number(stats?.groups || 0),
    sentToday: Number(stats?.sent_today || 0),
    schedule,
    nextLabel: nextScheduleLabel(schedule)
  };
}
