-- RUMO: cole tudo no Supabase › SQL Editor › New query › Run (uma vez só)
create table if not exists public.rumo_docs (
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  path text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner, path)
);
alter table public.rumo_docs enable row level security;
drop policy if exists "rumo: só o dono lê" on public.rumo_docs;
drop policy if exists "rumo: só o dono cria" on public.rumo_docs;
drop policy if exists "rumo: só o dono altera" on public.rumo_docs;
drop policy if exists "rumo: só o dono apaga" on public.rumo_docs;
create policy "rumo: só o dono lê" on public.rumo_docs for select to authenticated using (owner = auth.uid());
create policy "rumo: só o dono cria" on public.rumo_docs for insert to authenticated with check (owner = auth.uid());
create policy "rumo: só o dono altera" on public.rumo_docs for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy "rumo: só o dono apaga" on public.rumo_docs for delete to authenticated using (owner = auth.uid());
grant select, insert, update, delete on public.rumo_docs to authenticated;
