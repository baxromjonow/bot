import { getConfig } from "./config.js";

export async function telegram(method, payload = {}) {
  const { botToken } = getConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let response;
  try {
    response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Connection: "keep-alive" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
  const data = await response.json();
  if (!data.ok) {
    const error = new Error(data.description || `Telegram ${method} xatosi`);
    error.telegramCode = data.error_code;
    throw error;
  }
  return data.result;
}

export function sendMessage(chatId, text, extra = {}) {
  return telegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...extra
  });
}

export function editMessage(chatId, messageId, text, extra = {}) {
  return telegram("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...extra
  });
}

export function answerCallbackQuery(callbackQueryId, text = "") {
  return telegram("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text: text || undefined
  });
}

export function getChatMember(chatId, userId) {
  return telegram("getChatMember", {
    chat_id: chatId,
    user_id: userId
  });
}

export function sendQuiz(chatId, quiz) {
  return telegram("sendPoll", {
    chat_id: chatId,
    question: quiz.question,
    options: quiz.options,
    type: "quiz",
    correct_option_id: quiz.correct_option,
    explanation: quiz.explanation || undefined,
    is_anonymous: false,
    shuffle_options: true
  });
}

export async function sendDocument(chatId, buffer, filename, caption = "") {
  const { botToken } = getConfig();
  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (caption) {
    form.append("caption", caption);
    form.append("parse_mode", "HTML");
  }
  form.append(
    "document",
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    filename
  );

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
    method: "POST",
    body: form
  });
  const data = await response.json();
  if (!data.ok) {
    const error = new Error(data.description || "Telegram sendDocument xatosi");
    error.telegramCode = data.error_code;
    throw error;
  }
  return data.result;
}

export async function downloadTelegramFile(fileId) {
  const file = await telegram("getFile", { file_id: fileId });
  if (!file?.file_path) throw new Error("Telegram fayl manzilini qaytarmadi.");

  const { botToken } = getConfig();
  const response = await fetch(`https://api.telegram.org/file/bot${botToken}/${file.file_path}`);
  if (!response.ok) {
    throw new Error(`Excel faylni yuklab olishda xato (${response.status}).`);
  }
  return Buffer.from(await response.arrayBuffer());
}
