-- Akoma guest browsing + optional selfie verification.
-- Run once in Supabase SQL Editor AFTER the existing migrations, including
-- verification_progressive_migration.sql and security_hardening_migration.sql.
-- This migration keeps existing approved members approved. Existing pending
-- accounts without a selfie become guests and can browse while deciding.

begin;

-- Add guest as a first-class profile state.
alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check
  check (status in ('guest','pending','approved','rejected','banned'));
update public.profiles set status = 'guest'
  where status = 'pending' and selfie_path is null and role <> 'admin';

-- Preserve all profile integrity checks while changing new signups to guest.
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public, storage as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if current_setting('akoma.selfie_submit', true) = 'true' then
      null; -- trusted, narrowly-scoped submit_selfie_verification RPC
    elsif tg_op = 'INSERT' then
      new.role := case when new.role = 'man' then 'man' else 'woman' end;
      new.status := 'guest';
      new.featured_until := null;
      new.review_note := null;
      new.created_at := now();
    else
      new.role := old.role;
      new.status := old.status;
      new.featured_until := old.featured_until;
      new.review_note := old.review_note;
      new.created_at := old.created_at;
      if old.status = 'approved' then
        new.name := old.name;
        new.age := old.age;
        new.id_card_path := old.id_card_path;
        new.selfie_path := old.selfie_path;
      end if;
    end if;
    if new.id_card_path is not null and (tg_op = 'INSERT' or new.id_card_path is distinct from old.id_card_path) then
      if new.id_card_path not like new.id::text || '/%'
         or not exists (select 1 from storage.objects o where o.bucket_id = 'verification' and o.name = new.id_card_path) then
        raise exception 'bad_id_path';
      end if;
    end if;
    if new.selfie_path is not null and (tg_op = 'INSERT' or new.selfie_path is distinct from old.selfie_path) then
      if new.selfie_path not like new.id::text || '/%'
         or not exists (select 1 from storage.objects o where o.bucket_id = 'verification' and o.name = new.selfie_path) then
        raise exception 'bad_selfie_path';
      end if;
    end if;
  end if;
  if cardinality(new.photos) > 6 then raise exception 'too_many_photos'; end if;
  if exists (select 1 from unnest(new.photos) p where p not like new.id::text || '/%') then raise exception 'bad_photo_path'; end if;
  if cardinality(new.interests) > 12 then raise exception 'too_many_interests'; end if;
  if public.has_money_terms(new.bio) or public.has_contact_info(new.bio) then raise exception 'bio_not_allowed'; end if;
  return new;
end $$;

-- A user can request review only after their own selfie has been uploaded.
create or replace function public.submit_selfie_verification()
returns void language plpgsql security definer set search_path = public as $$
declare current_status text;
begin
  select status into current_status from public.profiles where id = auth.uid() for update;
  if current_status is null then raise exception 'profile_required'; end if;
  if current_status in ('banned','approved') then raise exception 'not_allowed'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and selfie_path is not null) then
    raise exception 'selfie_required';
  end if;
  perform set_config('akoma.selfie_submit', 'true', true);
  update public.profiles set status = 'pending', review_note = null where id = auth.uid();
  perform set_config('akoma.selfie_submit', 'false', true);
end $$;
revoke all on function public.submit_selfie_verification() from public;
grant execute on function public.submit_selfie_verification() to authenticated;

-- Allow guest/pending members to obtain signed URLs for public approved
-- profile photos and visible timeline posts. Private verification/vault media
-- remains protected by the existing bucket policies.
create or replace function public.can_view_object(obj text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    public.is_admin()
    or split_part(obj, '/', 1) = auth.uid()::text
    or (public.my_status() in ('guest','pending','approved') and (
         exists (select 1 from posts p where p.image_path = obj and p.status = 'visible'
                 and exists (select 1 from profiles a where a.id = p.author_id and a.status = 'approved'))
         or exists (select 1 from profiles t where t.id::text = split_part(obj, '/', 1)
                    and t.status = 'approved' and obj = any (t.photos)
                    and public.can_see_photos(t.id))
       ))
  )
$$;

-- Guests and pending members can browse approved profiles, but all write
-- actions remain protected by the existing approved-only RPC checks.
create or replace function public.list_profiles(p_min int default 18, p_max int default 99)
returns setof public.profile_card
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); r text := public.my_role(); st text := public.my_status();
begin
  if st not in ('guest','pending','approved') or r not in ('woman','man') then return; end if;
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

-- Timeline is readable by guests; post creation/likes remain approved-only.
create or replace function public.feed()
returns table (id uuid, author_id uuid, author_name text, author_age int, author_photo text,
               body text, image_path text, like_count bigint, liked boolean,
               status text, created_at timestamptz, mine boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare me uuid := auth.uid(); st text := public.my_status();
begin
  if st not in ('guest','pending','approved') then return; end if;
  return query
  select p.id, p.author_id, a.name, a.age,
         case when public.can_see_photos(a.id) then a.photos[1] else null end,
         p.body, p.image_path,
         (select count(*) from post_likes l where l.post_id = p.id),
         exists (select 1 from post_likes l where l.post_id = p.id and l.user_id = me),
         p.status, p.created_at, p.author_id = me
  from posts p join profiles a on a.id = p.author_id
  where p.status = 'visible' and a.status = 'approved'
    and not public.is_blocked_between(me, p.author_id)
  order by p.created_at desc limit 60;
end $$;

-- Admin approval now requires a selfie, never a government ID.
create or replace function public.admin_set_status(target uuid, new_status text, note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  if new_status not in ('pending','approved','rejected','banned') then raise exception 'bad_status'; end if;
  if new_status = 'approved' and not exists (
    select 1 from public.profiles p where p.id = target and p.role <> 'admin' and p.selfie_path is not null
  ) then raise exception 'selfie_required'; end if;
  update public.profiles set status = new_status, review_note = note
    where id = target and role <> 'admin';
  if new_status = 'banned' then
    update public.matches set status = 'ended' where status = 'active' and target in (woman_id, man_id);
  end if;
  insert into public.admin_log (admin_id, action, target, note)
    values (auth.uid(), 'status:' || new_status, target, note);
end $$;

comment on column public.profiles.id_card_path is
  'Legacy field retained for backwards compatibility; Akoma no longer requests or uses ID documents.';
comment on column public.profiles.selfie_path is
  'Private optional selfie used for manual selfie review before full member access.';

commit;
