-- Akoma priority safety, privacy, moderation and push foundation.
-- Run after schema.sql and the existing migrations in Supabase SQL Editor.

-- Date of birth is the source of truth. Keep age for compatibility with existing UI/RPCs.
alter table public.profiles add column if not exists date_of_birth date;
alter table public.profiles add column if not exists terms_accepted_at timestamptz;
alter table public.profiles add column if not exists privacy_accepted_at timestamptz;
alter table public.profiles add column if not exists terms_version text;
alter table public.profiles add column if not exists privacy_version text;
alter table public.profiles add column if not exists id_delete_after timestamptz;
alter table public.profiles add column if not exists id_deleted_at timestamptz;
alter table public.profiles add column if not exists profile_review_required boolean not null default false;

create or replace function public.age_from_dob(d date) returns integer
language sql stable as $$
  select extract(year from age(current_date, d))::integer
$$;

create or replace function public.sync_profile_dob() returns trigger
language plpgsql set search_path=public as $$
begin
  if new.date_of_birth is not null then
    if new.date_of_birth > current_date or public.age_from_dob(new.date_of_birth) < 18 then
      raise exception 'Akoma is for adults aged 18 and over';
    end if;
    new.age := public.age_from_dob(new.date_of_birth);
  elsif tg_op = 'INSERT' then
    raise exception 'date_of_birth_required';
  end if;
  if tg_op='UPDATE' and new.id_card_path is not null and new.id_card_path is distinct from old.id_card_path then
    new.id_delete_after := now() + interval '30 days';
    new.id_deleted_at := null;
  end if;
  return new;
end $$;
drop trigger if exists profiles_sync_dob on public.profiles;
create trigger profiles_sync_dob before insert or update on public.profiles
for each row execute function public.sync_profile_dob();

-- Explicit content review queue. Profile edits are held for moderator review;
-- existing public-facing bio/photos remain unchanged until approved.
create table if not exists public.content_review_queue (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  content_type text not null check(content_type in ('profile_bio','profile_photos','post','message_media')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  reviewer_id uuid references public.profiles(id),
  reviewer_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists content_review_pending_idx on public.content_review_queue(status,created_at desc);
alter table public.content_review_queue enable row level security;
drop policy if exists content_review_admin_read on public.content_review_queue;
create policy content_review_admin_read on public.content_review_queue for select to authenticated using(public.is_admin());
drop policy if exists content_review_admin_update on public.content_review_queue;
create policy content_review_admin_update on public.content_review_queue for update to authenticated using(public.is_admin()) with check(public.is_admin());

create or replace function public.hold_profile_edits_for_review() returns trigger
language plpgsql security definer set search_path=public as $$
declare qid uuid;
begin
  if auth.uid() = old.id and old.status='approved' and current_setting('akoma.approve_profile_edit', true) is distinct from 'yes' then
    if new.bio is distinct from old.bio then
      select id into qid from public.content_review_queue where member_id=old.id and content_type='profile_bio' and status='pending' order by created_at desc limit 1 for update;
      if qid is null then
        insert into public.content_review_queue(member_id,content_type,payload) values(old.id,'profile_bio',jsonb_build_object('bio',new.bio));
      else
        update public.content_review_queue set payload=jsonb_build_object('bio',new.bio),created_at=now() where id=qid;
      end if;
      new.bio := old.bio; new.profile_review_required := true;
    end if;
    if new.photos is distinct from old.photos then
      qid := null;
      select id into qid from public.content_review_queue where member_id=old.id and content_type='profile_photos' and status='pending' order by created_at desc limit 1 for update;
      if qid is null then
        insert into public.content_review_queue(member_id,content_type,payload) values(old.id,'profile_photos',jsonb_build_object('photos',to_jsonb(new.photos)));
      else
        update public.content_review_queue set payload=jsonb_build_object('photos',to_jsonb(new.photos)),created_at=now() where id=qid;
      end if;
      new.photos := old.photos; new.profile_review_required := true;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_hold_edits on public.profiles;
create trigger profiles_hold_edits before update of bio,photos on public.profiles
for each row execute function public.hold_profile_edits_for_review();

create or replace function public.admin_review_content(p_item uuid,p_approve boolean,p_note text default null)
returns void language plpgsql security definer set search_path=public as $$
declare q public.content_review_queue%rowtype;
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  select * into q from public.content_review_queue where id=p_item and status='pending' for update;
  if not found then raise exception 'queue_item_not_found'; end if;
  if p_approve then
    perform set_config('akoma.approve_profile_edit','yes',true);
    if q.content_type='profile_bio' then
      update public.profiles set bio=q.payload->>'bio' where id=q.member_id;
    elsif q.content_type='profile_photos' then
      update public.profiles set photos=array(select jsonb_array_elements_text(q.payload->'photos')) where id=q.member_id;
    elsif q.content_type='post' then
      update public.posts set status='visible' where id=(q.payload->>'post_id')::uuid;
    end if;
  else
    if q.content_type='post' then update public.posts set status='removed' where id=(q.payload->>'post_id')::uuid; end if;
  end if;
  update public.content_review_queue set status=case when p_approve then 'approved' else 'rejected' end,
    reviewer_id=auth.uid(),reviewer_note=p_note,reviewed_at=now() where id=p_item;
  update public.profiles set profile_review_required=exists(select 1 from public.content_review_queue where member_id=q.member_id and status='pending') where id=q.member_id;
  insert into public.admin_log(admin_id,action,target,note) values(auth.uid(),'content_review:'||case when p_approve then 'approved' else 'rejected' end,q.member_id,p_note);
end $$;

-- Content reports can target a profile, post, or message (including image/video/voice-note messages).
alter table public.reports add column if not exists target_type text not null default 'profile';
alter table public.reports add column if not exists target_content_id text;
alter table public.reports add column if not exists target_media_kind text;
alter table public.reports add column if not exists target_media_path text;
create or replace function public.report_content(p_target_type text,p_content_id text,p_reason text,p_details text default '')
returns uuid language plpgsql security definer set search_path=public as $$
declare rid uuid; target_user uuid; media_path text; media_kind text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_target_type not in ('post','message','profile','profile_photo') then raise exception 'bad_target_type'; end if;
  if p_target_type='post' then
    select author_id,image_path into target_user,media_path from public.posts where id=p_content_id::uuid and status='visible'; media_kind:='image';
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
  insert into public.reports(reporter_id,reported_id,reason,details,target_type,target_content_id,target_media_kind,target_media_path)
  values(auth.uid(),target_user,p_reason,left(coalesce(p_details,''),500),p_target_type,p_content_id,media_kind,media_path) returning id into rid;
  return rid;
end $$;

-- Store browser push endpoints. Delivery requires a trusted server/Edge Function and VAPID keys.
create table if not exists public.push_subscriptions(
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_owner_all on public.push_subscriptions;
create policy push_owner_all on public.push_subscriptions for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

-- Retention queue for private ID images. A scheduled Edge Function must remove due objects
-- from the verification bucket, then clear id_card_path. Do not expose this bucket publicly.
create index if not exists profiles_id_retention_idx on public.profiles(id_delete_after) where id_card_path is not null;

revoke all on function public.admin_review_content(uuid,boolean,text) from public;
grant execute on function public.admin_review_content(uuid,boolean,text) to authenticated;
revoke all on function public.report_content(text,text,text,text) from public;
grant execute on function public.report_content(text,text,text,text) to authenticated;


create or replace function public.audit_report_decision() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.status is distinct from old.status then
    insert into public.admin_log(admin_id,action,target,note)
    values(auth.uid(),'report:'||new.status,new.reported_id,'Report '||new.id||' · '||coalesce(new.reason,''));
  end if;
  return new;
end $$;
drop trigger if exists reports_audit_decision on public.reports;
create trigger reports_audit_decision after update of status on public.reports
for each row execute function public.audit_report_decision();

-- Start the 30-day ID retention clock at approval (not at upload).
create or replace function public.admin_set_status(target uuid, new_status text, note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  if new_status not in ('pending','approved','rejected','banned') then raise exception 'bad_status'; end if;
  if new_status = 'approved' and not exists (
    select 1 from public.profiles p where p.id=target and p.role<>'admin' and p.id_card_path is not null
  ) then raise exception 'id_required'; end if;
  update public.profiles set status=new_status,review_note=note,
    id_delete_after=case when new_status='approved' and id_card_path is not null then now()+interval '30 days' else id_delete_after end
  where id=target and role<>'admin';
  if new_status='banned' then
    update public.matches set status='ended' where status='active' and target in(woman_id,man_id);
  end if;
  insert into public.admin_log(admin_id,action,target,note) values(auth.uid(),'status:'||new_status,target,note);
end $$;


grant select,insert,update,delete on public.push_subscriptions to authenticated;
grant select on public.content_review_queue to authenticated;

-- Permit admins to inspect moderation payloads and review them through the RPC.
grant select on public.content_review_queue to authenticated;
grant select,insert,update,delete on public.push_subscriptions to authenticated;

-- Moderators can view only chat-media objects that have actually been reported.
drop policy if exists chat_media_admin_report_select on storage.objects;
create policy chat_media_admin_report_select on storage.objects for select to authenticated
using (bucket_id='chat-media' and public.is_admin() and exists(
  select 1 from public.reports r where r.target_media_path=storage.objects.name and r.status in ('open','actioned','dismissed')
));
