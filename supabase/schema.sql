-- =====================================================================
-- Akoma: database schema for Supabase (Postgres)
-- Run once in Supabase > SQL Editor. Safe to re-run while you are
-- setting up: functions use "create or replace" and the card type is
-- dropped and recreated.
--
-- How access works
--   * Members never read other members' rows directly. They call the
--     functions below (list_profiles, feed, send_request ...), which
--     enforce the rules: photos hidden until a match, one message
--     request per woman, no subscription or daily cap, no contact
--     details or money requests in first messages.
--   * Admins (role = 'admin') can read and moderate everything.
--   * Photos live in private storage and are served with signed URLs.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('woman','man','admin')),
  name text not null check (char_length(name) between 1 and 40),
  age int not null check (age between 18 and 99),
  city text not null default 'Accra',
  bio text not null default '' check (char_length(bio) <= 240),
  interests text[] not null default '{}',
  looking_for text not null default 'Dating'
    check (looking_for in ('Friendship first','Dating','Serious relationship')),
  photos text[] not null default '{}',          -- paths in the 'photos' bucket
  hide_photo boolean not null default false,    -- woman chose to hide her photos
  hide_from_contacts boolean not null default true,
  notifications boolean not null default true,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','banned')),
  review_note text,
  selfie_path text,                             -- 'verification' bucket
  id_card_path text,                            -- 'verification' bucket (men)
  featured_until timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  woman_id uuid not null references public.profiles(id) on delete cascade,
  man_id uuid not null references public.profiles(id) on delete cascade,
  origin text not null check (origin in ('like','request')),
  status text not null default 'active' check (status in ('active','ended')),
  created_at timestamptz not null default now(),
  unique (woman_id, man_id)
);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.matches(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  flagged boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists messages_match_idx on public.messages (match_id, created_at);

create table if not exists public.message_requests (
  id uuid primary key default gen_random_uuid(),
  from_man uuid not null references public.profiles(id) on delete cascade,
  to_woman uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 200),
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  unique (from_man, to_woman)
);
create index if not exists requests_from_idx on public.message_requests (from_man, created_at);

create table if not exists public.blocks (
  blocker uuid not null references public.profiles(id) on delete cascade,
  blocked uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked)
);

create table if not exists public.passes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, target_id)
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '' check (char_length(body) <= 500),
  image_path text,
  status text not null default 'visible' check (status in ('visible','pending','removed')),
  created_at timestamptz not null default now(),
  check (char_length(body) > 0 or image_path is not null)
);
create index if not exists posts_created_idx on public.posts (created_at desc);

create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (post_id, user_id)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in
    ('Asked for money','Fake profile','Harassment','Under 18','Something else')),
  details text not null default '' check (char_length(details) <= 500),
  status text not null default 'open' check (status in ('open','actioned','dismissed')),
  created_at timestamptz not null default now()
);

create table if not exists public.plans (
  code text primary key,
  label text not null,
  price_ghs numeric(8,2) not null check (price_ghs > 0),
  days int not null check (days > 0)
);
insert into public.plans (code, label, price_ghs, days) values
  ('week','Weekly',30,7),
  ('month','Monthly',100,30)
on conflict (code) do nothing;

create table if not exists public.subscriptions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  plan text references public.plans(code),
  status text not null default 'active' check (status in ('active','expired')),
  current_period_end timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reference text not null unique,
  plan text not null references public.plans(code),
  amount_ghs numeric(8,2) not null,
  network text,
  status text not null default 'success',
  created_at timestamptz not null default now()
);

create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  phone text not null unique check (char_length(phone) between 9 and 20),
  city text not null default 'Accra',
  role text not null check (role in ('woman','man')),
  invited boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_log (
  id bigint generated always as identity primary key,
  admin_id uuid,
  action text not null,
  target uuid,
  note text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Content rules (the app mirrors these in the browser)
-- ---------------------------------------------------------------------
create or replace function public.has_money_terms(t text) returns boolean
language sql immutable as $$
  select coalesce(t,'') ~* '(momo|mobile money|send (me )?(some )?money|airtime|cedis|ghs|gh₵|western union|bitcoin|crypto|gift ?card|emergency|per hour|per night|my rates?|escort|sugar ?(mummy|mama|daddy)|hook ?up|one night)'
$$;

create or replace function public.has_contact_info(t text) returns boolean
language sql immutable as $$
  select coalesce(t,'') ~* '(https?://|www\.|\.com|\.gh\y|wa\.me|whatsapp|telegram|instagram|snapchat|@[a-z0-9_.]{3,})'
      or coalesce(t,'') ~ '(\+?[0-9][ .()-]*){9,}'
$$;

-- ---------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function public.my_status() returns text
language sql stable security definer set search_path = public as $$
  select status from profiles where id = auth.uid()
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' and status = 'approved'
                   from profiles where id = auth.uid()), false)
$$;

create or replace function public.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks
                 where (blocker = a and blocked = b) or (blocker = b and blocked = a))
$$;

create or replace function public.has_active_match(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from matches m
                 where m.status = 'active'
                   and ((m.woman_id = a and m.man_id = b) or (m.woman_id = b and m.man_id = a)))
$$;

-- A hidden photo is visible to its owner, to admins and to active matches.
create or replace function public.can_see_photos(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() = target
      or public.is_admin()
      or not coalesce((select hide_photo from profiles where id = target), false)
      or public.has_active_match(auth.uid(), target)
$$;

create or replace function public.has_active_subscription(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from subscriptions
                 where user_id = uid and status = 'active' and current_period_end > now())
$$;

create or replace function public.can_view_object(obj text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    public.is_admin()
    or split_part(obj, '/', 1) = auth.uid()::text
    or (public.my_status() = 'approved' and (
         exists (select 1 from posts p
                 where p.image_path = obj and p.status = 'visible')
         or exists (select 1 from profiles t
                    where t.id::text = split_part(obj, '/', 1)
                      and t.status = 'approved'
                      and obj = any (t.photos)
                      and public.can_see_photos(t.id))
       ))
  )
$$;

-- ---------------------------------------------------------------------
-- Profile guard: members cannot approve themselves, change role,
-- feature themselves or point at someone else's files.
-- Edits from the SQL editor or service role (no auth.uid) are allowed.
-- ---------------------------------------------------------------------
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.role := case when new.role = 'man' then 'man' else 'woman' end;
      new.status := 'pending';
      new.featured_until := null;
      new.review_note := null;
    else
      new.role := old.role;
      new.status := old.status;
      new.featured_until := old.featured_until;
      new.review_note := old.review_note;
    end if;
  end if;
  if cardinality(new.photos) > 6 then
    raise exception 'too_many_photos';
  end if;
  if exists (select 1 from unnest(new.photos) p where p not like new.id::text || '/%') then
    raise exception 'bad_photo_path';
  end if;
  if cardinality(new.interests) > 12 then
    raise exception 'too_many_interests';
  end if;
  if public.has_money_terms(new.bio) or public.has_contact_info(new.bio) then
    raise exception 'bio_not_allowed';
  end if;
  return new;
end $$;

drop trigger if exists guard_profile_trg on public.profiles;
create trigger guard_profile_trg before insert or update on public.profiles
  for each row execute function public.guard_profile();

-- ---------------------------------------------------------------------
-- Profile cards (what members see of each other)
-- ---------------------------------------------------------------------
drop type if exists public.profile_card cascade;
create type public.profile_card as (
  id uuid, role text, name text, age int, city text, bio text,
  interests text[], looking_for text, photos text[], photo_hidden boolean,
  featured boolean, is_match boolean, request_sent boolean, passed boolean
);

create or replace function public.list_profiles(p_min int default 18, p_max int default 99)
returns setof public.profile_card
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); r text := public.my_role();
begin
  if public.my_status() is distinct from 'approved' or r not in ('woman','man') then
    return;
  end if;
  return query
  select p.id, p.role, p.name, p.age, p.city, p.bio, p.interests, p.looking_for,
         case when public.can_see_photos(p.id) then p.photos else '{}'::text[] end,
         not public.can_see_photos(p.id),
         coalesce(p.featured_until > now(), false),
         public.has_active_match(me, p.id),
         exists (select 1 from message_requests q where q.from_man = me and q.to_woman = p.id),
         exists (select 1 from passes x where x.user_id = me and x.target_id = p.id)
  from profiles p
  where p.role = case r when 'woman' then 'man' else 'woman' end
    and p.status = 'approved'
    and p.age between p_min and p_max
    and not public.is_blocked_between(me, p.id)
  order by coalesce(p.featured_until > now(), false) desc, p.created_at desc;
end $$;

create or replace function public.get_profile(target uuid)
returns setof public.profile_card
language sql stable security definer set search_path = public as $$
  select * from public.list_profiles(18, 99) where id = target
$$;

-- ---------------------------------------------------------------------
-- Matching and messaging
-- ---------------------------------------------------------------------
create or replace function public.pass_profile(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.my_status() is distinct from 'approved' then raise exception 'not_allowed'; end if;
  insert into passes (user_id, target_id) values (auth.uid(), target) on conflict do nothing;
end $$;

-- A woman likes a man: a chat opens straight away.
create or replace function public.like_profile(target uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); mid uuid;
begin
  if public.my_status() is distinct from 'approved' or public.my_role() <> 'woman' then
    raise exception 'not_allowed';
  end if;
  if not exists (select 1 from profiles where id = target and role = 'man' and status = 'approved') then
    raise exception 'not_found';
  end if;
  if public.is_blocked_between(me, target) then raise exception 'blocked'; end if;
  insert into matches (woman_id, man_id, origin) values (me, target, 'like')
    on conflict (woman_id, man_id) do update set status = 'active'
    returning id into mid;
  update message_requests set status = 'accepted'
    where from_man = target and to_woman = me and status = 'pending';
  return mid;
end $$;

-- Any approved man can send one free message request to a woman.
create or replace function public.send_request(target uuid, msg text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  body text := btrim(coalesce(msg, ''));
  rid uuid;
begin
  if public.my_status() is distinct from 'approved' or public.my_role() <> 'man' then
    raise exception 'not_allowed';
  end if;
  if not exists (select 1 from profiles where id = target and role = 'woman' and status = 'approved') then
    raise exception 'not_found';
  end if;
  if public.is_blocked_between(me, target) then raise exception 'blocked'; end if;
  if public.has_active_match(me, target) then raise exception 'already_matched'; end if;
  if exists (select 1 from message_requests where from_man = me and to_woman = target) then
    raise exception 'already_requested';
  end if;
  if char_length(body) < 1 or char_length(body) > 200 then raise exception 'bad_length'; end if;
  if public.has_contact_info(body) then raise exception 'contact_not_allowed'; end if;
  if public.has_money_terms(body) then raise exception 'money_not_allowed'; end if;
  insert into message_requests (from_man, to_woman, body) values (me, target, body)
    returning id into rid;
  return rid;
end $$;

-- A woman accepts (opens a chat) or declines a request.
create or replace function public.respond_request(req uuid, accept boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r message_requests; mid uuid;
begin
  select * into r from message_requests
    where id = req and to_woman = me and status = 'pending' for update;
  if not found then raise exception 'not_found'; end if;
  if not accept then
    update message_requests set status = 'declined' where id = req;
    return null;
  end if;
  if public.is_blocked_between(me, r.from_man) then raise exception 'blocked'; end if;
  insert into matches (woman_id, man_id, origin) values (me, r.from_man, 'request')
    on conflict (woman_id, man_id) do update set status = 'active'
    returning id into mid;
  insert into messages (match_id, sender_id, body) values (mid, r.from_man, r.body);
  update message_requests set status = 'accepted' where id = req;
  return mid;
end $$;

create or replace function public.send_message(m uuid, msg text) returns public.messages
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  body text := btrim(coalesce(msg, ''));
  mt matches; other uuid; out_row messages;
begin
  select * into mt from matches
    where id = m and status = 'active' and me in (woman_id, man_id);
  if not found then raise exception 'not_found'; end if;
  other := case when mt.woman_id = me then mt.man_id else mt.woman_id end;
  if public.is_blocked_between(me, other) then raise exception 'blocked'; end if;
  if public.my_status() is distinct from 'approved' then raise exception 'not_allowed'; end if;
  if char_length(body) < 1 or char_length(body) > 1000 then raise exception 'bad_length'; end if;
  insert into messages (match_id, sender_id, body, flagged)
    values (m, me, body, public.has_money_terms(body))
    returning * into out_row;
  return out_row;
end $$;

create or replace function public.list_matches()
returns table (match_id uuid, other_id uuid, created_at timestamptz,
               last_body text, last_at timestamptz, last_flagged boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare me uuid := auth.uid();
begin
  return query
  select m.id,
         case when m.woman_id = me then m.man_id else m.woman_id end,
         m.created_at,
         lm.body, lm.created_at, coalesce(lm.flagged, false)
  from matches m
  left join lateral (
    select x.body, x.created_at, x.flagged from messages x
    where x.match_id = m.id order by x.created_at desc limit 1
  ) lm on true
  where m.status = 'active' and me in (m.woman_id, m.man_id)
  order by coalesce(lm.created_at, m.created_at) desc;
end $$;

create or replace function public.unmatch(m uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update matches set status = 'ended'
    where id = m and auth.uid() in (woman_id, man_id);
end $$;

-- ---------------------------------------------------------------------
-- Safety
-- ---------------------------------------------------------------------
create or replace function public.report_user(target uuid, why text, more text default '', also_block boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if public.my_status() is distinct from 'approved' then raise exception 'not_allowed'; end if;
  insert into reports (reporter_id, reported_id, reason, details)
    values (me, target, why, left(coalesce(more, ''), 500));
  if also_block then
    insert into blocks (blocker, blocked) values (me, target) on conflict do nothing;
    update matches set status = 'ended'
      where status = 'active'
        and ((woman_id = me and man_id = target) or (woman_id = target and man_id = me));
    update message_requests set status = 'declined'
      where status = 'pending'
        and ((from_man = me and to_woman = target) or (from_man = target and to_woman = me));
  end if;
end $$;

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not_allowed'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- ---------------------------------------------------------------------
-- Timeline
-- ---------------------------------------------------------------------
create or replace function public.create_post(msg text, img text default null) returns public.posts
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  body text := btrim(coalesce(msg, ''));
  newp posts;
begin
  if public.my_status() is distinct from 'approved' then raise exception 'not_allowed'; end if;
  if char_length(body) = 0 and img is null then raise exception 'bad_length'; end if;
  if char_length(body) > 500 then raise exception 'bad_length'; end if;
  if public.has_contact_info(body) then raise exception 'contact_not_allowed'; end if;
  if public.has_money_terms(body) then raise exception 'money_not_allowed'; end if;
  if img is not null and img not like me::text || '/%' then raise exception 'bad_photo_path'; end if;
  -- Posts with a photo wait for an admin to approve them.
  insert into posts (author_id, body, image_path, status)
    values (me, body, img, case when img is null then 'visible' else 'pending' end)
    returning * into newp;
  return newp;
end $$;

create or replace function public.feed()
returns table (id uuid, author_id uuid, author_name text, author_age int, author_photo text,
               body text, image_path text, like_count bigint, liked boolean,
               status text, created_at timestamptz, mine boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare me uuid := auth.uid();
begin
  if public.my_status() is distinct from 'approved' then return; end if;
  return query
  select p.id, p.author_id, a.name, a.age,
         case when public.can_see_photos(a.id) then a.photos[1] else null end,
         p.body, p.image_path,
         (select count(*) from post_likes l where l.post_id = p.id),
         exists (select 1 from post_likes l where l.post_id = p.id and l.user_id = me),
         p.status, p.created_at, p.author_id = me
  from posts p
  join profiles a on a.id = p.author_id
  where (p.status = 'visible' or p.author_id = me)
    and p.status <> 'removed'
    and a.status = 'approved'
    and not public.is_blocked_between(me, p.author_id)
  order by p.created_at desc
  limit 60;
end $$;

create or replace function public.toggle_post_like(post uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if public.my_status() is distinct from 'approved' then raise exception 'not_allowed'; end if;
  if exists (select 1 from post_likes where post_id = post and user_id = me) then
    delete from post_likes where post_id = post and user_id = me;
    return false;
  end if;
  insert into post_likes (post_id, user_id) values (post, me);
  return true;
end $$;

-- ---------------------------------------------------------------------
-- Admin actions
-- ---------------------------------------------------------------------
create or replace function public.admin_set_status(target uuid, new_status text, note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  if new_status not in ('pending','approved','rejected','banned') then raise exception 'bad_status'; end if;
  update profiles set status = new_status, review_note = note where id = target and role <> 'admin';
  if new_status = 'banned' then
    update matches set status = 'ended'
      where status = 'active' and target in (woman_id, man_id);
  end if;
  insert into admin_log (admin_id, action, target, note)
    values (auth.uid(), 'status:' || new_status, target, note);
end $$;

-- Called only by the payment webhook (service role). Idempotent per reference.
create or replace function public.activate_subscription(uid uuid, plan_code text, ref text, paid numeric, net text)
returns void language plpgsql security definer set search_path = public as $$
declare pl plans;
begin
  select * into pl from plans where code = plan_code;
  if not found then raise exception 'unknown_plan'; end if;
  insert into payments (user_id, reference, plan, amount_ghs, network, status)
    values (uid, ref, plan_code, paid, net, 'success')
    on conflict (reference) do nothing;
  if not found then return; end if;
  insert into subscriptions (user_id, plan, status, current_period_end, updated_at)
    values (uid, plan_code, 'active', now() + make_interval(days => pl.days), now())
    on conflict (user_id) do update
      set plan = excluded.plan,
          status = 'active',
          current_period_end = greatest(subscriptions.current_period_end, now()) + make_interval(days => pl.days),
          updated_at = now();
end $$;

revoke all on function public.activate_subscription(uuid, text, text, numeric, text)
  from public, anon, authenticated;
grant execute on function public.activate_subscription(uuid, text, text, numeric, text) to service_role;

-- ---------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.matches enable row level security;
alter table public.messages enable row level security;
alter table public.message_requests enable row level security;
alter table public.blocks enable row level security;
alter table public.passes enable row level security;
alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.reports enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.waitlist enable row level security;
alter table public.admin_log enable row level security;

-- profiles: you see your own row; admins see all.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated
  with check (id = auth.uid() and role in ('woman','man'));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- matches, messages, requests: members of the conversation and admins (read only).
drop policy if exists matches_select on public.matches;
create policy matches_select on public.matches for select to authenticated
  using (auth.uid() in (woman_id, man_id) or public.is_admin());
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using (public.is_admin() or exists (
    select 1 from public.matches m
    where m.id = match_id and m.status = 'active' and auth.uid() in (m.woman_id, m.man_id)));
drop policy if exists requests_select on public.message_requests;
create policy requests_select on public.message_requests for select to authenticated
  using (auth.uid() in (from_man, to_woman) or public.is_admin());

-- blocks and passes: your own.
drop policy if exists blocks_select on public.blocks;
create policy blocks_select on public.blocks for select to authenticated using (blocker = auth.uid());
drop policy if exists blocks_delete on public.blocks;
create policy blocks_delete on public.blocks for delete to authenticated using (blocker = auth.uid());
drop policy if exists passes_select on public.passes;
create policy passes_select on public.passes for select to authenticated using (user_id = auth.uid());

-- posts: admins moderate; members write through create_post() and read through feed().
drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts for select to authenticated
  using (author_id = auth.uid() or public.is_admin());
drop policy if exists posts_update on public.posts;
create policy posts_update on public.posts for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists posts_delete on public.posts;
create policy posts_delete on public.posts for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());
drop policy if exists reports_update on public.reports;
create policy reports_update on public.reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists plans_select on public.plans;
create policy plans_select on public.plans for select to anon, authenticated using (true);

drop policy if exists subs_select on public.subscriptions;
create policy subs_select on public.subscriptions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists waitlist_insert on public.waitlist;
create policy waitlist_insert on public.waitlist for insert to anon, authenticated
  with check (char_length(name) between 1 and 60 and char_length(phone) between 9 and 20
              and role in ('woman','man') and invited = false);
drop policy if exists waitlist_select on public.waitlist;
create policy waitlist_select on public.waitlist for select to authenticated using (public.is_admin());
drop policy if exists waitlist_update on public.waitlist;
create policy waitlist_update on public.waitlist for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_log_select on public.admin_log;
create policy admin_log_select on public.admin_log for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- Storage: private buckets, served with signed URLs
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('photos', 'photos', false, 5242880, array['image/jpeg','image/png','image/webp']),
  ('verification', 'verification', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists photos_insert on storage.objects;
create policy photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists photos_select on storage.objects;
create policy photos_select on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.can_view_object(name));
drop policy if exists photos_delete on storage.objects;
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists verification_insert on storage.objects;
create policy verification_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'verification' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists verification_update on storage.objects;
create policy verification_update on storage.objects for update to authenticated
  using (bucket_id = 'verification' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists verification_select on storage.objects;
create policy verification_select on storage.objects for select to authenticated
  using (bucket_id = 'verification'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ---------------------------------------------------------------------
-- Realtime chat
-- ---------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when others then null;
end $$;

-- ---------------------------------------------------------------------
-- Privileges (RLS above still decides what each member can touch)
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.plans to anon;
grant insert on public.waitlist to anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.activate_subscription(uuid, text, text, numeric, text)
  from authenticated, anon, public;

-- =====================================================================
-- After running this file, make yourself an admin (see README step 4):
--   update public.profiles set role = 'admin', status = 'approved'
--   where id = '<your auth user id>';
-- =====================================================================
