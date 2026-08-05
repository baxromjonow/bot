import { insert, select, update } from "./supabase.js";
import { getSchedule, timeToMinutes, zonedNowParts } from "./settings.js";
import { sendAllTracks } from "./sender.js";

export async function sendScheduledQuizIfDue(date = new Date()) {
  const schedule = await getSchedule();
  if (schedule.paused) return { ok: true, skipped: true, message: "Avtomatik yuborish to‘xtatilgan" };

  const parts = zonedNowParts(date, schedule.timezone);
  if (!schedule.days.includes(parts.weekday)) return { ok: true, skipped: true, message: "Bugun quiz kuni emas" };

  const nowMinutes = parts.hour * 60 + parts.minute;
  const GRACE_MINUTES = 4;
  const dueTimes = [...schedule.times]
    .filter((time) => {
      const diff = nowMinutes - timeToMinutes(time);
      return diff >= 0 && diff <= GRACE_MINUTES;
    })
    .sort((a,b) => timeToMinutes(a)-timeToMinutes(b));
  if (!dueTimes.length) return { ok: true, skipped: true, message: "Hozir yuboriladigan slot yo‘q" };

  const slot = dueTimes[dueTimes.length - 1];
  const slotKey = `${parts.dateKey}|${slot}`;
  const existing = await select("schedule_runs", `slot_key=eq.${encodeURIComponent(slotKey)}&select=slot_key,status&limit=1`);
  if (existing?.length) return { ok: true, skipped: true, message: `${slot} slot allaqachon bajarilgan` };

  const claimed = await insert("schedule_runs", { slot_key: slotKey, scheduled_time: slot, status: "processing" }, { ignoreDuplicates: true, onConflict: "slot_key" });
  if (!claimed?.length) return { ok: true, skipped: true, message: `${slot} slot boshqa jarayon tomonidan olingan` };

  try {
    const result = await sendAllTracks();
    await update("schedule_runs", `slot_key=eq.${encodeURIComponent(slotKey)}`, {
      status: result.quizIds.length ? "sent" : "empty",
      quiz_id: result.quizIds[0] || null,
      completed_at: new Date().toISOString()
    });
    return { ...result, scheduledSlot: slot };
  } catch (error) {
    await update("schedule_runs", `slot_key=eq.${encodeURIComponent(slotKey)}`, { status: "failed", completed_at: new Date().toISOString() });
    throw error;
  }
}
