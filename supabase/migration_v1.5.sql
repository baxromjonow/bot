-- Aziz Academy Quiz Bot v1.5 — 3 yo'nalish

alter table public.groups add column if not exists track text;
alter table public.quizzes add column if not exists track text;

-- Hozirgi bazadagi quizlar ko'pincha HTML/CSS bo'lgani uchun xavfsiz default.
update public.quizzes set track = 'html_css' where track is null;

-- Eski guruhlar yo'nalish tanlamaguncha null bo'lib qolishi mumkin.
create index if not exists groups_track_idx on public.groups(track, active);
create index if not exists quizzes_track_status_idx on public.quizzes(track, status, id);

alter table public.groups drop constraint if exists groups_track_check;
alter table public.groups add constraint groups_track_check
  check (track is null or track in ('computer','html_css','javascript'));

alter table public.quizzes drop constraint if exists quizzes_track_check;
alter table public.quizzes add constraint quizzes_track_check
  check (track in ('computer','html_css','javascript'));

create or replace function public.claim_next_quiz_by_track(p_track text)
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
    where status = 'queued' and track = p_track
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

create or replace function public.get_track_stats(p_timezone text default 'Asia/Tashkent')
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total', (select count(*) from public.quizzes),
    'queued', (select count(*) from public.quizzes where status='queued'),
    'sent', (select count(*) from public.quizzes where status='sent'),
    'failed', (select count(*) from public.quizzes where status='failed'),
    'groups', (select count(*) from public.groups where active=true),
    'sent_today', (
      select count(*) from public.quizzes
      where status='sent' and sent_at is not null
        and (sent_at at time zone p_timezone)::date = (now() at time zone p_timezone)::date
    ),
    'tracks', jsonb_build_object(
      'computer', jsonb_build_object(
        'queued', (select count(*) from public.quizzes where status='queued' and track='computer'),
        'sent', (select count(*) from public.quizzes where status='sent' and track='computer'),
        'groups', (select count(*) from public.groups where active=true and track='computer')
      ),
      'html_css', jsonb_build_object(
        'queued', (select count(*) from public.quizzes where status='queued' and track='html_css'),
        'sent', (select count(*) from public.quizzes where status='sent' and track='html_css'),
        'groups', (select count(*) from public.groups where active=true and track='html_css')
      ),
      'javascript', jsonb_build_object(
        'queued', (select count(*) from public.quizzes where status='queued' and track='javascript'),
        'sent', (select count(*) from public.quizzes where status='sent' and track='javascript'),
        'groups', (select count(*) from public.groups where active=true and track='javascript')
      )
    )
  );
$$;
