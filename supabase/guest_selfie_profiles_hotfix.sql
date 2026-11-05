-- Akoma hotfix: restore Discover/profile-card compatibility after guest access update.
-- The existing profile_card type has two additional fields added by features_migration.sql:
-- distance_band and activity_label. The first guest migration omitted them, which can
-- make list_profiles fail and consequently break Discover and match/chat card loading.
-- Safe to run in Supabase SQL Editor. This does not delete or modify user data.

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

-- Keep the RPC available to signed-in app users.
grant execute on function public.list_profiles(int,int) to authenticated;
