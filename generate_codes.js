// ============================================================
// مولّد أكواد التفعيل — خمّن صح
// الصيغة: XXXXX-XXXXX  (مثال: 7F4K9-2MXQ3)
//
// التشغيل:  node generate_codes.js [العدد]
// المخرجات: codes.txt  (قائمة للتوزيع)
//           codes.sql  (INSERT جاهز لـ Supabase SQL Editor)
// ============================================================

const crypto = require('crypto');
const fs = require('fs');

// Crockford Base32 — بدون I و L و O و U
// (I/L يلتبسون مع 1، و O مع 0، و U محذوف تفادياً لتكوين كلمات غير لائقة)
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const GROUP_LEN = 5;
const GROUPS = 2;

const HOW_MANY = parseInt(process.argv[2], 10) || 500;

// مقاطع نتجنب ظهورها داخل الكود
const BLOCKED = ['FCK', 'SHT', 'AS5', 'D1CK', 'SEX', 'XXX'];

function randomGroup() {
  let out = '';
  for (let i = 0; i < GROUP_LEN; i++) {
    // randomInt آمن تشفيرياً — لا تستخدم Math.random لمفاتيح التفعيل
    out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  }
  return out;
}

function makeCode() {
  const parts = [];
  for (let i = 0; i < GROUPS; i++) parts.push(randomGroup());
  return parts.join('-');
}

function isClean(code) {
  const flat = code.replace(/-/g, '');
  return !BLOCKED.some(bad => flat.includes(bad));
}

// ===== التوليد =====
const codes = new Set();
let guard = 0;
while (codes.size < HOW_MANY) {
  if (++guard > HOW_MANY * 100) throw new Error('تعذّر توليد العدد المطلوب');
  const code = makeCode();
  if (isClean(code)) codes.add(code);
}

const list = [...codes];

// ===== الملف النصي =====
fs.writeFileSync('codes.txt', list.join('\n') + '\n', 'utf8');

// ===== ملف SQL =====
const escaped = list.map(c => `  ('${c}', false)`).join(',\n');
const sql = `-- ${list.length} كود تفعيل — وُلِّدت ${new Date().toISOString().slice(0, 10)}
-- الصيغة: XXXXX-XXXXX (Crockford Base32)
-- شغّلها مرة واحدة في: Supabase Dashboard > SQL Editor > New query

insert into public.activation_codes (code, is_used) values
${escaped}
on conflict do nothing;
`;
fs.writeFileSync('codes.sql', sql, 'utf8');

console.log(`تم توليد ${list.length} كود`);
console.log(`  codes.txt  — قائمة للتوزيع`);
console.log(`  codes.sql  — جاهز لـ Supabase`);
console.log(`\nعينة:`);
list.slice(0, 5).forEach(c => console.log('  ' + c));
