-- ============================================================================
-- Hisaab Production Postgres Schema (Multi-tenant, Multi-user, Offline-Sync)
-- Location: supabase/migrations/20261116000000_initial_schema.sql
-- ============================================================================

create extension if not exists "pgcrypto";

-- Global sequence for monotonic sync versions
create sequence if not exists sync_seq;

-- ============================================================================
-- 1. Identity & Tenancy
-- ============================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  phone text unique,
  language text not null default 'hi',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  create type public.member_role as enum ('owner', 'admin', 'editor', 'viewer');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.memberships (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null default 'editor',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  phone text not null,
  role public.member_role not null check (role <> 'owner'),
  invited_by uuid not null references public.profiles(id),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, phone)
);

create table if not exists public.businesses (
  id uuid primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  type text not null default 'general',
  language text not null default 'hi',
  fy_start_month int not null default 4,
  owner_phone text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_version bigint not null default nextval('sync_seq')
);

-- ============================================================================
-- 2. Ledger Core Tables
-- ============================================================================

create table if not exists public.accounts (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('cash', 'bank', 'upi', 'receivable', 'payable', 'income', 'expense', 'equity')),
  name_en text not null default '',
  name_hi text not null default '',
  icon text not null default '💳',
  details jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_version bigint not null default nextval('sync_seq')
);

create table if not exists public.categories (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  name_en text not null default '',
  name_hi text not null default '',
  icon text not null default '🏷️',
  color text not null default '#007AFF',
  parent_id uuid references public.categories(id) on delete set null,
  is_default boolean not null default false,
  sort int not null default 0,
  hidden boolean not null default false,
  special text,
  key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_version bigint not null default nextval('sync_seq')
);

create table if not exists public.parties (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  name_alt text not null default '',
  phone text,
  type text not null default 'customer' check (type in ('customer', 'supplier', 'worker', 'lender', 'other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_version bigint not null default nextval('sync_seq')
);

create table if not exists public.txns (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  date date not null,
  amount bigint not null, -- stored in paise (1 INR = 100 paise)
  direction text not null check (direction in ('in', 'out', 'transfer')),
  category_id uuid references public.categories(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null,
  to_account_id uuid references public.accounts(id) on delete set null,
  party_id uuid references public.parties(id) on delete set null,
  on_credit boolean not null default false,
  note text not null default '',
  tags text[] not null default '{}',
  photo_id uuid,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_version bigint not null default nextval('sync_seq')
);

create table if not exists public.ledger_lines (
  id uuid primary key default gen_random_uuid(),
  txn_id uuid not null references public.txns(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  party_id uuid references public.parties(id) on delete set null,
  date date not null,
  debit bigint not null default 0,
  credit bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.photos (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  storage_path text not null,
  byte_size bigint not null default 0,
  mime_type text not null default 'image/jpeg',
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_version bigint not null default nextval('sync_seq')
);

create table if not exists public.audit_log (
  id bigserial primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  table_name text not null,
  row_id uuid not null,
  action text not null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 3. Version & Timestamp Triggers
-- ============================================================================

create or replace function public.fn_sync_bump_version()
returns trigger language plpgsql as $$
begin
  new.server_version := nextval('sync_seq');
  new.updated_at := now();
  return new;
end;
$$;

create or replace trigger trg_bump_businesses before update on public.businesses
  for each row execute function public.fn_sync_bump_version();

create or replace trigger trg_bump_accounts before update on public.accounts
  for each row execute function public.fn_sync_bump_version();

create or replace trigger trg_bump_categories before update on public.categories
  for each row execute function public.fn_sync_bump_version();

create or replace trigger trg_bump_parties before update on public.parties
  for each row execute function public.fn_sync_bump_version();

create or replace trigger trg_bump_txns before update on public.txns
  for each row execute function public.fn_sync_bump_version();

-- ============================================================================
-- 4. Row-Level Security (RLS)
-- ============================================================================

create or replace function public.is_member(p_org_id uuid, p_min_role public.member_role default 'viewer')
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org_id
      and m.user_id = auth.uid()
      and array_position(array['viewer','editor','admin','owner']::public.member_role[], m.role)
       >= array_position(array['viewer','editor','admin','owner']::public.member_role[], p_min_role)
  );
$$;

alter table public.profiles enable row level security;
create policy p_profiles_read on public.profiles for select using (true);
create policy p_profiles_write on public.profiles for all using (id = auth.uid());

alter table public.organizations enable row level security;
create policy p_org_read on public.organizations for select using (public.is_member(id));
create policy p_org_update on public.organizations for update using (public.is_member(id, 'admin'));

alter table public.memberships enable row level security;
create policy p_member_read on public.memberships for select using (public.is_member(org_id));
create policy p_member_write on public.memberships for all using (public.is_member(org_id, 'admin'));

alter table public.invitations enable row level security;
create policy p_invitations_read on public.invitations for select using (public.is_member(org_id));
create policy p_invitations_write on public.invitations for all using (public.is_member(org_id, 'admin'));

alter table public.businesses enable row level security;
create policy p_biz_read on public.businesses for select using (public.is_member(org_id));
create policy p_biz_write on public.businesses for all using (public.is_member(org_id, 'admin'));

alter table public.accounts enable row level security;
create policy p_acc_read on public.accounts for select using (public.is_member(org_id));
create policy p_acc_write on public.accounts for all using (public.is_member(org_id, 'editor'));

alter table public.categories enable row level security;
create policy p_cat_read on public.categories for select using (public.is_member(org_id));
create policy p_cat_write on public.categories for all using (public.is_member(org_id, 'editor'));

alter table public.parties enable row level security;
create policy p_party_read on public.parties for select using (public.is_member(org_id));
create policy p_party_write on public.parties for all using (public.is_member(org_id, 'editor'));

alter table public.txns enable row level security;
create policy p_txns_read on public.txns for select using (public.is_member(org_id));
create policy p_txns_insert on public.txns for insert with check (public.is_member(org_id, 'editor'));
create policy p_txns_update on public.txns for update using (public.is_member(org_id, 'editor'));

alter table public.ledger_lines enable row level security;
create policy p_lines_read on public.ledger_lines for select using (public.is_member(org_id));

alter table public.photos enable row level security;
create policy p_photos_read on public.photos for select using (public.is_member(org_id));
create policy p_photos_write on public.photos for all using (public.is_member(org_id, 'editor'));

-- ============================================================================
-- 5. Stored Procedures: Onboarding & Sync
-- ============================================================================

-- Create new organization + business + owner role
create or replace function public.create_org(
  p_org_name text,
  p_biz_name text,
  p_biz_type text default 'general',
  p_language text default 'hi'
) returns jsonb language plpgsql security definer as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_biz_id uuid := gen_random_uuid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.organizations (name, created_by)
  values (p_org_name, v_user_id)
  returning id into v_org_id;

  insert into public.memberships (org_id, user_id, role)
  values (v_org_id, v_user_id, 'owner');

  insert into public.businesses (id, org_id, name, type, language)
  values (v_biz_id, v_org_id, p_biz_name, p_biz_type, p_language);

  return jsonb_build_object(
    'org_id', v_org_id,
    'business_id', v_biz_id
  );
end;
$$;

-- Accept an invitation by phone
create or replace function public.accept_invite(p_invite_id uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_user_id uuid := auth.uid();
  v_inv public.invitations%rowtype;
  v_phone text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select phone into v_phone from public.profiles where id = v_user_id;
  select * into v_inv from public.invitations where id = p_invite_id and accepted_at is null and expires_at > now();

  if v_inv.id is null then
    raise exception 'Invitation invalid or expired';
  end if;

  insert into public.memberships (org_id, user_id, role)
  values (v_inv.org_id, v_user_id, v_inv.role)
  on conflict (org_id, user_id) do update set role = excluded.role;

  update public.invitations set accepted_at = now() where id = v_inv.id;

  return jsonb_build_object('success', true, 'org_id', v_inv.org_id);
end;
$$;

-- Sync Push Function
create or replace function public.sync_push(
  p_business_id uuid,
  p_changes jsonb
) returns bigint language plpgsql security definer as $$
declare
  v_org_id uuid;
  v_cur_ver bigint;
  item jsonb;
begin
  select org_id into v_org_id from public.businesses where id = p_business_id;
  if v_org_id is null or not public.is_member(v_org_id, 'editor') then
    raise exception 'Unauthorized to push to business %', p_business_id;
  end if;

  -- Upsert accounts
  if p_changes ? 'accounts' then
    for item in select * from jsonb_array_elements(p_changes->'accounts') loop
      insert into public.accounts (
        id, business_id, org_id, kind, name_en, name_hi, icon, details, is_default, hidden, deleted_at, updated_at
      ) values (
        (item->>'id')::uuid, p_business_id, v_org_id, item->>'kind', item->>'name_en', item->>'name_hi',
        coalesce(item->>'icon', '💳'), coalesce(item->'details', '{}'::jsonb),
        coalesce((item->>'is_default')::boolean, false), coalesce((item->>'hidden')::boolean, false),
        (item->>'deleted_at')::timestamptz, coalesce((item->>'updated_at')::timestamptz, now())
      ) on conflict (id) do update set
        name_en = excluded.name_en, name_hi = excluded.name_hi, icon = excluded.icon,
        is_default = excluded.is_default, hidden = excluded.hidden, deleted_at = excluded.deleted_at,
        updated_at = excluded.updated_at
      where public.accounts.updated_at <= excluded.updated_at;
    end loop;
  end if;

  -- Upsert categories
  if p_changes ? 'categories' then
    for item in select * from jsonb_array_elements(p_changes->'categories') loop
      insert into public.categories (
        id, business_id, org_id, direction, name_en, name_hi, icon, color, parent_id, is_default, sort, hidden, special, key, deleted_at, updated_at
      ) values (
        (item->>'id')::uuid, p_business_id, v_org_id, item->>'direction', item->>'name_en', item->>'name_hi',
        coalesce(item->>'icon', '🏷️'), coalesce(item->>'color', '#007AFF'),
        (item->>'parent_id')::uuid, coalesce((item->>'is_default')::boolean, false),
        coalesce((item->>'sort')::int, 0), coalesce((item->>'hidden')::boolean, false),
        item->>'special', item->>'key', (item->>'deleted_at')::timestamptz, coalesce((item->>'updated_at')::timestamptz, now())
      ) on conflict (id) do update set
        name_en = excluded.name_en, name_hi = excluded.name_hi, icon = excluded.icon, color = excluded.color,
        parent_id = excluded.parent_id, is_default = excluded.is_default, sort = excluded.sort,
        hidden = excluded.hidden, deleted_at = excluded.deleted_at, updated_at = excluded.updated_at
      where public.categories.updated_at <= excluded.updated_at;
    end loop;
  end if;

  -- Upsert parties
  if p_changes ? 'parties' then
    for item in select * from jsonb_array_elements(p_changes->'parties') loop
      insert into public.parties (
        id, business_id, org_id, name, name_alt, phone, type, deleted_at, updated_at
      ) values (
        (item->>'id')::uuid, p_business_id, v_org_id, item->>'name', coalesce(item->>'name_alt', ''),
        item->>'phone', coalesce(item->>'type', 'customer'),
        (item->>'deleted_at')::timestamptz, coalesce((item->>'updated_at')::timestamptz, now())
      ) on conflict (id) do update set
        name = excluded.name, name_alt = excluded.name_alt, phone = excluded.phone,
        type = excluded.type, deleted_at = excluded.deleted_at, updated_at = excluded.updated_at
      where public.parties.updated_at <= excluded.updated_at;
    end loop;
  end if;

  -- Upsert txns
  if p_changes ? 'txns' then
    for item in select * from jsonb_array_elements(p_changes->'txns') loop
      insert into public.txns (
        id, business_id, org_id, date, amount, direction, category_id, account_id, to_account_id, party_id, on_credit, note, tags, photo_id, created_by, deleted_at, updated_at
      ) values (
        (item->>'id')::uuid, p_business_id, v_org_id, (item->>'date')::date, (item->>'amount')::bigint,
        item->>'direction', (item->>'category_id')::uuid, (item->>'account_id')::uuid,
        (item->>'to_account_id')::uuid, (item->>'party_id')::uuid, coalesce((item->>'on_credit')::boolean, false),
        coalesce(item->>'note', ''), coalesce(array(select jsonb_array_elements_text(item->'tags')), '{}'),
        (item->>'photo_id')::uuid, coalesce(item->>'created_by', ''),
        (item->>'deleted_at')::timestamptz, coalesce((item->>'updated_at')::timestamptz, now())
      ) on conflict (id) do update set
        date = excluded.date, amount = excluded.amount, direction = excluded.direction,
        category_id = excluded.category_id, account_id = excluded.account_id,
        to_account_id = excluded.to_account_id, party_id = excluded.party_id,
        on_credit = excluded.on_credit, note = excluded.note, tags = excluded.tags,
        photo_id = excluded.photo_id, deleted_at = excluded.deleted_at, updated_at = excluded.updated_at
      where public.txns.updated_at <= excluded.updated_at;
    end loop;
  end if;

  select currval('sync_seq') into v_cur_ver;
  return v_cur_ver;
end;
$$;

-- Sync Pull Function
create or replace function public.sync_pull(
  p_business_id uuid,
  p_since bigint default 0
) returns jsonb language plpgsql security definer as $$
declare
  v_org_id uuid;
  v_new_version bigint;
  v_accounts jsonb;
  v_categories jsonb;
  v_parties jsonb;
  v_txns jsonb;
begin
  select org_id into v_org_id from public.businesses where id = p_business_id;
  if v_org_id is null or not public.is_member(v_org_id, 'viewer') then
    raise exception 'Unauthorized to read business %', p_business_id;
  end if;

  select coalesce(jsonb_agg(row_to_json(a)), '[]'::jsonb)
  into v_accounts
  from public.accounts a
  where a.business_id = p_business_id and a.server_version > p_since;

  select coalesce(jsonb_agg(row_to_json(c)), '[]'::jsonb)
  into v_categories
  from public.categories c
  where c.business_id = p_business_id and c.server_version > p_since;

  select coalesce(jsonb_agg(row_to_json(p)), '[]'::jsonb)
  into v_parties
  from public.parties p
  where p.business_id = p_business_id and p.server_version > p_since;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  into v_txns
  from public.txns t
  where t.business_id = p_business_id and t.server_version > p_since;

  select last_value into v_new_version from sync_seq;

  return jsonb_build_object(
    'accounts', v_accounts,
    'categories', v_categories,
    'parties', v_parties,
    'txns', v_txns,
    'server_version', v_new_version
  );
end;
$$;

-- Server-side authoritative ledger lines rebuild
create or replace function public.fn_rebuild_ledger_lines()
returns trigger language plpgsql security definer as $$
declare
  v_sys_rec uuid;
  v_sys_pay uuid;
  v_sys_inc uuid;
  v_sys_exp uuid;
  v_sys_equ uuid;
  v_cat_special text;
  v_cat_key text;
begin
  delete from public.ledger_lines where txn_id = new.id;
  if new.deleted_at is not null then
    return new;
  end if;

  select id into v_sys_rec from public.accounts where business_id = new.business_id and kind = 'receivable' limit 1;
  select id into v_sys_pay from public.accounts where business_id = new.business_id and kind = 'payable' limit 1;
  select id into v_sys_inc from public.accounts where business_id = new.business_id and kind = 'income' limit 1;
  select id into v_sys_exp from public.accounts where business_id = new.business_id and kind = 'expense' limit 1;
  select id into v_sys_equ from public.accounts where business_id = new.business_id and kind = 'equity' limit 1;

  if new.category_id is not null then
    select special, key into v_cat_special, v_cat_key from public.categories where id = new.category_id;
  end if;

  if new.direction = 'transfer' then
    if new.to_account_id is not null and new.account_id is not null then
      insert into public.ledger_lines (business_id, org_id, txn_id, date, account_id, party_id, debit, credit)
      values (new.business_id, new.org_id, new.id, new.date, new.to_account_id, null, new.amount, 0),
             (new.business_id, new.org_id, new.id, new.date, new.account_id, null, 0, new.amount);
    end if;
  elsif new.direction = 'in' then
    if new.on_credit then
      if v_sys_rec is not null and v_sys_inc is not null then
        insert into public.ledger_lines (business_id, org_id, txn_id, date, account_id, party_id, debit, credit)
        values (new.business_id, new.org_id, new.id, new.date, v_sys_rec, new.party_id, new.amount, 0),
               (new.business_id, new.org_id, new.id, new.date, v_sys_inc, null, 0, new.amount);
      end if;
    else
      if new.account_id is not null then
        if v_cat_special = 'udhaar_mila' and v_sys_rec is not null then
          insert into public.ledger_lines (business_id, org_id, txn_id, date, account_id, party_id, debit, credit)
          values (new.business_id, new.org_id, new.id, new.date, new.account_id, null, new.amount, 0),
                 (new.business_id, new.org_id, new.id, new.date, v_sys_rec, new.party_id, 0, new.amount);
        elsif v_cat_special = 'udhaar_liya' and v_sys_pay is not null then
          insert into public.ledger_lines (business_id, org_id, txn_id, date, account_id, party_id, debit, credit)
          values (new.business_id, new.org_id, new.id, new.date, new.account_id, null, new.amount, 0),
                 (new.business_id, new.org_id, new.id, new.date, v_sys_pay, new.party_id, 0, new.amount);
        elsif v_cat_key = 'malik' and v_sys_equ is not null then
          insert into public.ledger_lines (business_id, org_id, txn_id, date, account_id, party_id, debit, credit)
          values (new.business_id, new.org_id, new.id, new.date, new.account_id, null, new.amount, 0),
                 (new.business_id, new.org_id, new.id, new.date, v_sys_equ, null, 0, new.amount);
        elsif v_sys_inc is not null then
          insert into public.ledger_lines (business_id, org_id, txn_id, date, account_id, party_id, debit, credit)
          values (new.business_id, new.org_id, new.id, new.date, new.account_id, null, new.amount, 0),
                 (new.business_id, new.org_id, new.id, new.date, v_sys_inc, null, 0, new.amount);
        end if;
      end if;
    end if;
  elsif new.direction = 'out' then
    if new.on_credit then
      if v_sys_exp is not null and v_sys_pay is not null then
        insert into public.ledger_lines (business_id, org_id, txn_id, date, account_id, party_id, debit, credit)
        values (new.business_id, new.org_id, new.id, new.date, v_sys_exp, null, new.amount, 0),
               (new.business_id, new.org_id, new.id, new.date, v_sys_pay, new.party_id, 0, new.amount);
      end if;
    else
      if new.account_id is not null then
        if v_cat_special = 'udhaar_diya' and v_sys_rec is not null then
          insert into public.ledger_lines (business_id, org_id, txn_id, date, account_id, party_id, debit, credit)
          values (new.business_id, new.org_id, new.id, new.date, v_sys_rec, new.party_id, new.amount, 0),
                 (new.business_id, new.org_id, new.id, new.date, new.account_id, null, 0, new.amount);
        elsif v_cat_special = 'udhaar_chukaya' and v_sys_pay is not null then
          insert into public.ledger_lines (business_id, org_id, txn_id, date, account_id, party_id, debit, credit)
          values (new.business_id, new.org_id, new.id, new.date, v_sys_pay, new.party_id, 0, new.amount),
                 (new.business_id, new.org_id, new.id, new.date, new.account_id, null, 0, new.amount);
        elsif v_cat_key = 'ghar' and v_sys_equ is not null then
          insert into public.ledger_lines (business_id, org_id, txn_id, date, account_id, party_id, debit, credit)
          values (new.business_id, new.org_id, new.id, new.date, v_sys_equ, null, new.amount, 0),
                 (new.business_id, new.org_id, new.id, new.date, new.account_id, null, 0, new.amount);
        elsif v_sys_exp is not null then
          insert into public.ledger_lines (business_id, org_id, txn_id, date, account_id, party_id, debit, credit)
          values (new.business_id, new.org_id, new.id, new.date, v_sys_exp, null, new.amount, 0),
                 (new.business_id, new.org_id, new.id, new.date, new.account_id, null, 0, new.amount);
        end if;
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists tr_txns_rebuild_lines on public.txns;
create trigger tr_txns_rebuild_lines
after insert or update on public.txns
for each row execute function public.fn_rebuild_ledger_lines();
