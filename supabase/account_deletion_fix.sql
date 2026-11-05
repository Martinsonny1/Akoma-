-- Akoma account deletion permission fix
-- Safe to run more than once. The function deletes auth.users for auth.uid();
-- declared ON DELETE CASCADE constraints remove the member's related records.
grant execute on function public.delete_my_account() to authenticated;
