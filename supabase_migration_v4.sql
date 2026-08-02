-- ============================================================
-- خمّن صح — Migration v4: البريد الإلكتروني + الدخول بقوقل
--
-- شغّلها في: Supabase Dashboard > SQL Editor > New query
-- آمنة للتكرار.
--
-- ⚠️ قبل ما يشتغل زر قوقل لازم تفعّل المزوّد في:
--    Authentication > Providers > Google
--    (الخطوات كاملة في GOOGLE_SETUP.md)
-- ============================================================

-- ============================================================
-- الأعمدة الجديدة
-- ============================================================
alter table public.profiles add column if not exists email   text;
alter table public.profiles add column if not exists auth_id uuid;

-- بريد واحد لكل حساب. Postgres يسمح بتكرار NULL، فالحسابات القديمة
-- (بلا بريد) ما تتعارض مع بعضها.
create unique index if not exists profiles_email_unique on public.profiles (lower(email));
create unique index if not exists profiles_auth_id_unique on public.profiles (auth_id);

create or replace function public.is_valid_email(p text)
returns boolean
language sql
immutable
as $$
  select p is not null and p ~ '^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$';
$$;

-- ============================================================
-- REGISTER (يشترط بريداً الآن)
-- ============================================================
-- الإصدار ذو الوسيطين يُحذف: لو بقي، PostgREST يفضّله على الإصدار الجديد
-- ويستمر بقبول تسجيل بلا بريد.
drop function if exists public.register_user(text, text);

create or replace function public.register_user(p_username text, p_password text, p_email text default null)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ip     text := request_ip();
  v_by_ip  int;
  v_code   text;
  c_max_ip constant int := 5;
begin
  if length(p_username) < 3 then
    return json_build_object('success', false, 'message', 'اسم المستخدم لازم ٣ حروف على الأقل');
  end if;
  if length(p_password) < 4 then
    return json_build_object('success', false, 'message', 'كلمة المرور لازم ٤ حروف على الأقل');
  end if;

  -- p_email فيه قيمة افتراضية عشان النداءات القديمة (من نسخة مخزّنة في المتصفح)
  -- ما تنفجر بخطأ غامض، بل تستقبل رسالة مفهومة.
  if p_email is null then
    return json_build_object('success', false, 'message', 'حدّث الصفحة (Ctrl+Shift+R) ثم أعد المحاولة');
  end if;
  if not is_valid_email(p_email) then
    return json_build_object('success', false, 'message', 'البريد الإلكتروني غير صحيح');
  end if;

  if v_ip is not null then
    select count(*) into v_by_ip
      from auth_attempts
     where kind = 'register' and ip = v_ip and succeeded
       and attempted_at > now() - interval '1 hour';
    if v_by_ip >= c_max_ip then
      return json_build_object('success', false, 'message', 'حسابات كثيرة من نفس الجهاز — انتظر ساعة ⏳');
    end if;
  end if;

  if exists (select 1 from profiles where username ilike p_username) then
    return json_build_object('success', false, 'message', 'اسم المستخدم محجوز — اختر اسم ثاني');
  end if;
  if exists (select 1 from profiles where lower(email) = lower(p_email)) then
    return json_build_object('success', false, 'message', 'هذا البريد مسجّل بحساب ثاني');
  end if;

  v_code := gen_recovery_code();

  insert into profiles (username, password_hash, email, is_activated, license_key, trial_used, recovery_hash)
  values (p_username, crypt(p_password, gen_salt('bf', 10)), lower(p_email), false, null, 0,
          crypt(v_code, gen_salt('bf', 10)));

  insert into auth_attempts (kind, identifier, ip, succeeded)
  values ('register', lower(p_username), v_ip, true);

  return json_build_object(
    'success', true, 'message', 'تم إنشاء الحساب!',
    'recovery_code', v_code,
    'user', json_build_object('username', p_username, 'email', lower(p_email),
                              'is_activated', false, 'license_key', null, 'trial_used', 0)
  );
end;
$$;

-- ============================================================
-- إضافة بريد لحساب قائم (يتطلب كلمة المرور)
-- ============================================================
create or replace function public.set_my_email(p_username text, p_password text, p_email text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_row profiles%rowtype;
begin
  if not is_valid_email(p_email) then
    return json_build_object('success', false, 'message', 'البريد الإلكتروني غير صحيح');
  end if;

  select * into v_row from profiles where username ilike p_username limit 1;
  if v_row.username is null or v_row.password_hash <> crypt(p_password, v_row.password_hash) then
    return json_build_object('success', false, 'message', 'كلمة المرور غلط');
  end if;

  if exists (select 1 from profiles where lower(email) = lower(p_email) and username <> v_row.username) then
    return json_build_object('success', false, 'message', 'هذا البريد مسجّل بحساب ثاني');
  end if;

  update profiles set email = lower(p_email) where username = v_row.username;
  return json_build_object('success', true, 'message', 'تم حفظ البريد ✅', 'email', lower(p_email));
end;
$$;

-- ============================================================
-- جسر قوقل
-- ============================================================
-- الهوية تُقرأ من auth.uid()/auth.jwt() لا من وسيط يمرره العميل:
-- أي معرّف يُمرَّر كوسيط يقدر أي أحد ينتحله ويستولي على حساب غيره.
create or replace function public.google_bootstrap(p_username text default null)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_row   profiles%rowtype;
  v_base  text;
begin
  if v_uid is null then
    return json_build_object('success', false, 'message', 'ما فيه جلسة قوقل — أعد المحاولة');
  end if;
  if v_email = '' then
    return json_build_object('success', false, 'message', 'حساب قوقل بدون بريد — استخدم التسجيل العادي');
  end if;

  -- ١) مربوط من قبل → دخول مباشر
  select * into v_row from profiles where auth_id = v_uid limit 1;
  if v_row.username is not null then
    return json_build_object('success', true, 'linked', true,
      'user', json_build_object('username', v_row.username, 'email', v_row.email,
                                'is_activated', v_row.is_activated, 'license_key', v_row.license_key,
                                'trial_used', v_row.trial_used));
  end if;

  -- ٢) نفس البريد موجود بحساب قديم → اربطه بدل ما ننشئ نسخة ثانية
  select * into v_row from profiles where lower(email) = v_email limit 1;
  if v_row.username is not null then
    update profiles set auth_id = v_uid where username = v_row.username;
    return json_build_object('success', true, 'linked', true, 'merged', true,
      'user', json_build_object('username', v_row.username, 'email', v_row.email,
                                'is_activated', v_row.is_activated, 'license_key', v_row.license_key,
                                'trial_used', v_row.trial_used));
  end if;

  -- ٣) حساب جديد — قوقل يعطي بريداً لا اسم مستخدم، فنطلبه من اللاعب
  if p_username is null then
    v_base := regexp_replace(split_part(v_email, '@', 1), '[^a-zA-Z0-9_]', '', 'g');
    if length(v_base) < 3 then v_base := 'player'; end if;
    -- اقتراح غير محجوز
    if exists (select 1 from profiles where username ilike v_base) then
      v_base := v_base || floor(random() * 900 + 100)::text;
    end if;
    return json_build_object('success', false, 'needs_username', true,
      'suggested', v_base, 'email', v_email);
  end if;

  if length(p_username) < 3 then
    return json_build_object('success', false, 'needs_username', true,
      'message', 'اسم المستخدم لازم ٣ حروف على الأقل', 'email', v_email);
  end if;
  if exists (select 1 from profiles where username ilike p_username) then
    return json_build_object('success', false, 'needs_username', true,
      'message', 'اسم المستخدم محجوز — اختر اسم ثاني', 'email', v_email);
  end if;

  -- password_hash لا يقبل NULL في السكيما الحالية، ونحط قيمة مستحيلة المطابقة:
  -- crypt() ما ينتج أبداً هذا النص، فالدخول بكلمة مرور لهذا الحساب مقفل حتى
  -- يضبط صاحبه واحدة عبر رمز الاسترجاع.
  insert into profiles (username, password_hash, email, auth_id, is_activated, license_key, trial_used)
  values (p_username, '!google-only', v_email, v_uid, false, null, 0);

  insert into auth_attempts (kind, identifier, ip, succeeded)
  values ('register', lower(p_username), request_ip(), true);

  return json_build_object('success', true, 'created', true,
    'user', json_build_object('username', p_username, 'email', v_email,
                              'is_activated', false, 'license_key', null, 'trial_used', 0));
end;
$$;

-- ربط قوقل بحساب موجود والمستخدم داخل بكلمة المرور
create or replace function public.link_google_to_account(p_username text, p_password text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_row   profiles%rowtype;
begin
  if v_uid is null then
    return json_build_object('success', false, 'message', 'سجّل دخول بقوقل أولاً');
  end if;

  select * into v_row from profiles where username ilike p_username limit 1;
  if v_row.username is null or v_row.password_hash <> crypt(p_password, v_row.password_hash) then
    return json_build_object('success', false, 'message', 'كلمة المرور غلط');
  end if;
  if exists (select 1 from profiles where auth_id = v_uid and username <> v_row.username) then
    return json_build_object('success', false, 'message', 'حساب قوقل هذا مربوط بحساب ثاني');
  end if;
  if v_email <> '' and exists (select 1 from profiles where lower(email) = v_email and username <> v_row.username) then
    return json_build_object('success', false, 'message', 'بريد حساب قوقل مسجّل بحساب ثاني');
  end if;

  update profiles
     set auth_id = v_uid,
         email   = case when v_email <> '' then v_email else email end
   where username = v_row.username;

  return json_build_object('success', true, 'message', 'تم ربط حساب قوقل ✅', 'email', v_email);
end;
$$;

create or replace function public.unlink_google(p_username text, p_password text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_row profiles%rowtype;
begin
  select * into v_row from profiles where username ilike p_username limit 1;
  if v_row.username is null or v_row.password_hash <> crypt(p_password, v_row.password_hash) then
    return json_build_object('success', false, 'message', 'كلمة المرور غلط');
  end if;
  update profiles set auth_id = null where username = v_row.username;
  return json_build_object('success', true, 'message', 'تم فك الربط');
end;
$$;

-- ============================================================
-- LOGIN: يرجّع حالة البريد والربط عشان الواجهة تعرف ايش تطلب
-- ============================================================
create or replace function public.login_user(p_username text, p_password text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row      profiles%rowtype;
  v_ip       text := request_ip();
  v_by_user  int;
  v_by_ip    int;
  c_max_user constant int := 8;
  c_max_ip   constant int := 40;
begin
  select count(*) into v_by_user
    from auth_attempts
   where kind = 'login' and identifier = lower(coalesce(p_username,''))
     and not succeeded and attempted_at > now() - interval '15 minutes';
  if v_by_user >= c_max_user then
    return json_build_object('success', false, 'rate_limited', true,
      'message', 'محاولات كثيرة — انتظر ربع ساعة وحاول مرة ثانية ⏳');
  end if;

  if v_ip is not null then
    select count(*) into v_by_ip
      from auth_attempts
     where kind = 'login' and ip = v_ip
       and not succeeded and attempted_at > now() - interval '1 hour';
    if v_by_ip >= c_max_ip then
      return json_build_object('success', false, 'rate_limited', true,
        'message', 'محاولات كثيرة من هذا الجهاز — انتظر ساعة ⏳');
    end if;
  end if;

  if random() < 0.01 then
    delete from auth_attempts where attempted_at < now() - interval '7 days';
  end if;

  select * into v_row from profiles where username ilike p_username limit 1;

  if v_row.username is null or v_row.password_hash <> crypt(p_password, v_row.password_hash) then
    insert into auth_attempts (kind, identifier, ip, succeeded)
    values ('login', lower(coalesce(p_username,'')), v_ip, false);
    return json_build_object('success', false, 'message', 'اسم المستخدم أو كلمة المرور غلط');
  end if;

  insert into auth_attempts (kind, identifier, ip, succeeded)
  values ('login', lower(p_username), v_ip, true);

  return json_build_object(
    'success', true, 'message', 'تم تسجيل الدخول',
    'has_recovery', v_row.recovery_hash is not null,
    'needs_email', v_row.email is null,
    'google_linked', v_row.auth_id is not null,
    'user', json_build_object('username', v_row.username, 'email', v_row.email,
                              'is_activated', v_row.is_activated,
                              'license_key', v_row.license_key, 'trial_used', v_row.trial_used)
  );
end;
$$;

-- ============================================================
-- لوحة الإدارة: أضف البريد وحالة الربط
-- ============================================================
create or replace function public.admin_find_user(p_pass text, p_query text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v json;
begin
  if not is_admin(p_pass) then
    return json_build_object('success', false, 'message', 'كلمة مرور الإدارة غلط');
  end if;

  select json_build_object('success', true, 'rows', coalesce(json_agg(t), '[]'::json)) into v
  from (
    select username, coalesce(email, '—') as email, is_activated,
           coalesce(license_key, '—') as license_key,
           (auth_id is not null) as google_linked,
           (recovery_hash is not null) as has_recovery
      from profiles
     where username ilike '%' || p_query || '%'
        or coalesce(email, '') ilike '%' || p_query || '%'
     order by username
     limit 50
  ) t;
  return v;
end;
$$;

-- ============================================================
-- الصلاحيات
-- ============================================================
-- الدوال اللي تقرأ auth.uid() تُنادى بعد دخول قوقل، ووقتها دور العميل
-- يصير authenticated لا anon — فلازم المنح للاثنين.
grant execute on function public.register_user(text, text, text)      to anon, authenticated;
grant execute on function public.login_user(text, text)               to anon, authenticated;
grant execute on function public.set_my_email(text, text, text)       to anon, authenticated;
grant execute on function public.google_bootstrap(text)               to authenticated;
grant execute on function public.link_google_to_account(text, text)   to authenticated;
grant execute on function public.unlink_google(text, text)            to anon, authenticated;
grant execute on function public.admin_find_user(text, text)          to anon, authenticated;
grant execute on function public.is_valid_email(text)                 to anon, authenticated;

-- دوال v1–v3 كانت ممنوحة لـ anon فقط. بعد الدخول بقوقل يصير دور العميل
-- authenticated، فبدون هذي السطور كان التفعيل وحفظ النتائج يرجعان
-- "permission denied" لكل من يدخل بقوقل — وهي أعطال صامتة يصعب تتبعها.
grant execute on function public.activate_code(text, text)            to authenticated;
grant execute on function public.deactivate_code(text, text)          to authenticated;
grant execute on function public.update_trial(text, int)              to authenticated;
grant execute on function public.issue_recovery_code(text, text)      to authenticated;
grant execute on function public.reset_password_with_code(text, text, text) to authenticated;
grant execute on function public.my_game_history(text)                to authenticated;
grant execute on function public.save_game_result(text,text,text,text,int,int,int,int,int,int,text,int,numeric) to authenticated;
grant execute on function public.admin_set_password(text, text)       to authenticated;
grant execute on function public.admin_overview(text)                 to authenticated;
grant execute on function public.admin_find_code(text, text)          to authenticated;
grant execute on function public.admin_revoke_code(text, text)        to authenticated;
grant execute on function public.admin_reset_user_password(text, text, text) to authenticated;
grant execute on function public.admin_recent_attempts(text)          to authenticated;
