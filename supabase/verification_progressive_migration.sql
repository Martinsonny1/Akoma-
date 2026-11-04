-- Akoma progressive onboarding + government-ID-only verification.
-- Run this once in Supabase SQL Editor after the original schema/migrations.
-- Existing selfie_path is retained for backwards compatibility.

create or replace function public.admin_set_status(target uuid, new_status text, note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  if new_status not in ('pending','approved','rejected','banned') then raise exception 'bad_status'; end if;
  if new_status = 'approved' and not exists (
    select 1 from public.profiles p
    where p.id = target and p.role <> 'admin' and p.id_card_path is not null
  ) then
    raise exception 'id_required';
  end if;
  update public.profiles set status = new_status, review_note = note
    where id = target and role <> 'admin';
  if new_status = 'banned' then
    update public.matches set status = 'ended'
      where status = 'active' and target in (woman_id, man_id);
  end if;
  insert into public.admin_log (admin_id, action, target, note)
    values (auth.uid(), 'status:' || new_status, target, note);
end $$;

comment on column public.profiles.id_card_path is
  'Private government-issued ID image used for manual identity verification for all new Akoma members.';
