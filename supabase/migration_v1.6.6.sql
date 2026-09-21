-- v1.6.6: Quizy Telegram topic support
alter table public.groups add column if not exists quiz_topic_id bigint;
create index if not exists groups_quiz_topic_idx on public.groups(active, quiz_topic_id);

-- Eski guruhlar xavfsizlik uchun avtomatik quiz olmaydi, toki admin Quizy mavzusida /guruh qilmaguncha.
update public.groups set quiz_topic_id = null where quiz_topic_id is null;
