-- Akoma: table privileges for the media-lifecycle Edge Function (runs as service_role).
-- If chat media shows only "Photo sent" / "Video sent" / "Voice note", the function may be getting
-- "permission denied" on these tables. Safe to run more than once.
grant usage on schema public to service_role;
grant select, update on public.messages to service_role;
grant select on public.matches, public.blocks, public.profiles to service_role;
