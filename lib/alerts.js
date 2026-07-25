import { getConfig } from "./config.js";
import { sendMessage } from "./telegram.js";
import { getStats } from "./stats.js";
import { getSetting, setSetting } from "./settings.js";

export async function refreshLowQueueAlertState() {
  const stats = await getStats();
  const state = await getSetting("low_queue_alert_state", { below: false });
  const threshold = Number(stats.schedule.lowQueueThreshold || 15);
  if (stats.queued > threshold && state?.below) {
    await setSetting("low_queue_alert_state", { below: false, updatedAt: new Date().toISOString() });
  }
  return stats;
}

export async function notifyLowQueueIfNeeded() {
  const stats = await getStats();
  const threshold = Number(stats.schedule.lowQueueThreshold || 15);
  const state = await getSetting("low_queue_alert_state", { below: false });

  if (stats.queued > threshold) {
    if (state?.below) {
      await setSetting("low_queue_alert_state", { below: false, updatedAt: new Date().toISOString() });
    }
    return;
  }
  if (state?.below) return;

  const { adminId } = getConfig();
  const message = stats.queued === 0
    ? "🚨 <b>Quiz navbati tugadi.</b> Yangi Excel yuklang."
    : `⚠️ <b>Navbatda ${stats.queued} ta quiz qoldi.</b> Hozirgi jadval bo‘yicha taxminan ${Math.ceil(stats.queued / 3)} ish kuniga yetadi.`;
  await sendMessage(adminId, message);
  await setSetting("low_queue_alert_state", {
    below: true,
    count: stats.queued,
    updatedAt: new Date().toISOString()
  });
}
