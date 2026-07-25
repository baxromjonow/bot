import { getConfig } from "./config.js";
import { clearState, getState, setState } from "./state.js";
import { insert, remove, select, update } from "./supabase.js";
import { answerCallbackQuery, downloadTelegramFile, sendDocument, sendMessage } from "./telegram.js";
import { sendNextQuiz } from "./sender.js";
import { parseQuizWorkbook } from "./excel.js";
import { quizFingerprint } from "./fingerprint.js";
import { createBackupWorkbook } from "./backup.js";
import { getStats } from "./stats.js";
import { getSchedule, normalizeTime, updateSchedule } from "./settings.js";
import { refreshLowQueueAlertState } from "./alerts.js";

const HELP = `
<b>Aziz Academy Quiz Bot</b>

/panel — boshqaruv paneli
/addquiz — yangi quiz qo‘shish
/excel — Excel fayldan quizlarni ommaviy qo‘shish
/queue — navbatdagi quizlarni ko‘rish
/stats — statistika
/sendnow — keyingi quizni hozir yuborish
/groups — faol guruhlar
/settings — jadval sozlamalari
/pause — avtomatik yuborishni to‘xtatish
/resume — avtomatik yuborishni davom ettirish
/clearqueue — navbatni tozalash
/resetbot — quiz va tarixni nollash, guruhlar qoladi
/backup — Excel backup olish
/cancel — joriy amalni bekor qilish

Guruh ichida:
/register — guruhni ro‘yxatga olish
/removegroup — guruhni ro‘yxatdan chiqarish
`;

const PANEL = {
  inline_keyboard: [
    [
      { text: "➕ Quiz qo‘shish", callback_data: "panel:addquiz" },
      { text: "📥 Excel yuklash", callback_data: "panel:excel" }
    ],
    [
      { text: "📋 Navbat", callback_data: "panel:queue" },
      { text: "📊 Statistika", callback_data: "panel:stats" }
    ],
    [
      { text: "🚀 Hozir yuborish", callback_data: "panel:sendnow" },
      { text: "👥 Guruhlar", callback_data: "panel:groups" }
    ],
    [
      { text: "⏸ Pauza", callback_data: "panel:pause" },
      { text: "▶️ Davom", callback_data: "panel:resume" }
    ],
    [
      { text: "⚙️ Sozlamalar", callback_data: "panel:settings" },
      { text: "💾 Backup", callback_data: "panel:backup" }
    ],
    [
      { text: "🧹 Queue tozalash", callback_data: "panel:clearqueue" },
      { text: "🔄 Reset", callback_data: "panel:resetbot" }
    ]
  ]
};

function commandOf(text = "") {
  const token = text.trim().split(/\s+/)[0] || "";
  return token.split("@")[0].toLowerCase();
}

function isAdmin(userId) {
  return String(userId) === getConfig().adminId;
}

function escapeHtml(value = "") {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function showPanel(chatId) {
  return sendMessage(chatId, "🎛 <b>Aziz Academy Quiz Bot — Admin panel</b>\n\nKerakli bo‘limni tanlang:", {
    reply_markup: PANEL
  });
}

async function showQueue(chatId) {
  const quizzes = await select(
    "quizzes",
    "status=eq.queued&select=id,question,category,created_at&order=id.asc&limit=20"
  );
  if (!quizzes?.length) return sendMessage(chatId, "Navbatda quiz yo‘q.");
  const lines = quizzes.map((q, index) => {
    const category = q.category ? ` <i>[${escapeHtml(q.category)}]</i>` : "";
    return `${index + 1}. <b>#${q.id}</b>${category} — ${escapeHtml(q.question)}`;
  });
  return sendMessage(chatId, `<b>Navbatdagi quizlar:</b>\n\n${lines.join("\n")}\n\n<i>Ko‘pi bilan 20 tasi ko‘rsatiladi.</i>`);
}

async function showGroups(chatId) {
  const groups = await select("groups", "active=eq.true&select=chat_id,title,added_at&order=added_at.asc");
  if (!groups?.length) return sendMessage(chatId, "Hali faol guruh ro‘yxatdan o‘tmagan.");
  const lines = groups.map((g, index) => `${index + 1}. ${escapeHtml(g.title || String(g.chat_id))}`);
  return sendMessage(chatId, `<b>Faol guruhlar:</b>\n\n${lines.join("\n")}`);
}

async function showStats(chatId) {
  const s = await getStats();
  const times = s.schedule.times.join(" • ");
  const auto = s.schedule.paused ? "⏸ To‘xtatilgan" : "✅ Ishlayapti";
  return sendMessage(
    chatId,
    `📊 <b>Aziz Academy Quiz Bot</b>\n\n` +
      `📝 Jami quizlar: <b>${s.total}</b>\n` +
      `⏳ Navbatda: <b>${s.queued}</b>\n` +
      `✅ Yuborilgan: <b>${s.sent}</b>\n` +
      `⚠️ Failed: <b>${s.failed}</b>\n` +
      `👥 Faol guruhlar: <b>${s.groups}</b>\n\n` +
      `📅 Bugun yuborildi: <b>${s.sentToday}/3</b>\n` +
      `⏰ Jadval: <b>${times}</b>\n` +
      `🤖 Avto yuborish: <b>${auto}</b>\n` +
      `➡️ Keyingi: <b>${escapeHtml(s.nextLabel)}</b>`
  );
}

async function showSettings(chatId) {
  const schedule = await getSchedule();
  return sendMessage(
    chatId,
    `⚙️ <b>Quiz sozlamalari</b>\n\n` +
      `🕒 Vaqtlar: <b>${schedule.times.join(" • ")}</b>\n` +
      `📆 Kunlar: <b>Dushanba–Shanba</b>\n` +
      `🌍 Timezone: <b>${escapeHtml(schedule.timezone)}</b>\n` +
      `⚠️ Queue ogohlantirish: <b>${schedule.lowQueueThreshold} ta</b>\n` +
      `🤖 Holat: <b>${schedule.paused ? "Pauzada" : "Faol"}</b>`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "⏰ Vaqtlarni o‘zgartirish", callback_data: "settings:times" }],
          [{ text: "⚠️ Ogohlantirish chegarasi", callback_data: "settings:threshold" }],
          [
            { text: "⏸ Pauza", callback_data: "panel:pause" },
            { text: "▶️ Davom", callback_data: "panel:resume" }
          ]
        ]
      }
    }
  );
}

async function sendNow(chatId) {
  await sendMessage(chatId, "Keyingi quiz guruhlarga yuborilmoqda…");
  const result = await sendNextQuiz();
  return sendMessage(
    chatId,
    `${escapeHtml(result.message)}\n\nYuborildi: <b>${result.sent || 0}</b>\nXato: <b>${result.failed || 0}</b>`
  );
}

async function sendBackup(chatId) {
  await sendMessage(chatId, "💾 Backup tayyorlanmoqda…");
  const buffer = await createBackupWorkbook();
  const stamp = new Date().toISOString().slice(0, 10);
  return sendDocument(chatId, buffer, `Aziz_Academy_Backup_${stamp}.xlsx`, "✅ Quizlar va guruhlar backupi");
}

function confirmKeyboard(action) {
  return {
    inline_keyboard: [[
      { text: "✅ Ha, davom et", callback_data: `${action}:yes` },
      { text: "❌ Bekor qilish", callback_data: `${action}:no` }
    ]]
  };
}

async function clearQueue(chatId) {
  const deleted = await remove("quizzes", "status=in.(queued,processing)");
  await refreshLowQueueAlertState();
  return sendMessage(chatId, `🧹 Queue tozalandi. <b>${deleted?.length || 0} ta</b> yuborilmagan quiz o‘chirildi.`);
}

async function resetBot(chatId, adminId) {
  await remove("quizzes", "id=gt.0");
  await remove("schedule_runs", "slot_key=not.is.null");
  await clearState(adminId);
  await insert(
    "app_settings",
    { key: "low_queue_alert_state", value: { below: false }, updated_at: new Date().toISOString() },
    { upsert: true, onConflict: "key" }
  );
  return sendMessage(chatId, "🔄 <b>General reset bajarildi.</b>\n\nQuizlar va yuborish tarixi tozalandi. Guruhlar va jadval sozlamalari saqlandi.");
}

async function importExcel(chatId, adminId, document) {
  const fileName = document.file_name || "";
  if (!fileName.toLowerCase().endsWith(".xlsx")) return sendMessage(chatId, "Faqat <b>.xlsx</b> formatdagi Excel fayl qabul qilinadi.");
  if (document.file_size && document.file_size > 5 * 1024 * 1024) return sendMessage(chatId, "Excel fayl 5 MB dan kichik bo‘lishi kerak.");

  await sendMessage(chatId, "Excel o‘qilmoqda, quizlar tekshirilmoqda va takrorlar ajratilmoqda…");
  const buffer = await downloadTelegramFile(document.file_id);
  const { quizzes, validationErrors } = await parseQuizWorkbook(buffer);

  if (validationErrors.length) {
    const details = validationErrors.slice(0, 10).map((item) => `• <b>${item.rowNumber}-qator:</b> ${escapeHtml(item.errors.join(" "))}`);
    const extra = validationErrors.length > 10 ? `\n… yana ${validationErrors.length - 10} ta xatoli qator bor.` : "";
    return sendMessage(chatId, `<b>Excelda xatolar bor.</b> Hech narsa bazaga qo‘shilmadi.\n\n${details.join("\n")}${extra}`);
  }
  if (quizzes.length > 500) return sendMessage(chatId, "Bir faylda ko‘pi bilan <b>500 ta</b> quiz yuklang.");

  const insertedRows = [];
  const batchSize = 100;
  for (let i = 0; i < quizzes.length; i += batchSize) {
    const batch = quizzes.slice(i, i + batchSize);
    const rows = await insert("quizzes", batch, { ignoreDuplicates: true, onConflict: "fingerprint" });
    insertedRows.push(...(rows || []));
  }

  const duplicates = quizzes.length - insertedRows.length;
  const byCategory = insertedRows.reduce((acc, q) => {
    const key = q.category || "Boshqa";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const categoryLines = Object.entries(byCategory)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, count]) => `• ${escapeHtml(name)} — <b>${count}</b>`)
    .join("\n");

  await clearState(adminId);
  await refreshLowQueueAlertState();
  return sendMessage(
    chatId,
    `✅ <b>${insertedRows.length} ta yangi quiz</b> navbatga qo‘shildi.\n` +
      `♻️ Takroriy: <b>${duplicates} ta</b> qo‘shilmadi.` +
      (categoryLines ? `\n\n<b>Kategoriyalar:</b>\n${categoryLines}` : "") +
      `\n\n/queue — navbat\n/stats — statistika`
  );
}

async function handlePrivateAdminMessage(message) {
  const chatId = message.chat.id;
  const adminId = String(message.from.id);
  const text = message.text?.trim() || "";
  const command = commandOf(text);

  if (command === "/start" || command === "/help") {
    await clearState(adminId);
    await sendMessage(chatId, HELP);
    return showPanel(chatId);
  }
  if (command === "/panel") return showPanel(chatId);
  if (command === "/cancel") {
    await clearState(adminId);
    return sendMessage(chatId, "Amal bekor qilindi.");
  }
  if (command === "/addquiz") {
    await setState(adminId, "question", {});
    return sendMessage(chatId, "Quiz savolini yuboring:");
  }
  if (command === "/excel") {
    await setState(adminId, "excel_file", {});
    return sendMessage(chatId, "Excel <b>.xlsx</b> faylini yuboring. Kategoriya ustuni ixtiyoriy.");
  }
  if (command === "/queue") return showQueue(chatId);
  if (command === "/groups") return showGroups(chatId);
  if (command === "/stats") return showStats(chatId);
  if (command === "/settings") return showSettings(chatId);
  if (command === "/sendnow") return sendNow(chatId);
  if (command === "/pause") {
    await updateSchedule({ paused: true });
    return sendMessage(chatId, "⏸ Avtomatik quiz yuborish to‘xtatildi. /sendnow ishlashda davom etadi.");
  }
  if (command === "/resume") {
    await updateSchedule({ paused: false });
    return sendMessage(chatId, "▶️ Avtomatik quiz yuborish davom ettirildi.");
  }
  if (command === "/clearqueue") {
    return sendMessage(chatId, "⚠️ Navbatdagi barcha yuborilmagan quizlar o‘chiriladi. Davom etamizmi?", { reply_markup: confirmKeyboard("clearqueue") });
  }
  if (command === "/resetbot") {
    return sendMessage(chatId, "🚨 <b>General reset</b>: quizlar va yuborish tarixi o‘chiriladi. Guruhlar saqlanadi. Davom etamizmi?", { reply_markup: confirmKeyboard("resetbot") });
  }
  if (command === "/backup") return sendBackup(chatId);

  const state = await getState(adminId);
  if (!state) return sendMessage(chatId, HELP);
  const data = state.data || {};

  switch (state.step) {
    case "excel_file": {
      if (!message.document) return sendMessage(chatId, "Iltimos, <b>.xlsx</b> fayl yuboring yoki /cancel bosing.");
      try {
        return await importExcel(chatId, adminId, message.document);
      } catch (error) {
        console.error(error);
        return sendMessage(chatId, `Excelni import qilib bo‘lmadi: <b>${escapeHtml(error?.message || "Noma’lum xato")}</b>`);
      }
    }
    case "schedule_times": {
      const items = text.split(/[\s,;]+/).filter(Boolean).map(normalizeTime);
      if (items.length !== 3 || items.some((v) => !v) || new Set(items).size !== 3) {
        return sendMessage(chatId, "3 ta turli vaqt kiriting. Masalan: <b>09:00 14:00 19:00</b>");
      }
      const times = items.sort();
      await updateSchedule({ times });
      await clearState(adminId);
      return sendMessage(chatId, `✅ Yangi vaqtlar: <b>${times.join(" • ")}</b>\n\nGitHub Action har 5 daqiqada tekshiradi va shu vaqtlar kelganda quiz yuboradi.`);
    }
    case "threshold": {
      const threshold = Number(text);
      if (!Number.isInteger(threshold) || threshold < 1 || threshold > 1000) {
        return sendMessage(chatId, "1 dan 1000 gacha butun son yuboring. Masalan: <b>15</b>");
      }
      await updateSchedule({ lowQueueThreshold: threshold });
      await clearState(adminId);
      await refreshLowQueueAlertState();
      return sendMessage(chatId, `✅ Queue ogohlantirish chegarasi <b>${threshold}</b> ta qilindi.`);
    }
    case "question":
      if (!text) return sendMessage(chatId, "Savol bo‘sh bo‘lmasin. Qayta yuboring:");
      await setState(adminId, "option1", { question: text, options: [] });
      return sendMessage(chatId, "1-variantni yuboring:");
    case "option1":
    case "option2":
    case "option3":
    case "option4": {
      if (!text) return sendMessage(chatId, "Variant bo‘sh bo‘lmasin. Qayta yuboring:");
      const number = Number(state.step.replace("option", ""));
      const options = [...(data.options || []), text];
      if (number < 4) {
        await setState(adminId, `option${number + 1}`, { ...data, options });
        return sendMessage(chatId, `${number + 1}-variantni yuboring:`);
      }
      await setState(adminId, "correct", { ...data, options });
      return sendMessage(chatId, "To‘g‘ri javob raqamini yuboring: <b>1, 2, 3 yoki 4</b>");
    }
    case "correct": {
      const correct = Number(text);
      if (![1, 2, 3, 4].includes(correct)) return sendMessage(chatId, "Faqat <b>1, 2, 3 yoki 4</b> yuboring:");
      await setState(adminId, "explanation", { ...data, correct_option: correct - 1 });
      return sendMessage(chatId, "Javob izohini yuboring. Kerak bo‘lmasa <b>-</b> yuboring:");
    }
    case "explanation": {
      const explanation = text === "-" ? null : text;
      const rows = await insert(
        "quizzes",
        {
          question: data.question,
          options: data.options,
          correct_option: data.correct_option,
          explanation,
          category: "Qo‘lda",
          fingerprint: quizFingerprint(data.question),
          status: "queued"
        },
        { ignoreDuplicates: true, onConflict: "fingerprint" }
      );
      await clearState(adminId);
      if (!rows?.length) return sendMessage(chatId, "♻️ Bu savol bazada allaqachon mavjud. Takroriy quiz qo‘shilmadi.");
      await refreshLowQueueAlertState();
      return sendMessage(chatId, `✅ Quiz navbatga qo‘shildi.\n\n<b>#${rows[0].id}</b> ${escapeHtml(data.question)}`);
    }
    default:
      await clearState(adminId);
      return sendMessage(chatId, "Holat tozalandi. /panel orqali davom eting.");
  }
}

async function handleCallback(callback) {
  const adminId = String(callback.from.id);
  const chatId = callback.message?.chat?.id;
  if (!isAdmin(callback.from.id) || !chatId) return answerCallbackQuery(callback.id, "Ruxsat yo‘q");
  await answerCallbackQuery(callback.id);

  const action = callback.data || "";
  if (action === "panel:addquiz") {
    await setState(adminId, "question", {});
    return sendMessage(chatId, "Quiz savolini yuboring:");
  }
  if (action === "panel:excel") {
    await setState(adminId, "excel_file", {});
    return sendMessage(chatId, "📥 <b>.xlsx</b> faylni yuboring.");
  }
  if (action === "panel:queue") return showQueue(chatId);
  if (action === "panel:stats") return showStats(chatId);
  if (action === "panel:sendnow") return sendNow(chatId);
  if (action === "panel:groups") return showGroups(chatId);
  if (action === "panel:settings") return showSettings(chatId);
  if (action === "panel:backup") return sendBackup(chatId);
  if (action === "panel:pause") {
    await updateSchedule({ paused: true });
    return sendMessage(chatId, "⏸ Avtomatik yuborish to‘xtatildi.");
  }
  if (action === "panel:resume") {
    await updateSchedule({ paused: false });
    return sendMessage(chatId, "▶️ Avtomatik yuborish davom ettirildi.");
  }
  if (action === "panel:clearqueue") {
    return sendMessage(chatId, "⚠️ Navbatdagi barcha yuborilmagan quizlarni o‘chiramizmi?", { reply_markup: confirmKeyboard("clearqueue") });
  }
  if (action === "panel:resetbot") {
    return sendMessage(chatId, "🚨 Quizlar va yuborish tarixini nollaymizmi? Guruhlar saqlanadi.", { reply_markup: confirmKeyboard("resetbot") });
  }
  if (action === "clearqueue:yes") return clearQueue(chatId);
  if (action === "clearqueue:no" || action === "resetbot:no") return sendMessage(chatId, "❌ Amal bekor qilindi.");
  if (action === "resetbot:yes") return resetBot(chatId, adminId);
  if (action === "settings:times") {
    await setState(adminId, "schedule_times", {});
    return sendMessage(chatId, "3 ta yuborish vaqtini bitta xabarda yozing. Masalan:\n<b>09:00 14:00 19:00</b>");
  }
  if (action === "settings:threshold") {
    await setState(adminId, "threshold", {});
    return sendMessage(chatId, "Nechta quiz qolganda ogohlantiray? Masalan: <b>15</b>");
  }
  return sendMessage(chatId, "Bu tugma uchun amal topilmadi. /panel ni qayta oching.");
}

async function handleGroupMessage(message) {
  if (!message.from || !isAdmin(message.from.id)) return;
  const command = commandOf(message.text || "");
  const chatId = message.chat.id;
  const title = message.chat.title || `Guruh ${chatId}`;

  if (command === "/register") {
    await insert("groups", { chat_id: chatId, title, active: true }, { upsert: true, onConflict: "chat_id" });
    return sendMessage(chatId, `✅ <b>${escapeHtml(title)}</b> quiz tarqatish ro‘yxatiga qo‘shildi.`);
  }
  if (command === "/removegroup") {
    await update("groups", `chat_id=eq.${chatId}`, { active: false });
    return sendMessage(chatId, "Guruh quiz tarqatish ro‘yxatidan chiqarildi.");
  }
}

export async function handleUpdate(update) {
  if (update.callback_query) return handleCallback(update.callback_query);
  const message = update.message;
  if (!message) return;

  if (message.chat?.type === "private") {
    if (!message.from || !isAdmin(message.from.id)) {
      return sendMessage(message.chat.id, "Bu bot faqat administrator tomonidan boshqariladi.");
    }
    return handlePrivateAdminMessage(message);
  }
  if (["group", "supergroup"].includes(message.chat?.type)) return handleGroupMessage(message);
}
