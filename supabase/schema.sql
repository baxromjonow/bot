create table if not exists public.groups (
  chat_id bigint primary key,
  title text not null,
  active boolean not null default true,
  added_at timestamptz not null default now()
);

create table if not exists public.quizzes (
  id bigint generated always as identity primary key,
  question text not null,
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4),
  correct_option integer not null check (correct_option between 0 and 3),
  explanation text,
  status text not null default 'queued' check (status in ('queued', 'processing', 'sent', 'failed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table if not exists public.quiz_deliveries (
  id bigint generated always as identity primary key,
  quiz_id bigint not null references public.quizzes(id) on delete cascade,
  chat_id bigint not null references public.groups(chat_id) on delete cascade,
  telegram_message_id bigint,
  success boolean not null default false,
  error text,
  sent_at timestamptz not null default now(),
  unique (quiz_id, chat_id)
);

create table if not exists public.admin_states (
  admin_id bigint primary key,
  step text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.claim_next_quiz()
returns setof public.quizzes
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with next_quiz as (
    select id
    from public.quizzes
    where status = 'queued'
    order by id asc
    for update skip locked
    limit 1
  )
  update public.quizzes q
  set status = 'processing'
  from next_quiz n
  where q.id = n.id
  returning q.*;
end;
$$;
