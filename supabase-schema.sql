-- MediStock: esquema inicial para pegar en Supabase SQL Editor
-- Las contraseñas NO se guardan aquí: Supabase Auth las gestiona con hash seguro.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'family' check (role in ('patient', 'family', 'caregiver')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.care_relationships (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users(id) on delete cascade,
  caregiver_id uuid not null references auth.users(id) on delete cascade,
  relationship text not null default 'family',
  can_edit_inventory boolean not null default false,
  created_at timestamptz not null default now(),
  unique (patient_id, caregiver_id),
  check (patient_id <> caregiver_id)
);

create table if not exists public.medicines (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  brand text,
  dose text not null,
  daily_doses numeric(6,2) not null default 1 check (daily_doses > 0),
  unit text not null default 'tabletas',
  essential boolean not null default false,
  stock numeric(10,2) not null default 0 check (stock >= 0),
  reorder_days integer not null default 90 check (reorder_days >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_events (
  id uuid primary key default gen_random_uuid(),
  medicine_id uuid not null references public.medicines(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete restrict,
  quantity_change numeric(10,2) not null,
  note text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.care_relationships enable row level security;
alter table public.medicines enable row level security;
alter table public.inventory_events enable row level security;

create or replace function public.is_patient_or_authorized(p_patient_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select auth.uid() = p_patient_id
    or exists (
      select 1 from public.care_relationships cr
      where cr.patient_id = p_patient_id
        and cr.caregiver_id = auth.uid()
    );
$$;

create or replace function public.can_edit_patient_inventory(p_patient_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select auth.uid() = p_patient_id
    or exists (
      select 1 from public.care_relationships cr
      where cr.patient_id = p_patient_id
        and cr.caregiver_id = auth.uid()
        and cr.can_edit_inventory = true
    );
$$;

create policy "profiles own profile" on public.profiles
  for all to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "patients view their relationships" on public.care_relationships
  for select to authenticated
  using (patient_id = auth.uid() or caregiver_id = auth.uid());

create policy "patients manage relationships" on public.care_relationships
  for all to authenticated
  using (patient_id = auth.uid())
  with check (patient_id = auth.uid());

create policy "authorized users view medicines" on public.medicines
  for select to authenticated
  using (public.is_patient_or_authorized(patient_id));

create policy "authorized users add medicines" on public.medicines
  for insert to authenticated
  with check (public.can_edit_patient_inventory(patient_id));

create policy "authorized users update medicines" on public.medicines
  for update to authenticated
  using (public.can_edit_patient_inventory(patient_id))
  with check (public.can_edit_patient_inventory(patient_id));

create policy "authorized users delete medicines" on public.medicines
  for delete to authenticated
  using (public.can_edit_patient_inventory(patient_id));

create policy "authorized users view events" on public.inventory_events
  for select to authenticated
  using (exists (
    select 1 from public.medicines m
    where m.id = medicine_id
      and public.is_patient_or_authorized(m.patient_id)
  ));

create policy "authorized users add events" on public.inventory_events
  for insert to authenticated
  with check (
    actor_id = auth.uid()
    and exists (
      select 1 from public.medicines m
      where m.id = medicine_id
        and public.can_edit_patient_inventory(m.patient_id)
    )
  );

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'role', 'family')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Ejemplo posterior al registro de dos usuarios:
-- insert into public.care_relationships (patient_id, caregiver_id, relationship, can_edit_inventory)
-- values ('UUID_DEL_PACIENTE', 'UUID_DEL_FAMILIAR', 'hijo/a', true);

-- Para modificar una clave, usar Supabase Auth desde la aplicación:
-- supabase.auth.updateUser({ password: 'NuevaClaveSegura' })
-- Nunca insertar ni actualizar contraseñas manualmente en tablas propias.

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Actualización automática de updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists medicines_updated_at on public.medicines;
create trigger medicines_updated_at before update on public.medicines
for each row execute function public.set_updated_at();

-- Verificación rápida
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('profiles', 'care_relationships', 'medicines', 'inventory_events')
order by table_name;
