import { insert, rpc, select, update } from "./supabase.js";
import { sendQuiz } from "./telegram.js";
import { notifyLowQueueIfNeeded } from "./alerts.js";

export async function sendNextQuiz() {
  const claimed = await rpc("claim_next_quiz");
  const quiz = claimed?.[0];

  if (!quiz) {
    await notifyLowQueueIfNeeded();
    return { ok: true, message: "Navbatda quiz yo‘q", sent: 0, failed: 0 };
  }

  const groups = await select("groups", "active=eq.true&select=chat_id,title&order=added_at.asc");
  if (!groups?.length) {
    await update("quizzes", `id=eq.${quiz.id}`, { status: "queued" });
    return { ok: false, message: "Faol guruhlar yo‘q", quizId: quiz.id, sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;
  const errors = [];
  for (const group of groups) {
    try {
      const pollMessage = await sendQuiz(group.chat_id, quiz);
      await insert(
        "quiz_deliveries",
        { quiz_id: quiz.id, chat_id: group.chat_id, telegram_message_id: pollMessage.message_id, success: true, error: null },
        { upsert: true, onConflict: "quiz_id,chat_id" }
      );
      sent += 1;
    } catch (error) {
      failed += 1;
      const message = error?.message || "Noma’lum xato";
      errors.push({ chatId: group.chat_id, title: group.title, error: message });
      await insert(
        "quiz_deliveries",
        { quiz_id: quiz.id, chat_id: group.chat_id, success: false, error: message },
        { upsert: true, onConflict: "quiz_id,chat_id" }
      );
      if (error?.telegramCode === 403 || /chat not found/i.test(message)) {
        await update("groups", `chat_id=eq.${group.chat_id}`, { active: false });
      }
    }
  }

  const finalStatus = sent > 0 ? "sent" : "failed";
  await update("quizzes", `id=eq.${quiz.id}`, { status: finalStatus, sent_at: new Date().toISOString() });
  await notifyLowQueueIfNeeded();
  return { ok: true, message: "Quiz yuborish yakunlandi", quizId: quiz.id, sent, failed, errors };
}
