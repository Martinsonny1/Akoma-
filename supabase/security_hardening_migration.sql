-- Akoma: profile integrity hardening. Run AFTER all other migrations. Safe to re-run.
-- Members can no longer change name/age after approval, backdate/refresh created_at,
-- or point id_card_path / selfie_path at files that are not theirs or do not exist.

create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public, storage as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.role := case when new.role = 'man' then 'man' else 'woman' end;
      new.status := 'pending';
      new.featured_until := null;
      new.review_note := null;
      new.created_at := now();
    else
      new.role := old.role;
      new.status := old.status;
      new.featured_until := old.featured_until;
      new.review_note := old.review_note;
      new.created_at := old.created_at;
      -- Verified identity: name and age are locked once approved.
      if old.status = 'approved' then
        new.name := old.name;
        new.age := old.age;
        new.id_card_path := old.id_card_path;
        new.selfie_path := old.selfie_path;
      end if;
    end if;
    -- Verification files must live in the member's own folder and actually exist.
    if new.id_card_path is not null and (tg_op = 'INSERT' or new.id_card_path is distinct from old.id_card_path) then
      if new.id_card_path not like new.id::text || '/%'
         or not exists (select 1 from storage.objects o where o.bucket_id = 'verification' and o.name = new.id_card_path) then
        raise exception 'bad_id_path';
      end if;
    end if;
    if new.selfie_path is not null and (tg_op = 'INSERT' or new.selfie_path is distinct from old.selfie_path) then
      if new.selfie_path not like new.id::text || '/%'
         or not exists (select 1 from storage.objects o where o.bucket_id = 'verification' and o.name = new.selfie_path) then
        raise exception 'bad_id_path';
      end if;
    end if;
  end if;
  if cardinality(new.photos) > 6 then raise exception 'too_many_photos'; end if;
  if exists (select 1 from unnest(new.photos) p where p not like new.id::text || '/%') then
    raise exception 'bad_photo_path';
  end if;
  if cardinality(new.interests) > 12 then raise exception 'too_many_interests'; end if;
  if public.has_money_terms(new.bio) or public.has_contact_info(new.bio) then
    raise exception 'bio_not_allowed';
  end if;
  return new;
end $$;

-- Approval now also requires the ID file to exist in storage.
create or replace function public.admin_set_status(target uuid, new_status text, note text default null)
returns void language plpgsql security definer set search_path = public, storage as $$
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  if new_status not in ('pending','approved','rejected','banned') then raise exception 'bad_status'; end if;
  if new_status = 'approved' and not exists (
    select 1 from public.profiles p
    join storage.objects o on o.bucket_id = 'verification' and o.name = p.id_card_path
    where p.id = target and p.role <> 'admin'
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
