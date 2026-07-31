// ============================================================
// مستورد الأسئلة — خمّن صح
// يحوّل ملف CSV (مُصدَّر من Excel) إلى INSERT جاهز لـ Supabase
//
// التشغيل:
//   node import_questions.js questions.csv          -> إضافة أسئلة جديدة
//   node import_questions.js questions.csv --replace -> استبدال كل الأسئلة
//   node import_questions.js --template              -> إنشاء ملف نموذج
//
// المخرجات: questions_import.sql
//
// أعمدة CSV المطلوبة:
//   question, category, a1, p1, a2, p2, ... a6, p6
// (الإجابات من ٢ إلى ٦، والنقاط أرقام صحيحة)
// ============================================================

const fs = require('fs');

const MAX_ANSWERS = 6;
const MIN_ANSWERS = 2;
const OUT = 'questions_import.sql';

// ---------- CSV parser (يتعامل مع الاقتباس والفواصل داخل النص) ----------
function parseCSV(text) {
  text = text.replace(/^﻿/, '');           // BOM من Excel
  const rows = [];
  let row = [], field = '', quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (quoted) {
      if (c === '"' && next === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

// ---------- template ----------
if (process.argv.includes('--template')) {
  const head = ['question', 'category'];
  for (let i = 1; i <= MAX_ANSWERS; i++) head.push('a' + i, 'p' + i);
  const sample = [
    'اذكر شيء تشوفه في الشارع', 'عامة',
    'سيارات', '30', 'ناس', '25', 'أشجار', '18', 'إشارات', '12', 'محلات', '10', 'قطط', '5',
  ];
  fs.writeFileSync('questions_template.csv', '﻿' + head.join(',') + '\n' + sample.map(csvCell).join(',') + '\n', 'utf8');
  console.log('تم إنشاء questions_template.csv — افتحه في Excel وعبّيه ثم احفظه بصيغة CSV UTF-8');
  process.exit(0);
}

function csvCell(v) {
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// ---------- input ----------
const file = process.argv[2];
const replaceAll = process.argv.includes('--replace');

if (!file) {
  console.error('الاستخدام: node import_questions.js <ملف.csv> [--replace]');
  console.error('       أو: node import_questions.js --template');
  process.exit(1);
}
if (!fs.existsSync(file)) {
  console.error('الملف غير موجود: ' + file);
  process.exit(1);
}

const rows = parseCSV(fs.readFileSync(file, 'utf8'));
if (rows.length < 2) {
  console.error('الملف فاضي أو ما فيه إلا صف العناوين');
  process.exit(1);
}

const header = rows[0].map(h => h.trim().toLowerCase());
const col = name => header.indexOf(name);
if (col('question') === -1) {
  console.error('ما لقيت عمود "question" في صف العناوين');
  console.error('العناوين الموجودة: ' + header.join(', '));
  process.exit(1);
}

// ---------- validate + build ----------
const out = [], errors = [];

rows.slice(1).forEach((r, idx) => {
  const line = idx + 2;                          // رقم السطر في الملف الأصلي
  const cell = n => { const i = col(n); return i === -1 ? '' : (r[i] || '').trim(); };

  const question = cell('question');
  const category = cell('category') || 'عامة';
  if (!question) { errors.push('سطر ' + line + ': السؤال فاضي'); return; }

  const answers = [];
  for (let i = 1; i <= MAX_ANSWERS; i++) {
    const t = cell('a' + i), p = cell('p' + i);
    if (!t && !p) continue;
    if (!t) { errors.push('سطر ' + line + ': الإجابة ' + i + ' فاضية لكن نقاطها مكتوبة'); return; }
    const pts = Number(p);
    if (!Number.isFinite(pts) || pts <= 0) {
      errors.push('سطر ' + line + ': نقاط الإجابة ' + i + ' لازم رقم أكبر من صفر (الموجود: "' + p + '")');
      return;
    }
    answers.push({ t, p: Math.round(pts) });
  }

  if (answers.length < MIN_ANSWERS) {
    errors.push('سطر ' + line + ': لازم ' + MIN_ANSWERS + ' إجابات على الأقل (الموجود: ' + answers.length + ')');
    return;
  }

  // اللعبة تعرض الإجابات بترتيب النقاط تنازلياً
  answers.sort((a, b) => b.p - a.p);
  out.push({ question, category, answers });
});

if (errors.length) {
  console.error('\nفيه ' + errors.length + ' خطأ — ما تم إنشاء أي ملف:\n');
  errors.slice(0, 25).forEach(e => console.error('  ' + e));
  if (errors.length > 25) console.error('  ... و ' + (errors.length - 25) + ' خطأ آخر');
  process.exit(1);
}

// dollar-quoting ($$) مثل questions-sql.sql — يتجنب مشاكل علامات الاقتباس في النص العربي.
// لو النص نفسه فيه $$ نستخدم وسماً فريداً بدلاً منه.
function dollarQuote(s) {
  if (!s.includes('$$')) return '$$' + s + '$$';
  let tag = 'q1';
  while (s.includes('$' + tag + '$')) tag += '1';
  return '$' + tag + '$' + s + '$' + tag + '$';
}

const values = out.map(o =>
  '  (' + dollarQuote(o.question) + ', ' +
  dollarQuote(JSON.stringify(o.answers)) + ', ' +
  dollarQuote(o.category) + ')'
).join(',\n');

const sql =
`-- ${out.length} سؤال — وُلِّد ${new Date().toISOString().slice(0, 10)} من ${file}
-- شغّله في: Supabase Dashboard > SQL Editor > New query
${replaceAll ? `
-- ⚠️ وضع الاستبدال: يمسح كل الأسئلة الحالية قبل الإدخال.
--    لو تبي الإضافة فقط، أعد التوليد بدون --replace
delete from public.questions;
` : ''}
insert into public.questions (question, answers, category) values
${values};
`;

fs.writeFileSync(OUT, sql, 'utf8');

const cats = {};
out.forEach(o => cats[o.category] = (cats[o.category] || 0) + 1);

console.log('تم توليد ' + OUT);
console.log('  الأسئلة: ' + out.length);
console.log('  التصنيفات: ' + Object.entries(cats).map(([k, v]) => k + ' (' + v + ')').join('، '));
console.log('  الوضع: ' + (replaceAll ? 'استبدال الكل ⚠️' : 'إضافة'));
