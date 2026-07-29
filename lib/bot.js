import { getConfig } from "./config.js";
import { clearState, getState, setState } from "./state.js";
import { insert, remove, select, update } from "./supabase.js";
import { answerCallbackQuery, downloadTelegramFile, editMessage, getChatMember, sendDocument, sendMessage } from "./telegram.js";
import { quizFingerprint } from "./fingerprint.js";
import { getSchedule, normalizeTime, updateSchedule } from "./settings.js";
import { refreshLowQueueAlertState } from "./alerts.js";
import { SUBJECT_IDS, isSubject, subjectKeyboard, lessonKeyboard, subjectLabel, lessonToQuizStart } from "./subjects.js";
import { trackLabel } from "./tracks.js";

const HELP = `
<b>Aziz Academy Quiz Bot</b>

/panel — boshqaruv paneli
/addquiz — yangi quiz qo‘shish
/excel — Excel fayldan quizlarni qo‘shish
/queue — yo‘nalishlar bo‘yicha navbat
/stats — statistika
/sendnow — quizni hozir yuborish
/groups — guruhlar va yo‘nalishlar
/settings — jadval sozlamalari
/pause — avtomatik yuborishni to‘xtatish
/resume — davom ettirish
/clearqueue — navbatni tozalash
/resetbot — quiz va tarixni nollash, guruhlar qoladi
/backup — Excel backup
/special — maxsus quizlar
/cancel — joriy amalni bekor qilish

Guruh ichida:
/connect — guruhni yo‘nalishga ulash
/removegroup — guruhni ro‘yxatdan chiqarish
`;

const PANEL = { inline_keyboard: [
  [{ text: "➕ Quiz qo‘shish", callback_data: "panel:addquiz" }, { text: "📥 Excel yuklash", callback_data: "panel:excel" }],
  [{ text: "⚡ Maxsus quiz", callback_data: "panel:special" }],
  [{ text: "📋 Navbat", callback_data: "panel:queue" }, { text: "📊 Statistika", callback_data: "panel:stats" }],
  [{ text: "🚀 Hozir yuborish", callback_data: "panel:sendnow" }, { text: "👥 Guruhlar", callback_data: "panel:groups" }],
  [{ text: "⏸ Pauza", callback_data: "panel:pause" }, { text: "▶️ Davom", callback_data: "panel:resume" }],
  [{ text: "⚙️ Sozlamalar", callback_data: "panel:settings" }, { text: "💾 Backup", callback_data: "panel:backup" }],
  [{ text: "🧹 Queue tozalash", callback_data: "panel:clearqueue" }, { text: "🔄 Reset", callback_data: "panel:resetbot" }]
]};

const REPLY_MENU = { keyboard: [
  [{ text: "🎛 Menu" }, { text: "📊 Statistika" }],
  [{ text: "📥 Excel" }, { text: "📋 Navbat" }],
  [{ text: "⚡ Maxsus quiz" }],
  [{ text: "🚀 Hozir yuborish" }, { text: "👥 Guruhlar" }],
  [{ text: "⚙️ Sozlamalar" }, { text: "💾 Backup" }]
], resize_keyboard: true, is_persistent: false };

function commandOf(text = "") { const token = text.trim().split(/\s+/)[0] || ""; return token.split("@")[0].toLowerCase(); }
function isAdmin(userId) { return String(userId) === getConfig().adminId; }
async function isGroupAdmin(chatId, userId) {
  try {
    const member = await getChatMember(chatId, userId);
    return ["creator", "administrator"].includes(member?.status);
  } catch (error) {
    console.error("Guruh adminini tekshirishda xato:", error);
    return false;
  }
}
function escapeHtml(value = "") { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
function trackFingerprint(track, question) { return `${track}|${quizFingerprint(question)}`; }

async function showPanel(chatId) { return sendMessage(chatId, "🎛 <b>Aziz Academy Quiz Bot — Admin panel</b>\n\nKerakli bo‘limni tanlang:", { reply_markup: PANEL }); }

async function showQueue(chatId) {
  const groups = await select("groups", "active=eq.true&select=chat_id,title,subject,quiz_position,added_at&order=added_at.asc");
  if (!groups?.length) {
    return sendMessage(chatId, "📋 <b>Guruhlar progressi</b>\n\n<i>Hali faol guruh yo‘q.</i>");
  }

  const lines = groups.map((g, i) => {
    const pos = Math.min(72, Math.max(1, Number(g.quiz_position || 1)));
    const lesson = Math.min(12, Math.floor((pos - 1) / 6) + 1);
    const subject = g.subject ? subjectLabel(g.subject) : "⚠️ Fan tanlanmagan";
    return `${i + 1}. <b>${escapeHtml(g.title || String(g.chat_id))}</b>\n${subject} | 📖 ${lesson}/12-dars | 🧠 ${pos}/72 | ➡️ Keyingi: ${pos}`;
  });

  return sendMessage(chatId, `📋 <b>Guruhlar progressi</b>\n\n${lines.join("\n\n")}`);
}

async function showGroups(chatId) {
  const groups = await select("groups", "active=eq.true&select=chat_id,title,subject,quiz_position,added_at&order=added_at.asc");
  if (!groups?.length) return sendMessage(chatId, "Hali faol guruh ro‘yxatdan o‘tmagan.");
  const lines = groups.map((g, i) => `${i + 1}. <b>${escapeHtml(g.title || String(g.chat_id))}</b> — ${g.subject ? `${subjectLabel(g.subject)} — ${g.quiz_position || 1}/72` : "⚠️ Fan tanlanmagan"}`);
  const buttons = groups.slice(0, 20).map((g) => [{ text: `🔄 ${String(g.title || g.chat_id).slice(0, 28)}`, callback_data: `groupchoose:${g.chat_id}` }]);
  return sendMessage(chatId, `<b>Faol guruhlar:</b>\n\n${lines.join("\n")}\n\nYo‘nalishni almashtirish uchun guruhni tanlang:`, { reply_markup: { inline_keyboard: buttons } });
}

async function showStats(chatId) {
  const schedule = await getSchedule();
  const groups = await select("groups", "active=eq.true&select=chat_id,subject,quiz_position");
  const quizzes = await select("quizzes", "select=id,subject");
  const deliveries = await select("quiz_deliveries", "success=eq.true&select=id,quiz_id");

  const quizIdsBySubject = {};
  const quizSubjectById = new Map();
  for (const subject of SUBJECT_IDS) quizIdsBySubject[subject] = 0;

  for (const q of (quizzes || [])) {
    if (q.subject && quizIdsBySubject[q.subject] !== undefined) {
      quizIdsBySubject[q.subject]++;
      quizSubjectById.set(String(q.id), q.subject);
    }
  }

  const sentBySubject = Object.fromEntries(SUBJECT_IDS.map(s => [s, 0]));
  for (const d of (deliveries || [])) {
    const subject = quizSubjectById.get(String(d.quiz_id));
    if (subject && sentBySubject[subject] !== undefined) sentBySubject[subject]++;
  }

  const groupCount = Object.fromEntries(SUBJECT_IDS.map(s => [s, 0]));
  for (const g of (groups || [])) {
    if (g.subject && groupCount[g.subject] !== undefined) groupCount[g.subject]++;
  }

  const lines = SUBJECT_IDS.map(subject =>
    `${subjectLabel(subject)}\n👥 Guruh: <b>${groupCount[subject]}</b> | 🧠 Quiz: <b>${quizIdsBySubject[subject]}</b> | ✅ Yuborilgan: <b>${sentBySubject[subject]}</b>`
  );

  const totalQuiz = Object.values(quizIdsBySubject).reduce((a, b) => a + b, 0);
  const totalSent = Object.values(sentBySubject).reduce((a, b) => a + b, 0);

  return sendMessage(chatId,
    `📊 <b>Aziz Academy Quiz Bot</b>\n\n` +
    `${lines.join("\n\n")}\n\n` +
    `📝 Jami quiz: <b>${totalQuiz}</b> | 👥 Faol guruh: <b>${groups?.length || 0}</b> | ✅ Jami yuborilgan: <b>${totalSent}</b>\n` +
    `⏰ Jadval: <b>${schedule.times.join(" • ")}</b>\n🤖 Avto yuborish: <b>${schedule.paused ? "⏸ Pauzada" : "✅ Faol"}</b>`
  );
}

async function showSettings(chatId) {
  const schedule = await getSchedule();
  return sendMessage(chatId, `⚙️ <b>Quiz sozlamalari</b>\n\n🕒 Vaqtlar: <b>${schedule.times.join(" • ")}</b>\n📆 Dushanba–Shanba\n🌍 ${escapeHtml(schedule.timezone)}\n⚠️ Ogohlantirish: <b>${schedule.lowQueueThreshold} ta</b>\n🤖 ${schedule.paused ? "Pauzada" : "Faol"}`, { reply_markup: { inline_keyboard: [
    [{ text: "⏰ Vaqtlarni o‘zgartirish", callback_data: "settings:times" }],
    [{ text: "⚠️ Ogohlantirish chegarasi", callback_data: "settings:threshold" }],
    [{ text: "⏸ Pauza", callback_data: "panel:pause" }, { text: "▶️ Davom", callback_data: "panel:resume" }]
  ] } });
}

async function sendTrackNow(chatId, subject) {
  await sendMessage(chatId, `⚡ ${subjectLabel(subject)} guruhlari uchun navbatdagi progress quiz yuborilmoqda…`);
  const { sendNextQuiz } = await import("./sender.js");
  const r = await sendNextQuiz(subject);
  return sendMessage(chatId, `${escapeHtml(r.message)}\nYuborildi: <b>${r.sent || 0}</b> | Xato: <b>${r.failed || 0}</b>`);
}

async function sendAllNow(chatId) {
  await sendMessage(chatId, "⚡ Barcha fanlar bo‘yicha guruh progressiga mos quiz yuborilmoqda…");
  const { sendAllTracks } = await import("./sender.js");
  const r = await sendAllTracks();
  return sendMessage(chatId, `Jami yuborildi: <b>${r.sent}</b> | Xato: <b>${r.failed}</b>`);
}

function sendNowKeyboard() { return { inline_keyboard: [
  ...SUBJECT_IDS.map(s => [{ text: subjectLabel(s), callback_data: `sendtrack:${s}` }]),
  [{ text: "🚀 Barcha fanlarga", callback_data: "sendtrack:all" }]
]}; }

async function editSpecialPanel(chatId, messageId, text, keyboard = specialKeyboard()) {
  return editMessage(chatId, messageId, text, { reply_markup: keyboard });
}

async function specialPanelText(extra = "") {
  const queued = await select("special_quizzes", "status=eq.queued&select=id");
  return `⚡ <b>Maxsus quizlar</b>\n\n📋 Navbatda: <b>${queued?.length || 0} ta</b>${extra ? `\n${extra}` : ""}\n\nBu quizlar faqat siz yuborganda barcha faol guruhlarga ketadi. Asosiy fan/dars progressiga ta’sir qilmaydi.`;
}

function specialKeyboard() { return { inline_keyboard: [
  [{ text: "📥 Maxsus Excel yuklash", callback_data: "special:excel" }],
  [{ text: "📋 Maxsus navbat", callback_data: "special:queue" }, { text: "🚀 Keyingisini yuborish", callback_data: "special:send" }],
  [{ text: "🗑 Maxsus navbatni tozalash", callback_data: "special:clear" }]
]}; }

async function showSpecialMenu(chatId, messageId = null, extra = "") {
  const text = await specialPanelText(extra);
  return messageId ? editSpecialPanel(chatId, messageId, text) : sendMessage(chatId, text, { reply_markup: specialKeyboard() });
}

async function showSpecialQueue(chatId, messageId = null) {
  const rows = await select("special_quizzes", "status=eq.queued&select=id,question,created_at&order=id.asc&limit=20");
  const body = !rows?.length
    ? "📋 <b>Maxsus navbat bo‘sh.</b>"
    : `📋 <b>Maxsus navbat</b>\n\n${rows.map((q,i)=>`${i+1}. ${escapeHtml(q.question)}`).join("\n")}\n\n${rows.length===20?"<i>Birinchi 20 tasi ko‘rsatildi.</i>":""}`;
  const kb = { inline_keyboard: [[{ text: "⬅️ Maxsus quizlar", callback_data: "special:back" }]] };
  return messageId ? editSpecialPanel(chatId, messageId, body, kb) : sendMessage(chatId, body, { reply_markup: kb });
}

async function beginSpecialExcel(chatId, adminId) {
  await setState(adminId, "special_excel_file", {});
  return sendMessage(chatId, "📥 <b>Maxsus quizlar Excelini yuboring.</b>\n\nOddiy quiz Excel formati ishlaydi. Fan ustuni bo‘lsa ham maxsus quizlarda e’tiborga olinmaydi.");
}

async function importSpecialExcel(chatId, adminId, document) {
  const fileName=document.file_name||"";
  if(!fileName.toLowerCase().endsWith(".xlsx")) return sendMessage(chatId,"Faqat <b>.xlsx</b> fayl qabul qilinadi.");
  if(document.file_size&&document.file_size>5*1024*1024) return sendMessage(chatId,"Excel fayl 5 MB dan kichik bo‘lishi kerak.");
  await sendMessage(chatId,"⚡ Maxsus Excel o‘qilmoqda…");
  const buffer=await downloadTelegramFile(document.file_id);
  const { parseQuizWorkbook }=await import("./excel.js");
  const { quizzes,validationErrors }=await parseQuizWorkbook(buffer);
  if(validationErrors.length){
    const details=validationErrors.slice(0,10).map(x=>`• <b>${x.rowNumber}-qator:</b> ${escapeHtml(x.errors.join(" "))}`);
    return sendMessage(chatId,`<b>Excelda xatolar bor.</b> Hech narsa qo‘shilmadi.\n\n${details.join("\n")}`);
  }
  if(quizzes.length>500) return sendMessage(chatId,"Bir faylda ko‘pi bilan <b>500 ta</b> maxsus quiz yuklang.");
  const prepared=quizzes.map(q=>({question:q.question,options:q.options,correct_option:q.correct_option,explanation:q.explanation,category:q.category||"Maxsus",status:"queued"}));
  let count=0;
  for(let i=0;i<prepared.length;i+=100){ const rows=await insert("special_quizzes",prepared.slice(i,i+100)); count+=(rows||[]).length; }
  await clearState(adminId);
  return sendMessage(chatId,`✅ <b>${count} ta</b> maxsus quiz alohida navbatga qo‘shildi.\n\nAsosiy 72 talik progress o‘zgarmadi.`,{reply_markup:specialKeyboard()});
}

async function sendNextSpecial(chatId) {
  const rows=await select("special_quizzes","status=eq.queued&select=*&order=id.asc&limit=1");
  const quiz=rows?.[0];
  if(!quiz) return sendMessage(chatId,"📭 Maxsus navbat bo‘sh.");
  const groups=await select("groups","active=eq.true&select=chat_id,title");
  if(!groups?.length) return sendMessage(chatId,"Faol guruh yo‘q.");
  const { sendQuiz }=await import("./telegram.js");
  let sent=0,failed=0;
  for(const group of groups){
    try{ await sendQuiz(group.chat_id,quiz); sent++; }
    catch(error){ failed++; if(error?.telegramCode===403) await update("groups",`chat_id=eq.${group.chat_id}`,{active:false}); }
  }
  await update("special_quizzes",`id=eq.${quiz.id}`,{status:"sent",sent_at:new Date().toISOString(),sent_count:sent,failed_count:failed});
  return { sent, failed };
}

async function clearSpecialQueue(chatId) {
  const deleted=await remove("special_quizzes","status=eq.queued");
  return { deleted: deleted?.length || 0 };
}

async function sendBackup(chatId) {
  await sendMessage(chatId, "💾 Backup tayyorlanmoqda…");
  const { createBackupWorkbook } = await import("./backup.js");
  const buffer = await createBackupWorkbook();
  return sendDocument(chatId, buffer, `Aziz_Academy_Backup_${new Date().toISOString().slice(0,10)}.xlsx`, "✅ Quizlar va guruhlar backupi");
}

function confirmKeyboard(action) { return { inline_keyboard: [[{ text: "✅ Ha, davom et", callback_data: `${action}:yes` }, { text: "❌ Bekor qilish", callback_data: `${action}:no` }]] }; }

async function clearQueue(chatId, track = null) {
  const query = track ? `subject=eq.${track}` : "id=gt.0";
  const deleted = await remove("quizzes", query); await refreshLowQueueAlertState();
  return sendMessage(chatId, `🧹 ${track ? subjectLabel(track) : "Barcha yo‘nalishlar"} queue tozalandi. <b>${deleted?.length || 0} ta</b> quiz o‘chirildi.`);
}

async function resetBot(chatId, adminId) {
  await remove("quizzes", "id=gt.0"); await remove("schedule_runs", "slot_key=not.is.null"); await clearState(adminId);
  await insert("app_settings", { key: "low_queue_alert_state", value: { below: {} }, updated_at: new Date().toISOString() }, { upsert: true, onConflict: "key" });
  return sendMessage(chatId, "🔄 <b>General reset bajarildi.</b>\n\nQuizlar va tarix tozalandi. Guruhlarning fan va 72 talik progressi saqlandi.");
}

async function importExcel(chatId, adminId, document, track) {
  const fileName = document.file_name || "";
  if (!fileName.toLowerCase().endsWith(".xlsx")) return sendMessage(chatId, "Faqat <b>.xlsx</b> fayl qabul qilinadi.");
  if (document.file_size && document.file_size > 5*1024*1024) return sendMessage(chatId, "Excel fayl 5 MB dan kichik bo‘lishi kerak.");
  await sendMessage(chatId, `${subjectLabel(track)} uchun Excel o‘qilmoqda…`);
  const buffer = await downloadTelegramFile(document.file_id);
  const { parseQuizWorkbook } = await import("./excel.js");
  const { quizzes, validationErrors } = await parseQuizWorkbook(buffer);
  if (validationErrors.length) {
    const details = validationErrors.slice(0,10).map(x => `• <b>${x.rowNumber}-qator:</b> ${escapeHtml(x.errors.join(" "))}`);
    return sendMessage(chatId, `<b>Excelda xatolar bor.</b> Hech narsa qo‘shilmadi.\n\n${details.join("\n")}`);
  }
  if (quizzes.length > 500) return sendMessage(chatId, "Bir faylda ko‘pi bilan <b>500 ta</b> quiz yuklang.");
  const prepared = quizzes.map((q, i) => ({ ...q, subject: track, quiz_no: i + 1, track: track === "javascript" ? "javascript" : (track === "html" || track === "css" ? "html_css" : "computer"), fingerprint: trackFingerprint(track, q.question) }));
  const insertedRows = [];
  for (let i=0;i<prepared.length;i+=100) {
    const rows = await insert("quizzes", prepared.slice(i,i+100), { ignoreDuplicates: true, onConflict: "fingerprint" });
    insertedRows.push(...(rows || []));
  }
  await clearState(adminId); await refreshLowQueueAlertState();
  return sendMessage(chatId, `✅ <b>${subjectLabel(track)}</b>\n<b>${insertedRows.length} ta</b> yangi quiz navbatga qo‘shildi.\n♻️ Takroriy: <b>${prepared.length - insertedRows.length} ta</b>.`);
}

async function beginExcel(chatId, adminId) {
  await setState(adminId, "excel_track", {});
  return sendMessage(chatId, "📥 <b>Qaysi fan uchun Excel yuklaysiz?</b>", { reply_markup: subjectKeyboard("exceltrack") });
}
async function beginAddQuiz(chatId, adminId) {
  await setState(adminId, "quiz_track", {});
  return sendMessage(chatId, "➕ <b>Quiz qaysi fan uchun?</b>", { reply_markup: subjectKeyboard("quiztrack") });
}

async function handlePrivateAdminMessage(message) {
  const chatId = message.chat.id, adminId = String(message.from.id), text = message.text?.trim() || "", command = commandOf(text);
  if (command === "/start" || command === "/help") { await clearState(adminId); await sendMessage(chatId, HELP, { reply_markup: REPLY_MENU }); return showPanel(chatId); }
  if (["🎛 menu","menu"].includes(text.toLowerCase()) || command === "/panel") return showPanel(chatId);
  if (text === "📊 Statistika" || command === "/stats") return showStats(chatId);
  if (text === "📥 Excel" || command === "/excel") return beginExcel(chatId, adminId);
  if (text === "⚡ Maxsus quiz" || command === "/special") return showSpecialMenu(chatId);
  if (text === "📋 Navbat" || command === "/queue") return showQueue(chatId);
  if (text === "🚀 Hozir yuborish" || command === "/sendnow") return sendMessage(chatId, "🚀 <b>Qaysi yo‘nalishga yuborasiz?</b>", { reply_markup: sendNowKeyboard() });
  if (text === "👥 Guruhlar" || command === "/groups") return showGroups(chatId);
  if (text === "⚙️ Sozlamalar" || command === "/settings") return showSettings(chatId);
  if (text === "💾 Backup" || command === "/backup") return sendBackup(chatId);
  if (command === "/cancel") { await clearState(adminId); return sendMessage(chatId, "Amal bekor qilindi."); }
  if (command === "/addquiz") return beginAddQuiz(chatId, adminId);
  if (command === "/pause") { await updateSchedule({paused:true}); return sendMessage(chatId,"⏸ Avtomatik yuborish to‘xtatildi."); }
  if (command === "/resume") { await updateSchedule({paused:false}); return sendMessage(chatId,"▶️ Avtomatik yuborish davom ettirildi."); }
  if (command === "/clearqueue") return sendMessage(chatId, "🧹 <b>Qaysi queue tozalansin?</b>", { reply_markup: { inline_keyboard: [
    ...SUBJECT_IDS.map(s=>[{text:subjectLabel(s),callback_data:`cleartrack:${s}`}]), [{text:"🧹 Hammasi",callback_data:"cleartrack:all"}]
  ] } });
  if (command === "/resetbot") return sendMessage(chatId, "🚨 Barcha quiz va tarix o‘chiriladi. Guruhlar saqlanadi. Davom etamizmi?", { reply_markup: confirmKeyboard("resetbot") });

  const state = await getState(adminId); if (!state) return sendMessage(chatId, HELP, { reply_markup: REPLY_MENU });
  const data = state.data || {};
  switch (state.step) {
    case "special_excel_file":
      if (!message.document) return sendMessage(chatId, "Iltimos, <b>.xlsx</b> fayl yuboring yoki /cancel bosing.");
      try { return await importSpecialExcel(chatId, adminId, message.document); } catch(e) { console.error(e); return sendMessage(chatId, `Maxsus Excel import xatosi: <b>${escapeHtml(e?.message || "Noma’lum xato")}</b>`); }
    case "excel_file":
      if (!message.document) return sendMessage(chatId, "Iltimos, <b>.xlsx</b> fayl yuboring yoki /cancel bosing.");
      try { return await importExcel(chatId, adminId, message.document, data.track); } catch(e) { console.error(e); return sendMessage(chatId, `Excel import xatosi: <b>${escapeHtml(e?.message || "Noma’lum xato")}</b>`); }
    case "schedule_times": {
      const items = text.split(/[\s,;]+/).filter(Boolean).map(normalizeTime);
      if (items.length!==3 || items.some(v=>!v) || new Set(items).size!==3) return sendMessage(chatId,"3 ta turli vaqt kiriting: <b>09:00 14:00 19:00</b>");
      const times=items.sort(); await updateSchedule({times}); await clearState(adminId); return sendMessage(chatId,`✅ Yangi vaqtlar: <b>${times.join(" • ")}</b>`);
    }
    case "threshold": {
      const n=Number(text); if(!Number.isInteger(n)||n<1||n>1000) return sendMessage(chatId,"1 dan 1000 gacha butun son yuboring.");
      await updateSchedule({lowQueueThreshold:n}); await clearState(adminId); await refreshLowQueueAlertState(); return sendMessage(chatId,`✅ Ogohlantirish chegarasi <b>${n}</b> ta.`);
    }
    case "question": if(!text) return sendMessage(chatId,"Savol bo‘sh bo‘lmasin."); await setState(adminId,"option1",{...data,question:text,options:[]}); return sendMessage(chatId,"1-variantni yuboring:");
    case "option1": case "option2": case "option3": case "option4": {
      if(!text) return sendMessage(chatId,"Variant bo‘sh bo‘lmasin."); const number=Number(state.step.replace("option","")); const options=[...(data.options||[]),text];
      if(number<4){await setState(adminId,`option${number+1}`,{...data,options});return sendMessage(chatId,`${number+1}-variantni yuboring:`);} await setState(adminId,"correct",{...data,options}); return sendMessage(chatId,"To‘g‘ri javob raqami: <b>1, 2, 3 yoki 4</b>");
    }
    case "correct": { const c=Number(text); if(![1,2,3,4].includes(c)) return sendMessage(chatId,"Faqat 1, 2, 3 yoki 4 yuboring."); await setState(adminId,"explanation",{...data,correct_option:c-1}); return sendMessage(chatId,"Izoh yuboring. Kerak bo‘lmasa <b>-</b>:"); }
    case "explanation": {
      const explanation=text==="-"?null:text; const rows=await insert("quizzes",{question:data.question,options:data.options,correct_option:data.correct_option,explanation,category:"Qo‘lda",subject:data.track,track:(data.track==="javascript"?"javascript":(["html","css"].includes(data.track)?"html_css":"computer")),fingerprint:trackFingerprint(data.track,data.question),status:"queued"},{ignoreDuplicates:true,onConflict:"fingerprint"});
      await clearState(adminId); if(!rows?.length) return sendMessage(chatId,"♻️ Bu savol shu yo‘nalishda allaqachon mavjud."); await refreshLowQueueAlertState(); return sendMessage(chatId,`✅ ${trackLabel(data.track)} queue’ga qo‘shildi.\n${escapeHtml(data.question)}`);
    }
    default: await clearState(adminId); return sendMessage(chatId,"Holat tozalandi. /panel orqali davom eting.");
  }
}

async function handleCallback(callback) {
  const adminId=String(callback.from.id), chatId=callback.message?.chat?.id;
  if(!chatId) return answerCallbackQuery(callback.id,"Ruxsat yo‘q");
  const a=callback.data||"";

  // Guruhni ulash callbacklari alohida himoyalanadi: faqat /connect yuborgan guruh admini.
  if (a.startsWith("connectchange:") || a.startsWith("connectsubject:") || a.startsWith("connectlesson:") || a.startsWith("connectcancel:")) {
    const parts = a.split(":");
    const ownerId = String(parts[1] || "");
    if (String(callback.from.id) !== ownerId) {
      return answerCallbackQuery(callback.id, "🔒 Bu tanlovni /connect yuborgan admin qiladi.");
    }
    if (!(await isGroupAdmin(chatId, callback.from.id))) {
      return answerCallbackQuery(callback.id, "⛔ Faqat guruh administratori sozlay oladi.");
    }
    await answerCallbackQuery(callback.id, "✅ Qabul qilindi");
  } else {
    if(!isAdmin(callback.from.id)) return answerCallbackQuery(callback.id,"Ruxsat yo‘q");
    await answerCallbackQuery(callback.id,"⚡ Qabul qilindi");
  }
  if(a==="panel:addquiz") return beginAddQuiz(chatId,adminId);
  if(a==="panel:excel") return beginExcel(chatId,adminId);
  if(a==="panel:special") return showSpecialMenu(chatId, callback.message.message_id);
  if(a==="special:excel") return beginSpecialExcel(chatId,adminId);
  if(a==="special:queue") return showSpecialQueue(chatId, callback.message.message_id);
  if(a==="special:send") return editSpecialPanel(chatId,callback.message.message_id,`🚀 <b>Navbatdagi maxsus quiz barcha faol guruhlarga yuborilsinmi?</b>\n\nBu asosiy 72 talik progressga ta’sir qilmaydi.`,confirmKeyboard("specialsend"));
  if(a==="specialsend:yes"){const r=await sendNextSpecial(chatId);if(!r?.sent && r?.sent!==0)return r;return showSpecialMenu(chatId,callback.message.message_id,`✅ Oxirgi yuborish: <b>${r.sent}</b> guruh | ❌ Xato: <b>${r.failed}</b>`);}
  if(a==="specialsend:no") return showSpecialMenu(chatId,callback.message.message_id,"↩️ Yuborish bekor qilindi.");
  if(a==="special:clear") return editSpecialPanel(chatId,callback.message.message_id,"⚠️ <b>Yuborilmagan barcha maxsus quizlar o‘chirilsinmi?</b>",confirmKeyboard("specialclear"));
  if(a==="specialclear:yes"){const r=await clearSpecialQueue(chatId);return showSpecialMenu(chatId,callback.message.message_id,`🗑 Tozalandi: <b>${r.deleted}</b> ta quiz`);}
  if(a==="specialclear:no") return showSpecialMenu(chatId,callback.message.message_id,"↩️ Tozalash bekor qilindi.");
  if(a==="special:back") return showSpecialMenu(chatId,callback.message.message_id);
  if(a==="panel:queue") return showQueue(chatId); if(a==="panel:stats") return showStats(chatId); if(a==="panel:groups") return showGroups(chatId); if(a==="panel:settings") return showSettings(chatId); if(a==="panel:backup") return sendBackup(chatId);
  if(a==="panel:sendnow") return sendMessage(chatId,"🚀 <b>Qaysi yo‘nalishga yuborasiz?</b>",{reply_markup:sendNowKeyboard()});
  if(a==="panel:pause"){await updateSchedule({paused:true});return sendMessage(chatId,"⏸ Avtomatik yuborish to‘xtatildi.");}
  if(a==="panel:resume"){await updateSchedule({paused:false});return sendMessage(chatId,"▶️ Avtomatik yuborish davom ettirildi.");}
  if(a==="panel:clearqueue") return sendMessage(chatId,"🧹 <b>Qaysi queue tozalansin?</b>",{reply_markup:{inline_keyboard:[...SUBJECT_IDS.map(s=>[{text:subjectLabel(s),callback_data:`cleartrack:${s}`}]),[{text:"🧹 Hammasi",callback_data:"cleartrack:all"}]]}});
  if(a==="panel:resetbot") return sendMessage(chatId,"🚨 Quizlar va tarixni nollaymizmi? Guruhlar saqlanadi.",{reply_markup:confirmKeyboard("resetbot")});
  if(a.startsWith("exceltrack:")){const track=a.split(":")[1];if(!isSubject(track))return;await setState(adminId,"excel_file",{track});return sendMessage(chatId,`📥 <b>${subjectLabel(track)}</b> uchun .xlsx faylni yuboring.`);}
  if(a.startsWith("quiztrack:")){const track=a.split(":")[1];if(!isSubject(track))return;await setState(adminId,"question",{track});return sendMessage(chatId,`➕ <b>${subjectLabel(track)}</b> uchun quiz savolini yuboring:`);}
  if(a.startsWith("sendtrack:")){const track=a.split(":")[1];return track==="all"?sendAllNow(chatId):(isSubject(track)?sendTrackNow(chatId,track):null);}
  if(a.startsWith("connectcancel:")){
    return editMessage(chatId,callback.message.message_id,"❌ Guruh yo‘nalishini o‘zgartirish bekor qilindi.",{reply_markup:{inline_keyboard:[]}});
  }
  if(a.startsWith("connectchange:")){
    const ownerId=a.split(":")[1];
    return editMessage(chatId,callback.message.message_id,"📚 <b>Guruh hozir qaysi fanda?</b>",{reply_markup:subjectKeyboard("connectsubject",ownerId)});
  }
  if(a.startsWith("connectsubject:")){
    const [,ownerId,subject]=a.split(":"); if(!isSubject(subject)) return;
    return editMessage(chatId,callback.message.message_id,`📖 <b>${subjectLabel(subject)}</b> bo‘yicha hozir qaysi dars?`,{reply_markup:lessonKeyboard("connectlesson",ownerId,subject)});
  }
  if(a.startsWith("connectlesson:")){
    const [,ownerId,subject,lessonRaw]=a.split(":"); const lesson=Number(lessonRaw); if(!isSubject(subject)||lesson<1||lesson>12) return;
    const title=callback.message.chat.title||`Guruh ${chatId}`; const quizPosition=lessonToQuizStart(lesson);
    const legacyTrack=subject==="javascript"?"javascript":(["html","css"].includes(subject)?"html_css":"computer");
    await insert("groups",{chat_id:chatId,title,track:legacyTrack,subject,quiz_position:quizPosition,progress_updated_at:new Date().toISOString(),active:true},{upsert:true,onConflict:"chat_id"});
    const setter=escapeHtml(callback.from.first_name||callback.from.username||"Administrator");
    return editMessage(chatId,callback.message.message_id,`✅ <b>${escapeHtml(title)}</b> botga ulandi.\n\n📚 Fan: <b>${subjectLabel(subject)}</b>\n📖 Dars: <b>${lesson}/12</b>\n🎯 Boshlanish: <b>${quizPosition}/72</b>\n\nProgress endi avtomatik davom etadi.\n👤 Sozladi: <b>${setter}</b>`,{reply_markup:{inline_keyboard:[]}});
  }
  if(a.startsWith("groupchoose:")){ return sendMessage(chatId,"Progressni o‘zgartirish uchun guruhning o‘zida /connect buyrug‘idan foydalaning."); }
  if(a.startsWith("cleartrack:")){const track=a.split(":")[1];return sendMessage(chatId,`⚠️ ${track==="all"?"Barcha yo‘nalishlar":subjectLabel(track)} queue o‘chiriladi. Davom etamizmi?`,{reply_markup:confirmKeyboard(`clearconfirm:${track}`)});}
  if(a.startsWith("clearconfirm:")&&a.endsWith(":yes")){const parts=a.split(":");const track=parts[1];return clearQueue(chatId,track==="all"?null:track);}
  if(a.startsWith("clearconfirm:")&&a.endsWith(":no")) return sendMessage(chatId,"❌ Amal bekor qilindi.");
  if(a==="resetbot:yes") return resetBot(chatId,adminId); if(a==="resetbot:no") return sendMessage(chatId,"❌ Amal bekor qilindi.");
  if(a==="settings:times"){await setState(adminId,"schedule_times",{});return sendMessage(chatId,"3 ta vaqt yozing: <b>09:00 14:00 19:00</b>");}
  if(a==="settings:threshold"){await setState(adminId,"threshold",{});return sendMessage(chatId,"Nechta quiz qolganda ogohlantiray? Masalan: <b>15</b>");}
  return sendMessage(chatId,"Bu tugma uchun amal topilmadi. /panel ni qayta oching.");
}

async function handleGroupMessage(message) {
  if(!message.from) return;
  const command=commandOf(message.text||""), chatId=message.chat.id, title=message.chat.title||`Guruh ${chatId}`;
  if(!["/connect","/removegroup"].includes(command)) return;

  if(!(await isGroupAdmin(chatId,message.from.id))) {
    return sendMessage(chatId,"⛔ Bu buyruq faqat guruh administratorlari uchun.");
  }

  if(command==="/connect") {
    const existing=await select("groups",`chat_id=eq.${chatId}&select=chat_id,title,track,subject,quiz_position,active&limit=1`);
    const group=existing?.[0];
    const ownerId=String(message.from.id);
    if(group?.active && group?.subject && isSubject(group.subject)) {
      return sendMessage(chatId,`ℹ️ <b>${escapeHtml(title)}</b> allaqachon botga ulangan.\n\nHozirgi holat: <b>${subjectLabel(group.subject)} — ${group.quiz_position || 1}/72</b>\n\nFan/darsni qayta belgilamoqchimisiz?`,{reply_markup:{inline_keyboard:[[{text:"⚙️ Almashtirish",callback_data:`connectchange:${ownerId}`}],[{text:"❌ Bekor qilish",callback_data:`connectcancel:${ownerId}`}]]}});
    }
    return sendMessage(chatId,`📚 <b>${escapeHtml(title)}</b> hozir qaysi fanda?`,{reply_markup:subjectKeyboard("connectsubject",ownerId)});
  }
  if(command==="/removegroup"){await update("groups",`chat_id=eq.${chatId}`,{active:false});return sendMessage(chatId,"✅ Guruh quiz tarqatish ro‘yxatidan chiqarildi.");}
}

export async function handleUpdate(update) {
  if(update.callback_query) return handleCallback(update.callback_query);
  const message=update.message; if(!message) return;
  if(message.chat?.type==="private"){if(!message.from||!isAdmin(message.from.id))return sendMessage(message.chat.id,"Bu bot faqat administrator tomonidan boshqariladi.");return handlePrivateAdminMessage(message);}
  if(["group","supergroup"].includes(message.chat?.type)) return handleGroupMessage(message);
}
