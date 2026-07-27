-- v1.6 Adaptive Group Progress
alter table public.groups add column if not exists subject text;
alter table public.groups add column if not exists quiz_position integer not null default 1;
alter table public.groups add column if not exists progress_updated_at timestamptz not null default now();
alter table public.quizzes add column if not exists subject text;
alter table public.quizzes add column if not exists quiz_no integer;

alter table public.groups drop constraint if exists groups_subject_check;
alter table public.groups add constraint groups_subject_check check (subject is null or subject in ('word','excel','powerpoint','html','css','javascript'));
alter table public.groups drop constraint if exists groups_quiz_position_check;
alter table public.groups add constraint groups_quiz_position_check check (quiz_position between 1 and 72);
alter table public.quizzes drop constraint if exists quizzes_subject_check;
alter table public.quizzes add constraint quizzes_subject_check check (subject is null or subject in ('word','excel','powerpoint','html','css','javascript'));

create index if not exists groups_subject_progress_idx on public.groups(active,subject,quiz_position);
create index if not exists quizzes_subject_no_idx on public.quizzes(subject,quiz_no);

-- Eski guruh progressi ataylab o'zgartirilmaydi. /connect orqali fan+dars bir marta belgilanadi.
-- Queue tozalash / reset quiz_position va subject ustunlariga tegmaydi.
