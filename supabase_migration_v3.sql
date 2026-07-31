-- ============================================================
-- خمّن صح — Migration v3
--   1) حد المحاولات على تسجيل الدخول وإنشاء الحساب
--   2) استرجاع كلمة المرور برمز (بدون بريد)
--   3) حفظ نتائج المباريات
--   4) دوال لوحة الإدارة
--
-- شغّلها مرة واحدة في: Supabase Dashboard > SQL Editor > New query
-- آمنة للتكرار (create if not exists / create or replace)
--
-- ⚠️ بعد تشغيلها مباشرة، شغّل هذا السطر بكلمة مرور من اختيارك
--    لأن أول من ينادي الدالة هو من يملك اللوحة:
--        select public.admin_set_password('كلمة_المرور_هنا');
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- 1) حد المحاولات على المصادقة
-- ============================================================
-- جدول منفصل عن activation_attempts عشان حد التفعيل ما يتداخل مع حد الدخول.
create table if not exists public.auth_attempts (
  id           bigserial primary key,
  kind         text        not null,          -- 'login' | 'register'
  identifier   text        not null,
  ip           text,
  attempted_at timestamptz not null default now(),
  succeeded    boolean     not null default false
);
create index if not exists auth_attempts_by_id   on public.auth_attempts (kind, identifier, attempted_at desc);
create index if not exists auth_attempts_by_ip   on public.auth_attempts (kind, ip, attempted_at desc);
alter table public.auth_attempts enable row level security;

-- عنوان الطلب من هيدرات PostgREST. ملفوف بـ exception لأن الإعداد
-- غير موجود لما تُنادى الدالة من SQL Editor مباشرة.
create or replace function public.request_ip()
returns text
language plpgsql
stable
as $$
declare v text;
begin
  begin
    v := split_part(
      coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1);
  exception when others then
    v := '';
  end;
  if v = '' then return null; end if;
  return v;
end;
$$;

-- ============================================================
-- 2) رمز الاسترجاع
-- ============================================================
alter table public.profiles add column if not exists recovery_hash text;

-- رمز بصيغة XXXXX-XXXXX من نفس أبجدية أكواد التفعيل (بدون I/L/O/U).
-- gen_random_bytes آمن تشفيرياً، و 256 يقبل القسمة على 32 فما فيه انحياز.
create or replace function public.gen_recovery_code()
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  b bytea := gen_random_bytes(10);
  out text := '';
  i int;
begin
  for i in 0..9 loop
    out := out || substr(alphabet, 1 + (get_byte(b, i) % 32), 1);
  end loop;
  return substr(out, 1, 5) || '-' || substr(out, 6, 5);
end;
$$;

-- ============================================================
-- 3) نتائج المباريات
-- ============================================================
create table if not exists public.game_results (
  id             bigserial primary key,
  username       text        not null,
  mode           text        not null,          -- 'solo' | 'teams'
  team1_name     text,
  team2_name     text,
  team1_score    int         not null default 0,
  team2_score    int         not null default 0,
  solo_score     int         not null default 0,
  rounds_played  int         not null default 0,
  total_reveals  int         not null default 0,
  total_strikes  int         not null default 0,
  best_round_team text,
  best_round_pts int         not null default 0,
  fastest_reveal numeric,
  played_at      timestamptz not null default now()
);
create index if not exists game_results_by_user on public.game_results (username, played_at desc);
alter table public.game_results enable row level security;

-- ============================================================
-- 4) بوابة الإدارة
-- ============================================================
create table if not exists public.app_admin (
  id            int primary key default 1,
  password_hash text not null,
  updated_at    timestamptz not null default now(),
  constraint app_admin_single_row check (id = 1)
);
alter table public.app_admin enable row level security;

-- أول نداء يضبط كلمة المرور؛ أي نداء بعده يتطلب الحالية.
create or replace function public.admin_set_password(p_new text, p_current text default null)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if length(coalesce(p_new, '')) < 8 then
    return json_build_object('success', false, 'message', 'كلمة مرور الإدارة لازم ٨ أحرف على الأقل');
  end if;

  if exists (select 1 from app_admin) then
    if not exists (select 1 from app_admin where password_hash = crypt(coalesce(p_current,''), password_hash)) then
      return json_build_object('success', false, 'message', 'كلمة مرور الإدارة الحالية غلط');
    end if;
    update app_admin set password_hash = crypt(p_new, gen_salt('bf')), updated_at = now() where id = 1;
  else
    insert into app_admin (id, password_hash) values (1, crypt(p_new, gen_salt('bf')));
  end if;

  return json_build_object('success', true, 'message', 'تم ضبط كلمة مرور الإدارة');
end;
$$;

create or replace function public.is_admin(p_pass text)
returns boolean
language sql
security definer
stable
set search_path = public, extensions
as $$
  select exists (
    select 1 from app_admin where password_hash = crypt(coalesce(p_pass, ''), password_hash)
  );
$$;

-- ============================================================
-- REGISTER (بحد للمحاولات + رمز استرجاع)
-- ============================================================
create or replace function public.register_user(p_username text, p_password text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ip       text := request_ip();
  v_by_ip    int;
  v_code     text;
  c_max_ip   constant int := 5;      -- حسابات جديدة لكل IP في الساعة
begin
  if length(p_username) < 3 then
    return json_build_object('success', false, 'message', 'اسم المستخدم لازم ٣ حروف على الأقل');
  end if;
  if length(p_password) < 4 then
    return json_build_object('success', false, 'message', 'كلمة المرور لازم ٤ حروف على الأقل');
  end if;

  -- سقف إنشاء الحسابات: يمنع إغراق الجدول بحسابات وهمية
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

  v_code := gen_recovery_code();

  insert into profiles (username, password_hash, is_activated, license_key, trial_used, recovery_hash)
  values (p_username, crypt(p_password, gen_salt('bf')), false, null, 0, crypt(v_code, gen_salt('bf')));

  insert into auth_attempts (kind, identifier, ip, succeeded)
  values ('register', lower(p_username), v_ip, true);

  -- recovery_code يُرجَع مرة واحدة فقط؛ المخزّن هو الهاش لا الرمز.
  return json_build_object(
    'success', true, 'message', 'تم إنشاء الحساب!',
    'recovery_code', v_code,
    'user', json_build_object('username', p_username, 'is_activated', false, 'license_key', null, 'trial_used', 0)
  );
end;
$$;

-- ============================================================
-- LOGIN (بحد للمحاولات)
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
  c_max_user constant int := 8;      -- محاولات فاشلة لكل اسم مستخدم / ١٥ دقيقة
  c_max_ip   constant int := 40;     -- محاولات فاشلة لكل IP / ساعة
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

  -- تنظيف دوري خفيف
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
    'user', json_build_object('username', v_row.username, 'is_activated', v_row.is_activated,
                              'license_key', v_row.license_key, 'trial_used', v_row.trial_used)
  );
end;
$$;

-- ============================================================
-- إصدار رمز استرجاع لحساب قائم (يتطلب كلمة المرور الحالية)
-- ============================================================
create or replace function public.issue_recovery_code(p_username text, p_password text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row  profiles%rowtype;
  v_code text;
begin
  select * into v_row from profiles where username ilike p_username limit 1;
  if v_row.username is null or v_row.password_hash <> crypt(p_password, v_row.password_hash) then
    return json_build_object('success', false, 'message', 'كلمة المرور غلط');
  end if;

  v_code := gen_recovery_code();
  update profiles set recovery_hash = crypt(v_code, gen_salt('bf')) where username ilike p_username;

  return json_build_object('success', true, 'recovery_code', v_code,
    'message', 'احفظ هذا الرمز في مكان آمن — ما راح يظهر مرة ثانية');
end;
$$;

-- ============================================================
-- استرجاع كلمة المرور بالرمز
-- ============================================================
create or replace function public.reset_password_with_code(p_username text, p_code text, p_new_password text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row     profiles%rowtype;
  v_ip      text := request_ip();
  v_fails   int;
  v_norm    text;
begin
  -- نفس تطبيع أكواد التفعيل: نشيل الفواصل ونعيد تركيب الصيغة
  v_norm := upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'));
  if length(v_norm) = 10 then
    v_norm := substr(v_norm, 1, 5) || '-' || substr(v_norm, 6, 5);
  end if;

  -- الرمز هدف مغرٍ للتخمين، فله نفس الحد
  select count(*) into v_fails
    from auth_attempts
   where kind = 'reset' and identifier = lower(coalesce(p_username,''))
     and not succeeded and attempted_at > now() - interval '1 hour';
  if v_fails >= 5 then
    return json_build_object('success', false, 'rate_limited', true,
      'message', 'محاولات كثيرة — انتظر ساعة ⏳');
  end if;

  if length(coalesce(p_new_password,'')) < 4 then
    return json_build_object('success', false, 'message', 'كلمة المرور لازم ٤ حروف على الأقل');
  end if;

  select * into v_row from profiles where username ilike p_username limit 1;

  if v_row.username is null or v_row.recovery_hash is null
     or v_row.recovery_hash <> crypt(v_norm, v_row.recovery_hash) then
    insert into auth_attempts (kind, identifier, ip, succeeded)
    values ('reset', lower(coalesce(p_username,'')), v_ip, false);
    return json_build_object('success', false, 'message', 'اسم المستخدم أو رمز الاسترجاع غلط ❌');
  end if;

  -- الرمز يُستهلك بعد الاستخدام حتى لا يُعاد استعماله لو تسرّب
  update profiles
     set password_hash = crypt(p_new_password, gen_salt('bf')),
         recovery_hash = null
   where username ilike p_username;

  insert into auth_attempts (kind, identifier, ip, succeeded)
  values ('reset', lower(p_username), v_ip, true);

  return json_build_object('success', true, 'message', 'تم تغيير كلمة المرور — سجّل دخولك الآن ✅');
end;
$$;

-- ============================================================
-- حفظ نتيجة مباراة
-- ============================================================
create or replace function public.save_game_result(
  p_username text, p_mode text,
  p_team1_name text, p_team2_name text,
  p_team1_score int, p_team2_score int, p_solo_score int,
  p_rounds int, p_reveals int, p_strikes int,
  p_best_team text, p_best_pts int, p_fastest numeric
)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_username is null or not exists (select 1 from profiles where username ilike p_username) then
    return json_build_object('success', false);
  end if;

  insert into game_results (username, mode, team1_name, team2_name, team1_score, team2_score,
                            solo_score, rounds_played, total_reveals, total_strikes,
                            best_round_team, best_round_pts, fastest_reveal)
  values (p_username, coalesce(p_mode,'teams'), p_team1_name, p_team2_name,
          coalesce(p_team1_score,0), coalesce(p_team2_score,0), coalesce(p_solo_score,0),
          coalesce(p_rounds,0), coalesce(p_reveals,0), coalesce(p_strikes,0),
          p_best_team, coalesce(p_best_pts,0), p_fastest);

  return json_build_object('success', true);
end;
$$;

-- سجل اللاعب: آخر ١٥ مباراة
create or replace function public.my_game_history(p_username text)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(json_agg(r order by r.played_at desc), '[]'::json)
  from (
    select mode, team1_name, team2_name, team1_score, team2_score, solo_score,
           rounds_played, total_strikes, played_at
      from game_results
     where username ilike p_username
     order by played_at desc
     limit 15
  ) r;
$$;

-- ============================================================
-- دوال لوحة الإدارة (كلها تتحقق من كلمة مرور الإدارة أولاً)
-- ============================================================
create or replace function public.admin_overview(p_pass text)
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

  select json_build_object(
    'success', true,
    'codes_total',     (select count(*) from activation_codes),
    'codes_used',      (select count(*) from activation_codes where is_used),
    'codes_free',      (select count(*) from activation_codes where not is_used),
    'users_total',     (select count(*) from profiles),
    'users_activated', (select count(*) from profiles where is_activated),
    'games_played',    (select count(*) from game_results),
    'failed_activations_24h',
      (select count(*) from activation_attempts where not succeeded and attempted_at > now() - interval '24 hours'),
    'failed_logins_24h',
      (select count(*) from auth_attempts where kind = 'login' and not succeeded and attempted_at > now() - interval '24 hours'),
    'top_offenders',
      (select coalesce(json_agg(t), '[]'::json) from (
         select coalesce(ip, 'غير معروف') as ip, count(*) as fails
           from auth_attempts
          where not succeeded and attempted_at > now() - interval '24 hours'
          group by ip order by count(*) desc limit 5
       ) t)
  ) into v;
  return v;
end;
$$;

create or replace function public.admin_find_code(p_pass text, p_query text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_norm text; v json;
begin
  if not is_admin(p_pass) then
    return json_build_object('success', false, 'message', 'كلمة مرور الإدارة غلط');
  end if;

  v_norm := upper(regexp_replace(coalesce(p_query, ''), '[^0-9A-Za-z]', '', 'g'));

  select json_build_object('success', true, 'rows', coalesce(json_agg(t), '[]'::json)) into v
  from (
    select code, is_used, user_email, created_at
      from activation_codes
     where upper(regexp_replace(code, '[^0-9A-Za-z]', '', 'g')) like '%' || v_norm || '%'
        or coalesce(user_email,'') ilike '%' || p_query || '%'
     order by created_at desc, code
     limit 50
  ) t;
  return v;
end;
$$;

create or replace function public.admin_revoke_code(p_pass text, p_code text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_owner text;
begin
  if not is_admin(p_pass) then
    return json_build_object('success', false, 'message', 'كلمة مرور الإدارة غلط');
  end if;

  select user_email into v_owner from activation_codes where code = p_code;
  if not found then
    return json_build_object('success', false, 'message', 'الكود غير موجود');
  end if;

  update activation_codes set is_used = false, user_email = null where code = p_code;
  if v_owner is not null then
    update profiles set is_activated = false, license_key = null where username ilike v_owner;
  end if;

  return json_build_object('success', true, 'message', 'تم إلغاء تفعيل الكود');
end;
$$;

create or replace function public.admin_reset_user_password(p_pass text, p_username text, p_new_password text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not is_admin(p_pass) then
    return json_build_object('success', false, 'message', 'كلمة مرور الإدارة غلط');
  end if;
  if length(coalesce(p_new_password,'')) < 4 then
    return json_build_object('success', false, 'message', 'كلمة المرور لازم ٤ حروف على الأقل');
  end if;
  if not exists (select 1 from profiles where username ilike p_username) then
    return json_build_object('success', false, 'message', 'المستخدم غير موجود');
  end if;

  update profiles set password_hash = crypt(p_new_password, gen_salt('bf')) where username ilike p_username;
  return json_build_object('success', true, 'message', 'تم تغيير كلمة مرور المستخدم');
end;
$$;

create or replace function public.admin_recent_attempts(p_pass text)
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
    select kind, identifier, coalesce(ip,'—') as ip, succeeded, attempted_at
      from auth_attempts
     order by attempted_at desc
     limit 40
  ) t;
  return v;
end;
$$;

-- ============================================================
-- الصلاحيات
-- ============================================================
grant execute on function public.register_user(text, text)                        to anon;
grant execute on function public.login_user(text, text)                           to anon;
grant execute on function public.issue_recovery_code(text, text)                  to anon;
grant execute on function public.reset_password_with_code(text, text, text)       to anon;
grant execute on function public.save_game_result(text,text,text,text,int,int,int,int,int,int,text,int,numeric) to anon;
grant execute on function public.my_game_history(text)                            to anon;
grant execute on function public.admin_set_password(text, text)                   to anon;
grant execute on function public.admin_overview(text)                             to anon;
grant execute on function public.admin_find_code(text, text)                      to anon;
grant execute on function public.admin_revoke_code(text, text)                    to anon;
grant execute on function public.admin_reset_user_password(text, text, text)      to anon;
grant execute on function public.admin_recent_attempts(text)                      to anon;
-- request_ip / is_admin / gen_recovery_code داخلية فقط — لا تُمنح لـ anon
