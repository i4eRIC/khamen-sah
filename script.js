// ========= SUPABASE CLIENT (shared: auth, activation, questions, buzzer) =========
const SUPABASE_URL = 'https://jydohcccucwwnxgbdyqu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5ZG9oY2NjdWN3d254Z2JkeXF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNDU4MTEsImV4cCI6MjA4OTkyMTgxMX0.hgrBBF4wRtQEWGpwngOm5lN5A_fqIRisLXQxwEzLyDQ';
let _sb = null;
function getSb(){
  if (!_sb) _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return _sb;
}

// ========= ICON HELPER =========
const EMOJI_ICON_MAP = {'🚪':'door','🔑':'key','🔄':'refresh','🗑️':'trash','🏠':'home','⚠️':'warning','🛡️':'shield'};
function iconSVG(name){ return '<svg class="icon"><use href="#i-'+name+'"></use></svg>'; }
function iconEl(name){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('class','icon');
  const use=document.createElementNS('http://www.w3.org/2000/svg','use');
  use.setAttribute('href','#i-'+name);
  svg.appendChild(use);
  return svg;
}

// ========= USER ACCOUNTS & LICENSE SYSTEM =========
const LICENSE = {
  currentKey: 'khamen_current_user',
  maxTrialQuestions: 1
};

// --- Session helpers (localStorage = cache only) ---
function getCurrentUser(){
  try{ return JSON.parse(localStorage.getItem(LICENSE.currentKey)) || null }catch(e){return null}
}
function saveCurrentUser(user){
  try{ localStorage.setItem(LICENSE.currentKey, JSON.stringify(user)) }catch(e){}
}
function getCurrentUsername(){ 
  const u = getCurrentUser();
  return u ? u.username : '';
}

// --- Auth Functions (through server API) ---
let authIsRegister = false;

async function authLogin(){
  const user = $('authUser').value.trim();
  const pass = $('authPass').value;
  if(!user || !pass) return authShowError('ادخل اسم المستخدم وكلمة المرور');

  try {
    const { data, error } = await getSb().rpc('login_user', { p_username: user, p_password: pass });
    if(!error && data && data.success){
      saveCurrentUser(data.user);
      // Pre-v4 accounts have no email, which also blocks Google linking. Ask once
      // per session rather than gating the game behind it.
      if(data.needs_email && !sessionStorage.getItem('emailPromptSeen')){
        sessionStorage.setItem('emailPromptSeen','1');
        openAddEmail(afterAuth);
        return;
      }
      afterAuth();
    } else {
      authShowError((data && data.message) || 'خطأ في اسم المستخدم أو كلمة المرور');
    }
  } catch(e){
    authShowError('فشل الاتصال بالسيرفر');
  }
}

async function authRegister(){
  const user = $('authUser').value.trim();
  const pass = $('authPass').value;
  const mail = $('authEmail').value.trim();
  if(!user || user.length < 3) return authShowError('اسم المستخدم لازم ٣ حروف على الأقل');
  if(!looksLikeEmail(mail)) return authShowError('ادخل بريداً إلكترونياً صحيحاً');
  if(!pass || pass.length < 4) return authShowError('كلمة المرور لازم ٤ حروف على الأقل');

  try {
    const { data, error } = await getSb().rpc('register_user', { p_username: user, p_password: pass, p_email: mail });
    if(!error && data && data.success){
      saveCurrentUser(data.user);
      // Only chance to show this — the server keeps a hash, not the code itself.
      // Hold the user on the auth screen until they dismiss it.
      if(data.recovery_code) showRecoveryCode(data.recovery_code, afterAuth);
      else afterAuth();
    } else {
      authShowError((data && data.message) || 'خطأ في التسجيل');
    }
  } catch(e){
    authShowError('فشل الاتصال بالسيرفر');
  }
}

// ========= ACCOUNT RECOVERY =========
let recoveryOnClose = null;

function showRecoveryCode(code, onClose){
  recoveryOnClose = onClose || null;
  $('recoveryCodeText').textContent = code;
  $('recoveryCopyBtn').innerHTML = iconSVG('download') + ' نسخ';
  $('recoveryModal').classList.add('show');
  AudioEngine.play('open');
}

function closeRecovery(){
  $('recoveryModal').classList.remove('show');
  AudioEngine.play('click');
  const cb = recoveryOnClose; recoveryOnClose = null;
  if(cb) cb();
}

function copyRecoveryCode(){
  const code = $('recoveryCodeText').textContent;
  const done = ()=>{ $('recoveryCopyBtn').innerHTML = iconSVG('check') + ' تم النسخ'; };
  // navigator.clipboard needs a secure context; fall back for plain http / file://
  if(navigator.clipboard && window.isSecureContext){
    navigator.clipboard.writeText(code).then(done).catch(fallbackCopy);
  } else fallbackCopy();

  function fallbackCopy(){
    try{
      const ta = document.createElement('textarea');
      ta.value = code; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove(); done();
    }catch(e){
      $('recoveryCopyBtn').innerHTML = iconSVG('warning') + ' انسخه يدوياً';
    }
  }
}

function openForgot(){
  $('fgUser').value = $('authUser').value.trim();
  $('fgCode').value = ''; $('fgPass').value = '';
  $('fgError').classList.add('hidden');
  $('forgotModal').classList.add('show');
  AudioEngine.play('open');
}

function closeForgot(){ $('forgotModal').classList.remove('show'); AudioEngine.play('close') }

async function submitForgot(){
  const user = $('fgUser').value.trim();
  const code = $('fgCode').value.trim();
  const pass = $('fgPass').value;
  const err  = $('fgError');
  const fail = m => { err.textContent = m; err.classList.remove('hidden'); AudioEngine.play('error') };

  if(!user || !code || !pass) return fail('❌ عبّي كل الحقول');
  if(pass.length < 4) return fail('❌ كلمة المرور لازم ٤ حروف على الأقل');
  err.classList.add('hidden');

  try{
    const { data, error } = await getSb().rpc('reset_password_with_code', {
      p_username: user, p_code: normalizeKey(code), p_new_password: pass
    });
    if(error) return fail('❌ فشل الاتصال بالسيرفر');
    if(!data || !data.success) return fail(data && data.message ? data.message : '❌ رمز غير صحيح');

    closeForgot();
    $('authUser').value = user; $('authPass').value = '';
    showModal('تم التغيير','✓','سجّل دخولك بكلمة المرور الجديدة');
  }catch(e){
    fail('❌ فشل الاتصال بالسيرفر');
  }
}

// ========= GOOGLE SIGN-IN =========
// Two identity systems coexist: the custom profiles/password login and Supabase
// Auth. Google only ever produces the second; google_bootstrap is what maps it
// onto a profiles row, matching an existing account by email when there is one.
async function googleSignIn(){
  try{
    // Land back on this same page rather than the site root, so a deployment
    // served from a subpath still returns to the game.
    const { error } = await getSb().auth.signInWithOAuth({
      provider:'google',
      options:{ redirectTo: window.location.origin + window.location.pathname }
    });
    if(error) authShowError('تعذّر فتح دخول قوقل — تأكد إن المزوّد مفعّل في Supabase');
  }catch(e){
    authShowError('تعذّر فتح دخول قوقل');
  }
}

// supabase-js consumes the OAuth fragment during createClient(), so by the time
// this runs the session already exists (or doesn't).
async function checkGoogleReturn(){
  try{
    const { data } = await getSb().auth.getSession();
    if(!data || !data.session) return;
    if(getCurrentUser()) return;   // already signed in locally — leave it alone
    await runGoogleBootstrap(null);
  }catch(e){}
}

async function runGoogleBootstrap(username){
  try{
    const { data, error } = await getSb().rpc('google_bootstrap', username ? { p_username: username } : {});
    if(error) return authShowError('فشل الاتصال بالسيرفر');

    if(data && data.success){
      closePickUser();
      saveCurrentUser(data.user);
      if(data.created)      showModal('أهلاً بك','✓','تم إنشاء حسابك عبر قوقل');
      else if(data.merged)  showModal('تم الربط','✓','ربطنا قوقل بحسابك الموجود');
      afterAuth();
      return;
    }
    if(data && data.needs_username) return openPickUser(data.email, data.suggested, data.message);
    authShowError((data && data.message) || 'تعذّر إكمال الدخول بقوقل');
  }catch(e){
    authShowError('فشل الاتصال بالسيرفر');
  }
}

function openPickUser(email, suggested, msg){
  $('pickUserEmail').textContent = email || '—';
  if(suggested && !$('pickUserInput').value) $('pickUserInput').value = suggested;
  const err = $('pickUserError');
  if(msg){ err.textContent = msg; err.classList.remove('hidden') } else err.classList.add('hidden');
  $('pickUserModal').classList.add('show');
}

function closePickUser(){ $('pickUserModal').classList.remove('show') }

async function cancelPickUser(){
  closePickUser();
  $('pickUserInput').value = '';
  // A half-finished Google session would re-open this picker on every reload.
  try{ await getSb().auth.signOut() }catch(e){}
}

async function submitPickUser(){
  const u = $('pickUserInput').value.trim();
  const err = $('pickUserError');
  if(u.length < 3){ err.textContent = 'اسم المستخدم لازم ٣ حروف على الأقل'; err.classList.remove('hidden'); return }
  await runGoogleBootstrap(u);
}

// ========= ADD EMAIL (pre-v4 accounts) =========
let addEmailOnDone = null;

function openAddEmail(onDone){
  addEmailOnDone = onDone || null;
  $('aeEmail').value = ''; $('aePass').value = '';
  $('aeError').classList.add('hidden');
  $('addEmailModal').classList.add('show');
}

function closeAddEmail(){
  $('addEmailModal').classList.remove('show');
  const cb = addEmailOnDone; addEmailOnDone = null;
  if(cb) cb();
}

async function submitAddEmail(){
  const mail = $('aeEmail').value.trim(), pass = $('aePass').value, err = $('aeError');
  const fail = m => { err.textContent = m; err.classList.remove('hidden'); AudioEngine.play('error') };
  if(!looksLikeEmail(mail)) return fail('❌ بريد إلكتروني غير صحيح');
  if(!pass) return fail('❌ ادخل كلمة مرورك للتأكيد');

  const name = getCurrentUsername();
  if(!name) return fail('❌ ما فيه حساب مسجّل');

  try{
    const { data, error } = await getSb().rpc('set_my_email', { p_username: name, p_password: pass, p_email: mail });
    if(error) return fail('❌ فشل الاتصال بالسيرفر');
    if(!data || !data.success) return fail(data && data.message ? data.message : '❌ فشل الحفظ');
    const u = getCurrentUser();
    if(u){ u.email = data.email; saveCurrentUser(u) }
    closeAddEmail();
  }catch(e){
    fail('❌ فشل الاتصال بالسيرفر');
  }
}

checkGoogleReturn();

function authLogout(){
  gameConfirm('متأكد تبي تسجل خروج؟', function(){
    localStorage.removeItem(LICENSE.currentKey);
    // Without this the Google session survives logout and checkGoogleReturn()
    // signs the same player straight back in on the next load.
    try{ getSb().auth.signOut() }catch(e){}
    sessionStorage.removeItem('emailPromptSeen');
    hideAllScreens();
    $('authScreen').classList.remove('hidden');
    authIsRegister=false;authToggleMode();authToggleMode();
    $('authUser').value='';$('authPass').value='';
  }, '🚪');
}

function hideAllScreens(){
  ['introScreen','authScreen','gateScreen','setupScreen','gameScreen','goScreen','editorScreen'].forEach(id=>{
    const el=$(id);if(el)el.classList.add('hidden');
  });
}

function afterAuth(){
  $('authScreen').classList.add('hidden');
  $('authError').classList.add('hidden');
  if(isLicensed()){
    $('setupScreen').classList.remove('hidden');
    updateNavKey();updateNavUser();
  } else {
    $('gateScreen').classList.remove('hidden');
    updateGateScreen();
  }
}

function authToggleMode(){
  authIsRegister = !authIsRegister;
  $('authTitle').textContent = authIsRegister ? 'إنشاء حساب جديد' : 'تسجيل الدخول';
  $('authMainBtn').textContent = authIsRegister ? 'إنشاء حساب' : 'دخول';
  $('authMainBtn').onclick = authIsRegister ? authRegister : authLogin;
  $('authSwitchText').textContent = authIsRegister ? 'عندك حساب؟' : 'ما عندك حساب؟';
  $('authSwitchBtn').textContent = authIsRegister ? 'تسجيل دخول' : 'إنشاء حساب جديد';
  $('authForgotRow').classList.toggle('hidden', authIsRegister);
  $('authEmailRow').classList.toggle('hidden', !authIsRegister);
  // Login accepts either identifier; registration is picking a username, so the
  // same field means two different things depending on the mode.
  $('authUserLabel').textContent = authIsRegister ? 'اسم المستخدم' : 'اسم المستخدم أو البريد';
  $('authUser').placeholder      = authIsRegister ? 'اختر اسم مستخدم' : 'اسم المستخدم أو البريد';
  $('authError').classList.add('hidden');
  $('authUser').value='';$('authPass').value='';$('authEmail').value='';
}

// Mirrors is_valid_email() in the database. The server check is the real gate;
// this one just avoids a round-trip for an obvious typo.
function looksLikeEmail(e){ return /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(String(e||'').trim()) }

function authShowError(msg){$('authError').textContent=msg;$('authError').classList.remove('hidden');AudioEngine.play('error')}

// --- License ---
function isLicensed(){
  const u = getCurrentUser();
  return !!(u && u.is_activated);
}

function getTrialUsed(){
  const u = getCurrentUser();
  return u ? u.trial_used || 0 : 0;
}

function setTrialUsed(n){
  const u = getCurrentUser();
  if(!u) return;
  u.trial_used = n;
  saveCurrentUser(u);
  // Update server too
  getSb().rpc('update_trial', { p_username: u.username, p_trial_used: n }).catch(()=>{});
}

// --- Normalize a typed key into XXXXX-XXXXX ---
// Users type keys by hand: Arabic-Indic digits when the keyboard is in Arabic mode,
// a space instead of the dash, no dash at all, or an en-dash pasted from chat.
// All of those are the *right* key — strip everything that isn't in the alphabet
// and rebuild the format so a paying user never sees "الكود غير صحيح".
function normalizeKey(raw){
  const digits = '٠١٢٣٤٥٦٧٨٩';
  const k = String(raw||'')
    .replace(/[٠-٩]/g, d => digits.indexOf(d))
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '');
  return k.length === 10 ? k.slice(0,5) + '-' + k.slice(5) : k;
}

// --- API: Activate key ---
async function activateKeyAPI(key){
  const k = normalizeKey(key);
  const name = getCurrentUsername();
  if(!name) return 'error';
  try {
    const { data, error } = await getSb().rpc('activate_code', { p_code: k, p_email: name });
    if(error) return 'error';
    if(data.success){
      // Update local cache
      const u = getCurrentUser();
      if(u){ u.is_activated = true; u.license_key = k; saveCurrentUser(u); }
      return 'ok';
    }
    if(data.rate_limited) return 'limited';
    if(data.message && data.message.includes('حساب ثاني')) return 'used';
    if(data.message && data.message.includes('مستخدم')) return 'used';
    return 'invalid';
  } catch(err){
    return 'error';
  }
}

function removeLicense(){
  const u = getCurrentUser();
  if(!u || !u.license_key) return;
  const oldKey = u.license_key;
  u.is_activated = false;
  u.license_key = '';
  saveCurrentUser(u);
  getSb().rpc('deactivate_code', { p_code: oldKey, p_email: u.username }).catch(()=>{});
}

// --- Gate screen ---
function checkLicenseForPlay(){
  if(isLicensed())return true;
  const used=getTrialUsed();
  if(used<LICENSE.maxTrialQuestions)return true;
  $('setupScreen').classList.add('hidden');
  $('gateScreen').classList.remove('hidden');
  updateGateScreen();
  return false;
}

function showLicenseModal(){
  $('setupScreen').classList.add('hidden');
  $('gateScreen').classList.remove('hidden');
  updateGateScreen();
}

function updateGateScreen(){
  $('gateUsername').textContent=getCurrentUsername();
  const used=getTrialUsed();
  const remaining=Math.max(0,LICENSE.maxTrialQuestions-used);
  const info=$('gateTrialInfo');
  const btn=$('gateTrialBtn');
  if(remaining>0){
    info.textContent='🎁 متبقي '+ar(remaining)+' سؤال مجاني';
    btn.disabled=false;btn.textContent='جرّب الآن! 🎮';
  } else {
    info.textContent='⚠️ انتهت التجربة المجانية';
    btn.disabled=true;btn.textContent='انتهت التجربة';
  }
  $('gateError').classList.add('hidden');
  $('gateKeyInput').value='';
}

async function gateActivate(){
  const input=$('gateKeyInput').value.trim();
  if(!input){$('gateError').textContent='❌ ادخل مفتاح التفعيل';$('gateError').classList.remove('hidden');return}
  $('gateError').classList.add('hidden');
  const result=await activateKeyAPI(input);
  if(result==='ok'){
    $('gateScreen').classList.add('hidden');
    $('setupScreen').classList.remove('hidden');
    updateNavKey();updateNavUser();
    showModal('🎉 تم التفعيل!','✓','مبروك! اللعبة مفعّلة لحسابك');
  } else if(result==='used'){
    $('gateError').textContent='⚠️ هالمفتاح مستخدم من حساب ثاني!';
    $('gateError').classList.remove('hidden');
  } else if(result==='limited'){
    $('gateError').textContent='⏳ محاولات كثيرة — انتظر ساعة وحاول مرة ثانية';
    $('gateError').classList.remove('hidden');
  } else {
    $('gateError').textContent='❌ مفتاح غير صحيح!';
    $('gateError').classList.remove('hidden');
  }
}

function gatePlayTrial(){
  if(getTrialUsed()>=LICENSE.maxTrialQuestions)return;
  $('gateScreen').classList.add('hidden');
  $('setupScreen').classList.remove('hidden');
  updateNavKey();updateNavUser();
}

// --- Key popup ---
function openKeyPopup(){
  const badge=$('keyBadge');
  const codeDisplay=$('keyCodeDisplay');
  const codeText=$('keyCodeText');
  const inputSection=$('keyInputSection');
  const actionBtn=$('keyActionBtn');
  inputSection.classList.add('hidden');
  $('keyPopupError').classList.add('hidden');
  if(isLicensed()){
    const u=getCurrentUser();
    badge.innerHTML=iconSVG('check')+' مفعّل';
    badge.className='key-status-badge active';
    codeDisplay.classList.remove('hidden');
    codeText.textContent=u?u.license_key:'—';
    actionBtn.innerHTML=iconSVG('trash')+' إلغاء التفعيل';
    actionBtn.onclick=function(){gameConfirm('متأكد تبي تلغي التفعيل؟',function(){removeLicense();closeKeyPopup();updateNavKey()},'🔑')};
  } else {
    badge.innerHTML=iconSVG('warning')+' غير مفعّل';
    badge.className='key-status-badge inactive';
    codeDisplay.classList.add('hidden');
    actionBtn.innerHTML=iconSVG('key')+' إدخال مفتاح';
    actionBtn.onclick=function(){toggleKeyInput()};
  }
  $('keyPopup').classList.add('show');
}
function closeKeyPopup(){$('keyPopup').classList.remove('show')}
function toggleKeyInput(){
  const s=$('keyInputSection');s.classList.toggle('hidden');
  if(!s.classList.contains('hidden')){$('keyPopupInput').value='';$('keyPopupError').classList.add('hidden');setTimeout(()=>$('keyPopupInput').focus(),200)}
}
async function popupActivate(){
  const input=$('keyPopupInput').value.trim();
  const errorDisplay=$('keyPopupError');
  if(!input){errorDisplay.textContent='❌ ادخل الكود';errorDisplay.classList.remove('hidden');return}
  errorDisplay.classList.add('hidden');
  const result=await activateKeyAPI(input);
  if(result==='ok'){
    closeKeyPopup();updateNavKey();
    showModal('🎉 تم التفعيل!','✓','مبروك! اللعبة مفعّلة لحسابك');
  } else if(result==='used'){
    errorDisplay.textContent='⚠️ هالمفتاح مستخدم من حساب ثاني!';
    errorDisplay.classList.remove('hidden');
  } else if(result==='limited'){
    errorDisplay.textContent='⏳ محاولات كثيرة — انتظر ساعة';
    errorDisplay.classList.remove('hidden');
  } else {
    errorDisplay.textContent='❌ مفتاح غير صحيح';
    errorDisplay.classList.remove('hidden');
  }
}
function updateNavKey(){
  const btn=$('navKeyBtn');
  if(btn){if(isLicensed()){btn.classList.add('active');btn.title='الاشتراك مفعّل'}else{btn.classList.remove('active');btn.title='حالة الاشتراك'}}
}
function updateNavUser(){
  const btn=$('navUserBtn');
  if(btn){
    const name=getCurrentUsername();
    btn.innerHTML='';
    btn.appendChild(iconEl('user'));
    btn.appendChild(document.createTextNode(' '+name));
    btn.title='تسجيل خروج — '+name;
  }
}


// ========= QUESTIONS DATA =========
const DEFAULT_Q = [
  {id:1,q:"اذكر شي تستخدمه كل يوم من الصبح",a:[{"t":"فرشاة الأسنان","p":35},{"t":"الجوال","p":25},{"t":"الماء","p":18},{"t":"المنبه","p":10},{"t":"القهوة","p":7},{"t":"المرآة","p":5}]},
  {id:2,q:"اذكر عذر يقوله الواحد لما يتأخر على دوامه",a:[{"t":"الزحمة","p":28},{"t":"ما صحيت من النوم","p":23},{"t":"السيارة خربت","p":18},{"t":"فيه حادث بالطريق","p":14},{"t":"كنت تعبان","p":10},{"t":"نسيت شي ورجعت","p":7}]},
  {id:3,q:"اذكر شي يضيّع وقت الناس",a:[{"t":"الجوال","p":30},{"t":"السوشال ميديا","p":25},{"t":"التلفزيون","p":18},{"t":"الألعاب","p":12},{"t":"الزحمة","p":10},{"t":"كثر النوم","p":5}]},
  {id:4,q:"اذكر شي ينساه أغلب الناس وهم يجهزون شنطة السفر",a:[{"t":"الشاحن","p":24},{"t":"فرشاة الأسنان","p":20},{"t":"الدوا","p":17},{"t":"محوّل الكهرباء","p":15},{"t":"جاكيت للبرد","p":13},{"t":"الشبشب","p":11}]},
  {id:5,q:"اذكر شي الناس تنساه كثير",a:[{"t":"المفاتيح","p":32},{"t":"الجوال","p":26},{"t":"المحفظة","p":18},{"t":"أسماء الناس","p":12},{"t":"المواعيد","p":7},{"t":"الشاحن","p":5}]},
  {id:6,q:"اذكر شي يفرّح الناس",a:[{"t":"العيد","p":28},{"t":"الراتب","p":23},{"t":"خبر زواج","p":18},{"t":"النجاح","p":14},{"t":"الإجازة","p":10},{"t":"مولود جديد","p":7}]},
  {id:7,q:"اذكر شي يجيب صداع",a:[{"t":"قلة النوم","p":26},{"t":"حر الشمس","p":22},{"t":"الصوت العالي","p":19},{"t":"الجوع","p":15},{"t":"كثر الشاشات","p":11},{"t":"التفكير والضغط","p":7}]},
  {id:8,q:"اذكر شي يخوّف الأطفال",a:[{"t":"الظلام","p":30},{"t":"الإبرة","p":25},{"t":"الحشرات","p":18},{"t":"الأصوات العالية","p":12},{"t":"يجلس لحاله","p":10},{"t":"دكتور الأسنان","p":5}]},
  {id:9,q:"اذكر خدمة تسويها من جوالك بدال ما تروح لها",a:[{"t":"تحويل فلوس","p":27},{"t":"تطلب أكل","p":22},{"t":"تحجز موعد","p":18},{"t":"تجدد الاستمارة","p":14},{"t":"تطلب توصيلة","p":11},{"t":"تشتري أونلاين","p":8}]},
  {id:10,q:"اذكر شي لونه أحمر",a:[{"t":"الدم","p":35},{"t":"الطماطم","p":25},{"t":"التفاح","p":18},{"t":"الفراولة","p":10},{"t":"الورد","p":7},{"t":"الفلفل الحار","p":5}]},
  {id:11,q:"اذكر شي ما يخلو منه أي مطبخ",a:[{"t":"ملح","p":32},{"t":"زيت","p":26},{"t":"سكر","p":18},{"t":"ملاعق وشوك","p":12},{"t":"صحون","p":7},{"t":"رز","p":5}]},
  {id:12,q:"اذكر سبب يخلي الواحد ما يقدر ينام",a:[{"t":"التفكير والهم","p":28},{"t":"الجوال","p":23},{"t":"القهوة","p":18},{"t":"الصوت والزعاج","p":14},{"t":"وجع أو مرض","p":10},{"t":"الحر","p":7}]},
  {id:13,q:"اذكر شي يسويه الناس وهم يسوقون غير السواقة",a:[{"t":"يسمع أغاني","p":26},{"t":"يتكلم بالجوال","p":22},{"t":"ياكل أو يشرب","p":19},{"t":"يسولف مع اللي معه","p":15},{"t":"يشرب قهوة","p":11},{"t":"يتصور","p":7}]},
  {id:14,q:"اذكر شي الناس تشتريه وهي ما تحتاجه",a:[{"t":"ملابس زيادة","p":27},{"t":"أكل أكثر من اللزوم","p":22},{"t":"إلكترونيات","p":18},{"t":"عطور","p":14},{"t":"ألعاب","p":11},{"t":"أغراض من التخفيضات","p":8}]},
  {id:15,q:"اذكر مكان تروح له لما تطفش",a:[{"t":"المول","p":30},{"t":"الكافيه","p":25},{"t":"البحر أو الكورنيش","p":18},{"t":"بيت صاحبك","p":12},{"t":"السينما","p":10},{"t":"الحديقة","p":5}]},
  {id:16,q:"اذكر أول شي تسويه أول ما تصحى",a:[{"t":"تشيك الجوال","p":35},{"t":"تروح الحمام","p":25},{"t":"تشرب ماء","p":18},{"t":"تصلي","p":10},{"t":"تسوي قهوة","p":7},{"t":"تتمطى","p":5}]},
  {id:17,q:"اذكر شي غالي وناس كثير تحلم فيه",a:[{"t":"بيت","p":28},{"t":"سيارة فخمة","p":23},{"t":"آخر آيفون","p":18},{"t":"ساعة فخمة","p":14},{"t":"سفرة برا","p":10},{"t":"ذهب","p":7}]},
  {id:18,q:"اذكر صوت يعصّب الناس",a:[{"t":"المنبه","p":26},{"t":"أصوات البناء","p":22},{"t":"بكاء طفل","p":19},{"t":"زامور السيارة","p":15},{"t":"المثقاب","p":11},{"t":"الصفارة","p":7}]},
  {id:19,q:"اذكر سبب يخلي الناس تبكي",a:[{"t":"فراق عزيز","p":28},{"t":"الحزن","p":23},{"t":"الفرح الزايد","p":18},{"t":"الوجع","p":14},{"t":"تقطيع البصل","p":10},{"t":"مشهد مؤثر بفيلم","p":7}]},
  {id:20,q:"اذكر شي تلقاه بأي ثلاجة",a:[{"t":"حليب","p":32},{"t":"ماء بارد","p":26},{"t":"خضار وفواكه","p":18},{"t":"لحم أو دجاج","p":12},{"t":"بيض","p":7},{"t":"عصير","p":5}]},
  {id:21,q:"اذكر مهنة يحترمها الناس كثير",a:[{"t":"طبيب","p":28},{"t":"معلم","p":23},{"t":"عسكري","p":18},{"t":"مهندس","p":14},{"t":"إمام مسجد","p":10},{"t":"قاضي","p":7}]},
  {id:22,q:"اذكر لون منتشر بالسيارات",a:[{"t":"أبيض","p":35},{"t":"أسود","p":25},{"t":"فضي","p":18},{"t":"رمادي","p":10},{"t":"أحمر","p":7},{"t":"أزرق","p":5}]},
  {id:23,q:"اذكر شي الناس تخبّيه عن غيرها",a:[{"t":"راتبه","p":22},{"t":"مشاكله الخاصة","p":20},{"t":"عمره","p":18},{"t":"كلمات السر","p":16},{"t":"مشاعره الحقيقية","p":13},{"t":"ديونه","p":11}]},
  {id:24,q:"اذكر شي يطلع من الأرض",a:[{"t":"نبات وشجر","p":32},{"t":"ماء","p":26},{"t":"بترول","p":18},{"t":"معادن","p":12},{"t":"حجارة","p":7},{"t":"حشرات","p":5}]},
  {id:25,q:"اذكر شي يسويه الواحد لما يزعل",a:[{"t":"يسكت وينعزل","p":27},{"t":"يبكي","p":22},{"t":"ياكل كثير","p":18},{"t":"ينام","p":14},{"t":"يطلع يمشي","p":11},{"t":"يكلم أقرب شخص له","p":8}]},
  {id:26,q:"اذكر شي تلقاه بأي شارع",a:[{"t":"سيارات","p":30},{"t":"إشارة مرور","p":25},{"t":"ناس تمشي","p":18},{"t":"محلات","p":12},{"t":"أعمدة إنارة","p":10},{"t":"أشجار","p":5}]},
  {id:27,q:"اذكر شي تحطه على مكتبك",a:[{"t":"لابتوب","p":26},{"t":"جوال","p":22},{"t":"كوب قهوة","p":19},{"t":"أقلام","p":15},{"t":"دفتر","p":11},{"t":"مناديل","p":7}]},
  {id:28,q:"اذكر موقف بسيط يخلي يومك كله حلو",a:[{"t":"أحد يمدحك","p":24},{"t":"خبر حلو بالصباح","p":20},{"t":"طريق فاضي بدون زحمة","p":17},{"t":"قهوتك طلعت تمام","p":15},{"t":"أحد يدعي لك","p":13},{"t":"لقيت شي ضايع منك","p":11}]},
  {id:29,q:"اذكر شي يدور",a:[{"t":"عجلة السيارة","p":30},{"t":"الأرض","p":25},{"t":"المروحة","p":18},{"t":"عقارب الساعة","p":12},{"t":"الغسالة","p":10},{"t":"الكرة","p":5}]},
  {id:30,q:"اذكر شي يطير",a:[{"t":"الطيارة","p":32},{"t":"الطيور","p":26},{"t":"الفراشة","p":18},{"t":"الدرون","p":12},{"t":"الطيارة الورقية","p":7},{"t":"البالون","p":5}]},
  {id:31,q:"اذكر شي ما يخلو منه أي بيت سعودي",a:[{"t":"دلّة القهوة","p":35},{"t":"تمر","p":25},{"t":"سجادة صلاة","p":18},{"t":"بخور وعود","p":10},{"t":"رز","p":7},{"t":"مكيف","p":5}]},
  {id:32,q:"اذكر أكبر مدن السعودية بعدد السكان",a:[{"t":"الرياض","p":35},{"t":"جدة","p":25},{"t":"مكة المكرمة","p":18},{"t":"المدينة المنورة","p":10},{"t":"الدمام","p":7},{"t":"الطايف","p":5}]},
  {id:33,q:"اذكر أكلة سعودية شعبية",a:[{"t":"الكبسة","p":35},{"t":"المندي","p":25},{"t":"الجريش","p":18},{"t":"المطبق","p":10},{"t":"المعصوب","p":7},{"t":"الهريسة","p":5}]},
  {id:34,q:"اذكر مكان سياحي مشهور بالسعودية",a:[{"t":"الحرم المكي","p":28},{"t":"المسجد النبوي","p":23},{"t":"العلا","p":18},{"t":"أبها والسودة","p":14},{"t":"جدة التاريخية","p":10},{"t":"الدرعية","p":7}]},
  {id:35,q:"اذكر شي يسويه الناس بالعيد",a:[{"t":"زيارة الأهل","p":30},{"t":"يوزعون عيديات","p":25},{"t":"يلبسون جديد","p":18},{"t":"حلويات ومعمول","p":12},{"t":"صلاة العيد","p":10},{"t":"يسافرون","p":5}]},
  {id:36,q:"اذكر أكلة ما تغيب عن سفرة رمضان",a:[{"t":"سمبوسة","p":30},{"t":"شوربة","p":25},{"t":"لقيمات","p":18},{"t":"فول","p":12},{"t":"تمر ولبن","p":10},{"t":"عصيرات","p":5}]},
  {id:37,q:"اذكر مشروب مشهور عند العرب",a:[{"t":"القهوة العربية","p":30},{"t":"الشاي","p":25},{"t":"اللبن","p":18},{"t":"شاي بالنعناع","p":12},{"t":"عصير طازج","p":10},{"t":"القرفة","p":5}]},
  {id:38,q:"اذكر شي مشهور عن جدة",a:[{"t":"الكورنيش","p":26},{"t":"نافورة الملك فهد","p":22},{"t":"البحر الأحمر","p":19},{"t":"البلد التاريخية","p":15},{"t":"المولات","p":11},{"t":"السمك والمأكولات البحرية","p":7}]},
  {id:39,q:"اذكر شي يشتهر فيه جنوب السعودية",a:[{"t":"العسل","p":28},{"t":"الجبال الخضراء","p":23},{"t":"المطر والضباب","p":18},{"t":"القهوة الخولانية","p":14},{"t":"البرد بالصيف","p":10},{"t":"المدرجات الزراعية","p":7}]},
  {id:40,q:"اذكر شي مشهور عن الرياض",a:[{"t":"برج المملكة","p":26},{"t":"بوليفارد","p":22},{"t":"الدرعية","p":19},{"t":"موسم الرياض","p":15},{"t":"الحي المالي","p":11},{"t":"المتحف الوطني","p":7}]},
  {id:41,q:"اذكر شي يسويه السعوديين بالشتا",a:[{"t":"كشتة بالبر","p":30},{"t":"شواء","p":25},{"t":"جلسة قهوة ونار","p":18},{"t":"رحلة مع العائلة","p":12},{"t":"يولّعون حطب","p":10},{"t":"مشي بالطبيعة","p":5}]},
  {id:42,q:"اذكر ماركة سيارة منتشرة بالسعودية",a:[{"t":"تويوتا","p":35},{"t":"هونداي","p":25},{"t":"فورد","p":18},{"t":"شفرولية","p":10},{"t":"نيسان","p":7},{"t":"مرسيدس","p":5}]},
  {id:43,q:"اذكر مطعم مشهور بالسعودية",a:[{"t":"البيك","p":35},{"t":"هرفي","p":25},{"t":"ماكدونالدز","p":18},{"t":"كودو","p":10},{"t":"شاورمر","p":7},{"t":"كنتاكي","p":5}]},
  {id:44,q:"اذكر مشروع سعودي ضخم",a:[{"t":"نيوم","p":32},{"t":"ذا لاين","p":26},{"t":"القدية","p":18},{"t":"البحر الأحمر","p":12},{"t":"مشروع مسار","p":7},{"t":"برج جدة","p":5}]},
  {id:45,q:"اذكر شي مشهور عن مكة المكرمة",a:[{"t":"الحرم والكعبة","p":35},{"t":"ماء زمزم","p":25},{"t":"الحج والعمرة","p":18},{"t":"جبل عرفة","p":10},{"t":"منى ومزدلفة","p":7},{"t":"غار حراء","p":5}]},
  {id:46,q:"اذكر شي مشهور عن المدينة المنورة",a:[{"t":"المسجد النبوي","p":35},{"t":"الروضة الشريفة","p":25},{"t":"التمر المدني","p":18},{"t":"مسجد قباء","p":10},{"t":"جبل أحد","p":7},{"t":"البقيع","p":5}]},
  {id:47,q:"اذكر شي تشتريه من البقالة دايم",a:[{"t":"خبز","p":32},{"t":"حليب","p":26},{"t":"بيض","p":18},{"t":"ماء","p":12},{"t":"جبن","p":7},{"t":"رز","p":5}]},
  {id:48,q:"اذكر جامعة سعودية معروفة",a:[{"t":"الملك سعود","p":26},{"t":"الملك عبدالعزيز","p":22},{"t":"الملك فهد للبترول","p":19},{"t":"كاوست","p":15},{"t":"الإمام","p":11},{"t":"أم القرى","p":7}]},
  {id:49,q:"اذكر شي يسويه الناس يوم الجمعة",a:[{"t":"صلاة الجمعة","p":35},{"t":"غدا عائلي","p":25},{"t":"ينامون بعد الصلاة","p":18},{"t":"يزورون الأهل","p":10},{"t":"ينظفون البيت","p":7},{"t":"يطبخون","p":5}]},
  {id:50,q:"اذكر منطقة من مناطق السعودية",a:[{"t":"الرياض","p":28},{"t":"مكة المكرمة","p":23},{"t":"الشرقية","p":18},{"t":"المدينة المنورة","p":14},{"t":"عسير","p":10},{"t":"القصيم","p":7}]},
  {id:51,q:"اذكر مسلسل أو برنامج سعودي مشهور",a:[{"t":"طاش ما طاش","p":28},{"t":"مسامير","p":23},{"t":"سيلفي","p":18},{"t":"شباب البومب","p":14},{"t":"رشاش","p":10},{"t":"ممنوع التجول","p":7}]},
  {id:52,q:"اذكر هدية يوديها السعودي معه لما يسافر برا",a:[{"t":"تمر","p":27},{"t":"قهوة عربية","p":22},{"t":"بهارات","p":18},{"t":"عود وبخور","p":14},{"t":"حلويات سعودية","p":11},{"t":"عسل","p":8}]},
  {id:53,q:"اذكر عادة سعودية حلوة",a:[{"t":"القهوة والتمر للضيف","p":30},{"t":"الكرم والضيافة","p":25},{"t":"السلام والمصافحة","p":18},{"t":"ذبيحة للضيف","p":12},{"t":"العيديات","p":10},{"t":"يرسل أكل لجيرانه","p":5}]},
  {id:54,q:"اذكر رياضة مشهورة عالمياً",a:[{"t":"كرة القدم","p":35},{"t":"كرة السلة","p":25},{"t":"السباحة","p":18},{"t":"التنس","p":10},{"t":"ألعاب القوى","p":7},{"t":"الكريكت","p":5}]},
  {id:55,q:"اذكر نادي كرة قدم سعودي",a:[{"t":"الهلال","p":32},{"t":"النصر","p":26},{"t":"الأهلي","p":18},{"t":"الاتحاد","p":12},{"t":"الشباب","p":7},{"t":"الفيحاء","p":5}]},
  {id:56,q:"اذكر لاعب كرة قدم عالمي مشهور",a:[{"t":"ميسي","p":32},{"t":"رونالدو","p":26},{"t":"مبابي","p":18},{"t":"نيمار","p":12},{"t":"بنزيما","p":7},{"t":"محمد صلاح","p":5}]},
  {id:57,q:"اذكر منتخب فاز بكاس العالم",a:[{"t":"البرازيل","p":26},{"t":"ألمانيا","p":22},{"t":"الأرجنتين","p":19},{"t":"فرنسا","p":15},{"t":"إيطاليا","p":11},{"t":"إسبانيا","p":7}]},
  {id:58,q:"اذكر دوري كرة قدم مشهور",a:[{"t":"الدوري الإنجليزي","p":28},{"t":"الدوري الإسباني","p":23},{"t":"دوري روشن","p":18},{"t":"الدوري الإيطالي","p":14},{"t":"الدوري الألماني","p":10},{"t":"الدوري الفرنسي","p":7}]},
  {id:59,q:"اذكر بطولة رياضية عالمية كبيرة",a:[{"t":"كاس العالم","p":32},{"t":"الأولمبياد","p":26},{"t":"دوري أبطال أوروبا","p":18},{"t":"ويمبلدون","p":12},{"t":"كاس آسيا","p":7},{"t":"كاس أمم أفريقيا","p":5}]},
  {id:60,q:"اذكر نادي أوروبي مشهور",a:[{"t":"ريال مدريد","p":28},{"t":"برشلونة","p":23},{"t":"مانشستر يونايتد","p":18},{"t":"بايرن ميونخ","p":14},{"t":"ليفربول","p":10},{"t":"باريس سان جيرمان","p":7}]},
  {id:61,q:"اذكر رياضة قتالية",a:[{"t":"الملاكمة","p":26},{"t":"الكاراتيه","p":22},{"t":"التايكوندو","p":19},{"t":"الجودو","p":15},{"t":"المصارعة","p":11},{"t":"الكونغ فو","p":7}]},
  {id:62,q:"اذكر رياضة تلعبها بمضرب",a:[{"t":"التنس","p":27},{"t":"البادل","p":22},{"t":"تنس الطاولة","p":18},{"t":"الريشة الطايرة","p":14},{"t":"السكواش","p":11},{"t":"الكريكت","p":8}]},
  {id:63,q:"اذكر رياضة جماعية غير كرة القدم",a:[{"t":"كرة السلة","p":22},{"t":"الكرة الطايرة","p":20},{"t":"كرة اليد","p":18},{"t":"الهوكي","p":16},{"t":"البيسبول","p":13},{"t":"الرقبي","p":11}]},
  {id:64,q:"اذكر رياضة فردية",a:[{"t":"السباحة","p":26},{"t":"التنس","p":22},{"t":"الجري","p":19},{"t":"الملاكمة","p":15},{"t":"الجمباز","p":11},{"t":"رفع الأثقال","p":7}]},
  {id:65,q:"اذكر رياضة مائية",a:[{"t":"السباحة","p":28},{"t":"الغوص","p":23},{"t":"ركوب الأمواج","p":18},{"t":"التجديف","p":14},{"t":"كرة الماء","p":10},{"t":"التزلج على الماء","p":7}]},
  {id:66,q:"اذكر شي يلبسه لاعب كرة القدم",a:[{"t":"القميص","p":27},{"t":"الشورت","p":22},{"t":"الجزمة","p":18},{"t":"الجوارب الطويلة","p":14},{"t":"واقي الساق","p":11},{"t":"قفازات الحارس","p":8}]},
  {id:67,q:"اذكر فاكهة استوائية",a:[{"t":"المانجو","p":30},{"t":"الأناناس","p":25},{"t":"الموز","p":18},{"t":"الكيوي","p":12},{"t":"الجوافة","p":10},{"t":"الباباي","p":5}]},
  {id:68,q:"اذكر بهار تستخدمه بالطبخ",a:[{"t":"الفلفل الأسود","p":21},{"t":"الكمون","p":19},{"t":"الكركم","p":18},{"t":"القرفة","p":16},{"t":"الزنجبيل","p":14},{"t":"الهيل","p":12}]},
  {id:69,q:"اذكر أكلة عالمية كل الناس تعرفها",a:[{"t":"البيتزا","p":32},{"t":"البرجر","p":26},{"t":"السوشي","p":18},{"t":"الباستا","p":12},{"t":"التاكو","p":7},{"t":"الكاري","p":5}]},
  {id:70,q:"اذكر حلا عربي مشهور",a:[{"t":"الكنافة","p":30},{"t":"البقلاوة","p":25},{"t":"البسبوسة","p":18},{"t":"اللقيمات","p":12},{"t":"المهلبية","p":10},{"t":"القطايف","p":5}]},
  {id:71,q:"اذكر أكلة فطور عربية",a:[{"t":"الفول","p":28},{"t":"الفلافل","p":23},{"t":"البيض","p":18},{"t":"الجبن والزيتون","p":14},{"t":"اللبنة","p":10},{"t":"الشكشوكة","p":7}]},
  {id:72,q:"اذكر نوع لحم ياكله الناس",a:[{"t":"الدجاج","p":32},{"t":"الغنم","p":26},{"t":"البقر","p":18},{"t":"السمك","p":12},{"t":"الديك الرومي","p":7},{"t":"الربيان","p":5}]},
  {id:73,q:"اذكر نوع مكسرات",a:[{"t":"الفستق","p":21},{"t":"اللوز","p":19},{"t":"الكاجو","p":18},{"t":"الجوز","p":16},{"t":"البندق","p":14},{"t":"الفول السوداني","p":12}]},
  {id:74,q:"اذكر نوع خبز",a:[{"t":"الخبز العربي","p":21},{"t":"الصامولي","p":19},{"t":"التوست","p":18},{"t":"الخبز الفرنسي","p":16},{"t":"التميس","p":14},{"t":"الرقاق","p":12}]},
  {id:75,q:"اذكر شي يتحط فوق البيتزا",a:[{"t":"الجبن","p":28},{"t":"الفلفل الملون","p":23},{"t":"الزيتون","p":18},{"t":"الفطر","p":14},{"t":"البيبروني","p":10},{"t":"البصل","p":7}]},
  {id:76,q:"اذكر نوع جبن",a:[{"t":"الشيدر","p":21},{"t":"الموزاريلا","p":19},{"t":"الكريمي","p":18},{"t":"الفيتا","p":16},{"t":"البارميزان","p":14},{"t":"الحلوم","p":12}]},
  {id:77,q:"اذكر مشروب حار غير القهوة",a:[{"t":"الشاي","p":21},{"t":"الشاي الأخضر","p":19},{"t":"النعناع","p":18},{"t":"القرفة","p":16},{"t":"الكاكاو","p":14},{"t":"اليانسون","p":12}]},
  {id:78,q:"اذكر مشروب بارد منعش",a:[{"t":"العصير الطازج","p":27},{"t":"ماء بارد","p":22},{"t":"بيبسي","p":18},{"t":"اللبن","p":14},{"t":"الآيس تي","p":11},{"t":"السموذي","p":8}]},
  {id:79,q:"اذكر فاكهة لونها أصفر",a:[{"t":"الموز","p":32},{"t":"الليمون","p":26},{"t":"المانجو","p":18},{"t":"الأناناس","p":12},{"t":"المشمش","p":7},{"t":"الخوخ","p":5}]},
  {id:80,q:"اذكر سورة من قصار السور",a:[{"t":"الإخلاص","p":32},{"t":"الفلق","p":26},{"t":"الناس","p":18},{"t":"الكوثر","p":12},{"t":"العصر","p":7},{"t":"القدر","p":5}]},
  {id:81,q:"اذكر نبي من أنبياء الله",a:[{"t":"محمد ﷺ","p":30},{"t":"إبراهيم","p":25},{"t":"موسى","p":18},{"t":"عيسى","p":12},{"t":"نوح","p":10},{"t":"يوسف","p":5}]},
  {id:82,q:"اذكر شي يكثر منه الناس برمضان",a:[{"t":"الصيام","p":30},{"t":"التراويح","p":25},{"t":"قراءة القرآن","p":18},{"t":"الإفطار الجماعي","p":12},{"t":"السحور","p":10},{"t":"الصدقة","p":5}]},
  {id:83,q:"اذكر شهر من الأشهر الهجرية",a:[{"t":"رمضان","p":21},{"t":"ذو الحجة","p":19},{"t":"محرم","p":18},{"t":"ربيع الأول","p":16},{"t":"شعبان","p":14},{"t":"رجب","p":12}]},
  {id:84,q:"اذكر اسم من أسماء الله الحسنى",a:[{"t":"الرحمن","p":22},{"t":"الرحيم","p":20},{"t":"الملك","p":18},{"t":"السلام","p":16},{"t":"الكريم","p":13},{"t":"الغفور","p":11}]},
  {id:85,q:"اذكر صحابي جليل",a:[{"t":"أبو بكر الصديق","p":28},{"t":"عمر بن الخطاب","p":23},{"t":"عثمان بن عفان","p":18},{"t":"علي بن أبي طالب","p":14},{"t":"خالد بن الوليد","p":10},{"t":"بلال بن رباح","p":7}]},
  {id:86,q:"اذكر عمل خير بسيط يقدر يسويه أي واحد",a:[{"t":"صدقة","p":26},{"t":"يساعد محتاج","p":22},{"t":"يزور مريض","p":19},{"t":"يطعم جوعان","p":15},{"t":"كلمة طيبة","p":11},{"t":"يشيل أذى من الطريق","p":7}]},
  {id:87,q:"اذكر ذكر يقوله المسلم كل يوم",a:[{"t":"بسم الله","p":32},{"t":"الحمد لله","p":26},{"t":"سبحان الله","p":18},{"t":"الله أكبر","p":12},{"t":"أستغفر الله","p":7},{"t":"لا إله إلا الله","p":5}]},
  {id:88,q:"اذكر شي يفطّر الصايم",a:[{"t":"الأكل","p":27},{"t":"الشرب","p":22},{"t":"التقيؤ عمداً","p":18},{"t":"نية الفطر","p":14},{"t":"الحجامة","p":11},{"t":"الحيض","p":8}]},
  {id:89,q:"اذكر شي يسويه الحاج بالحج",a:[{"t":"الطواف","p":28},{"t":"السعي","p":23},{"t":"الوقوف بعرفة","p":18},{"t":"رمي الجمرات","p":14},{"t":"الحلق أو التقصير","p":10},{"t":"ذبح الهدي","p":7}]},
  {id:90,q:"اذكر غزوة أو معركة إسلامية مشهورة",a:[{"t":"بدر","p":22},{"t":"أحد","p":20},{"t":"الخندق","p":18},{"t":"فتح مكة","p":16},{"t":"اليرموك","p":13},{"t":"القادسية","p":11}]},
  {id:91,q:"اذكر سورة طويلة بالقرآن",a:[{"t":"البقرة","p":32},{"t":"آل عمران","p":26},{"t":"النساء","p":18},{"t":"المائدة","p":12},{"t":"الأنعام","p":7},{"t":"الأعراف","p":5}]},
  {id:92,q:"اذكر مكان مقدس بالإسلام",a:[{"t":"مكة المكرمة","p":30},{"t":"المدينة المنورة","p":25},{"t":"المسجد الأقصى","p":18},{"t":"جبل عرفة","p":12},{"t":"غار حراء","p":10},{"t":"غار ثور","p":5}]},
  {id:93,q:"اذكر حيوان يحبه الأطفال",a:[{"t":"القطة","p":30},{"t":"الأرنب","p":25},{"t":"الكلب","p":18},{"t":"العصفور","p":12},{"t":"السمكة","p":10},{"t":"الحصان","p":5}]},
  {id:94,q:"اذكر حيوان يعيش بالصحرا",a:[{"t":"الجمل","p":35},{"t":"الأفعى","p":25},{"t":"العقرب","p":18},{"t":"الغزال","p":10},{"t":"الضب","p":7},{"t":"الأرنب البري","p":5}]},
  {id:95,q:"اذكر طير معروف",a:[{"t":"الصقر","p":21},{"t":"الحمامة","p":19},{"t":"النسر","p":18},{"t":"الببغاء","p":16},{"t":"العصفور","p":14},{"t":"البومة","p":12}]},
  {id:96,q:"اذكر حيوان ضخم",a:[{"t":"الفيل","p":30},{"t":"الحوت","p":25},{"t":"الزرافة","p":18},{"t":"وحيد القرن","p":12},{"t":"فرس النهر","p":10},{"t":"الدب","p":5}]},
  {id:97,q:"اذكر شجرة مشهورة",a:[{"t":"النخلة","p":35},{"t":"الزيتون","p":25},{"t":"السدر","p":18},{"t":"الصنوبر","p":10},{"t":"البلوط","p":7},{"t":"الأراك","p":5}]},
  {id:98,q:"اذكر ظاهرة طبيعية",a:[{"t":"المطر","p":28},{"t":"البرق والرعد","p":23},{"t":"الزلزال","p":18},{"t":"البركان","p":14},{"t":"قوس قزح","p":10},{"t":"الكسوف","p":7}]},
  {id:99,q:"اذكر حشرة معروفة",a:[{"t":"النملة","p":22},{"t":"النحلة","p":20},{"t":"الفراشة","p":18},{"t":"الصرصور","p":16},{"t":"الذبابة","p":13},{"t":"البعوضة","p":11}]},
  {id:100,q:"اذكر حيوان بحري",a:[{"t":"الدولفين","p":32},{"t":"الحوت","p":26},{"t":"القرش","p":18},{"t":"الأخطبوط","p":12},{"t":"السلحفاة","p":7},{"t":"نجم البحر","p":5}]},
  {id:101,q:"اذكر حيوان أليف يربونه بالبيت",a:[{"t":"القطة","p":32},{"t":"الكلب","p":26},{"t":"سمك الزينة","p":18},{"t":"الأرنب","p":12},{"t":"الببغاء","p":7},{"t":"الهامستر","p":5}]},
  {id:102,q:"اذكر حيوان سريع",a:[{"t":"الفهد","p":35},{"t":"الحصان","p":25},{"t":"الغزال","p":18},{"t":"الأرنب","p":10},{"t":"النعامة","p":7},{"t":"الذيب","p":5}]},
  {id:103,q:"اذكر دولة عربية بأفريقيا",a:[{"t":"مصر","p":30},{"t":"المغرب","p":25},{"t":"تونس","p":18},{"t":"الجزاير","p":12},{"t":"ليبيا","p":10},{"t":"السودان","p":5}]},
  {id:104,q:"اذكر دولة أوروبية يسافرون لها السعوديين بالصيف",a:[{"t":"بريطانيا","p":21},{"t":"سويسرا","p":19},{"t":"النمسا","p":18},{"t":"جورجيا","p":16},{"t":"البوسنة","p":14},{"t":"هولندا","p":12}]},
  {id:105,q:"اذكر عاصمة دولة عربية",a:[{"t":"الرياض","p":22},{"t":"القاهرة","p":20},{"t":"دمشق","p":18},{"t":"بغداد","p":16},{"t":"عمّان","p":13},{"t":"الرباط","p":11}]},
  {id:106,q:"اذكر مدينة سياحية عالمية",a:[{"t":"باريس","p":26},{"t":"لندن","p":22},{"t":"دبي","p":19},{"t":"إسطنبول","p":15},{"t":"نيويورك","p":11},{"t":"طوكيو","p":7}]},
  {id:107,q:"اذكر نهر مشهور بالعالم",a:[{"t":"النيل","p":21},{"t":"الأمازون","p":19},{"t":"دجلة","p":18},{"t":"الفرات","p":16},{"t":"المسيسيبي","p":14},{"t":"الغانج","p":12}]},
  {id:108,q:"اذكر صحرا مشهورة",a:[{"t":"الربع الخالي","p":22},{"t":"الصحرا الكبرى","p":20},{"t":"النفود","p":18},{"t":"الدهنا","p":16},{"t":"سينا","p":13},{"t":"كالاهاري","p":11}]},
  {id:109,q:"اذكر بحر أو محيط",a:[{"t":"البحر الأحمر","p":24},{"t":"المحيط الهادي","p":20},{"t":"البحر المتوسط","p":17},{"t":"المحيط الأطلسي","p":15},{"t":"الخليج العربي","p":13},{"t":"المحيط الهندي","p":11}]},
  {id:110,q:"اذكر جبل مشهور",a:[{"t":"إفرست","p":21},{"t":"جبل أحد","p":19},{"t":"جبل عرفة","p":18},{"t":"جبال الألب","p":16},{"t":"كلمنجارو","p":14},{"t":"جبل طويق","p":12}]},
  {id:111,q:"اذكر دولة آسيوية غير عربية",a:[{"t":"الصين","p":22},{"t":"اليابان","p":20},{"t":"الهند","p":18},{"t":"كوريا الجنوبية","p":16},{"t":"تايلاند","p":13},{"t":"ماليزيا","p":11}]},
  {id:112,q:"اذكر دولة السعوديين يحبون يسافرون لها",a:[{"t":"تركيا","p":26},{"t":"مصر","p":22},{"t":"ماليزيا","p":19},{"t":"بريطانيا","p":15},{"t":"جورجيا","p":11},{"t":"الإمارات","p":7}]},
  {id:113,q:"اذكر شركة تقنية عالمية كبيرة",a:[{"t":"أبل","p":32},{"t":"سامسونج","p":26},{"t":"قوقل","p":18},{"t":"مايكروسوفت","p":12},{"t":"أمازون","p":7},{"t":"ميتا","p":5}]},
  {id:114,q:"اذكر تطبيق تواصل اجتماعي",a:[{"t":"واتساب","p":28},{"t":"انستقرام","p":23},{"t":"تيك توك","p":18},{"t":"سناب شات","p":14},{"t":"إكس (تويتر)","p":10},{"t":"فيسبوك","p":7}]},
  {id:115,q:"اذكر نوع جوال مشهور",a:[{"t":"آيفون","p":35},{"t":"سامسونج","p":25},{"t":"هواوي","p":18},{"t":"شاومي","p":10},{"t":"ون بلس","p":7},{"t":"نوكيا","p":5}]},
  {id:116,q:"اذكر لعبة إلكترونية يلعبها الشباب",a:[{"t":"فورتنايت","p":26},{"t":"ماين كرافت","p":22},{"t":"فيفا","p":19},{"t":"ببجي","p":15},{"t":"قراند","p":11},{"t":"كول أوف ديوتي","p":7}]},
  {id:117,q:"اذكر تطبيق توصيل بالسعودية",a:[{"t":"هنقرستيشن","p":28},{"t":"جاهز","p":23},{"t":"كريم","p":18},{"t":"مرسول","p":14},{"t":"أوبر","p":10},{"t":"ذا شفز","p":7}]},
  {id:118,q:"اذكر منصة تتفرج فيها أفلام ومسلسلات",a:[{"t":"نتفلكس","p":32},{"t":"شاهد","p":26},{"t":"يوتيوب","p":18},{"t":"ديزني بلس","p":12},{"t":"أمازون برايم","p":7},{"t":"أبل تي في","p":5}]},
  {id:119,q:"اذكر جهاز كهربائي بالبيت",a:[{"t":"التلفزيون","p":30},{"t":"الثلاجة","p":25},{"t":"المكيف","p":18},{"t":"الغسالة","p":12},{"t":"المايكرويف","p":10},{"t":"الفرن","p":5}]},
  {id:120,q:"اذكر اختراع غيّر الدنيا",a:[{"t":"الكهربا","p":30},{"t":"الإنترنت","p":25},{"t":"الهاتف","p":18},{"t":"السيارة","p":12},{"t":"الطيارة","p":10},{"t":"الكمبيوتر","p":5}]},
  {id:121,q:"اذكر شي تدوّر عليه بالإنترنت كثير",a:[{"t":"وصفة أكل","p":24},{"t":"طريقة تصليح شي","p":20},{"t":"سعر منتج","p":17},{"t":"موقع مكان","p":15},{"t":"معنى كلمة","p":13},{"t":"أعراض مرض","p":11}]},
  {id:122,q:"اذكر وظيفة ناس كثير تحلم فيها",a:[{"t":"طيار","p":28},{"t":"دكتور","p":23},{"t":"رجل أعمال","p":18},{"t":"مهندس","p":14},{"t":"مبرمج","p":10},{"t":"لاعب كرة","p":7}]},
  {id:123,q:"اذكر وظيفة تبي شجاعة",a:[{"t":"رجل إطفاء","p":26},{"t":"عسكري","p":22},{"t":"شرطي","p":19},{"t":"غواص إنقاذ","p":15},{"t":"طيار حربي","p":11},{"t":"مسعف","p":7}]},
  {id:124,q:"اذكر وظيفة تبي إبداع",a:[{"t":"مصمم","p":22},{"t":"مبرمج","p":20},{"t":"مهندس معماري","p":18},{"t":"كاتب","p":16},{"t":"مصور","p":13},{"t":"شيف","p":11}]},
  {id:125,q:"اذكر وظيفة تقدر تشتغلها من بيتك",a:[{"t":"مبرمج","p":27},{"t":"مصمم","p":22},{"t":"كاتب محتوى","p":18},{"t":"مترجم","p":14},{"t":"تسويق إلكتروني","p":11},{"t":"محاسب","p":8}]},
  {id:126,q:"اذكر وظيفة بالمستشفى",a:[{"t":"دكتور","p":32},{"t":"ممرض","p":26},{"t":"صيدلي","p":18},{"t":"فني أشعة","p":12},{"t":"فني مختبر","p":7},{"t":"موظف استقبال","p":5}]},
  {id:127,q:"اذكر لغة مشهورة بالعالم",a:[{"t":"الإنجليزية","p":32},{"t":"العربية","p":26},{"t":"الصينية","p":18},{"t":"الإسبانية","p":12},{"t":"الفرنسية","p":7},{"t":"الهندية","p":5}]},
  {id:128,q:"اذكر آلة موسيقية",a:[{"t":"العود","p":21},{"t":"البيانو","p":19},{"t":"القيتار","p":18},{"t":"الكمان","p":16},{"t":"الطبل","p":14},{"t":"الناي","p":12}]},
  {id:129,q:"اذكر مادة تدرسها بالمدرسة",a:[{"t":"رياضيات","p":30},{"t":"لغة عربية","p":25},{"t":"إنجليزي","p":18},{"t":"علوم","p":12},{"t":"تاريخ","p":10},{"t":"تربية إسلامية","p":5}]},
  {id:130,q:"اذكر عملة عربية",a:[{"t":"الريال السعودي","p":24},{"t":"الدرهم الإماراتي","p":20},{"t":"الدينار الكويتي","p":17},{"t":"الجنيه المصري","p":15},{"t":"الدينار الأردني","p":13},{"t":"الريال القطري","p":11}]},
  {id:131,q:"اذكر شي يرمز للسعودية",a:[{"t":"السيفين والنخلة","p":28},{"t":"العلم الأخضر","p":23},{"t":"الكعبة","p":18},{"t":"الجمل","p":14},{"t":"البترول","p":10},{"t":"رؤية 2030","p":7}]},
  {id:132,q:"اذكر هدية الناس تفرح فيها",a:[{"t":"عطر","p":27},{"t":"جوال جديد","p":22},{"t":"فلوس أو بطاقة شراء","p":18},{"t":"ساعة","p":14},{"t":"ورد","p":11},{"t":"شوكولاتة","p":8}]},
  {id:133,q:"اذكر مناسبة تلم الناس كلهم",a:[{"t":"العيد","p":30},{"t":"العرس","p":25},{"t":"رمضان","p":18},{"t":"اليوم الوطني","p":12},{"t":"حفلة التخرج","p":10},{"t":"مولود جديد","p":5}]},
  {id:134,q:"اذكر شي تشتريه للبيت الجديد",a:[{"t":"كنب وأثاث","p":28},{"t":"ثلاجة","p":23},{"t":"غسالة","p":18},{"t":"مكيفات","p":14},{"t":"سجاد وستاير","p":10},{"t":"أجهزة مطبخ","p":7}]},
  {id:135,q:"اذكر شي يسويه الأب مع عياله",a:[{"t":"يلعب معهم","p":26},{"t":"يوصلهم المدرسة","p":22},{"t":"ياخذهم يتمشون","p":19},{"t":"يشتري لهم طلباتهم","p":15},{"t":"يذاكر معهم","p":11},{"t":"يحكي لهم قصص","p":7}]},
  {id:136,q:"اذكر شي يسويه الطفل بالمدرسة",a:[{"t":"يدرس","p":28},{"t":"يلعب مع أصحابه","p":23},{"t":"ياكل بالفسحة","p":18},{"t":"يسولف","p":14},{"t":"يرسم ويلون","p":10},{"t":"يكتب الواجب","p":7}]},
  {id:137,q:"اذكر شي تشتريه للأطفال",a:[{"t":"لعبة","p":30},{"t":"ملابس","p":25},{"t":"حلويات","p":18},{"t":"قصص وكتب","p":12},{"t":"تابلت","p":10},{"t":"جزمة","p":5}]},
  {id:138,q:"اذكر عضو من أعضاء جسم الإنسان",a:[{"t":"القلب","p":22},{"t":"المخ","p":20},{"t":"الكبد","p":18},{"t":"الرية","p":16},{"t":"الكلى","p":13},{"t":"المعدة","p":11}]},
  {id:139,q:"اذكر شي صحي لازم تسويه كل يوم",a:[{"t":"تشرب ماء","p":28},{"t":"تمشي أو تتريض","p":23},{"t":"تاكل خضار وفواكه","p":18},{"t":"تنام كفاية","p":14},{"t":"تفرش أسنانك","p":10},{"t":"تقلل السكر","p":7}]},
  {id:140,q:"اذكر سبب يودي الناس للمستشفى",a:[{"t":"مرض أو حرارة","p":28},{"t":"كسر أو إصابة","p":23},{"t":"ولادة","p":18},{"t":"عملية","p":14},{"t":"حادث","p":10},{"t":"فحص دوري","p":7}]},
  {id:141,q:"اذكر فيتامين أو معدن مهم للجسم",a:[{"t":"فيتامين د","p":22},{"t":"فيتامين سي","p":20},{"t":"الحديد","p":18},{"t":"الكالسيوم","p":16},{"t":"الزنك","p":13},{"t":"الماغنيسيوم","p":11}]},
  {id:142,q:"اذكر وسيلة مواصلات",a:[{"t":"السيارة","p":35},{"t":"الطيارة","p":25},{"t":"الباص","p":18},{"t":"القطار","p":10},{"t":"التاكسي","p":7},{"t":"الدباب","p":5}]},
  {id:143,q:"اذكر شي تلقاه بالمطار",a:[{"t":"الطيارات","p":30},{"t":"الجوازات","p":25},{"t":"كاونتر التسجيل","p":18},{"t":"السوق الحرة","p":12},{"t":"المطاعم والكافيهات","p":10},{"t":"سير الحقايب","p":5}]},
  {id:144,q:"اذكر شي أول ما تفتح شنطتك بالفندق تدور عليه",a:[{"t":"الشاحن","p":24},{"t":"فرشاة الأسنان","p":20},{"t":"ملابس النوم","p":17},{"t":"الدوا","p":15},{"t":"العطر","p":13},{"t":"الجزمة الثانية","p":11}]},
  {id:145,q:"اذكر شركة طيران معروفة",a:[{"t":"الخطوط السعودية","p":24},{"t":"طيران ناس","p":20},{"t":"طيران الإمارات","p":17},{"t":"القطرية","p":15},{"t":"التركية","p":13},{"t":"طيران الرياض","p":11}]},
  {id:146,q:"اذكر قطعة من لبس الرجال السعودي",a:[{"t":"الثوب","p":35},{"t":"الشماغ","p":25},{"t":"البشت","p":18},{"t":"الطاقية","p":10},{"t":"العقال","p":7},{"t":"السروال","p":5}]},
  {id:147,q:"اذكر ماركة ملابس أو جزم عالمية",a:[{"t":"نايكي","p":22},{"t":"أديداس","p":20},{"t":"زارا","p":18},{"t":"قوتشي","p":16},{"t":"لويس فيتون","p":13},{"t":"إتش آند إم","p":11}]},
  {id:148,q:"اذكر لون ملابس الناس تلبسه كثير",a:[{"t":"الأسود","p":32},{"t":"الأبيض","p":26},{"t":"الأزرق","p":18},{"t":"الرمادي","p":12},{"t":"البيج","p":7},{"t":"البني","p":5}]},
  {id:149,q:"اذكر نوع جزمة",a:[{"t":"جزمة رياضية","p":21},{"t":"جزمة رسمية","p":19},{"t":"صندل","p":18},{"t":"شبشب","p":16},{"t":"بوت","p":14},{"t":"كعب عالي","p":12}]},
  {id:150,q:"اذكر هواية ممتعة",a:[{"t":"القراءة","p":22},{"t":"الرسم","p":20},{"t":"التصوير","p":18},{"t":"الطبخ","p":16},{"t":"الرياضة","p":13},{"t":"جمع الأشياء","p":11}]},
  {id:151,q:"اذكر كرتون كبرنا عليه",a:[{"t":"توم وجيري","p":28},{"t":"سبونج بوب","p":23},{"t":"ميكي ماوس","p":18},{"t":"النمر الوردي","p":14},{"t":"المحقق كونان","p":10},{"t":"عدنان ولينا","p":7}]},
  {id:152,q:"اذكر شي يسويه الناس بالإجازة",a:[{"t":"يسافرون","p":32},{"t":"ينامون","p":26},{"t":"يزورون الأهل","p":18},{"t":"مطاعم وكافيهات","p":12},{"t":"يطلعون بر","p":7},{"t":"يقعدون بالبيت","p":5}]},
  {id:153,q:"اذكر شي تسويه بالحديقة",a:[{"t":"تمشي","p":27},{"t":"تلعب مع العيال","p":22},{"t":"تسوي شوي","p":18},{"t":"تقرا","p":14},{"t":"تتصور","p":11},{"t":"تقعد تستانس","p":8}]},
  {id:154,q:"اذكر شي مصنوع من خشب",a:[{"t":"الباب","p":30},{"t":"الطاولة","p":25},{"t":"الكرسي","p":18},{"t":"الدولاب","p":12},{"t":"قلم الرصاص","p":10},{"t":"السرير","p":5}]},
  {id:155,q:"اذكر شي مصنوع من زجاج",a:[{"t":"النافذة","p":30},{"t":"الكوب","p":25},{"t":"المراية","p":18},{"t":"النظارة","p":12},{"t":"شاشة الجوال","p":10},{"t":"المزهرية","p":5}]},
  {id:156,q:"اذكر شي ريحته حلوة",a:[{"t":"العطر","p":32},{"t":"الورد","p":26},{"t":"البخور والعود","p":18},{"t":"القهوة","p":12},{"t":"خبز طالع من الفرن","p":7},{"t":"المطر على التراب","p":5}]},
  {id:157,q:"اذكر شي يتعلق على الجدار",a:[{"t":"لوحة أو صورة","p":32},{"t":"ساعة","p":26},{"t":"تلفزيون","p":18},{"t":"مراية","p":12},{"t":"رف","p":7},{"t":"مكيف سبليت","p":5}]},
  {id:158,q:"اذكر شي شكله دايري",a:[{"t":"الكرة","p":30},{"t":"العجلة","p":25},{"t":"الساعة","p":18},{"t":"الصحن","p":12},{"t":"العملة المعدنية","p":10},{"t":"القمر","p":5}]},
  {id:159,q:"اذكر شي بارد",a:[{"t":"الثلج","p":32},{"t":"الآيس كريم","p":26},{"t":"الماء البارد","p":18},{"t":"المكيف","p":12},{"t":"جو الشتا","p":7},{"t":"البوظة","p":5}]},
  {id:160,q:"اذكر شي حار",a:[{"t":"الشمس","p":32},{"t":"النار","p":26},{"t":"الفلفل الحار","p":18},{"t":"الماء المغلي","p":12},{"t":"الشاي","p":7},{"t":"الرمل بالصيف","p":5}]},
  {id:161,q:"اذكر شي ينكسر بسرعة",a:[{"t":"الزجاج","p":32},{"t":"البيض","p":26},{"t":"شاشة الجوال","p":18},{"t":"المزهرية","p":12},{"t":"النظارة","p":7},{"t":"الصحن","p":5}]},
  {id:162,q:"اذكر شي يخرب بسرعة لو تركته برا الثلاجة",a:[{"t":"الحليب","p":28},{"t":"اللحم","p":23},{"t":"الخضار الورقية","p":18},{"t":"الفواكه الطرية","p":14},{"t":"العصير الطبيعي","p":10},{"t":"البيض المسلوق","p":7}]},
  {id:163,q:"اذكر شي يبي تركيز عالي",a:[{"t":"السواقة","p":26},{"t":"المذاكرة","p":22},{"t":"البرمجة","p":19},{"t":"الطبخ","p":15},{"t":"العد والحساب","p":11},{"t":"القراءة","p":7}]},
  {id:164,q:"اذكر شي تسويه قبل ما تنام",a:[{"t":"تشيك الجوال","p":35},{"t":"تصلي","p":25},{"t":"تفرش أسنانك","p":18},{"t":"تقرا أذكار النوم","p":10},{"t":"تشرب ماء","p":7},{"t":"تطفي الأنوار","p":5}]},
  {id:165,q:"اذكر معدن غالي",a:[{"t":"الذهب","p":35},{"t":"الفضة","p":25},{"t":"البلاتين","p":18},{"t":"الألماس","p":10},{"t":"الزمرد","p":7},{"t":"النحاس","p":5}]},
  {id:166,q:"اذكر شي يتغير لونه",a:[{"t":"ورق الشجر بالخريف","p":24},{"t":"السما","p":20},{"t":"الحرباء","p":17},{"t":"الشعر مع العمر","p":15},{"t":"الفاكهة لما تستوي","p":13},{"t":"الجلد من الشمس","p":11}]},
  {id:167,q:"اذكر شي تسويه وانت منتظر دورك",a:[{"t":"تتصفح الجوال","p":26},{"t":"تقرا شي","p":22},{"t":"تسولف مع أحد","p":19},{"t":"تلعب لعبة","p":15},{"t":"تسمع بودكاست","p":11},{"t":"تتفرج على الناس","p":7}]},
  {id:168,q:"اذكر سبب يخلي بطارية الجوال تخلص بسرعة",a:[{"t":"كثر الاستخدام","p":27},{"t":"التطبيقات الشغالة","p":22},{"t":"الإضاءة عالية","p":18},{"t":"البطارية قديمة","p":14},{"t":"الألعاب","p":11},{"t":"الموقع والبلوتوث","p":8}]},
  {id:169,q:"اذكر شي يبي صبر طويل",a:[{"t":"تربية الأطفال","p":28},{"t":"الدراسة","p":23},{"t":"الصيام","p":18},{"t":"الزحمة","p":14},{"t":"الريجيم","p":10},{"t":"صيد السمك","p":7}]},
  {id:170,q:"اذكر شي يضحكك",a:[{"t":"نكتة","p":30},{"t":"موقف محرج","p":25},{"t":"مقطع مضحك","p":18},{"t":"تقليد أحد","p":12},{"t":"تصرف طفل","p":10},{"t":"ذكرى قديمة","p":5}]},
  {id:171,q:"اذكر شي يريّحك نفسياً",a:[{"t":"النوم","p":28},{"t":"الصلاة والدعا","p":23},{"t":"صوت البحر","p":18},{"t":"القراءة","p":14},{"t":"الهدوء","p":10},{"t":"قعدة مع الأهل","p":7}]},
  {id:172,q:"اذكر شي ثقيل",a:[{"t":"السيارة","p":26},{"t":"الفيل","p":22},{"t":"صخرة","p":19},{"t":"الثلاجة","p":15},{"t":"الحديد","p":11},{"t":"الخزنة","p":7}]},
  {id:173,q:"اذكر شي يتحرك ببطء",a:[{"t":"السلحفاة","p":30},{"t":"الحلزون","p":25},{"t":"السيارة بالزحمة","p":18},{"t":"النملة","p":12},{"t":"عقارب الساعة","p":10},{"t":"نمو النبات","p":5}]},
  {id:174,q:"اذكر شي سريع",a:[{"t":"الضو","p":35},{"t":"الصاروخ","p":25},{"t":"الفهد","p":18},{"t":"الطيارة","p":10},{"t":"البرق","p":7},{"t":"سيارة السباق","p":5}]},
  {id:175,q:"اذكر شي ما يخلو منه أي بيت",a:[{"t":"باب","p":26},{"t":"نوافذ","p":22},{"t":"حمام","p":19},{"t":"مطبخ","p":15},{"t":"كهربا","p":11},{"t":"ماء","p":7}]},
  {id:176,q:"اذكر شي الأطفال يحبونه كثير",a:[{"t":"الألعاب","p":30},{"t":"الحلويات","p":25},{"t":"الكرتون","p":18},{"t":"الملاهي","p":12},{"t":"التابلت","p":10},{"t":"العيدية","p":5}]},
  {id:177,q:"اذكر شي يدفيك بالشتا",a:[{"t":"البطانية","p":28},{"t":"كوب شاي أو قهوة","p":23},{"t":"الجاكيت","p":18},{"t":"الشمس","p":14},{"t":"النار والحطب","p":10},{"t":"حضن أمك","p":7}]},
  {id:178,q:"اذكر شي لونه أزرق",a:[{"t":"السما","p":32},{"t":"البحر","p":26},{"t":"الجينز","p":18},{"t":"علبة البيبسي","p":12},{"t":"كوكب الأرض","p":7},{"t":"العيون الزرقا","p":5}]},
  {id:179,q:"اذكر شي لونه أبيض",a:[{"t":"الثلج","p":32},{"t":"الحليب","p":26},{"t":"القطن","p":18},{"t":"السكر","p":12},{"t":"السحاب","p":7},{"t":"الملح","p":5}]},
  {id:180,q:"اذكر شي أصفر تلقاه بالمطبخ",a:[{"t":"الموز","p":21},{"t":"الليمون","p":19},{"t":"الزيت","p":18},{"t":"البيض من داخل","p":16},{"t":"الكركم","p":14},{"t":"الذرة","p":12}]},
  {id:181,q:"اذكر شي لونه أخضر",a:[{"t":"العشب والشجر","p":30},{"t":"التفاح الأخضر","p":25},{"t":"علم السعودية","p":18},{"t":"النعناع","p":12},{"t":"الفلفل الأخضر","p":10},{"t":"الخس","p":5}]},
  {id:182,q:"اذكر شي تلقاه بالحمام",a:[{"t":"الصابون والشامبو","p":32},{"t":"فرشاة ومعجون","p":26},{"t":"المنشفة","p":18},{"t":"المراية","p":12},{"t":"الدش","p":7},{"t":"سلة الغسيل","p":5}]},
  {id:183,q:"اذكر شي تلقاه بغرفة النوم",a:[{"t":"السرير","p":32},{"t":"الدولاب","p":26},{"t":"المخدة واللحاف","p":18},{"t":"المكيف","p":12},{"t":"الستارة","p":7},{"t":"الأباجورة","p":5}]},
  {id:184,q:"اذكر شي تلقاه بالصالة",a:[{"t":"التلفزيون","p":32},{"t":"الكنب","p":26},{"t":"الطاولة","p":18},{"t":"السجادة","p":12},{"t":"الريموت","p":7},{"t":"المكيف","p":5}]},
  {id:185,q:"اذكر أداة تستخدمها بالمطبخ",a:[{"t":"السكين","p":21},{"t":"الملعقة","p":19},{"t":"المقلاة","p":18},{"t":"القدر","p":16},{"t":"الخلاط","p":14},{"t":"لوح التقطيع","p":12}]},
  {id:186,q:"اذكر شي تلقاه بالمسجد",a:[{"t":"السجاد","p":28},{"t":"المحراب","p":23},{"t":"المنبر","p":18},{"t":"المصاحف","p":14},{"t":"مكبرات الصوت","p":10},{"t":"ثلاجة الماء","p":7}]},
  {id:187,q:"اذكر شي تلقاه بالمدرسة",a:[{"t":"الطلاب","p":28},{"t":"المعلمين","p":23},{"t":"الملعب","p":18},{"t":"المقصف","p":14},{"t":"المكتبة","p":10},{"t":"الطابور","p":7}]},
  {id:188,q:"اذكر شي ممنوع بالطيارة",a:[{"t":"التدخين","p":26},{"t":"سوايل كثيرة","p":22},{"t":"أدوات حادة","p":19},{"t":"الولاعة","p":15},{"t":"الوقوف وقت الإقلاع","p":11},{"t":"جوال بدون وضع الطيران","p":7}]},
  {id:189,q:"اذكر موقف يخليك متوتر",a:[{"t":"الاختبار","p":28},{"t":"المقابلة الوظيفية","p":23},{"t":"تتكلم قدام ناس","p":18},{"t":"تأخر رحلة الطيران","p":14},{"t":"نتيجة تحليل","p":10},{"t":"مكالمة من رقم غريب","p":7}]},
  {id:190,q:"اذكر شي تسويه قبل السفر بيوم",a:[{"t":"ترتب الشنطة","p":28},{"t":"تتأكد من الحجز","p":23},{"t":"تشحن كل شي","p":18},{"t":"تودع الأهل","p":14},{"t":"تصرف فلوس","p":10},{"t":"تطبع التذكرة","p":7}]},
  {id:191,q:"اذكر شي يعطيك طاقة",a:[{"t":"القهوة","p":26},{"t":"النوم الكافي","p":22},{"t":"الرياضة","p":19},{"t":"أكل صحي","p":15},{"t":"الشوكولاتة","p":11},{"t":"الماء","p":7}]},
  {id:192,q:"اذكر شي تحطه بالشاي",a:[{"t":"سكر","p":30},{"t":"نعناع","p":25},{"t":"حليب","p":18},{"t":"ليمون","p":12},{"t":"هيل","p":10},{"t":"عسل","p":5}]},
  {id:193,q:"اذكر شي تلقاه بالحديقة العامة",a:[{"t":"أشجار وورود","p":32},{"t":"ألعاب أطفال","p":26},{"t":"عشب","p":18},{"t":"مقاعد","p":12},{"t":"ممشى","p":7},{"t":"نافورة","p":5}]},
  {id:194,q:"اذكر شي يدخل بالقهوة العربية",a:[{"t":"الهيل","p":21},{"t":"البن","p":19},{"t":"الزعفران","p":18},{"t":"القرنفل","p":16},{"t":"الزنجبيل","p":14},{"t":"ماء الورد","p":12}]},
  {id:195,q:"اذكر شي الناس تحطه على أكلها",a:[{"t":"ملح","p":26},{"t":"فلفل أسود","p":22},{"t":"كاتشب","p":19},{"t":"ليمون","p":15},{"t":"شطة","p":11},{"t":"مايونيز","p":7}]},
  {id:196,q:"اذكر شي يخلي البيت نظيف ومرتب",a:[{"t":"التنظيف اليومي","p":32},{"t":"ترتيب الأغراض","p":26},{"t":"المكنسة الكهربائية","p":18},{"t":"المسّاحة","p":12},{"t":"المعطر","p":7},{"t":"سلة الزبالة","p":5}]},
  {id:197,q:"اذكر شي الناس تتمناه بحياتها",a:[{"t":"الصحة","p":28},{"t":"الفلوس","p":23},{"t":"راحة البال","p":18},{"t":"النجاح","p":14},{"t":"بيت","p":10},{"t":"ذرية صالحة","p":7}]},
  {id:198,q:"اذكر شي تلقاه بالمحفظة",a:[{"t":"فلوس","p":30},{"t":"بطاقة البنك","p":25},{"t":"الهوية","p":18},{"t":"رخصة القيادة","p":12},{"t":"صور","p":10},{"t":"كروت المحلات","p":5}]},
  {id:199,q:"اذكر شي الناس تخاف منه",a:[{"t":"الموت","p":28},{"t":"الحشرات","p":23},{"t":"الظلام","p":18},{"t":"المرتفعات","p":14},{"t":"الأماكن المغلقة","p":10},{"t":"الثعابين","p":7}]},
  {id:200,q:"اذكر شي تعدّيه السيارة بسهولة وانت تسوق",a:[{"t":"مخرج الطريق","p":24},{"t":"لوحة إرشادية","p":20},{"t":"المطب","p":17},{"t":"إشارة حمرا","p":15},{"t":"كمين سرعة","p":13},{"t":"وجه واحد تعرفه","p":11}]},
  {id:201,q:"اذكر شي ما تخلو منه أي سيارة",a:[{"t":"المرايات","p":26},{"t":"المقاعد","p":22},{"t":"حزام الأمان","p":19},{"t":"المساحات","p":15},{"t":"الإطار الاحتياطي","p":11},{"t":"الريموت","p":7}]},
  {id:202,q:"اذكر شي يلفت انتباهك بسرعة",a:[{"t":"صوت عالي فجأة","p":22},{"t":"ألوان زاهية","p":20},{"t":"حركة قدامك","p":18},{"t":"ضو قوي","p":16},{"t":"ريحة قوية","p":13},{"t":"أحد ينادي اسمك","p":11}]},
  {id:203,q:"اذكر شي يخليك تحس بالأمان",a:[{"t":"وجود أهلك","p":26},{"t":"بيتك","p":22},{"t":"التوكل على الله","p":19},{"t":"فلوس بالحساب","p":15},{"t":"صديق تثق فيه","p":11},{"t":"تقفل الباب","p":7}]},
  {id:204,q:"اذكر شي يرن أو يصفر",a:[{"t":"الجوال","p":30},{"t":"المنبه","p":25},{"t":"جرس الباب","p":18},{"t":"الهاتف","p":12},{"t":"المايكرويف","p":10},{"t":"جهاز الإنذار","p":5}]},
  {id:205,q:"اذكر شي يحتاج شحن",a:[{"t":"الجوال","p":32},{"t":"اللابتوب","p":26},{"t":"الساعة الذكية","p":18},{"t":"السماعات","p":12},{"t":"السيارة الكهربائية","p":7},{"t":"الباور بانك","p":5}]},
  {id:206,q:"اذكر سبب يخلي الموظف يترك شغله",a:[{"t":"الراتب قليل","p":28},{"t":"ضغط زايد","p":23},{"t":"فرصة أحسن","p":18},{"t":"مدير ما يطاق","p":14},{"t":"ملل وروتين","p":10},{"t":"بعد المسافة","p":7}]},
  {id:207,q:"اذكر شي يخليك فخور بنفسك",a:[{"t":"نجاح حققته","p":26},{"t":"تفرّح أهلك","p":22},{"t":"إنجاز صعب","p":19},{"t":"تساعد محتاج","p":15},{"t":"التخرج","p":11},{"t":"تترك عادة سيئة","p":7}]},
  {id:208,q:"اذكر شي ممتع بالشتا",a:[{"t":"صوت المطر","p":28},{"t":"جلسة نار وحطب","p":23},{"t":"قهوة ساخنة","p":18},{"t":"البرد المنعش","p":14},{"t":"التلحف بالبطانية","p":10},{"t":"الشوربة","p":7}]},
  {id:209,q:"اذكر شي ما تقدر تعيش بدونه",a:[{"t":"الماء","p":28},{"t":"الأهل","p":23},{"t":"الصحة","p":18},{"t":"النوم","p":14},{"t":"الهوا","p":10},{"t":"الأكل","p":7}]},
  {id:210,q:"اذكر شي يبي تخطيط من بدري",a:[{"t":"السفر","p":26},{"t":"الزواج","p":22},{"t":"بناء بيت","p":19},{"t":"الدراسة","p":15},{"t":"حفلة أو مناسبة","p":11},{"t":"ميزانية الشهر","p":7}]},
  {id:211,q:"اذكر كلمة الناس تحب تسمعها",a:[{"t":"أحبك","p":28},{"t":"شكراً","p":23},{"t":"ما قصرت","p":18},{"t":"أنا فخور فيك","p":14},{"t":"مبروك","p":10},{"t":"عندك عيدية","p":7}]},
  {id:212,q:"اذكر شي تحس فيه وانت صايم",a:[{"t":"الجوع","p":26},{"t":"العطش","p":22},{"t":"الخمول والتعب","p":19},{"t":"صداع خفيف","p":15},{"t":"ريحة الفم","p":11},{"t":"الخشوع","p":7}]},
  {id:213,q:"اذكر صفة تحبها بالشخص",a:[{"t":"الصدق","p":22},{"t":"الكرم","p":20},{"t":"طيبة القلب","p":18},{"t":"الصبر","p":16},{"t":"التواضع","p":13},{"t":"خفة الدم","p":11}]},
  {id:214,q:"اذكر شي يخلي الجو حلو",a:[{"t":"المطر","p":32},{"t":"البرد والنسيم","p":26},{"t":"الغيوم","p":18},{"t":"الضباب","p":12},{"t":"الهوا الخفيف","p":7},{"t":"الشمس الدافية","p":5}]},
  {id:215,q:"اذكر سيارة دفع رباعي",a:[{"t":"لاندكروزر","p":21},{"t":"باترول","p":19},{"t":"برادو","p":18},{"t":"جيب رانجلر","p":16},{"t":"تاهو","p":14},{"t":"يوكن","p":12}]},
  {id:216,q:"اذكر شي ما يصير بدون ماء",a:[{"t":"الزراعة","p":28},{"t":"الطبخ","p":23},{"t":"الوضوء","p":18},{"t":"غسيل الملابس","p":14},{"t":"السباحة","p":10},{"t":"الحياة نفسها","p":7}]},
  {id:217,q:"اذكر سبب ينقطع فيه الإنترنت",a:[{"t":"مشكلة بالراوتر","p":26},{"t":"صيانة بالشبكة","p":22},{"t":"الفاتورة ما انسددت","p":19},{"t":"كيبل مقطوع","p":15},{"t":"ضغط على الشبكة","p":11},{"t":"جو سيء","p":7}]},
  {id:218,q:"اذكر أداة من صندوق العدة",a:[{"t":"المفك","p":21},{"t":"الشاكوش","p":19},{"t":"الكماشة","p":18},{"t":"المفتاح الإنجليزي","p":16},{"t":"المتر","p":14},{"t":"الدريل","p":12}]},
  {id:219,q:"اذكر شي تحتاجه بالكشتة",a:[{"t":"الخيمة","p":28},{"t":"الكشاف","p":23},{"t":"حطب","p":18},{"t":"ماء وأكل","p":14},{"t":"فراش وبطانيات","p":10},{"t":"فحم للشوي","p":7}]},
  {id:220,q:"اذكر شي يخلي المذاكرة أسهل",a:[{"t":"تنظيم الوقت","p":26},{"t":"تبدأ من بدري","p":22},{"t":"تسوي ملخصات","p":19},{"t":"مكان هادي","p":15},{"t":"تفهم من المعلم","p":11},{"t":"تذاكر مع صاحبك","p":7}]},
  {id:221,q:"اذكر سبب تتعطل فيه السيارة",a:[{"t":"بنشر","p":28},{"t":"خلص البنزين","p":23},{"t":"البطارية","p":18},{"t":"حرارة المكينة","p":14},{"t":"الزيت","p":10},{"t":"فيوز أو كهربا","p":7}]},
  {id:222,q:"اذكر شي يخلي الرحلة مملة",a:[{"t":"طريق طويل بدون وقفة","p":27},{"t":"ما فيه سوالف","p":22},{"t":"الزحمة","p":18},{"t":"ما فيه إنترنت","p":14},{"t":"ما فيه أكل","p":11},{"t":"الحر","p":8}]},
  {id:223,q:"اذكر شي يخليك تنسى الوقت",a:[{"t":"الجوال","p":28},{"t":"الألعاب","p":23},{"t":"كتاب حلو","p":18},{"t":"قعدة مع الأصحاب","p":14},{"t":"السفر","p":10},{"t":"شغل تحبه","p":7}]},
  {id:224,q:"اذكر شي تحبه ببلدك",a:[{"t":"الأمان","p":28},{"t":"الأهل","p":23},{"t":"الحرمين","p":18},{"t":"الكرم والعادات","p":14},{"t":"الأكل الشعبي","p":10},{"t":"جو الشتا","p":7}]},
  {id:225,q:"اذكر شي بسيط يرفع معنوياتك بسرعة",a:[{"t":"كلمة تشجيع","p":24},{"t":"رسالة من شخص تحبه","p":20},{"t":"مشي بالهوا","p":17},{"t":"موسيقى أو أنشودة تحبها","p":15},{"t":"دش بارد","p":13},{"t":"تنجز شي مؤجل","p":11}]},
  {id:226,q:"اذكر شي تلقاه بالمكتبة",a:[{"t":"الكتب","p":28},{"t":"الرفوف","p":23},{"t":"طاولات وكراسي","p":18},{"t":"الهدوء","p":14},{"t":"المجلات","p":10},{"t":"الكمبيوترات","p":7}]},
  {id:227,q:"اذكر شي موجود بالفضا",a:[{"t":"النجوم","p":30},{"t":"الكواكب","p":25},{"t":"القمر","p":18},{"t":"الشمس","p":12},{"t":"المجرات","p":10},{"t":"الأقمار الصناعية","p":5}]},
  {id:228,q:"اذكر سبب يخلي الناس تحب القهوة",a:[{"t":"تصحّيك وتنشّطك","p":28},{"t":"طعمها","p":23},{"t":"عادة يومية","p":18},{"t":"القعدة اللي معها","p":14},{"t":"ريحتها","p":10},{"t":"تساعدك تركز","p":7}]},
  {id:229,q:"اذكر شي الناس تصوره بجوالها",a:[{"t":"الأكل","p":26},{"t":"سيلفي","p":22},{"t":"المناظر","p":19},{"t":"المناسبات","p":15},{"t":"الأطفال","p":11},{"t":"الغروب","p":7}]},
  {id:230,q:"اذكر شي تعلمته من الإنترنت",a:[{"t":"وصفة طبخ","p":27},{"t":"تصليح شي بالبيت","p":22},{"t":"لغة جديدة","p":18},{"t":"برمجة أو تصميم","p":14},{"t":"تمارين رياضة","p":11},{"t":"مهارة شغل","p":8}]},
  {id:231,q:"اذكر شي تلقاه بأي كافيه",a:[{"t":"قهوة بأنواعها","p":28},{"t":"كراسي وطاولات","p":23},{"t":"واي فاي","p":18},{"t":"كيك وحلا","p":14},{"t":"البارستا","p":10},{"t":"موسيقى هادية","p":7}]},
  {id:232,q:"اذكر شي ما تستغني عنه بالصيف",a:[{"t":"المكيف","p":32},{"t":"ماء بارد","p":26},{"t":"نظارة الشمس","p":18},{"t":"الآيس كريم","p":12},{"t":"المسبح","p":7},{"t":"واقي الشمس","p":5}]},
  {id:233,q:"اذكر شي الناس تخاف تخسره",a:[{"t":"الصحة","p":28},{"t":"الأهل","p":23},{"t":"الفلوس","p":18},{"t":"الوظيفة","p":14},{"t":"سمعته","p":10},{"t":"أصدقائه","p":7}]},
  {id:234,q:"اذكر شي تلقاه بالمستشفى",a:[{"t":"أسرّة المرضى","p":35},{"t":"دكاترة وممرضين","p":25},{"t":"أجهزة طبية","p":18},{"t":"أدوية","p":10},{"t":"العيادات","p":7},{"t":"الإسعاف","p":5}]},
  {id:235,q:"اذكر شي تلقاه بالبنك",a:[{"t":"الصراف الآلي","p":26},{"t":"الموظفين","p":22},{"t":"الكاونترات","p":19},{"t":"الحارس","p":15},{"t":"طابور الانتظار","p":11},{"t":"البطاقات","p":7}]},
  {id:236,q:"اذكر شي تلقاه بالملاهي",a:[{"t":"ألعاب كهربائية","p":30},{"t":"أطفال وعوايل","p":25},{"t":"آيس كريم وحلا","p":18},{"t":"بالونات","p":12},{"t":"التذاكر","p":10},{"t":"الزحمة","p":5}]},
  {id:237,q:"اذكر شي يخلي الأكل ألذ",a:[{"t":"البهارات","p":26},{"t":"الملح بالقدر","p":22},{"t":"عصرة ليمون","p":19},{"t":"الصلصة","p":15},{"t":"نار هادية","p":11},{"t":"إنك جوعان","p":7}]},
  {id:238,q:"اذكر شي تلقاه بالفندق",a:[{"t":"الغرف","p":32},{"t":"الاستقبال","p":26},{"t":"المسبح","p":18},{"t":"المطعم","p":12},{"t":"الواي فاي","p":7},{"t":"خدمة الغرف","p":5}]},
  {id:239,q:"اذكر شي تلقاه بمحل العطور",a:[{"t":"عطور","p":27},{"t":"بخور","p":22},{"t":"دهن العود","p":18},{"t":"العود الخام","p":14},{"t":"المبخرة","p":11},{"t":"علب الهدايا","p":8}]},
  {id:240,q:"اذكر نوع تمر سعودي",a:[{"t":"السكري","p":32},{"t":"العجوة","p":26},{"t":"الخلاص","p":18},{"t":"الصقعي","p":12},{"t":"المجدول","p":7},{"t":"برحي","p":5}]},
  {id:241,q:"اذكر شي يميز الشخص الناجح",a:[{"t":"يتعب ويجتهد","p":22},{"t":"ما يستسلم","p":20},{"t":"يخطط","p":18},{"t":"يقرا ويتعلم","p":16},{"t":"ينظم وقته","p":13},{"t":"يتحمل المسؤولية","p":11}]},
  {id:242,q:"اذكر شي الناس تأجله وما تسويه أبداً",a:[{"t":"الرياضة","p":24},{"t":"ترتيب الدولاب","p":20},{"t":"فحص السيارة","p":17},{"t":"الدكتور","p":15},{"t":"الرد على رسالة","p":13},{"t":"قراءة كتاب شراه","p":11}]},
  {id:243,q:"اذكر شي تلقاه بالباص",a:[{"t":"المقاعد","p":26},{"t":"السواق","p":22},{"t":"التكييف","p":19},{"t":"الشبابيك","p":15},{"t":"ماسكات اليد","p":11},{"t":"شاشة أو راديو","p":7}]},
  {id:244,q:"اذكر شي يوزعونه بالأعراس",a:[{"t":"شوكولاتة","p":32},{"t":"عصيرات","p":26},{"t":"قهوة وتمر","p":18},{"t":"بخور","p":12},{"t":"ورد","p":7},{"t":"علب هدايا","p":5}]},
  {id:245,q:"اذكر شي يشتريه المعرس",a:[{"t":"شبكة ذهب","p":26},{"t":"أثاث البيت","p":22},{"t":"سيارة","p":19},{"t":"ملابس العرس","p":15},{"t":"عطور","p":11},{"t":"ثلاجة وغسالة","p":7}]},
  {id:246,q:"اذكر شي تسويه بنهاية الأسبوع",a:[{"t":"تنام وترتاح","p":27},{"t":"تطلع مع أصحابك","p":22},{"t":"مطعم أو كافيه","p":18},{"t":"تنظف البيت","p":14},{"t":"تزور الأهل","p":11},{"t":"تتسوق","p":8}]},
  {id:247,q:"اذكر شي تشتريه أونلاين",a:[{"t":"ملابس وجزم","p":26},{"t":"إلكترونيات","p":22},{"t":"أكل","p":19},{"t":"كتب","p":15},{"t":"مستحضرات تجميل","p":11},{"t":"أثاث","p":7}]},
  {id:248,q:"اذكر شي ما تخلو منه أي حفلة",a:[{"t":"الأكل والحلا","p":30},{"t":"الناس","p":25},{"t":"الأغاني","p":18},{"t":"الكيكة","p":12},{"t":"التصوير","p":10},{"t":"الزينة والبالونات","p":5}]},
  {id:249,q:"اذكر شي يتعلمه الطفل أول شي",a:[{"t":"المشي","p":32},{"t":"الكلام","p":26},{"t":"ياكل بنفسه","p":18},{"t":"الألوان","p":12},{"t":"بابا وماما","p":7},{"t":"الحروف والأرقام","p":5}]},
  {id:250,q:"اذكر شي تلقاه بالشاطئ",a:[{"t":"الرمل","p":32},{"t":"البحر","p":26},{"t":"الشمسية","p":18},{"t":"العوايل","p":12},{"t":"الأصداف","p":7},{"t":"كراسي","p":5}]},
  {id:251,q:"اذكر شي تلقاه بقاعة الأفراح",a:[{"t":"الكوشة","p":26},{"t":"المعازيم","p":22},{"t":"بوفيه الأكل","p":19},{"t":"الورد والزينة","p":15},{"t":"المصور","p":11},{"t":"الطبل والزفة","p":7}]},
  {id:252,q:"اذكر شي تسويه صباح العيد",a:[{"t":"صلاة العيد","p":30},{"t":"تلبس جديد","p":25},{"t":"تعايد أهلك","p":18},{"t":"فطور جماعي","p":12},{"t":"توزع عيديات","p":10},{"t":"تتصور","p":5}]},
  {id:253,q:"اذكر شي تسويه قبل الاختبار",a:[{"t":"تذاكر وتراجع","p":28},{"t":"تدعي","p":23},{"t":"تنام بدري","p":18},{"t":"تقرا الملخص","p":14},{"t":"تشرب قهوة","p":10},{"t":"تجهز أدواتك","p":7}]},
  {id:254,q:"اذكر سبب يخلي الواحد يفقد أعصابه",a:[{"t":"الزحمة","p":28},{"t":"الظلم","p":23},{"t":"تكرار الإزعاج","p":18},{"t":"طول الانتظار","p":14},{"t":"الجوع","p":10},{"t":"قلة النوم","p":7}]},
  {id:255,q:"اذكر شي تحبه الأمهات",a:[{"t":"سعادة عيالها","p":26},{"t":"البيت مرتب","p":22},{"t":"الهدوء","p":19},{"t":"تطبخ لأهلها","p":15},{"t":"يتصلون عليها","p":11},{"t":"يسمعون كلامها","p":7}]},
  {id:256,q:"اذكر شي يخليك مبسوط بشغلك",a:[{"t":"الراتب","p":28},{"t":"الزملا الطيبين","p":23},{"t":"تقدير المدير","p":18},{"t":"الإنجاز","p":14},{"t":"مرونة الدوام","p":10},{"t":"الإجازات","p":7}]},
  {id:257,q:"اذكر شي تسويه بأول يوم بالسنة الجديدة",a:[{"t":"تحط أهداف","p":27},{"t":"تعايد أهلك وأصحابك","p":22},{"t":"تسافر أو تتنزه","p":18},{"t":"تتفاءل","p":14},{"t":"تبدأ عادة جديدة","p":11},{"t":"ترتب حساباتك","p":8}]},
  {id:258,q:"اذكر موقف يخليك تحس بالغيرة",a:[{"t":"نجاح صاحبك فجأة","p":22},{"t":"قريبك شرى سيارة جديدة","p":20},{"t":"ترقية زميلك","p":18},{"t":"أهلك يقارنونك بغيرك","p":16},{"t":"أحد سافر وأنت ما تقدر","p":13},{"t":"حظ واحد ثاني","p":11}]},
  {id:259,q:"اذكر سبب تنتهي فيه الصداقة",a:[{"t":"الخيانة وكشف الأسرار","p":28},{"t":"الكذب","p":23},{"t":"الغيرة والحسد","p":18},{"t":"البعد وقلة التواصل","p":14},{"t":"سوء فهم","p":10},{"t":"المصالح","p":7}]},
  {id:260,q:"اذكر كلمة تقولها وقت الصلح",a:[{"t":"سامحني","p":30},{"t":"ما قصدت","p":25},{"t":"خلاص نسينا اللي صار","p":18},{"t":"أنا غلطان","p":12},{"t":"تعال نبدأ من جديد","p":10},{"t":"اشتقت لك","p":5}]},
  {id:261,q:"اذكر شي تسويه لصاحبك وهو مريض",a:[{"t":"تزوره","p":28},{"t":"تتصل تطمن عليه","p":23},{"t":"توديله أكل","p":18},{"t":"تدعي له","p":14},{"t":"تساعده بأغراضه","p":10},{"t":"تقعد تسولف معه","p":7}]},
  {id:262,q:"اذكر سبب يخلي الزوجين يتخانقون",a:[{"t":"سوء تفاهم","p":26},{"t":"الفلوس","p":22},{"t":"تربية العيال","p":19},{"t":"قلة الوقت مع بعض","p":15},{"t":"تدخل الأهل","p":11},{"t":"الغيرة","p":7}]},
  {id:263,q:"اذكر شي يفرح الجد أو الجدة",a:[{"t":"زيارة الأحفاد","p":30},{"t":"لمّة العائلة","p":25},{"t":"خبر مولود جديد","p":18},{"t":"يتصلون عليهم","p":12},{"t":"تخرج أحد أحفادهم","p":10},{"t":"يوزعون عيديات","p":5}]},
  {id:264,q:"اذكر شي يميز الأخ الكبير بالعائلة",a:[{"t":"يحس بمسؤولية","p":21},{"t":"يوجّه إخوانه","p":19},{"t":"يشيل هم البيت","p":18},{"t":"قدوة لهم","p":16},{"t":"أول من يجرب كل شي","p":14},{"t":"يدافع عنهم","p":12}]},
  {id:265,q:"اذكر سبب يخلي الواحد يعتذر",a:[{"t":"جرح مشاعر أحد","p":26},{"t":"تأخر عن موعد","p":22},{"t":"غلط بالشغل","p":19},{"t":"نسي مناسبة","p":15},{"t":"كلمة طلعت بدون قصد","p":11},{"t":"ما رد على أحد","p":7}]},
  {id:266,q:"اذكر شي تسويه أول ما تدخل بيت أحد أول مرة",a:[{"t":"تسلم على الكل","p":27},{"t":"تخلع جزمتك","p":22},{"t":"تمدح البيت","p":18},{"t":"تجيب هدية","p":14},{"t":"تسأل وين تقعد","p":11},{"t":"تشكرهم على الدعوة","p":8}]},
  {id:267,q:"اذكر شي يدل إن الواحد يكذب",a:[{"t":"كلامه يتغير","p":22},{"t":"ما يطالعك بعينك","p":20},{"t":"يتلخبط وهو يحكي","p":18},{"t":"التفاصيل ما تتطابق","p":16},{"t":"يتهرب من الأسئلة","p":13},{"t":"يرد بسرعة زايدة","p":11}]},
  {id:268,q:"اذكر شي تسويه عشان تفرّح شريك حياتك",a:[{"t":"تسمع له","p":28},{"t":"هدية مفاجئة","p":23},{"t":"تقضي وقت معه","p":18},{"t":"تساعده بالبيت","p":14},{"t":"تمدحه","p":10},{"t":"تطلعون روقان","p":7}]},
  {id:269,q:"اذكر سبب يبعّد الأصدقاء مع الوقت",a:[{"t":"الانشغال بالشغل","p":24},{"t":"الزواج والأولويات","p":20},{"t":"تغيّر الاهتمامات","p":17},{"t":"السفر والانتقال","p":15},{"t":"خلاف ما انحل","p":13},{"t":"الكسل بالتواصل","p":11}]},
  {id:270,q:"اذكر أكلة إيطالية",a:[{"t":"البيتزا","p":35},{"t":"الباستا","p":25},{"t":"اللازانيا","p":18},{"t":"الريزوتو","p":10},{"t":"التيراميسو","p":7},{"t":"الكانيلوني","p":5}]},
  {id:271,q:"اذكر أكلة مكسيكية",a:[{"t":"التاكو","p":32},{"t":"البوريتو","p":26},{"t":"الناتشوز","p":18},{"t":"الكساديا","p":12},{"t":"الفاهيتا","p":7},{"t":"الجواكامولي","p":5}]},
  {id:272,q:"اذكر أكلة آسيوية مشهورة",a:[{"t":"السوشي","p":21},{"t":"النودلز","p":19},{"t":"الرامن","p":18},{"t":"الكاري","p":16},{"t":"الدمبلينج","p":14},{"t":"سبرينج رول","p":12}]},
  {id:273,q:"اذكر نوع سلطة",a:[{"t":"سلطة سيزر","p":22},{"t":"التبولة","p":20},{"t":"الفتوش","p":18},{"t":"سلطة خضرا","p":16},{"t":"الزبادي بالخيار","p":13},{"t":"سلطة الجرجير","p":11}]},
  {id:274,q:"اذكر نوع شوربة",a:[{"t":"شوربة العدس","p":24},{"t":"شوربة الخضار","p":20},{"t":"شوربة الدجاج","p":17},{"t":"شوربة الطماطم","p":15},{"t":"شوربة الشوفان","p":13},{"t":"شوربة الفطر","p":11}]},
  {id:275,q:"اذكر حلا غربي مشهور",a:[{"t":"الكيك","p":26},{"t":"الدونات","p":22},{"t":"البراوني","p":19},{"t":"الكوكيز","p":15},{"t":"الآيس كريم","p":11},{"t":"الوافل","p":7}]},
  {id:276,q:"اذكر فطور غربي",a:[{"t":"البان كيك","p":22},{"t":"البيض والبيكون","p":20},{"t":"الوافل","p":18},{"t":"السيريال","p":16},{"t":"التوست بالمربى","p":13},{"t":"الأومليت","p":11}]},
  {id:277,q:"اذكر مكوّن أساسي بالكبسة",a:[{"t":"الرز","p":35},{"t":"اللحم أو الدجاج","p":25},{"t":"البهارات","p":18},{"t":"البصل","p":10},{"t":"الطماطم","p":7},{"t":"اللومي","p":5}]},
  {id:278,q:"اذكر نوع رز",a:[{"t":"البسمتي","p":24},{"t":"المزة","p":20},{"t":"الينابيع","p":17},{"t":"الأرز الأسمر","p":15},{"t":"الأرز المصري","p":13},{"t":"الجاسمين","p":11}]},
  {id:279,q:"اذكر أكلة بحرية",a:[{"t":"السمك المشوي","p":22},{"t":"الربيان","p":20},{"t":"سيادية بالسمك","p":18},{"t":"الكابوريا","p":16},{"t":"الحبار","p":13},{"t":"السمك المقلي","p":11}]},
  {id:280,q:"اذكر مشروب غازي",a:[{"t":"بيبسي","p":32},{"t":"كوكاكولا","p":26},{"t":"سفن أب","p":18},{"t":"فانتا","p":12},{"t":"ميرندا","p":7},{"t":"سبرايت","p":5}]},
  {id:281,q:"اذكر حلاوة يحبها الأطفال",a:[{"t":"الشوكولاتة","p":26},{"t":"السكاكر الملونة","p":22},{"t":"العلكة","p":19},{"t":"المصاصة","p":15},{"t":"الجيلي","p":11},{"t":"الآيس كريم","p":7}]},
  {id:282,q:"اذكر شي يتضاف للقهوة العادية",a:[{"t":"حليب","p":22},{"t":"سكر","p":20},{"t":"كريمة","p":18},{"t":"كراميل","p":16},{"t":"قرفة","p":13},{"t":"فانيلا","p":11}]},
  {id:283,q:"اذكر نوع معجنات",a:[{"t":"فطاير بالجبن","p":24},{"t":"السمبوسة","p":20},{"t":"الكرواسون","p":17},{"t":"فطيرة سبانخ","p":15},{"t":"المناقيش","p":13},{"t":"الكيش","p":11}]},
  {id:284,q:"اذكر أكلة يحبها أغلب الأطفال",a:[{"t":"البيتزا","p":30},{"t":"البرجر","p":25},{"t":"الدجاج المقلي","p":18},{"t":"المكرونة","p":12},{"t":"الناجتس","p":10},{"t":"البطاطس","p":5}]},
  {id:285,q:"اذكر بهار يدخل بالأكل الهندي",a:[{"t":"الكاري","p":21},{"t":"الكركم","p":19},{"t":"الكزبرة","p":18},{"t":"الهيل","p":16},{"t":"الفلفل الحار","p":14},{"t":"الكمون","p":12}]},
  {id:286,q:"اذكر مشروب يتقدم بالمناسبات السعودية",a:[{"t":"القهوة العربية","p":26},{"t":"الشاي","p":22},{"t":"عصير ليمون بالنعناع","p":19},{"t":"القهوة التركية","p":15},{"t":"السحلب","p":11},{"t":"التمر هندي","p":7}]},
  {id:287,q:"اذكر أكلة مصرية شعبية",a:[{"t":"الكشري","p":21},{"t":"الفول والطعمية","p":19},{"t":"الملوخية","p":18},{"t":"المحشي","p":16},{"t":"الحمام المحشي","p":14},{"t":"الفطير المشلتت","p":12}]},
  {id:288,q:"اذكر أكلة شامية",a:[{"t":"الحمص","p":22},{"t":"الكبة","p":20},{"t":"الشاورما","p":18},{"t":"الفتوش","p":16},{"t":"المجدرة","p":13},{"t":"ورق العنب","p":11}]},
  {id:289,q:"اذكر أكلة يمنية",a:[{"t":"المندي","p":22},{"t":"السلتة","p":20},{"t":"الفحسة","p":18},{"t":"العصيد","p":16},{"t":"الشفوت","p":13},{"t":"بنت الصحن","p":11}]},
  {id:290,q:"اذكر ملعب كرة قدم مشهور",a:[{"t":"الملك فهد الدولي","p":21},{"t":"سانتياغو برنابيو","p":19},{"t":"كامب نو","p":18},{"t":"أولد ترافورد","p":16},{"t":"لوسيل","p":14},{"t":"ويمبلي","p":12}]},
  {id:291,q:"اذكر مركز من مراكز كرة القدم",a:[{"t":"مهاجم","p":32},{"t":"حارس مرمى","p":26},{"t":"مدافع","p":18},{"t":"لاعب وسط","p":12},{"t":"ظهير","p":7},{"t":"جناح","p":5}]},
  {id:292,q:"اذكر بطولة تلعبها الأندية أو المنتخبات بآسيا والخليج",a:[{"t":"دوري أبطال آسيا","p":28},{"t":"كاس آسيا","p":23},{"t":"كاس الخليج","p":18},{"t":"كاس العرب","p":14},{"t":"كاس الملك","p":10},{"t":"السوبر السعودي","p":7}]},
  {id:293,q:"اذكر شي يستخدمه لاعب التنس",a:[{"t":"المضرب","p":21},{"t":"الكرة","p":19},{"t":"الشبكة","p":18},{"t":"جزمة خاصة","p":16},{"t":"العصابة","p":14},{"t":"منشفة","p":12}]},
  {id:294,q:"اذكر رياضة الفوز فيها يتحدد بالثواني",a:[{"t":"العدو 100 متر","p":22},{"t":"السباحة","p":20},{"t":"سباق السيارات","p":18},{"t":"سباق الدراجات","p":16},{"t":"سباق الخيل","p":13},{"t":"التزلج السريع","p":11}]},
  {id:295,q:"اذكر مدرب كرة قدم عالمي",a:[{"t":"بيب غوارديولا","p":24},{"t":"كلوب","p":20},{"t":"أنشيلوتي","p":17},{"t":"مورينيو","p":15},{"t":"زيدان","p":13},{"t":"سيميوني","p":11}]},
  {id:296,q:"اذكر شي يصير لما فريق يفوز ببطولة",a:[{"t":"احتفال الجماهير","p":30},{"t":"يرفعون الكاس","p":25},{"t":"ميداليات","p":18},{"t":"مسيرة بالمدينة","p":12},{"t":"مكافآت للاعبين","p":10},{"t":"مؤتمر صحفي","p":5}]},
  {id:297,q:"اذكر لعبة تلعبها بيدك بس",a:[{"t":"كرة اليد","p":22},{"t":"كرة السلة","p":20},{"t":"الكرة الطايرة","p":18},{"t":"البولينغ","p":16},{"t":"التنس الطاولة","p":13},{"t":"الملاكمة","p":11}]},
  {id:298,q:"اذكر بطل ملاكمة أو فنون قتالية مشهور",a:[{"t":"محمد علي كلاي","p":24},{"t":"مايك تايسون","p":20},{"t":"خبيب نورمحمدوف","p":17},{"t":"كونور ماكريغور","p":15},{"t":"ماني باكياو","p":13},{"t":"فلويد مايويذر","p":11}]},
  {id:299,q:"اذكر شي يحتاجه الغواص",a:[{"t":"أسطوانة الأكسجين","p":24},{"t":"النظارة","p":20},{"t":"الزعانف","p":17},{"t":"بدلة الغوص","p":15},{"t":"أنبوب التنفس","p":13},{"t":"حزام الأوزان","p":11}]},
  {id:300,q:"اذكر شي يسويه الناس بالجيم",a:[{"t":"حديد وأوزان","p":35},{"t":"مشاية","p":25},{"t":"تمارين كارديو","p":18},{"t":"يوغا","p":10},{"t":"سباحة","p":7},{"t":"تمارين بطن","p":5}]},
  {id:301,q:"اذكر بطولة أو حدث رياضي سعودي",a:[{"t":"دوري روشن","p":26},{"t":"كاس الملك","p":22},{"t":"كاس ولي العهد","p":19},{"t":"رالي داكار","p":15},{"t":"فورمولا 1 جدة","p":11},{"t":"السوبر الإيطالي بالرياض","p":7}]},
  {id:302,q:"اذكر دولة تشتهر بصناعة السيارات",a:[{"t":"اليابان","p":21},{"t":"ألمانيا","p":19},{"t":"كوريا الجنوبية","p":18},{"t":"أمريكا","p":16},{"t":"إيطاليا","p":14},{"t":"الصين","p":12}]},
  {id:303,q:"اذكر ماركة ساعات فخمة",a:[{"t":"رولكس","p":22},{"t":"أوميغا","p":20},{"t":"كارتييه","p":18},{"t":"تاغ هوير","p":16},{"t":"باتيك فيليب","p":13},{"t":"هوبلو","p":11}]},
  {id:304,q:"اذكر دولة تشتهر بالشاي",a:[{"t":"الصين","p":22},{"t":"الهند","p":20},{"t":"سريلانكا","p":18},{"t":"تركيا","p":16},{"t":"بريطانيا","p":13},{"t":"اليابان","p":11}]},
  {id:305,q:"اذكر دولة باردة ومعروفة بالثلوج",a:[{"t":"روسيا","p":21},{"t":"كندا","p":19},{"t":"النرويج","p":18},{"t":"السويد","p":16},{"t":"فنلندا","p":14},{"t":"سويسرا","p":12}]},
  {id:306,q:"اذكر جزيرة سياحية مشهورة",a:[{"t":"المالديف","p":28},{"t":"بالي","p":23},{"t":"هاواي","p":18},{"t":"سيشل","p":14},{"t":"سانتوريني","p":10},{"t":"فرسان","p":7}]},
  {id:307,q:"اذكر عملة أجنبية مشهورة",a:[{"t":"الدولار","p":32},{"t":"اليورو","p":26},{"t":"الجنيه الإسترليني","p":18},{"t":"الين الياباني","p":12},{"t":"اليوان الصيني","p":7},{"t":"الفرنك السويسري","p":5}]},
  {id:308,q:"اذكر معلم سياحي عالمي",a:[{"t":"برج إيفل","p":21},{"t":"تمثال الحرية","p":19},{"t":"سور الصين العظيم","p":18},{"t":"برج بيزا المايل","p":16},{"t":"تاج محل","p":14},{"t":"الأهرامات","p":12}]},
  {id:309,q:"اذكر دولة عربية بآسيا",a:[{"t":"الأردن","p":22},{"t":"العراق","p":20},{"t":"سوريا","p":18},{"t":"لبنان","p":16},{"t":"اليمن","p":13},{"t":"عُمان","p":11}]},
  {id:310,q:"اذكر مدينة سعودية غير الرياض وجدة ومكة والمدينة",a:[{"t":"الدمام","p":28},{"t":"الطايف","p":23},{"t":"أبها","p":18},{"t":"تبوك","p":14},{"t":"الأحسا","p":10},{"t":"حايل","p":7}]},
  {id:311,q:"اذكر مكان بالسعودية جوه بارد وفيه جبال",a:[{"t":"أبها","p":26},{"t":"الطايف","p":22},{"t":"الباحة","p":19},{"t":"النماص","p":15},{"t":"تنومة","p":11},{"t":"السودة","p":7}]},
  {id:312,q:"اذكر شي يميز جو المباراة بالملعب",a:[{"t":"هتاف الجماهير","p":28},{"t":"أعلام وألوان","p":23},{"t":"صافرة الحكم","p":18},{"t":"الطبول والأهازيج","p":14},{"t":"صوت المعلق","p":10},{"t":"الشماريخ","p":7}]},
  {id:313,q:"اذكر مضيق أو ممر مائي مشهور",a:[{"t":"مضيق هرمز","p":24},{"t":"قناة السويس","p":20},{"t":"جبل طارق","p":17},{"t":"قناة بنما","p":15},{"t":"البسفور","p":13},{"t":"باب المندب","p":11}]},
  {id:314,q:"اذكر سوق شعبي بالسعودية",a:[{"t":"البلد بجدة","p":22},{"t":"سوق الزل بالرياض","p":20},{"t":"قيصرية أبها","p":18},{"t":"سوق طيبة بالمدينة","p":16},{"t":"الحراج","p":13},{"t":"سوق واقف بالدمام","p":11}]},
  {id:315,q:"اذكر موسم أو مهرجان سعودي",a:[{"t":"موسم الرياض","p":30},{"t":"موسم جدة","p":25},{"t":"الجنادرية","p":18},{"t":"شتاء طنطورة","p":12},{"t":"سوق عكاظ","p":10},{"t":"مهرجان الملك عبدالعزيز للإبل","p":5}]},
  {id:316,q:"اذكر لعبة شعبية قديمة",a:[{"t":"الغميضة","p":24},{"t":"الحجلة","p":20},{"t":"السيجة","p":17},{"t":"شد الحبل","p":15},{"t":"الدحّة","p":13},{"t":"المقصي","p":11}]},
  {id:317,q:"اذكر مشروب تراثي غير القهوة والشاي",a:[{"t":"السحلب","p":22},{"t":"الحلبة","p":20},{"t":"الكركديه","p":18},{"t":"اليانسون","p":16},{"t":"القرفة بالحليب","p":13},{"t":"العرديات","p":11}]},
  {id:318,q:"اذكر لبس تراثي نسائي خليجي",a:[{"t":"العباية","p":22},{"t":"الشيلة","p":20},{"t":"الثوب النشل","p":18},{"t":"البخنق","p":16},{"t":"البرقع","p":13},{"t":"الدراعة","p":11}]},
  {id:319,q:"اذكر حرفة يدوية تراثية",a:[{"t":"السدو","p":24},{"t":"الفخار","p":20},{"t":"الخوص والسلال","p":17},{"t":"النقش على الخشب","p":15},{"t":"التطريز","p":13},{"t":"صناعة البشوت","p":11}]},
  {id:320,q:"اذكر مناسبة وطنية سعودية",a:[{"t":"اليوم الوطني","p":32},{"t":"يوم التأسيس","p":26},{"t":"يوم العلم","p":18},{"t":"ذكرى البيعة","p":12},{"t":"يوم بداية رؤية 2030","p":7},{"t":"يوم الوطن الرياضي","p":5}]},
  {id:321,q:"اذكر متحف أو معلم ثقافي سعودي",a:[{"t":"المتحف الوطني","p":22},{"t":"قصر المصمك","p":20},{"t":"مركز إثراء","p":18},{"t":"حي الطريف بالدرعية","p":16},{"t":"متحف العلا","p":13},{"t":"قصر شبرا بالطايف","p":11}]},
  {id:322,q:"اذكر كلمة سعودية ما يفهمها غير أهل الخليج",a:[{"t":"طفشان","p":21},{"t":"كشتة","p":19},{"t":"عاد","p":18},{"t":"ترى","p":16},{"t":"هرج","p":14},{"t":"فله","p":12}]},
  {id:323,q:"اذكر أكلة نجدية أو قصيمية",a:[{"t":"المرقوق","p":21},{"t":"الجريش","p":19},{"t":"القرصان","p":18},{"t":"المطازيز","p":16},{"t":"المفروكة","p":14},{"t":"الحنيني","p":12}]},
  {id:324,q:"اذكر ملك من ملوك السعودية",a:[{"t":"الملك عبدالعزيز","p":32},{"t":"الملك سلمان","p":26},{"t":"الملك فهد","p":18},{"t":"الملك عبدالله","p":12},{"t":"الملك فيصل","p":7},{"t":"الملك خالد","p":5}]},
  {id:325,q:"اذكر مخترع غيّر حياة الناس",a:[{"t":"توماس إديسون","p":24},{"t":"غراهام بيل","p":20},{"t":"الأخوان رايت","p":17},{"t":"نيكولا تسلا","p":15},{"t":"هنري فورد","p":13},{"t":"ستيف جوبز","p":11}]},
  {id:326,q:"اذكر عالم مسلم قديم",a:[{"t":"ابن سينا","p":22},{"t":"الخوارزمي","p":20},{"t":"ابن الهيثم","p":18},{"t":"جابر بن حيان","p":16},{"t":"الرازي","p":13},{"t":"البيروني","p":11}]},
  {id:327,q:"اذكر قائد إسلامي مشهور",a:[{"t":"خالد بن الوليد","p":22},{"t":"صلاح الدين","p":20},{"t":"طارق بن زياد","p":18},{"t":"عقبة بن نافع","p":16},{"t":"محمد الفاتح","p":13},{"t":"سعد بن أبي وقاص","p":11}]},
  {id:328,q:"اذكر حضارة قديمة",a:[{"t":"الفرعونية","p":24},{"t":"الرومانية","p":20},{"t":"الإغريقية","p":17},{"t":"بابل","p":15},{"t":"الصينية","p":13},{"t":"حضارة الأنباط","p":11}]},
  {id:329,q:"اذكر حدث غيّر العالم بالقرن الماضي",a:[{"t":"الحرب العالمية الثانية","p":27},{"t":"نزول الإنسان على القمر","p":22},{"t":"سقوط جدار برلين","p":18},{"t":"اكتشاف النفط بالسعودية","p":14},{"t":"اختراع الإنترنت","p":11},{"t":"الحرب العالمية الأولى","p":8}]},
  {id:330,q:"اذكر شي يحتاجه رايد الفضا",a:[{"t":"بدلة الفضا","p":22},{"t":"خوذة","p":20},{"t":"أكسجين","p":18},{"t":"مركبة فضائية","p":16},{"t":"أكل معلب خاص","p":13},{"t":"جهاز اتصال","p":11}]},
  {id:331,q:"اذكر عالم فيزياء مشهور",a:[{"t":"أينشتاين","p":32},{"t":"نيوتن","p":26},{"t":"ستيفن هوكينغ","p":18},{"t":"نيكولا تسلا","p":12},{"t":"ماري كوري","p":7},{"t":"غاليليو","p":5}]},
  {id:332,q:"اذكر شي تدرسه بمادة الأحياء",a:[{"t":"الخلية","p":21},{"t":"جسم الإنسان","p":19},{"t":"النباتات","p":18},{"t":"الحيوانات","p":16},{"t":"الوراثة","p":14},{"t":"البكتيريا","p":12}]},
  {id:333,q:"اذكر ظاهرة تشوفها بالسما",a:[{"t":"القمر","p":28},{"t":"النجوم","p":23},{"t":"الشهب","p":18},{"t":"كسوف الشمس","p":14},{"t":"خسوف القمر","p":10},{"t":"قوس قزح","p":7}]},
  {id:334,q:"اذكر حيوان مهدد بالانقراض",a:[{"t":"النمر","p":22},{"t":"وحيد القرن","p":20},{"t":"الباندا","p":18},{"t":"الفهد العربي","p":16},{"t":"الغوريلا","p":13},{"t":"المها العربي","p":11}]},
  {id:335,q:"اذكر حيوان يعيش بمجموعات",a:[{"t":"النمل","p":21},{"t":"النحل","p":19},{"t":"الذيب","p":18},{"t":"الفيلة","p":16},{"t":"الطيور المهاجرة","p":14},{"t":"السمك","p":12}]},
  {id:336,q:"اذكر حيوان له فرو",a:[{"t":"الدب","p":24},{"t":"القط","p":20},{"t":"الأرنب","p":17},{"t":"الذيب","p":15},{"t":"الخروف","p":13},{"t":"الثعلب","p":11}]},
  {id:337,q:"اذكر حيوان يطلع الشجر",a:[{"t":"القرد","p":30},{"t":"السنجاب","p":25},{"t":"القط","p":18},{"t":"الكوالا","p":12},{"t":"الثعبان","p":10},{"t":"النمر","p":5}]},
  {id:338,q:"اذكر نبتة يزرعونها بالبيت للزينة",a:[{"t":"الصبار","p":21},{"t":"الورد","p":19},{"t":"الياسمين","p":18},{"t":"النعناع","p":16},{"t":"الريحان","p":14},{"t":"نبتة الموز الزينة","p":12}]},
  {id:339,q:"اذكر فصل أو وقت تزهر فيه الطبيعة",a:[{"t":"الربيع","p":35},{"t":"بعد المطر","p":25},{"t":"الشتا بالجنوب","p":18},{"t":"الخريف","p":10},{"t":"أول الصيف بالجبال","p":7},{"t":"موسم الورد بالطايف","p":5}]},
  {id:340,q:"اذكر شي يصير وقت المطر",a:[{"t":"ريحة التراب","p":32},{"t":"الماء يتجمع بالشوارع","p":26},{"t":"الجو يبرد","p":18},{"t":"زحمة سيارات","p":12},{"t":"قوس قزح","p":7},{"t":"انقطاع الكهربا","p":5}]},
  {id:341,q:"اذكر شي تلقاه بشنطة الطالب",a:[{"t":"الكتب والدفاتر","p":28},{"t":"الأقلام","p":23},{"t":"المبراة والممحاة","p":18},{"t":"علبة الفطور","p":14},{"t":"المسطرة","p":10},{"t":"الآلة الحاسبة","p":7}]},
  {id:342,q:"اذكر شي يصير بحفل التخرج",a:[{"t":"توزيع الشهادات","p":26},{"t":"التصوير","p":22},{"t":"كلمة الخريجين","p":19},{"t":"رمي القبعات","p":15},{"t":"تكريم الأوائل","p":11},{"t":"الزغاريد والتهاني","p":7}]},
  {id:343,q:"اذكر مادة صعبة على أغلب الطلاب",a:[{"t":"الرياضيات","p":28},{"t":"الفيزياء","p":23},{"t":"الكيميا","p":18},{"t":"الإحصاء","p":14},{"t":"البرمجة","p":10},{"t":"النحو","p":7}]},
  {id:344,q:"اذكر شي يحتاجه الطالب وقت الاختبارات",a:[{"t":"التركيز","p":26},{"t":"يذاكر من بدري","p":22},{"t":"قهوة أو مشروب طاقة","p":19},{"t":"نوم كافي","p":15},{"t":"جو هادي","p":11},{"t":"ملخصات","p":7}]},
  {id:345,q:"اذكر تخصص مطلوب بسوق العمل",a:[{"t":"الطب","p":28},{"t":"الهندسة","p":23},{"t":"تقنية المعلومات","p":18},{"t":"إدارة الأعمال","p":14},{"t":"المحاسبة","p":10},{"t":"الأمن السيبراني","p":7}]},
  {id:346,q:"اذكر شي يميز بيئة العمل الحلوة",a:[{"t":"احترام الموظفين","p":26},{"t":"راتب عادل","p":22},{"t":"فرص تطوير","p":19},{"t":"توازن مع الحياة","p":15},{"t":"مدير متفهم","p":11},{"t":"زملا طيبين","p":7}]},
  {id:347,q:"اذكر مهنة شغلها كله تعامل مع الناس",a:[{"t":"المبيعات","p":22},{"t":"خدمة العملاء","p":20},{"t":"التسويق","p":18},{"t":"الإعلام","p":16},{"t":"الضيافة","p":13},{"t":"المعلم","p":11}]},
  {id:348,q:"اذكر شي يسبب ضغط بالشغل",a:[{"t":"كثرة المهام","p":28},{"t":"قرب التسليم","p":23},{"t":"قلة الموظفين","p":18},{"t":"توقعات المدير","p":14},{"t":"كثرة الاجتماعات","p":10},{"t":"مشاكل مع زميل","p":7}]},
  {id:349,q:"اذكر مهنة يدوية",a:[{"t":"النجار","p":24},{"t":"الكهربائي","p":20},{"t":"السباك","p":17},{"t":"الميكانيكي","p":15},{"t":"الخياط","p":13},{"t":"الحداد","p":11}]},
  {id:350,q:"اذكر شي يتقيّم فيه الموظف",a:[{"t":"الالتزام بالدوام","p":22},{"t":"جودة الشغل","p":20},{"t":"العمل الجماعي","p":18},{"t":"الانضباط","p":16},{"t":"المبادرة","p":13},{"t":"تطوير نفسه","p":11}]},
  {id:351,q:"اذكر تمرين رياضي شائع",a:[{"t":"المشي","p":30},{"t":"الجري","p":25},{"t":"تمارين البطن","p":18},{"t":"الضغط","p":12},{"t":"السكوات","p":10},{"t":"الحديد","p":5}]},
  {id:352,q:"اذكر سبب يخلي الوزن يزيد",a:[{"t":"كثرة الأكل","p":28},{"t":"قلة الحركة","p":23},{"t":"الوجبات السريعة","p":18},{"t":"السهر","p":14},{"t":"المشروبات الغازية","p":10},{"t":"الأكل بالليل","p":7}]},
  {id:353,q:"اذكر نصيحة يكررها كل دكتور",a:[{"t":"اشرب ماء","p":26},{"t":"نام بدري","p":22},{"t":"قلل السكر والملح","p":19},{"t":"تحرك وتريض","p":15},{"t":"سوّ فحص دوري","p":11},{"t":"بطّل التدخين","p":7}]},
  {id:354,q:"اذكر شي يساعدك تنام زين",a:[{"t":"تطفي الأنوار","p":26},{"t":"تبعد الجوال","p":22},{"t":"جو هادي وبارد","p":19},{"t":"ما تشرب قهوة بالليل","p":15},{"t":"تنام بنفس الوقت","p":11},{"t":"دش دافي","p":7}]},
  {id:355,q:"اذكر مرض ينتشر بالشتا",a:[{"t":"الزكام","p":35},{"t":"الإنفلونزا","p":25},{"t":"التهاب الحلق","p":18},{"t":"الكحة","p":10},{"t":"الحساسية","p":7},{"t":"جفاف الجلد","p":5}]},
  {id:356,q:"اذكر شي تسويه بالمطار قبل رحلتك",a:[{"t":"تسجيل الوصول","p":28},{"t":"الجوازات","p":23},{"t":"تنتظر الصعود","p":18},{"t":"تتسوق بالسوق الحرة","p":14},{"t":"تشرب قهوة","p":10},{"t":"تشحن جوالك","p":7}]},
  {id:357,q:"اذكر شي يعصّبك بالمطار",a:[{"t":"تأخر الرحلة","p":32},{"t":"طول الانتظار","p":26},{"t":"زحمة الجوازات","p":18},{"t":"شنطتك ما وصلت","p":12},{"t":"الوزن الزايد","p":7},{"t":"غلا أسعار الأكل","p":5}]},
  {id:358,q:"اذكر شي يميز السفر بالقطار",a:[{"t":"مريح","p":27},{"t":"تشوف المناظر","p":22},{"t":"ما فيه زحمة","p":18},{"t":"ما تحتاج تسوق","p":14},{"t":"أسرع من السيارة","p":11},{"t":"سعره مناسب","p":8}]},
  {id:359,q:"اذكر وسيلة تتنقل فيها داخل المدينة",a:[{"t":"سيارتك","p":28},{"t":"أوبر أو كريم","p":23},{"t":"الباص","p":18},{"t":"المترو","p":14},{"t":"التاكسي","p":10},{"t":"الدباب","p":7}]},
  {id:360,q:"اذكر شي تجهزه قبل رحلة بر طويلة",a:[{"t":"تعبي بنزين","p":26},{"t":"تشيك الإطارات","p":22},{"t":"ماء وأكل","p":19},{"t":"شاحن السيارة","p":15},{"t":"تطبيق الخرايط","p":11},{"t":"عدة وكفر احتياطي","p":7}]},
  {id:361,q:"اذكر ممثل عربي مشهور",a:[{"t":"عادل إمام","p":24},{"t":"ناصر القصبي","p":20},{"t":"أحمد حلمي","p":17},{"t":"محمد هنيدي","p":15},{"t":"كريم عبدالعزيز","p":13},{"t":"عبدالله السدحان","p":11}]},
  {id:362,q:"اذكر ممثل عالمي مشهور",a:[{"t":"ليوناردو دي كابريو","p":21},{"t":"توم كروز","p":19},{"t":"دواين جونسون","p":18},{"t":"ويل سميث","p":16},{"t":"جوني ديب","p":14},{"t":"روبرت داوني","p":12}]},
  {id:363,q:"اذكر فيلم كرتون لديزني",a:[{"t":"الأسد الملك","p":22},{"t":"فروزن","p":20},{"t":"توي ستوري","p":18},{"t":"موانا","p":16},{"t":"علاء الدين","p":13},{"t":"الحصان الطاير","p":11}]},
  {id:364,q:"اذكر نوع أفلام",a:[{"t":"أكشن","p":30},{"t":"كوميدي","p":25},{"t":"رعب","p":18},{"t":"رومانسي","p":12},{"t":"خيال علمي","p":10},{"t":"وثائقي","p":5}]},
  {id:365,q:"اذكر مسلسل رمضاني عربي",a:[{"t":"باب الحارة","p":21},{"t":"الهيبة","p":19},{"t":"رشاش","p":18},{"t":"سيلفي","p":16},{"t":"طاش ما طاش","p":14},{"t":"الاختيار","p":12}]},
  {id:366,q:"اذكر مطرب أو مطربة عربية",a:[{"t":"محمد عبده","p":22},{"t":"راشد الماجد","p":20},{"t":"طلال مداح","p":18},{"t":"أصالة","p":16},{"t":"حسين الجسمي","p":13},{"t":"عبادي الجوهر","p":11}]},
  {id:367,q:"اذكر مول أو مركز تسوق سعودي",a:[{"t":"الرياض بارك","p":22},{"t":"مول العرب","p":20},{"t":"النخيل مول","p":18},{"t":"الظهران مول","p":16},{"t":"بوليفارد","p":13},{"t":"رد سي مول","p":11}]},
  {id:368,q:"اذكر سبب يخلي الواحد يوفر",a:[{"t":"يشتري بيت","p":28},{"t":"الزواج","p":23},{"t":"للطوارئ","p":18},{"t":"السفر","p":14},{"t":"التقاعد","p":10},{"t":"يبدأ مشروع","p":7}]},
  {id:369,q:"اذكر موسم تخفيضات معروف",a:[{"t":"الجمعة البيضا","p":32},{"t":"تخفيضات نهاية الموسم","p":26},{"t":"عروض العيد","p":18},{"t":"عروض رمضان","p":12},{"t":"عروض اليوم الوطني","p":7},{"t":"عروض العودة للمدارس","p":5}]},
  {id:370,q:"اذكر طريقة دفع يستخدمها الناس",a:[{"t":"البطاقة البنكية","p":26},{"t":"آبل باي","p":22},{"t":"تحويل بنكي","p":19},{"t":"كاش","p":15},{"t":"الدفع عند الاستلام","p":11},{"t":"تابي وتمارا","p":7}]},
  {id:371,q:"اذكر سبب يرفع أسعار شي",a:[{"t":"قلة المعروض","p":22},{"t":"زيادة الطلب","p":20},{"t":"غلا الشحن","p":18},{"t":"التضخم","p":16},{"t":"المواسم والمناسبات","p":13},{"t":"الضرايب","p":11}]},
  {id:372,q:"اذكر شي تجهزه لاستقبال ضيوف",a:[{"t":"ترتب البيت","p":26},{"t":"قهوة وتمر","p":22},{"t":"تجهز الأكل","p":19},{"t":"تبخر المجلس","p":15},{"t":"تجهز القعدة","p":11},{"t":"تجيب حلا","p":7}]},
  {id:373,q:"اذكر مناسبة تقدم فيها هدية",a:[{"t":"الزواج","p":26},{"t":"مولود جديد","p":22},{"t":"العيد","p":19},{"t":"التخرج","p":15},{"t":"عيد ميلاد","p":11},{"t":"بيت جديد","p":7}]},
  {id:374,q:"اذكر شي ما يصير بدونه عيد ميلاد",a:[{"t":"الكيكة والشموع","p":30},{"t":"أغنية التهنئة","p":25},{"t":"الهدايا","p":18},{"t":"البالونات","p":12},{"t":"دعوة الأصحاب","p":10},{"t":"التصوير","p":5}]},
  {id:375,q:"اذكر شي يصير بمجلس العزا",a:[{"t":"قراءة القرآن","p":28},{"t":"تعزية الأهل","p":23},{"t":"قهوة سادة","p":18},{"t":"الدعا للميت","p":14},{"t":"السكوت والهدوء","p":10},{"t":"توزيع أكل","p":7}]},
  {id:376,q:"اذكر شي يصير بملكة أو عقد قران",a:[{"t":"توقيع العقد","p":26},{"t":"حضور أهل الطرفين","p":22},{"t":"قراءة الفاتحة","p":19},{"t":"توزيع الحلا","p":15},{"t":"التصوير","p":11},{"t":"الزغاريد","p":7}]},
  {id:377,q:"اذكر جهاز ذكي بالبيوت الحديثة",a:[{"t":"مكبر صوت ذكي","p":22},{"t":"كاميرا مراقبة","p":20},{"t":"إضاءة ذكية","p":18},{"t":"قفل ذكي","p":16},{"t":"روبوت تنظيف","p":13},{"t":"مكيف يتحكم فيه بالجوال","p":11}]},
  {id:378,q:"اذكر أداة تستخدمها بحديقة البيت",a:[{"t":"خرطوم الماء","p":24},{"t":"المقص","p":20},{"t":"القفازات","p":17},{"t":"الجاروف","p":15},{"t":"المرشة","p":13},{"t":"جزازة العشب","p":11}]},
  {id:379,q:"اذكر شي تلقاه بغرفة الأطفال",a:[{"t":"السرير","p":26},{"t":"الألعاب","p":22},{"t":"رسومات على الجدار","p":19},{"t":"دولاب الملابس","p":15},{"t":"مصباح ليلي","p":11},{"t":"مكتب صغير","p":7}]},
  {id:380,q:"اذكر شي يغيّر شكل البيت بسرعة",a:[{"t":"الدهان","p":27},{"t":"ورق الجدران","p":22},{"t":"الإضاءة","p":18},{"t":"السجاد والستاير","p":14},{"t":"ترتيب الأثاث","p":11},{"t":"النباتات","p":8}]},
  {id:381,q:"اذكر شي تحتاجه وقت انقطاع الكهربا",a:[{"t":"الكشاف","p":35},{"t":"الشموع","p":25},{"t":"مولد كهربا","p":18},{"t":"باور بانك","p":10},{"t":"جوال مشحون","p":7},{"t":"مروحة شحن","p":5}]},
  {id:382,q:"اذكر شي يصير بيوم الغبار",a:[{"t":"ما تشوف قدامك","p":28},{"t":"الحساسية تهيج","p":23},{"t":"المدارس تعلق","p":18},{"t":"الرحلات تتأخر","p":14},{"t":"البيت كله تراب","p":10},{"t":"تغسل سيارتك مرتين","p":7}]},
  {id:383,q:"اذكر شي تحتاجه بيوم حره شديد",a:[{"t":"ماء بارد","p":30},{"t":"المكيف","p":25},{"t":"ظل","p":18},{"t":"واقي شمس","p":12},{"t":"ملابس خفيفة","p":10},{"t":"تقعد بالبيت","p":5}]},
  {id:384,q:"اذكر حالة جوية تحذر منها الأرصاد",a:[{"t":"السيول","p":28},{"t":"الغبار","p":23},{"t":"الرياح الشديدة","p":18},{"t":"الأمطار الغزيرة","p":14},{"t":"الصقيع","p":10},{"t":"موجة الحر","p":7}]},
  {id:385,q:"اذكر لعبة ورق",a:[{"t":"البلوت","p":35},{"t":"الطرنيب","p":25},{"t":"الكوتشينة","p":18},{"t":"الأونو","p":10},{"t":"الهاند","p":7},{"t":"الكيرم","p":5}]},
  {id:386,q:"اذكر لعبة يلعبها الأطفال بالحوش",a:[{"t":"الغميضة","p":26},{"t":"الكرة","p":22},{"t":"نط الحبل","p":19},{"t":"شد الحبل","p":15},{"t":"الحجلة","p":11},{"t":"الدراجة","p":7}]},
  {id:387,q:"اذكر لعبة لوحية",a:[{"t":"المونوبولي","p":22},{"t":"الشطرنج","p":20},{"t":"الدومينو","p":18},{"t":"سكرابل","p":16},{"t":"الكيرم","p":13},{"t":"الطاولة","p":11}]},
  {id:388,q:"اذكر نشاط تسويه العائلة مع بعض",a:[{"t":"يلعبون ورق","p":26},{"t":"يتفرجون فيلم","p":22},{"t":"سوالف وقعدة","p":19},{"t":"يطبخون سوا","p":15},{"t":"لعبة جماعية","p":11},{"t":"يطلعون بر","p":7}]},
  {id:389,q:"اذكر شي تلقاه بعلبة الإسعافات",a:[{"t":"شاش وضمادات","p":21},{"t":"مطهر","p":19},{"t":"لاصق طبي","p":18},{"t":"مقص","p":16},{"t":"بنادول","p":14},{"t":"قفازات","p":12}]},
  {id:390,q:"اذكر شي يستخدمه المصور",a:[{"t":"الكاميرا","p":22},{"t":"الحامل الثلاثي","p":20},{"t":"العدسات","p":18},{"t":"الإضاءة","p":16},{"t":"بطاقة الذاكرة","p":13},{"t":"الريفلكتر","p":11}]},
  {id:391,q:"اذكر تصرف يبيّن إن الشخص كريم",a:[{"t":"يساعد المحتاجين","p":22},{"t":"يشارك أكله","p":20},{"t":"يستضيف الناس","p":18},{"t":"يعطي بدون مقابل","p":16},{"t":"يدفع الحساب","p":13},{"t":"ما يمنّ على أحد","p":11}]},
  {id:392,q:"اذكر سبب يخليك تثق بشخص",a:[{"t":"صادق بتعامله","p":24},{"t":"يلتزم بوعده","p":20},{"t":"يحفظ السر","p":17},{"t":"وقف معك بالأزمة","p":15},{"t":"ينصحك بصراحة","p":13},{"t":"ما يتكلم عن الناس","p":11}]},
  {id:393,q:"اذكر صفة لازم تكون بالقائد",a:[{"t":"يقرر صح","p":22},{"t":"يسمع لفريقه","p":20},{"t":"يتحمل المسؤولية","p":18},{"t":"يحفّز ويلهم","p":16},{"t":"رؤيته واضحة","p":13},{"t":"عادل","p":11}]},
  {id:394,q:"اذكر شي يخلي الاجتماع ناجح",a:[{"t":"أجندة واضحة","p":24},{"t":"الالتزام بالوقت","p":20},{"t":"الكل يشارك","p":17},{"t":"قرارات واضحة بالنهاية","p":15},{"t":"ما يطول","p":13},{"t":"يبدأ بوقته","p":11}]},
  {id:395,q:"اذكر سبب يخلي تطبيق جوال ينجح",a:[{"t":"سهل الاستخدام","p":22},{"t":"سريع","p":20},{"t":"تصميم حلو","p":18},{"t":"يحل مشكلة فعلية","p":16},{"t":"خدمة عملاء ممتازة","p":13},{"t":"تحديثات مستمرة","p":11}]},
  {id:396,q:"اذكر شي يميز المدينة الذكية",a:[{"t":"خدمات حكومية إلكترونية","p":24},{"t":"مواصلات متطورة","p":20},{"t":"كاميرات ذكية","p":17},{"t":"طاقة نظيفة","p":15},{"t":"إنترنت سريع","p":13},{"t":"مواقف ذكية","p":11}]},
  {id:397,q:"اذكر شي يحتاجه الطالب بالمحاضرة أونلاين",a:[{"t":"لابتوب","p":26},{"t":"سماعات","p":22},{"t":"إنترنت ثابت","p":19},{"t":"الكاميرا","p":15},{"t":"دفتر ملاحظات","p":11},{"t":"مكان هادي","p":7}]},
  {id:398,q:"اذكر تصرف يبيّن إن الشخص متواضع",a:[{"t":"ما يتفاخر بإنجازاته","p":22},{"t":"يحترم الكل بنفس الطريقة","p":20},{"t":"يقبل النقد","p":18},{"t":"يساعد بدون منّة","p":16},{"t":"بسيط بلبسه وتعامله","p":13},{"t":"يعترف بغلطه","p":11}]},
  {id:399,q:"اذكر شي يزعجك بمكان الشغل",a:[{"t":"الصوت العالي","p":27},{"t":"زميل كثير الكلام","p":22},{"t":"اجتماعات بدون فايدة","p":18},{"t":"المقاطعة وأنت مركز","p":14},{"t":"فوضى المكتب","p":11},{"t":"التكييف بارد أو حار","p":8}]},
  {id:400,q:"اذكر شي يميز فريق شغل ناجح",a:[{"t":"التعاون","p":22},{"t":"التواصل الواضح","p":20},{"t":"احترام الأدوار","p":18},{"t":"الثقة","p":16},{"t":"هدف مشترك","p":13},{"t":"ما فيه مجاملات","p":11}]},
  {id:401,q:"اذكر شي يخليك تقف وتشوف إعلان",a:[{"t":"فكرة مضحكة","p":27},{"t":"خصم أو عرض","p":22},{"t":"مشهور يطلع فيه","p":18},{"t":"الموسيقى","p":14},{"t":"قصة مؤثرة","p":11},{"t":"المنتج نفسه يعجبك","p":8}]},
  {id:402,q:"اذكر شي يخليك تشتري من متجر إلكتروني وترجع له",a:[{"t":"التوصيل سريع","p":26},{"t":"الإرجاع سهل","p":22},{"t":"السعر منافس","p":19},{"t":"تقييمات المنتجات","p":15},{"t":"خدمة العملا","p":11},{"t":"الدفع آمن","p":7}]},
  {id:403,q:"اذكر شي يصير بافتتاح محل جديد",a:[{"t":"خصومات","p":32},{"t":"زحمة","p":26},{"t":"هدايا ترويجية","p":18},{"t":"قص الشريط","p":12},{"t":"قهوة وضيافة","p":7},{"t":"تصوير ومؤثرين","p":5}]},
  {id:404,q:"اذكر شي يخليك ترجع لمطعم مرة ثانية",a:[{"t":"طعم الأكل","p":30},{"t":"النظافة","p":25},{"t":"سرعة التقديم","p":18},{"t":"تعامل الموظفين","p":12},{"t":"الأسعار","p":10},{"t":"المكان والجو","p":5}]},
  {id:405,q:"اذكر شي يسويه النادل بالمطعم",a:[{"t":"يستقبلك","p":26},{"t":"يعطيك المنيو","p":22},{"t":"ياخذ الطلب","p":19},{"t":"يقدم الأكل","p":15},{"t":"يجيب الفاتورة","p":11},{"t":"ينظف الطاولة","p":7}]},
  {id:406,q:"اذكر شي يميز فندق خمس نجوم",a:[{"t":"خدمة راقية","p":22},{"t":"غرف فاخرة","p":20},{"t":"مسبح وسبا","p":18},{"t":"مطاعم متنوعة","p":16},{"t":"الموقع","p":13},{"t":"بوفيه فطور فخم","p":11}]},
  {id:407,q:"اذكر شي تحتاجه عشان تبدأ مشروع صغير",a:[{"t":"رأس مال","p":26},{"t":"فكرة واضحة","p":22},{"t":"سجل تجاري","p":19},{"t":"دراسة جدوى","p":15},{"t":"مكان أو متجر إلكتروني","p":11},{"t":"تسويق","p":7}]},
  {id:408,q:"اذكر متجر إلكتروني مشهور",a:[{"t":"أمازون","p":32},{"t":"نون","p":26},{"t":"شي إن","p":18},{"t":"علي إكسبرس","p":12},{"t":"سلة","p":7},{"t":"آي هيرب","p":5}]},
  {id:409,q:"اذكر شي يبيّن إن الشخص عصبي",a:[{"t":"يعصب بسرعة","p":30},{"t":"يرفع صوته","p":25},{"t":"ما يصبر","p":18},{"t":"يندم بعدين","p":12},{"t":"يتصرف باندفاع","p":10},{"t":"يضرب بيده الطاولة","p":5}]},
  {id:410,q:"اذكر شي يهدي شخص معصب",a:[{"t":"تكلمه بهدوء","p":26},{"t":"تتركه شوي لحاله","p":22},{"t":"تعتذر","p":19},{"t":"تغير الموضوع","p":15},{"t":"تعطيه ماء بارد","p":11},{"t":"تضحكه","p":7}]},
  {id:411,q:"اذكر شي يميز الشخص الطموح",a:[{"t":"يحط أهداف","p":22},{"t":"يشتغل بجد","p":20},{"t":"ما يستسلم","p":18},{"t":"يطور نفسه","p":16},{"t":"يتعلم من فشله","p":13},{"t":"ما يقارن نفسه بغيره","p":11}]},
  {id:412,q:"اذكر شي يعطيك إحساس إنك أنجزت",a:[{"t":"تخلص مشروع صعب","p":26},{"t":"تحقق هدف طال","p":22},{"t":"تساعد محتاج","p":19},{"t":"تتعلم مهارة","p":15},{"t":"التخرج أو الترقية","p":11},{"t":"تخلص قائمة مهامك","p":7}]},
  {id:413,q:"اذكر شي يميز الشخص المنظم",a:[{"t":"يخطط ليومه","p":24},{"t":"يرتب أغراضه","p":20},{"t":"يلتزم بالمواعيد","p":17},{"t":"يكتب قوائم","p":15},{"t":"مكتبه مرتب","p":13},{"t":"جواله مرتب ونظيف","p":11}]},
  {id:414,q:"اذكر عادة سيئة الناس تحاول تتركها",a:[{"t":"التدخين","p":28},{"t":"السهر","p":23},{"t":"تأجيل المهام","p":18},{"t":"الأكل غير الصحي","p":14},{"t":"قضم الأظافر","p":10},{"t":"إدمان الجوال","p":7}]},
  {id:415,q:"اذكر شي يبيّن إن الشخص صادق",a:[{"t":"يقول الحق لو كان صعب","p":22},{"t":"كلامه يطابق فعله","p":20},{"t":"يعترف بغلطه","p":18},{"t":"ما يبالغ بالقصص","p":16},{"t":"الناس تثق فيه","p":13},{"t":"ما يوعد إلا ينفذ","p":11}]},
  {id:416,q:"اذكر شي يعطيك أمل",a:[{"t":"نجاح بعد تعب","p":27},{"t":"دعم أهلك","p":22},{"t":"التوكل على الله","p":18},{"t":"قصة نجاح ملهمة","p":14},{"t":"الأمور تتحسن شوي شوي","p":11},{"t":"طفل صغير","p":8}]},
  {id:417,q:"اذكر شي يعلمك إياه الفشل",a:[{"t":"الصبر","p":26},{"t":"تحاول بطريقة أحسن","p":22},{"t":"التواضع","p":19},{"t":"تعرف غلطك وين","p":15},{"t":"ما تستسلم","p":11},{"t":"من تثق فيه فعلاً","p":7}]},
  {id:418,q:"اذكر شي يسويه الشخص المتفائل بيومه",a:[{"t":"يبتسم من الصباح","p":24},{"t":"يحمد الله","p":20},{"t":"يخطط ليوم منتج","p":17},{"t":"يتوقع الأفضل","p":15},{"t":"يشجع اللي حوله","p":13},{"t":"ما يعلق على السلبيات","p":11}]},
  {id:419,q:"اذكر هدف يحطه الناس بأول السنة",a:[{"t":"يتريض بانتظام","p":28},{"t":"يوفر فلوس","p":23},{"t":"يقرا كتب","p":18},{"t":"يخس وزن","p":14},{"t":"يتعلم مهارة","p":10},{"t":"يبطل عادة سيئة","p":7}]},
  {id:420,q:"اذكر شي يخلي القعدة العائلية حلوة",a:[{"t":"الكل حاضر","p":26},{"t":"سوالف وضحك","p":22},{"t":"أكل لذيذ","p":19},{"t":"تبادل الأخبار","p":15},{"t":"ما فيه جوالات","p":11},{"t":"ما فيه خلافات","p":7}]},
  {id:421,q:"اذكر سبب يخلي الواحد يحب مدينته",a:[{"t":"ذكرياته فيها","p":28},{"t":"أهله وأصحابه","p":23},{"t":"الأمان والراحة","p":18},{"t":"معالمها","p":14},{"t":"جوها","p":10},{"t":"أكلها","p":7}]},
  {id:422,q:"اذكر شي يبيّن إن الشخص كريم بوقته",a:[{"t":"يساعد بدون تذمر","p":24},{"t":"يسمع لمشاكلك","p":20},{"t":"يعطي وقته لأهله","p":17},{"t":"يتطوع","p":15},{"t":"صبور مع الناس","p":13},{"t":"يرد على مكالماتك","p":11}]},
  {id:423,q:"اذكر شي يصير بمعرض توظيف",a:[{"t":"توزيع السير الذاتية","p":26},{"t":"مقابلات سريعة","p":22},{"t":"تعرف على شركات","p":19},{"t":"ورش تدريبية","p":15},{"t":"زحمة","p":11},{"t":"عروض تدريب","p":7}]},
  {id:424,q:"اذكر شي يميز خطاب أو كلمة مؤثرة",a:[{"t":"قصة ملهمة","p":22},{"t":"رسالة واضحة","p":20},{"t":"ثقة المتحدث","p":18},{"t":"تفاعل مع الحضور","p":16},{"t":"ما تطول","p":13},{"t":"نبرة الصوت","p":11}]},
  {id:425,q:"اذكر شي يساعدك تتعلم لغة جديدة بسرعة",a:[{"t":"الممارسة اليومية","p":26},{"t":"تتكلم مع أهل اللغة","p":22},{"t":"أفلام ومسلسلات باللغة","p":19},{"t":"تطبيقات التعلم","p":15},{"t":"حفظ المفردات","p":11},{"t":"تسافر لبلدهم","p":7}]},
  {id:426,q:"اذكر شي تسويه عشان تطور نفسك بالشغل",a:[{"t":"دورات تدريبية","p":27},{"t":"تقرا بمجالك","p":22},{"t":"تطلب ملاحظات من مديرك","p":18},{"t":"تتعلم من الأكبر خبرة","p":14},{"t":"الممارسة","p":11},{"t":"تشتغل على مشروع جديد","p":8}]},
  {id:427,q:"اذكر شي يميز العرض التقديمي الناجح",a:[{"t":"محتوى واضح","p":26},{"t":"شرائح بسيطة","p":22},{"t":"ثقة المتحدث","p":19},{"t":"تفاعل الحضور","p":15},{"t":"يلتزم بالوقت","p":11},{"t":"أمثلة واقعية","p":7}]},
  {id:428,q:"اذكر شي تسويه عشان توفر بالمصاريف",a:[{"t":"تسوي ميزانية","p":22},{"t":"تقلل الطلبات والمطاعم","p":20},{"t":"تقارن الأسعار","p":18},{"t":"تبطل الشراء العشوائي","p":16},{"t":"تلغي اشتراكات ما تستخدمها","p":13},{"t":"توفر أول الشهر","p":11}]},
  {id:429,q:"اذكر شي يساعدك تاخذ قرار صعب",a:[{"t":"تستشير شخص تثق فيه","p":26},{"t":"تستخير","p":22},{"t":"تكتب الإيجابيات والسلبيات","p":19},{"t":"تاخذ وقتك","p":15},{"t":"تسمع لحدسك","p":11},{"t":"تنام عليها ليلة","p":7}]},
  {id:430,q:"اذكر شي يصير لك بدولة ما تعرف لغتهم",a:[{"t":"ما تقدر تفاهمهم","p":26},{"t":"تستخدم الترجمة","p":22},{"t":"تتكلم بالإشارات","p":19},{"t":"تتعلم كلمات أساسية","p":15},{"t":"تدور على عربي","p":11},{"t":"تضيع عن الطريق","p":7}]},
  {id:431,q:"اذكر شي يميز المدينة الساحلية",a:[{"t":"الشواطئ","p":28},{"t":"المطاعم البحرية","p":23},{"t":"النسيم","p":18},{"t":"الرطوبة","p":14},{"t":"الكورنيش","p":10},{"t":"الأنشطة المائية","p":7}]},
  {id:432,q:"اذكر شي تحس فيه لما تزور مكان أول مرة",a:[{"t":"حماس وفضول","p":24},{"t":"تتوه بالبداية","p":20},{"t":"تنبهر بالمنظر","p":17},{"t":"تبي تصور كل شي","p":15},{"t":"تحس بالغربة","p":13},{"t":"تقارنه ببلدك","p":11}]},
  {id:433,q:"اذكر شي يميز الشخص اللي يحب المغامرة",a:[{"t":"يجرب أشياء خطرة","p":22},{"t":"يحب أماكن غريبة","p":20},{"t":"يحب التحدي","p":18},{"t":"ما يخاف يجرب","p":16},{"t":"يسافر لحاله","p":13},{"t":"ما يخطط كثير","p":11}]},
  {id:434,q:"اذكر شي يخلي الرحلة البرية ممتعة",a:[{"t":"رفقة حلوة","p":26},{"t":"تخطيط للطريق","p":22},{"t":"جو مناسب","p":19},{"t":"أكل وشوي","p":15},{"t":"وقفات مريحة","p":11},{"t":"مكان حلو تنصب فيه","p":7}]},
  {id:435,q:"اذكر شي يصير بمخيم أو معسكر",a:[{"t":"أنشطة جماعية","p":24},{"t":"النوم بالخيام","p":20},{"t":"النار والسمر","p":17},{"t":"مسابقات وألعاب","p":15},{"t":"تعلم مهارات","p":13},{"t":"طبخ على الحطب","p":11}]},
  {id:436,q:"اذكر شي يستخدم فيه الناس الذكاء الاصطناعي",a:[{"t":"كتابة ورسايل","p":26},{"t":"توليد صور","p":22},{"t":"الترجمة","p":19},{"t":"تلخيص وبحث","p":15},{"t":"البرمجة","p":11},{"t":"المساعدات الصوتية","p":7}]},
  {id:437,q:"اذكر تطبيق ذكاء اصطناعي",a:[{"t":"تشات جي بي تي","p":35},{"t":"كلود","p":25},{"t":"جيميناي","p":18},{"t":"ميدجورني","p":10},{"t":"كوبايلوت","p":7},{"t":"ديب سيك","p":5}]},
  {id:438,q:"اذكر شي يميز الجوال الجديد عن القديم",a:[{"t":"الكاميرا","p":26},{"t":"سرعة المعالج","p":22},{"t":"المساحة","p":19},{"t":"الشاشة","p":15},{"t":"البطارية","p":11},{"t":"التصميم","p":7}]},
  {id:439,q:"اذكر جهاز تلبسه عليك",a:[{"t":"الساعة الذكية","p":32},{"t":"السماعات اللاسلكية","p":26},{"t":"سوار اللياقة","p":18},{"t":"نظارة الواقع الافتراضي","p":12},{"t":"خاتم ذكي","p":7},{"t":"نظارة ذكية","p":5}]},
  {id:440,q:"اذكر منصة تتفرج فيها مقاطع قصيرة أو بودكاست",a:[{"t":"يوتيوب","p":32},{"t":"تيك توك","p":26},{"t":"انستقرام ريلز","p":18},{"t":"سناب شات","p":12},{"t":"سبوتيفاي","p":7},{"t":"إكس","p":5}]},
  {id:441,q:"اذكر شي يحمي البيئة",a:[{"t":"إعادة التدوير","p":26},{"t":"تقليل البلاستيك","p":22},{"t":"توفير الماء والكهربا","p":19},{"t":"زراعة الأشجار","p":15},{"t":"الطاقة الشمسية","p":11},{"t":"المواصلات العامة","p":7}]},
  {id:442,q:"اذكر مصدر طاقة متجددة",a:[{"t":"الطاقة الشمسية","p":32},{"t":"طاقة الرياح","p":26},{"t":"الطاقة المائية","p":18},{"t":"الحرارة الأرضية","p":12},{"t":"طاقة الأمواج","p":7},{"t":"الوقود الحيوي","p":5}]},
  {id:443,q:"اذكر شي يلوث الهوا",a:[{"t":"عوادم السيارات","p":30},{"t":"دخان المصانع","p":25},{"t":"حرق النفايات","p":18},{"t":"الغبار","p":12},{"t":"التدخين","p":10},{"t":"المبيدات","p":5}]},
  {id:444,q:"اذكر شي لازم يكون بالسيارة للسلامة",a:[{"t":"حزام الأمان","p":28},{"t":"الوسائد الهوائية","p":23},{"t":"طفاية حريق","p":18},{"t":"مثلث التحذير","p":14},{"t":"إطار احتياطي","p":10},{"t":"علبة إسعافات","p":7}]},
  {id:445,q:"اذكر رقم طوارئ تعرفه",a:[{"t":"999 الشرطة","p":35},{"t":"997 الهلال الأحمر","p":25},{"t":"998 الدفاع المدني","p":18},{"t":"911 الموحد","p":10},{"t":"993 حوادث الطرق","p":7},{"t":"940 المرور","p":5}]},
  {id:446,q:"اذكر شي لازم تسويه وقت الحريق",a:[{"t":"تتصل بالدفاع المدني","p":30},{"t":"تطلع بسرعة","p":25},{"t":"ما تستخدم المصعد","p":18},{"t":"تغطي فمك من الدخان","p":12},{"t":"تستخدم الطفاية","p":10},{"t":"تقفل الغاز","p":5}]},
  {id:447,q:"اذكر شي يخلي الطفل يحب القراءة",a:[{"t":"قصص مصورة","p":26},{"t":"أهله يقرون له","p":22},{"t":"زيارة المكتبة","p":19},{"t":"مكافأة بعد كل كتاب","p":15},{"t":"قصة قبل النوم","p":11},{"t":"يشوف أهله يقرون","p":7}]},
  {id:448,q:"اذكر شي لازم تعلمه عيالك بالبيت",a:[{"t":"الأدب والاحترام","p":26},{"t":"النظافة","p":22},{"t":"يساعدون بالبيت","p":19},{"t":"يدير مصروفه","p":15},{"t":"الصدق","p":11},{"t":"يعتذر لما يغلط","p":7}]},
  {id:449,q:"اذكر لعبة تنمي ذكاء الطفل",a:[{"t":"المكعبات","p":27},{"t":"البازل","p":22},{"t":"لعبة الذاكرة","p":18},{"t":"الحروف والأرقام","p":14},{"t":"الشطرنج","p":11},{"t":"الرسم","p":8}]},
  {id:450,q:"اذكر شي يحتاجه كبار السن",a:[{"t":"رعاية صحية","p":28},{"t":"الونس وعدم الوحدة","p":23},{"t":"أدويتهم بوقتها","p":18},{"t":"بيت آمن","p":14},{"t":"مشي ونشاط خفيف","p":10},{"t":"أحد يسمع لهم","p":7}]},
  {id:451,q:"اذكر شي يحب كبار السن يسمعونه من أحفادهم",a:[{"t":"يسولفون لهم عن يومهم","p":26},{"t":"كلام حنون","p":22},{"t":"يطلبون نصيحتهم","p":19},{"t":"يدعون لهم","p":15},{"t":"يشكرونهم","p":11},{"t":"يقولون لهم اشتقنا لكم","p":7}]},
  {id:452,q:"اذكر شي يحتاجه القط أو الكلب بالبيت",a:[{"t":"أكل خاص","p":26},{"t":"مكان ينام فيه","p":22},{"t":"الطبيب البيطري","p":19},{"t":"لعب وحركة","p":15},{"t":"استحمام وعناية","p":11},{"t":"تطعيمات","p":7}]},
  {id:453,q:"اذكر سبب يخلي الناس تربي حيوان أليف",a:[{"t":"الونس","p":27},{"t":"يحب الحيوانات","p":22},{"t":"يعلم العيال المسؤولية","p":18},{"t":"الحراسة","p":14},{"t":"يريّح نفسياً","p":11},{"t":"للشكل والزينة","p":8}]},
  {id:454,q:"اذكر نمط ديكور معروف",a:[{"t":"المودرن","p":24},{"t":"الكلاسيكي","p":20},{"t":"الاسكندنافي","p":17},{"t":"البوهيمي","p":15},{"t":"الصناعي","p":13},{"t":"النيو كلاسيك","p":11}]},
  {id:455,q:"اذكر شي يزين المجلس",a:[{"t":"الإضاءة الدافية","p":26},{"t":"الوسائد","p":22},{"t":"لوحات","p":19},{"t":"نباتات","p":15},{"t":"السجاد","p":11},{"t":"مبخرة ودلة","p":7}]},
  {id:456,q:"اذكر إكسسوار تلبسه النساء",a:[{"t":"الخاتم","p":22},{"t":"السوار","p":20},{"t":"القلادة","p":18},{"t":"الحلق","p":16},{"t":"الساعة","p":13},{"t":"الخلخال","p":11}]},
  {id:457,q:"اذكر مناسبة تلبس فيها رسمي",a:[{"t":"المقابلة الوظيفية","p":28},{"t":"العرس","p":23},{"t":"التخرج","p":18},{"t":"اجتماع مهم","p":14},{"t":"مناسبة رسمية","p":10},{"t":"جلسة تصوير","p":7}]},
  {id:458,q:"اذكر نوع قهوة عالمي",a:[{"t":"إسبريسو","p":21},{"t":"لاتيه","p":19},{"t":"كابتشينو","p":18},{"t":"أمريكانو","p":16},{"t":"موكا","p":14},{"t":"فلات وايت","p":12}]},
  {id:459,q:"اذكر أداة تستخدمها بتحضير القهوة",a:[{"t":"المطحنة","p":24},{"t":"مكينة الإسبريسو","p":20},{"t":"الميزان","p":17},{"t":"الكيتل","p":15},{"t":"الفلتر","p":13},{"t":"الدلة","p":11}]},
  {id:460,q:"اذكر رياضة تلعبها على الثلج",a:[{"t":"التزلج","p":24},{"t":"هوكي الجليد","p":20},{"t":"السنوبورد","p":17},{"t":"الزحافة","p":15},{"t":"التزلج الفني","p":13},{"t":"كيرلنغ","p":11}]},
  {id:461,q:"اذكر سبب ينتشر فيه مقطع بالسوشال ميديا",a:[{"t":"مضحك","p":22},{"t":"يخص موضوع الكل يتكلم عنه","p":20},{"t":"مشهور نشره","p":18},{"t":"فكرة غريبة ومبتكرة","p":16},{"t":"توقيت مناسب","p":13},{"t":"يثير جدل","p":11}]},
  {id:462,q:"اذكر شي يميز صانع محتوى ناجح",a:[{"t":"ينشر باستمرار","p":22},{"t":"يتفاعل مع متابعينه","p":20},{"t":"فكرته مختلفة","p":18},{"t":"جودة التصوير والمونتاج","p":16},{"t":"صادق ما يتصنع","p":13},{"t":"يعرف جمهوره","p":11}]},
  {id:463,q:"اذكر تحدي يواجهه اللي يشتغل من البيت",a:[{"t":"صعوبة التركيز","p":26},{"t":"قلة التواصل مع الفريق","p":22},{"t":"الشغل يختلط بالراحة","p":19},{"t":"مشاكل الإنترنت","p":15},{"t":"الشعور بالعزلة","p":11},{"t":"العيال والزعاج","p":7}]},
  {id:464,q:"اذكر تطبيق يستخدمه فريق الشغل عن بعد",a:[{"t":"زوم","p":21},{"t":"مايكروسوفت تيمز","p":19},{"t":"سلاك","p":18},{"t":"جوجل ميت","p":16},{"t":"واتساب","p":14},{"t":"تريلو","p":12}]},
  {id:465,q:"اذكر شي يقلل التوتر",a:[{"t":"التنفس العميق","p":26},{"t":"الرياضة","p":22},{"t":"تتكلم مع أحد","p":19},{"t":"تاخذ استراحة","p":15},{"t":"الدعا والذكر","p":11},{"t":"تمشي برا","p":7}]},
  {id:466,q:"اذكر سبب شائع للتوتر",a:[{"t":"ضغط الشغل","p":28},{"t":"الفلوس","p":23},{"t":"الزحمة","p":18},{"t":"مشاكل العلاقات","p":14},{"t":"قلة الوقت","p":10},{"t":"قلة النوم","p":7}]},
  {id:467,q:"اذكر ميزة بالسيارات الكهربائية",a:[{"t":"ما تحتاج بنزين","p":26},{"t":"المحرك هادي","p":22},{"t":"تسارع سريع","p":19},{"t":"صيانة أقل","p":15},{"t":"صديقة للبيئة","p":11},{"t":"شاشات وتقنيات","p":7}]},
  {id:468,q:"اذكر ماركة سيارة كهربائية",a:[{"t":"تسلا","p":35},{"t":"لوسيد","p":25},{"t":"بي واي دي","p":18},{"t":"بورش تايكان","p":10},{"t":"هيونداي أيونيك","p":7},{"t":"مرسيدس EQ","p":5}]},
  {id:469,q:"اذكر فرق بين المدينة الكبيرة والقرية",a:[{"t":"سرعة الحياة والزحمة","p":26},{"t":"الخدمات والمولات","p":22},{"t":"قلة الهدوء","p":19},{"t":"فرص الشغل","p":15},{"t":"الناس ما تعرف بعض","p":11},{"t":"غلا المعيشة","p":7}]},
  {id:470,q:"اذكر مشكلة يعاني منها سكان المدن الكبيرة",a:[{"t":"الزحمة","p":30},{"t":"غلا المعيشة","p":25},{"t":"قلة المواقف","p":18},{"t":"التلوث","p":12},{"t":"الضوضاء","p":10},{"t":"بعد المسافات","p":5}]},
  {id:471,q:"اذكر نوع كتب يقراها الناس",a:[{"t":"الروايات","p":22},{"t":"تطوير الذات","p":20},{"t":"الكتب الدينية","p":18},{"t":"السير الذاتية","p":16},{"t":"الكتب العلمية","p":13},{"t":"كتب التاريخ","p":11}]},
  {id:472,q:"اذكر سبب يخلي الواحد يحب القراءة",a:[{"t":"يزيد معرفته","p":27},{"t":"يهرب من الروتين","p":22},{"t":"يحسن لغته","p":18},{"t":"يريّح ذهنه","p":14},{"t":"يطور تفكيره","p":11},{"t":"يحب القصص","p":8}]},
  {id:473,q:"اذكر مصطلح مالي تسمعه كثير",a:[{"t":"الفايدة","p":22},{"t":"التضخم","p":20},{"t":"الميزانية","p":18},{"t":"الاستثمار","p":16},{"t":"القرض","p":13},{"t":"الأسهم","p":11}]},
  {id:474,q:"اذكر طريقة استثمار يعرفها الناس",a:[{"t":"الأسهم","p":22},{"t":"العقار","p":20},{"t":"الذهب","p":18},{"t":"الصناديق الاستثمارية","p":16},{"t":"العملات الرقمية","p":13},{"t":"مشروع خاص","p":11}]},
  {id:475,q:"اذكر شي ينشطك بالصباح",a:[{"t":"القهوة","p":26},{"t":"دش بارد","p":22},{"t":"رياضة خفيفة","p":19},{"t":"فطور صحي","p":15},{"t":"أغنية تحبها","p":11},{"t":"تفتح الستاير","p":7}]},
  {id:476,q:"اذكر عادة مسائية تريّحك",a:[{"t":"تقرا كتاب","p":24},{"t":"دش دافي","p":20},{"t":"مشي بعد العشا","p":17},{"t":"تتفرج على شي خفيف","p":15},{"t":"تكتب يومياتك","p":13},{"t":"تسمع قرآن","p":11}]},
  {id:477,q:"اذكر شي يميز مقدم نشرة الأخبار",a:[{"t":"صوت واضح","p":24},{"t":"ثقة بالنفس","p":20},{"t":"مظهر أنيق","p":17},{"t":"سرعة بديهة","p":15},{"t":"ما يتلعثم","p":13},{"t":"متابع للأخبار","p":11}]},
  {id:478,q:"اذكر شي يستخدمه المذيع بالاستوديو",a:[{"t":"الميكروفون","p":24},{"t":"سماعة الأذن","p":20},{"t":"البرومبتر","p":17},{"t":"الكاميرا","p":15},{"t":"الإضاءة","p":13},{"t":"كروت الأسئلة","p":11}]},
  {id:479,q:"اذكر مهرجان أو حدث عالمي مشهور",a:[{"t":"مهرجان كان","p":24},{"t":"كوميك كون","p":20},{"t":"كوتشيلا","p":17},{"t":"إكسبو","p":15},{"t":"مهرجان البالونات","p":13},{"t":"أوسكار","p":11}]},
  {id:480,q:"اذكر شي يميز مسابقة تلفزيونية ناجحة",a:[{"t":"جوايز مغرية","p":26},{"t":"منافسة مثيرة","p":22},{"t":"مقدم محبوب","p":19},{"t":"لجنة تحكيم معروفة","p":15},{"t":"تفاعل الجمهور","p":11},{"t":"أسئلة ذكية","p":7}]},
  {id:481,q:"اذكر شي يميز المكتبة العامة الحديثة",a:[{"t":"أقسام هادية للمذاكرة","p":24},{"t":"تنوع الكتب","p":20},{"t":"إنترنت مجاني","p":17},{"t":"فعاليات وورش","p":15},{"t":"استعارة إلكترونية","p":13},{"t":"كافيه بداخلها","p":11}]},
  {id:482,q:"اذكر شي تشوفه بحديقة الحيوان",a:[{"t":"حيوانات متنوعة","p":21},{"t":"أقفاص وأسوار","p":19},{"t":"جولات تعليمية","p":18},{"t":"إطعام الحيوانات","p":16},{"t":"عوايل وأطفال","p":14},{"t":"ريحة قوية","p":12}]},
  {id:483,q:"اذكر شي تشوفه بأكواريوم",a:[{"t":"أسماك ملونة","p":22},{"t":"نفق زجاجي","p":20},{"t":"قروش","p":18},{"t":"إضاءة هادية","p":16},{"t":"عروض غطس","p":13},{"t":"منطقة لمس الكائنات","p":11}]},
  {id:484,q:"اذكر شي تشوفه بالسيرك",a:[{"t":"عروض بهلوانية","p":24},{"t":"مهرجين","p":20},{"t":"حيوانات مدربة","p":17},{"t":"ألعاب نارية","p":15},{"t":"موسيقى حماسية","p":13},{"t":"مشي على الحبل","p":11}]},
  {id:485,q:"اذكر شي تشوفه بمعرض الكتاب",a:[{"t":"دور نشر","p":21},{"t":"توقيع كتب","p":19},{"t":"خصومات","p":18},{"t":"ندوات","p":16},{"t":"زحمة","p":14},{"t":"كافيهات","p":12}]},
  {id:486,q:"اذكر شي يصير بمؤتمر تقني",a:[{"t":"إعلان منتجات جديدة","p":24},{"t":"محاضرات لخبراء","p":20},{"t":"أجنحة الشركات","p":17},{"t":"فرص توظيف","p":15},{"t":"تجربة تقنيات","p":13},{"t":"توزيع هدايا","p":11}]},
  {id:487,q:"اذكر شي يميز الدكتور الشاطر",a:[{"t":"تشخيصه دقيق","p":22},{"t":"يصبر على المرضى","p":20},{"t":"يسمع لك","p":18},{"t":"متابع لأحدث الطب","p":16},{"t":"يشرح لك حالتك","p":13},{"t":"ما يكثر الأدوية","p":11}]},
  {id:488,q:"اذكر شي يخلي المعلم محبوب",a:[{"t":"شرحه سهل","p":26},{"t":"عادل بين الطلاب","p":22},{"t":"خفيف دم","p":19},{"t":"صبور","p":15},{"t":"يهتم بكل طالب","p":11},{"t":"ما يعطي واجبات كثيرة","p":7}]},
  {id:489,q:"اذكر شي يميز الجار الطيب",a:[{"t":"يحترم خصوصيتك","p":26},{"t":"يساعدك وقت الحاجة","p":22},{"t":"يرسل أكل بالمناسبات","p":19},{"t":"هادي ما يزعج","p":15},{"t":"يسلم ويسأل عنك","p":11},{"t":"ينتبه لبيتك وأنت مسافر","p":7}]},
  {id:490,q:"اذكر شي يصير برحلة مدرسية",a:[{"t":"باص المدرسة","p":24},{"t":"زيارة متحف أو حديقة","p":20},{"t":"غدا جماعي","p":17},{"t":"إشراف المعلمين","p":15},{"t":"تصوير","p":13},{"t":"حماس وفرح","p":11}]},
  {id:491,q:"اذكر مدينة خليجية يزورها السعوديين كثير",a:[{"t":"دبي","p":32},{"t":"المنامة","p":26},{"t":"الكويت","p":18},{"t":"الدوحة","p":12},{"t":"أبوظبي","p":7},{"t":"مسقط","p":5}]},
  {id:492,q:"اذكر صدقة يقدر يسويها أي شخص",a:[{"t":"يطعم محتاج","p":26},{"t":"سقيا ماء","p":22},{"t":"كلمة طيبة","p":19},{"t":"يساعد كبير سن","p":15},{"t":"يتبرع بملابس","p":11},{"t":"يشيل أذى من الطريق","p":7}]},
  {id:493,q:"اذكر وقت من اليوم تحبه",a:[{"t":"المغرب","p":22},{"t":"الفجر","p":20},{"t":"الليل المتأخر","p":18},{"t":"العصر","p":16},{"t":"الضحى","p":13},{"t":"بعد صلاة العشا","p":11}]},
  {id:494,q:"اذكر نشاط تسويه لما الجو يكون حلو",a:[{"t":"تمشي","p":26},{"t":"شوي بالبر","p":22},{"t":"قعدة بالحديقة","p":19},{"t":"رياضة برا","p":15},{"t":"تطلع الكورنيش","p":11},{"t":"قهوة برا","p":7}]},
  {id:495,q:"اذكر دولة الناس تحب أكلها",a:[{"t":"إيطاليا","p":22},{"t":"اليابان","p":20},{"t":"تركيا","p":18},{"t":"الهند","p":16},{"t":"المكسيك","p":13},{"t":"لبنان","p":11}]},
  {id:496,q:"اذكر شي تشوفه بألوان كثيرة مع بعض",a:[{"t":"قوس قزح","p":24},{"t":"الورد","p":20},{"t":"ألوان الرسم","p":17},{"t":"البالونات","p":15},{"t":"الحلويات","p":13},{"t":"ملابس الأطفال","p":11}]},
  {id:497,q:"اذكر صوت تعرفه من أول ما تسمعه",a:[{"t":"الأذان","p":32},{"t":"رنة جوالك","p":26},{"t":"المنبه","p":18},{"t":"صوت المطر","p":12},{"t":"بكاء طفل","p":7},{"t":"زامور السيارة","p":5}]},
  {id:498,q:"اذكر شي يضحك الطفل بسرعة",a:[{"t":"الدغدغة","p":30},{"t":"وجه مضحك","p":25},{"t":"صوت غريب","p":18},{"t":"لعبة جديدة","p":12},{"t":"تختفي وتبين","p":10},{"t":"تطيّره بالهوا","p":5}]},
  {id:499,q:"اذكر شي يخلي هوا الغرفة منعش",a:[{"t":"تفتح النافذة","p":32},{"t":"معطر جو","p":26},{"t":"المكيف","p":18},{"t":"نباتات","p":12},{"t":"بخور","p":7},{"t":"مروحة","p":5}]},
  {id:500,q:"اذكر شي تشتاق له لما تسافر بعيد",a:[{"t":"الأهل","p":26},{"t":"أكل البيت","p":22},{"t":"سريرك","p":19},{"t":"الأصحاب","p":15},{"t":"روتينك اليومي","p":11},{"t":"جو بلدك","p":7}]},
];
// مشتق من البنك لا رقماً مكتوباً بيد: كان ٢٦٧ ثم صار البنك ٥٠٠،
// وأي رقم أصغر من آخر مُعرِّف يجعل السؤال الجديد يصطدم بسؤال قائم.
let nextQId = DEFAULT_Q.length + 1;
let ALL_Q = JSON.parse(JSON.stringify(DEFAULT_Q));

// مفاتيح كاش السحابة تُعرَّف هنا لا مع دالة الجلب: فحص الإصدار تحتها يمسحها،
// وهو يسبقها في التنفيذ فيقع في المنطقة الميتة لو بقيت في مكانها السابق.
const Q_CACHE_KEY = 'khamen_q_cache';
const Q_CACHE_AT  = 'khamen_q_cache_at';
const Q_CACHE_TTL = 24 * 60 * 60 * 1000;

// Load saved questions from localStorage (with version check)
// الإصدار مشتق من حجم البنك: كان مثبتاً على ٢٦٦، فلما صار البنك ٥٠٠ بقي كل
// لاعب فتح المحرر مرة واحدة على نسخته القديمة — المحرر واللعبة معاً.
// والحجم وحده لا يكفي: البنك السعودي بدّل الـ٥٠٠ سؤال بـ٥٠٠ غيرها، فلولا هذا
// الرقم لبقي كل لاعب على البنك القديم. ارفعه عند أي تبديل لا يغيّر العدد.
const Q_REVISION = 2;
const Q_VERSION = DEFAULT_Q.length + '.' + Q_REVISION;
try {
  const savedVer = localStorage.getItem('khamen_q_version');
  if (savedVer === Q_VERSION) {
    const saved = localStorage.getItem('khamen_questions');
    if (saved) ALL_Q = JSON.parse(saved);
  } else {
    localStorage.removeItem('khamen_questions');
    // وكاش السحابة أيضاً: عمره يوم كامل، فبدونه يبقى اللاعب على البنك القديم
    // ليوم بعد تحديث الجدول رغم أن نسخته المحلية مُسحت.
    localStorage.removeItem(Q_CACHE_KEY);
    localStorage.removeItem(Q_CACHE_AT);
    localStorage.setItem('khamen_q_version', Q_VERSION);
  }
} catch(e) {}
nextQId = ALL_Q.reduce((max, q) => Math.max(max, q.id || 0), 0) + 1;

// ========= QUESTIONS FROM SUPABASE (best-effort — falls back to the built-in set) =========
function applyQuestions(list){
  ALL_Q = list;
  nextQId = ALL_Q.reduce((max, q) => Math.max(max, q.id || 0), 0) + 1;
}

// The whole question bank used to come down the wire on every single load —
// roughly 130 KB a time, and the single largest draw on the database's monthly
// bandwidth. It is now cached for a day, and the two cases where the download
// was pure waste are cut out entirely.
async function loadQuestionsFromSupabase(){
  // A player who has edited questions locally always kept their own set; the
  // fetched rows were parsed and then thrown away. Leave before paying for them.
  try{ if(localStorage.getItem('khamen_questions')) return }catch(e){}

  try{
    const at = Number(localStorage.getItem(Q_CACHE_AT) || 0);
    if(Date.now() - at < Q_CACHE_TTL){
      const cached = JSON.parse(localStorage.getItem(Q_CACHE_KEY) || 'null');
      if(Array.isArray(cached) && cached.length){ applyQuestions(cached); return }
    }
  }catch(e){ /* unreadable cache — fall through and fetch */ }

  try{
    // Only the three columns the game reads. select('*') also carried category
    // and created_at down on every load, neither of which is ever looked at.
    const { data, error } = await getSb().from('questions').select('id,question,answers');
    if(error || !Array.isArray(data) || data.length === 0) return;
    const parsed = data.map(row => {
      let answers = row.answers;
      if(typeof answers === 'string'){ try{ answers = JSON.parse(answers) }catch(e){ answers = null } }
      if(!Array.isArray(answers) || answers.length < 2) return null;
      const okShape = answers.every(a => a && typeof a.t === 'string' && typeof a.p === 'number');
      if(!okShape) return null;
      return { id: row.id, q: row.question, a: answers };
    }).filter(Boolean);
    if(parsed.length === 0) return;

    applyQuestions(parsed);
    // Failure here is not worth surfacing: a full storage quota just means the
    // next load fetches again, which is the old behaviour.
    try{
      localStorage.setItem(Q_CACHE_KEY, JSON.stringify(parsed));
      localStorage.setItem(Q_CACHE_AT, String(Date.now()));
    }catch(e){}
  }catch(e){ /* keep the built-in question set */ }
}
loadQuestionsFromSupabase();

const Q_PER_ROUND = 5;
let SETTINGS = { rounds: 2, timer: 60, theme: 'sand', tvMode: false, soundOn: true, volume: 0.7, mode: 'group', buzzerMode: false };

// ========= BUZZER / ROOMS (الجرس عن بعد) =========
let BUZZER = { channel:null, roomCode:null, slotNames:{1:null,2:null}, connectedNames:[], unlocked:false, winnerDeclared:false, creating:false };

function selectBuzzerMode(on){
  SETTINGS.buzzerMode = on;
  document.querySelectorAll('#buzzerModeSelector .opt-btn').forEach(b=>b.classList.remove('active'));
  event.target.closest('.opt-btn').classList.add('active');
  $('teamInputsWrap').classList.toggle('hidden', on);
  $('buzzerRoomWrap').classList.toggle('hidden', !on);
  AudioEngine.play('click');
}

// ست خانات (٩٠٠ ألف احتمال) بدل خمس: الكود يُختار عشوائياً، والمساحة الأوسع
// تقلّل فرص التصادم عشرة أضعاف قبل أن يتدخّل الفحص في claimRoomCode.
function genRoomCode(){ return String(Math.floor(100000 + Math.random()*900000)); }
const ROOM_CODE_TRIES = 5;
const ROOM_PROBE_MS = 1200;

// SVG rather than canvas so the code stays crisp on a projector or TV, which is
// where this actually gets pointed at. The library is a CDN script; if it didn't
// load we hide the box instead of leaving an empty gap — the link still works.
function renderBuzzerQR(url){
  const box = $('buzzerQR');
  if(!box) return;
  if(typeof qrcode !== 'function'){ box.classList.add('hidden'); return }
  try{
    const qr = qrcode(0, 'M');       // 0 = pick the smallest version that fits
    qr.addData(url);
    qr.make();
    box.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
    box.classList.remove('hidden');
  }catch(e){
    box.classList.add('hidden');
  }
}

function copyJoinUrl(){
  const url = $('buzzerJoinUrl').textContent;
  const btn = $('buzzerCopyBtn');
  if(!url) return;
  const done = ()=>{
    btn.innerHTML = iconSVG('check') + ' تم النسخ';
    AudioEngine.play('pop');
    setTimeout(()=>{ btn.innerHTML = iconSVG('download') + ' نسخ' }, 1800);
  };
  if(navigator.clipboard && window.isSecureContext){
    navigator.clipboard.writeText(url).then(done).catch(fallback);
  } else fallback();

  function fallback(){
    try{
      const ta = document.createElement('textarea');
      ta.value = url; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove(); done();
    }catch(e){
      btn.innerHTML = iconSVG('warning') + ' انسخه يدوياً';
    }
  }
}

function createBuzzerRoom(){
  if (BUZZER.channel || BUZZER.creating) return; // already created, or mid-creation
  BUZZER.creating = true;
  const btn = $('createRoomBtn');
  if (btn){ btn.disabled = true; btn.innerHTML = iconSVG('refresh') + ' جاري الإنشاء...' }
  claimRoomCode(1);
}

function roomCreateFailed(msg){
  BUZZER.creating = false;
  const btn = $('createRoomBtn');
  if (btn){ btn.disabled = false; btn.innerHTML = iconSVG('plus') + ' إنشاء غرفة' }
  showModal('⚠️','', msg);
}

// A room is nothing but a realtime channel named after its code, and the code
// used to be taken blind. Two hosts drawing the same number in the same hour
// would share one channel: their players land in each other's slots and a buzz
// from one game reaches the other host. So we now join the candidate channel
// first and look for another host in presence before claiming it — a code only
// clashes while both rooms are live, which is why nothing is stored anywhere.
function claimRoomCode(attempt){
  const sb = getSb();
  const code = genRoomCode();
  const channel = sb.channel('room-' + code, { config: { presence: { key: 'host' } } });
  let claimed = false, settled = false;

  const decide = (free) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (free){ claimed = true; finishBuzzerRoom(code, channel); return }
    try { sb.removeChannel(channel) } catch(e){}
    if (attempt >= ROOM_CODE_TRIES) return roomCreateFailed('تعذّر إيجاد كود فاضي — جرّب مرة ثانية');
    claimRoomCode(attempt + 1);
  };

  // No presence answer within the window means nobody is broadcasting there,
  // so the code is taken rather than leaving the host staring at a dead button.
  const timer = setTimeout(() => decide(true), ROOM_PROBE_MS);

  channel.on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState();
    if (!claimed) return decide(!state['host']);   // probe: is another host here?
    const joinedNames = [];
    Object.keys(state).forEach(key => {
      if (key === 'host') return;
      const meta = state[key][0];
      if (meta && meta.team_name) joinedNames.push(meta.team_name);
    });
    // Slot assignment is permanent once claimed by a name, for the life of this room —
    // a phone that reconnects (locked screen, dropped wifi, browser backgrounded, etc.)
    // must land back in the SAME slot rather than being re-numbered by connection order,
    // which could otherwise flip which team is "1" vs "2" mid-game. Presence is only used
    // to know who's currently connected (for the UI dot), never to free up a claimed slot.
    joinedNames.forEach(name => {
      if (BUZZER.slotNames[1] === name || BUZZER.slotNames[2] === name) return;
      if (!BUZZER.slotNames[1]) BUZZER.slotNames[1] = name;
      else if (!BUZZER.slotNames[2]) BUZZER.slotNames[2] = name;
    });
    BUZZER.connectedNames = joinedNames;
    updateBuzzerSlotUI();
    // A phone that just joined has no idea which theme the host is playing in.
    // Presence sync is the one event that fires on every join, so it doubles as
    // the moment to tell them.
    broadcastTheme();
  });

  channel.on('broadcast', { event: 'buzz' }, (payload) => {
    if (!claimed || !BUZZER.unlocked || BUZZER.winnerDeclared) return;
    const teamName = payload.payload.team_name;
    const slotNum = BUZZER.slotNames[1] === teamName ? 1 : (BUZZER.slotNames[2] === teamName ? 2 : null);
    if (!slotNum) return;
    BUZZER.winnerDeclared = true;
    BUZZER.unlocked = false;
    setTeam(slotNum);
    showBuzzWinner(teamName);
    channel.send({ type:'broadcast', event:'winner', payload:{ team_name: teamName } });
  });

  // Nothing is tracked on SUBSCRIBED any more: announcing ourselves as the host
  // before the probe finishes would make a second host see us and skip a code
  // that is in fact free — and would plant us inside a room that is not ours.
  channel.subscribe((status) => {
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT'){
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { sb.removeChannel(channel) } catch(e){}
      roomCreateFailed('تعذّر الاتصال بالسيرفر — تأكد من الإنترنت وجرّب مرة ثانية');
    }
  });
}

function finishBuzzerRoom(code, channel){
  BUZZER.roomCode = code;
  BUZZER.slotNames = {1:null, 2:null};
  BUZZER.connectedNames = [];
  BUZZER.channel = channel;
  BUZZER.creating = false;

  $('buzzerCodeDisplay').textContent = code;
  // /j/CODE instead of /buzzer-join.html?code=CODE -- players read this off a
  // screen and type it on a phone, so every character removed is one less typo.
  // The _redirects file rewrites it back to the real page.
  const joinUrl = location.origin + '/j/' + code;
  $('buzzerJoinUrl').textContent = joinUrl;
  renderBuzzerQR(joinUrl);
  $('createRoomBtn').classList.add('hidden');
  $('buzzerRoomInfo').classList.remove('hidden');
  updateBuzzerSlotUI();

  channel.track({ role:'host' });
}

function updateBuzzerSlotUI(){
  for (let i=1;i<=2;i++){
    const el = $('buzzerSlot'+i); const st = $('bs'+i+'status');
    if (!el || !st) continue;
    const name = BUZZER.slotNames[i];
    const isConnected = name && BUZZER.connectedNames.includes(name);
    el.classList.toggle('joined', !!isConnected);
    if (!name) st.textContent = '⏳ بانتظار الانضمام';
    else st.textContent = (isConnected ? '✓ ' : '⚠ غير متصل — ') + name;
  }
}

function unlockGameBuzzer(){
  if (!BUZZER.channel) return;
  BUZZER.unlocked = true;
  BUZZER.winnerDeclared = false;
  $('buzzOverlay').classList.remove('show');
  $('buzzerUnlockBtn').disabled = true;
  BUZZER.channel.send({ type:'broadcast', event:'unlock', payload:{} });
  AudioEngine.play('click');
}

function lockGameBuzzer(){
  if (!BUZZER.channel) return;
  BUZZER.unlocked = false;
  if ($('buzzerUnlockBtn')) $('buzzerUnlockBtn').disabled = false;
  BUZZER.channel.send({ type:'broadcast', event:'lock', payload:{} });
}

function showBuzzWinner(teamName){
  AudioEngine.play('switch', {pan:0});
  $('buzzWinnerText').textContent = teamName + ' ضغط الزر أول!';
  $('buzzOverlay').classList.add('show');
  // stays up on purpose — hidden only when control passes to the other team (addStrike)
  // or a new question loads (loadQuestion), not on a timer
  if ($('buzzerUnlockBtn')) $('buzzerUnlockBtn').disabled = true;
}

function hideBuzzBanner(){
  $('buzzOverlay').classList.remove('show');
}

let G = { t1:{name:'',score:0}, t2:{name:'',score:0}, playing:1, round:0, qIndex:0, qInRound:0, strikes:0, roundPts:{1:0,2:0}, revealed:new Set(), questions:[], timerInterval:null, timerLeft:0, timerRunning:false, soloScore:0, soloStrikes:0, stealMode:false, stealPts:0, stealFrom:'', shieldActive:false, toolsUsed:{letter:false,hint:false,shield:false}, stats:{roundScores:[],totalReveals:0,totalStrikes:0,bestRound:{team:'',pts:0},fastestReveal:null,roundStartTime:0} };
const $=id=>document.getElementById(id);
// أرقام عربية هندية للعرض فقط. لا تُستعمل مع كود غرفة الجرس ولا مفتاح
// التفعيل ولا حقول الإدخال: تلك تُقرأ أو تُكتب على لوحة مفاتيح لاتينية.
const AR_DIGITS='٠١٢٣٤٥٦٧٨٩';
const ar=v=>String(v==null?'':v).replace(/[0-9]/g,d=>AR_DIGITS[+d]);
const shuffle=a=>{const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b};

// ========= AUDIO ENGINE =========
const AudioEngine={
ctx:null,
getCtx(){if(!this.ctx)this.ctx=new(window.AudioContext||window.webkitAudioContext)();return this.ctx},
masterVol(){const c=this.getCtx();const g=c.createGain();g.gain.value=SETTINGS.volume;g.connect(c.destination);return g},
// pitched tone with an optional quiet octave-up harmonic layer for warmth, and optional stereo pan
tone(dest,freq,{type='sine',dur=0.2,gain=0.2,glideTo=null,delay=0,harmonic=0,pan=null}={}){
  const c=this.getCtx();const t=c.currentTime+delay;
  let out=dest;
  if(pan!==null){const p=c.createStereoPanner();p.pan.value=pan;p.connect(dest);out=p}
  const o=c.createOscillator(),g=c.createGain();
  o.type=type;o.frequency.setValueAtTime(freq,t);
  if(glideTo)o.frequency.exponentialRampToValueAtTime(glideTo,t+dur*0.6);
  g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(0.001,t+dur);
  o.connect(g);g.connect(out);o.start(t);o.stop(t+dur);
  if(harmonic>0){
    const o2=c.createOscillator(),g2=c.createGain();
    o2.type='triangle';o2.frequency.setValueAtTime(freq*2,t);
    if(glideTo)o2.frequency.exponentialRampToValueAtTime(glideTo*2,t+dur*0.6);
    g2.gain.setValueAtTime(gain*harmonic,t);g2.gain.exponentialRampToValueAtTime(0.001,t+dur*0.7);
    o2.connect(g2);g2.connect(out);o2.start(t);o2.stop(t+dur*0.7);
  }
},
// filtered noise burst — used for tactile UI clicks/thuds instead of thin sine beeps
noise(dest,{dur=0.08,type='highpass',freq=1500,Q=0.7,gain=0.25,decay=0.06,delay=0,pan=null}={}){
  const c=this.getCtx();const t=c.currentTime+delay;
  let out=dest;
  if(pan!==null){const p=c.createStereoPanner();p.pan.value=pan;p.connect(dest);out=p}
  const n=Math.max(1,Math.floor(c.sampleRate*dur));
  const buf=c.createBuffer(1,n,c.sampleRate);const d=buf.getChannelData(0);
  for(let i=0;i<n;i++)d[i]=Math.random()*2-1;
  const src=c.createBufferSource();src.buffer=buf;
  const f=c.createBiquadFilter();f.type=type;f.frequency.value=freq;f.Q.value=Q;
  const g=c.createGain();g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(0.001,t+decay);
  src.connect(f);f.connect(g);g.connect(out);src.start(t);src.stop(t+dur);
},
play(type,opts){
  if(!SETTINGS.soundOn)return;
  opts=opts||{};
  try{
    const dest=this.masterVol();
    if(type==='reveal'){this.tone(dest,620,{dur:0.26,gain:0.24,glideTo:1250,harmonic:0.25});this.noise(dest,{dur:0.035,type:'bandpass',freq:2400,Q:1.4,gain:0.05,decay:0.03})}
    else if(type==='strike'){this.tone(dest,460,{dur:0.3,gain:0.16,glideTo:200});this.noise(dest,{dur:0.1,type:'lowpass',freq:450,Q:0.7,gain:0.16,decay:0.1})}
    else if(type==='applause'){for(let i=0;i<28;i++){this.noise(dest,{dur:0.09,type:'bandpass',freq:900+Math.random()*2400,Q:0.5,gain:0.018,decay:0.09,delay:Math.random()*0.55,pan:Math.random()*2-1})}}
    else if(type==='win'){[523,659,784,1047].forEach((freq,i)=>this.tone(dest,freq,{dur:0.4,gain:0.18,delay:i*0.15,harmonic:0.3}))}
    else if(type==='tick'){this.tone(dest,1050,{dur:0.05,gain:0.1,harmonic:0.15});this.noise(dest,{dur:0.02,type:'highpass',freq:4000,gain:0.04,decay:0.02})}
    else if(type==='timeup'){this.tone(dest,400,{type:'square',dur:0.75,gain:0.2});this.tone(dest,196,{type:'square',dur:0.75,gain:0.12,delay:0.04})}
    // UI button sounds
    else if(type==='click'){this.noise(dest,{dur:0.035,type:'highpass',freq:2600,Q:0.9,gain:0.12,decay:0.03});this.tone(dest,720,{dur:0.05,gain:0.06})}
    else if(type==='pop'){this.tone(dest,420,{dur:0.1,gain:0.16,glideTo:900,harmonic:0.2});this.noise(dest,{dur:0.03,type:'bandpass',freq:2000,Q:1,gain:0.05,decay:0.03})}
    else if(type==='swoosh'){this.noise(dest,{dur:0.2,type:'bandpass',freq:1200,Q:1.6,gain:0.1,decay:0.18})}
    else if(type==='coin'){this.tone(dest,1300,{dur:0.09,gain:0.14,harmonic:0.3});this.tone(dest,1700,{dur:0.16,gain:0.13,delay:0.07,harmonic:0.3})}
    else if(type==='switch'){const pan=opts.pan!=null?opts.pan:0;this.tone(dest,520,{dur:0.12,gain:0.13,pan,harmonic:0.2});this.tone(dest,700,{dur:0.13,gain:0.11,delay:0.08,pan,harmonic:0.2})}
    else if(type==='open'){[320,480,640].forEach((f,i)=>this.tone(dest,f,{dur:0.14,gain:0.09,delay:i*0.055,harmonic:0.2}))}
    else if(type==='close'){[640,480,320].forEach((f,i)=>this.tone(dest,f,{dur:0.14,gain:0.09,delay:i*0.055,harmonic:0.2}))}
    else if(type==='error'){this.tone(dest,240,{type:'square',dur:0.18,gain:0.1,glideTo:140});this.noise(dest,{dur:0.06,type:'lowpass',freq:600,gain:0.08,decay:0.06})}
    else if(type==='start'){[523,659,784,1047,1318].forEach((f,i)=>this.tone(dest,f,{dur:0.22,gain:0.15,delay:i*0.1,harmonic:0.3}))}
  }catch(e){}
}};

// ========= SETUP =========
function selectRounds(n){SETTINGS.rounds=n;document.querySelectorAll('#roundsSelector .opt-btn').forEach(b=>b.classList.remove('active'));event.target.classList.add('active');AudioEngine.play('click')}
function selectTimer(s){SETTINGS.timer=s;document.querySelectorAll('#timerSelector .opt-btn').forEach(b=>b.classList.remove('active'));event.target.classList.add('active');AudioEngine.play('click')}
// Single source of truth for the theme list. The picker appears twice (setup
// screen + in-game settings); it used to be hand-written markup in both, so
// adding a theme meant editing two places and the in-game one matched by array
// index — a mismatch there silently highlighted the wrong dot.
const THEMES=[
  {id:'sand',     name:'رملي', swatch:'oklch(85% .05 85)'},
  {id:'ocean',    name:'بحري', swatch:'#1a3a5c'},
  {id:'forest',   name:'غابة', swatch:'#1a3c2a'},
  {id:'sunset',   name:'غروب', swatch:'#5c2a1a'},
  {id:'navy',     name:'كحلي', swatch:'#1c5882'},
  {id:'dakkah',   name:'دكة',  swatch:'#241f45'},
];

const THEME_KEY = 'khamen_theme';

// The inline script in <head> has already put the saved theme on <html>. Read it
// back so SETTINGS and the picker agree with what is on screen, and drop it if
// it names a theme that no longer exists — a stale id would otherwise leave the
// attribute set to something no rule matches.
(function(){
  const t = document.documentElement.getAttribute('data-theme');
  if(t && THEMES.some(x => x.id === t)){ SETTINGS.theme = t; return }
  document.documentElement.setAttribute('data-theme', SETTINGS.theme);
  if(t){ try{ localStorage.removeItem(THEME_KEY) }catch(e){} }
})();

function renderThemePickers(){
  const html=THEMES.map(t=>
    '<button class="theme-dot" data-theme="'+t.id+'" onclick="selectTheme(\''+t.id+'\')" title="'+t.name+'">'+
    '<span style="background:'+t.swatch+'"></span></button>').join('');
  document.querySelectorAll('[data-theme-picker]').forEach(el=>{el.innerHTML=html});
  markActiveTheme();
}

// Matches on the theme id, not click target or index, so both pickers stay in
// sync no matter which one was used.
function markActiveTheme(){
  document.querySelectorAll('.theme-dot').forEach(d=>d.classList.toggle('active',d.dataset.theme===SETTINGS.theme));
}

// data-theme goes on <html>, matching where the head script sets it and where
// the other two pages carry it. Persisted so a player who picks the dark theme
// once isn't met by the light one on every load.
function selectTheme(t){
  SETTINGS.theme=t;
  document.documentElement.setAttribute('data-theme',t);
  try{ localStorage.setItem(THEME_KEY,t) }catch(e){}
  markActiveTheme(); broadcastTheme(); AudioEngine.play('pop');
}

// Players' phones mirror the host's theme, so the room looks like one product
// across every screen. Silent no-op when no buzzer room is open.
function broadcastTheme(){
  if(!BUZZER.channel) return;
  try{ BUZZER.channel.send({ type:'broadcast', event:'theme', payload:{ theme: SETTINGS.theme } }) }catch(e){}
}
renderThemePickers();
function selectTV(on){SETTINGS.tvMode=on;$('tvOff').classList.toggle('active',!on);$('tvOn').classList.toggle('active',on);document.body.classList.toggle('tv-mode',on);AudioEngine.play('click')}
function selectMode(m){
  SETTINGS.mode=m;
  document.querySelectorAll('#modeSelector .opt-btn').forEach(b=>b.classList.remove('active'));
  event.target.closest('.opt-btn').classList.add('active');
  $('soloInputWrap').classList.toggle('hidden',m==='group');
  $('buzzerModeOption').classList.toggle('hidden', m==='solo');
  if (m==='solo') {
    // buzzer mode only makes sense in group mode — force back to manual team-name entry
    SETTINGS.buzzerMode = false;
    document.querySelectorAll('#buzzerModeSelector .opt-btn').forEach((b,i)=>b.classList.toggle('active', i===0));
    $('buzzerRoomWrap').classList.add('hidden');
    $('teamInputsWrap').classList.add('hidden');
  } else {
    $('teamInputsWrap').classList.toggle('hidden', SETTINGS.buzzerMode);
    $('buzzerRoomWrap').classList.toggle('hidden', !SETTINGS.buzzerMode);
  }
  AudioEngine.play('click');
}
function toggleSound(){SETTINGS.soundOn=!SETTINGS.soundOn;$('soundBtn').classList.toggle('muted',!SETTINGS.soundOn);$('soundBtn').innerHTML=iconSVG(SETTINGS.soundOn?'volume':'volume-mute');if(SETTINGS.soundOn)AudioEngine.play('pop')}
function setVolume(v){SETTINGS.volume=v/100;if(v==0){SETTINGS.soundOn=false;$('soundBtn').classList.add('muted');$('soundBtn').innerHTML=iconSVG('volume-mute')}else{SETTINGS.soundOn=true;$('soundBtn').classList.remove('muted');$('soundBtn').innerHTML=iconSVG('volume')}}
function saveQuestions(){try{localStorage.setItem('khamen_questions',JSON.stringify(ALL_Q))}catch(e){}}
function resetToDefaults(){gameConfirm('متأكد تبي ترجع الأسئلة الأصلية؟ بتنمسح كل التعديلات!',function(){ALL_Q=JSON.parse(JSON.stringify(DEFAULT_Q));nextQId=DEFAULT_Q.length+1;saveQuestions();renderEditorList()},'🔄')}

// ========= EDITOR (full edit) =========
let editingIndex=-1;
function openEditor(){AudioEngine.play('open');$('setupScreen').classList.add('hidden');$('editorScreen').classList.remove('hidden');editingIndex=-1;if($('editorSearch'))$('editorSearch').value='';renderEditorList()}
function closeEditor(){AudioEngine.play('close');$('editorScreen').classList.add('hidden');$('setupScreen').classList.remove('hidden')}
function clearEditorSearch(){$('editorSearch').value='';renderEditorList();$('editorSearch').focus()}
function renderEditorList(){
  const list=$('editorList');list.innerHTML='';
  const term=($('editorSearch')?$('editorSearch').value:'').trim().toLowerCase();
  $('editorSearchClear').classList.toggle('hidden',!term);
  const items=ALL_Q.map((q,i)=>({q,i})).filter(({q})=>{
    if(!term)return true;
    if(q.q.toLowerCase().includes(term))return true;
    return q.a.some(ans=>ans.t.toLowerCase().includes(term));
  });
  $('editorEmpty').classList.toggle('hidden',items.length>0);
  items.forEach(({q,i})=>{
    const d=document.createElement('div');d.className='eq-item';
    const idSpan=document.createElement('span');idSpan.className='eq-id';idSpan.textContent='#'+ar(q.id||'—');
    const textSpan=document.createElement('span');textSpan.className='eq-text';textSpan.textContent=q.q;
    const countSpan=document.createElement('span');countSpan.className='eq-count';countSpan.textContent=ar(q.a.length)+' إجابات';
    const editBtn=document.createElement('button');editBtn.className='eq-edit';editBtn.appendChild(iconEl('pencil'));editBtn.onclick=()=>editQ(i);
    const delBtn=document.createElement('button');delBtn.className='eq-del';delBtn.appendChild(iconEl('trash'));delBtn.onclick=()=>deleteQ(i);
    d.append(idSpan,textSpan,countSpan,editBtn,delBtn);
    list.appendChild(d);
  });
  $('qCount').textContent=ar(ALL_Q.length);
}
function deleteQ(i){if(ALL_Q.length<=1)return showModal('⚠️','','لازم يكون فيه على الأقل سؤال واحد!');ALL_Q.splice(i,1);saveQuestions();renderEditorList()}
function editQ(i){editingIndex=i;const q=ALL_Q[i];$('newQ').value=q.q;const rows=document.querySelectorAll('#newAnswers .ea-row');rows.forEach((row,j)=>{row.querySelector('.ea-ans').value=q.a[j]?q.a[j].t:'';row.querySelector('.ea-pts').value=q.a[j]?q.a[j].p:''});$('addQBtn').innerHTML=iconSVG('save')+' حفظ التعديل';updateEaTotal();$('newQ').scrollIntoView({behavior:'smooth'})}
function addOrUpdateQ(){const q=$('newQ').value.trim();if(!q)return showModal('⚠️','','اكتب السؤال!');const rows=document.querySelectorAll('#newAnswers .ea-row');const answers=[];rows.forEach(row=>{const t=row.querySelector('.ea-ans').value.trim();const p=parseInt(row.querySelector('.ea-pts').value);if(t&&p>0)answers.push({t,p})});if(answers.length<2)return showModal('⚠️','','أضف على الأقل إجابتين مع النقاط!');if(editingIndex>=0){ALL_Q[editingIndex]={id:ALL_Q[editingIndex].id,q,a:answers};editingIndex=-1;$('addQBtn').innerHTML=iconSVG('plus')+' أضف السؤال'}else{ALL_Q.push({id:nextQId++,q,a:answers})}$('newQ').value='';document.querySelectorAll('#newAnswers input').forEach(i=>i.value='');updateEaTotal();saveQuestions();renderEditorList()}

// عدّاد مجموع النقاط في نموذج الإضافة. البنك كله مبني على أن السؤال الواحد
// ١٠٠ نقطة، وبدون عدّاد يكتشف المقدّم اختلال التوزيع وهو يلعب لا وهو يكتب.
function updateEaTotal(){
  const box = $('eaTotal'); if(!box) return;
  const sum = [...document.querySelectorAll('#newAnswers .ea-pts')]
    .reduce((s, i) => s + (parseInt(i.value) || 0), 0);
  $('eaTotalNum').textContent = ar(sum);
  $('eaTotalMark').textContent = sum === 100 ? ' ✓' : '';
  box.dataset.state = sum === 0 ? 'empty' : (sum === 100 ? 'ok' : 'off');
}
// تفويض على الحاوية لا على كل حقل: الصفوف ستة وثابتة، والتفويض يبقى صحيحاً
// لو زاد عددها لاحقاً.
if ($('newAnswers')) $('newAnswers').addEventListener('input', updateEaTotal);

// ========= DOWNLOAD QUESTIONS PDF =========
// ورقة مرجع للمقدّم: يطبعها ويقرأ منها، فالأولوية للوضوح على الورق — ألوان
// الهوية، وبطاقة لا تنقسم بين صفحتين، ومجموع نقاط كل سؤال ظاهر للمراجعة.
function downloadQuestionsPDF(){
  const esc = s => String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const list = [...ALL_Q].sort((a,b)=>(a.id||0)-(b.id||0));
  const today = new Date().toLocaleDateString('ar-SA',{year:'numeric',month:'long',day:'numeric'});
  const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>خمّن صح — بنك الأسئلة</title>
<style>
@page{size:A4;margin:14mm 12mm}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Tahoma,'Segoe UI',sans-serif;background:#fff;color:#3a2a1a;direction:rtl;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.head{display:flex;align-items:center;gap:14px;border-bottom:3px solid #eab543;padding-bottom:12px;margin-bottom:6px}
.seal{width:46px;height:46px;flex-shrink:0}
.brand{font-size:26px;font-weight:700;color:#7a3f1c;line-height:1.2}
.tag{font-size:12px;color:#8a7256;margin-top:2px}
.meta{margin-right:auto;text-align:left;font-size:11px;color:#8a7256;line-height:1.7}
.meta b{color:#7a3f1c;font-size:13px}
.note{font-size:11px;color:#8a7256;margin:10px 0 14px;padding-right:2px}
.q-card{page-break-inside:avoid;break-inside:avoid;margin-bottom:10px;border:1.5px solid #e0d3b8;border-radius:10px;overflow:hidden}
.q-head{background:#f6ecd9;padding:8px 12px;display:flex;align-items:center;gap:10px}
.q-num{min-width:30px;height:24px;border-radius:12px;background:#7a3f1c;color:#fbf3e6;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;padding:0 8px}
.q-text{font-size:14px;font-weight:700;color:#3a2a1a;flex:1}
.q-sum{font-size:10px;color:#8a7256;flex-shrink:0;white-space:nowrap}
.a-grid{display:grid;grid-template-columns:1fr 1fr}
.a-item{padding:6px 12px;border-top:1px solid #efe4cd;display:flex;align-items:center;gap:8px;font-size:12.5px}
.a-item:nth-child(odd){border-left:1px solid #efe4cd}
.a-num{width:19px;height:19px;border-radius:5px;background:#f2e3c4;color:#7a3f1c;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0}
.a-text{flex:1}
.a-pts{background:#eab543;color:#5c2f14;border-radius:5px;padding:1px 7px;font-size:10.5px;font-weight:700;flex-shrink:0}
.foot{margin-top:14px;border-top:1px solid #e0d3b8;padding-top:8px;text-align:center;font-size:10.5px;color:#a89478}
</style></head><body>
<div class="head">
  <svg class="seal" viewBox="0 0 240 240"><circle cx="120" cy="120" r="118" fill="#eab543"/><circle cx="120" cy="120" r="113" fill="#7a3f1c"/><circle cx="120" cy="120" r="101" fill="#eab543"/><circle cx="120" cy="120" r="96" fill="#7a3f1c"/><polyline points="78,122 105,149 162,88" fill="none" stroke="#eab543" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/></svg>
  <div><div class="brand">خمّن صح</div><div class="tag">بنك الأسئلة — ورقة المقدّم</div></div>
  <div class="meta"><b>${ar(list.length)}</b> سؤال<br>${today}</div>
</div>
<div class="note">الرقم جنب كل إجابة ترتيبها على اللوحة، والرقم الذهبي نقاطها.</div>
${list.map((q,i)=>{
  const sum = q.a.reduce((s,a)=>s+(a.p||0),0);
  return `<div class="q-card"><div class="q-head"><span class="q-num">${ar(q.id||i+1)}</span><span class="q-text">${esc(q.q)}</span><span class="q-sum">${ar(sum)} نقطة</span></div><div class="a-grid">${
    q.a.map((a,j)=>`<div class="a-item"><span class="a-num">${ar(j+1)}</span><span class="a-text">${esc(a.t)}</span><span class="a-pts">${ar(a.p)}</span></div>`).join('')
  }</div></div>`;
}).join('')}
<div class="foot">خمّن صح — khamensah.com</div>
<script>window.onload=()=>{window.print()}<\/script></body></html>`;

  const w = window.open('','_blank');
  if(w){w.document.write(html);w.document.close()}
  else{showModal('⚠️','','فعّل النوافذ المنبثقة عشان تقدر تحمّل الـ PDF')}
}

// ========= INIT GAME =========
function initGame(){
if(!checkLicenseForPlay()) return;
const totalNeeded=SETTINGS.rounds*Q_PER_ROUND;if(ALL_Q.length<totalNeeded)return showModal('⚠️','','تحتاج '+totalNeeded+' سؤال ('+SETTINGS.rounds+' جولات × '+Q_PER_ROUND+' أسئلة) لكن عندك '+ALL_Q.length+' فقط!');
const isSolo=SETTINGS.mode==='solo';
if(!isSolo && SETTINGS.buzzerMode){
  if(!BUZZER.channel) return showModal('⚠️','','أنشئ غرفة الجرس الأول!');
  if(!BUZZER.slotNames[1]||!BUZZER.slotNames[2]) return showModal('⚠️','','لازم الفريقين ينضمون للغرفة قبل ما تبدأ اللعبة!');
}
G.t1.name=isSolo?($('inpSolo').value.trim()||'اللاعب'):(SETTINGS.buzzerMode?BUZZER.slotNames[1]:($('inp1').value.trim()||'الفريق الأول'));
G.t2.name=isSolo?'':(SETTINGS.buzzerMode?BUZZER.slotNames[2]:($('inp2').value.trim()||'الفريق الثاني'));
G.t1.score=0;G.t2.score=0;G.soloScore=0;G.soloStrikes=0;G.playing=1;G.round=0;G.qIndex=0;G.qInRound=0;
G.questions=shuffle(ALL_Q).slice(0,totalNeeded);G.stats={roundScores:[],totalReveals:0,totalStrikes:0,bestRound:{team:'',pts:0},fastestReveal:null,roundStartTime:0};
// Toggle solo/group mode on game screen
$('gameScreen').classList.toggle('solo-mode',isSolo);
if(!isSolo){$('tn1').textContent=G.t1.name;$('tn2').textContent=G.t2.name;$('ctrlTN1').textContent=G.t1.name;$('ctrlTN2').textContent=G.t2.name}
else{$('soloName').textContent=G.t1.name;$('soloPts').textContent=ar(0)}
$('setupScreen').classList.add('hidden');$('gameScreen').classList.remove('hidden');$('goScreen').classList.add('hidden');
if(SETTINGS.timer>0)$('timerWrap').classList.remove('hidden');else $('timerWrap').classList.add('hidden');
$('buzzerUnlockBtn').classList.toggle('hidden', isSolo || !SETTINGS.buzzerMode);
AudioEngine.play('start');
loadQuestion()}

// ========= LOAD QUESTION =========
function loadQuestion(){const q=G.questions[G.qIndex];G.strikes=0;G.soloStrikes=0;G.revealed=new Set();G.roundPts={1:0,2:0};G.stealMode=false;G.stealPts=0;G.stealFrom='';G.shieldActive=false;G.toolsUsed={letter:false,hint:false,shield:false};G.stats.roundStartTime=Date.now();
// Reset tool button states
document.querySelectorAll('.tool-btn').forEach(b=>b.classList.remove('used'));
$('qText').textContent=q.q;$('roundBadge').textContent='الجولة '+ar(G.round+1)+' — السؤال '+ar(G.qInRound+1)+' من '+ar(Q_PER_ROUND)+' (#'+ar(q.id||'')+')';
renderProgress();
for(let i=1;i<=3;i++){$('sx'+i).classList.remove('hit');if($('ssx'+i))$('ssx'+i).classList.remove('hit')}
const board=$('board');board.innerHTML='';q.a.forEach((ans,i)=>{const d=document.createElement('div');d.className='flip-card';d.id='sl'+i;d.onclick=()=>revealAnswer(i);d.innerHTML='<div class="flip-inner"><div class="flip-front"><div class="num">'+ar(i+1)+'</div><div class="txt"><span class="dots">● ● ● ● ●</span></div></div><div class="flip-back"><div class="num">'+ar(i+1)+'</div><div class="txt">'+ans.t+'</div><div class="pts">'+ar(ans.p)+'</div></div></div>';board.appendChild(d)});
if(SETTINGS.mode==='solo'){const inp=$('soloGuess');if(inp){inp.value='';setTimeout(()=>inp.focus(),100)}}
if(SETTINGS.buzzerMode){ hideBuzzBanner(); unlockGameBuzzer(); }
updateUI();resetTimer()}

// ========= TIMER =========
function resetTimer(){clearInterval(G.timerInterval);G.timerRunning=false;if(SETTINGS.timer<=0)return;G.timerLeft=SETTINGS.timer;updateTimerDisplay();updateTimerBtn()}
function toggleTimer(){if(SETTINGS.timer<=0)return;AudioEngine.play('click');if(G.timerRunning)pauseTimer();else startTimer()}
// الوصول للصفر لا يعطّل الزر: الضغط على «تشغيل» بعده يعيد ملء الحلقة ويبدأ
// العدّ من أول، لأن المقدم كثيراً ما يمدّد للفريق وقتاً إضافياً على نفس السؤال.
function startTimer(){if(SETTINGS.timer<=0)return;
if(G.timerLeft<=0){G.timerLeft=SETTINGS.timer;updateTimerDisplay()}
G.timerRunning=true;updateTimerBtn();G.timerInterval=setInterval(()=>{G.timerLeft--;updateTimerDisplay();if(G.timerLeft<=5&&G.timerLeft>0)AudioEngine.play('tick');if(G.timerLeft<=0){clearInterval(G.timerInterval);G.timerRunning=false;updateTimerBtn()}},1000)}
function pauseTimer(){clearInterval(G.timerInterval);G.timerRunning=false;updateTimerBtn()}
// Arc timer: the gold ring drains over the full duration and the whole dial turns
// red only when it hits zero. 452.4 is the r=72 circumference the stylesheet's
// stroke-dasharray is pinned to — change both together or the ring desyncs.
function updateTimerDisplay(){
  const total=SETTINGS.timer||1, left=Math.max(0,G.timerLeft);
  const el=$('timerNum'), arc=$('timerArc'), wrap=$('timerWrap');
  if(el){el.textContent=ar(left);el.classList.remove('warn','danger')}
  if(arc)arc.style.strokeDashoffset=String(452.4*(1-left/total));
  if(wrap)wrap.classList.toggle('time-up',left<=0);
}
function updateTimerBtn(){const btn=$('timerToggleBtn');if(!btn)return;if(G.timerRunning){btn.innerHTML=iconSVG('pause')+' إيقاف';btn.className='timer-ctrl-btn pause'}else{btn.innerHTML=iconSVG('play')+' تشغيل';btn.className='timer-ctrl-btn play'}}
function stopTimer(){clearInterval(G.timerInterval);G.timerRunning=false}

// ========= REVEAL =========
function revealAnswer(i){if(G.revealed.has(i))return;
const isFirstReveal = G.revealed.size === 0 && SETTINGS.mode === 'group' && !G.stealMode;
G.revealed.add(i);const q=G.questions[G.qIndex];const pts=q.a[i].p;
G.stats.totalReveals++;if(!G.stats.fastestReveal)G.stats.fastestReveal=((Date.now()-G.stats.roundStartTime)/1000).toFixed(1);
$('sl'+i).classList.add('revealed');AudioEngine.play('reveal');
const maxPts=Math.max.apply(null,q.a.map(x=>x.p));if(pts>0&&pts>=maxPts)miniConfetti();

if(isFirstReveal){
  // First correct answer — ask which team answered
  const m = document.createElement('div');m.className='modal-bg show';m.id='teamPickModal';
  m.innerHTML='<div class="modal-card"><h2>\uD83C\uDFA4 مين جاوب صح؟</h2><p class="m-pts">+'+pts+'</p><p>اختر الفريق اللي جاوب الإجابة الأولى</p><div style="display:flex;gap:14px;justify-content:center;margin-top:18px;flex-wrap:wrap"><button class="ctrl-btn ctrl-team" onclick="pickTeamForReveal(1,'+pts+')" style="min-width:150px;font-size:1.2rem;padding:16px 28px">'+G.t1.name+'</button><button class="ctrl-btn ctrl-team" onclick="pickTeamForReveal(2,'+pts+')" style="min-width:150px;font-size:1.2rem;padding:16px 28px">'+G.t2.name+'</button></div></div>';
  document.body.appendChild(m);
  return;
}

// Normal flow — add points to current team
const team=G.playing===1?G.t1:G.t2;team.score+=pts;
// Steal: first correct answer after 3 strikes = steal all previous points
if(G.stealMode){team.score+=G.stealPts;showModal('\uD83D\uDD25 سرقة!',G.stealPts,team.name+' سرق نقاط '+G.stealFrom+'!');AudioEngine.play('applause');G.stealMode=false;G.stealPts=0;G.stealFrom=''}
G.stats.roundScores.push({team:team.name,pts:pts});if(pts>G.stats.bestRound.pts)G.stats.bestRound={team:team.name,pts:pts};
updateUI();if(G.revealed.size===q.a.length){stopTimer();AudioEngine.play('applause')}}

function pickTeamForReveal(teamNum,pts){
  const modal=$('teamPickModal');if(modal)modal.remove();
  const team = teamNum===1?G.t1:G.t2;
  team.score += pts;
  setTeam(teamNum);
  G.stats.roundScores.push({team:team.name,pts:pts});
  if(pts>G.stats.bestRound.pts)G.stats.bestRound={team:team.name,pts:pts};
  const q=G.questions[G.qIndex];
  updateUI();
  if(G.revealed.size===q.a.length){stopTimer();AudioEngine.play('applause')}
}

// ========= SOLO GUESS =========
function matchAnswer(guess,answer){
  const n=s=>s.replace(/[أإآا]/g,'ا').replace(/[ة]/g,'ه').replace(/[ى]/g,'ي').replace(/[\s\-\_]/g,'').replace(/ال/g,'').trim().toLowerCase();
  const g=n(guess),a=n(answer);
  if(!g)return false;
  if(a.includes(g)||g.includes(a))return true;
  const words=answer.split(/\s+/);
  for(const w of words){const nw=n(w);if(nw.length>2&&(g.includes(nw)||nw.includes(g)))return true}
  return false;
}

function submitSoloGuess(){
  const inp=$('soloGuess');const guess=inp.value.trim();if(!guess)return;inp.value='';inp.focus();
  const q=G.questions[G.qIndex];let found=-1;
  q.a.forEach((a,i)=>{if(!G.revealed.has(i)&&matchAnswer(guess,a.t))found=i});
  if(found>=0){
    G.revealed.add(found);
    const pts=q.a[found].p;G.soloScore+=pts;G.stats.totalReveals++;
    if(!G.stats.fastestReveal)G.stats.fastestReveal=((Date.now()-G.stats.roundStartTime)/1000).toFixed(1);
    $('sl'+found).classList.add('revealed');
    AudioEngine.play('reveal');updateUI();
    if(G.revealed.size===q.a.length){stopTimer();AudioEngine.play('applause')}
  } else {
    // Shield check for solo
    if(G.shieldActive){G.shieldActive=false;showModal('🛡️ درع الحماية!','','الستريك ملغي — الدرع حماك!');AudioEngine.play('reveal');document.querySelectorAll('.tool-btn').forEach(b=>b.classList.remove('shield-active'));return}
    G.soloStrikes++;G.stats.totalStrikes++;
    if($('ssx'+G.soloStrikes))$('ssx'+G.soloStrikes).classList.add('hit');
    showX();AudioEngine.play('strike');
    if(G.soloStrikes>=3){stopTimer();setTimeout(()=>{showModal('٣ أخطاء! ✕','','انتهى السؤال');G.soloStrikes=0;for(let i=1;i<=3;i++)if($('ssx'+i))$('ssx'+i).classList.remove('hit')},900)}
  }
}

// ========= STRIKES (3 = switch team, NO reveal) =========
function addStrike(){if(G.strikes>=3)return;
// Shield check
if(G.shieldActive){G.shieldActive=false;showModal('🛡️ درع الحماية!','','الستريك ملغي — الدرع حماك!');AudioEngine.play('reveal');document.querySelectorAll('.tool-btn').forEach(b=>b.classList.remove('shield-active'));return}
G.strikes++;G.stats.totalStrikes++;$('sx'+G.strikes).classList.add('hit');showX();AudioEngine.play('strike');
if(G.strikes>=3){stopTimer();setTimeout(()=>{const currentTeamName=G.playing===1?G.t1.name:G.t2.name;const currentTeam=G.playing===1?G.t1:G.t2;const other=G.playing===1?2:1;const otherName=other===1?G.t1.name:G.t2.name;
// Calculate points earned this question by current team
const q=G.questions[G.qIndex];let earnedThisQ=0;G.revealed.forEach(idx=>{earnedThisQ+=q.a[idx].p});
// Take back the points for steal opportunity
if(earnedThisQ>0){currentTeam.score-=earnedThisQ;G.stealPts=earnedThisQ;G.stealFrom=currentTeamName;G.stealMode=true;updateUI()}
const stealMsg=earnedThisQ>0?' — لو '+otherName+' جاوب صح ياخذ '+earnedThisQ+' نقطة!':'';
showModal('٣ أخطاء! ✕','','الدور ينتقل لـ '+otherName+stealMsg);setTeam(other);if(SETTINGS.buzzerMode)hideBuzzBanner();G.strikes=0;for(let i=1;i<=3;i++)$('sx'+i).classList.remove('hit')},900)}}
function resetStrikes(){G.strikes=0;for(let i=1;i<=3;i++)$('sx'+i).classList.remove('hit');AudioEngine.play('pop')}

// ========= TEAM =========
function setTeam(n){
  // Strikes belong to the turn, not the question. Only loadQuestion and the
  // 3-strike handover cleared them, so switching teams by hand (or a buzzer win)
  // left the previous team's marks on screen — the incoming team started two
  // down and a single wrong answer ended their turn.
  if(n!==G.playing){G.strikes=0;for(let i=1;i<=3;i++)$('sx'+i).classList.remove('hit')}
  G.playing=n;
  $('ctrlT1').classList.toggle('active-team',n===1);
  $('ctrlT2').classList.toggle('active-team',n===2);
  updateUI();
  AudioEngine.play('switch',{pan:n===1?-0.5:0.5});
}

// ========= AWARD & NEXT =========
function revealAll(){const q=G.questions[G.qIndex];q.a.forEach((_,i)=>{if(!G.revealed.has(i)){G.revealed.add(i);$('sl'+i).classList.add('revealed')}})}

function goNext(){stopTimer();revealAll();AudioEngine.play('pop');
// Track trial usage
if(!isLicensed()){setTrialUsed(getTrialUsed()+1)}
G.qInRound++;G.qIndex++;
// Check license before loading next question
if(!isLicensed() && getTrialUsed() >= LICENSE.maxTrialQuestions){
  $('gameScreen').classList.add('hidden');
  $('gateScreen').classList.remove('hidden');
  updateGateScreen();
  return;
}
if(G.qInRound>=Q_PER_ROUND){G.round++;G.qInRound=0;if(G.round>=SETTINGS.rounds){endGame();return}G.playing=G.playing===1?2:1;$('ctrlT1').classList.toggle('active-team',G.playing===1);$('ctrlT2').classList.toggle('active-team',G.playing===2);if(G.qIndex<G.questions.length){showRoundTransition(G.round+1,loadQuestion);return}else{endGame();return}}
if(G.qIndex<G.questions.length)loadQuestion();else endGame()}

// ========= UI =========
function updateUI(){
if(SETTINGS.mode==='solo'){$('soloPts').textContent=ar(G.soloScore)}
else{$('tp1').textContent=ar(G.t1.score);$('tp2').textContent=ar(G.t2.score);$('tc1').classList.toggle('playing',G.playing===1);$('tc2').classList.toggle('playing',G.playing===2)}
}
function showX(){const o=$('oxOverlay');o.classList.add('show');setTimeout(()=>o.classList.remove('show'),900)}
// كل نص النافذة يمر من هنا، فتحويل الأرقام في هذا الموضع يغطي رسائل النقاط
// والسرقة وتكلفة الأدوات دفعة واحدة. لا تعرض هذه النافذة أي كود أو مفتاح.
function showModal(t,p,s){$('mTitle').textContent=ar(t);$('mPts').textContent=ar(p);$('mSub').textContent=ar(s);$('modal').classList.add('show')}
function closeModal(){$('modal').classList.remove('show');AudioEngine.play('click')}

// Custom confirm (replaces browser confirm)
function gameConfirm(msg, onYes, icon){
  const iconKey = EMOJI_ICON_MAP[icon] || icon || 'warning';
  $('confirmIcon').innerHTML = iconSVG(iconKey);
  $('confirmTitle').textContent = 'تأكيد';
  $('confirmMsg').textContent = msg;
  $('confirmYes').onclick = function(){ closeConfirm(); AudioEngine.play('click'); onYes(); };
  $('confirmModal').classList.add('show');
  AudioEngine.play('open');
}
function closeConfirm(){ $('confirmModal').classList.remove('show'); AudioEngine.play('close'); }

// ========= LIVE TOUCHES =========
function renderProgress(){const el=$('qProgress');if(!el)return;let h='';for(let i=0;i<Q_PER_ROUND;i++){let c='pip';if(i<G.qInRound)c+=' done';else if(i===G.qInRound)c+=' current';h+='<span class="'+c+'"></span>'}el.innerHTML=h}

function showRoundTransition(roundNum,cb){const el=$('roundTrans');if(!el){if(cb)cb();return}$('rtTitle').textContent='الجولة '+ar(roundNum);el.classList.add('show');AudioEngine.play('open');setTimeout(()=>{el.classList.remove('show');if(cb)cb()},2200)}

function miniConfetti(){const style=getComputedStyle(document.body);const cols=[style.getPropertyValue('--gold'),style.getPropertyValue('--confetti1'),style.getPropertyValue('--confetti2'),'#ffffff'];for(let i=0;i<26;i++){const el=document.createElement('div');el.className='confetti';el.style.cssText='left:'+(36+Math.random()*28)+'vw;top:20vh;width:'+(6+Math.random()*8)+'px;height:'+(6+Math.random()*8)+'px;background:'+cols[Math.floor(Math.random()*cols.length)]+';border-radius:'+(Math.random()>0.5?'50%':'2px');document.body.appendChild(el);el.animate([{transform:'translateY(0) rotate(0)',opacity:1},{transform:'translateY(62vh) rotate('+(360+Math.random()*360)+'deg)',opacity:0}],{duration:1400+Math.random()*900,easing:'cubic-bezier(.25,.46,.45,.94)',delay:Math.random()*300}).onfinish=()=>el.remove()}}

// ========= GAME OVER =========
function endGame(){stopTimer();$('gameScreen').classList.add('hidden');$('goScreen').classList.remove('hidden');
if(SETTINGS.mode==='solo'){$('goName').textContent=G.t1.name;$('goScore').textContent=ar(G.soloScore)+' نقطة';AudioEngine.play('win');confetti();renderStats();saveResult({name:G.t1.name,score:G.soloScore},{name:'—',score:0})}
else{const w=G.t1.score>=G.t2.score?G.t1:G.t2;const l=G.t1.score>=G.t2.score?G.t2:G.t1;$('goName').textContent=w.name;$('goScore').textContent=ar(w.score)+' - '+ar(l.score);AudioEngine.play('win');confetti();renderStats();saveResult(w,l)}}
function renderStats(){const grid=$('statsGrid');const stats=[{label:iconSVG('trophy')+' الفريق الفائز',value:(G.t1.score>=G.t2.score?G.t1:G.t2).name},{label:iconSVG('chart')+' '+G.t1.name,value:G.t1.score+' نقطة'},{label:iconSVG('chart')+' '+G.t2.name,value:G.t2.score+' نقطة'},{label:iconSVG('target')+' إجابات مكشوفة',value:G.stats.totalReveals},{label:'✕ مجموع الأخطاء',value:G.stats.totalStrikes},{label:iconSVG('fire')+' أفضل سؤال',value:G.stats.bestRound.pts>0?G.stats.bestRound.team+' ('+G.stats.bestRound.pts+' نقطة)':'-'},{label:iconSVG('bolt')+' أسرع إجابة',value:G.stats.fastestReveal?G.stats.fastestReveal+' ثانية':'-'},{label:iconSVG('trending')+' الجولات',value:SETTINGS.rounds+' × '+Q_PER_ROUND+' أسئلة'}];// القيمة وحدها تُحوَّل: التسمية تحمل أيقونة SVG وأرقام viewBox بداخلها.
grid.innerHTML=stats.map(s=>'<div class="stat-row"><span class="stat-label">'+s.label+'</span><span class="stat-value">'+ar(s.value)+'</span></div>').join('')}

// ========= HISTORY =========
function getHistory(){try{return JSON.parse(localStorage.getItem('khamen_history')||'[]')}catch(e){return[]}}
function saveResult(w,l){try{const h=getHistory();const now=new Date();h.unshift({winner:w.name,winnerScore:w.score,loser:l.name,loserScore:l.score,rounds:SETTINGS.rounds,date:now.toLocaleDateString('ar-SA',{year:'numeric',month:'short',day:'numeric'}),time:now.toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'}),timestamp:Date.now()});if(h.length>50)h.length=50;localStorage.setItem('khamen_history',JSON.stringify(h))}catch(e){}syncResultToCloud()}

// Fire-and-forget. localStorage stays the source of truth for the history modal,
// so a failed sync must never block the game-over screen. The cloud copy is what
// survives a device change and what leaderboards will read later.
function syncResultToCloud(){
  const name=getCurrentUsername();
  if(!name||!G)return;
  const s=G.stats||{};
  const fast=Number(s.fastestReveal);
  try{
    getSb().rpc('save_game_result',{
      p_username:name,
      p_mode:SETTINGS.mode==='solo'?'solo':'teams',
      p_team1_name:G.t1?G.t1.name:null,
      p_team2_name:G.t2?G.t2.name:null,
      p_team1_score:G.t1?G.t1.score|0:0,
      p_team2_score:G.t2?G.t2.score|0:0,
      p_solo_score:G.soloScore|0,
      p_rounds:SETTINGS.rounds|0,
      p_reveals:s.totalReveals|0,
      p_strikes:s.totalStrikes|0,
      p_best_team:s.bestRound?s.bestRound.team||null:null,
      p_best_pts:s.bestRound?s.bestRound.pts|0:0,
      p_fastest:isFinite(fast)?fast:null
    }).catch(()=>{});
  }catch(e){}
}
function openHistory(){AudioEngine.play('open');renderHistoryList();$('historyModal').classList.add('show');if(getHistory().length===0)loadCloudHistory()}

// Same account on a new device: localStorage is empty but the games are still on
// the server. Only runs when local history is blank, so it never overwrites it.
async function loadCloudHistory(){
  const name=getCurrentUsername();
  if(!name)return;
  try{
    const {data,error}=await getSb().rpc('my_game_history',{p_username:name});
    if(error||!Array.isArray(data)||data.length===0)return;
    renderHistoryList(data.map(r=>{
      const solo=r.mode==='solo';
      const a={name:r.team1_name||'—',score:r.team1_score|0};
      const b={name:r.team2_name||'—',score:r.team2_score|0};
      const w=solo?{name:r.team1_name||'—',score:r.solo_score|0}:(a.score>=b.score?a:b);
      const l=solo?{name:'—',score:0}:(a.score>=b.score?b:a);
      return{winner:w.name,winnerScore:w.score,loser:l.name,loserScore:l.score,
             rounds:r.rounds_played|0,
             date:new Date(r.played_at).toLocaleDateString('ar-SA',{year:'numeric',month:'short',day:'numeric'})};
    }));
  }catch(e){}
}
function closeHistory(){AudioEngine.play('close');$('historyModal').classList.remove('show')}
function clearHistory(){gameConfirm('متأكد تبي تمسح كل سجل النتائج؟',function(){try{localStorage.removeItem('khamen_history')}catch(e){}renderHistoryList()},'🗑️')}
function renderHistoryList(rows){const history=rows||getHistory();const list=$('historyList');if(history.length===0){list.innerHTML='<div class="history-empty">ما فيه نتائج محفوظة بعد</div>';return}const rc=['gold','silver','bronze'];list.innerHTML=history.map((h,i)=>{const rank=i<3?'<div class="history-rank '+rc[i]+'">'+iconSVG('trophy')+'</div>':'<div class="history-rank normal">'+ar(i+1)+'</div>';const t=iconSVG(h.winnerScore===h.loserScore?'users':'trophy');return'<div class="history-item">'+rank+'<div class="history-info"><div class="history-winner">'+t+' '+h.winner+'</div><div class="history-detail">'+h.winner+' '+ar(h.winnerScore)+' - '+ar(h.loserScore)+' '+h.loser+' · '+ar(h.rounds)+' جولات · '+ar(h.date)+'</div></div><div class="history-score">'+ar(h.winnerScore)+'</div></div>'}).join('')}
function restart(){$('goScreen').classList.add('hidden');
  if(isLicensed()){$('setupScreen').classList.remove('hidden');updateNavKey();updateNavUser()}
  else{$('gateScreen').classList.remove('hidden');updateGateScreen()}
}

// ========= CONFETTI =========
function confetti(){const style=getComputedStyle(document.body);const cols=[style.getPropertyValue('--confetti1'),style.getPropertyValue('--confetti2'),style.getPropertyValue('--confetti3'),style.getPropertyValue('--confetti4'),'#fbbf24','#34d399'];for(let i=0;i<70;i++){const el=document.createElement('div');el.className='confetti';el.style.cssText='left:'+Math.random()*100+'vw;top:-15px;width:'+(6+Math.random()*10)+'px;height:'+(6+Math.random()*10)+'px;background:'+cols[Math.floor(Math.random()*cols.length)]+';border-radius:'+(Math.random()>0.5?'50%':'2px')+';transform:rotate('+Math.random()*360+'deg)';document.body.appendChild(el);el.animate([{top:'-15px',opacity:1,transform:'rotate(0deg)'},{top:'105vh',opacity:0,transform:'rotate('+(360+Math.random()*720)+'deg)'}],{duration:2000+Math.random()*2500,easing:'cubic-bezier(.25,.46,.45,.94)',delay:Math.random()*1200}).onfinish=()=>el.remove()}}

// ========= INTRO =========
function dismissIntro(){
  const introEl=document.querySelector('#introScreen .intro');
  if(!introEl||introEl.classList.contains('leaving'))return;
  introEl.classList.add('leaving');
  setTimeout(()=>{
    $('introScreen').classList.add('hidden');
    // Check if already logged in
    const name=getCurrentUsername();
    if(name && getCurrentUser()){
      afterAuth();
    } else {
      $('authScreen').classList.remove('hidden');
      authIsRegister=false;
      $('authUser').value='';$('authPass').value='';
      $('authError').classList.add('hidden');
    }
  }, 480);
}
$('introScreen').addEventListener('click',dismissIntro);

function scrollToSection(id){const el=document.getElementById(id);if(el)el.scrollIntoView({behavior:'smooth'});$('navMobile').classList.add('hidden')}
function toggleNav(){$('navMobile').classList.toggle('hidden')}

// ========= POWER-UP TOOLS =========
// Arabic counted nouns take four forms, not two: 1 is singular, 2 has its own
// dual, 3-10 take the plural, and 11 upward returns to the singular. Writing
// "2 كلمات" or "9 حرف" reads as broken Arabic, so every count goes through here.
function arCount(n, one, two, few, many){
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return n + ' ' + few;
  return n + ' ' + many;
}

function useTool(type) {
  const q = G.questions[G.qIndex];
  // Check if all answers already revealed
  const hidden = q.a.filter((_, i) => !G.revealed.has(i));
  if (hidden.length === 0 && type !== 'shield') { AudioEngine.play('error'); return showModal('⚠️', '', 'كل الإجابات مكشوفة — ما تحتاج مساعدة!'); }

  const isSolo = SETTINGS.mode === 'solo';
  const team = isSolo ? null : (G.playing === 1 ? G.t1 : G.t2);
  const score = isSolo ? G.soloScore : (team ? team.score : 0);
  const costs = { letter: 10, hint: 15, shield: 20 };
  const cost = costs[type];

  if (G.toolsUsed[type]) { AudioEngine.play('error'); return showModal('⚠️', '', 'استخدمت هالأداة بهالسؤال!'); }
  if (score < cost) { AudioEngine.play('error'); return showModal('⚠️', '', 'ما عندك نقاط كافية! تحتاج ' + cost); }

  if (isSolo) G.soloScore -= cost;
  else team.score -= cost;
  G.toolsUsed[type] = true;
  AudioEngine.play('coin');
  updateUI();

  // Mark button as used
  document.querySelectorAll('.tool-btn').forEach(b => {
    if ((type==='letter' && b.textContent.includes('كشف')) || (type==='hint' && b.textContent.includes('تلميح')) || (type==='shield' && b.textContent.includes('درع')))
      b.classList.add('used');
  });

  if (type === 'letter') {
    const hidden = [];
    q.a.forEach((a, i) => { if (!G.revealed.has(i)) hidden.push(i) });
    if (hidden.length === 0) return;
    const pick = hidden[Math.floor(Math.random() * hidden.length)];
    const rawText = q.a[pick].t;
    const firstChar = rawText.replace(/^ال/,'').charAt(0);
    const card = $('sl' + pick);
    if (card) {
      const txt = card.querySelector('.flip-front .txt');
      if (txt) txt.innerHTML = '<span style="color:var(--gold);font-size:1.3rem;font-weight:900">\u00AB' + firstChar + '\u00BB</span>';
    }
    AudioEngine.play('reveal');
    showModal('\ud83d\udc40 \u0643\u0634\u0641 \u062d\u0631\u0641!', '', '\u0627\u0644\u0625\u062c\u0627\u0628\u0629 \u0631\u0642\u0645 ' + (pick + 1) + ' \u062a\u0628\u062f\u0623 \u0628\u062d\u0631\u0641 \u00AB' + firstChar + '\u00BB');
  }
  else if (type === 'hint') {
    let best = -1, bestPts = -1;
    q.a.forEach((a, i) => { if (!G.revealed.has(i) && a.p > bestPts) { best = i; bestPts = a.p } });
    if (best < 0) return;
    const ans = q.a[best];
    // Strip ال التعريف from each word for hint purposes
    const stripAl = w => w.replace(/^ال/,'');
    const words = ans.t.split(/\s+/);
    const cleanWords = words.map(stripAl);
    const firstReal = cleanWords[0].charAt(0);
    const lastWord = cleanWords[cleanWords.length-1];
    const lastReal = lastWord.charAt(lastWord.length - 1);
    const charCount = ans.t.replace(/\s/g,'').length;
    // "أول كلمة «ت...»" was ambiguous — it read as if the whole word were being
    // shown truncated. Naming the letter outright is what a host says out loud.
    const charsTxt = arCount(charCount, 'حرف واحد', 'حرفين', 'حروف', 'حرفاً');
    let hint = '';
    if (words.length === 1) {
      hint = 'إجابة من ' + charsTxt + ' — أول حرف «' + firstReal + '» وآخر حرف «' + lastReal + '»';
    } else {
      const wordsTxt = arCount(words.length, 'كلمة واحدة', 'كلمتين', 'كلمات', 'كلمة');
      hint = 'إجابة من ' + wordsTxt + ' (' + charsTxt + ') — أول حرف من الكلمة الأولى «'
           + firstReal + '» وآخر حرف من الكلمة الأخيرة «' + lastReal + '»';
    }
    AudioEngine.play('reveal');
    showModal('\ud83c\udfaf \u062a\u0644\u0645\u064a\u062d!', '', hint);
  }
  else if (type === 'shield') {
    G.shieldActive = true;
    AudioEngine.play('reveal');
    const area = isSolo ? $('soloStrikes') : $('groupStrikes');
    if (area) area.classList.add('shield-active');
    showModal('\ud83d\udee1\ufe0f \u062f\u0631\u0639 \u0645\u0641\u0639\u0651\u0644!', '', '\u0627\u0644\u062e\u0637\u0623 \u0627\u0644\u0642\u0627\u062f\u0645 \u0645\u0644\u063a\u064a \u2014 \u0627\u0644\u062f\u0631\u0639 \u064a\u062d\u0645\u064a\u0643!');
  }
}

// ========= IN-GAME SETTINGS & HOME =========
function goHome(){gameConfirm('متأكد تبي ترجع للقائمة الرئيسية؟ اللعبة الحالية بتنتهي',function(){stopTimer();$('gameScreen').classList.add('hidden');
  if(isLicensed()){$('setupScreen').classList.remove('hidden');updateNavKey();updateNavUser()}
  else{$('gateScreen').classList.remove('hidden');updateGateScreen()}
},'🏠')}

function openInGameSettings(){
  // Mark active timer button
  document.querySelectorAll('#igTimerSel .opt-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('#igTimerSel .opt-btn').forEach(b=>{
    const vals={'بدون':0,'٣٠ ث':30,'دقيقة':60,'٩٠ ث':90};
    if(vals[b.textContent]===SETTINGS.timer)b.classList.add('active');
  });
  markActiveTheme();
  $('igSettingsModal').classList.add('show');
  AudioEngine.play('open');
}

function closeIGSettings(){$('igSettingsModal').classList.remove('show');AudioEngine.play('close')}

function igSetTimer(s){
  SETTINGS.timer=s;
  document.querySelectorAll('#igTimerSel .opt-btn').forEach(b=>b.classList.remove('active'));
  event.target.classList.add('active');
  if(s>0){$('timerWrap').classList.remove('hidden');resetTimer()}
  else{$('timerWrap').classList.add('hidden');stopTimer()}
}

// ========= KEYBOARD =========
document.addEventListener('keydown',e=>{
if(e.key==='Enter'&&!$('authScreen').classList.contains('hidden')){authIsRegister?authRegister():authLogin();return}
if(e.key==='Enter'&&$('keyPopup').classList.contains('show')&&!$('keyInputSection').classList.contains('hidden')){popupActivate();return}
if(e.key==='Enter'&&$('modal').classList.contains('show'))closeModal();
else if(e.key==='Enter'&&SETTINGS.mode==='solo'&&!$('gameScreen').classList.contains('hidden')&&!$('modal').classList.contains('show'))submitSoloGuess();
if(!$('introScreen').classList.contains('hidden')&&(e.key==='Enter'||e.key===' '))dismissIntro();
if(e.key==='Enter'&&!$('gateScreen').classList.contains('hidden'))gateActivate();
});

try { $('volSlider').value = SETTINGS.volume * 100; } catch(e) {}
updateNavKey();

// ========= LANDING PAGE: SCROLL REVEAL + ACTIVE NAV LINK =========
// Note: .landing-scroll never actually grows an internal scrollbar (its
// height always matches its content), so the real scrolling context is the
// browser window/document itself — observers must use the default root
// (viewport), not that element, or intersection ratios come out wrong.
(function(){
  const revealEls = document.querySelectorAll('.feature-card, .step-item, .settings-section');
  if(revealEls.length && 'IntersectionObserver' in window){
    const io = new IntersectionObserver((entries)=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){ entry.target.classList.add('in-view'); io.unobserve(entry.target); }
      });
    }, {threshold:0.15, rootMargin:'0px 0px -40px 0px'});
    revealEls.forEach(el=>io.observe(el));
  } else {
    revealEls.forEach(el=>el.classList.add('in-view'));
  }

  const navLinks = document.querySelectorAll('.nav-link');
  const sections = ['home','features','howto','settings'].map(id=>$(id)).filter(Boolean);
  if(sections.length && navLinks.length && 'IntersectionObserver' in window){
    const ratios = new Map();
    const io2 = new IntersectionObserver((entries)=>{
      entries.forEach(entry=>{ ratios.set(entry.target.id, entry.intersectionRatio) });
      let bestId=null, bestRatio=0;
      ratios.forEach((ratio,id)=>{ if(ratio>bestRatio){ bestRatio=ratio; bestId=id } });
      if(bestId){
        navLinks.forEach(l=>l.classList.toggle('current', !!(l.getAttribute('onclick')&&l.getAttribute('onclick').includes("'"+bestId+"'"))));
      }
    }, {threshold:[0,0.25,0.5,0.75,1]});
    sections.forEach(s=>io2.observe(s));
  }

  const yearEl = document.getElementById('footerYear');
  if(yearEl) yearEl.textContent = ar(new Date().getFullYear());
})();
