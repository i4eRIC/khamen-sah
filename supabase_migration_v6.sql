-- ============================================================
-- خمّن صح — Migration v6: توليد وتصدير أكواد التفعيل من لوحة الإدارة
-- شغّله مرة واحدة في: Supabase Dashboard > SQL Editor > New query
--
-- الهدف: قاعدة البيانات تصير المرجع الوحيد للأكواد.
-- قبل هذا الترحيل كان التوليد يصير في generate_codes.js ويكتب ملفين نصيين
-- يُستثنيان من المستودع — فأي تشغيل ثانٍ يمسح اللي قبله بلا رجعة، والملف
-- المحلي هو السجل الوحيد. بعده: التوليد داخل القاعدة، والتصدير عند الطلب.
-- ============================================================

-- ===== عمود الدفعة =====
-- يسمح بتجميع الأكواد حسب وقت توليدها، فتقدر تصدّر دفعة بعينها بدل الكل.
-- الأكواد القديمة تبقى بـ null وهذا مقصود: ما نلفّق لها دفعة ما كانت موجودة.
alter table public.activation_codes
  add column if not exists batch text;

create index if not exists activation_codes_batch_idx
  on public.activation_codes (batch);

-- ===== قيد الفرادة على الكود =====
-- الجدول أُنشئ من واجهة Supabase قبل هذه الترحيلات، فوجود القيد غير مضمون.
-- التوليد أدناه يعتمد عليه ليعرف أن الكود جديد فعلاً، وبدونه يمكن أن يتكرر
-- كود بصمت. الإنشاء هنا يفشل لو كان في الجدول تكرار قائم — وهذا مقصود:
-- الأفضل أن تعرف بالتكرار الآن لا أن تكتشفه عند التفعيل.
create unique index if not exists activation_codes_code_key
  on public.activation_codes (code);


-- ============================================================
-- توليد أكواد جديدة
-- ============================================================
-- الأبجدية Crockford Base32 — بلا I و L و O و U، نفس المستخدمة في
-- generate_codes.js بالضبط، فالأكواد القديمة والجديدة من نفس العائلة.
-- (I/L يلتبسان مع 1، و O مع 0، و U محذوف تفادياً لتكوين كلمات غير لائقة)
create or replace function public.admin_generate_codes(
  p_pass  text,
  p_count int,
  p_batch text default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_blocked  constant text[] := array['FCK','SHT','AS5','D1CK','SEX','XXX'];
  v_batch    text;
  v_code     text;
  v_flat     text;
  v_made     int := 0;
  v_guard    int := 0;
  v_i        int;
  v_new      text[] := '{}';
  v_bad      boolean;
begin
  if not is_admin(p_pass) then
    return json_build_object('success', false, 'message', 'كلمة مرور الإدارة غلط');
  end if;

  -- حدّ أعلى مقصود: التوليد يصير داخل معاملة واحدة، ودفعة ضخمة تقفل الجدول
  -- مدة أطول من اللازم. لو تبي أكثر، ولّد على دفعات.
  if p_count is null or p_count < 1 or p_count > 10000 then
    return json_build_object('success', false, 'message', 'العدد لازم بين ١ و ١٠٠٠٠');
  end if;

  v_batch := coalesce(nullif(trim(p_batch), ''), to_char(now(), 'YYYY-MM-DD_HH24MI'));

  while v_made < p_count loop
    v_guard := v_guard + 1;
    if v_guard > p_count * 100 then
      return json_build_object('success', false, 'message', 'تعذّر توليد العدد المطلوب');
    end if;

    -- gen_random_bytes آمن تشفيرياً. لا تستبدله بـ random() — الأكواد مفاتيح
    -- تفعيل، ومولّد عشوائي متوقَّع يعني أكواداً قابلة للتخمين.
    v_code := '';
    for v_i in 1..10 loop
      v_code := v_code || substr(v_alphabet, (get_byte(gen_random_bytes(1), 0) % 32) + 1, 1);
      if v_i = 5 then v_code := v_code || '-'; end if;
    end loop;

    v_flat := replace(v_code, '-', '');
    v_bad := false;
    for v_i in 1..array_length(v_blocked, 1) loop
      if position(v_blocked[v_i] in v_flat) > 0 then v_bad := true; exit; end if;
    end loop;
    if v_bad then continue; end if;

    -- on conflict يحمي من التصادم مع كود موجود مسبقاً: الصف يُتجاهل، و found
    -- تصير false، فما نعدّه ولا نضيفه للمخرجات وتكمل الحلقة. بهذا يطلع العدد
    -- النهائي مضبوطاً دائماً حتى لو صار تصادم.
    insert into activation_codes (code, is_used, batch)
    values (v_code, false, v_batch)
    on conflict (code) do nothing;

    if found then
      v_made := v_made + 1;
      v_new := array_append(v_new, v_code);
    end if;
  end loop;

  return json_build_object(
    'success', true,
    'message', 'تم توليد ' || v_made || ' كود',
    'batch',   v_batch,
    'count',   v_made,
    'codes',   to_json(v_new)
  );
end;
$$;


-- ============================================================
-- تصدير الأكواد
-- ============================================================
-- p_scope: 'all' | 'free' | 'used'
-- p_batch: اسم دفعة بعينها، أو null لكل الدفعات
create or replace function public.admin_export_codes(
  p_pass  text,
  p_scope text default 'free',
  p_batch text default null
)
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

  if p_scope not in ('all', 'free', 'used') then
    return json_build_object('success', false, 'message', 'نطاق غير معروف');
  end if;

  select json_build_object(
    'success', true,
    'scope',   p_scope,
    'batch',   p_batch,
    'count',   count(*),
    'rows',    coalesce(json_agg(t order by t.created_at, t.code), '[]'::json)
  ) into v
  from (
    select code, is_used, user_email, batch, created_at
      from activation_codes
     where (p_scope = 'all'
            or (p_scope = 'free' and not is_used)
            or (p_scope = 'used' and is_used))
       and (p_batch is null or batch = p_batch)
  ) t;

  return v;
end;
$$;


-- ============================================================
-- قائمة الدفعات
-- ============================================================
create or replace function public.admin_list_batches(p_pass text)
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

  select json_build_object('success', true, 'rows', coalesce(json_agg(t order by t.first_at desc), '[]'::json)) into v
  from (
    select coalesce(batch, '(قبل الترحيل)') as batch,
           count(*)                          as total,
           count(*) filter (where not is_used) as free,
           min(created_at)                   as first_at
      from activation_codes
     group by batch
  ) t;

  return v;
end;
$$;


-- ===== الصلاحيات =====
-- كلها security definer وتتحقق من كلمة مرور الإدارة في أول سطر، فالدور
-- المجهول يقدر يناديها لكن ما يقدر ينفّذ شي بدون كلمة المرور الصحيحة.
grant execute on function public.admin_generate_codes(text, int, text) to anon, authenticated;
grant execute on function public.admin_export_codes(text, text, text)  to anon, authenticated;
grant execute on function public.admin_list_batches(text)              to anon, authenticated;
