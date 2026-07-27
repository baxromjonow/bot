import { insert, select, update } from "./supabase.js";
import { sendQuiz } from "./telegram.js";
import { SUBJECT_IDS, QUIZZES_PER_SUBJECT, nextSubject, subjectLabel } from "./subjects.js";

async function advanceGroup(group){
  let subject=group.subject || "word";
  let pos=Number(group.quiz_position || 1)+1;
  if(pos>QUIZZES_PER_SUBJECT){ subject=nextSubject(subject); pos=1; }
  await update("groups",`chat_id=eq.${group.chat_id}`,{subject,quiz_position:pos,progress_updated_at:new Date().toISOString()});
}

export async function sendNextQuiz(subject=null){
  const filter=subject?`&subject=eq.${encodeURIComponent(subject)}`:"";
  const groups=await select("groups",`active=eq.true${filter}&select=chat_id,title,subject,quiz_position&order=added_at.asc`);
  if(!groups?.length) return {ok:true,message:subject?`${subjectLabel(subject)} uchun faol guruh yo‘q`:"Faol guruh yo‘q",sent:0,failed:0};
  let sent=0,failed=0; const quizIds=[];
  for(const group of groups){
    const s=group.subject||"word", pos=Math.min(QUIZZES_PER_SUBJECT,Math.max(1,Number(group.quiz_position||1)));
    const rows=await select("quizzes",`subject=eq.${s}&quiz_no=eq.${pos}&select=*&limit=1`);
    const quiz=rows?.[0];
    if(!quiz){ failed++; continue; }
    try{
      const poll=await sendQuiz(group.chat_id,quiz);
      await insert("quiz_deliveries",{quiz_id:quiz.id,chat_id:group.chat_id,telegram_message_id:poll.message_id,success:true,error:null});
      await advanceGroup(group); sent++; quizIds.push(quiz.id);
    }catch(error){ failed++; if(error?.telegramCode===403) await update("groups",`chat_id=eq.${group.chat_id}`,{active:false}); }
  }
  return {ok:true,subject,message:`Quizlar guruh progressiga mos yuborildi`,sent,failed,quizIds};
}

export async function sendAllTracks(){
  const results=[]; for(const subject of SUBJECT_IDS) results.push(await sendNextQuiz(subject));
  return {ok:true,results,sent:results.reduce((a,r)=>a+r.sent,0),failed:results.reduce((a,r)=>a+r.failed,0),quizIds:results.flatMap(r=>r.quizIds||[])};
}
