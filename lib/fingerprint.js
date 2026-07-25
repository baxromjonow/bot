export function quizFingerprint(question = "") {
  return String(question)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
