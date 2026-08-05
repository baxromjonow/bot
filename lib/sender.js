import { insert, remove, select, update } from "./supabase.js";
import { sendQuiz } from "./telegram.js";
import { SUBJECT_IDS, QUIZZES_PER_SUBJECT, nextSubject, subjectLabel } from "./subjects.js";

function normalizedPosition(value) {
  return Math.min(QUIZZES_PER_SUBJECT, Math.max(1, Number(value || 1)));
}

async function advanceGroup(group, deliveredQuiz) {
  let subject = group.subject || "word";
  let pos = Number(deliveredQuiz?.quiz_no || group.quiz_position || 1) + 1;
  if (pos > QUIZZES_PER_SUBJECT) {
    subject = nextSubject(subject);
    pos = 1;
  }

  await update("groups", `chat_id=eq.${group.chat_id}`, {
    subject,
    quiz_position: pos,
    progress_updated_at: new Date().toISOString(),
    last_quiz_id: deliveredQuiz?.id || null,
    last_quiz_subject: deliveredQuiz?.subject || group.subject || null,
    last_quiz_no: deliveredQuiz?.quiz_no || null,
    last_quiz_sent_at: new Date().toISOString()
  });
}

async function findQuizForGroup(group) {
  const subject = group.subject || "word";
  const position = normalizedPosition(group.quiz_position);

  // Avval aynan progress raqami, topilmasa undan keyingi mavjud quiz olinadi.
  let rows = await select("quizzes", `subject=eq.${encodeURIComponent(subject)}&quiz_no=eq.${position}&select=*&limit=1`);
  if (rows?.[0]) return rows[0];

  rows = await select("quizzes", `subject=eq.${encodeURIComponent(subject)}&quiz_no=gte.${position}&select=*&order=quiz_no.asc&limit=1`);
  return rows?.[0] || null;
}

export async function sendNextQuiz(subject = null) {
  const filter = subject ? `&subject=eq.${encodeURIComponent(subject)}` : "";
  const groups = await select("groups", `active=eq.true${filter}&select=chat_id,title,subject,quiz_position,last_quiz_id,last_quiz_subject,last_quiz_no&order=added_at.asc`);
  if (!groups?.length) {
    return { ok: true, message: subject ? `${subjectLabel(subject)} uchun faol guruh yo‘q` : "Faol guruh yo‘q", sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;
  const quizIds = [];

  for (const group of groups) {
    const quiz = await findQuizForGroup(group);
    if (!quiz) {
      failed++;
      continue;
    }

    // Oxirgi yuborilgan quiz aynan shu bo'lsa, qayta yubormay progressni oldinga suramiz.
    if (String(group.last_quiz_id || "") === String(quiz.id)) {
      await advanceGroup(group, quiz);
      continue;
    }

    // Yuborishdan OLDIN delivery reservation yaratiladi.
    // Unique(quiz_id, chat_id) parallel cronlar bir xil quizni ikki marta yuborishini bloklaydi.
    let reservation;
    try {
      reservation = await insert("quiz_deliveries", {
        quiz_id: quiz.id,
        chat_id: group.chat_id,
        success: false,
        error: "reserved"
      }, { ignoreDuplicates: true, onConflict: "quiz_id,chat_id" });
    } catch (error) {
      console.error("Delivery reservation xatosi:", error);
      failed++;
      continue;
    }

    if (!reservation?.length) {
      // Bu quiz ushbu guruh uchun oldin yuborilgan yoki boshqa jarayon tomonidan olinib bo'lgan.
      await advanceGroup(group, quiz);
      continue;
    }

    try {
      const poll = await sendQuiz(group.chat_id, quiz);
      await update("quiz_deliveries", `quiz_id=eq.${quiz.id}&chat_id=eq.${group.chat_id}`, {
        telegram_message_id: poll.message_id,
        success: true,
        error: null,
        sent_at: new Date().toISOString()
      });
      await advanceGroup(group, quiz);
      sent++;
      quizIds.push(quiz.id);
    } catch (error) {
      // Yuborilmagan reservation keyingi urinishga halaqit bermasin.
      await remove("quiz_deliveries", `quiz_id=eq.${quiz.id}&chat_id=eq.${group.chat_id}&success=eq.false`);
      failed++;
      if (error?.telegramCode === 403) {
        await update("groups", `chat_id=eq.${group.chat_id}`, { active: false });
      }
    }
  }

  return { ok: true, subject, message: "Quizlar guruh progressiga mos yuborildi", sent, failed, quizIds };
}

export async function sendAllTracks() {
  const results = [];
  for (const subject of SUBJECT_IDS) results.push(await sendNextQuiz(subject));
  return {
    ok: true,
    results,
    sent: results.reduce((a, r) => a + r.sent, 0),
    failed: results.reduce((a, r) => a + r.failed, 0),
    quizIds: results.flatMap(r => r.quizIds || [])
  };
}
