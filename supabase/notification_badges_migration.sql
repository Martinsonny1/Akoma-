-- Persistent per-user unread chat and new-match badge state.
create table if not exists public.akoma_chat_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, match_id)
);
create table if not exists public.akoma_notification_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  matches_seen_at timestamptz not null default 'epoch'::timestamptz
);
alter table public.akoma_chat_reads enable row level security;
alter table public.akoma_notification_state enable row level security;
drop policy if exists "Users manage own chat read markers" on public.akoma_chat_reads;
create policy "Users manage own chat read markers" on public.akoma_chat_reads
  for all to authenticated using (user_id = auth.uid()) with check (
    user_id = auth.uid() and exists (
      select 1 from public.matches m where m.id = match_id
      and (m.woman_id = auth.uid() or m.man_id = auth.uid())
    )
  );
drop policy if exists "Users manage own notification state" on public.akoma_notification_state;
create policy "Users manage own notification state" on public.akoma_notification_state
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.akoma_chat_reads to authenticated;
grant select, insert, update, delete on public.akoma_notification_state to authenticated;

-- Existing matches are historical; only matches created after this migration count as new.
insert into public.akoma_notification_state (user_id, matches_seen_at)
select id, now() from auth.users
on conflict (user_id) do nothing;
