-- Aziz Academy Quiz Bot v1.3 migration
-- Eski quizlar va guruhlarni o‘chirmaydi.

alter table public.quizzes add column if not exists category text;
alter table public.quizzes add column if not exists fingerprint text;

-- Eski savollarga fingerprint beramiz. Agar oldindan aynan bir xil savol bir necha marta
-- mavjud bo‘lsa, faqat birinchisiga fingerprint beriladi; qolganlari tarix sifatida qoladi.
with normalized as (
  select
    id,
    lower(regexp_replace(trim(question), '[[:space:]]+', ' ', 'g')) as fp,
    row_number() over (
      partition by lower(regexp_replace(trim(question), '[[:space:]]+', ' ', 'g'))
      order by id
    ) as rn
  from public.quizzes
)
update public.quizzes q
set fingerprint = case when n.rn = 1 then n.fp else null end
from normalized n
where q.id = n.id;

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
values (
  'schedule',
  '{"timezone":"Asia/Tashkent","days":[1,2,3,4,5,6],"times":["09:00","14:00","19:00"],"paused":false,"lowQueueThreshold":15}'::jsonb
)
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
      select count(*)
      from public.quizzes
      where status = 'sent'
        and sent_at is not null
        and (sent_at at time zone p_timezone)::date = (now() at time zone p_timezone)::date
    )
  );
$$;
