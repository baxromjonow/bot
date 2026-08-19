-- v1.6.5: HTML va CSS bitta "HTML & CSS" faniga birlashtiriladi.

-- Eski constraintlarni yangi subject qiymatiga moslaymiz.
alter table public.groups drop constraint if exists groups_subject_check;
alter table public.quizzes drop constraint if exists quizzes_subject_check;

-- Guruhlar progressini saqlagan holda bitta subjectga o'tkaziladi.
update public.groups
set subject = 'html_css', track = 'html_css', progress_updated_at = now()
where subject in ('html','css');

-- Eski HTML/CSS bankidan 72 talik aralash bank yaratamiz:
-- HTML #1, CSS #1, HTML #2, CSS #2 ... (birinchi 72 ta).
create temporary table _html_css_merge on commit drop as
select * from (
  select
    question, options, correct_option, explanation, category,
    row_number() over(order by coalesce(quiz_no, 999999), case when subject='html' then 0 else 1 end, id) as new_quiz_no,
    track, fingerprint
  from public.quizzes
  where subject in ('html','css')
) x
where new_quiz_no <= 72;

delete from public.quizzes where subject in ('html','css','html_css');

insert into public.quizzes(
  question, options, correct_option, explanation, category,
  status, subject, quiz_no, track, fingerprint
)
select
  question, options, correct_option, explanation, category,
  'queued', 'html_css', new_quiz_no, 'html_css',
  md5('html_css|' || coalesce(question,'') || '|' || new_quiz_no::text)
from _html_css_merge;

alter table public.groups add constraint groups_subject_check
  check (subject is null or subject in ('word','excel','powerpoint','html_css','javascript'));

alter table public.quizzes add constraint quizzes_subject_check
  check (subject is null or subject in ('word','excel','powerpoint','html_css','javascript'));

-- Excel import RPC ham HTML & CSS ni qabul qiladi.
create or replace function public.replace_subject_quizzes(
  p_subject text,
  p_quizzes jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if p_subject not in ('word','excel','powerpoint','html_css','javascript') then
    raise exception 'Noto''g''ri fan: %', p_subject;
  end if;
  if jsonb_typeof(p_quizzes) <> 'array' then
    raise exception 'p_quizzes array bo''lishi kerak';
  end if;
  delete from public.quizzes where subject = p_subject;
  insert into public.quizzes(
    question, options, correct_option, explanation, category,
    status, subject, quiz_no, track, fingerprint
  )
  select
    x.question, x.options, x.correct_option, nullif(x.explanation, ''),
    coalesce(nullif(x.category, ''), 'Excel'), 'queued', p_subject,
    x.quiz_no, x.track, x.fingerprint
  from jsonb_to_recordset(p_quizzes) as x(
    question text, options jsonb, correct_option integer,
    explanation text, category text, quiz_no integer,
    track text, fingerprint text
  );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
