import { getConfig } from "./config.js";
import { clearState, getState, setState } from "./state.js";
import { insert, remove, select, update } from "./supabase.js";
import { answerCallbackQuery, downloadTelegramFile, editMessage, getChatMember, sendDocument, sendMessage } from "./telegram.js";
import { quizFingerprint } from "./fingerprint.js";
import { getSchedule, normalizeTime, updateSchedule } from "./settings.js";
import { refreshLowQueueAlertState } from "./alerts.js";
import { TRACK_IDS, isTrack, trackKeyboard, trackKeyboardForOwner, trackLabel, trackShort } from "./tracks.js";

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
/cancel — joriy amalni bekor qilish

Guruh ichida:
/connect — guruhni yo‘nalishga ulash
/removegroup — guruhni ro‘yxatdan chiqarish
`;

const PANEL = { inline_keyboard: [
  [{ text: "➕ Quiz qo‘shish", callback_data: "panel:addquiz" }, { text: "📥 Excel yuklash", callback_data: "panel:excel" }],
  [{ text: "📋 Navbat", callback_data: "panel:queue" }, { text: "📊 Statistika", callback_data: "panel:stats" }],
  [{ text: "🚀 Hozir yuborish", callback_data: "panel:sendnow" }, { text: "👥 Guruhlar", callback_data: "panel:groups" }],
  [{ text: "⏸ Pauza", callback_data: "panel:pause" }, { text: "▶️ Davom", callback_data: "panel:resume" }],
  [{ text: "⚙️ Sozlamalar", callback_data: "panel:settings" }, { text: "💾 Backup", callback_data: "panel:backup" }],
  [{ text: "🧹 Queue tozalash", callback_data: "panel:clearqueue" }, { text: "🔄 Reset", callback_data: "panel:resetbot" }]
]};

const REPLY_MENU = { keyboard: [
  [{ text: "🎛 Menu" }, { text: "📊 Statistika" }],
  [{ text: "📥 Excel" }, { text: "📋 Navbat" }],
  [{ text: "🚀 Hozir yuborish" }, { text: "👥 Guruhlar" }],
  [{ text: "⚙️ Sozlamalar" }, { text: "💾 Backup" }]
], resize_keyboard: true, is_persistent: true };

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
  const parts = [];
  for (const track of TRACK_IDS) {
    const rows = await select("quizzes", `status=eq.queued&track=eq.${track}&select=question,category&order=id.asc&limit=20`);
    const countRows = await select("quizzes", `status=eq.queued&track=eq.${track}&select=id`);
    const total = countRows?.length || 0;
    parts.push(`<b>${trackLabel(track)}</b> — <b>${total} ta</b>`);
    if (rows?.length) {
      parts.push(rows.map((q, i) => `${i + 1}. ${escapeHtml(q.question)}`).join("\n"));
      if (total > 20) parts.push(`<i>… yana ${total - 20} ta</i>`);
    } else parts.push("<i>Navbat bo‘sh</i>");
    parts.push("");
  }
  return sendMessage(chatId, `📋 <b>Quiz navbatlari</b>\n\n${parts.join("\n")}`);
}

async function showGroups(chatId) {
  const groups = await select("groups", "active=eq.true&select=chat_id,title,track,added_at&order=added_at.asc");
  if (!groups?.length) return sendMessage(chatId, "Hali faol guruh ro‘yxatdan o‘tmagan.");
  const lines = groups.map((g, i) => `${i + 1}. <b>${escapeHtml(g.title || String(g.chat_id))}</b> — ${g.track ? trackLabel(g.track) : "⚠️ Yo‘nalish tanlanmagan"}`);
  const buttons = groups.slice(0, 20).map((g) => [{ text: `🔄 ${String(g.title || g.chat_id).slice(0, 28)}`, callback_data: `groupchoose:${g.chat_id}` }]);
  return sendMessage(chatId, `<b>Faol guruhlar:</b>\n\n${lines.join("\n")}\n\nYo‘nalishni almashtirish uchun guruhni tanlang:`, { reply_markup: { inline_keyboard: buttons } });
}

async function showStats(chatId) {
  const { getStats } = await import("./stats.js");
  const s = await getStats({ fresh: true });
  const t = s.tracks || {};
  return sendMessage(chatId,
    `📊 <b>Aziz Academy Quiz Bot</b>\n\n` +
    `${trackLabel("computer")}\n👥 Guruh: <b>${t.computer?.groups || 0}</b> | ⏳ Navbat: <b>${t.computer?.queued || 0}</b> | ✅ Yuborilgan: <b>${t.computer?.sent || 0}</b>\n\n` +
    `${trackLabel("html_css")}\n👥 Guruh: <b>${t.html_css?.groups || 0}</b> | ⏳ Navbat: <b>${t.html_css?.queued || 0}</b> | ✅ Yuborilgan: <b>${t.html_css?.sent || 0}</b>\n\n` +
    `${trackLabel("javascript")}\n👥 Guruh: <b>${t.javascript?.groups || 0}</b> | ⏳ Navbat: <b>${t.javascript?.queued || 0}</b> | ✅ Yuborilgan: <b>${t.javascript?.sent || 0}</b>\n\n` +
    `📝 Jami: <b>${s.total}</b> | ⏳ Queue: <b>${s.queued}</b> | ⚠️ Failed: <b>${s.failed}</b>\n` +
    `⏰ Jadval: <b>${s.schedule.times.join(" • ")}</b>\n🤖 Avto yuborish: <b>${s.schedule.paused ? "⏸ Pauzada" : "✅ Faol"}</b>`
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

async function sendTrackNow(chatId, track) {
  await sendMessage(chatId, `⚡ ${trackLabel(track)} uchun navbatdagi quiz yuborilmoqda…`);
  const { sendNextQuiz } = await import("./sender.js");
  const r = await sendNextQuiz(track);
  return sendMessage(chatId, `${escapeHtml(r.message)}\nYuborildi: <b>${r.sent || 0}</b> | Xato: <b>${r.failed || 0}</b>`);
}

async function sendAllNow(chatId) {
  await sendMessage(chatId, "⚡ Uchala yo‘nalish uchun quiz yuborilmoqda…");
  const { sendAllTracks } = await import("./sender.js");
  const r = await sendAllTracks();
  const lines = r.results.map(x => `${trackLabel(x.track)} — ${x.quizId ? "✅" : "➖"} | guruhlarga: ${x.sent || 0}`);
  return sendMessage(chatId, `${lines.join("\n")}\n\nJami yuborish: <b>${r.sent}</b> | Xato: <b>${r.failed}</b>`);
}

function sendNowKeyboard() { return { inline_keyboard: [
  [{ text: trackLabel("computer"), callback_data: "sendtrack:computer" }],
  [{ text: trackLabel("html_css"), callback_data: "sendtrack:html_css" }],
  [{ text: trackLabel("javascript"), callback_data: "sendtrack:javascript" }],
  [{ text: "🚀 Barcha yo‘nalishlarga", callback_data: "sendtrack:all" }]
]}; }

async function sendBackup(chatId) {
  await sendMessage(chatId, "💾 Backup tayyorlanmoqda…");
  const { createBackupWorkbook } = await import("./backup.js");
  const buffer = await createBackupWorkbook();
  return sendDocument(chatId, buffer, `Aziz_Academy_Backup_${new Date().toISOString().slice(0,10)}.xlsx`, "✅ Quizlar va guruhlar backupi");
}

function confirmKeyboard(action) { return { inline_keyboard: [[{ text: "✅ Ha, davom et", callback_data: `${action}:yes` }, { text: "❌ Bekor qilish", callback_data: `${action}:no` }]] }; }

async function clearQueue(chatId, track = null) {
  const query = track ? `status=in.(queued,processing)&track=eq.${track}` : "status=in.(queued,processing)";
  const deleted = await remove("quizzes", query); await refreshLowQueueAlertState();
  return sendMessage(chatId, `🧹 ${track ? trackLabel(track) : "Barcha yo‘nalishlar"} queue tozalandi. <b>${deleted?.length || 0} ta</b> quiz o‘chirildi.`);
}

async function resetBot(chatId, adminId) {
  await remove("quizzes", "id=gt.0"); await remove("schedule_runs", "slot_key=not.is.null"); await clearState(adminId);
  await insert("app_settings", { key: "low_queue_alert_state", value: { below: {} }, updated_at: new Date().toISOString() }, { upsert: true, onConflict: "key" });
  return sendMessage(chatId, "🔄 <b>General reset bajarildi.</b>\n\nQuizlar va tarix tozalandi. Guruhlar, ularning yo‘nalishi va jadval saqlandi.");
}

async function importExcel(chatId, adminId, document, track) {
  const fileName = document.file_name || "";
  if (!fileName.toLowerCase().endsWith(".xlsx")) return sendMessage(chatId, "Faqat <b>.xlsx</b> fayl qabul qilinadi.");
  if (document.file_size && document.file_size > 5*1024*1024) return sendMessage(chatId, "Excel fayl 5 MB dan kichik bo‘lishi kerak.");
  await sendMessage(chatId, `${trackLabel(track)} uchun Excel o‘qilmoqda…`);
  const buffer = await downloadTelegramFile(document.file_id);
  const { parseQuizWorkbook } = await import("./excel.js");
  const { quizzes, validationErrors } = await parseQuizWorkbook(buffer);
  if (validationErrors.length) {
    const details = validationErrors.slice(0,10).map(x => `• <b>${x.rowNumber}-qator:</b> ${escapeHtml(x.errors.join(" "))}`);
    return sendMessage(chatId, `<b>Excelda xatolar bor.</b> Hech narsa qo‘shilmadi.\n\n${details.join("\n")}`);
  }
  if (quizzes.length > 500) return sendMessage(chatId, "Bir faylda ko‘pi bilan <b>500 ta</b> quiz yuklang.");
  const prepared = quizzes.map(q => ({ ...q, track, fingerprint: trackFingerprint(track, q.question) }));
  const insertedRows = [];
  for (let i=0;i<prepared.length;i+=100) {
    const rows = await insert("quizzes", prepared.slice(i,i+100), { ignoreDuplicates: true, onConflict: "fingerprint" });
    insertedRows.push(...(rows || []));
  }
  await clearState(adminId); await refreshLowQueueAlertState();
  return sendMessage(chatId, `✅ <b>${trackLabel(track)}</b>\n<b>${insertedRows.length} ta</b> yangi quiz navbatga qo‘shildi.\n♻️ Takroriy: <b>${prepared.length - insertedRows.length} ta</b>.`);
}

async function beginExcel(chatId, adminId) {
  await setState(adminId, "excel_track", {});
  return sendMessage(chatId, "📥 <b>Qaysi yo‘nalishga Excel yuklaysiz?</b>", { reply_markup: trackKeyboard("exceltrack") });
}
async function beginAddQuiz(chatId, adminId) {
  await setState(adminId, "quiz_track", {});
  return sendMessage(chatId, "➕ <b>Quiz qaysi yo‘nalish uchun?</b>", { reply_markup: trackKeyboard("quiztrack") });
}

async function handlePrivateAdminMessage(message) {
  const chatId = message.chat.id, adminId = String(message.from.id), text = message.text?.trim() || "", command = commandOf(text);
  if (command === "/start" || command === "/help") { await clearState(adminId); await sendMessage(chatId, HELP, { reply_markup: REPLY_MENU }); return showPanel(chatId); }
  if (["🎛 menu","menu"].includes(text.toLowerCase()) || command === "/panel") return showPanel(chatId);
  if (text === "📊 Statistika" || command === "/stats") return showStats(chatId);
  if (text === "📥 Excel" || command === "/excel") return beginExcel(chatId, adminId);
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
    [{text:trackLabel("computer"),callback_data:"cleartrack:computer"}], [{text:trackLabel("html_css"),callback_data:"cleartrack:html_css"}], [{text:trackLabel("javascript"),callback_data:"cleartrack:javascript"}], [{text:"🧹 Hammasi",callback_data:"cleartrack:all"}]
  ] } });
  if (command === "/resetbot") return sendMessage(chatId, "🚨 Barcha quiz va tarix o‘chiriladi. Guruhlar saqlanadi. Davom etamizmi?", { reply_markup: confirmKeyboard("resetbot") });

  const state = await getState(adminId); if (!state) return sendMessage(chatId, HELP, { reply_markup: REPLY_MENU });
  const data = state.data || {};
  switch (state.step) {
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
      const explanation=text==="-"?null:text; const rows=await insert("quizzes",{question:data.question,options:data.options,correct_option:data.correct_option,explanation,category:"Qo‘lda",track:data.track,fingerprint:trackFingerprint(data.track,data.question),status:"queued"},{ignoreDuplicates:true,onConflict:"fingerprint"});
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
  if (a.startsWith("connectchange:") || a.startsWith("connecttrack:") || a.startsWith("connectcancel:")) {
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
  if(a==="panel:queue") return showQueue(chatId); if(a==="panel:stats") return showStats(chatId); if(a==="panel:groups") return showGroups(chatId); if(a==="panel:settings") return showSettings(chatId); if(a==="panel:backup") return sendBackup(chatId);
  if(a==="panel:sendnow") return sendMessage(chatId,"🚀 <b>Qaysi yo‘nalishga yuborasiz?</b>",{reply_markup:sendNowKeyboard()});
  if(a==="panel:pause"){await updateSchedule({paused:true});return sendMessage(chatId,"⏸ Avtomatik yuborish to‘xtatildi.");}
  if(a==="panel:resume"){await updateSchedule({paused:false});return sendMessage(chatId,"▶️ Avtomatik yuborish davom ettirildi.");}
  if(a==="panel:clearqueue") return sendMessage(chatId,"🧹 <b>Qaysi queue tozalansin?</b>",{reply_markup:{inline_keyboard:[[{text:trackLabel("computer"),callback_data:"cleartrack:computer"}],[{text:trackLabel("html_css"),callback_data:"cleartrack:html_css"}],[{text:trackLabel("javascript"),callback_data:"cleartrack:javascript"}],[{text:"🧹 Hammasi",callback_data:"cleartrack:all"}]]}});
  if(a==="panel:resetbot") return sendMessage(chatId,"🚨 Quizlar va tarixni nollaymizmi? Guruhlar saqlanadi.",{reply_markup:confirmKeyboard("resetbot")});
  if(a.startsWith("exceltrack:")){const track=a.split(":")[1];if(!isTrack(track))return;await setState(adminId,"excel_file",{track});return sendMessage(chatId,`📥 <b>${trackLabel(track)}</b> uchun .xlsx faylni yuboring.`);}
  if(a.startsWith("quiztrack:")){const track=a.split(":")[1];if(!isTrack(track))return;await setState(adminId,"question",{track});return sendMessage(chatId,`➕ <b>${trackLabel(track)}</b> uchun quiz savolini yuboring:`);}
  if(a.startsWith("sendtrack:")){const track=a.split(":")[1];return track==="all"?sendAllNow(chatId):sendTrackNow(chatId,track);}
  if(a.startsWith("connectcancel:")){
    return editMessage(chatId,callback.message.message_id,"❌ Guruh yo‘nalishini o‘zgartirish bekor qilindi.",{reply_markup:{inline_keyboard:[]}});
  }
  if(a.startsWith("connectchange:")){
    const ownerId=a.split(":")[1];
    return editMessage(chatId,callback.message.message_id,"📚 <b>Guruh yo‘nalishini tanlang:</b>",{reply_markup:trackKeyboardForOwner("connecttrack",ownerId)});
  }
  if(a.startsWith("connecttrack:")){
    const [,ownerId,track]=a.split(":");
    if(!isTrack(track)) return;
    const title=callback.message.chat.title||`Guruh ${chatId}`;
    await insert("groups",{chat_id:chatId,title,track,active:true},{upsert:true,onConflict:"chat_id"});
    const setter=escapeHtml(callback.from.first_name||callback.from.username||"Administrator");
    return editMessage(chatId,callback.message.message_id,`✅ <b>${escapeHtml(title)}</b> botga ulandi.\n\n📚 Yo‘nalish: <b>${trackLabel(track)}</b>\n👤 Sozladi: <b>${setter}</b>`,{reply_markup:{inline_keyboard:[]}});
  }
  if(a.startsWith("groupchoose:")){const groupId=a.split(":")[1];return sendMessage(chatId,"Yangi yo‘nalishni tanlang:",{reply_markup:{inline_keyboard:[[{text:trackLabel("computer"),callback_data:`grouptrack:${groupId}:computer`}],[{text:trackLabel("html_css"),callback_data:`grouptrack:${groupId}:html_css`}],[{text:trackLabel("javascript"),callback_data:`grouptrack:${groupId}:javascript`}]]}});}
  if(a.startsWith("grouptrack:")){const [,groupId,track]=a.split(":");if(!isTrack(track))return;await update("groups",`chat_id=eq.${groupId}`,{track,active:true});return sendMessage(chatId,`✅ Guruh yo‘nalishi <b>${trackLabel(track)}</b> ga o‘zgartirildi.`);}
  if(a.startsWith("cleartrack:")){const track=a.split(":")[1];return sendMessage(chatId,`⚠️ ${track==="all"?"Barcha yo‘nalishlar":trackLabel(track)} queue o‘chiriladi. Davom etamizmi?`,{reply_markup:confirmKeyboard(`clearconfirm:${track}`)});}
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
    const existing=await select("groups",`chat_id=eq.${chatId}&select=chat_id,title,track,active&limit=1`);
    const group=existing?.[0];
    const ownerId=String(message.from.id);
    if(group?.active && group?.track && isTrack(group.track)) {
      return sendMessage(chatId,`ℹ️ <b>${escapeHtml(title)}</b> allaqachon botga ulangan.\n\nHozirgi yo‘nalish: <b>${trackLabel(group.track)}</b>\n\nYo‘nalishni almashtirmoqchimisiz?`,{reply_markup:{inline_keyboard:[[{text:"⚙️ Almashtirish",callback_data:`connectchange:${ownerId}`}],[{text:"❌ Bekor qilish",callback_data:`connectcancel:${ownerId}`}]]}});
    }
    return sendMessage(chatId,`📚 <b>${escapeHtml(title)}</b> qaysi yo‘nalishda?`,{reply_markup:trackKeyboardForOwner("connecttrack",ownerId)});
  }
  if(command==="/removegroup"){await update("groups",`chat_id=eq.${chatId}`,{active:false});return sendMessage(chatId,"✅ Guruh quiz tarqatish ro‘yxatidan chiqarildi.");}
}

export async function handleUpdate(update) {
  if(update.callback_query) return handleCallback(update.callback_query);
  const message=update.message; if(!message) return;
  if(message.chat?.type==="private"){if(!message.from||!isAdmin(message.from.id))return sendMessage(message.chat.id,"Bu bot faqat administrator tomonidan boshqariladi.");return handlePrivateAdminMessage(message);}
  if(["group","supergroup"].includes(message.chat?.type)) return handleGroupMessage(message);
}
