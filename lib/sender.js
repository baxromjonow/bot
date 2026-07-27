import { insert, rpc, select, update } from "./supabase.js";
import { sendQuiz } from "./telegram.js";
import { notifyLowQueueIfNeeded } from "./alerts.js";
import { TRACK_IDS, trackShort } from "./tracks.js";

export async function sendNextQuiz(track = "html_css") {
  const claimed = await rpc("claim_next_quiz_by_track", { p_track: track });
  const quiz = claimed?.[0];

  if (!quiz) {
    await notifyLowQueueIfNeeded();
    return { ok: true, track, message: `${trackShort(track)} navbatida quiz yo‘q`, sent: 0, failed: 0 };
  }

  const groups = await select(
    "groups",
    `active=eq.true&track=eq.${encodeURIComponent(track)}&select=chat_id,title&order=added_at.asc`
  );
  if (!groups?.length) {
    await update("quizzes", `id=eq.${quiz.id}`, { status: "queued" });
    return { ok: false, track, message: `${trackShort(track)} uchun faol guruh yo‘q`, quizId: null, sent: 0, failed: 0 };
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
  return { ok: true, track, message: `${trackShort(track)} quiz yuborildi`, quizId: quiz.id, sent, failed, errors };
}

export async function sendAllTracks() {
  const results = [];
  for (const track of TRACK_IDS) {
    results.push(await sendNextQuiz(track));
  }
  return {
    ok: true,
    results,
    sent: results.reduce((sum, r) => sum + Number(r.sent || 0), 0),
    failed: results.reduce((sum, r) => sum + Number(r.failed || 0), 0),
    quizIds: results.map((r) => r.quizId).filter(Boolean)
  };
}
