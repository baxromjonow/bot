import { getConfig } from "./config.js";
import { clearState, getState, setState } from "./state.js";
import { insert, select, update } from "./supabase.js";
import { downloadTelegramFile, sendMessage } from "./telegram.js";
import { sendNextQuiz } from "./sender.js";
import { parseQuizWorkbook } from "./excel.js";

const HELP = `
<b>Quiz bot boshqaruvi</b>

/addquiz — yangi quiz qo‘shish
/excel — Excel fayldan quizlarni ommaviy qo‘shish
/queue — navbatdagi quizlarni ko‘rish
/sendnow — keyingi quizni hozir yuborish
/groups — faol guruhlarni ko‘rish
/cancel — quiz kiritishni bekor qilish

Guruh ichida:
/register — guruhni ro‘yxatga olish
/removegroup — guruhni ro‘yxatdan chiqarish
`;

function commandOf(text = "") {
  const token = text.trim().split(/\s+/)[0] || "";
  return token.split("@")[0].toLowerCase();
}

function isAdmin(userId) {
  return String(userId) === getConfig().adminId;
}

async function showQueue(chatId) {
  const quizzes = await select(
    "quizzes",
    "status=eq.queued&select=id,question,created_at&order=id.asc&limit=20"
  );
  if (!quizzes?.length) {
    return sendMessage(chatId, "Navbatda quiz yo‘q.");
  }
  const lines = quizzes.map((q, index) => `${index + 1}. <b>#${q.id}</b> — ${escapeHtml(q.question)}`);
  return sendMessage(chatId, `<b>Navbatdagi quizlar:</b>\n\n${lines.join("\n")}`);
}

async function showGroups(chatId) {
  const groups = await select(
    "groups",
    "active=eq.true&select=chat_id,title,added_at&order=added_at.asc"
  );
  if (!groups?.length) {
    return sendMessage(chatId, "Hali faol guruh ro‘yxatdan o‘tmagan.");
  }
  const lines = groups.map((g, index) => `${index + 1}. ${escapeHtml(g.title || String(g.chat_id))}`);
  return sendMessage(chatId, `<b>Faol guruhlar:</b>\n\n${lines.join("\n")}`);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function handlePrivateAdminMessage(message) {
  const chatId = message.chat.id;
  const adminId = String(message.from.id);
  const text = message.text?.trim() || "";
  const command = commandOf(text);

  if (command === "/start" || command === "/help") {
    await clearState(adminId);
    return sendMessage(chatId, HELP);
  }
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
    return sendMessage(
      chatId,
      "Excel <b>.xlsx</b> faylini yuboring. Ustunlar: <b>Savol, Variant 1, Variant 2, Variant 3, Variant 4, To'g'ri javob, Izoh</b>."
    );
  }
  if (command === "/queue") return showQueue(chatId);
  if (command === "/groups") return showGroups(chatId);
  if (command === "/sendnow") {
    await sendMessage(chatId, "Keyingi quiz guruhlarga yuborilmoqda…");
    const result = await sendNextQuiz();
    return sendMessage(
      chatId,
      `${escapeHtml(result.message)}\n\nYuborildi: <b>${result.sent || 0}</b>\nXato: <b>${result.failed || 0}</b>`
    );
  }

  const state = await getState(adminId);
  if (!state) return sendMessage(chatId, HELP);

  const data = state.data || {};
  switch (state.step) {
    case "excel_file": {
      const document = message.document;
      if (!document) {
        return sendMessage(chatId, "Iltimos, <b>.xlsx</b> Excel faylini hujjat sifatida yuboring yoki /cancel bosing.");
      }

      const fileName = document.file_name || "";
      if (!fileName.toLowerCase().endsWith(".xlsx")) {
        return sendMessage(chatId, "Faqat <b>.xlsx</b> formatdagi Excel fayl qabul qilinadi.");
      }
      if (document.file_size && document.file_size > 5 * 1024 * 1024) {
        return sendMessage(chatId, "Excel fayl 5 MB dan kichik bo‘lishi kerak.");
      }

      await sendMessage(chatId, "Excel o‘qilmoqda va quizlar tekshirilmoqda…");

      try {
        const buffer = await downloadTelegramFile(document.file_id);
        const { quizzes, validationErrors } = await parseQuizWorkbook(buffer);

        if (validationErrors.length) {
          const details = validationErrors.slice(0, 10).map((item) =>
            `• <b>${item.rowNumber}-qator:</b> ${escapeHtml(item.errors.join(" "))}`
          );
          const extra = validationErrors.length > 10
            ? `\n… yana ${validationErrors.length - 10} ta xatoli qator bor.`
            : "";
          return sendMessage(
            chatId,
            `<b>Excelda xatolar bor.</b> Hech narsa bazaga qo‘shilmadi.\n\n${details.join("\n")}${extra}\n\nFaylni tuzatib qayta yuboring.`
          );
        }

        if (quizzes.length > 500) {
          return sendMessage(chatId, "Bir faylda ko‘pi bilan <b>500 ta</b> quiz yuklang.");
        }

        const batchSize = 100;
        let imported = 0;
        for (let i = 0; i < quizzes.length; i += batchSize) {
          const batch = quizzes.slice(i, i + batchSize);
          const rows = await insert("quizzes", batch);
          imported += rows?.length || batch.length;
        }

        await clearState(adminId);
        return sendMessage(
          chatId,
          `✅ <b>${imported} ta quiz</b> navbatga qo‘shildi.\n\n/queue — navbatni ko‘rish\n/sendnow — keyingi quizni hozir yuborish`
        );
      } catch (error) {
        console.error(error);
        return sendMessage(
          chatId,
          `Excelni import qilib bo‘lmadi: <b>${escapeHtml(error?.message || "Noma’lum xato")}</b>\n\nFaylni tekshirib qayta yuboring yoki /cancel bosing.`
        );
      }
    }

    case "question":
      if (!text) return sendMessage(chatId, "Savol bo‘sh bo‘lmasin. Savolni qayta yuboring:");
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
      if (![1, 2, 3, 4].includes(correct)) {
        return sendMessage(chatId, "Faqat <b>1, 2, 3 yoki 4</b> raqamidan birini yuboring:");
      }
      await setState(adminId, "explanation", { ...data, correct_option: correct - 1 });
      return sendMessage(chatId, "Javob izohini yuboring. Izoh kerak bo‘lmasa <b>-</b> yuboring:");
    }

    case "explanation": {
      const explanation = text === "-" ? null : text;
      const rows = await insert("quizzes", {
        question: data.question,
        options: data.options,
        correct_option: data.correct_option,
        explanation,
        status: "queued"
      });
      await clearState(adminId);
      const quiz = rows?.[0];
      return sendMessage(
        chatId,
        `✅ Quiz navbatga qo‘shildi.\n\n<b>#${quiz?.id || "—"}</b> ${escapeHtml(data.question)}`
      );
    }

    default:
      await clearState(adminId);
      return sendMessage(chatId, "Holat tozalandi. /addquiz orqali qayta boshlang.");
  }
}

async function handleGroupMessage(message) {
  if (!message.from || !isAdmin(message.from.id)) return;
  const command = commandOf(message.text || "");
  const chatId = message.chat.id;
  const title = message.chat.title || `Guruh ${chatId}`;

  if (command === "/register") {
    await insert(
      "groups",
      { chat_id: chatId, title, active: true },
      { upsert: true, onConflict: "chat_id" }
    );
    return sendMessage(chatId, `✅ <b>${escapeHtml(title)}</b> quiz tarqatish ro‘yxatiga qo‘shildi.`);
  }

  if (command === "/removegroup") {
    await update("groups", `chat_id=eq.${chatId}`, { active: false });
    return sendMessage(chatId, "Guruh quiz tarqatish ro‘yxatidan chiqarildi.");
  }
}

export async function handleUpdate(update) {
  const message = update.message;
  if (!message) return;

  if (message.chat?.type === "private") {
    if (!message.from || !isAdmin(message.from.id)) {
      return sendMessage(message.chat.id, "Bu bot faqat administrator tomonidan boshqariladi.");
    }
    return handlePrivateAdminMessage(message);
  }

  if (["group", "supergroup"].includes(message.chat?.type)) {
    return handleGroupMessage(message);
  }
}
