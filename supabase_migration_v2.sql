-- ============================================================
-- خمّن صح — Migration v2: حد المحاولات + تطبيع الكود
-- شغّلها مرة واحدة في: Supabase Dashboard > SQL Editor > New query
-- (آمنة للتكرار — كلها create if not exists / create or replace)
-- ============================================================

-- ===== جدول تسجيل المحاولات =====
-- نسجّل كل محاولة تفعيل عشان نقدر نعدّ الفاشلة ونوقف السكربتات.
create table if not exists public.activation_attempts (
  id           bigserial primary key,
  identifier   text        not null,   -- اسم المستخدم اللي حاول
  ip           text,                   -- عنوان الطلب (من هيدرات PostgREST)
  attempted_at timestamptz not null default now(),
  succeeded    boolean     not null default false
);

create index if not exists activation_attempts_by_user
  on public.activation_attempts (identifier, attempted_at desc);
create index if not exists activation_attempts_by_ip
  on public.activation_attempts (ip, attempted_at desc);

-- RLS مفعّل بدون أي policy = لا أحد يقرأ أو يكتب مباشرة.
-- الوصول الوحيد عبر activate_code أدناه (security definer).
alter table public.activation_attempts enable row level security;

-- ===== ACTIVATE LICENSE CODE (بحد للمحاولات) =====
create or replace function public.activate_code(p_code text, p_email text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row      activation_codes%rowtype;
  v_code     text;
  v_ip       text;
  v_by_user  int;
  v_by_ip    int;
  -- السقوف: محاولات فاشلة خلال آخر ساعة
  c_max_user constant int := 10;
  c_max_ip   constant int := 30;
begin
  -- ---------- تطبيع الكود ----------
  -- نشيل أي شي مو حرف أو رقم (مسافات، شرطات زايدة، شرطة النسخ الطويلة)،
  -- نحوّل لحروف كبيرة، ثم نعيد تركيب الصيغة XXXXX-XXXXX.
  -- هذا يحمي حتى لو نودي على الدالة من خارج الموقع.
  v_code := upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'));
  if length(v_code) = 10 then
    v_code := substr(v_code, 1, 5) || '-' || substr(v_code, 6, 5);
  end if;

  -- ---------- عنوان الطلب ----------
  -- PostgREST يمرر هيدرات الطلب كـ JSON. نلف العملية بـ exception
  -- لأن الإعداد ما يكون موجود لما تُنادى الدالة من SQL Editor مباشرة.
  begin
    v_ip := split_part(
      coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''),
      ',', 1
    );
  exception when others then
    v_ip := '';
  end;
  if v_ip = '' then v_ip := null; end if;

  -- ---------- فحص الحد ----------
  select count(*) into v_by_user
    from activation_attempts
   where identifier = lower(coalesce(p_email, ''))
     and not succeeded
     and attempted_at > now() - interval '1 hour';

  if v_ip is null then
    v_by_ip := 0;
  else
    select count(*) into v_by_ip
      from activation_attempts
     where ip = v_ip
       and not succeeded
       and attempted_at > now() - interval '1 hour';
  end if;

  if v_by_user >= c_max_user or v_by_ip >= c_max_ip then
    return json_build_object(
      'success', false,
      'rate_limited', true,
      'message', 'محاولات كثيرة — انتظر ساعة وحاول مرة ثانية ⏳'
    );
  end if;

  -- ---------- تنظيف دوري ----------
  -- نحذف السجلات الأقدم من ٧ أيام، لكن في ١٪ من النداءات فقط
  -- عشان ما نثقّل كل عملية تفعيل.
  if random() < 0.01 then
    delete from activation_attempts where attempted_at < now() - interval '7 days';
  end if;

  -- ---------- البحث عن الكود ----------
  select * into v_row from activation_codes where code = v_code limit 1;

  if v_row.code is null then
    insert into activation_attempts (identifier, ip, succeeded)
    values (lower(coalesce(p_email, '')), v_ip, false);
    return json_build_object('success', false, 'message', 'الكود غير صحيح ❌');
  end if;

  if v_row.is_used then
    if v_row.user_email = p_email then
      -- نفس صاحب الكود — مو محاولة فاشلة، ما نسجّلها ضده
      return json_build_object('success', true, 'message', 'الكود مفعّل لحسابك ✅');
    end if;
    insert into activation_attempts (identifier, ip, succeeded)
    values (lower(coalesce(p_email, '')), v_ip, false);
    return json_build_object('success', false, 'message', 'هذا الكود مستخدم من حساب ثاني ⚠️');
  end if;

  -- ---------- تفعيل ناجح ----------
  update activation_codes set is_used = true, user_email = p_email where code = v_code;
  update profiles set is_activated = true, license_key = v_code where username ilike p_email;

  insert into activation_attempts (identifier, ip, succeeded)
  values (lower(coalesce(p_email, '')), v_ip, true);

  return json_build_object('success', true, 'message', 'تم التفعيل بنجاح! 🚀✅');
end;
$$;

grant execute on function public.activate_code(text, text) to anon;
