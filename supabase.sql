create extension if not exists pgcrypto;

create table if not exists public.overloader_sync (
  id text primary key default 'main',
  secret_hash text not null,
  state jsonb,
  state_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.overloader_sync enable row level security;
revoke all on public.overloader_sync from public;
revoke all on public.overloader_sync from anon, authenticated;

do $$
declare
  sync_secret text := 'REPLACE_WITH_A_LONG_RANDOM_SYNC_SECRET';
begin
  if sync_secret = 'REPLACE_WITH_A_LONG_RANDOM_SYNC_SECRET' then
    raise exception 'Edit supabase.sql and replace REPLACE_WITH_A_LONG_RANDOM_SYNC_SECRET before running it.';
  end if;

  insert into public.overloader_sync (id, secret_hash)
  values ('main', crypt(sync_secret, gen_salt('bf')))
  on conflict (id) do update
    set secret_hash = excluded.secret_hash,
        updated_at = now();
end $$;

create or replace function public.overloader_check_secret(p_sync_secret text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.overloader_sync
    where id = 'main'
      and secret_hash = crypt(p_sync_secret, secret_hash)
  ) then
    raise exception 'Invalid OverLoader sync secret.';
  end if;
end;
$$;

create or replace function public.overloader_pull(p_sync_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  payload jsonb;
begin
  perform public.overloader_check_secret(p_sync_secret);

  select jsonb_build_object(
    'state', state,
    'state_updated_at', state_updated_at,
    'updated_at', updated_at
  )
  into payload
  from public.overloader_sync
  where id = 'main';

  return payload;
end;
$$;

create or replace function public.overloader_push(
  p_sync_secret text,
  p_state jsonb,
  p_state_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  payload jsonb;
begin
  perform public.overloader_check_secret(p_sync_secret);

  update public.overloader_sync
  set state = p_state,
      state_updated_at = p_state_updated_at,
      updated_at = now()
  where id = 'main'
  returning jsonb_build_object(
    'state', state,
    'state_updated_at', state_updated_at,
    'updated_at', updated_at
  )
  into payload;

  return payload;
end;
$$;

revoke all on function public.overloader_check_secret(text) from public;
revoke all on function public.overloader_pull(text) from public;
revoke all on function public.overloader_push(text, jsonb, timestamptz) from public;

grant execute on function public.overloader_pull(text) to anon;
grant execute on function public.overloader_push(text, jsonb, timestamptz) to anon;
