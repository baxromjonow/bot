import { getConfig } from "./config.js";

export async function telegram(method, payload = {}) {
  const { botToken } = getConfig();
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
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

export function sendQuiz(chatId, quiz) {
  return telegram("sendPoll", {
    chat_id: chatId,
    question: quiz.question,
    options: quiz.options,
    type: "quiz",
    correct_option_id: quiz.correct_option,
    explanation: quiz.explanation || undefined,
    is_anonymous: false
  });
}
