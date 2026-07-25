import { readSheet } from "read-excel-file/node";

const REQUIRED_HEADERS = {
  question: ["savol", "question"],
  option1: ["variant1", "1variant", "option1", "javob1"],
  option2: ["variant2", "2variant", "option2", "javob2"],
  option3: ["variant3", "3variant", "option3", "javob3"],
  option4: ["variant4", "4variant", "option4", "javob4"],
  correct: ["togrijavob", "to'g'rijavob", "correct", "correctanswer"],
  explanation: ["izoh", "tarif", "ta'rif", "explanation", "description"]
};

function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[ʻʼ’`´']/g, "")
    .replace(/[^a-z0-9а-яёғқҳў]+/gi, "");
}

function asText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function findColumn(headers, aliases) {
  const normalizedAliases = aliases.map(normalizeHeader);
  return headers.findIndex((header) => normalizedAliases.includes(header));
}

function validateQuiz(rowNumber, values) {
  const errors = [];
  const question = asText(values.question);
  const options = [values.option1, values.option2, values.option3, values.option4].map(asText);
  const explanationRaw = asText(values.explanation);
  const explanation = explanationRaw && explanationRaw !== "-" ? explanationRaw : null;
  const correct = Number(values.correct);

  if (!question) errors.push(`Savol bo‘sh.`);
  if (question.length > 300) errors.push(`Savol 300 belgidan uzun (${question.length}).`);

  options.forEach((option, index) => {
    if (!option) errors.push(`${index + 1}-variant bo‘sh.`);
    if (option.length > 100) errors.push(`${index + 1}-variant 100 belgidan uzun (${option.length}).`);
  });

  if (!Number.isInteger(correct) || correct < 1 || correct > 4) {
    errors.push(`To‘g‘ri javob 1, 2, 3 yoki 4 bo‘lishi kerak.`);
  }

  if (explanation && explanation.length > 200) {
    errors.push(`Izoh 200 belgidan uzun (${explanation.length}).`);
  }

  if (errors.length) {
    return { ok: false, rowNumber, errors };
  }

  return {
    ok: true,
    quiz: {
      question,
      options,
      correct_option: correct - 1,
      explanation,
      status: "queued"
    }
  };
}

export async function parseQuizWorkbook(buffer) {
  const rows = await readSheet(buffer, { sheet: 1 });
  if (!Array.isArray(rows) || rows.length < 2) {
    throw new Error("Excel faylda sarlavha va kamida bitta quiz qatori bo‘lishi kerak.");
  }

  const headers = rows[0].map(normalizeHeader);
  const columns = {};

  for (const [key, aliases] of Object.entries(REQUIRED_HEADERS)) {
    const index = findColumn(headers, aliases);
    if (index === -1 && key !== "explanation") {
      throw new Error(
        `Excel ustuni topilmadi: ${key}. Namuna fayldagi sarlavhalarni o‘zgartirmang.`
      );
    }
    columns[key] = index;
  }

  const quizzes = [];
  const validationErrors = [];

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i] || [];
    const hasAnyValue = row.some((cell) => asText(cell) !== "");
    if (!hasAnyValue) continue;

    const values = {
      question: row[columns.question],
      option1: row[columns.option1],
      option2: row[columns.option2],
      option3: row[columns.option3],
      option4: row[columns.option4],
      correct: row[columns.correct],
      explanation: columns.explanation === -1 ? null : row[columns.explanation]
    };

    const result = validateQuiz(i + 1, values);
    if (result.ok) quizzes.push(result.quiz);
    else validationErrors.push(result);
  }

  if (!quizzes.length && !validationErrors.length) {
    throw new Error("Excel faylda quizlar topilmadi.");
  }

  return { quizzes, validationErrors };
}
