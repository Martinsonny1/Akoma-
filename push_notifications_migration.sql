-- Meet GH push notifications: messages, matches, requests, calls (incl. missed), likes, comments,
-- approval/rejection, Vault shares, plus admin alerts. Works with the app closed.
-- Run once in the Supabase SQL editor AFTER deploying the push-delivery Edge Function (see PUSH_SETUP.md).
-- Then run the two lines at the bottom with your own function URL and secret. Safe to re-run.

create extension if not exists pg_net;

-- Where to send pushes. Private: no member or anonymous visitor can read it.
create table if not exists public.push_config (
  id int primary key default 1 check (id = 1),
  function_url text,
  secret text
);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;
insert into public.push_config (id) values (1) on conflict do nothing;

-- Per-type switches (the existing "notifications" column stays the master switch).
alter table public.profiles add column if not exists notify_messages boolean not null default true;
alter table public.profiles add column if not exists notify_matches  boolean not null default true;
alter table public.profiles add column if not exists notify_calls    boolean not null default true;
alter table public.profiles add column if not exists notify_social   boolean not null default true;

-- Core sender. Never raises: a failed push must not break the action that caused it.
create or replace function public.push_notify(
  p_user uuid, p_kind text, p_title text, p_body text,
  p_url text default '/', p_tag text default null, p_ring boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
declare cfg public.push_config; pr record; ok boolean;
begin
  if p_user is null then return; end if;
  select * into cfg from public.push_config where id = 1;
  if cfg.function_url is null or cfg.secret is null then return; end if;
  select status, role, notifications, notify_messages, notify_matches, notify_calls, notify_social
    into pr from public.profiles where id = p_user;
  if not found or pr.notifications is false then return; end if;
  if p_kind = 'admin' then
    if pr.role <> 'admin' or pr.status <> 'approved' then return; end if;
  elsif p_kind <> 'account' and pr.status <> 'approved' then return;
  end if;
  ok := case p_kind
    when 'message' then pr.notify_messages
    when 'match'   then pr.notify_matches
    when 'call'    then pr.notify_calls
    when 'social'  then pr.notify_social
    else true end;
  if not ok then return; end if;
  if p_kind = 'call' and exists (select 1 from public.call_settings where user_id = p_user and incoming_enabled = false) then return; end if;
  if not exists (select 1 from public.push_subscriptions where user_id = p_user) then return; end if;
  perform net.http_post(
    url := cfg.function_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', cfg.secret),
    body := jsonb_build_object('recipient', p_user, 'title', p_title, 'body', p_body, 'url', p_url, 'tag', p_tag, 'ring', p_ring, 'kind', p_kind)
  );
exception when others then
  return;
end $$;
revoke all on function public.push_notify(uuid,text,text,text,text,text,boolean) from public, anon, authenticated;

create or replace function public.push_notify_admins(p_title text, p_body text, p_tag text default null) returns void
language plpgsql security definer set search_path = public as $$
declare a record;
begin
  for a in select id from public.profiles where role = 'admin' and status = 'approved' loop
    perform public.push_notify(a.id, 'admin', p_title, p_body, '/admin/', p_tag);
  end loop;
exception when others then
  return;
end $$;
revoke all on function public.push_notify_admins(text,text,text) from public, anon, authenticated;

-- ---------------------------------------------------------------- messages
create or replace function public.trg_push_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare m record; sname text; rcpt uuid; txt text;
begin
  select woman_id, man_id, origin, status into m from public.matches where id = new.match_id;
  if not found or m.status <> 'active' then return new; end if;
  -- When a woman accepts a request, the man's original message is inserted for her; she just acted, so no push.
  if m.origin = 'request' and new.sender_id = m.man_id
     and not exists (select 1 from public.messages x where x.match_id = new.match_id and x.id <> new.id) then
    return new;
  end if;
  rcpt := case when new.sender_id = m.woman_id then m.man_id else m.woman_id end;
  if public.is_blocked_between(new.sender_id, rcpt) then return new; end if;
  select name into sname from public.profiles where id = new.sender_id;
  txt := coalesce(sname, 'Someone') || case coalesce(new.message_type, 'text')
    when 'image' then ' sent you a photo' when 'video' then ' sent you a video'
    when 'audio' then ' sent you a voice note' else ' sent you a message' end;
  perform public.push_notify(rcpt, 'message', 'New message', txt, '/?open=chat:' || new.match_id, 'chat-' || new.match_id);
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists push_on_message on public.messages;
create trigger push_on_message after insert on public.messages for each row execute function public.trg_push_message();

-- ---------------------------------------------------------------- matches (the man is told)
create or replace function public.trg_push_match() returns trigger
language plpgsql security definer set search_path = public as $$
declare wname text;
begin
  if new.status <> 'active' then return new; end if;
  select name into wname from public.profiles where id = new.woman_id;
  if new.origin = 'request' then
    perform public.push_notify(new.man_id, 'match', 'Request accepted', coalesce(wname, 'She') || ' accepted your message request', '/?open=chat:' || new.id, 'match-' || new.id);
  else
    perform public.push_notify(new.man_id, 'match', 'New match', coalesce(wname, 'Someone') || ' liked you. It''s a match!', '/?open=chat:' || new.id, 'match-' || new.id);
  end if;
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists push_on_match on public.matches;
create trigger push_on_match after insert on public.matches for each row execute function public.trg_push_match();

-- ---------------------------------------------------------------- message requests (the woman is told)
create or replace function public.trg_push_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare mname text;
begin
  select name into mname from public.profiles where id = new.from_man;
  perform public.push_notify(new.to_woman, 'match', 'New message request', coalesce(mname, 'Someone') || ' sent you a message request', '/?open=likes', 'req-' || new.id);
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists push_on_request on public.message_requests;
create trigger push_on_request after insert on public.message_requests for each row execute function public.trg_push_request();

-- ---------------------------------------------------------------- calls (ringing + missed)
create or replace function public.trg_push_call() returns trigger
language plpgsql security definer set search_path = public as $$
declare cname text;
begin
  select name into cname from public.profiles where id = new.caller_id;
  if tg_op = 'INSERT' then
    if new.status = 'ringing' then
      perform public.push_notify(new.recipient_id, 'call',
        case when new.call_type = 'video' then 'Incoming video call' else 'Incoming voice call' end,
        coalesce(cname, 'Someone') || ' is calling you', '/?open=chat:' || new.match_id, 'call-' || new.id, true);
    end if;
  elsif new.status = 'missed' and old.status is distinct from 'missed' then
    perform public.push_notify(new.recipient_id, 'call', 'Missed call', 'Missed call from ' || coalesce(cname, 'someone'), '/?open=chat:' || new.match_id, 'missed-' || new.id);
  end if;
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists push_on_call on public.calls;
create trigger push_on_call after insert or update of status on public.calls for each row execute function public.trg_push_call();

-- ---------------------------------------------------------------- post likes (grouped) and comments
create or replace function public.trg_push_like() returns trigger
language plpgsql security definer set search_path = public as $$
declare p record; lname text; n int;
begin
  select author_id into p from public.posts where id = new.post_id and status = 'visible';
  if not found or p.author_id = new.user_id or public.is_blocked_between(p.author_id, new.user_id) then return new; end if;
  select name into lname from public.profiles where id = new.user_id;
  select count(*) into n from public.post_likes where post_id = new.post_id;
  perform public.push_notify(p.author_id, 'social', 'New like',
    case when n <= 1 then coalesce(lname, 'Someone') || ' liked your post'
         else coalesce(lname, 'Someone') || ' and ' || (n - 1) || case when n - 1 = 1 then ' other' else ' others' end || ' liked your post' end,
    '/?open=post:' || new.post_id, 'like-' || new.post_id);
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists push_on_like on public.post_likes;
create trigger push_on_like after insert on public.post_likes for each row execute function public.trg_push_like();

create or replace function public.trg_push_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare p record; cname text;
begin
  select author_id into p from public.posts where id = new.post_id and status = 'visible';
  if not found or p.author_id = new.author_id or public.is_blocked_between(p.author_id, new.author_id) then return new; end if;
  select name into cname from public.profiles where id = new.author_id;
  perform public.push_notify(p.author_id, 'social', 'New comment',
    coalesce(cname, 'Someone') || ' commented: "' || left(new.body, 80) || '"',
    '/?open=post:' || new.post_id, 'cmt-' || new.post_id);
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists push_on_comment on public.post_comments;
create trigger push_on_comment after insert on public.post_comments for each row execute function public.trg_push_comment();

-- ---------------------------------------------------------------- Vault shares
create or replace function public.trg_push_vault() returns trigger
language plpgsql security definer set search_path = public as $$
declare oname text;
begin
  select name into oname from public.profiles where id = new.owner_id;
  perform public.push_notify(new.viewer_id, 'message', 'Private photo shared', coalesce(oname, 'Someone') || ' shared a private photo with you', '/?open=vault', 'vault-' || new.id);
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists push_on_vault on public.vault_grants;
create trigger push_on_vault after insert on public.vault_grants for each row execute function public.trg_push_vault();

-- ---------------------------------------------------------------- account status + admin alerts
create or replace function public.trg_push_profile_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'approved' then
      perform public.push_notify(new.id, 'account', 'You''re approved', 'Your Meet GH profile is approved. Welcome in!', '/', 'account-' || new.id);
    elsif new.status = 'rejected' then
      perform public.push_notify(new.id, 'account', 'Verification needs attention', 'Open Meet GH to see what to fix.', '/', 'account-' || new.id);
    elsif new.status = 'pending' and new.role <> 'admin' then
      perform public.push_notify_admins('New verification request', coalesce(new.name, 'A member') || ' submitted a selfie for review', 'admin-verify-' || new.id);
    end if;
  end if;
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists push_on_profile_status on public.profiles;
create trigger push_on_profile_status after update of status on public.profiles for each row execute function public.trg_push_profile_status();

create or replace function public.trg_push_new_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role in ('woman','man') then
    perform public.push_notify_admins('New member', coalesce(new.name, 'Someone') || ' (' || new.role || ') just joined', 'admin-join-' || new.id);
  end if;
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists push_on_new_member on public.profiles;
create trigger push_on_new_member after insert on public.profiles for each row execute function public.trg_push_new_member();

create or replace function public.trg_push_report() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.push_notify_admins('New report', 'A ' || coalesce(new.target_type, 'profile') || ' was reported: ' || new.reason, 'admin-report-' || new.id);
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists push_on_report on public.reports;
create trigger push_on_report after insert on public.reports for each row execute function public.trg_push_report();

create or replace function public.trg_push_pending_post() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pending' then
    perform public.push_notify_admins('Photo post to review', 'A member posted a photo that needs approval', 'admin-post-' || new.id);
  end if;
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists push_on_pending_post on public.posts;
create trigger push_on_pending_post after insert on public.posts for each row execute function public.trg_push_pending_post();

create or replace function public.trg_push_feedback() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.push_notify_admins('New problem report', coalesce(new.category, 'Something else') || ' reported by a member', 'admin-feedback-' || new.id);
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists push_on_feedback on public.app_feedback;
create trigger push_on_feedback after insert on public.app_feedback for each row execute function public.trg_push_feedback();

-- ---------------------------------------------------------------- LAST STEP (edit the two values, then run):
-- update public.push_config set
--   function_url = 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/push-delivery',
--   secret       = 'THE_SAME_VALUE_AS_THE_PUSH_WEBHOOK_SECRET_EDGE_FUNCTION_SECRET'
-- where id = 1;
