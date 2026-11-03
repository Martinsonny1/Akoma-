-- Akoma: Vault + Looking Tonight presence
-- Run after schema.sql, features_migration.sql and media_messaging_migration.sql.

create table if not exists public.looking_tonight (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  mode text not null default 'either' check (mode in ('chat','meet','either')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists looking_tonight_expiry_idx on public.looking_tonight(expires_at);
alter table public.looking_tonight enable row level security;
drop policy if exists looking_tonight_read on public.looking_tonight;
create policy looking_tonight_read on public.looking_tonight for select to authenticated
 using ((user_id = auth.uid()) or (expires_at > now() and user_id <> auth.uid() and exists (
   select 1 from public.profiles me, public.profiles them
   where me.id=auth.uid() and them.id=user_id and me.status='approved' and them.status='approved'
   and me.city=them.city and not public.is_blocked_between(me.id,them.id)
 )));

drop function if exists public.set_looking_tonight(boolean,text,integer);
create or replace function public.set_looking_tonight(p_enabled boolean, p_mode text default 'either', p_hours integer default 4)
returns timestamptz language plpgsql security definer set search_path=public as $$
declare me uuid:=auth.uid(); expiry timestamptz;
begin
 if me is null or public.my_status() is distinct from 'approved' then raise exception 'not_allowed'; end if;
 if p_enabled is not true then delete from public.looking_tonight where user_id=me; return null; end if;
 if p_mode not in ('chat','meet','either') or p_hours not in (4,6) then raise exception 'bad_beacon_setting'; end if;
 expiry:=now()+make_interval(hours=>p_hours);
 insert into public.looking_tonight(user_id,mode,expires_at) values(me,p_mode,expiry)
 on conflict(user_id) do update set mode=excluded.mode,expires_at=excluded.expires_at,created_at=now();
 return expiry;
end $$;
create or replace function public.list_looking_tonight()
returns table(user_id uuid, mode text, expires_at timestamptz)
language sql security definer set search_path=public as $$
 select b.user_id,b.mode,b.expires_at from public.looking_tonight b
 join public.profiles me on me.id=auth.uid() join public.profiles them on them.id=b.user_id
 where b.expires_at>now() and me.status='approved' and them.status='approved'
 and me.city=them.city and me.role<>them.role and not public.is_blocked_between(me.id,them.id)
$$;

create table if not exists public.vault_assets (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
 storage_path text not null unique, mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
 created_at timestamptz not null default now()
);
create table if not exists public.vault_grants (
 id uuid primary key default gen_random_uuid(), asset_id uuid not null references public.vault_assets(id) on delete cascade,
 owner_id uuid not null references public.profiles(id) on delete cascade,
 viewer_id uuid not null references public.profiles(id) on delete cascade,
 match_id uuid not null references public.matches(id) on delete cascade,
 expires_at timestamptz not null, revoked_at timestamptz,
 created_at timestamptz not null default now(), unique(asset_id,viewer_id)
);
create index if not exists vault_grants_active_idx on public.vault_grants(viewer_id,expires_at) where revoked_at is null;
alter table public.vault_assets enable row level security;
alter table public.vault_grants enable row level security;
drop policy if exists vault_assets_owner_read on public.vault_assets;
create policy vault_assets_owner_read on public.vault_assets for select to authenticated using(owner_id=auth.uid() or exists(select 1 from public.vault_grants g where g.asset_id=vault_assets.id and g.viewer_id=auth.uid() and g.revoked_at is null and g.expires_at>now()));
drop policy if exists vault_grants_participant_read on public.vault_grants;
create policy vault_grants_participant_read on public.vault_grants for select to authenticated using(owner_id=auth.uid() or viewer_id=auth.uid());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('vault-media','vault-media',false,8388608,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=8388608,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists vault_media_insert on storage.objects;
create policy vault_media_insert on storage.objects for insert to authenticated
 with check(bucket_id='vault-media' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists vault_media_select on storage.objects;
create policy vault_media_select on storage.objects for select to authenticated using(
 bucket_id='vault-media' and (
  (storage.foldername(name))[1]=auth.uid()::text or exists(
   select 1 from public.vault_assets a join public.vault_grants g on g.asset_id=a.id
   where a.storage_path=name and g.viewer_id=auth.uid() and g.revoked_at is null and g.expires_at>now()
   and exists(select 1 from public.matches m where m.id=g.match_id and m.status='active'
    and ((m.woman_id=g.owner_id and m.man_id=g.viewer_id) or (m.man_id=g.owner_id and m.woman_id=g.viewer_id)))
   and not public.is_blocked_between(g.owner_id,g.viewer_id)
  )
 )
);
drop policy if exists vault_media_delete on storage.objects;
create policy vault_media_delete on storage.objects for delete to authenticated
 using(bucket_id='vault-media' and (storage.foldername(name))[1]=auth.uid()::text);

create or replace function public.register_vault_asset(p_path text,p_mime text)
returns public.vault_assets language plpgsql security definer set search_path=public,storage as $$
declare me uuid:=auth.uid(); a public.vault_assets; sz bigint; mt text;
begin
 if public.my_status() is distinct from 'approved' then raise exception 'not_allowed'; end if;
 if p_mime not in ('image/jpeg','image/png','image/webp') or split_part(p_path,'/',1)<>me::text then raise exception 'bad_vault_file'; end if;
 select coalesce((metadata->>'size')::bigint,0),metadata->>'mimetype' into sz,mt from storage.objects where bucket_id='vault-media' and name=p_path and owner_id=me::text;
 if not found or sz<1 or sz>8388608 or mt is distinct from p_mime then raise exception 'vault_upload_invalid'; end if;
 insert into public.vault_assets(owner_id,storage_path,mime_type) values(me,p_path,p_mime) returning * into a; return a;
end $$;
create or replace function public.grant_vault_access(p_asset uuid,p_match uuid,p_minutes integer)
returns public.vault_grants language plpgsql security definer set search_path=public as $$
declare me uuid:=auth.uid(); mt public.matches; a public.vault_assets; other uuid; g public.vault_grants;
begin
 if p_minutes not in (5,15,30,60,1440) then raise exception 'bad_duration'; end if;
 select * into a from public.vault_assets where id=p_asset and owner_id=me;
 if not found then raise exception 'not_found'; end if;
 select * into mt from public.matches where id=p_match and status='active' and me in(woman_id,man_id);
 if not found then raise exception 'not_matched'; end if;
 other:=case when mt.woman_id=me then mt.man_id else mt.woman_id end;
 if public.is_blocked_between(me,other) then raise exception 'blocked'; end if;
 insert into public.vault_grants(asset_id,owner_id,viewer_id,match_id,expires_at,revoked_at)
 values(p_asset,me,other,p_match,now()+make_interval(mins=>p_minutes),null)
 on conflict(asset_id,viewer_id) do update set match_id=excluded.match_id,expires_at=excluded.expires_at,revoked_at=null,created_at=now()
 returning * into g; return g;
end $$;
create or replace function public.revoke_vault_access(p_grant uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin update public.vault_grants set revoked_at=now() where id=p_grant and owner_id=auth.uid() and revoked_at is null; return found; end $$;
create or replace function public.list_vault_assets()
returns table(id uuid,owner_id uuid,storage_path text,mime_type text,created_at timestamptz,grant_id uuid,viewer_id uuid,expires_at timestamptz,revoked_at timestamptz,owned boolean)
language sql security definer set search_path=public as $$
 select a.id,a.owner_id,a.storage_path,a.mime_type,a.created_at,g.id,g.viewer_id,g.expires_at,g.revoked_at,(a.owner_id=auth.uid())
 from public.vault_assets a left join public.vault_grants g on g.asset_id=a.id
 where a.owner_id=auth.uid() or (g.viewer_id=auth.uid() and g.revoked_at is null and g.expires_at>now())
 order by a.created_at desc
$$;
create or replace function public.delete_vault_asset(p_asset uuid)
returns text language plpgsql security definer set search_path=public as $$
declare p text;
begin delete from public.vault_assets where id=p_asset and owner_id=auth.uid() returning storage_path into p; return p; end $$;
revoke all on function public.set_looking_tonight(boolean,text,integer) from public;
revoke all on function public.list_looking_tonight() from public;
revoke all on function public.register_vault_asset(text,text) from public;
revoke all on function public.grant_vault_access(uuid,uuid,integer) from public;
revoke all on function public.revoke_vault_access(uuid) from public;
revoke all on function public.list_vault_assets() from public;
revoke all on function public.delete_vault_asset(uuid) from public;
grant execute on function public.set_looking_tonight(boolean,text,integer) to authenticated;
grant execute on function public.list_looking_tonight() to authenticated;
grant execute on function public.register_vault_asset(text,text) to authenticated;
grant execute on function public.grant_vault_access(uuid,uuid,integer) to authenticated;
grant execute on function public.revoke_vault_access(uuid) to authenticated;
grant execute on function public.list_vault_assets() to authenticated;
grant execute on function public.delete_vault_asset(uuid) to authenticated;

-- Expired beacon rows are hidden by expiry checks; optional physical cleanup:
-- select cron.schedule('akoma-clean-expired-beacons','*/15 * * * *', $$delete from public.looking_tonight where expires_at <= now()$$);



grant select on public.looking_tonight, public.vault_assets, public.vault_grants to authenticated;
revoke all on public.looking_tonight, public.vault_assets, public.vault_grants from anon;
