-- ============================================================
-- خمّن صح — Migration v5: الدخول باسم المستخدم أو البريد
--
-- شغّلها في: Supabase Dashboard > SQL Editor > New query
-- آمنة للتكرار. لا تلمس أي بيانات — تستبدل تعريف دالة واحدة فقط.
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
  v_id       text;
  v_by_user  int;
  v_by_ip    int;
  c_max_user constant int := 8;
  c_max_ip   constant int := 40;
begin
  -- p_username يقبل الآن اسم المستخدم أو البريد.
  select * into v_row
    from profiles
   where username ilike p_username
      or (email is not null and lower(email) = lower(coalesce(p_username, '')))
   limit 1;

  -- المفتاح الذي يُحسب عليه الحد هو اسم المستخدم الحقيقي، لا ما كتبه المستخدم.
  -- لو عددنا 'bob' و 'bob@mail.com' كمعرّفين منفصلين، يكفي المهاجم أن يبدّل
  -- بينهما ليحصل على رصيد محاولات جديد بعد كل قفل — أي مضاعفة الرصيد مجاناً.
  v_id := lower(coalesce(v_row.username, p_username, ''));

  select count(*) into v_by_user
    from auth_attempts
   where kind = 'login' and identifier = v_id
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

  if v_row.username is null or v_row.password_hash <> crypt(p_password, v_row.password_hash) then
    insert into auth_attempts (kind, identifier, ip, succeeded)
    values ('login', v_id, v_ip, false);
    -- رسالة واحدة للحالتين: لو فرّقنا بين "الحساب غير موجود" و"كلمة المرور غلط"
    -- لصار بالإمكان استخدام شاشة الدخول لمعرفة أي بريد مسجّل عندك.
    return json_build_object('success', false, 'message', 'بيانات الدخول غير صحيحة');
  end if;

  insert into auth_attempts (kind, identifier, ip, succeeded)
  values ('login', v_id, v_ip, true);

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
-- الاسترجاع يقبل المعرّفين كذلك
-- ============================================================
-- بدون هذا يصير التناقض: يدخل اللاعب ببريده، ثم تطلب منه شاشة الاسترجاع
-- اسم مستخدم قد لا يتذكره أصلاً.
create or replace function public.reset_password_with_code(p_username text, p_code text, p_new_password text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row   profiles%rowtype;
  v_ip    text := request_ip();
  v_id    text;
  v_fails int;
  v_norm  text;
begin
  v_norm := upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'));
  if length(v_norm) = 10 then
    v_norm := substr(v_norm, 1, 5) || '-' || substr(v_norm, 6, 5);
  end if;

  select * into v_row
    from profiles
   where username ilike p_username
      or (email is not null and lower(email) = lower(coalesce(p_username, '')))
   limit 1;

  v_id := lower(coalesce(v_row.username, p_username, ''));

  select count(*) into v_fails
    from auth_attempts
   where kind = 'reset' and identifier = v_id
     and not succeeded and attempted_at > now() - interval '1 hour';
  if v_fails >= 5 then
    return json_build_object('success', false, 'rate_limited', true,
      'message', 'محاولات كثيرة — انتظر ساعة ⏳');
  end if;

  if length(coalesce(p_new_password,'')) < 4 then
    return json_build_object('success', false, 'message', 'كلمة المرور لازم ٤ حروف على الأقل');
  end if;

  if v_row.username is null or v_row.recovery_hash is null
     or v_row.recovery_hash <> crypt(v_norm, v_row.recovery_hash) then
    insert into auth_attempts (kind, identifier, ip, succeeded)
    values ('reset', v_id, v_ip, false);
    return json_build_object('success', false, 'message', 'بيانات الاسترجاع غير صحيحة ❌');
  end if;

  update profiles
     set password_hash = crypt(p_new_password, gen_salt('bf', 10)),
         recovery_hash = null
   where username = v_row.username;

  insert into auth_attempts (kind, identifier, ip, succeeded)
  values ('reset', v_id, v_ip, true);

  return json_build_object('success', true, 'message', 'تم تغيير كلمة المرور — سجّل دخولك الآن ✅');
end;
$$;

grant execute on function public.login_user(text, text)                     to anon, authenticated;
grant execute on function public.reset_password_with_code(text, text, text) to anon, authenticated;
