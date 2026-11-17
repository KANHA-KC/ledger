-- ============================================================================
-- Hisaab: fix cloud sync (apply AFTER 20261116000000_initial_schema.sql)
--
-- Why: nothing ever reached the server. This migration fixes the server side:
--   1. profiles were never created for signed-in users → create_org always failed
--      (organizations.created_by references profiles).
--   2. create_org made its own business id, different from the device's → pushes
--      targeted a business that did not exist. It now accepts the device's id.
--   3. accounts rejected 'stock' / 'asset' / 'loan' kinds and had no opening balance
--      → the very first upload failed.
--   4. a second device had no way to find the shop it belongs to → my_businesses().
--   5. invites can now be matched by phone OR email (claim_my_invites()).
--   6. sync_push: tombstones (id + deleted_at only) no longer fail, rows of another
--      business can't be overwritten, missing references don't block the queue,
--      business rename syncs.
--   7. the update trigger overwrote the device's updated_at with server time, which
--      broke last-write-wins between devices with different clocks.
--   8. ledger lines for "udhaar chukaya" debited nothing (both sides were credits).
-- Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Profiles for every auth user
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists email text;
alter table public.profiles alter column phone drop not null;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, phone, email, name)
  values (
    new.id,
    nullif(new.phone, ''),
    nullif(new.email, ''),
    coalesce(new.raw_user_meta_data->>'name', '')
  )
  on conflict (id) do update
    set phone = coalesce(excluded.phone, public.profiles.phone),
        email = coalesce(excluded.email, public.profiles.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of phone, email on auth.users
  for each row execute function public.handle_new_user();

-- backfill users who signed up before this migration
insert into public.profiles (id, phone, email)
select u.id, nullif(u.phone, ''), nullif(u.email, '')
from auth.users u
on conflict (id) do nothing;

-- helper used by every RPC: make sure the caller has a profile row
create or replace function public.ensure_profile()
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;
  insert into public.profiles (id, phone, email)
  select u.id, nullif(u.phone, ''), nullif(u.email, '') from auth.users u where u.id = v_user
  on conflict (id) do nothing;
  return v_user;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Accounts: all kinds the app uses + opening balance
-- ---------------------------------------------------------------------------
alter table public.accounts drop constraint if exists accounts_kind_check;
alter table public.accounts add constraint accounts_kind_check check (
  kind in ('cash', 'bank', 'upi', 'receivable', 'payable', 'stock', 'asset', 'loan', 'income', 'expense', 'equity')
);
alter table public.accounts add column if not exists opening bigint not null default 0;
alter table public.accounts add column if not exists system boolean not null default false;

-- ---------------------------------------------------------------------------
-- 3. Offline-first: references between synced rows must not block the queue.
--    (A row can arrive before the row it points to.) Org/business FKs stay.
-- ---------------------------------------------------------------------------
alter table public.txns drop constraint if exists txns_category_id_fkey;
alter table public.txns drop constraint if exists txns_account_id_fkey;
alter table public.txns drop constraint if exists txns_to_account_id_fkey;
alter table public.txns drop constraint if exists txns_party_id_fkey;
alter table public.categories drop constraint if exists categories_parent_id_fkey;
alter table public.ledger_lines drop constraint if exists ledger_lines_account_id_fkey;
alter table public.ledger_lines drop constraint if exists ledger_lines_party_id_fkey;

create index if not exists idx_accounts_biz_ver on public.accounts (business_id, server_version);
create index if not exists idx_categories_biz_ver on public.categories (business_id, server_version);
create index if not exists idx_parties_biz_ver on public.parties (business_id, server_version);
create index if not exists idx_txns_biz_ver on public.txns (business_id, server_version);
create index if not exists idx_txns_biz_date on public.txns (business_id, date);
create index if not exists idx_memberships_user on public.memberships (user_id);

-- ---------------------------------------------------------------------------
-- 4. Keep the device's updated_at (last-write-wins); only bump server_version
-- ---------------------------------------------------------------------------
create or replace function public.fn_sync_bump_version()
returns trigger language plpgsql as $$
begin
  new.server_version := nextval('sync_seq');
  if new.updated_at is null then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Invitations by phone or email
-- ---------------------------------------------------------------------------
alter table public.invitations alter column phone drop not null;
alter table public.invitations add column if not exists email text;
do $$ begin
  alter table public.invitations add constraint invitations_contact_check check (phone is not null or email is not null);
exception when duplicate_object then null;
end $$;
create unique index if not exists invitations_org_email_key on public.invitations (org_id, lower(email)) where email is not null;

create or replace function public.claim_my_invites()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.ensure_profile();
  v_phone text;
  v_email text;
  v_count int := 0;
  r record;
begin
  select nullif(u.phone, ''), nullif(lower(u.email), '') into v_phone, v_email from auth.users u where u.id = v_user;
  for r in
    select * from public.invitations i
    where i.accepted_at is null and i.expires_at > now()
      and (
        (v_phone is not null and i.phone is not null
          and right(regexp_replace(i.phone, '\D', '', 'g'), 10) = right(regexp_replace(v_phone, '\D', '', 'g'), 10))
        or (v_email is not null and lower(i.email) = v_email)
      )
  loop
    insert into public.memberships (org_id, user_id, role)
    values (r.org_id, v_user, r.role)
    on conflict (org_id, user_id) do nothing;
    update public.invitations set accepted_at = now() where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. create_org: use the device's business id; idempotent (safe to retry)
-- ---------------------------------------------------------------------------
drop function if exists public.create_org(text, text, text, text);

create or replace function public.create_org(
  p_org_name text,
  p_biz_name text,
  p_biz_type text default 'general',
  p_language text default 'hi',
  p_business_id uuid default null,
  p_owner_phone text default ''
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.ensure_profile();
  v_biz uuid := coalesce(p_business_id, gen_random_uuid());
  v_existing uuid;
  v_org uuid;
begin
  select org_id into v_existing from public.businesses where id = v_biz;
  if v_existing is not null then
    if public.is_member(v_existing) then
      return jsonb_build_object('org_id', v_existing, 'business_id', v_biz);
    end if;
    raise exception 'Business % belongs to another organisation', v_biz;
  end if;

  insert into public.organizations (name, created_by) values (p_org_name, v_user) returning id into v_org;
  insert into public.memberships (org_id, user_id, role) values (v_org, v_user, 'owner');
  insert into public.businesses (id, org_id, name, type, language, owner_phone)
  values (v_biz, v_org, p_biz_name, coalesce(p_biz_type, 'general'), coalesce(p_language, 'hi'), coalesce(p_owner_phone, ''));

  return jsonb_build_object('org_id', v_org, 'business_id', v_biz);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Which shops can I open? (used when signing in on a new device)
-- ---------------------------------------------------------------------------
create or replace function public.my_businesses()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'org_id', b.org_id, 'org_name', o.name, 'business_id', b.id, 'name', b.name, 'type', b.type,
      'language', b.language, 'owner_phone', b.owner_phone, 'fy_start_month', b.fy_start_month,
      'created_at', b.created_at, 'role', m.role
    ) order by b.created_at)
    from public.memberships m
    join public.organizations o on o.id = m.org_id
    join public.businesses b on b.org_id = m.org_id and b.deleted_at is null
    where m.user_id = v_user
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. sync_push
-- ---------------------------------------------------------------------------
create or replace function public.sync_push(
  p_business_id uuid,
  p_changes jsonb
) returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  item jsonb;
  v_ver bigint;
begin
  select org_id into v_org from public.businesses where id = p_business_id;
  if v_org is null or not public.is_member(v_org, 'editor') then
    raise exception 'Unauthorized to push to business %', p_business_id;
  end if;

  -- business (rename etc.) — admins only, silently ignored for editors
  if p_changes ? 'business' and jsonb_typeof(p_changes->'business') = 'object' and public.is_member(v_org, 'admin') then
    item := p_changes->'business';
    update public.businesses set
      name = coalesce(item->>'name', name),
      type = coalesce(item->>'type', type),
      language = coalesce(item->>'language', language),
      fy_start_month = coalesce((item->>'fy_start_month')::int, fy_start_month),
      owner_phone = coalesce(item->>'owner_phone', owner_phone),
      updated_at = coalesce((item->>'updated_at')::timestamptz, now())
    where id = p_business_id;
  end if;

  -- accounts
  for item in select value from jsonb_array_elements(coalesce(p_changes->'accounts', '[]'::jsonb)) loop
    if item ? 'kind' then
      insert into public.accounts as a (
        id, business_id, org_id, kind, name_en, name_hi, icon, opening, system, details,
        is_default, hidden, deleted_at, updated_at
      ) values (
        (item->>'id')::uuid, p_business_id, v_org, item->>'kind',
        coalesce(item->>'name_en', ''), coalesce(item->>'name_hi', ''), coalesce(item->>'icon', '💳'),
        coalesce((item->>'opening')::bigint, 0), coalesce((item->>'system')::boolean, false),
        coalesce(item->'details', '{}'::jsonb), coalesce((item->>'is_default')::boolean, false),
        coalesce((item->>'hidden')::boolean, false), (item->>'deleted_at')::timestamptz,
        coalesce((item->>'updated_at')::timestamptz, now())
      ) on conflict (id) do update set
        kind = excluded.kind, name_en = excluded.name_en, name_hi = excluded.name_hi, icon = excluded.icon,
        opening = excluded.opening, system = excluded.system, is_default = excluded.is_default,
        hidden = excluded.hidden, deleted_at = excluded.deleted_at, updated_at = excluded.updated_at
      where a.business_id = excluded.business_id and a.updated_at <= excluded.updated_at;
    else
      update public.accounts set deleted_at = coalesce((item->>'deleted_at')::timestamptz, now()), updated_at = now()
      where id = (item->>'id')::uuid and business_id = p_business_id;
    end if;
  end loop;

  -- categories (parents first)
  for item in
    select value from jsonb_array_elements(coalesce(p_changes->'categories', '[]'::jsonb))
    order by (value->>'parent_id') is not null
  loop
    if item ? 'direction' then
      insert into public.categories as c (
        id, business_id, org_id, direction, name_en, name_hi, icon, color, parent_id, is_default,
        sort, hidden, special, key, deleted_at, updated_at
      ) values (
        (item->>'id')::uuid, p_business_id, v_org, item->>'direction',
        coalesce(item->>'name_en', ''), coalesce(item->>'name_hi', ''),
        coalesce(item->>'icon', '🏷️'), coalesce(item->>'color', '#007AFF'),
        (item->>'parent_id')::uuid, coalesce((item->>'is_default')::boolean, false),
        coalesce((item->>'sort')::int, 0), coalesce((item->>'hidden')::boolean, false),
        item->>'special', item->>'key', (item->>'deleted_at')::timestamptz,
        coalesce((item->>'updated_at')::timestamptz, now())
      ) on conflict (id) do update set
        direction = excluded.direction, name_en = excluded.name_en, name_hi = excluded.name_hi,
        icon = excluded.icon, color = excluded.color, parent_id = excluded.parent_id,
        is_default = excluded.is_default, sort = excluded.sort, hidden = excluded.hidden,
        special = excluded.special, key = excluded.key, deleted_at = excluded.deleted_at,
        updated_at = excluded.updated_at
      where c.business_id = excluded.business_id and c.updated_at <= excluded.updated_at;
    else
      update public.categories set deleted_at = coalesce((item->>'deleted_at')::timestamptz, now()), updated_at = now()
      where id = (item->>'id')::uuid and business_id = p_business_id;
    end if;
  end loop;

  -- parties
  for item in select value from jsonb_array_elements(coalesce(p_changes->'parties', '[]'::jsonb)) loop
    if item ? 'name' then
      insert into public.parties as p (
        id, business_id, org_id, name, name_alt, phone, type, created_at, deleted_at, updated_at
      ) values (
        (item->>'id')::uuid, p_business_id, v_org, item->>'name', coalesce(item->>'name_alt', ''),
        item->>'phone', coalesce(nullif(item->>'type', ''), 'customer'),
        coalesce((item->>'created_at')::timestamptz, now()),
        (item->>'deleted_at')::timestamptz, coalesce((item->>'updated_at')::timestamptz, now())
      ) on conflict (id) do update set
        name = excluded.name, name_alt = excluded.name_alt, phone = excluded.phone, type = excluded.type,
        deleted_at = excluded.deleted_at, updated_at = excluded.updated_at
      where p.business_id = excluded.business_id and p.updated_at <= excluded.updated_at;
    else
      update public.parties set deleted_at = coalesce((item->>'deleted_at')::timestamptz, now()), updated_at = now()
      where id = (item->>'id')::uuid and business_id = p_business_id;
    end if;
  end loop;

  -- txns
  for item in select value from jsonb_array_elements(coalesce(p_changes->'txns', '[]'::jsonb)) loop
    if item ? 'date' and item ? 'amount' then
      insert into public.txns as t (
        id, business_id, org_id, date, amount, direction, category_id, account_id, to_account_id,
        party_id, on_credit, note, tags, photo_id, created_by, created_at, deleted_at, updated_at
      ) values (
        (item->>'id')::uuid, p_business_id, v_org, (item->>'date')::date, (item->>'amount')::bigint,
        item->>'direction', (item->>'category_id')::uuid, (item->>'account_id')::uuid,
        (item->>'to_account_id')::uuid, (item->>'party_id')::uuid,
        coalesce((item->>'on_credit')::boolean, false), coalesce(item->>'note', ''),
        coalesce(array(select jsonb_array_elements_text(coalesce(item->'tags', '[]'::jsonb))), '{}'),
        (item->>'photo_id')::uuid, coalesce(item->>'created_by', ''),
        coalesce((item->>'created_at')::timestamptz, now()),
        (item->>'deleted_at')::timestamptz, coalesce((item->>'updated_at')::timestamptz, now())
      ) on conflict (id) do update set
        date = excluded.date, amount = excluded.amount, direction = excluded.direction,
        category_id = excluded.category_id, account_id = excluded.account_id,
        to_account_id = excluded.to_account_id, party_id = excluded.party_id,
        on_credit = excluded.on_credit, note = excluded.note, tags = excluded.tags,
        photo_id = excluded.photo_id, deleted_at = excluded.deleted_at, updated_at = excluded.updated_at
      where t.business_id = excluded.business_id and t.updated_at <= excluded.updated_at;
    else
      -- tombstone from a hard delete on the device
      update public.txns set deleted_at = coalesce((item->>'deleted_at')::timestamptz, now()), updated_at = now()
      where id = (item->>'id')::uuid and business_id = p_business_id;
    end if;
  end loop;

  select last_value into v_ver from sync_seq;
  return v_ver;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. sync_pull: also return the business row; cursor taken before reading
-- ---------------------------------------------------------------------------
create or replace function public.sync_pull(
  p_business_id uuid,
  p_since bigint default 0
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_org uuid;
  v_ver bigint;
begin
  select org_id into v_org from public.businesses where id = p_business_id;
  if v_org is null or not public.is_member(v_org, 'viewer') then
    raise exception 'Unauthorized to read business %', p_business_id;
  end if;

  select last_value into v_ver from sync_seq;

  return jsonb_build_object(
    'business', (select row_to_json(b) from public.businesses b where b.id = p_business_id),
    'accounts', coalesce((select jsonb_agg(row_to_json(a)) from public.accounts a
                          where a.business_id = p_business_id and a.server_version > p_since), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(row_to_json(c)) from public.categories c
                            where c.business_id = p_business_id and c.server_version > p_since), '[]'::jsonb),
    'parties', coalesce((select jsonb_agg(row_to_json(p)) from public.parties p
                         where p.business_id = p_business_id and p.server_version > p_since), '[]'::jsonb),
    'txns', coalesce((select jsonb_agg(row_to_json(t)) from public.txns t
                      where t.business_id = p_business_id and t.server_version > p_since), '[]'::jsonb),
    'server_version', v_ver
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Ledger lines: fix "udhaar chukaya" (payable must be DEBITED)
-- ---------------------------------------------------------------------------
create or replace function public.fn_rebuild_ledger_lines()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_rec uuid; v_pay uuid; v_inc uuid; v_exp uuid; v_equ uuid;
  v_special text; v_key text;
  v_dr uuid; v_dr_party uuid; v_cr uuid; v_cr_party uuid;
begin
  delete from public.ledger_lines where txn_id = new.id;
  if new.deleted_at is not null then
    return new;
  end if;

  select id into v_rec from public.accounts where business_id = new.business_id and kind = 'receivable' limit 1;
  select id into v_pay from public.accounts where business_id = new.business_id and kind = 'payable' limit 1;
  select id into v_inc from public.accounts where business_id = new.business_id and kind = 'income' limit 1;
  select id into v_exp from public.accounts where business_id = new.business_id and kind = 'expense' limit 1;
  select id into v_equ from public.accounts where business_id = new.business_id and kind = 'equity' limit 1;
  if new.category_id is not null then
    select special, key into v_special, v_key from public.categories where id = new.category_id;
  end if;

  -- mirrors buildLines() in app/src/db/ledger.ts
  if new.direction = 'transfer' then
    v_dr := new.to_account_id; v_cr := new.account_id;
  elsif new.direction = 'in' then
    if new.on_credit then
      v_dr := v_rec; v_dr_party := new.party_id; v_cr := v_inc;
    else
      v_dr := new.account_id;
      if v_special = 'udhaar_mila' then v_cr := v_rec; v_cr_party := new.party_id;
      elsif v_special = 'udhaar_liya' then v_cr := v_pay; v_cr_party := new.party_id;
      elsif v_key = 'malik' then v_cr := v_equ;
      else v_cr := v_inc;
      end if;
    end if;
  else -- out
    if new.on_credit then
      v_dr := v_exp; v_cr := v_pay; v_cr_party := new.party_id;
    else
      v_cr := new.account_id;
      if v_special = 'udhaar_diya' then v_dr := v_rec; v_dr_party := new.party_id;
      elsif v_special = 'udhaar_chukaya' then v_dr := v_pay; v_dr_party := new.party_id;
      elsif v_key = 'ghar' then v_dr := v_equ;
      else v_dr := v_exp;
      end if;
    end if;
  end if;

  if v_dr is not null and v_cr is not null then
    insert into public.ledger_lines (business_id, org_id, txn_id, date, account_id, party_id, debit, credit)
    values (new.business_id, new.org_id, new.id, new.date, v_dr, v_dr_party, new.amount, 0),
           (new.business_id, new.org_id, new.id, new.date, v_cr, v_cr_party, 0, new.amount);
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. RPC permissions
-- ---------------------------------------------------------------------------
revoke all on function public.create_org(text, text, text, text, uuid, text) from public, anon;
revoke all on function public.my_businesses() from public, anon;
revoke all on function public.claim_my_invites() from public, anon;
revoke all on function public.sync_push(uuid, jsonb) from public, anon;
revoke all on function public.sync_pull(uuid, bigint) from public, anon;
grant execute on function public.create_org(text, text, text, text, uuid, text) to authenticated;
grant execute on function public.my_businesses() to authenticated;
grant execute on function public.claim_my_invites() to authenticated;
grant execute on function public.sync_push(uuid, jsonb) to authenticated;
grant execute on function public.sync_pull(uuid, bigint) to authenticated;
