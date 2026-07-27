export const SUBJECTS = {
  word: { label: "📝 Word", next: "excel" },
  excel: { label: "📊 Excel", next: "powerpoint" },
  powerpoint: { label: "📽 PowerPoint", next: "html" },
  html: { label: "🌐 HTML", next: "css" },
  css: { label: "🎨 CSS", next: "javascript" },
  javascript: { label: "🟨 JavaScript", next: "word" }
};
export const SUBJECT_IDS = Object.keys(SUBJECTS);
export const QUIZZES_PER_SUBJECT = 72;
export const LESSONS_PER_SUBJECT = 12;
export function isSubject(v){ return SUBJECT_IDS.includes(String(v||"")); }
export function subjectLabel(v){ return SUBJECTS[v]?.label || String(v||"Noma’lum"); }
export function nextSubject(v){ return SUBJECTS[v]?.next || "word"; }
export function lessonToQuizStart(lesson){ const n=Math.min(12,Math.max(1,Number(lesson)||1)); return (n-1)*6+1; }
export function subjectKeyboard(prefix, ownerId=null){ return { inline_keyboard: SUBJECT_IDS.map(s=>[{text:subjectLabel(s),callback_data:ownerId?`${prefix}:${ownerId}:${s}`:`${prefix}:${s}`}]) }; }
export function lessonKeyboard(prefix, ownerId, subject){ const rows=[]; for(let i=1;i<=12;i+=4) rows.push([1,2,3,4].map(x=>i+x-1).filter(n=>n<=12).map(n=>({text:String(n),callback_data:`${prefix}:${ownerId}:${subject}:${n}`}))); return {inline_keyboard:rows}; }
