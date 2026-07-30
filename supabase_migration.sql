-- ============================================================
-- خمّن صح — Migration: direct-from-browser auth (no Node server)
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query)
-- ============================================================

-- pgcrypto gives us bcrypt-compatible hashing (crypt/gen_salt) right in Postgres.
-- It verifies existing bcryptjs-hashed passwords fine — same hash format ($2a$/$2b$),
-- so no existing accounts break.
create extension if not exists pgcrypto;

-- ===== LOCK DOWN THE TABLES (fixes the "UNRESTRICTED" warning) =====
alter table public.profiles enable row level security;
alter table public.activation_codes enable row level security;
alter table public.questions enable row level security;

-- questions: anyone can read (needed for the game to load them), nobody can write directly
drop policy if exists "questions_public_read" on public.questions;
create policy "questions_public_read" on public.questions
  for select using (true);

-- profiles / activation_codes: NO direct policies at all.
-- With RLS on and zero policies, anon can no longer read/write these tables directly —
-- all access goes through the functions below instead, which run with elevated
-- privileges (security definer) regardless of the caller's RLS restrictions.

-- ===== REGISTER =====
create or replace function public.register_user(p_username text, p_password text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if length(p_username) < 3 then
    return json_build_object('success', false, 'message', 'اسم المستخدم لازم ٣ حروف على الأقل');
  end if;
  if length(p_password) < 4 then
    return json_build_object('success', false, 'message', 'كلمة المرور لازم ٤ حروف على الأقل');
  end if;

  if exists (select 1 from profiles where username ilike p_username) then
    return json_build_object('success', false, 'message', 'اسم المستخدم محجوز — اختر اسم ثاني');
  end if;

  insert into profiles (username, password_hash, is_activated, license_key, trial_used)
  values (p_username, crypt(p_password, gen_salt('bf')), false, null, 0);

  return json_build_object(
    'success', true, 'message', 'تم إنشاء الحساب!',
    'user', json_build_object('username', p_username, 'is_activated', false, 'license_key', null, 'trial_used', 0)
  );
end;
$$;

-- ===== LOGIN =====
create or replace function public.login_user(p_username text, p_password text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row profiles%rowtype;
begin
  select * into v_row from profiles where username ilike p_username limit 1;

  if v_row.username is null or v_row.password_hash <> crypt(p_password, v_row.password_hash) then
    return json_build_object('success', false, 'message', 'اسم المستخدم أو كلمة المرور غلط');
  end if;

  return json_build_object(
    'success', true, 'message', 'تم تسجيل الدخول',
    'user', json_build_object('username', v_row.username, 'is_activated', v_row.is_activated, 'license_key', v_row.license_key, 'trial_used', v_row.trial_used)
  );
end;
$$;

-- ===== UPDATE TRIAL COUNTER =====
create or replace function public.update_trial(p_username text, p_trial_used int)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles set trial_used = p_trial_used where username ilike p_username;
  return json_build_object('success', true);
end;
$$;

-- ===== ACTIVATE LICENSE CODE =====
create or replace function public.activate_code(p_code text, p_email text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row activation_codes%rowtype;
begin
  select * into v_row from activation_codes where code = p_code limit 1;

  if v_row.code is null then
    return json_build_object('success', false, 'message', 'الكود غير صحيح ❌');
  end if;

  if v_row.is_used then
    if v_row.user_email = p_email then
      return json_build_object('success', true, 'message', 'الكود مفعّل لحسابك ✅');
    end if;
    return json_build_object('success', false, 'message', 'هذا الكود مستخدم من حساب ثاني ⚠️');
  end if;

  update activation_codes set is_used = true, user_email = p_email where code = p_code;
  update profiles set is_activated = true, license_key = p_code where username ilike p_email;

  return json_build_object('success', true, 'message', 'تم التفعيل بنجاح! 🚀✅');
end;
$$;

-- ===== DEACTIVATE LICENSE CODE =====
create or replace function public.deactivate_code(p_code text, p_email text)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  update activation_codes set is_used = false, user_email = null where code = p_code;
  if p_email is not null then
    update profiles set is_activated = false, license_key = null where username ilike p_email;
  end if;
  return json_build_object('success', true, 'message', 'تم إلغاء التفعيل');
end;
$$;

-- allow the public (anon) API role to call these functions
grant execute on function public.register_user(text, text) to anon;
grant execute on function public.login_user(text, text) to anon;
grant execute on function public.update_trial(text, int) to anon;
grant execute on function public.activate_code(text, text) to anon;
grant execute on function public.deactivate_code(text, text) to anon;
