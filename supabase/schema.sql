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

-- v1.3 additions
alter table public.quizzes add column if not exists category text;
alter table public.quizzes add column if not exists fingerprint text;

create unique index if not exists quizzes_fingerprint_unique
  on public.quizzes (fingerprint);
create index if not exists quizzes_category_idx on public.quizzes(category);
create index if not exists quizzes_status_idx on public.quizzes(status);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.app_settings(key, value)
values ('schedule', '{"timezone":"Asia/Tashkent","days":[1,2,3,4,5,6],"times":["09:00","14:00","19:00"],"paused":false,"lowQueueThreshold":15}'::jsonb)
on conflict (key) do nothing;

insert into public.app_settings(key, value)
values ('low_queue_alert_state', '{"below":false}'::jsonb)
on conflict (key) do nothing;

create table if not exists public.schedule_runs (
  slot_key text primary key,
  scheduled_time text not null,
  quiz_id bigint references public.quizzes(id) on delete set null,
  status text not null default 'processing' check (status in ('processing','sent','empty','failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create or replace function public.get_quiz_stats(p_timezone text default 'Asia/Tashkent')
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total', (select count(*) from public.quizzes),
    'queued', (select count(*) from public.quizzes where status = 'queued'),
    'sent', (select count(*) from public.quizzes where status = 'sent'),
    'failed', (select count(*) from public.quizzes where status = 'failed'),
    'groups', (select count(*) from public.groups where active = true),
    'sent_today', (
      select count(*) from public.quizzes
      where status = 'sent' and sent_at is not null
        and (sent_at at time zone p_timezone)::date = (now() at time zone p_timezone)::date
    )
  );
$$;
