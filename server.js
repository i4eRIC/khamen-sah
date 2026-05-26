const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const path = require('path');
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Supabase
const supabaseUrl = 'https://jydohcccucwwnxgbdyqu.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5ZG9oY2NjdWN3d254Z2JkeXF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNDU4MTEsImV4cCI6MjA4OTkyMTgxMX0.hgrBBF4wRtQEWGpwngOm5lN5A_fqIRisLXQxwEzLyDQ';
const supabase = createClient(supabaseUrl, supabaseKey);

// ===== AUTH: تسجيل حساب =====
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || username.length < 3)
      return res.status(400).json({ success: false, message: 'اسم المستخدم لازم ٣ حروف على الأقل' });
    if (!password || password.length < 4)
      return res.status(400).json({ success: false, message: 'كلمة المرور لازم ٤ حروف على الأقل' });

    const { data: existing } = await supabase
      .from('profiles').select('id').ilike('username', username).single();
    if (existing)
      return res.status(409).json({ success: false, message: 'اسم المستخدم محجوز — اختر اسم ثاني' });

    const password_hash = await bcrypt.hash(password, 12);
    const { data, error } = await supabase
      .from('profiles')
      .insert({ username, password_hash, is_activated: false, license_key: null, trial_used: 0 })
      .select().single();

    if (error) { console.error('DB Error:', error); return res.status(500).json({ success: false, message: error.message }); }

    res.json({
      success: true, message: 'تم إنشاء الحساب!',
      user: { id: data.id, username: data.username, is_activated: false, license_key: null, trial_used: 0 }
    });
  } catch (err) {
    console.error('Register:', err);
    res.status(500).json({ success: false, message: 'حدث خطأ' });
  }
});

// ===== AUTH: تسجيل دخول =====
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ success: false, message: 'ادخل اسم المستخدم وكلمة المرور' });

    const { data, error } = await supabase
      .from('profiles').select('*').ilike('username', username).single();
    if (error || !data)
      return res.status(401).json({ success: false, message: 'اسم المستخدم أو كلمة المرور غلط' });

    const valid = await bcrypt.compare(password, data.password_hash);
    if (!valid)
      return res.status(401).json({ success: false, message: 'اسم المستخدم أو كلمة المرور غلط' });

    res.json({
      success: true, message: 'تم تسجيل الدخول',
      user: { id: data.id, username: data.username, is_activated: data.is_activated, license_key: data.license_key, trial_used: data.trial_used }
    });
  } catch (err) {
    console.error('Login:', err);
    res.status(500).json({ success: false, message: 'حدث خطأ' });
  }
});

// ===== AUTH: تحديث التجربة =====
app.post('/api/auth/update-trial', async (req, res) => {
  try {
    const { username, trial_used } = req.body;
    await supabase.from('profiles').update({ trial_used }).ilike('username', username);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

// ===== LICENSE: تفعيل كود =====
app.post('/api/activate', async (req, res) => {
  const { code, email } = req.body;
  if (!code || !email)
    return res.status(400).json({ success: false, message: "ادخل الكود واسم المستخدم" });

  const { data, error } = await supabase
    .from('activation_codes').select('*').eq('code', code).single();
  if (error || !data)
    return res.json({ success: false, message: "الكود غير صحيح ❌" });

  if (data.is_used) {
    if (data.user_email === email)
      return res.json({ success: true, message: "الكود مفعّل لحسابك ✅" });
    return res.json({ success: false, message: "هذا الكود مستخدم من حساب ثاني ⚠️" });
  }

  await supabase.from('activation_codes').update({ is_used: true, user_email: email }).eq('code', code);
  await supabase.from('profiles').update({ is_activated: true, license_key: code }).ilike('username', email);

  console.log(`🔑 ${code} activated by ${email}`);
  res.json({ success: true, message: "تم التفعيل بنجاح! 🚀✅" });
});

// ===== LICENSE: إلغاء تفعيل =====
app.post('/api/deactivate', async (req, res) => {
  const { code, email } = req.body;
  if (!code) return res.status(400).json({ success: false });

  await supabase.from('activation_codes').update({ is_used: false, user_email: null }).eq('code', code);
  if (email) await supabase.from('profiles').update({ is_activated: false, license_key: null }).ilike('username', email);

  console.log(`🔓 ${code} deactivated`);
  res.json({ success: true, message: "تم إلغاء التفعيل" });
});

// ===== QUESTIONS =====
app.get('/api/questions', async (req, res) => {
  const { data, error } = await supabase.from('questions').select('*');
  if (error) return res.status(500).json(error);
  res.json(data);
});

// ===== HEALTH =====
app.get('/api/health', (req, res) => res.json({ status: 'ok', game: 'خمّن صح' }));

// SPA
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════╗
║       🎮 خمّن صح — Server           ║
║  http://localhost:${PORT}                ║
║  ✅ Supabase Connected               ║
╚══════════════════════════════════════╝
  `);
});
