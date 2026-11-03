
-- Akoma: Nearby + online status migration
-- Run AFTER schema.sql in Supabase SQL Editor. Safe to re-run.
-- These controls apply identically to men and women; there are no role-based defaults or exceptions.
alter table public.profiles
  add column if not exists location_enabled boolean not null default false,
  add column if not exists latitude numeric(8,3),
  add column if not exists longitude numeric(8,3),
  add column if not exists online_visible boolean not null default false,
  add column if not exists last_seen_at timestamptz;

-- Prevent impossible/stale coordinate pairs and keep location sharing opt-in.
update public.profiles set location_enabled=false, latitude=null, longitude=null
where location_enabled is distinct from true or latitude is null or longitude is null;


-- Store coordinates snapped to approximately 500 m grid cells.
-- Exact browser coordinates are accepted only by this function and never returned.
create or replace function public.set_my_location(p_lat double precision, p_lng double precision, p_enabled boolean default true)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or public.my_status() is distinct from 'approved' then raise exception 'not_allowed'; end if;
  if p_enabled then
    if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
      raise exception 'invalid_location';
    end if;
    update public.profiles set location_enabled=true,
      latitude=round(p_lat::numeric / 0.005) * 0.005,
      longitude=round(p_lng::numeric / 0.005) * 0.005
    where id=auth.uid();
  else
    update public.profiles set location_enabled=false, latitude=null, longitude=null where id=auth.uid();
  end if;
end $$;

create or replace function public.set_online_visibility(p_visible boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'not_allowed'; end if;
  update public.profiles set online_visible=coalesce(p_visible,false) where id=auth.uid();
end $$;

create or replace function public.heartbeat()
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or public.my_status() is distinct from 'approved' then raise exception 'not_allowed'; end if;
  update public.profiles set last_seen_at=now() where id=auth.uid();
end $$;

-- Extend the existing composite card type without exposing coordinates or timestamps.
do $$ begin
  if not exists (select 1 from pg_attribute where attrelid='public.profile_card'::regclass and attname='distance_band' and not attisdropped) then
    alter type public.profile_card add attribute distance_band text;
  end if;
  if not exists (select 1 from pg_attribute where attrelid='public.profile_card'::regclass and attname='activity_label' and not attisdropped) then
    alter type public.profile_card add attribute activity_label text;
  end if;
end $$;

create or replace function public.list_profiles(p_min int default 18, p_max int default 99)
returns setof public.profile_card
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); r text := public.my_role();
begin
  if public.my_status() is distinct from 'approved' or r not in ('woman','man') then return; end if;
  return query
  select p.id, p.role, p.name, p.age, p.city, p.bio, p.interests, p.looking_for,
         case when public.can_see_photos(p.id) then p.photos else '{}'::text[] end,
         not public.can_see_photos(p.id),
         coalesce(p.featured_until > now(), false),
         public.has_active_match(me, p.id),
         exists (select 1 from message_requests q where q.from_man = me and q.to_woman = p.id),
         exists (select 1 from passes x where x.user_id = me and x.target_id = p.id),
         case when (select location_enabled from profiles where id=me)
                   and p.location_enabled and p.latitude is not null and p.longitude is not null
                   and (select latitude from profiles where id=me) is not null
              then case
                when d.km < 1 then 'Under 1 km'
                when d.km < 5 then '1–5 km'
                when d.km < 10 then '5–10 km'
                else '10+ km' end
              else null end,
         case when coalesce((select online_visible from profiles where id=me),false)
                    and p.online_visible and p.last_seen_at >= now()-interval '5 minutes' then 'Online now'
              when coalesce((select online_visible from profiles where id=me),false)
                    and p.online_visible and p.last_seen_at >= now()-interval '24 hours' then 'Active today'
              when coalesce((select online_visible from profiles where id=me),false)
                    and p.online_visible and p.last_seen_at >= now()-interval '7 days' then 'Active this week'
              else null end
  from profiles p
  left join lateral (
    select 6371 * 2 * asin(sqrt(
      power(sin(radians((p.latitude - mine.latitude)::double precision)/2),2) +
      cos(radians(mine.latitude::double precision))*cos(radians(p.latitude::double precision))*
      power(sin(radians((p.longitude - mine.longitude)::double precision)/2),2)
    )) as km
    from profiles mine where mine.id=me
  ) d on true
  where p.role = case r when 'woman' then 'man' else 'woman' end
    and p.status = 'approved' and p.age between p_min and p_max
    and not public.is_blocked_between(me, p.id)
  order by coalesce(p.featured_until > now(), false) desc, p.created_at desc;
end $$;

grant execute on function public.set_my_location(double precision,double precision,boolean) to authenticated;
grant execute on function public.set_online_visibility(boolean) to authenticated;
grant execute on function public.heartbeat() to authenticated;
