import { insert, select } from "./supabase.js";

export const DEFAULT_SCHEDULE = {
  timezone: "Asia/Tashkent",
  days: [1, 2, 3, 4, 5, 6],
  times: ["09:00", "14:00", "19:00"],
  paused: false,
  lowQueueThreshold: 15
};

export async function getSetting(key, fallback = null) {
  const rows = await select(
    "app_settings",
    `key=eq.${encodeURIComponent(key)}&select=key,value&limit=1`
  );
  return rows?.[0]?.value ?? fallback;
}

export async function setSetting(key, value) {
  const rows = await insert(
    "app_settings",
    { key, value, updated_at: new Date().toISOString() },
    { upsert: true, onConflict: "key" }
  );
  return rows?.[0]?.value ?? value;
}

export async function getSchedule() {
  const saved = await getSetting("schedule", {});
  return {
    ...DEFAULT_SCHEDULE,
    ...(saved || {}),
    times: Array.isArray(saved?.times) && saved.times.length ? saved.times : DEFAULT_SCHEDULE.times,
    days: Array.isArray(saved?.days) && saved.days.length ? saved.days : DEFAULT_SCHEDULE.days
  };
}

export async function updateSchedule(patch) {
  const current = await getSchedule();
  return setSetting("schedule", { ...current, ...patch });
}

export function normalizeTime(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function timeToMinutes(value) {
  const normalized = normalizeTime(value);
  if (!normalized) return Number.NaN;
  const [h, m] = normalized.split(":").map(Number);
  return h * 60 + m;
}

export function zonedNowParts(date = new Date(), timezone = "Asia/Tashkent") {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((part) => [part.type, part.value]));
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    weekday: weekdayMap[parts.weekday],
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`
  };
}

export function nextScheduleLabel(schedule, date = new Date()) {
  if (schedule.paused) return "⏸ To‘xtatilgan";
  const parts = zonedNowParts(date, schedule.timezone);
  const nowMinutes = parts.hour * 60 + parts.minute;
  const times = [...schedule.times].sort((a, b) => timeToMinutes(a) - timeToMinutes(b));

  if (schedule.days.includes(parts.weekday)) {
    const next = times.find((time) => timeToMinutes(time) > nowMinutes);
    if (next) return `Bugun ${next}`;
  }
  return `Keyingi ish kuni ${times[0] || "09:00"}`;
}
