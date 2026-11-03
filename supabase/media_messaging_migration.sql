-- Akoma media messaging upgrade
-- Run AFTER schema.sql and features_migration.sql in Supabase SQL Editor.
-- Private media is accessible only to the two members of an active, unblocked match.

alter table public.messages
  add column if not exists message_type text not null default 'text',
  add column if not exists media_path text,
  add column if not exists media_mime text,
  add column if not exists media_name text,
  add column if not exists media_mode text not null default 'normal',
  add column if not exists duration_seconds integer,
  add column if not exists expires_at timestamptz,
  add column if not exists opened_at timestamptz,
  add column if not exists opened_by uuid references public.profiles(id) on delete set null;

alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_check
  check (char_length(body) between 0 and 1000);
alter table public.messages drop constraint if exists messages_type_check;
alter table public.messages add constraint messages_type_check
  check (message_type in ('text','image','video','audio'));
alter table public.messages drop constraint if exists messages_media_mode_check;
alter table public.messages add constraint messages_media_mode_check
  check (media_mode in ('normal','view_once','timed'));
alter table public.messages drop constraint if exists messages_media_shape_check;
alter table public.messages add constraint messages_media_shape_check
  check ((message_type = 'text' and media_path is null) or
         (message_type <> 'text' and (media_path is not null or body='Expired media')));
create index if not exists messages_expiry_idx on public.messages (expires_at) where expires_at is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-media','chat-media',false,20971520,
  array['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime',
        'audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav'])
on conflict (id) do update set public = false, file_size_limit = 20971520,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.send_media_message(
  p_match uuid, p_path text, p_kind text, p_mime text,
  p_mode text default 'normal', p_duration integer default null, p_recording_seconds integer default null
) returns public.messages
language plpgsql security definer set search_path = public, storage as $$
declare
  me uuid := auth.uid(); mt public.matches; other uuid; out_row public.messages;
  expiry timestamptz := null; max_bytes bigint; file_size bigint; stored_mime text;
begin
  select * into mt from public.matches
    where id = p_match and status = 'active' and me in (woman_id, man_id);
  if not found then raise exception 'not_found'; end if;
  other := case when mt.woman_id = me then mt.man_id else mt.woman_id end;
  if public.is_blocked_between(me, other) then raise exception 'blocked'; end if;
  if public.my_status() is distinct from 'approved' then raise exception 'not_allowed'; end if;
  if p_kind not in ('image','video','audio') then raise exception 'bad_media_type'; end if;
  if p_recording_seconds is not null and (p_kind <> 'audio' or p_recording_seconds < 1 or p_recording_seconds > 120) then raise exception 'bad_recording_duration'; end if;
  if p_mode not in ('normal','view_once','timed') then raise exception 'bad_media_mode'; end if;
  if p_mode = 'timed' then
    if p_duration not in (10,30,60,3600,86400,604800) then raise exception 'bad_expiry'; end if;
    expiry := now() + make_interval(secs => p_duration);
  end if;
  if p_kind = 'image' and p_mime not in ('image/jpeg','image/png','image/webp') then raise exception 'bad_media_type'; end if;
  if p_kind = 'video' and p_mime not in ('video/mp4','video/webm','video/quicktime') then raise exception 'bad_media_type'; end if;
  if p_kind = 'audio' and p_mime not in ('audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav') then raise exception 'bad_media_type'; end if;
  if split_part(p_path,'/',1) <> p_match::text or split_part(p_path,'/',2) <> me::text then raise exception 'bad_media_path'; end if;
  max_bytes := case p_kind when 'image' then 8388608 when 'audio' then 8388608 else 20971520 end;
  select coalesce((o.metadata->>'size')::bigint,0), o.metadata->>'mimetype'
    into file_size, stored_mime
    from storage.objects o where o.bucket_id='chat-media' and o.name=p_path and o.owner_id=me::text;
  if not found then raise exception 'media_upload_missing'; end if;
  if file_size < 1 or file_size > max_bytes then raise exception 'media_size_limit'; end if;
  if stored_mime is distinct from p_mime then raise exception 'media_mime_mismatch'; end if;
  insert into public.messages(match_id,sender_id,body,message_type,media_path,media_mime,media_mode,expires_at,duration_seconds)
  values(p_match,me,case p_kind when 'image' then 'Photo' when 'video' then 'Video' else 'Voice note' end,
         p_kind,p_path,p_mime,p_mode,expiry,p_recording_seconds)
  returning * into out_row;
  return out_row;
end $$;

create or replace function public.open_once_media(p_message bigint)
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); msg public.messages; mt public.matches; result_path text;
begin
  select * into msg from public.messages where id=p_message for update;
  if not found or msg.message_type='text' then return null; end if;
  select * into mt from public.matches where id=msg.match_id and status='active'
    and me in (woman_id,man_id);
  if not found then return null; end if;
  if public.is_blocked_between(mt.woman_id,mt.man_id) then return null; end if;
  if msg.expires_at is not null and msg.expires_at <= now() then return null; end if;
  if msg.media_mode <> 'view_once' then return msg.media_path; end if;
  if msg.sender_id = me then return null; end if;
  if msg.opened_at is not null then return null; end if;
  update public.messages set opened_at=now(), opened_by=me where id=p_message returning media_path into result_path;
  return result_path;
end $$;

-- Storage SELECT is deliberately narrow. A view-once recipient gets a very short
-- authorization window after the one-time RPC; a signed URL is still a bearer link.
drop policy if exists chat_media_insert on storage.objects;
create policy chat_media_insert on storage.objects for insert to authenticated
  with check (bucket_id='chat-media' and (storage.foldername(name))[2]=auth.uid()::text
    and exists (select 1 from public.matches m where m.id::text=(storage.foldername(name))[1]
      and m.status='active' and auth.uid() in (m.woman_id,m.man_id)));
drop policy if exists chat_media_select on storage.objects;
create policy chat_media_select on storage.objects for select to authenticated
  using (bucket_id='chat-media' and exists (
    select 1 from public.messages msg join public.matches mt on mt.id=msg.match_id
    where msg.media_path=storage.objects.name and mt.status='active'
      and auth.uid() in (mt.woman_id,mt.man_id)
      and not public.is_blocked_between(mt.woman_id,mt.man_id)
      and (msg.expires_at is null or msg.expires_at > now())
      and (msg.media_mode <> 'view_once' or msg.sender_id=auth.uid()
           or (msg.opened_by=auth.uid() and msg.opened_at > now()-interval '45 seconds'))
  ));
drop policy if exists chat_media_delete on storage.objects;
create policy chat_media_delete on storage.objects for delete to authenticated
  using (bucket_id='chat-media' and (storage.foldername(name))[2]=auth.uid()::text);

-- Call from Supabase Cron (or an Edge Function) to physically remove expired objects.
create or replace function public.cleanup_expired_chat_media()
returns integer language plpgsql security definer set search_path = public, storage as $$
declare removed integer;
begin
  with doomed as (
    select id, media_path from public.messages
    where media_path is not null and (
      (expires_at is not null and expires_at <= now()) or
      (media_mode='view_once' and opened_at is not null and opened_at < now()-interval '1 hour')
    )
  ), deleted as (
    delete from storage.objects o using doomed d
    where o.bucket_id='chat-media' and o.name=d.media_path returning o.name
  )
  select count(*) into removed from deleted;
  update public.messages set media_path=null, media_mime=null, body='Expired media'
  where media_path is not null and (
    (expires_at is not null and expires_at <= now()) or
    (media_mode='view_once' and opened_at is not null and opened_at < now()-interval '1 hour')
  );
  return removed;
end $$;

revoke all on function public.send_media_message(uuid,text,text,text,text,integer,integer) from public, anon;
revoke all on function public.open_once_media(bigint) from public, anon;
revoke all on function public.cleanup_expired_chat_media() from public, anon, authenticated;
grant execute on function public.send_media_message(uuid,text,text,text,text,integer,integer) to authenticated;
grant execute on function public.open_once_media(bigint) to authenticated;

-- Enable pg_cron in Supabase Extensions, then schedule this job once:
-- select cron.schedule('akoma-expire-chat-media','*/10 * * * *',
--   $$select public.cleanup_expired_chat_media();$$);
