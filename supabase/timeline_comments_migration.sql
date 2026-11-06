-- Timeline: delete own posts, comments, who-liked list. Also removes the bio word filter.
-- Run once in the Supabase SQL editor. Safe to re-run.
-- Comments have no word filter by design: members report inappropriate comments instead.

begin;

-- 1. Bios are no longer checked for contact details or money words.
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
  return new;
end $$;

-- 2. Likes remember when they happened (for the "who liked" list).
alter table public.post_likes add column if not exists created_at timestamptz not null default now();

-- 3. Comments.
create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 300),
  created_at timestamptz not null default now()
);
create index if not exists post_comments_post_idx on public.post_comments(post_id, created_at);
alter table public.post_comments enable row level security;
drop policy if exists post_comments_admin_read on public.post_comments;
create policy post_comments_admin_read on public.post_comments for select to authenticated using (public.is_admin());

-- 4. Reports can point at a comment; keep a copy of the text for moderators.
alter table public.reports add column if not exists target_text text;

create or replace function public.report_content(p_target_type text,p_content_id text,p_reason text,p_details text default '')
returns uuid language plpgsql security definer set search_path=public as $$
declare rid uuid; target_user uuid; media_path text; media_kind text; ttext text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_target_type not in ('post','message','profile','profile_photo','comment') then raise exception 'bad_target_type'; end if;
  if p_target_type='post' then
    select author_id,image_path into target_user,media_path from public.posts where id=p_content_id::uuid and status='visible'; media_kind:='image';
  elsif p_target_type='comment' then
    select c.author_id,c.body into target_user,ttext from public.post_comments c join public.posts p on p.id=c.post_id
      where c.id=p_content_id::uuid and p.status='visible';
  elsif p_target_type='message' then
    select m.sender_id,m.media_path,m.message_type into target_user,media_path,media_kind
      from public.messages m join public.matches mt on mt.id=m.match_id
      where m.id=p_content_id::bigint and mt.status='active' and auth.uid() in (mt.woman_id,mt.man_id);
    if media_path is null then raise exception 'media_not_available'; end if;
  elsif p_target_type='profile_photo' then
    media_path:=p_content_id; media_kind:='image';
    select p.id into target_user from public.profiles p where p.id=split_part(p_content_id,'/',1)::uuid and p.status='approved' and p_content_id=any(p.photos) and public.can_see_photos(p.id);
  else target_user:=p_content_id::uuid; end if;
  if target_user is null or target_user=auth.uid() then raise exception 'invalid_report_target'; end if;
  insert into public.reports(reporter_id,reported_id,reason,details,target_type,target_content_id,target_media_kind,target_media_path,target_text)
  values(auth.uid(),target_user,p_reason,left(coalesce(p_details,''),500),p_target_type,p_content_id,media_kind,media_path,ttext) returning id into rid;
  return rid;
end $$;

-- 5. Feed now includes the comment count.
drop function if exists public.feed();
create or replace function public.feed()
returns table (id uuid, author_id uuid, author_name text, author_age int, author_photo text,
               body text, image_path text, like_count bigint, liked boolean,
               status text, created_at timestamptz, mine boolean, comment_count bigint)
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
         p.status, p.created_at, p.author_id = me,
         (select count(*) from post_comments c where c.post_id = p.id)
  from posts p join profiles a on a.id = p.author_id
  where p.status = 'visible' and a.status = 'approved'
    and not public.is_blocked_between(me, p.author_id)
  order by p.created_at desc limit 60;
end $$;
revoke all on function public.feed() from public, anon;
grant execute on function public.feed() to authenticated;

-- 6. Delete your own post (admins can too). Returns the photo path so the app can remove the file.
create or replace function public.delete_post(post uuid) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); img text; owner uuid;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  select author_id, image_path into owner, img from posts where id = post;
  if owner is null then raise exception 'not_found'; end if;
  if owner <> me and not public.is_admin() then raise exception 'not_allowed'; end if;
  delete from content_review_queue where content_type = 'post' and payload->>'post_id' = post::text;
  delete from posts where id = post;
  return img;
end $$;
revoke all on function public.delete_post(uuid) from public, anon;
grant execute on function public.delete_post(uuid) to authenticated;

-- 7. Comments: add, list, delete.
create or replace function public.add_comment(post uuid, msg text) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t text := btrim(coalesce(msg,'')); owner uuid; cid uuid;
begin
  if public.my_status() is distinct from 'approved' then raise exception 'not_allowed'; end if;
  if char_length(t) = 0 or char_length(t) > 300 then raise exception 'bad_length'; end if;
  select author_id into owner from posts where id = post and status = 'visible';
  if owner is null then raise exception 'not_found'; end if;
  if public.is_blocked_between(me, owner) then raise exception 'not_allowed'; end if;
  insert into post_comments(post_id, author_id, body) values (post, me, t) returning id into cid;
  return cid;
end $$;

create or replace function public.list_comments(post uuid)
returns table (id uuid, author_id uuid, author_name text, author_photo text, body text, created_at timestamptz, mine boolean, can_delete boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare me uuid := auth.uid(); owner uuid;
begin
  if public.my_status() not in ('guest','pending','approved') then return; end if;
  select author_id into owner from posts where id = post and status = 'visible';
  if owner is null or public.is_blocked_between(me, owner) then return; end if;
  return query
  select c.id, c.author_id, a.name,
         case when public.can_see_photos(a.id) then a.photos[1] else null end,
         c.body, c.created_at, c.author_id = me, (c.author_id = me or owner = me)
  from post_comments c join profiles a on a.id = c.author_id
  where c.post_id = post and a.status = 'approved'
    and not public.is_blocked_between(me, c.author_id)
  order by c.created_at asc limit 200;
end $$;

create or replace function public.delete_comment(comment_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c record; owner uuid;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  select * into c from post_comments where id = comment_id;
  if not found then return; end if;
  select author_id into owner from posts where id = c.post_id;
  if c.author_id <> me and owner is distinct from me and not public.is_admin() then raise exception 'not_allowed'; end if;
  delete from post_comments where id = comment_id;
end $$;

-- 8. Who liked a post: only the post owner can see it.
create or replace function public.list_post_likers(post uuid)
returns table (user_id uuid, name text, age int, photo text, liked_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare me uuid := auth.uid();
begin
  if not exists (select 1 from posts where id = post and author_id = me) then raise exception 'not_allowed'; end if;
  return query
  select l.user_id, a.name, a.age,
         case when public.can_see_photos(a.id) then a.photos[1] else null end,
         l.created_at
  from post_likes l join profiles a on a.id = l.user_id
  where l.post_id = post and a.status = 'approved' and not public.is_blocked_between(me, l.user_id)
  order by l.created_at desc;
end $$;

revoke all on function public.add_comment(uuid,text), public.list_comments(uuid), public.delete_comment(uuid), public.list_post_likers(uuid) from public, anon;
grant execute on function public.add_comment(uuid,text), public.list_comments(uuid), public.delete_comment(uuid), public.list_post_likers(uuid) to authenticated;

commit;
