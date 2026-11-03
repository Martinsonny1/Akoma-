-- Akoma voice/video calling (LiveKit). Run after schema.sql and other Akoma migrations.
create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  caller_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  call_type text not null check (call_type in ('audio','video')),
  room_name text not null unique,
  status text not null default 'ringing' check (status in ('ringing','accepted','declined','missed','ended','failed')),
  started_at timestamptz not null default now(),
  accepted_at timestamptz,
  ended_at timestamptz,
  ended_by uuid references public.profiles(id) on delete set null,
  end_reason text,
  created_at timestamptz not null default now(),
  constraint calls_distinct_people check (caller_id <> recipient_id)
);
create index if not exists calls_caller_created_idx on public.calls(caller_id, created_at desc);
create index if not exists calls_recipient_created_idx on public.calls(recipient_id, created_at desc);

create table if not exists public.call_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  incoming_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.calls enable row level security;
alter table public.call_settings enable row level security;
drop policy if exists "call participants read own calls" on public.calls;
create policy "call participants read own calls" on public.calls for select to authenticated
using (auth.uid() = caller_id or auth.uid() = recipient_id);
drop policy if exists "members read own call settings" on public.call_settings;
create policy "members read own call settings" on public.call_settings for select to authenticated using (auth.uid() = user_id);
drop policy if exists "members update own call settings" on public.call_settings;
drop policy if exists "members update own call settings" on public.call_settings;
create policy "members update own call settings" on public.call_settings for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "members change own call settings" on public.call_settings;
create policy "members change own call settings" on public.call_settings for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select on public.calls to authenticated;
grant select, insert, update on public.call_settings to authenticated;

-- Realtime is used only for call-state signalling; audio/video never passes through Supabase.
do $$ begin
  alter publication supabase_realtime add table public.calls;
exception when duplicate_object then null;
when undefined_object then null;
end $$;
