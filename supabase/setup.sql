-- =====================================================================
-- D-DOTT Onderzoekersportaal: eenmalige database-instelling voor Supabase
-- Plak dit hele bestand in Supabase > SQL Editor > New query, en klik "Run".
-- =====================================================================

-- 1. Wie is beheerder? ------------------------------------------------
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admins enable row level security;
-- (geen policies: deze tabel is niet direct leesbaar vanaf de website)

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;


-- 2. Tabel met documenten ---------------------------------------------
create table if not exists public.documenten (
  id            uuid primary key default gen_random_uuid(),
  categorie     text not null default 'document'
                check (categorie in ('document', 'data-overzicht')),
  titel         text not null,
  auteurs       text not null default '',
  beschrijving  text not null default '',
  bestandspad   text not null,
  bestandsnaam  text not null,
  geupload_op   timestamptz not null default now(),
  geupload_door uuid default auth.uid() references auth.users(id) on delete set null
);
alter table public.documenten enable row level security;

grant select on public.documenten to anon, authenticated;
grant insert, update, delete on public.documenten to authenticated;

drop policy if exists "Ingelogd: documenten lezen"       on public.documenten;
drop policy if exists "Beheerder: documenten toevoegen"  on public.documenten;
drop policy if exists "Beheerder: documenten wijzigen"   on public.documenten;
drop policy if exists "Beheerder: documenten verwijderen" on public.documenten;

create policy "Ingelogd: documenten lezen"
  on public.documenten for select to authenticated using (true);

create policy "Beheerder: documenten toevoegen"
  on public.documenten for insert to authenticated with check (public.is_admin());

create policy "Beheerder: documenten wijzigen"
  on public.documenten for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "Beheerder: documenten verwijderen"
  on public.documenten for delete to authenticated using (public.is_admin());


-- 3. Privé opslagmap voor de bestanden (max. 50 MB per bestand) --------
insert into storage.buckets (id, name, public, file_size_limit)
values ('documenten', 'documenten', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists "Ingelogd: bestanden downloaden"   on storage.objects;
drop policy if exists "Beheerder: bestanden uploaden"    on storage.objects;
drop policy if exists "Beheerder: bestanden verwijderen" on storage.objects;

create policy "Ingelogd: bestanden downloaden"
  on storage.objects for select to authenticated
  using (bucket_id = 'documenten');

create policy "Beheerder: bestanden uploaden"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'documenten' and public.is_admin());

create policy "Beheerder: bestanden verwijderen"
  on storage.objects for delete to authenticated
  using (bucket_id = 'documenten' and public.is_admin());


-- =====================================================================
-- 4. BEHEERDERS TOEVOEGEN (doe dit NADAT je de accounts hebt aangemaakt)
--    Vervang het e-mailadres en voer alleen deze regel uit.
--    Herhaal voor elke beheerder.
-- =====================================================================
-- insert into public.admins (user_id)
-- select id from auth.users where email = 'naam@amsterdamumc.nl';

-- Beheerder weer verwijderen:
-- delete from public.admins
-- where user_id = (select id from auth.users where email = 'naam@amsterdamumc.nl');

-- Overzicht van huidige beheerders:
-- select u.email from public.admins a join auth.users u on u.id = a.user_id;
