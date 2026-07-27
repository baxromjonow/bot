import { getConfig } from "./config.js";
import { sendMessage } from "./telegram.js";
import { getStats } from "./stats.js";
import { getSetting, setSetting } from "./settings.js";
import { TRACK_IDS, trackLabel } from "./tracks.js";

export async function refreshLowQueueAlertState() {
  const stats = await getStats({ fresh: true });
  const state = await getSetting("low_queue_alert_state", { below: {} });
  const threshold = Number(stats.schedule.lowQueueThreshold || 15);
  const below = { ...(state?.below || {}) };
  let changed = false;
  for (const track of TRACK_IDS) {
    const count = Number(stats.tracks?.[track]?.queued || 0);
    if (count > threshold && below[track]) { below[track] = false; changed = true; }
  }
  if (changed) await setSetting("low_queue_alert_state", { below, updatedAt: new Date().toISOString() });
  return stats;
}

export async function notifyLowQueueIfNeeded() {
  const stats = await getStats({ fresh: true });
  const threshold = Number(stats.schedule.lowQueueThreshold || 15);
  const state = await getSetting("low_queue_alert_state", { below: {} });
  const below = { ...(state?.below || {}) };
  const messages = [];
  for (const track of TRACK_IDS) {
    const count = Number(stats.tracks?.[track]?.queued || 0);
    if (count > threshold) { below[track] = false; continue; }
    if (below[track]) continue;
    messages.push(count === 0 ? `🚨 <b>${trackLabel(track)}</b> navbati tugadi.` : `⚠️ <b>${trackLabel(track)}</b>: ${count} ta quiz qoldi.`);
    below[track] = true;
  }
  if (messages.length) {
    await sendMessage(getConfig().adminId, `${messages.join("\n")}\n\nYangi Excel yuklang.`);
    await setSetting("low_queue_alert_state", { below, updatedAt: new Date().toISOString() });
  }
}
