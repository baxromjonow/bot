-- v1.6.4 Quiz Replace + duplicate delivery protection

-- Har bir fan ichida quiz raqami yagona bo'ladi.
-- Avval eski duplicate yozuvlardan eng yangi ID qoldiriladi.
with ranked as (
  select id,
         row_number() over (partition by subject, quiz_no order by id desc) as rn
  from public.quizzes
  where subject is not null and quiz_no is not null
)
delete from public.quizzes q
using ranked r
where q.id = r.id and r.rn > 1;

create unique index if not exists quizzes_subject_quiz_no_unique
  on public.quizzes(subject, quiz_no)
  where subject is not null and quiz_no is not null;

alter table public.groups add column if not exists last_quiz_id bigint;
alter table public.groups add column if not exists last_quiz_subject text;
alter table public.groups add column if not exists last_quiz_no integer;
alter table public.groups add column if not exists last_quiz_sent_at timestamptz;

-- Excel importni bitta transaction ichida almashtiradi.
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
  if p_subject not in ('word','excel','powerpoint','html','css','javascript') then
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
    x.question,
    x.options,
    x.correct_option,
    nullif(x.explanation, ''),
    coalesce(nullif(x.category, ''), 'Excel'),
    'queued',
    p_subject,
    x.quiz_no,
    x.track,
    x.fingerprint
  from jsonb_to_recordset(p_quizzes) as x(
    question text,
    options jsonb,
    correct_option integer,
    explanation text,
    category text,
    quiz_no integer,
    track text,
    fingerprint text
  );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
