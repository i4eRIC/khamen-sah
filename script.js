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
  {id:1,q:"اذكر شيء يستخدمه الناس كل يوم الصبح",a:[{"t":"فرشاة الأسنان","p":30},{"t":"الجوال","p":25},{"t":"الماء","p":18},{"t":"المنبه","p":12},{"t":"القهوة","p":10},{"t":"المرآة","p":5}]},
  {id:2,q:"اذكر سبب يخلّي الشخص يتأخر عن الدوام",a:[{"t":"الزحمة","p":30},{"t":"النوم","p":25},{"t":"عطل السيارة","p":18},{"t":"المرض","p":12},{"t":"نسيان شيء","p":10},{"t":"الأمطار","p":5}]},
  {id:3,q:"اذكر شيء يضيّع وقت الناس",a:[{"t":"الجوال","p":30},{"t":"السوشال ميديا","p":25},{"t":"التلفزيون","p":18},{"t":"الألعاب","p":12},{"t":"الزحمة","p":10},{"t":"كثرة النوم","p":5}]},
  {id:4,q:"اذكر شيء تاخذه معك وأنت مسافر",a:[{"t":"الجوال والشاحن","p":28},{"t":"الملابس","p":25},{"t":"جواز السفر","p":20},{"t":"المحفظة","p":12},{"t":"الشنطة","p":10},{"t":"الأدوية","p":5}]},
  {id:5,q:"اذكر شيء ينساه الناس كثير",a:[{"t":"المفاتيح","p":28},{"t":"الجوال","p":25},{"t":"المحفظة","p":18},{"t":"أسماء الناس","p":12},{"t":"المواعيد","p":10},{"t":"الشاحن","p":7}]},
  {id:6,q:"اذكر سبب يخلّي الناس تفرح",a:[{"t":"العيد","p":28},{"t":"الراتب","p":25},{"t":"الزواج","p":18},{"t":"النجاح","p":13},{"t":"الإجازة","p":10},{"t":"مولود جديد","p":6}]},
  {id:7,q:"اذكر شيء يسبب الصداع",a:[{"t":"قلة النوم","p":28},{"t":"حرارة الشمس","p":22},{"t":"الضوضاء","p":18},{"t":"الجوع","p":14},{"t":"كثرة الشاشات","p":10},{"t":"التوتر","p":8}]},
  {id:8,q:"اذكر شيء يخوّف الأطفال",a:[{"t":"الظلام","p":30},{"t":"الإبرة","p":25},{"t":"الحشرات","p":18},{"t":"الأصوات العالية","p":12},{"t":"البقاء لحالهم","p":10},{"t":"دكتور الأسنان","p":5}]},
  {id:9,q:"اذكر خدمة تسويها من جوالك بدل ما تروح لها",a:[{"t":"تحويل فلوس","p":28},{"t":"طلب أكل","p":24},{"t":"حجز موعد","p":18},{"t":"تجديد الاستمارة","p":14},{"t":"طلب توصيلة","p":10},{"t":"شراء أونلاين","p":6}]},
  {id:10,q:"اذكر شيء لونه أحمر",a:[{"t":"الدم","p":28},{"t":"التفاح","p":22},{"t":"الطماطم","p":20},{"t":"الفراولة","p":14},{"t":"الورد","p":10},{"t":"الفلفل الحار","p":6}]},
  {id:11,q:"اذكر شيء موجود في كل مطبخ",a:[{"t":"ملح","p":28},{"t":"زيت","p":22},{"t":"سكر","p":18},{"t":"ملاعق وشوك","p":14},{"t":"صحون","p":10},{"t":"أرز","p":8}]},
  {id:12,q:"اذكر سبب يخلّي الناس ما تنام",a:[{"t":"التفكير والقلق","p":28},{"t":"الجوال","p":25},{"t":"القهوة","p":18},{"t":"الضوضاء","p":12},{"t":"المرض","p":10},{"t":"الحر الشديد","p":7}]},
  {id:13,q:"اذكر شيء الناس تسويه بالسيارة غير السواقة",a:[{"t":"تسمع أغاني","p":30},{"t":"تتكلم بالجوال","p":22},{"t":"تأكل أو تشرب","p":18},{"t":"تحط مكياج","p":12},{"t":"تشرب قهوة","p":10},{"t":"تتصور","p":8}]},
  {id:14,q:"اذكر شيء الناس تشتريه وهي ما تحتاجه",a:[{"t":"ملابس زيادة","p":28},{"t":"أكل إضافي","p":22},{"t":"إلكترونيات","p":18},{"t":"عطور","p":14},{"t":"ألعاب","p":10},{"t":"إكسسوارات","p":8}]},
  {id:15,q:"اذكر مكان الناس تروحله لما تزهق",a:[{"t":"المول","p":28},{"t":"الكافيه","p":22},{"t":"البحر أو الكورنيش","p":18},{"t":"بيت صديق","p":14},{"t":"السينما","p":10},{"t":"الحديقة","p":8}]},
  {id:16,q:"اذكر شيء تسويه أول ما تصحى من النوم",a:[{"t":"تشيك الجوال","p":30},{"t":"تروح الحمام","p":25},{"t":"تشرب ماء","p":18},{"t":"تصلي","p":12},{"t":"تسوي قهوة","p":10},{"t":"تتمطى","p":5}]},
  {id:17,q:"اذكر شيء غالي وناس كثير تحلم فيه",a:[{"t":"بيت خاص","p":30},{"t":"سيارة فخمة","p":25},{"t":"آخر آيفون","p":18},{"t":"ساعة فخمة","p":12},{"t":"السفر","p":10},{"t":"ذهب","p":5}]},
  {id:18,q:"اذكر شيء يطلع صوت مزعج",a:[{"t":"المنبه","p":28},{"t":"أصوات البناء","p":22},{"t":"بكاء الأطفال","p":18},{"t":"زامور السيارة","p":14},{"t":"المثقاب","p":10},{"t":"الصفارة","p":8}]},
  {id:19,q:"اذكر سبب يخلّي الناس تبكي",a:[{"t":"فراق شخص عزيز","p":28},{"t":"الحزن","p":22},{"t":"الفرح الشديد","p":18},{"t":"الألم","p":14},{"t":"تقطيع البصل","p":10},{"t":"مشهد مؤثر بفيلم","p":8}]},
  {id:20,q:"اذكر شيء الناس تحطه بالثلاجة",a:[{"t":"حليب","p":28},{"t":"ماء بارد","p":22},{"t":"خضار وفواكه","p":18},{"t":"لحم أو دجاج","p":14},{"t":"بيض","p":10},{"t":"عصير","p":8}]},
  {id:21,q:"اذكر مهنة يحترمها الناس كثير",a:[{"t":"طبيب","p":28},{"t":"معلم","p":25},{"t":"عسكري","p":18},{"t":"مهندس","p":12},{"t":"إمام مسجد","p":10},{"t":"قاضي","p":7}]},
  {id:22,q:"اذكر لون شائع للسيارات",a:[{"t":"أبيض","p":35},{"t":"أسود","p":25},{"t":"فضي","p":18},{"t":"رمادي","p":10},{"t":"أحمر","p":7},{"t":"أزرق","p":5}]},
  {id:23,q:"اذكر شيء الناس تخبيه عن غيرها",a:[{"t":"الراتب","p":28},{"t":"المشاكل الخاصة","p":22},{"t":"العمر","p":18},{"t":"كلمات السر","p":14},{"t":"المشاعر الحقيقية","p":10},{"t":"الأسرار","p":8}]},
  {id:24,q:"اذكر شيء يطلع من الأرض",a:[{"t":"النبات والشجر","p":30},{"t":"الماء","p":25},{"t":"البترول والنفط","p":20},{"t":"المعادن","p":12},{"t":"الحجارة","p":8},{"t":"الحشرات","p":5}]},
  {id:25,q:"اذكر شيء الناس تسويه لما تزعل",a:[{"t":"تسكت وتنعزل","p":28},{"t":"تبكي","p":22},{"t":"تأكل كثير","p":18},{"t":"تنام","p":14},{"t":"تطلع تمشي","p":10},{"t":"تتكلم مع أحد","p":8}]},
  {id:26,q:"اذكر شيء تلاقيه في كل شارع",a:[{"t":"سيارات","p":28},{"t":"إشارات مرور","p":22},{"t":"ناس يمشون","p":18},{"t":"محلات","p":14},{"t":"إنارة","p":10},{"t":"أشجار","p":8}]},
  {id:27,q:"اذكر شيء تحطه على مكتبك",a:[{"t":"لابتوب أو كمبيوتر","p":28},{"t":"جوال","p":22},{"t":"كوب قهوة","p":18},{"t":"أقلام","p":14},{"t":"دفتر","p":10},{"t":"مناديل","p":8}]},
  {id:28,q:"اذكر شيء يخلّيك تبتسم",a:[{"t":"ضحكة طفل","p":28},{"t":"نكتة حلوة","p":22},{"t":"هدية مفاجئة","p":18},{"t":"خبر حلو","p":14},{"t":"لقاء صديق","p":10},{"t":"مقطع مضحك","p":8}]},
  {id:29,q:"اذكر شيء يدور",a:[{"t":"عجلة السيارة","p":28},{"t":"الأرض","p":22},{"t":"المروحة","p":18},{"t":"عقارب الساعة","p":14},{"t":"الغسالة","p":10},{"t":"الكرة","p":8}]},
  {id:30,q:"اذكر شيء يطير",a:[{"t":"الطائرة","p":28},{"t":"الطيور","p":25},{"t":"الفراشة","p":18},{"t":"الدرون","p":12},{"t":"طائرة ورقية","p":10},{"t":"البالون","p":7}]},
  {id:31,q:"اذكر شيء موجود في كل بيت سعودي",a:[{"t":"دلة قهوة عربية","p":28},{"t":"تمر","p":25},{"t":"سجادة صلاة","p":18},{"t":"بخور وعود","p":14},{"t":"أرز","p":10},{"t":"مكيف","p":5}]},
  {id:32,q:"اذكر أكبر مدن السعودية من حيث السكان",a:[{"t":"الرياض","p":35},{"t":"جدة","p":28},{"t":"مكة المكرمة","p":18},{"t":"المدينة المنورة","p":10},{"t":"الدمام","p":6},{"t":"الطائف","p":3}]},
  {id:33,q:"اذكر أكلة سعودية شعبية",a:[{"t":"الكبسة","p":35},{"t":"المندي","p":25},{"t":"الجريش","p":15},{"t":"المطبق","p":12},{"t":"المعصوب","p":8},{"t":"الهريسة","p":5}]},
  {id:34,q:"اذكر مكان سياحي مشهور في السعودية",a:[{"t":"الحرم المكي","p":28},{"t":"المسجد النبوي","p":22},{"t":"العلا","p":18},{"t":"أبها والسودة","p":14},{"t":"جدة التاريخية","p":10},{"t":"موسم الرياض","p":8}]},
  {id:35,q:"اذكر شيء يسويه الناس في العيد",a:[{"t":"زيارة الأهل والأقارب","p":30},{"t":"توزيع العيديات","p":25},{"t":"لبس جديد","p":18},{"t":"أكل حلويات ومعمول","p":12},{"t":"صلاة العيد","p":10},{"t":"السفر","p":5}]},
  {id:36,q:"اذكر أكلة مشهورة في رمضان",a:[{"t":"سمبوسة","p":30},{"t":"شوربة شوفان أو خضار","p":25},{"t":"لقيمات","p":18},{"t":"فول","p":12},{"t":"تمر ولبن","p":10},{"t":"عصيرات رمضان","p":5}]},
  {id:37,q:"اذكر مشروب مشهور عند العرب",a:[{"t":"القهوة العربية","p":30},{"t":"الشاي","p":28},{"t":"اللبن","p":16},{"t":"الشاي الأخضر بالنعناع","p":12},{"t":"العصير الطازج","p":8},{"t":"القرفة","p":6}]},
  {id:38,q:"اذكر شيء مشهور عن مدينة جدة",a:[{"t":"الكورنيش","p":28},{"t":"نافورة الملك فهد","p":22},{"t":"البحر الأحمر","p":18},{"t":"جدة التاريخية","p":14},{"t":"المولات","p":10},{"t":"المأكولات البحرية","p":8}]},
  {id:39,q:"اذكر شيء يشتهر فيه جنوب السعودية",a:[{"t":"العسل الطبيعي","p":28},{"t":"الجبال الخضراء","p":22},{"t":"الأمطار والضباب","p":18},{"t":"القهوة","p":14},{"t":"البرد في الصيف","p":10},{"t":"المدرجات الزراعية","p":8}]},
  {id:40,q:"اذكر شيء مشهور عن مدينة الرياض",a:[{"t":"برج المملكة","p":28},{"t":"بوليفارد","p":22},{"t":"الدرعية التاريخية","p":18},{"t":"موسم الرياض","p":14},{"t":"المتحف الوطني","p":10},{"t":"الحي المالي","p":8}]},
  {id:41,q:"اذكر شيء يسويه السعوديون في الشتاء",a:[{"t":"كشتة بالبر","p":30},{"t":"حفلة شواء","p":22},{"t":"جلسة قهوة عربية مع حطب","p":18},{"t":"رحلة بر مع العائلة","p":14},{"t":"إشعال النار والحطب","p":10},{"t":"مشي في الطبيعة","p":6}]},
  {id:42,q:"اذكر ماركة سيارة منتشرة في السعودية",a:[{"t":"تويوتا","p":35},{"t":"هيونداي","p":22},{"t":"فورد","p":15},{"t":"شفروليه","p":12},{"t":"نيسان","p":10},{"t":"مرسيدس","p":6}]},
  {id:43,q:"اذكر مطعم مشهور في السعودية",a:[{"t":"البيك","p":35},{"t":"هرفي","p":22},{"t":"ماكدونالدز","p":18},{"t":"كودو","p":12},{"t":"شاورمر","p":8},{"t":"كنتاكي","p":5}]},
  {id:44,q:"اذكر مشروع سعودي ضخم",a:[{"t":"نيوم","p":30},{"t":"رؤية 2030","p":22},{"t":"ذا لاين","p":18},{"t":"القدية","p":12},{"t":"مشروع البحر الأحمر","p":10},{"t":"برج جدة","p":8}]},
  {id:45,q:"اذكر شيء مشهور عن مكة المكرمة",a:[{"t":"المسجد الحرام والكعبة","p":35},{"t":"ماء زمزم","p":22},{"t":"الحج والعمرة","p":18},{"t":"جبل عرفة","p":10},{"t":"منى ومزدلفة","p":10},{"t":"غار حراء","p":5}]},
  {id:46,q:"اذكر شيء مشهور عن المدينة المنورة",a:[{"t":"المسجد النبوي","p":35},{"t":"الروضة الشريفة","p":22},{"t":"التمر المدني","p":18},{"t":"مسجد قباء","p":10},{"t":"جبل أحد","p":10},{"t":"البقيع","p":5}]},
  {id:47,q:"اذكر شيء تشتريه من البقالة دايم",a:[{"t":"خبز","p":28},{"t":"حليب","p":25},{"t":"بيض","p":18},{"t":"ماء","p":14},{"t":"جبنة","p":10},{"t":"رز","p":5}]},
  {id:48,q:"اذكر جامعة سعودية معروفة",a:[{"t":"جامعة الملك سعود","p":28},{"t":"جامعة الملك عبدالعزيز","p":22},{"t":"كاوست","p":18},{"t":"جامعة الإمام","p":12},{"t":"جامعة الملك فهد للبترول","p":12},{"t":"جامعة أم القرى","p":8}]},
  {id:49,q:"اذكر شيء يسويه الناس يوم الجمعة",a:[{"t":"صلاة الجمعة","p":35},{"t":"غداء عائلي","p":25},{"t":"نوم بعد الصلاة","p":15},{"t":"زيارة الأهل","p":10},{"t":"تنظيف البيت","p":10},{"t":"الطبخ","p":5}]},
  {id:50,q:"اذكر منطقة من مناطق السعودية",a:[{"t":"منطقة الرياض","p":28},{"t":"منطقة مكة","p":22},{"t":"المنطقة الشرقية","p":18},{"t":"منطقة المدينة","p":14},{"t":"منطقة عسير","p":10},{"t":"منطقة القصيم","p":8}]},
  {id:51,q:"اذكر برنامج أو مسلسل سعودي مشهور",a:[{"t":"طاش ما طاش","p":30},{"t":"مسامير","p":22},{"t":"سيلفي","p":18},{"t":"شباب البومب","p":14},{"t":"ممنوع التجول","p":10},{"t":"خاوة","p":6}]},
  {id:52,q:"اذكر شيء يوديه السعودي هدية لما يسافر برا",a:[{"t":"بهارات ومنكهات","p":25},{"t":"تمر فاخر","p":25},{"t":"قهوة عربية","p":20},{"t":"عود وبخور","p":14},{"t":"حلويات سعودية","p":10},{"t":"عسل طبيعي","p":6}]},
  {id:53,q:"اذكر عادة سعودية جميلة",a:[{"t":"تقديم القهوة والتمر للضيف","p":30},{"t":"الكرم والضيافة","p":25},{"t":"السلام والمصافحة","p":18},{"t":"الذبيحة للضيف","p":12},{"t":"توزيع العيديات","p":10},{"t":"مشاركة الأكل مع الجيران","p":5}]},
  {id:54,q:"اذكر رياضة مشهورة عالمياً",a:[{"t":"كرة القدم","p":35},{"t":"كرة السلة","p":22},{"t":"السباحة","p":16},{"t":"التنس","p":12},{"t":"ألعاب القوى","p":10},{"t":"الكريكت","p":5}]},
  {id:55,q:"اذكر نادي كرة قدم سعودي",a:[{"t":"الهلال","p":30},{"t":"النصر","p":28},{"t":"الأهلي","p":18},{"t":"الاتحاد","p":14},{"t":"الشباب","p":6},{"t":"الفيحاء","p":4}]},
  {id:56,q:"اذكر لاعب كرة قدم عالمي مشهور",a:[{"t":"ليونيل ميسي","p":30},{"t":"كريستيانو رونالدو","p":28},{"t":"كيليان مبابي","p":18},{"t":"نيمار","p":12},{"t":"كريم بنزيما","p":7},{"t":"محمد صلاح","p":5}]},
  {id:57,q:"اذكر منتخب فاز بكأس العالم",a:[{"t":"البرازيل","p":28},{"t":"ألمانيا","p":22},{"t":"الأرجنتين","p":18},{"t":"فرنسا","p":14},{"t":"إيطاليا","p":10},{"t":"إسبانيا","p":8}]},
  {id:58,q:"اذكر دوري كرة قدم مشهور",a:[{"t":"الدوري الإنجليزي الممتاز","p":30},{"t":"الدوري الإسباني","p":22},{"t":"دوري روشن السعودي","p":18},{"t":"الدوري الإيطالي","p":12},{"t":"دوري أبطال أوروبا","p":10},{"t":"الدوري الألماني","p":8}]},
  {id:59,q:"اذكر بطولة رياضية عالمية كبرى",a:[{"t":"كأس العالم لكرة القدم","p":35},{"t":"الألعاب الأولمبية","p":28},{"t":"دوري أبطال أوروبا","p":15},{"t":"بطولة ويمبلدون","p":8},{"t":"كأس آسيا","p":8},{"t":"كأس أمم أفريقيا","p":6}]},
  {id:60,q:"اذكر نادي كرة قدم أوروبي مشهور",a:[{"t":"ريال مدريد","p":28},{"t":"برشلونة","p":25},{"t":"مانشستر يونايتد","p":18},{"t":"بايرن ميونخ","p":12},{"t":"ليفربول","p":10},{"t":"باريس سان جيرمان","p":7}]},
  {id:61,q:"اذكر رياضة قتالية",a:[{"t":"الملاكمة","p":30},{"t":"الكاراتيه","p":22},{"t":"التايكوندو","p":18},{"t":"الجودو","p":12},{"t":"المصارعة","p":10},{"t":"الكونغ فو","p":8}]},
  {id:62,q:"اذكر رياضة تُلعب بالمضرب",a:[{"t":"التنس","p":30},{"t":"البادل","p":25},{"t":"تنس الطاولة","p":20},{"t":"الريشة الطائرة","p":12},{"t":"السكواش","p":8},{"t":"الكريكت","p":5}]},
  {id:63,q:"اذكر رياضة جماعية",a:[{"t":"كرة القدم","p":35},{"t":"كرة السلة","p":25},{"t":"كرة الطائرة","p":18},{"t":"كرة اليد","p":10},{"t":"الهوكي","p":7},{"t":"البيسبول","p":5}]},
  {id:64,q:"اذكر رياضة فردية",a:[{"t":"السباحة","p":28},{"t":"التنس","p":22},{"t":"الجري والعدو","p":18},{"t":"الملاكمة","p":14},{"t":"الجمباز","p":10},{"t":"رفع الأثقال","p":8}]},
  {id:65,q:"اذكر رياضة مائية",a:[{"t":"السباحة","p":30},{"t":"الغوص","p":25},{"t":"ركوب الأمواج","p":18},{"t":"التجديف","p":12},{"t":"كرة الماء","p":10},{"t":"التزلج على الماء","p":5}]},
  {id:66,q:"اذكر شيء يلبسه لاعب كرة القدم",a:[{"t":"القميص الرسمي","p":28},{"t":"الشورت","p":22},{"t":"الحذاء الرياضي","p":20},{"t":"الجوارب الطويلة","p":14},{"t":"واقي الساق","p":10},{"t":"قفازات الحارس","p":6}]},
  {id:67,q:"اذكر فاكهة استوائية",a:[{"t":"المانجو","p":30},{"t":"الأناناس","p":25},{"t":"الموز","p":18},{"t":"الكيوي","p":12},{"t":"الجوافة","p":10},{"t":"الباباي","p":5}]},
  {id:68,q:"اذكر نوع بهارات يُستخدم كثير",a:[{"t":"الفلفل الأسود","p":28},{"t":"الكمون","p":22},{"t":"الكركم","p":18},{"t":"القرفة","p":14},{"t":"الزنجبيل","p":10},{"t":"الهيل","p":8}]},
  {id:69,q:"اذكر أكلة عالمية يعرفها الجميع",a:[{"t":"البيتزا","p":30},{"t":"البرجر","p":25},{"t":"السوشي","p":18},{"t":"الباستا","p":12},{"t":"التاكو","p":10},{"t":"الكاري الهندي","p":5}]},
  {id:70,q:"اذكر حلا عربي مشهور",a:[{"t":"الكنافة","p":30},{"t":"البقلاوة","p":25},{"t":"البسبوسة","p":18},{"t":"اللقيمات","p":12},{"t":"المهلبية","p":10},{"t":"القطايف","p":5}]},
  {id:71,q:"اذكر أكلة فطور شعبية عربية",a:[{"t":"الفول","p":30},{"t":"الفلافل","p":22},{"t":"البيض بأنواعه","p":18},{"t":"الجبنة والزيتون","p":14},{"t":"اللبنة","p":10},{"t":"الشكشوكة","p":6}]},
  {id:72,q:"اذكر نوع لحم يأكله الناس",a:[{"t":"الدجاج","p":30},{"t":"لحم الغنم","p":25},{"t":"لحم البقر","p":20},{"t":"السمك","p":12},{"t":"الديك الرومي","p":8},{"t":"الربيان","p":5}]},
  {id:73,q:"اذكر نوع مكسرات",a:[{"t":"الفستق","p":25},{"t":"اللوز","p":22},{"t":"الكاجو","p":20},{"t":"الجوز","p":14},{"t":"البندق","p":12},{"t":"الفول السوداني","p":7}]},
  {id:74,q:"اذكر نوع خبز",a:[{"t":"الخبز العربي","p":30},{"t":"الصامولي","p":22},{"t":"التوست","p":18},{"t":"الخبز الفرنسي","p":12},{"t":"التميس","p":10},{"t":"خبز الرقاق","p":8}]},
  {id:75,q:"اذكر شيء يوضع على البيتزا",a:[{"t":"الجبنة","p":30},{"t":"الفلفل الألوان","p":20},{"t":"الزيتون","p":18},{"t":"الفطر","p":14},{"t":"البيبروني","p":10},{"t":"البصل","p":8}]},
  {id:76,q:"اذكر نوع جبنة",a:[{"t":"الشيدر","p":25},{"t":"الموزاريلا","p":22},{"t":"الكريمي","p":18},{"t":"الفيتا","p":15},{"t":"البارميزان","p":12},{"t":"الحلوم","p":8}]},
  {id:77,q:"اذكر مشروب ساخن غير القهوة",a:[{"t":"الشاي الأحمر","p":30},{"t":"الشاي الأخضر","p":22},{"t":"النعناع","p":18},{"t":"القرفة","p":12},{"t":"الكاكاو الساخن","p":10},{"t":"اليانسون","p":8}]},
  {id:78,q:"اذكر مشروب بارد منعش",a:[{"t":"العصير الطازج","p":28},{"t":"الماء البارد","p":22},{"t":"البيبسي أو الكولا","p":18},{"t":"اللبن","p":14},{"t":"الآيس تي","p":10},{"t":"السموذي","p":8}]},
  {id:79,q:"اذكر فاكهة لونها أصفر",a:[{"t":"الموز","p":30},{"t":"الليمون","p":25},{"t":"المانجو","p":20},{"t":"الأناناس","p":12},{"t":"المشمش","p":8},{"t":"الخوخ","p":5}]},
  {id:80,q:"اذكر سورة من قصار السور",a:[{"t":"الإخلاص","p":28},{"t":"الفلق","p":22},{"t":"الناس","p":18},{"t":"الكوثر","p":14},{"t":"العصر","p":10},{"t":"القدر","p":8}]},
  {id:81,q:"اذكر نبي من أنبياء الله",a:[{"t":"محمد ﷺ","p":28},{"t":"إبراهيم عليه السلام","p":22},{"t":"موسى عليه السلام","p":18},{"t":"عيسى عليه السلام","p":14},{"t":"نوح عليه السلام","p":10},{"t":"يوسف عليه السلام","p":8}]},
  {id:82,q:"اذكر شيء يكثر عند المسلمين في رمضان",a:[{"t":"الصيام","p":30},{"t":"صلاة التراويح","p":25},{"t":"قراءة القرآن","p":18},{"t":"الإفطار الجماعي","p":12},{"t":"السحور","p":10},{"t":"الصدقة","p":5}]},
  {id:83,q:"اذكر شهر من الأشهر الهجرية",a:[{"t":"رمضان","p":30},{"t":"ذو الحجة","p":22},{"t":"محرم","p":18},{"t":"ربيع الأول","p":12},{"t":"شعبان","p":10},{"t":"رجب","p":8}]},
  {id:84,q:"اذكر اسم من أسماء الله الحسنى",a:[{"t":"الرحمن","p":25},{"t":"الرحيم","p":22},{"t":"الملك","p":18},{"t":"السلام","p":14},{"t":"الكريم","p":12},{"t":"الغفور","p":9}]},
  {id:85,q:"اذكر صحابي جليل",a:[{"t":"أبو بكر الصديق","p":28},{"t":"عمر بن الخطاب","p":25},{"t":"عثمان بن عفان","p":18},{"t":"علي بن أبي طالب","p":14},{"t":"خالد بن الوليد","p":10},{"t":"بلال بن رباح","p":5}]},
  {id:86,q:"اذكر عمل خير يؤجر عليه المسلم",a:[{"t":"الصدقة","p":28},{"t":"مساعدة المحتاج","p":22},{"t":"زيارة المريض","p":18},{"t":"إطعام الطعام","p":14},{"t":"كفالة يتيم","p":10},{"t":"إماطة الأذى عن الطريق","p":8}]},
  {id:87,q:"اذكر ذكر يقوله المسلم كل يوم",a:[{"t":"بسم الله","p":28},{"t":"الحمد لله","p":25},{"t":"سبحان الله","p":18},{"t":"الله أكبر","p":14},{"t":"أستغفر الله","p":10},{"t":"لا إله إلا الله","p":5}]},
  {id:88,q:"اذكر شيء يبطل الصيام",a:[{"t":"الأكل أو الشرب عمداً","p":35},{"t":"التقيؤ عمداً","p":25},{"t":"نية الإفطار","p":18},{"t":"الحيض","p":12},{"t":"الردة","p":10}]},
  {id:89,q:"اذكر شيء يعمله الحاج في الحج",a:[{"t":"الطواف حول الكعبة","p":28},{"t":"السعي بين الصفا والمروة","p":22},{"t":"الوقوف بعرفة","p":20},{"t":"رمي الجمرات","p":14},{"t":"حلق أو تقصير الشعر","p":10},{"t":"ذبح الهدي","p":6}]},
  {id:90,q:"اذكر معركة إسلامية مشهورة",a:[{"t":"غزوة بدر","p":30},{"t":"غزوة أحد","p":25},{"t":"غزوة الخندق","p":18},{"t":"فتح مكة","p":12},{"t":"معركة اليرموك","p":10},{"t":"معركة القادسية","p":5}]},
  {id:91,q:"اذكر سورة طويلة في القرآن الكريم",a:[{"t":"سورة البقرة","p":35},{"t":"آل عمران","p":25},{"t":"النساء","p":18},{"t":"المائدة","p":10},{"t":"الأنعام","p":7},{"t":"الأعراف","p":5}]},
  {id:92,q:"اذكر مكان مقدس في الإسلام",a:[{"t":"مكة المكرمة","p":30},{"t":"المدينة المنورة","p":28},{"t":"المسجد الأقصى","p":22},{"t":"جبل عرفة","p":10},{"t":"غار حراء","p":6},{"t":"غار ثور","p":4}]},
  {id:93,q:"اذكر حيوان يحبه الأطفال",a:[{"t":"القطة","p":30},{"t":"الأرنب","p":25},{"t":"الكلب","p":18},{"t":"العصفور","p":12},{"t":"السمكة","p":10},{"t":"الحصان","p":5}]},
  {id:94,q:"اذكر حيوان يعيش في الصحراء",a:[{"t":"الجمل","p":35},{"t":"الأفعى","p":22},{"t":"العقرب","p":18},{"t":"الغزال","p":12},{"t":"الأرنب البري","p":8},{"t":"الضب","p":5}]},
  {id:95,q:"اذكر طائر معروف",a:[{"t":"الصقر","p":28},{"t":"الحمامة","p":22},{"t":"النسر","p":18},{"t":"الببغاء","p":14},{"t":"العصفور","p":10},{"t":"البومة","p":8}]},
  {id:96,q:"اذكر حيوان ضخم الحجم",a:[{"t":"الفيل","p":30},{"t":"الحوت الأزرق","p":25},{"t":"الزرافة","p":18},{"t":"وحيد القرن","p":12},{"t":"فرس النهر","p":10},{"t":"الدب","p":5}]},
  {id:97,q:"اذكر شجرة مشهورة",a:[{"t":"النخلة","p":35},{"t":"شجرة الزيتون","p":25},{"t":"شجرة السدر","p":15},{"t":"الصنوبر","p":10},{"t":"البلوط","p":8},{"t":"الأراك","p":7}]},
  {id:98,q:"اذكر ظاهرة طبيعية",a:[{"t":"المطر","p":28},{"t":"البرق والرعد","p":22},{"t":"الزلازل","p":18},{"t":"البراكين","p":14},{"t":"قوس قزح","p":10},{"t":"الكسوف والخسوف","p":8}]},
  {id:99,q:"اذكر حشرة معروفة",a:[{"t":"النملة","p":28},{"t":"النحلة","p":22},{"t":"الفراشة","p":18},{"t":"الصرصور","p":14},{"t":"الذبابة","p":10},{"t":"البعوضة","p":8}]},
  {id:100,q:"اذكر حيوان بحري",a:[{"t":"الدولفين","p":28},{"t":"الحوت","p":22},{"t":"القرش","p":18},{"t":"الأخطبوط","p":14},{"t":"السلحفاة البحرية","p":10},{"t":"نجم البحر","p":8}]},
  {id:101,q:"اذكر حيوان أليف يربيه الناس بالبيت",a:[{"t":"القطة","p":30},{"t":"الكلب","p":25},{"t":"سمك الزينة","p":18},{"t":"الأرنب","p":12},{"t":"الببغاء","p":10},{"t":"الهامستر","p":5}]},
  {id:102,q:"اذكر حيوان سريع جداً",a:[{"t":"الفهد","p":35},{"t":"الحصان","p":22},{"t":"الغزال","p":18},{"t":"الأرنب","p":12},{"t":"النعامة","p":8},{"t":"الذئب","p":5}]},
  {id:103,q:"اذكر دولة عربية في أفريقيا",a:[{"t":"مصر","p":30},{"t":"المغرب","p":22},{"t":"تونس","p":18},{"t":"الجزائر","p":14},{"t":"ليبيا","p":10},{"t":"السودان","p":6}]},
  {id:104,q:"اذكر دولة أوروبية مشهورة",a:[{"t":"فرنسا","p":28},{"t":"بريطانيا","p":22},{"t":"ألمانيا","p":18},{"t":"إيطاليا","p":14},{"t":"إسبانيا","p":10},{"t":"هولندا","p":8}]},
  {id:105,q:"اذكر عاصمة دولة عربية",a:[{"t":"الرياض","p":25},{"t":"القاهرة","p":22},{"t":"دمشق","p":18},{"t":"بغداد","p":14},{"t":"عمّان","p":12},{"t":"الرباط","p":9}]},
  {id:106,q:"اذكر مدينة سياحية عالمية",a:[{"t":"باريس","p":28},{"t":"لندن","p":22},{"t":"دبي","p":20},{"t":"إسطنبول","p":14},{"t":"نيويورك","p":10},{"t":"طوكيو","p":6}]},
  {id:107,q:"اذكر نهر مشهور في العالم",a:[{"t":"نهر النيل","p":30},{"t":"نهر الأمازون","p":22},{"t":"دجلة والفرات","p":18},{"t":"نهر المسيسيبي","p":12},{"t":"نهر الغانج","p":10},{"t":"نهر الراين","p":8}]},
  {id:108,q:"اذكر صحراء مشهورة",a:[{"t":"الربع الخالي","p":30},{"t":"الصحراء الكبرى","p":25},{"t":"صحراء النفود","p":18},{"t":"صحراء الدهناء","p":12},{"t":"صحراء سيناء","p":10},{"t":"صحراء كالاهاري","p":5}]},
  {id:109,q:"اذكر بحر أو محيط",a:[{"t":"البحر الأحمر","p":28},{"t":"المحيط الهادي","p":22},{"t":"البحر المتوسط","p":18},{"t":"المحيط الأطلسي","p":14},{"t":"الخليج العربي","p":10},{"t":"المحيط الهندي","p":8}]},
  {id:110,q:"اذكر جبل مشهور",a:[{"t":"جبل إفرست","p":28},{"t":"جبل أحد","p":22},{"t":"جبل عرفة","p":18},{"t":"جبال الألب","p":14},{"t":"جبل كلمنجارو","p":10},{"t":"جبل الطور","p":8}]},
  {id:111,q:"اذكر دولة آسيوية غير عربية",a:[{"t":"الصين","p":28},{"t":"اليابان","p":22},{"t":"الهند","p":18},{"t":"كوريا الجنوبية","p":14},{"t":"تايلاند","p":10},{"t":"ماليزيا","p":8}]},
  {id:112,q:"اذكر دولة الناس تحب تسافر لها",a:[{"t":"تركيا","p":28},{"t":"مصر","p":20},{"t":"ماليزيا","p":18},{"t":"بريطانيا","p":14},{"t":"إندونيسيا","p":12},{"t":"جورجيا","p":8}]},
  {id:113,q:"اذكر شركة تقنية عالمية كبرى",a:[{"t":"أبل","p":30},{"t":"سامسونج","p":22},{"t":"قوقل","p":18},{"t":"مايكروسوفت","p":14},{"t":"أمازون","p":10},{"t":"ميتا (فيسبوك)","p":6}]},
  {id:114,q:"اذكر منصة تواصل اجتماعي",a:[{"t":"واتساب","p":28},{"t":"إنستقرام","p":22},{"t":"تيك توك","p":18},{"t":"تويتر/إكس","p":14},{"t":"سناب شات","p":10},{"t":"فيسبوك","p":8}]},
  {id:115,q:"اذكر نوع جوال مشهور",a:[{"t":"آيفون","p":35},{"t":"سامسونج جالكسي","p":28},{"t":"هواوي","p":15},{"t":"شاومي","p":10},{"t":"ون بلس","p":7},{"t":"نوكيا","p":5}]},
  {id:116,q:"اذكر لعبة إلكترونية يلعبها الشباب",a:[{"t":"فورتنايت","p":25},{"t":"ماين كرافت","p":22},{"t":"فيفا","p":20},{"t":"ببجي","p":14},{"t":"قراند","p":12},{"t":"كول أوف ديوتي","p":7}]},
  {id:117,q:"اذكر تطبيق توصيل في السعودية",a:[{"t":"هنقرستيشن","p":28},{"t":"جاهز","p":25},{"t":"كريم","p":18},{"t":"أوبر","p":14},{"t":"مرسول","p":10},{"t":"ذا شفز","p":5}]},
  {id:118,q:"اذكر منصة مشاهدة أفلام ومسلسلات",a:[{"t":"نتفلكس","p":30},{"t":"شاهد","p":25},{"t":"يوتيوب","p":18},{"t":"ديزني بلس","p":12},{"t":"أبل تي في","p":10},{"t":"أمازون برايم","p":5}]},
  {id:119,q:"اذكر جهاز كهربائي في البيت",a:[{"t":"التلفزيون","p":28},{"t":"الثلاجة","p":22},{"t":"المكيف","p":18},{"t":"الغسالة","p":14},{"t":"المايكرويف","p":10},{"t":"الجوال","p":8}]},
  {id:120,q:"اذكر اختراع غيّر العالم",a:[{"t":"الكهرباء","p":30},{"t":"الإنترنت","p":25},{"t":"الهاتف","p":18},{"t":"السيارة","p":12},{"t":"الطائرة","p":8},{"t":"الكمبيوتر","p":7}]},
  {id:121,q:"اذكر شيء تبحث عنه في الإنترنت كثير",a:[{"t":"وصفة أكل","p":26},{"t":"معلومة أو سؤال","p":24},{"t":"طريقة تصليح شي","p":18},{"t":"سعر منتج","p":14},{"t":"موقع مكان","p":10},{"t":"أخبار","p":8}]},
  {id:122,q:"اذكر وظيفة يحلم فيها كثير من الناس",a:[{"t":"طيار","p":28},{"t":"طبيب","p":25},{"t":"رجل أعمال","p":18},{"t":"مهندس","p":14},{"t":"مبرمج","p":10},{"t":"معلم","p":5}]},
  {id:123,q:"اذكر وظيفة تحتاج شجاعة",a:[{"t":"رجل إطفاء","p":28},{"t":"عسكري","p":25},{"t":"شرطي","p":20},{"t":"غواص إنقاذ","p":12},{"t":"طيار حربي","p":10},{"t":"مسعف طوارئ","p":5}]},
  {id:124,q:"اذكر وظيفة تحتاج إبداع",a:[{"t":"مصمم جرافيك","p":28},{"t":"مبرمج","p":22},{"t":"مهندس معماري","p":18},{"t":"كاتب ومؤلف","p":14},{"t":"مصور","p":10},{"t":"شيف طباخ","p":8}]},
  {id:125,q:"اذكر وظيفة ممكن تشتغلها من البيت",a:[{"t":"مبرمج ومطور","p":28},{"t":"مصمم","p":22},{"t":"كاتب محتوى","p":18},{"t":"مترجم","p":14},{"t":"تسويق إلكتروني","p":10},{"t":"محاسب","p":8}]},
  {id:126,q:"اذكر وظيفة في المستشفى",a:[{"t":"طبيب","p":30},{"t":"ممرض أو ممرضة","p":25},{"t":"صيدلي","p":18},{"t":"فني أشعة","p":12},{"t":"فني مختبر","p":10},{"t":"موظف استقبال","p":5}]},
  {id:127,q:"اذكر لغة مشهورة عالمياً",a:[{"t":"الإنجليزية","p":30},{"t":"العربية","p":25},{"t":"الصينية","p":18},{"t":"الإسبانية","p":12},{"t":"الفرنسية","p":10},{"t":"الهندية","p":5}]},
  {id:128,q:"اذكر آلة موسيقية",a:[{"t":"العود","p":28},{"t":"البيانو","p":22},{"t":"القيتار","p":18},{"t":"الكمان","p":14},{"t":"الطبل","p":10},{"t":"الناي","p":8}]},
  {id:129,q:"اذكر مادة دراسية في المدرسة",a:[{"t":"الرياضيات","p":28},{"t":"اللغة العربية","p":22},{"t":"اللغة الإنجليزية","p":18},{"t":"العلوم","p":14},{"t":"التاريخ","p":10},{"t":"التربية الإسلامية","p":8}]},
  {id:130,q:"اذكر عملة عربية",a:[{"t":"الريال السعودي","p":30},{"t":"الدرهم الإماراتي","p":22},{"t":"الدينار الكويتي","p":18},{"t":"الجنيه المصري","p":14},{"t":"الدينار الأردني","p":10},{"t":"الريال القطري","p":6}]},
  {id:131,q:"اذكر شيء يرمز للسعودية",a:[{"t":"السيفان والنخلة","p":28},{"t":"العلم الأخضر","p":25},{"t":"الكعبة والحرم","p":18},{"t":"الجمل","p":12},{"t":"النفط والبترول","p":10},{"t":"رؤية 2030","p":7}]},
  {id:132,q:"اذكر هدية الناس تفرح فيها",a:[{"t":"عطر فخم","p":28},{"t":"جوال جديد","p":22},{"t":"فلوس أو بطاقة شراء","p":20},{"t":"ساعة","p":14},{"t":"باقة ورد","p":10},{"t":"شوكولاتة فاخرة","p":6}]},
  {id:133,q:"اذكر مناسبة يجتمع فيها الناس",a:[{"t":"عيد الفطر والأضحى","p":30},{"t":"الزواج والأعراس","p":25},{"t":"رمضان","p":18},{"t":"اليوم الوطني السعودي","p":12},{"t":"حفل التخرج","p":10},{"t":"المولود الجديد","p":5}]},
  {id:134,q:"اذكر شيء تشتريه للبيت الجديد",a:[{"t":"أثاث وكنب","p":28},{"t":"ثلاجة","p":22},{"t":"غسالة","p":18},{"t":"مكيفات","p":14},{"t":"سجاد وستائر","p":10},{"t":"أجهزة مطبخ","p":8}]},
  {id:135,q:"اذكر شيء يسويه الأب مع عياله",a:[{"t":"يلعب معهم","p":28},{"t":"يوصلهم المدرسة","p":22},{"t":"يأخذهم نزهة","p":18},{"t":"يشتري لهم أغراضهم","p":14},{"t":"يعلمهم ويذاكر معهم","p":10},{"t":"يحكي لهم قصص","p":8}]},
  {id:136,q:"اذكر شيء يسويه الطفل في المدرسة",a:[{"t":"يدرس ويتعلم","p":28},{"t":"يلعب مع أصحابه","p":25},{"t":"يأكل في الفسحة","p":18},{"t":"يتكلم ويسولف","p":14},{"t":"يرسم ويلون","p":10},{"t":"يكتب الواجب","p":5}]},
  {id:137,q:"اذكر شيء تشتريه للأطفال",a:[{"t":"لعبة","p":30},{"t":"ملابس","p":22},{"t":"حلويات وشوكولاتة","p":18},{"t":"كتب وقصص","p":14},{"t":"جوال أو تابلت","p":10},{"t":"حذاء رياضي","p":6}]},
  {id:138,q:"اذكر عضو من أعضاء جسم الإنسان",a:[{"t":"القلب","p":28},{"t":"الدماغ","p":22},{"t":"الكبد","p":18},{"t":"الرئتين","p":14},{"t":"الكلى","p":10},{"t":"المعدة","p":8}]},
  {id:139,q:"اذكر شيء صحي لازم تسويه كل يوم",a:[{"t":"شرب ماء كافي","p":30},{"t":"ممارسة رياضة أو مشي","p":25},{"t":"أكل خضار وفواكه","p":18},{"t":"النوم الكافي","p":12},{"t":"تفريش الأسنان","p":10},{"t":"تقليل السكريات","p":5}]},
  {id:140,q:"اذكر سبب يخلّي الناس تروح المستشفى",a:[{"t":"مرض أو حرارة","p":28},{"t":"كسر أو إصابة","p":22},{"t":"ولادة","p":18},{"t":"عملية جراحية","p":14},{"t":"حادث سير","p":10},{"t":"فحص دوري","p":8}]},
  {id:141,q:"اذكر فيتامين أو معدن مهم للجسم",a:[{"t":"فيتامين سي","p":28},{"t":"فيتامين دي","p":25},{"t":"الحديد","p":18},{"t":"الكالسيوم","p":14},{"t":"فيتامين أ","p":10},{"t":"الزنك","p":5}]},
  {id:142,q:"اذكر وسيلة مواصلات",a:[{"t":"السيارة","p":30},{"t":"الطائرة","p":25},{"t":"الباص","p":18},{"t":"القطار","p":12},{"t":"التاكسي","p":10},{"t":"الدراجة","p":5}]},
  {id:143,q:"اذكر شيء موجود في المطار",a:[{"t":"الطائرات","p":28},{"t":"كاونتر الجوازات","p":22},{"t":"كاونتر التسجيل","p":18},{"t":"الكافيهات والمطاعم","p":14},{"t":"السوق الحرة","p":10},{"t":"سير الحقائب","p":8}]},
  {id:144,q:"اذكر شيء تحطه في شنطة السفر",a:[{"t":"ملابس","p":30},{"t":"شاحن الجوال","p":22},{"t":"أدوات النظافة","p":18},{"t":"جواز السفر","p":14},{"t":"أدوية","p":10},{"t":"كتاب أو تابلت","p":6}]},
  {id:145,q:"اذكر خطوط طيران معروفة",a:[{"t":"الخطوط السعودية","p":30},{"t":"طيران ناس","p":22},{"t":"طيران الإمارات","p":18},{"t":"الخطوط القطرية","p":12},{"t":"الخطوط التركية","p":10},{"t":"مصر للطيران","p":8}]},
  {id:146,q:"اذكر قطعة من اللبس الرجالي السعودي",a:[{"t":"الثوب","p":35},{"t":"الشماغ","p":25},{"t":"البشت","p":18},{"t":"الطاقية","p":10},{"t":"العقال","p":7},{"t":"السروال","p":5}]},
  {id:147,q:"اذكر ماركة ملابس أو أحذية عالمية",a:[{"t":"نايكي","p":28},{"t":"أديداس","p":22},{"t":"زارا","p":18},{"t":"قوتشي","p":14},{"t":"لويس فيتون","p":10},{"t":"إتش آند إم","p":8}]},
  {id:148,q:"اذكر لون ملابس الناس تلبسه كثير",a:[{"t":"الأسود","p":30},{"t":"الأبيض","p":28},{"t":"الأزرق الغامق","p":18},{"t":"الرمادي","p":12},{"t":"البني","p":7},{"t":"الأحمر","p":5}]},
  {id:149,q:"اذكر نوع حذاء",a:[{"t":"حذاء رياضي","p":28},{"t":"حذاء رسمي","p":22},{"t":"صندل","p":18},{"t":"شبشب","p":14},{"t":"بوت","p":10},{"t":"كعب عالي","p":8}]},
  {id:150,q:"اذكر هواية ممتعة",a:[{"t":"القراءة","p":25},{"t":"الرسم والتلوين","p":22},{"t":"التصوير","p":18},{"t":"الطبخ","p":14},{"t":"ممارسة الرياضة","p":12},{"t":"السفر واستكشاف أماكن","p":9}]},
  {id:151,q:"اذكر مسلسل كرتون مشهور",a:[{"t":"توم وجيري","p":28},{"t":"سبونج بوب","p":22},{"t":"ميكي ماوس","p":18},{"t":"النمر الوردي","p":14},{"t":"المحقق كونان","p":10},{"t":"دراغون بول","p":8}]},
  {id:152,q:"اذكر شيء يسويه الناس في الإجازة",a:[{"t":"السفر","p":30},{"t":"النوم الطويل","p":25},{"t":"زيارة الأهل والأصدقاء","p":18},{"t":"المطاعم والكافيهات","p":12},{"t":"الألعاب والأنشطة","p":10},{"t":"القراءة","p":5}]},
  {id:153,q:"اذكر شيء تسويه في الحديقة",a:[{"t":"تمشي وتتأمل","p":28},{"t":"تلعب مع العيال","p":22},{"t":"تسوي شوي أو بيكنك","p":18},{"t":"تقرأ كتاب","p":14},{"t":"تتصور","p":10},{"t":"تجلس وتستريح","p":8}]},
  {id:154,q:"اذكر شيء مصنوع من خشب",a:[{"t":"الباب","p":28},{"t":"الطاولة","p":25},{"t":"الكرسي","p":18},{"t":"الخزانة","p":12},{"t":"قلم الرصاص","p":10},{"t":"السرير","p":7}]},
  {id:155,q:"اذكر شيء مصنوع من زجاج",a:[{"t":"النافذة","p":28},{"t":"الكوب","p":25},{"t":"المرآة","p":18},{"t":"النظارة","p":14},{"t":"شاشة الجوال","p":10},{"t":"المزهرية","p":5}]},
  {id:156,q:"اذكر شيء له رائحة حلوة",a:[{"t":"العطر","p":30},{"t":"الورد","p":25},{"t":"البخور والعود","p":18},{"t":"القهوة الطازجة","p":12},{"t":"الخبز من الفرن","p":10},{"t":"الفواكه","p":5}]},
  {id:157,q:"اذكر شيء يوضع على الحائط",a:[{"t":"صورة أو لوحة","p":28},{"t":"ساعة حائط","p":25},{"t":"تلفزيون","p":18},{"t":"مرآة","p":14},{"t":"رف","p":10},{"t":"مكيف","p":5}]},
  {id:158,q:"اذكر شيء مستدير الشكل",a:[{"t":"الكرة","p":28},{"t":"العجلة","p":22},{"t":"الساعة","p":18},{"t":"الصحن","p":14},{"t":"العملة المعدنية","p":10},{"t":"القمر","p":8}]},
  {id:159,q:"اذكر شيء بارد",a:[{"t":"الثلج","p":30},{"t":"الآيس كريم","p":22},{"t":"الماء البارد","p":18},{"t":"الثلاجة من داخل","p":14},{"t":"الشتاء","p":10},{"t":"المكيف","p":6}]},
  {id:160,q:"اذكر شيء حار",a:[{"t":"الشمس","p":28},{"t":"النار","p":25},{"t":"الفلفل الحار","p":18},{"t":"الماء المغلي","p":14},{"t":"الشاي الحار","p":10},{"t":"الصحراء في الصيف","p":5}]},
  {id:161,q:"اذكر شيء ينكسر بسهولة",a:[{"t":"الزجاج","p":30},{"t":"البيض","p":25},{"t":"شاشة الجوال","p":18},{"t":"المزهرية","p":12},{"t":"النظارة","p":10},{"t":"الصحن","p":5}]},
  {id:162,q:"اذكر شيء يفسد بسرعة",a:[{"t":"الحليب الطازج","p":28},{"t":"الخضار الورقية","p":22},{"t":"اللحم خارج الثلاجة","p":18},{"t":"الفواكه الطرية","p":14},{"t":"الخبز","p":10},{"t":"العصير الطبيعي","p":8}]},
  {id:163,q:"اذكر شيء يحتاج تركيز عالي",a:[{"t":"قيادة السيارة","p":28},{"t":"المذاكرة والدراسة","p":22},{"t":"البرمجة","p":18},{"t":"الطبخ","p":14},{"t":"الرياضة","p":10},{"t":"القراءة","p":8}]},
  {id:164,q:"اذكر شيء تسويه قبل ما تنام",a:[{"t":"تشيك الجوال","p":30},{"t":"تصلي","p":22},{"t":"تفرش أسنانك","p":18},{"t":"تقرأ أذكار النوم","p":14},{"t":"تشرب ماء","p":10},{"t":"تطفي الأنوار","p":6}]},
  {id:165,q:"اذكر معدن ثمين",a:[{"t":"الذهب","p":35},{"t":"الفضة","p":25},{"t":"البلاتين","p":18},{"t":"الألماس","p":12},{"t":"الزمرد","p":6},{"t":"الياقوت","p":4}]},
  {id:166,q:"اذكر شيء يتغير لونه",a:[{"t":"أوراق الشجر في الخريف","p":28},{"t":"لون السماء","p":25},{"t":"الحرباء","p":20},{"t":"الشعر مع العمر","p":12},{"t":"الفاكهة لما تستوي","p":10},{"t":"لون البحر","p":5}]},
  {id:167,q:"اذكر شيء تسويه وأنت تنتظر",a:[{"t":"تتصفح الجوال","p":30},{"t":"تقرأ شيء","p":22},{"t":"تتكلم مع أحد","p":18},{"t":"تلعب لعبة","p":14},{"t":"تسمع أغاني أو بودكاست","p":10},{"t":"تفكر","p":6}]},
  {id:168,q:"اذكر سبب ضعف بطارية الجوال",a:[{"t":"كثرة الاستخدام","p":28},{"t":"التطبيقات المفتوحة","p":22},{"t":"الإضاءة العالية","p":18},{"t":"البطارية القديمة","p":14},{"t":"الألعاب الثقيلة","p":10},{"t":"البلوتوث والواي فاي","p":8}]},
  {id:169,q:"اذكر شيء يحتاج صبر",a:[{"t":"الصيام","p":28},{"t":"الدراسة الطويلة","p":22},{"t":"تربية الأطفال","p":20},{"t":"الزحمة","p":14},{"t":"الطبخ","p":10},{"t":"صيد السمك","p":6}]},
  {id:170,q:"اذكر شيء يخلّيك تضحك",a:[{"t":"نكتة حلوة","p":30},{"t":"موقف مضحك","p":22},{"t":"مقطع فيديو كوميدي","p":18},{"t":"تقليد أحد","p":14},{"t":"تصرف طفل","p":10},{"t":"ذكرى قديمة","p":6}]},
  {id:171,q:"اذكر شيء يخلّيك تحس بالراحة",a:[{"t":"النوم العميق","p":28},{"t":"الصلاة والدعاء","p":22},{"t":"صوت البحر والطبيعة","p":18},{"t":"القراءة","p":14},{"t":"الهدوء","p":10},{"t":"جلسة مع الأهل","p":8}]},
  {id:172,q:"اذكر شيء ثقيل الوزن",a:[{"t":"السيارة","p":28},{"t":"الفيل","p":22},{"t":"الصخرة الكبيرة","p":18},{"t":"الثلاجة","p":14},{"t":"الحديد","p":10},{"t":"الخزنة","p":8}]},
  {id:173,q:"اذكر شيء يتحرك ببطء شديد",a:[{"t":"السلحفاة","p":30},{"t":"الحلزون","p":25},{"t":"السيارة في الزحمة","p":18},{"t":"النملة","p":12},{"t":"عقارب الساعة","p":10},{"t":"نمو النبات","p":5}]},
  {id:174,q:"اذكر شيء يتحرك بسرعة كبيرة",a:[{"t":"الضوء","p":28},{"t":"الصاروخ","p":22},{"t":"الفهد","p":18},{"t":"الطائرة النفاثة","p":14},{"t":"البرق","p":10},{"t":"سيارة السباق","p":8}]},
  {id:175,q:"اذكر شيء يوجد في كل منزل",a:[{"t":"باب رئيسي","p":28},{"t":"نوافذ","p":22},{"t":"حمام","p":18},{"t":"مطبخ","p":14},{"t":"كهرباء","p":10},{"t":"مصدر ماء","p":8}]},
  {id:176,q:"اذكر شيء تحبه الأطفال كثير",a:[{"t":"الألعاب","p":30},{"t":"الحلويات والشوكولاتة","p":22},{"t":"مشاهدة الكرتون","p":18},{"t":"الحديقة والملاهي","p":14},{"t":"الجوال والتابلت","p":10},{"t":"العيدية","p":6}]},
  {id:177,q:"اذكر شيء يخلّيك تشعر بالدفء",a:[{"t":"البطانية السميكة","p":28},{"t":"كوب شاي أو قهوة ساخنة","p":22},{"t":"الجاكيت الشتوي","p":18},{"t":"الشمس","p":14},{"t":"النار والحطب","p":10},{"t":"حضن شخص عزيز","p":8}]},
  {id:178,q:"اذكر شيء لونه أزرق",a:[{"t":"السماء","p":28},{"t":"البحر","p":25},{"t":"الجينز","p":18},{"t":"علبة البيبسي","p":14},{"t":"كوكب الأرض","p":10},{"t":"العيون الزرقاء","p":5}]},
  {id:179,q:"اذكر شيء لونه أبيض",a:[{"t":"الثلج","p":28},{"t":"الحليب","p":22},{"t":"القطن","p":18},{"t":"السكر","p":14},{"t":"السحاب","p":10},{"t":"الملح","p":8}]},
  {id:180,q:"اذكر شيء لونه أصفر",a:[{"t":"الموز","p":28},{"t":"الشمس","p":25},{"t":"الليمون","p":18},{"t":"الذهب","p":14},{"t":"عباد الشمس","p":10},{"t":"النجمة","p":5}]},
  {id:181,q:"اذكر شيء لونه أخضر",a:[{"t":"العشب والشجر","p":28},{"t":"التفاح الأخضر","p":22},{"t":"علم السعودية","p":18},{"t":"النعناع","p":14},{"t":"الفلفل الأخضر","p":10},{"t":"الريحان","p":8}]},
  {id:182,q:"اذكر شيء يوجد في الحمام",a:[{"t":"الصابون والشامبو","p":28},{"t":"فرشاة ومعجون الأسنان","p":22},{"t":"المنشفة","p":18},{"t":"المرآة","p":14},{"t":"الدش","p":10},{"t":"سلة الغسيل","p":8}]},
  {id:183,q:"اذكر شيء يوجد في غرفة النوم",a:[{"t":"السرير","p":30},{"t":"الخزانة","p":22},{"t":"الوسادة واللحاف","p":18},{"t":"المكيف","p":14},{"t":"الستارة","p":10},{"t":"الأباجورة","p":6}]},
  {id:184,q:"اذكر شيء يوجد في الصالة",a:[{"t":"التلفزيون","p":28},{"t":"الكنب","p":25},{"t":"الطاولة","p":18},{"t":"السجادة","p":12},{"t":"الريموت","p":10},{"t":"المكيف","p":7}]},
  {id:185,q:"اذكر أداة موجودة في المطبخ",a:[{"t":"السكين","p":28},{"t":"الملعقة الكبيرة","p":22},{"t":"المقلاة","p":18},{"t":"القدر","p":14},{"t":"الخلاط","p":10},{"t":"لوح التقطيع","p":8}]},
  {id:186,q:"اذكر شيء يوجد في المسجد",a:[{"t":"السجاد","p":28},{"t":"المحراب","p":22},{"t":"المنبر","p":18},{"t":"المصاحف","p":14},{"t":"مكبرات الصوت","p":10},{"t":"المكيفات","p":8}]},
  {id:187,q:"اذكر شيء يوجد في المدرسة",a:[{"t":"الطلاب والطالبات","p":28},{"t":"المعلمين","p":22},{"t":"الملعب","p":18},{"t":"المقصف","p":14},{"t":"المكتبة","p":10},{"t":"الإدارة","p":8}]},
  {id:188,q:"اذكر شيء ممنوع في الطائرة",a:[{"t":"التدخين","p":28},{"t":"حمل سوائل كبيرة","p":22},{"t":"الأسلحة الحادة","p":20},{"t":"الوقوف وقت الإقلاع","p":14},{"t":"الجوال بدون وضع الطيران","p":10},{"t":"الولاعة","p":6}]},
  {id:189,q:"اذكر شيء يخلّيك متوتر",a:[{"t":"الاختبارات","p":28},{"t":"المقابلة الوظيفية","p":22},{"t":"الزحمة الشديدة","p":18},{"t":"تأخر رحلة الطيران","p":14},{"t":"الانتظار الطويل","p":10},{"t":"أخبار سيئة","p":8}]},
  {id:190,q:"اذكر شيء تسويه قبل السفر",a:[{"t":"حجز التذاكر والفندق","p":28},{"t":"ترتيب شنطة السفر","p":22},{"t":"تجديد الجواز","p":18},{"t":"شراء المستلزمات","p":14},{"t":"تأكيد الحجز","p":10},{"t":"وداع الأهل","p":8}]},
  {id:191,q:"اذكر شيء يعطيك طاقة ونشاط",a:[{"t":"القهوة","p":28},{"t":"النوم الكافي","p":22},{"t":"ممارسة الرياضة","p":18},{"t":"الأكل الصحي","p":14},{"t":"الشوكولاتة","p":10},{"t":"شرب الماء","p":8}]},
  {id:192,q:"اذكر شيء تحطه في الشاي",a:[{"t":"سكر","p":30},{"t":"نعناع طازج","p":22},{"t":"حليب","p":18},{"t":"ليمون","p":14},{"t":"هيل","p":10},{"t":"عسل","p":6}]},
  {id:193,q:"اذكر شيء يوجد في الحديقة العامة",a:[{"t":"أشجار وورود","p":28},{"t":"ألعاب أطفال","p":22},{"t":"عشب أخضر","p":18},{"t":"مقاعد جلوس","p":14},{"t":"ممشى","p":10},{"t":"نافورة","p":8}]},
  {id:194,q:"اذكر شيء يوجد في القهوة العربية",a:[{"t":"الهيل","p":30},{"t":"البن المحمص","p":25},{"t":"الزعفران","p":18},{"t":"الماء الساخن","p":12},{"t":"القرنفل","p":10},{"t":"الزنجبيل","p":5}]},
  {id:195,q:"اذكر شيء الناس تحطه على الأكل",a:[{"t":"الملح","p":28},{"t":"الفلفل الأسود","p":22},{"t":"الكاتشب","p":18},{"t":"عصير الليمون","p":14},{"t":"الصلصة الحارة","p":10},{"t":"المايونيز","p":8}]},
  {id:196,q:"اذكر شيء يخلّي البيت نظيف ومرتب",a:[{"t":"التنظيف اليومي","p":28},{"t":"ترتيب الأغراض","p":22},{"t":"المكنسة الكهربائية","p":18},{"t":"المماسح","p":14},{"t":"المعطرات","p":10},{"t":"سلة القمامة","p":8}]},
  {id:197,q:"اذكر شيء الناس تتمناه في حياتها",a:[{"t":"الصحة والعافية","p":28},{"t":"المال الكثير","p":22},{"t":"السعادة وراحة البال","p":18},{"t":"النجاح","p":14},{"t":"بيت خاص","p":10},{"t":"أسرة سعيدة","p":8}]},
  {id:198,q:"اذكر شيء يوجد في المحفظة",a:[{"t":"فلوس كاش","p":30},{"t":"بطاقة البنك","p":22},{"t":"بطاقة الهوية","p":18},{"t":"رخصة القيادة","p":14},{"t":"صور","p":10},{"t":"كروت وبطاقات","p":6}]},
  {id:199,q:"اذكر شيء الناس تخاف منه",a:[{"t":"الموت","p":28},{"t":"الحشرات والعناكب","p":22},{"t":"الظلام","p":18},{"t":"المرتفعات العالية","p":14},{"t":"الأماكن المغلقة","p":10},{"t":"الثعابين","p":8}]},
  {id:200,q:"اذكر شيء أسرع من السيارة العادية",a:[{"t":"الطائرة","p":35},{"t":"القطار السريع","p":25},{"t":"الصاروخ","p":18},{"t":"سيارة السباق","p":12},{"t":"الضوء","p":6},{"t":"الصوت","p":4}]},
  {id:201,q:"اذكر شيء يوجد في كل سيارة",a:[{"t":"المرايا","p":28},{"t":"المقاعد","p":22},{"t":"حزام الأمان","p":18},{"t":"المسّاحات","p":14},{"t":"العجل الاحتياطي","p":10},{"t":"البنزين","p":8}]},
  {id:202,q:"اذكر شيء يجذب انتباه الناس",a:[{"t":"الألوان الزاهية","p":28},{"t":"الأصوات العالية","p":22},{"t":"الحركة المفاجئة","p":18},{"t":"الأضواء","p":14},{"t":"الروائح القوية","p":10},{"t":"الجمال","p":8}]},
  {id:203,q:"اذكر شيء يخلّيك تحس بالأمان",a:[{"t":"وجود الأهل","p":28},{"t":"البيت","p":22},{"t":"الإيمان والتوكل على الله","p":18},{"t":"الاستقرار المالي","p":14},{"t":"الصديق الوفي","p":10},{"t":"إقفال الباب","p":8}]},
  {id:204,q:"اذكر شيء يرن أو يصدر صوت تنبيه",a:[{"t":"الجوال","p":30},{"t":"المنبه","p":22},{"t":"جرس الباب","p":18},{"t":"الهاتف الأرضي","p":14},{"t":"ساعة المنبه","p":10},{"t":"جهاز الإنذار","p":6}]},
  {id:205,q:"اذكر شيء يحتاج شحن",a:[{"t":"الجوال","p":30},{"t":"اللابتوب","p":22},{"t":"الساعة الذكية","p":18},{"t":"السيارة الكهربائية","p":14},{"t":"سماعات البلوتوث","p":10},{"t":"البور بانك","p":6}]},
  {id:206,q:"اذكر سبب يخلّي الناس تغيّر وظيفتها",a:[{"t":"الراتب القليل","p":28},{"t":"ضغط العمل الزائد","p":22},{"t":"فرصة أفضل","p":18},{"t":"المدير السيئ","p":14},{"t":"الملل والروتين","p":10},{"t":"بعد مكان العمل","p":8}]},
  {id:207,q:"اذكر شيء يخلّيك فخور بنفسك",a:[{"t":"تحقيق النجاح","p":28},{"t":"إسعاد الأهل","p":22},{"t":"خدمة الوطن","p":18},{"t":"إنجاز صعب","p":14},{"t":"مساعدة شخص محتاج","p":10},{"t":"التخرج","p":8}]},
  {id:208,q:"اذكر شيء ممتع في الشتاء",a:[{"t":"صوت المطر والجلسة","p":28},{"t":"جلسة عائلية حول النار","p":22},{"t":"شرب القهوة الساخنة","p":18},{"t":"الأجواء الباردة المنعشة","p":14},{"t":"التغطي بالبطانية","p":10},{"t":"طبخ الشوربة","p":8}]},
  {id:209,q:"اذكر شيء مهم في حياة كل إنسان",a:[{"t":"الصحة والعافية","p":28},{"t":"الأهل والعائلة","p":22},{"t":"الدين والإيمان","p":18},{"t":"العلم والمعرفة","p":14},{"t":"المال الحلال","p":10},{"t":"الصداقة الحقيقية","p":8}]},
  {id:210,q:"اذكر شيء يحتاج تخطيط مسبق",a:[{"t":"السفر","p":28},{"t":"الزواج","p":22},{"t":"بناء بيت أو مشروع","p":18},{"t":"الدراسة الجامعية","p":14},{"t":"تنظيم حفلة","p":10},{"t":"الميزانية الشهرية","p":8}]},
  {id:211,q:"اذكر شيء الناس تحب تسمعه",a:[{"t":"كلمة مدح وتقدير","p":28},{"t":"خبر سعيد","p":22},{"t":"شكراً من القلب","p":18},{"t":"أحبك","p":14},{"t":"إنت ناجح","p":10},{"t":"عندك عيدية","p":8}]},
  {id:212,q:"اذكر شيء تحس فيه وأنت صايم",a:[{"t":"الجوع","p":28},{"t":"العطش","p":22},{"t":"الصبر والإرادة","p":18},{"t":"التعب والإرهاق","p":14},{"t":"صداع خفيف","p":10},{"t":"الخشوع والقرب من الله","p":8}]},
  {id:213,q:"اذكر صفة حلوة في الإنسان",a:[{"t":"الصدق والأمانة","p":28},{"t":"الكرم","p":22},{"t":"الطيبة ولين القلب","p":18},{"t":"الصبر","p":14},{"t":"التواضع","p":10},{"t":"البشاشة والابتسامة","p":8}]},
  {id:214,q:"اذكر شيء يخلّي الجو حلو ومنعش",a:[{"t":"نزول المطر","p":28},{"t":"البرد والنسيم","p":22},{"t":"الغيوم","p":18},{"t":"فصل الشتاء","p":14},{"t":"الرياح الخفيفة","p":10},{"t":"الثلج","p":8}]},
  {id:215,q:"اذكر نوع سيارة دفع رباعي",a:[{"t":"لاند كروزر","p":28},{"t":"باترول","p":22},{"t":"جيب رانجلر","p":18},{"t":"تاهو","p":14},{"t":"يوكن","p":10},{"t":"برادو","p":8}]},
  {id:216,q:"اذكر شيء يحتاج ماء",a:[{"t":"النبات والزراعة","p":28},{"t":"الإنسان","p":22},{"t":"الطبخ","p":18},{"t":"الوضوء والاغتسال","p":14},{"t":"غسل الملابس","p":10},{"t":"السباحة","p":8}]},
  {id:217,q:"اذكر سبب انقطاع الإنترنت",a:[{"t":"مشكلة في الراوتر","p":28},{"t":"صيانة الشبكة","p":22},{"t":"فاتورة غير مسددة","p":18},{"t":"عطل في الكيبل","p":14},{"t":"ضغط كبير على الشبكة","p":10},{"t":"أحوال جوية سيئة","p":8}]},
  {id:218,q:"اذكر أداة من صندوق العدة",a:[{"t":"المفك","p":28},{"t":"المطرقة","p":22},{"t":"الكماشة","p":18},{"t":"مفتاح الربط","p":14},{"t":"شريط القياس","p":10},{"t":"المسامير","p":8}]},
  {id:219,q:"اذكر شيء تحتاجه في التخييم والبر",a:[{"t":"الخيمة","p":30},{"t":"الكشاف أو الفانوس","p":22},{"t":"حطب للنار","p":18},{"t":"ماء وأكل","p":14},{"t":"بطانية أو لحاف","p":10},{"t":"فحم للشوي","p":6}]},
  {id:220,q:"اذكر شيء يخلّي الدراسة أسهل",a:[{"t":"تنظيم الوقت","p":28},{"t":"المذاكرة من بدري","p":22},{"t":"عمل ملخصات","p":18},{"t":"مجموعة دراسة مع أصدقاء","p":14},{"t":"فهم شرح المعلم","p":10},{"t":"الدراسة في مكان هادي","p":8}]},
  {id:221,q:"اذكر سبب تعطّل السيارة",a:[{"t":"بنشر العجل","p":28},{"t":"خلص البنزين","p":22},{"t":"عطل في البطارية","p":18},{"t":"ارتفاع حرارة المكينة","p":14},{"t":"مشكلة في الزيت","p":10},{"t":"حادث","p":8}]},
  {id:222,q:"اذكر شيء يخلّي الرحلة مملة",a:[{"t":"طريق طويل بدون توقف","p":28},{"t":"السكوت وعدم السوالف","p":22},{"t":"الزحمة","p":18},{"t":"عدم وجود إنترنت","p":14},{"t":"عدم وجود أكل","p":10},{"t":"الحر الشديد","p":8}]},
  {id:223,q:"اذكر شيء يخلّيك تنسى الوقت",a:[{"t":"تصفح الجوال","p":30},{"t":"الألعاب الإلكترونية","p":22},{"t":"القراءة الممتعة","p":18},{"t":"السفر والاستكشاف","p":14},{"t":"الجلسة مع الأصدقاء","p":10},{"t":"العمل المركز","p":6}]},
  {id:224,q:"اذكر شيء تحبه في بلدك",a:[{"t":"الأمان والاستقرار","p":28},{"t":"الأهل والأحبة","p":22},{"t":"الحرمين الشريفين","p":18},{"t":"الثقافة والعادات","p":14},{"t":"جودة الحياة","p":10},{"t":"الأكل الشعبي","p":8}]},
  {id:225,q:"اذكر شيء يخلّيك متفائل",a:[{"t":"الصلاة والدعاء","p":28},{"t":"وجود الأهل","p":22},{"t":"تحقيق هدف","p":18},{"t":"منظر الطبيعة","p":14},{"t":"بداية يوم جديد","p":10},{"t":"القراءة الإيجابية","p":8}]},
  {id:226,q:"اذكر شيء يوجد في المكتبة",a:[{"t":"الكتب والمراجع","p":30},{"t":"رفوف الكتب","p":22},{"t":"طاولات وكراسي","p":18},{"t":"الهدوء التام","p":14},{"t":"المجلات","p":10},{"t":"الكمبيوترات","p":6}]},
  {id:227,q:"اذكر شيء موجود في الفضاء",a:[{"t":"النجوم","p":28},{"t":"الكواكب","p":22},{"t":"القمر","p":18},{"t":"الشمس","p":14},{"t":"المجرات","p":10},{"t":"رواد الفضاء","p":8}]},
  {id:228,q:"اذكر سبب حب الناس للقهوة",a:[{"t":"تعطي نشاط وتركيز","p":28},{"t":"طعمها اللذيذ","p":22},{"t":"عادة يومية","p":18},{"t":"جلسة القهوة الحلوة","p":14},{"t":"رائحتها المميزة","p":10},{"t":"تساعد على التفكير","p":8}]},
  {id:229,q:"اذكر شيء الناس تصوره بالجوال",a:[{"t":"الأكل قبل ما تأكل","p":28},{"t":"سيلفي","p":22},{"t":"المناظر الطبيعية","p":18},{"t":"المناسبات والأعراس","p":14},{"t":"الأطفال","p":10},{"t":"الغروب والشروق","p":8}]},
  {id:230,q:"اذكر شيء تتعلمه من الإنترنت",a:[{"t":"وصفات الطبخ","p":28},{"t":"لغة جديدة","p":22},{"t":"البرمجة","p":18},{"t":"التصميم","p":14},{"t":"تمارين رياضية","p":10},{"t":"معلومات عامة","p":8}]},
  {id:231,q:"اذكر شيء يوجد في المقهى أو الكافيه",a:[{"t":"القهوة بأنواعها","p":28},{"t":"كراسي وطاولات مريحة","p":22},{"t":"واي فاي مجاني","p":18},{"t":"كيك وحلويات","p":14},{"t":"البارستا","p":10},{"t":"موسيقى هادئة","p":8}]},
  {id:232,q:"اذكر شيء تحتاجه في الصيف",a:[{"t":"المكيف","p":30},{"t":"ماء بارد كثير","p":22},{"t":"الآيس كريم","p":18},{"t":"نظارة شمس","p":14},{"t":"واقي الشمس","p":10},{"t":"المسبح","p":6}]},
  {id:233,q:"اذكر شيء الناس تخاف تخسره",a:[{"t":"الصحة","p":28},{"t":"الأهل والعائلة","p":22},{"t":"المال","p":18},{"t":"الوظيفة","p":14},{"t":"الجوال وبياناته","p":10},{"t":"الأصدقاء المقربين","p":8}]},
  {id:234,q:"اذكر شيء يوجد في المستشفى",a:[{"t":"أسرّة المرضى","p":28},{"t":"الأطباء والممرضين","p":22},{"t":"الأجهزة الطبية","p":18},{"t":"الأدوية","p":14},{"t":"العيادات","p":10},{"t":"سيارة الإسعاف","p":8}]},
  {id:235,q:"اذكر شيء يوجد في البنك",a:[{"t":"الأموال والخزنة","p":28},{"t":"الصرافين","p":22},{"t":"البطاقات البنكية","p":18},{"t":"الكاونترات","p":14},{"t":"الحراسة الأمنية","p":10},{"t":"طابور الانتظار","p":8}]},
  {id:236,q:"اذكر شيء يوجد في الملاهي",a:[{"t":"ألعاب كهربائية","p":30},{"t":"أطفال وعائلات","p":22},{"t":"آيس كريم وحلويات","p":18},{"t":"بالونات","p":14},{"t":"التذاكر","p":10},{"t":"الزحمة والضحك","p":6}]},
  {id:237,q:"اذكر شيء يخلّي الأكل لذيذ أكثر",a:[{"t":"البهارات المناسبة","p":28},{"t":"الملح بالقدر الصحيح","p":22},{"t":"عصرة ليمون","p":18},{"t":"الصلصة","p":14},{"t":"الطبخ على نار هادية","p":10},{"t":"أنك جوعان","p":8}]},
  {id:238,q:"اذكر شيء يوجد في الفندق",a:[{"t":"الغرف","p":28},{"t":"الاستقبال والريسبشن","p":22},{"t":"المسبح","p":18},{"t":"المطعم","p":14},{"t":"الواي فاي","p":10},{"t":"خدمة الغرف","p":8}]},
  {id:239,q:"اذكر شيء يوجد في محل العطور",a:[{"t":"عطور متنوعة","p":28},{"t":"البخور","p":22},{"t":"دهن العود","p":18},{"t":"العود الخام","p":14},{"t":"المعمول","p":10},{"t":"علب الهدايا","p":8}]},
  {id:240,q:"اذكر نوع تمر سعودي فاخر",a:[{"t":"السكري","p":30},{"t":"العجوة المدني","p":25},{"t":"الخلاص","p":18},{"t":"الصقعي","p":12},{"t":"المجدول","p":10},{"t":"نبتة علي","p":5}]},
  {id:241,q:"اذكر شيء يميز الشخص الناجح",a:[{"t":"الاجتهاد والعمل الجاد","p":28},{"t":"الصبر وعدم الاستسلام","p":22},{"t":"التخطيط الجيد","p":18},{"t":"حب القراءة والتعلم","p":14},{"t":"الثقة بالنفس","p":10},{"t":"تنظيم الوقت","p":8}]},
  {id:242,q:"اذكر شيء الناس تنساه كثير",a:[{"t":"شحن الجوال","p":28},{"t":"شرب ماء كافي","p":22},{"t":"تجديد الاشتراكات","p":18},{"t":"أخذ الدواء","p":14},{"t":"المفتاح داخل البيت","p":10},{"t":"الرد على رسالة","p":8}]},
  {id:243,q:"اذكر شيء يوجد في الحافلة",a:[{"t":"مقاعد الركاب","p":28},{"t":"السائق","p":22},{"t":"التكييف","p":18},{"t":"الشبابيك","p":14},{"t":"الباب الأمامي والخلفي","p":10},{"t":"ماسكات اليد","p":8}]},
  {id:244,q:"اذكر شيء يوزعونه في الأعراس",a:[{"t":"شوكولاتة فاخرة","p":28},{"t":"عصيرات ومشروبات","p":22},{"t":"تمر وقهوة","p":18},{"t":"البخور والعود","p":14},{"t":"الورد الطبيعي","p":10},{"t":"علب الهدايا","p":8}]},
  {id:245,q:"اذكر شيء يشتريه العريس للزواج",a:[{"t":"شبكة ذهب","p":28},{"t":"تجهيز البيت","p":22},{"t":"سيارة","p":18},{"t":"أثاث ومفروشات","p":14},{"t":"ملابس الزواج","p":10},{"t":"العطور والهدايا","p":8}]},
  {id:246,q:"اذكر شيء تسويه في نهاية الأسبوع",a:[{"t":"تنام وترتاح","p":28},{"t":"تطلع مع الأهل أو الأصدقاء","p":22},{"t":"تروح مطعم أو كافيه","p":18},{"t":"تنظف البيت","p":14},{"t":"تزور الأهل","p":10},{"t":"تتسوق","p":8}]},
  {id:247,q:"اذكر شيء تشتريه أونلاين",a:[{"t":"ملابس وأحذية","p":28},{"t":"إلكترونيات وأجهزة","p":22},{"t":"أكل وتوصيل","p":18},{"t":"كتب ومستلزمات","p":14},{"t":"مستحضرات تجميل","p":10},{"t":"أثاث ومفروشات","p":8}]},
  {id:248,q:"اذكر شيء يوجد في كل حفلة",a:[{"t":"الأكل والحلويات","p":28},{"t":"الناس والمدعوين","p":22},{"t":"الأغاني والموسيقى","p":18},{"t":"الكيكة","p":14},{"t":"التصوير","p":10},{"t":"الزينة والبالونات","p":8}]},
  {id:249,q:"اذكر شيء يتعلمه الطفل أول شيء",a:[{"t":"المشي","p":28},{"t":"الكلام","p":25},{"t":"الأكل بنفسه","p":18},{"t":"معرفة الألوان","p":14},{"t":"الأرقام والحروف","p":10},{"t":"اسم ماما وبابا","p":5}]},
  {id:250,q:"اذكر شيء يوجد في الشاطئ",a:[{"t":"الرمل","p":28},{"t":"ماء البحر","p":25},{"t":"الشمسية","p":18},{"t":"الناس والعائلات","p":14},{"t":"الأصداف","p":10},{"t":"كراسي الشاطئ","p":5}]},
  {id:251,q:"اذكر شيء يوجد في قاعة الأفراح",a:[{"t":"الكوشة","p":28},{"t":"المدعوين","p":22},{"t":"بوفيه الأكل","p":18},{"t":"الموسيقى أو المنشد","p":14},{"t":"الورد والزينة","p":10},{"t":"المصور","p":8}]},
  {id:252,q:"اذكر شيء تسويه صباح يوم العيد",a:[{"t":"صلاة العيد","p":30},{"t":"لبس ملابس جديدة","p":22},{"t":"معايدة الأهل","p":18},{"t":"الفطور الجماعي","p":14},{"t":"توزيع العيديات","p":10},{"t":"التصوير","p":6}]},
  {id:253,q:"اذكر شيء تسويه قبل الاختبار",a:[{"t":"مذاكرة ومراجعة","p":30},{"t":"الدعاء والتوكل على الله","p":22},{"t":"النوم بدري","p":18},{"t":"مراجعة الملخصات","p":14},{"t":"شرب قهوة للتركيز","p":10},{"t":"تجهيز الأدوات","p":6}]},
  {id:254,q:"اذكر سبب يخلّي الناس تفقد أعصابها",a:[{"t":"الزحمة الشديدة","p":28},{"t":"الظلم","p":22},{"t":"الإزعاج المتكرر","p":18},{"t":"الانتظار الطويل","p":14},{"t":"الجوع الشديد","p":10},{"t":"قلة النوم","p":8}]},
  {id:255,q:"اذكر شيء تحبه الأمهات",a:[{"t":"سعادة أطفالها","p":30},{"t":"الهدوء وراحة البال","p":22},{"t":"نظافة وترتيب البيت","p":18},{"t":"الطبخ لعائلتها","p":14},{"t":"زيارة الأقارب","p":10},{"t":"الاهتمام من أبنائها","p":6}]},
  {id:256,q:"اذكر شيء يخلّيك سعيد في عملك",a:[{"t":"الراتب المجزي","p":28},{"t":"الزملاء الطيبين","p":22},{"t":"التقدير من المدير","p":18},{"t":"الإنجاز","p":14},{"t":"المرونة في الدوام","p":10},{"t":"الإجازات","p":8}]},
  {id:257,q:"اذكر شيء تسويه أول يوم في السنة الجديدة",a:[{"t":"تحط أهداف جديدة","p":28},{"t":"تعايد الأهل والأصدقاء","p":22},{"t":"تسافر أو تتنزه","p":18},{"t":"تتفاءل وتتحمس","p":14},{"t":"تزور الأهل","p":10},{"t":"ترتاح وتستمتع","p":8}]},
  {id:258,q:"اذكر شيء يخلّيك تحس بالغيرة",a:[{"t":"نجاح صديقك المفاجئ","p":28},{"t":"شراء قريبك سيارة جديدة","p":22},{"t":"ترقية زميلك بالشغل","p":18},{"t":"مقارنة الأهل بغيرك","p":14},{"t":"سفر أحد وانت ما تقدر","p":10},{"t":"حظ شخص ثاني","p":8}]},
  {id:259,q:"اذكر سبب يخلّي الصداقة تنتهي",a:[{"t":"الخيانة وكشف الأسرار","p":28},{"t":"الكذب المتكرر","p":22},{"t":"الغيرة والحسد","p":18},{"t":"البعد وقلة التواصل","p":14},{"t":"سوء الفهم","p":10},{"t":"المصالح الشخصية","p":8}]},
  {id:260,q:"اذكر شيء يقوله الشخص وقت الصلح بعد خناقة",a:[{"t":"سامحني","p":30},{"t":"ما قصدت أجرحك","p":22},{"t":"خلاص نسينا اللي صار","p":18},{"t":"أنا غلطان","p":14},{"t":"تعال نبدأ من جديد","p":10},{"t":"أنا مشتاق لك","p":6}]},
  {id:261,q:"اذكر شيء تسويه لصديقك وهو مريض",a:[{"t":"تزوره","p":30},{"t":"تتصل تطمن عليه","p":22},{"t":"توصله أكل أو فواكه","p":18},{"t":"تدعي له","p":14},{"t":"تساعده بأغراضه","p":10},{"t":"تجلس معه يسولف","p":6}]},
  {id:262,q:"اذكر سبب شائع يخلّي الزوجين يتخانقون",a:[{"t":"سوء التفاهم","p":28},{"t":"المصاريف والفلوس","p":22},{"t":"تربية الأولاد","p":18},{"t":"قلة الوقت مع بعض","p":14},{"t":"تدخل الأهل","p":10},{"t":"الغيرة","p":8}]},
  {id:263,q:"اذكر شيء يفرح فيه الجد أو الجدة",a:[{"t":"زيارة الأحفاد","p":30},{"t":"لمّة العائلة","p":22},{"t":"سماع خبر مولود جديد","p":18},{"t":"اتصال الأبناء عليهم","p":14},{"t":"تخرج أحد أحفادهم","p":10},{"t":"عيدية يوزعونها","p":6}]},
  {id:264,q:"اذكر شيء يميز الأخ الكبير في العائلة",a:[{"t":"يحس بمسؤولية أكبر","p":28},{"t":"يوجّه إخوانه الصغار","p":22},{"t":"يشيل هم البيت أحياناً","p":18},{"t":"قدوة لإخوانه","p":14},{"t":"أول من يجرب كل شيء","p":10},{"t":"يدافع عن إخوانه","p":8}]},
  {id:265,q:"اذكر سبب يخلّي الشخص يعتذر",a:[{"t":"جرح مشاعر حد","p":28},{"t":"التأخير عن موعد","p":22},{"t":"الغلط بالشغل","p":18},{"t":"نسيان مناسبة مهمة","p":14},{"t":"كلام قاله بدون قصد","p":10},{"t":"خطأ بسيط","p":8}]},
  {id:266,q:"اذكر شيء تسويه أول ما توصل بيت أحد لأول مرة",a:[{"t":"تسلم على الجميع","p":30},{"t":"تخلع حذاءك","p":22},{"t":"تمدح البيت","p":18},{"t":"تجيب هدية بسيطة","p":14},{"t":"تسأل وين تقعد","p":10},{"t":"تشكرهم على الدعوة","p":6}]},
  {id:267,q:"اذكر شيء يدل إن الشخص كذاب",a:[{"t":"كلامه يتغير كل مرة","p":28},{"t":"يتجنب النظر بعينك","p":22},{"t":"يتلخبط وهو يحكي","p":18},{"t":"تفاصيل قصته ما تتطابق","p":14},{"t":"يتهرب من الأسئلة","p":10},{"t":"أصدقاؤه يكذبون معه","p":8}]},
  {id:268,q:"اذكر شيء يسويه الشخص عشان يسعد شريك حياته",a:[{"t":"يسمع له ويهتم فيه","p":28},{"t":"يفاجئه بهدية","p":22},{"t":"يقضي وقت معه","p":18},{"t":"يساعده بأعمال البيت","p":14},{"t":"يمدحه ويشجعه","p":10},{"t":"يخرج معه بروقة","p":8}]},
  {id:269,q:"اذكر سبب يخلّي الأصدقاء يتباعدون مع الوقت",a:[{"t":"الانشغال بالشغل والعائلة","p":28},{"t":"تغيّر الاهتمامات","p":22},{"t":"الزواج وتغيّر الأولويات","p":18},{"t":"السفر والانتقال","p":14},{"t":"قلة المناسبات المشتركة","p":10},{"t":"خلاف بسيط ما انحل","p":8}]},
  {id:270,q:"اذكر أكلة إيطالية مشهورة",a:[{"t":"البيتزا","p":32},{"t":"الباستا","p":28},{"t":"اللازانيا","p":18},{"t":"الريزوتو","p":12},{"t":"التيراميسو","p":6},{"t":"البروسكيوتو","p":4}]},
  {id:271,q:"اذكر أكلة مكسيكية مشهورة",a:[{"t":"التاكو","p":32},{"t":"البوريتو","p":26},{"t":"الناتشوز","p":18},{"t":"الكيساديا","p":14},{"t":"الجواكامولي","p":6},{"t":"الفاهيتا","p":4}]},
  {id:272,q:"اذكر أكلة آسيوية مشهورة",a:[{"t":"السوشي","p":30},{"t":"النودلز","p":24},{"t":"الرامن","p":18},{"t":"الكاري","p":14},{"t":"الدمبلينج","p":8},{"t":"سبرينج رول","p":6}]},
  {id:273,q:"اذكر نوع سلطة مشهورة",a:[{"t":"سلطة سيزر","p":28},{"t":"التبولة","p":25},{"t":"الفتوش","p":20},{"t":"سلطة الزبادي بالخيار","p":14},{"t":"سلطة الجرجير","p":8},{"t":"سلطة الكينوا","p":5}]},
  {id:274,q:"اذكر نوع شوربة مشهورة",a:[{"t":"شوربة العدس","p":30},{"t":"شوربة الخضار","p":22},{"t":"شوربة الدجاج","p":20},{"t":"شوربة الطماطم","p":14},{"t":"شوربة الفطر","p":8},{"t":"شوربة الشعيرية","p":6}]},
  {id:275,q:"اذكر حلا غربي مشهور",a:[{"t":"الكيك","p":28},{"t":"الدونات","p":22},{"t":"البراوني","p":18},{"t":"الكوكيز","p":14},{"t":"الآيس كريم","p":12},{"t":"الوافل","p":6}]},
  {id:276,q:"اذكر نوع فطور غربي",a:[{"t":"البان كيك","p":28},{"t":"البيض والبيكون","p":24},{"t":"الوافل","p":18},{"t":"حبوب الفطور (السيريال)","p":14},{"t":"التوست بالمربى","p":10},{"t":"العصير الطازج","p":6}]},
  {id:277,q:"اذكر مكوّن أساسي في الكبسة",a:[{"t":"الأرز","p":30},{"t":"اللحم أو الدجاج","p":26},{"t":"البهارات المشكّلة","p":18},{"t":"البصل","p":12},{"t":"الطماطم","p":8},{"t":"الزعفران","p":6}]},
  {id:278,q:"اذكر نوع أرز يُستخدم بالطبخ",a:[{"t":"البسمتي","p":35},{"t":"المصري","p":22},{"t":"الينابيش","p":16},{"t":"الأرز الأسمر","p":12},{"t":"الجاسمين","p":9},{"t":"الأرز المصري القصير","p":6}]},
  {id:279,q:"اذكر أكلة بحرية مشهورة",a:[{"t":"السمك المشوي","p":28},{"t":"الروبيان المقلي","p":24},{"t":"الكبسة بالسمك","p":18},{"t":"المحار","p":14},{"t":"الجمبري","p":10},{"t":"الكابوريا","p":6}]},
  {id:280,q:"اذكر مشروب غازي مشهور",a:[{"t":"بيبسي","p":30},{"t":"كولا","p":26},{"t":"سفن أب","p":18},{"t":"فانتا","p":14},{"t":"ميرندا","p":8},{"t":"سبرايت","p":4}]},
  {id:281,q:"اذكر نوع حلاوة أو سكاكر يحبها الأطفال",a:[{"t":"الشوكولاتة","p":30},{"t":"السكاكر الملونة","p":24},{"t":"الحلقوم","p":18},{"t":"العلكة","p":16},{"t":"المصاصة (اللولي بوب)","p":12}]},
  {id:282,q:"اذكر شيء يُضاف للقهوة العادية (غير العربية)",a:[{"t":"الحليب","p":30},{"t":"السكر","p":26},{"t":"الكريمة","p":18},{"t":"الكراميل","p":12},{"t":"القرفة","p":8},{"t":"الفانيليا","p":6}]},
  {id:283,q:"اذكر نوع فطيرة أو معجنات مشهورة",a:[{"t":"الفطائر بالجبن","p":28},{"t":"السمبوسة","p":24},{"t":"الكرواسون","p":18},{"t":"فطيرة السبانخ","p":14},{"t":"البيتزا الصغيرة","p":10},{"t":"الكيش","p":6}]},
  {id:284,q:"اذكر أكلة يحبها أغلب الأطفال",a:[{"t":"البيتزا","p":28},{"t":"البرجر","p":24},{"t":"الدجاج المقلي","p":18},{"t":"المكرونة بالجبن","p":14},{"t":"الناجتس","p":10},{"t":"البطاطس المقلية","p":6}]},
  {id:285,q:"اذكر نوع توابل تدخل في الأكلات الهندية",a:[{"t":"الكاري","p":30},{"t":"الكركم","p":24},{"t":"الكزبرة","p":16},{"t":"الهيل","p":12},{"t":"الفلفل الحار","p":10},{"t":"الكمون","p":8}]},
  {id:286,q:"اذكر مشروب يُقدّم في المناسبات السعودية",a:[{"t":"القهوة العربية","p":32},{"t":"الشاي بالحليب","p":22},{"t":"عصير الليمون بالنعناع","p":18},{"t":"القهوة التركية","p":14},{"t":"السحلب","p":8},{"t":"عصير التمر هندي","p":6}]},
  {id:287,q:"اذكر أكلة شعبية مصرية",a:[{"t":"الكشري","p":30},{"t":"الفول والطعمية","p":24},{"t":"الملوخية","p":18},{"t":"المحشي","p":14},{"t":"الحمام المحشي","p":8},{"t":"البصارة","p":6}]},
  {id:288,q:"اذكر أكلة شعبية شامية (سوريا/لبنان)",a:[{"t":"الحمص","p":26},{"t":"الفتوش","p":22},{"t":"الكبة","p":20},{"t":"الشاورما","p":16},{"t":"المجدرة","p":10},{"t":"الورق عنب","p":6}]},
  {id:289,q:"اذكر أكلة شعبية يمنية",a:[{"t":"المندي اليمني","p":30},{"t":"السلتة","p":24},{"t":"الفحسة","p":18},{"t":"العصيد","p":14},{"t":"الشفوت","p":8},{"t":"البنت الصحن","p":6}]},
  {id:290,q:"اذكر اسم ملعب كرة قدم مشهور",a:[{"t":"ملعب الملك فهد الدولي","p":28},{"t":"سانتياغو برنابيو","p":22},{"t":"كامب نو","p":18},{"t":"أولد ترافورد","p":14},{"t":"ملعب لوسيل","p":10},{"t":"ملعب ويمبلي","p":8}]},
  {id:291,q:"اذكر منصب أو مركز في كرة القدم",a:[{"t":"مهاجم","p":28},{"t":"حارس مرمى","p":25},{"t":"مدافع","p":20},{"t":"لاعب وسط","p":18},{"t":"ظهير","p":9}]},
  {id:292,q:"اذكر لقب بطولة كأس آسيا للأندية أو المنتخبات",a:[{"t":"كأس آسيا","p":35},{"t":"دوري أبطال آسيا","p":30},{"t":"كأس الخليج","p":20},{"t":"كأس العرب","p":15}]},
  {id:293,q:"اذكر شيء يستخدمه لاعب التنس",a:[{"t":"المضرب","p":30},{"t":"الكرة","p":25},{"t":"الشبكة","p":18},{"t":"الملعب المرسوم","p":14},{"t":"الحذاء الرياضي","p":8},{"t":"الحكم","p":5}]},
  {id:294,q:"اذكر رياضة أولمبية مشهورة",a:[{"t":"العدو والجري","p":26},{"t":"السباحة","p":22},{"t":"الجمباز","p":18},{"t":"رفع الأثقال","p":14},{"t":"الجودو","p":10},{"t":"رمي الجُلة","p":10}]},
  {id:295,q:"اذكر مدرب كرة قدم عالمي مشهور",a:[{"t":"بيب غوارديولا","p":28},{"t":"يورغن كلوب","p":22},{"t":"كارلو أنشيلوتي","p":18},{"t":"خوسيه مورينيو","p":16},{"t":"زين الدين زيدان","p":10},{"t":"أنشيلوتي","p":6}]},
  {id:296,q:"اذكر شيء يحدث لو الفريق فاز ببطولة",a:[{"t":"احتفال الجماهير","p":30},{"t":"رفع الكأس","p":25},{"t":"توزيع الميداليات","p":18},{"t":"مسيرة احتفالية","p":14},{"t":"مؤتمر صحفي","p":8},{"t":"مكافآت للاعبين","p":5}]},
  {id:297,q:"اذكر لعبة رياضية تُلعب بالأيدي فقط",a:[{"t":"كرة اليد","p":30},{"t":"كرة السلة","p":25},{"t":"الكرة الطائرة","p":22},{"t":"البولينغ","p":13},{"t":"الرماية","p":10}]},
  {id:298,q:"اذكر اسم بطل عالمي بالفنون القتالية أو الملاكمة",a:[{"t":"محمد علي كلاي","p":30},{"t":"مايك تايسون","p":25},{"t":"خبيب نورمحمدوف","p":20},{"t":"كونور ماكريغور","p":15},{"t":"مانى باكياو","p":10}]},
  {id:299,q:"اذكر شيء يحتاجه لاعب الغطس",a:[{"t":"أنبوب التنفس","p":28},{"t":"النظارة","p":24},{"t":"الزعانف","p":20},{"t":"بدلة الغوص","p":16},{"t":"أسطوانة الأكسجين","p":12}]},
  {id:300,q:"اذكر رياضة يمارسها الناس بالنادي الرياضي (الجيم)",a:[{"t":"رفع الأثقال","p":30},{"t":"الجري على المشاية","p":24},{"t":"تمارين الكارديو","p":18},{"t":"اليوغا","p":14},{"t":"السباحة","p":8},{"t":"الملاكمة","p":6}]},
  {id:301,q:"اذكر اسم مسابقة رياضية سعودية كبرى",a:[{"t":"دوري روشن السعودي","p":30},{"t":"كأس ولي العهد","p":24},{"t":"كأس الملك","p":22},{"t":"موسم الرياض للرياضة","p":14},{"t":"رالي داكار السعودية","p":10}]},
  {id:302,q:"اذكر دولة تشتهر بصناعة السيارات",a:[{"t":"اليابان","p":26},{"t":"ألمانيا","p":24},{"t":"كوريا الجنوبية","p":18},{"t":"أمريكا","p":16},{"t":"إيطاليا","p":10},{"t":"فرنسا","p":6}]},
  {id:303,q:"اذكر مدينة تشتهر بالأزياء والموضة",a:[{"t":"باريس","p":30},{"t":"ميلانو","p":24},{"t":"نيويورك","p":20},{"t":"لندن","p":16},{"t":"دبي","p":10}]},
  {id:304,q:"اذكر دولة تشتهر بالشاي",a:[{"t":"الصين","p":28},{"t":"الهند","p":26},{"t":"سريلانكا","p":20},{"t":"تركيا","p":14},{"t":"بريطانيا","p":8},{"t":"اليابان","p":4}]},
  {id:305,q:"اذكر دولة باردة معروفة بالثلوج",a:[{"t":"روسيا","p":26},{"t":"كندا","p":24},{"t":"السويد","p":18},{"t":"النرويج","p":16},{"t":"فنلندا","p":10},{"t":"سويسرا","p":6}]},
  {id:306,q:"اذكر جزيرة مشهورة في العالم",a:[{"t":"جزر المالديف","p":26},{"t":"بالي","p":22},{"t":"هاواي","p":18},{"t":"سيشل","p":14},{"t":"جزيرة سنتوريني","p":12},{"t":"جزيرة فرسان","p":8}]},
  {id:307,q:"اذكر عملة أجنبية مشهورة",a:[{"t":"الدولار الأمريكي","p":32},{"t":"اليورو","p":26},{"t":"الجنيه الإسترليني","p":18},{"t":"الين الياباني","p":12},{"t":"اليوان الصيني","p":8},{"t":"الفرنك السويسري","p":4}]},
  {id:308,q:"اذكر معلم سياحي عالمي مشهور",a:[{"t":"برج إيفل","p":26},{"t":"تمثال الحرية","p":20},{"t":"برج بيزا المائل","p":16},{"t":"سور الصين العظيم","p":16},{"t":"تاج محل","p":12},{"t":"أهرامات الجيزة","p":10}]},
  {id:309,q:"اذكر دولة عربية تطل على البحر المتوسط",a:[{"t":"مصر","p":26},{"t":"لبنان","p":22},{"t":"سوريا","p":18},{"t":"ليبيا","p":16},{"t":"المغرب","p":10},{"t":"الجزائر","p":8}]},
  {id:310,q:"اذكر مدينة سعودية غير الرياض وجدة ومكة والمدينة",a:[{"t":"الدمام","p":26},{"t":"الطائف","p":22},{"t":"أبها","p":18},{"t":"تبوك","p":14},{"t":"الأحساء","p":12},{"t":"حائل","p":8}]},
  {id:311,q:"اذكر محافظة أو مدينة سعودية تشتهر بالمرتفعات والجو البارد",a:[{"t":"أبها","p":30},{"t":"الطائف","p":26},{"t":"الباحة","p":20},{"t":"خميس مشيط","p":14},{"t":"النماص","p":10}]},
  {id:312,q:"اذكر شيء يميز جو المباراة في الملعب",a:[{"t":"هتاف الجماهير","p":30},{"t":"أعلام وألوان الفريق","p":22},{"t":"صافرة الحكم","p":18},{"t":"الطبول والأهازيج","p":14},{"t":"صوت المعلق","p":10},{"t":"الأنوار والشاشات","p":6}]},
  {id:313,q:"اذكر مضيق أو ممر مائي مشهور",a:[{"t":"مضيق هرمز","p":30},{"t":"قناة السويس","p":26},{"t":"مضيق جبل طارق","p":18},{"t":"قناة بنما","p":16},{"t":"مضيق البسفور","p":10}]},
  {id:314,q:"اذكر سوق شعبي أو تراثي مشهور بالسعودية",a:[{"t":"سوق الزل بالرياض","p":26},{"t":"سوق قيصرية بأبها","p":22},{"t":"البلد بجدة التاريخية","p":22},{"t":"سوق المجلز","p":16},{"t":"سوق حراج","p":14}]},
  {id:315,q:"اذكر مهرجان أو موسم سعودي مشهور",a:[{"t":"موسم الرياض","p":30},{"t":"مهرجان الجنادرية","p":24},{"t":"موسم جدة","p":20},{"t":"مهرجان طنطورة بالعلا","p":16},{"t":"موسم أبها","p":10}]},
  {id:316,q:"اذكر لعبة تراثية سعودية قديمة",a:[{"t":"العرضة السعودية","p":26},{"t":"الصقالة","p":18},{"t":"الطاق","p":18},{"t":"لعبة السيجا","p":14},{"t":"الحجلة","p":14},{"t":"الدحّيّة","p":10}]},
  {id:317,q:"اذكر مشروب تراثي سعودي غير القهوة والشاي",a:[{"t":"السحلب","p":28},{"t":"القرفة بالحليب","p":24},{"t":"الحلبة","p":20},{"t":"الكركديه","p":16},{"t":"اليانسون","p":12}]},
  {id:318,q:"اذكر لباس تراثي نسائي خليجي",a:[{"t":"العباية","p":32},{"t":"البخنق","p":20},{"t":"الثوب النشل","p":18},{"t":"الشيلة","p":18},{"t":"البرقع التقليدي","p":12}]},
  {id:319,q:"اذكر حرفة يدوية تراثية سعودية",a:[{"t":"السدو","p":28},{"t":"صناعة الفخار","p":22},{"t":"الخوص وصناعة السلال","p":18},{"t":"النقش على الخشب","p":16},{"t":"الحياكة والتطريز","p":16}]},
  {id:320,q:"اذكر مناسبة وطنية سعودية",a:[{"t":"اليوم الوطني","p":35},{"t":"يوم التأسيس","p":28},{"t":"يوم العلم","p":20},{"t":"ذكرى البيعة","p":17}]},
  {id:321,q:"اذكر اسم متحف أو معلم ثقافي سعودي",a:[{"t":"المتحف الوطني بالرياض","p":28},{"t":"مركز إثراء","p":26},{"t":"قصر المصمك","p":22},{"t":"متحف العلا","p":14},{"t":"متحف التراث بجدة","p":10}]},
  {id:322,q:"اذكر شيء يميز اللهجة النجدية أو الحجازية",a:[{"t":"طريقة نطق بعض الحروف","p":30},{"t":"كلمات محلية خاصة","p":26},{"t":"التعبيرات الشعبية","p":24},{"t":"نبرة الكلام","p":20}]},
  {id:323,q:"اذكر أكلة يقدمها الأهل بالقصيم أو نجد تحديداً",a:[{"t":"المرقوق","p":30},{"t":"الجريش","p":24},{"t":"القرصان","p":22},{"t":"العصيدة","p":14},{"t":"المفروكة","p":10}]},
  {id:324,q:"اذكر ملك من ملوك السعودية",a:[{"t":"الملك عبدالعزيز","p":28},{"t":"الملك سلمان","p":24},{"t":"الملك فهد","p":18},{"t":"الملك عبدالله","p":16},{"t":"الملك خالد","p":8},{"t":"الملك فيصل","p":6}]},
  {id:325,q:"اذكر مخترع مشهور غيّر التاريخ",a:[{"t":"توماس إديسون","p":26},{"t":"ألكسندر غراهام بيل","p":22},{"t":"الأخوان رايت","p":18},{"t":"نيكولا تسلا","p":16},{"t":"هنري فورد","p":10},{"t":"ستيف جوبز","p":8}]},
  {id:326,q:"اذكر عالم مسلم أسهم في العلوم",a:[{"t":"ابن سينا","p":26},{"t":"الخوارزمي","p":24},{"t":"ابن الهيثم","p":20},{"t":"جابر بن حيان","p":16},{"t":"الرازي","p":14}]},
  {id:327,q:"اذكر قائد أو فاتح إسلامي مشهور",a:[{"t":"خالد بن الوليد","p":28},{"t":"صلاح الدين الأيوبي","p":26},{"t":"طارق بن زياد","p":20},{"t":"عقبة بن نافع","p":14},{"t":"محمد الفاتح","p":12}]},
  {id:328,q:"اذكر حضارة قديمة مشهورة",a:[{"t":"الحضارة الفرعونية","p":28},{"t":"الحضارة الرومانية","p":22},{"t":"الحضارة الإغريقية","p":18},{"t":"حضارة بابل","p":14},{"t":"حضارة الصين القديمة","p":10},{"t":"حضارة الإنكا","p":8}]},
  {id:329,q:"اذكر حدث تاريخي مهم بالقرن العشرين",a:[{"t":"الحرب العالمية الثانية","p":28},{"t":"هبوط الإنسان على القمر","p":24},{"t":"سقوط جدار برلين","p":18},{"t":"اكتشاف النفط بالسعودية","p":16},{"t":"الحرب العالمية الأولى","p":14}]},
  {id:330,q:"اذكر شيء يحتاجه رائد الفضاء",a:[{"t":"بدلة الفضاء","p":30},{"t":"خوذة خاصة","p":24},{"t":"أكسجين مضغوط","p":20},{"t":"مركبة فضائية","p":16},{"t":"طعام معلّب خاص","p":10}]},
  {id:331,q:"اذكر عالم فيزياء مشهور",a:[{"t":"ألبرت أينشتاين","p":32},{"t":"إسحاق نيوتن","p":26},{"t":"ستيفن هوكينغ","p":20},{"t":"نيكولا تسلا","p":14},{"t":"ماري كوري","p":8}]},
  {id:332,q:"اذكر شيء تدرسه في مادة الأحياء",a:[{"t":"الخلية","p":28},{"t":"جسم الإنسان","p":24},{"t":"النباتات","p":20},{"t":"الحيوانات","p":16},{"t":"الجينات والوراثة","p":12}]},
  {id:333,q:"اذكر ظاهرة فلكية يلاحظها الناس بالسماء",a:[{"t":"القمر بدر","p":28},{"t":"النجوم اللامعة","p":22},{"t":"الشهب","p":18},{"t":"كسوف الشمس","p":18},{"t":"خسوف القمر","p":14}]},
  {id:334,q:"اذكر حيوان مهدد بالانقراض",a:[{"t":"النمر","p":26},{"t":"وحيد القرن","p":22},{"t":"الباندا","p":20},{"t":"الفهد العربي","p":18},{"t":"الغوريلا","p":14}]},
  {id:335,q:"اذكر حيوان يعيش بمجموعات كبيرة",a:[{"t":"النمل","p":28},{"t":"النحل","p":26},{"t":"الذئاب","p":18},{"t":"الفيلة","p":14},{"t":"الطيور المهاجرة","p":14}]},
  {id:336,q:"اذكر حيوان له فرو سميك",a:[{"t":"الدب","p":28},{"t":"الأرنب","p":22},{"t":"الذئب","p":20},{"t":"القطة","p":16},{"t":"الخروف","p":14}]},
  {id:337,q:"اذكر حيوان يستطيع تسلق الأشجار",a:[{"t":"القرد","p":30},{"t":"السنجاب","p":26},{"t":"القطة","p":22},{"t":"الكوالا","p":14},{"t":"الثعبان","p":8}]},
  {id:338,q:"اذكر نبات يُزرع في البيوت للزينة",a:[{"t":"الصبار","p":26},{"t":"الورد","p":24},{"t":"الياسمين","p":18},{"t":"النعناع","p":16},{"t":"اللافندر","p":16}]},
  {id:339,q:"اذكر موسم يزهر فيه الطبيعة",a:[{"t":"الربيع","p":40},{"t":"بداية الشتاء بعد المطر","p":26},{"t":"الخريف بألوانه","p":22},{"t":"الصيف بالمناطق الجبلية","p":12}]},
  {id:340,q:"اذكر شيء يحدث وقت هطول المطر",a:[{"t":"رائحة التراب المميزة","p":28},{"t":"تجمع الماء بالشوارع","p":24},{"t":"قوس قزح بعده","p":20},{"t":"انخفاض الحرارة","p":16},{"t":"زحمة السيارات","p":12}]},
  {id:341,q:"اذكر شيء يوجد في حقيبة الطالب",a:[{"t":"الكتب والدفاتر","p":28},{"t":"الأقلام","p":24},{"t":"المبراة والممحاة","p":18},{"t":"علبة الفطور","p":16},{"t":"المسطرة","p":14}]},
  {id:342,q:"اذكر شيء يصير بحفل التخرج",a:[{"t":"توزيع الشهادات","p":30},{"t":"التصوير مع الأصدقاء","p":24},{"t":"كلمة الخريجين","p":18},{"t":"رمي القبعات","p":16},{"t":"تكريم الأوائل","p":12}]},
  {id:343,q:"اذكر مادة جامعية صعبة على أغلب الطلاب",a:[{"t":"الرياضيات","p":28},{"t":"الفيزياء","p":24},{"t":"الكيمياء","p":20},{"t":"الإحصاء","p":16},{"t":"البرمجة","p":12}]},
  {id:344,q:"اذكر شيء يحتاجه الطالب وقت الاختبارات",a:[{"t":"التركيز","p":26},{"t":"المذاكرة المبكرة","p":24},{"t":"قهوة أو مشروب طاقة","p":20},{"t":"النوم الكافي","p":18},{"t":"جو هادئ","p":12}]},
  {id:345,q:"اذكر تخصص جامعي مطلوب بسوق العمل",a:[{"t":"الطب","p":26},{"t":"الهندسة","p":24},{"t":"تقنية المعلومات","p":22},{"t":"إدارة الأعمال","p":16},{"t":"المحاسبة","p":12}]},
  {id:346,q:"اذكر شيء يميز بيئة العمل الجيدة",a:[{"t":"احترام الموظفين","p":28},{"t":"راتب عادل","p":24},{"t":"فرص تطوير","p":18},{"t":"توازن بين العمل والحياة","p":16},{"t":"مدير متفهم","p":14}]},
  {id:347,q:"اذكر مهنة تعتمد على التواصل مع الناس",a:[{"t":"المبيعات","p":26},{"t":"خدمة العملاء","p":24},{"t":"التسويق","p":20},{"t":"الصحافة والإعلام","p":18},{"t":"الضيافة والسياحة","p":12}]},
  {id:348,q:"اذكر شيء يسبب ضغط العمل",a:[{"t":"كثرة المهام","p":28},{"t":"قرب المواعيد النهائية","p":24},{"t":"قلة الموظفين","p":18},{"t":"توقعات عالية من المدير","p":16},{"t":"اجتماعات كثيرة","p":14}]},
  {id:349,q:"اذكر مهنة يدوية أو حرفية",a:[{"t":"النجار","p":26},{"t":"الكهربائي","p":24},{"t":"السباك","p":20},{"t":"الميكانيكي","p":18},{"t":"الخياط","p":12}]},
  {id:350,q:"اذكر شيء يقيّم فيه الموظف بالعمل",a:[{"t":"الالتزام بالدوام","p":26},{"t":"جودة الإنجاز","p":24},{"t":"العمل الجماعي","p":18},{"t":"الانضباط","p":16},{"t":"المبادرة","p":16}]},
  {id:351,q:"اذكر تمرين رياضي شائع",a:[{"t":"المشي","p":28},{"t":"الجري","p":24},{"t":"تمارين البطن","p":18},{"t":"الضغط (بوش أب)","p":16},{"t":"السكوات","p":14}]},
  {id:352,q:"اذكر سبب يخلّي الشخص يكسب وزن زيادة",a:[{"t":"الأكل الزائد","p":28},{"t":"قلة الحركة","p":24},{"t":"الوجبات السريعة","p":20},{"t":"السهر وقلة النوم","p":16},{"t":"التوتر","p":12}]},
  {id:353,q:"اذكر عادة صحية يوصي فيها الأطباء",a:[{"t":"شرب ماء كافي","p":28},{"t":"النوم المبكر","p":24},{"t":"تقليل السكر والملح","p":20},{"t":"ممارسة الرياضة بانتظام","p":16},{"t":"الفحص الدوري","p":12}]},
  {id:354,q:"اذكر شيء يساعد على النوم الجيد",a:[{"t":"إطفاء الأنوار","p":26},{"t":"الابتعاد عن الجوال","p":24},{"t":"جو هادئ وبارد","p":20},{"t":"عدم شرب قهوة بالليل","p":18},{"t":"النوم بنفس الموعد يومياً","p":12}]},
  {id:355,q:"اذكر مرض شائع بفصل الشتاء",a:[{"t":"الزكام والإنفلونزا","p":35},{"t":"التهاب الحلق","p":26},{"t":"السعال","p":20},{"t":"الحساسية","p":12},{"t":"جفاف الجلد","p":7}]},
  {id:356,q:"اذكر شيء تفعله وأنت بالمطار قبل الرحلة",a:[{"t":"تسجيل الوصول","p":28},{"t":"فحص الجوازات","p":24},{"t":"انتظار الصعود للطائرة","p":20},{"t":"التسوق بالسوق الحرة","p":16},{"t":"شرب قهوة بمقهى المطار","p":12}]},
  {id:357,q:"اذكر مدينة سعودية فيها مطار دولي كبير",a:[{"t":"الرياض","p":30},{"t":"جدة","p":28},{"t":"الدمام","p":20},{"t":"المدينة المنورة","p":14},{"t":"أبها","p":8}]},
  {id:358,q:"اذكر شيء يميز السفر بالقطار",a:[{"t":"الراحة أثناء الرحلة","p":28},{"t":"مشاهدة المناظر بالطريق","p":24},{"t":"عدم وجود زحمة","p":22},{"t":"سرعة الوصول","p":16},{"t":"سعر مناسب","p":10}]},
  {id:359,q:"اذكر وسيلة مواصلات تستخدمها داخل المدينة",a:[{"t":"السيارة الخاصة","p":30},{"t":"التاكسي أو تطبيقات النقل","p":26},{"t":"الباص العام","p":20},{"t":"المترو","p":16},{"t":"الدراجة","p":8}]},
  {id:360,q:"اذكر شيء ضروري تجهزه قبل رحلة برية طويلة",a:[{"t":"تعبئة البنزين","p":28},{"t":"فحص إطارات السيارة","p":24},{"t":"خريطة أو تطبيق ملاحة","p":18},{"t":"أكل وماء بالسيارة","p":18},{"t":"شاحن السيارة","p":12}]},
  {id:361,q:"اذكر ممثل عربي مشهور",a:[{"t":"عادل إمام","p":26},{"t":"ناصر القصبي","p":22},{"t":"أحمد حلمي","p":20},{"t":"ياسر بكر","p":16},{"t":"كريم عبدالعزيز","p":16}]},
  {id:362,q:"اذكر ممثل عالمي مشهور",a:[{"t":"ليوناردو دي كابريو","p":26},{"t":"توم كروز","p":22},{"t":"دواين جونسون","p":20},{"t":"ويل سميث","p":18},{"t":"جوني ديب","p":14}]},
  {id:363,q:"اذكر فيلم كرتون مشهور لديزني أو بيكسار",a:[{"t":"الأسد الملك","p":26},{"t":"فروزن","p":24},{"t":"توي ستوري","p":20},{"t":"موانا","p":16},{"t":"علاء الدين","p":14}]},
  {id:364,q:"اذكر نوع أفلام يحبه الناس",a:[{"t":"أكشن","p":26},{"t":"كوميدي","p":24},{"t":"رعب","p":18},{"t":"رومانسي","p":16},{"t":"خيال علمي","p":16}]},
  {id:365,q:"اذكر مسلسل رمضاني عربي مشهور",a:[{"t":"مسلسل باب الحارة","p":26},{"t":"مسلسل الهيبة","p":22},{"t":"مسلسل سيلفي","p":20},{"t":"مسلسل خاتون","p":18},{"t":"مسلسل رشاش","p":14}]},
  {id:366,q:"اذكر مطرب أو مطربة عربية مشهورة",a:[{"t":"محمد عبده","p":24},{"t":"راشد الماجد","p":22},{"t":"أصالة","p":20},{"t":"حسين الجسمي","p":18},{"t":"طلال مداح","p":16}]},
  {id:367,q:"اذكر مول أو مركز تسوق سعودي مشهور",a:[{"t":"مول العرب","p":26},{"t":"الرياض بارك","p":24},{"t":"سيتي ووك جدة","p":20},{"t":"مول النخيل","p":16},{"t":"بوليفارد رياض سيتي","p":14}]},
  {id:368,q:"اذكر سبب يخلّي الشخص يوفر فلوسه",a:[{"t":"شراء بيت مستقبلاً","p":28},{"t":"الزواج","p":24},{"t":"الطوارئ","p":22},{"t":"السفر","p":14},{"t":"التقاعد","p":12}]},
  {id:369,q:"اذكر موسم تخفيضات معروف",a:[{"t":"الجمعة البيضاء","p":30},{"t":"نهاية الموسم","p":24},{"t":"العيد","p":20},{"t":"الصيف","p":16},{"t":"بداية السنة الدراسية","p":10}]},
  {id:370,q:"اذكر طريقة دفع يستخدمها الناس اليوم",a:[{"t":"البطاقة البنكية","p":28},{"t":"آبل باي أو الدفع الجوال","p":26},{"t":"الدفع عند الاستلام","p":18},{"t":"التحويل البنكي","p":16},{"t":"الكاش","p":12}]},
  {id:371,q:"اذكر سبب ارتفاع أسعار شيء",a:[{"t":"قلة العرض","p":26},{"t":"زيادة الطلب","p":24},{"t":"ارتفاع تكلفة الشحن","p":20},{"t":"التضخم","p":18},{"t":"المواسم والمناسبات","p":12}]},
  {id:372,q:"اذكر شيء تجهزه لاستقبال ضيوف",a:[{"t":"ترتيب البيت","p":28},{"t":"تجهيز القهوة والتمر","p":24},{"t":"تجهيز الأكل","p":22},{"t":"تعطير المجلس","p":14},{"t":"تجهيز مكان الجلوس","p":12}]},
  {id:373,q:"اذكر مناسبة تقدّم فيها هدايا",a:[{"t":"الزواج","p":26},{"t":"المولود الجديد","p":22},{"t":"العيد","p":20},{"t":"عيد الميلاد","p":18},{"t":"التخرج","p":14}]},
  {id:374,q:"اذكر شيء يميز حفلة عيد ميلاد",a:[{"t":"الكيكة والشموع","p":30},{"t":"الأغنية والتهنئة","p":24},{"t":"الهدايا","p":22},{"t":"البالونات والزينة","p":14},{"t":"دعوة الأصدقاء","p":10}]},
  {id:375,q:"اذكر شيء يحصل بمجلس العزاء",a:[{"t":"قراءة القرآن","p":30},{"t":"تعزية أهل المتوفى","p":26},{"t":"تقديم القهوة السادة","p":22},{"t":"الدعاء للمتوفى","p":22}]},
  {id:376,q:"اذكر شيء يميز عقد القران",a:[{"t":"توقيع العقد الشرعي","p":28},{"t":"حضور أهل الطرفين","p":24},{"t":"قراءة الفاتحة","p":22},{"t":"توزيع الحلويات","p":14},{"t":"تبادل الخواتم","p":12}]},
  {id:377,q:"اذكر جهاز ذكي منتشر بالبيوت الحديثة",a:[{"t":"مكبر صوت ذكي","p":26},{"t":"كاميرا مراقبة","p":24},{"t":"مصابيح ذكية","p":20},{"t":"ثرموستات ذكي","p":16},{"t":"روبوت تنظيف","p":14}]},
  {id:378,q:"اذكر أداة تستخدمها بالحديقة المنزلية",a:[{"t":"خرطوم الماء","p":28},{"t":"المقص","p":24},{"t":"الفأس الصغير","p":18},{"t":"القفازات","p":16},{"t":"الجاروف","p":14}]},
  {id:379,q:"اذكر شيء يوضع في غرفة الأطفال",a:[{"t":"السرير الصغير","p":28},{"t":"الألعاب","p":26},{"t":"الرسومات على الحائط","p":18},{"t":"خزانة الملابس","p":16},{"t":"مصباح ليلي","p":12}]},
  {id:380,q:"اذكر نوع دهان أو طلاء يستخدم بالمنزل",a:[{"t":"دهان الجدران","p":30},{"t":"دهان الأبواب","p":24},{"t":"الورق الجداري","p":22},{"t":"دهان السقف","p":14},{"t":"طلاء الأثاث","p":10}]},
  {id:381,q:"اذكر شيء تحتاجه وقت انقطاع الكهرباء",a:[{"t":"الشموع","p":28},{"t":"الكشاف أو الفانوس","p":26},{"t":"مولد كهرباء احتياطي","p":20},{"t":"بطارية محمولة","p":16},{"t":"جوال مشحون","p":10}]},
  {id:382,q:"اذكر شيء يحصل بالطقس الغبار",a:[{"t":"قلة الرؤية","p":30},{"t":"تهيج الحساسية","p":24},{"t":"إغلاق المدارس أحياناً","p":20},{"t":"تأخر الرحلات","p":16},{"t":"تلوث الهواء","p":10}]},
  {id:383,q:"اذكر شيء تحتاجه بيوم شديد الحرارة",a:[{"t":"الماء البارد","p":30},{"t":"المكيف","p":26},{"t":"الظل","p":18},{"t":"واقي الشمس","p":16},{"t":"ملابس خفيفة","p":10}]},
  {id:384,q:"اذكر ظاهرة جوية تحذر منها الأرصاد",a:[{"t":"السيول","p":30},{"t":"الغبار الكثيف","p":24},{"t":"الرياح الشديدة","p":22},{"t":"الصقيع","p":14},{"t":"الأمطار الغزيرة","p":10}]},
  {id:385,q:"اذكر لعبة ورق مشهورة",a:[{"t":"البلوت","p":30},{"t":"الطرنيب","p":24},{"t":"الكوتشينة","p":20},{"t":"الأونو","p":16},{"t":"البوكر","p":10}]},
  {id:386,q:"اذكر لعبة يلعبها الأطفال بالحديقة",a:[{"t":"الغميضة","p":28},{"t":"لعبة الكرة","p":24},{"t":"الحبل","p":18},{"t":"الشد والجذب","p":16},{"t":"الحجلة","p":14}]},
  {id:387,q:"اذكر لعبة لوحية (بورد قيم) مشهورة",a:[{"t":"المونوبولي","p":30},{"t":"الشطرنج","p":26},{"t":"الدومينو","p":20},{"t":"سكرابل","p":14},{"t":"الطاولة (البكجمون)","p":10}]},
  {id:388,q:"اذكر نوع نشاط عائلي بالمناسبات",a:[{"t":"لعب الورق سوا","p":26},{"t":"مشاهدة فيلم مع بعض","p":24},{"t":"السوالف والقعدة","p":22},{"t":"طبخ أكلة مع بعض","p":16},{"t":"لعبة جماعية","p":12}]},
  {id:389,q:"اذكر شيء يوجد في علبة الإسعافات الأولية",a:[{"t":"الشاش والضمادات","p":28},{"t":"المطهر","p":24},{"t":"اللاصق الطبي","p":20},{"t":"المقص الطبي","p":16},{"t":"الكمادات الباردة","p":12}]},
  {id:390,q:"اذكر شيء يستخدمه المصور المحترف",a:[{"t":"الكاميرا","p":30},{"t":"الحامل الثلاثي","p":24},{"t":"العدسات","p":22},{"t":"الإضاءة","p":14},{"t":"بطاقة الذاكرة","p":10}]},
  {id:391,q:"اذكر شيء يميز شخص كريم",a:[{"t":"يساعد المحتاجين","p":28},{"t":"يشارك أكله مع غيره","p":24},{"t":"يستضيف الناس بسخاء","p":22},{"t":"يعطي بدون مقابل","p":16},{"t":"يهتم بالفقراء","p":10}]},
  {id:392,q:"اذكر سبب يخلّي شخص يثق بغيره",a:[{"t":"الصدق بالتعامل","p":28},{"t":"الالتزام بالوعد","p":24},{"t":"حفظ الأسرار","p":22},{"t":"التصرف وقت الأزمات","p":14},{"t":"النصيحة الصادقة","p":12}]},
  {id:393,q:"اذكر شيء يميز القائد الناجح",a:[{"t":"اتخاذ القرار الصحيح","p":28},{"t":"الاستماع لفريقه","p":24},{"t":"تحمّل المسؤولية","p":20},{"t":"التحفيز والإلهام","p":16},{"t":"الرؤية الواضحة","p":12}]},
  {id:394,q:"اذكر شيء يجعل الاجتماع ناجح",a:[{"t":"جدول أعمال واضح","p":28},{"t":"الالتزام بالوقت","p":24},{"t":"مشاركة الجميع","p":20},{"t":"قرارات واضحة بالنهاية","p":16},{"t":"عدم الاستطراد","p":12}]},
  {id:395,q:"اذكر سبب يخلّي تطبيق جوال ينجح",a:[{"t":"سهولة الاستخدام","p":28},{"t":"سرعة الأداء","p":24},{"t":"تصميم جذاب","p":18},{"t":"خدمة عملاء ممتازة","p":16},{"t":"مميزات مفيدة","p":14}]},
  {id:396,q:"اذكر شيء يميز مدينة ذكية",a:[{"t":"كاميرات مراقبة ذكية","p":26},{"t":"مواصلات عامة متطورة","p":24},{"t":"خدمات حكومية إلكترونية","p":22},{"t":"طاقة نظيفة ومتجددة","p":16},{"t":"إنترنت عالي السرعة","p":12}]},
  {id:397,q:"اذكر شيء يستخدمه الطالب أثناء المحاضرة أونلاين",a:[{"t":"اللابتوب","p":30},{"t":"سماعات الرأس","p":24},{"t":"الكاميرا","p":20},{"t":"دفتر ملاحظات","p":16},{"t":"إنترنت مستقر","p":10}]},
  {id:398,q:"اذكر شيء يميز شخص متواضع",a:[{"t":"ما يتفاخر بإنجازاته","p":28},{"t":"يحترم الجميع بنفس الطريقة","p":26},{"t":"يقبل النقد بصدر رحب","p":20},{"t":"يساعد بدون منّة","p":16},{"t":"بسيط بتعامله","p":10}]},
  {id:399,q:"اذكر شيء يسبب إزعاج بمكان العمل",a:[{"t":"الضوضاء العالية","p":28},{"t":"زميل كثير الكلام","p":22},{"t":"اجتماعات كثيرة بدون فايدة","p":20},{"t":"مقاطعة مستمرة","p":16},{"t":"فوضى المكتب","p":14}]},
  {id:400,q:"اذكر شيء يميز فريق عمل ناجح",a:[{"t":"التعاون والتنسيق","p":28},{"t":"التواصل الواضح","p":24},{"t":"احترام الأدوار","p":18},{"t":"الثقة المتبادلة","p":16},{"t":"هدف مشترك","p":14}]},
  {id:401,q:"اذكر شيء يجذبك بإعلان تجاري",a:[{"t":"الموسيقى المميزة","p":26},{"t":"قصة مؤثرة","p":24},{"t":"عرض أو خصم","p":22},{"t":"مشاهير يظهرون فيه","p":16},{"t":"فكرة مبتكرة","p":12}]},
  {id:402,q:"اذكر شيء يميز متجر إلكتروني ناجح",a:[{"t":"سرعة التوصيل","p":28},{"t":"سياسة إرجاع سهلة","p":22},{"t":"أسعار منافسة","p":20},{"t":"تقييمات المنتجات","p":16},{"t":"خدمة عملاء سريعة","p":14}]},
  {id:403,q:"اذكر شيء يحدث بيوم الافتتاح لمتجر جديد",a:[{"t":"خصومات وعروض","p":30},{"t":"ازدحام الزبائن","p":24},{"t":"هدايا ترويجية","p":20},{"t":"قص الشريط","p":16},{"t":"موسيقى واحتفال","p":10}]},
  {id:404,q:"اذكر شيء يميز مطعم جيد",a:[{"t":"طعم الأكل","p":30},{"t":"سرعة التقديم","p":22},{"t":"نظافة المكان","p":20},{"t":"تعامل الموظفين","p":16},{"t":"الأسعار المناسبة","p":12}]},
  {id:405,q:"اذكر شيء يفعله النادل بالمطعم",a:[{"t":"يستقبل الزبائن","p":26},{"t":"يشرح قائمة الطعام","p":22},{"t":"يسجل الطلب","p":22},{"t":"يقدم الأكل","p":18},{"t":"يحسب الفاتورة","p":12}]},
  {id:406,q:"اذكر شيء يميّز فندق خمس نجوم",a:[{"t":"خدمة راقية","p":28},{"t":"غرف فاخرة","p":24},{"t":"مسبح وسبا","p":20},{"t":"مطاعم متنوعة","p":16},{"t":"موقع مميز","p":12}]},
  {id:407,q:"اذكر شيء تحتاجه لبدء مشروع تجاري صغير",a:[{"t":"رأس مال","p":28},{"t":"فكرة مشروع واضحة","p":24},{"t":"سجل تجاري","p":18},{"t":"دراسة جدوى","p":16},{"t":"مكان أو منصة للبيع","p":14}]},
  {id:408,q:"اذكر منصة تسوق إلكتروني مشهورة",a:[{"t":"أمازون","p":30},{"t":"نون","p":26},{"t":"علي إكسبرس","p":20},{"t":"شي إن","p":14},{"t":"إيباي","p":10}]},
  {id:409,q:"اذكر شيء يميز شخص عصبي المزاج",a:[{"t":"يغضب بسرعة","p":30},{"t":"يرفع صوته","p":24},{"t":"يفقد صبره بسهولة","p":22},{"t":"يندم بعد الغضب","p":14},{"t":"يتصرف باندفاع","p":10}]},
  {id:410,q:"اذكر شيء يهدّئ شخص غاضب",a:[{"t":"الكلام الهادئ","p":28},{"t":"إعطاءه وقت لحاله","p":24},{"t":"الاعتذار","p":20},{"t":"تغيير الموضوع","p":16},{"t":"كوب ماء بارد","p":12}]},
  {id:411,q:"اذكر شيء يميز شخص طموح",a:[{"t":"يحط أهداف واضحة","p":28},{"t":"يشتغل بجد","p":24},{"t":"ما يستسلم بسهولة","p":22},{"t":"يطور نفسه باستمرار","p":16},{"t":"يتعلم من فشله","p":10}]},
  {id:412,q:"اذكر شيء يعطيك إحساس بالإنجاز",a:[{"t":"إنهاء مشروع صعب","p":28},{"t":"تحقيق هدف طال انتظاره","p":24},{"t":"مساعدة شخص محتاج","p":20},{"t":"تعلم مهارة جديدة","p":16},{"t":"التخرج أو الترقية","p":12}]},
  {id:413,q:"اذكر شيء يميز شخص منظم",a:[{"t":"يخطط ليومه مسبقاً","p":28},{"t":"يرتب أغراضه","p":24},{"t":"يلتزم بالمواعيد","p":22},{"t":"يكتب قوائم مهام","p":16},{"t":"مكتبه دائماً مرتب","p":10}]},
  {id:414,q:"اذكر عادة سيئة يحاول الناس تركها",a:[{"t":"التدخين","p":30},{"t":"السهر الزائد","p":24},{"t":"قضم الأظافر","p":18},{"t":"الأكل غير الصحي","p":16},{"t":"تأجيل المهام","p":12}]},
  {id:415,q:"اذكر شيء يميز شخص صادق بكلامه",a:[{"t":"يقول الحقيقة حتى لو صعبة","p":30},{"t":"كلامه يطابق أفعاله","p":24},{"t":"ما يتردد بالاعتراف بغلطه","p":20},{"t":"موثوق بين الناس","p":16},{"t":"ما يبالغ بالقصص","p":10}]},
  {id:416,q:"اذكر شيء يعطيك أمل بمستقبل أفضل",a:[{"t":"النجاح بعد التعب","p":28},{"t":"دعم العائلة","p":24},{"t":"الإيمان وحسن الظن بالله","p":22},{"t":"قصص نجاح ملهمة","p":16},{"t":"تحسّن الأوضاع تدريجياً","p":10}]},
  {id:417,q:"اذكر شيء يعلّمك إياه الفشل",a:[{"t":"الصبر","p":28},{"t":"تحاول بطريقة أفضل","p":24},{"t":"التواضع","p":20},{"t":"تقييم الأخطاء","p":16},{"t":"عدم الاستسلام","p":12}]},
  {id:418,q:"اذكر شيء يفعله شخص متفائل بيومه",a:[{"t":"يبتسم من الصباح","p":28},{"t":"يشكر الله على نعمه","p":24},{"t":"يخطط ليوم منتج","p":20},{"t":"يتوقع الأفضل","p":16},{"t":"يشجع من حوله","p":12}]},
  {id:419,q:"اذكر هدف شائع يحطه الناس بالسنة الجديدة",a:[{"t":"ممارسة الرياضة بانتظام","p":28},{"t":"توفير المال","p":24},{"t":"قراءة كتب أكثر","p":18},{"t":"تحسين الصحة","p":16},{"t":"تعلم مهارة جديدة","p":14}]},
  {id:420,q:"اذكر شيء يميز جلسة عائلية ناجحة",a:[{"t":"الحضور الكامل للعائلة","p":28},{"t":"سوالف وضحك","p":24},{"t":"أكل لذيذ سوا","p":22},{"t":"تبادل الأخبار","p":14},{"t":"عدم استخدام الجوالات","p":12}]},
  {id:421,q:"اذكر سبب يخلّي شخص يحب مدينته",a:[{"t":"الذكريات الجميلة فيها","p":28},{"t":"وجود الأهل والأصحاب","p":24},{"t":"الأمان والراحة","p":20},{"t":"المعالم المميزة","p":16},{"t":"الطبيعة أو الجو","p":12}]},
  {id:422,q:"اذكر شيء يميز شخص كريم بوقته",a:[{"t":"يساعد بدون تذمر","p":28},{"t":"يستمع لمشاكل الغير","p":24},{"t":"يعطي وقته لعائلته","p":22},{"t":"يتطوع لخدمة المجتمع","p":16},{"t":"صبور مع الناس","p":10}]},
  {id:423,q:"اذكر شيء يحصل بمعرض توظيف",a:[{"t":"توزيع السير الذاتية","p":28},{"t":"مقابلات سريعة","p":24},{"t":"التعرف على شركات جديدة","p":20},{"t":"ورش تدريبية","p":16},{"t":"فرص تدريب أو وظائف","p":12}]},
  {id:424,q:"اذكر شيء يميز خطاب تحفيزي جيد",a:[{"t":"قصص ملهمة","p":28},{"t":"لغة جسد قوية","p":22},{"t":"رسالة واضحة","p":22},{"t":"تفاعل مع الجمهور","p":16},{"t":"طاقة إيجابية","p":12}]},
  {id:425,q:"اذكر شيء تحتاجه لتعلم لغة جديدة بسرعة",a:[{"t":"الممارسة اليومية","p":28},{"t":"المحادثة مع ناطقين أصليين","p":24},{"t":"مشاهدة أفلام باللغة","p":18},{"t":"تطبيقات تعليم اللغات","p":16},{"t":"حفظ المفردات","p":14}]},
  {id:426,q:"اذكر شيء تفعله لتحسين مهاراتك بالعمل",a:[{"t":"دورات تدريبية","p":28},{"t":"قراءة بمجال تخصصك","p":24},{"t":"طلب ملاحظات من مديرك","p":20},{"t":"التعلم من زملاء أكثر خبرة","p":16},{"t":"الممارسة المستمرة","p":12}]},
  {id:427,q:"اذكر شيء يميز عرض تقديمي (بريزنتيشن) ناجح",a:[{"t":"محتوى واضح ومنظم","p":28},{"t":"شرائح بسيطة وجذابة","p":24},{"t":"ثقة المتحدث","p":22},{"t":"التفاعل مع الحضور","p":16},{"t":"الالتزام بالوقت","p":10}]},
  {id:428,q:"اذكر شيء تفعله عشان توفر بالمصاريف الشهرية",a:[{"t":"عمل ميزانية شهرية","p":28},{"t":"تقليل المطاعم والتوصيل","p":24},{"t":"مقارنة الأسعار قبل الشراء","p":20},{"t":"تجنب الشراء العشوائي","p":16},{"t":"الادخار أول الشهر","p":12}]},
  {id:429,q:"اذكر شيء يساعدك تاخذ قرار صعب",a:[{"t":"استشارة شخص تثق فيه","p":28},{"t":"الاستخارة والدعاء","p":26},{"t":"حساب الإيجابيات والسلبيات","p":22},{"t":"الوقت للتفكير","p":14},{"t":"الاستماع لحدسك","p":10}]},
  {id:430,q:"اذكر شيء يحدث لما تسافر لبلد فيها لغة مختلفة",a:[{"t":"صعوبة بالتواصل","p":28},{"t":"استخدام تطبيق ترجمة","p":24},{"t":"لغة الإشارة والإيماءات","p":20},{"t":"تعلم كلمات أساسية بسرعة","p":16},{"t":"مرشد سياحي","p":12}]},
  {id:431,q:"اذكر شيء يميز مدينة ساحلية",a:[{"t":"الشواطئ","p":30},{"t":"المطاعم البحرية","p":24},{"t":"النسيم المنعش","p":20},{"t":"الأنشطة المائية","p":16},{"t":"ميناء أو كورنيش","p":10}]},
  {id:432,q:"اذكر شيء تحس فيه لما تزور مكان لأول مرة",a:[{"t":"الحماس والفضول","p":28},{"t":"التوهان بالبداية","p":22},{"t":"الانبهار بالمناظر","p":22},{"t":"الرغبة بالتصوير","p":16},{"t":"الشعور بالغربة قليلاً","p":12}]},
  {id:433,q:"اذكر شيء يميز شخص يحب المغامرة",a:[{"t":"يجرب أنشطة خطرة كالمظلات","p":28},{"t":"يحب أماكن غير مألوفة","p":26},{"t":"يحب التحديات","p":20},{"t":"ما يخاف يجرب أشياء جديدة","p":16},{"t":"يحب الرياضات القاسية","p":10}]},
  {id:434,q:"اذكر شيء يميز رحلة برية ناجحة",a:[{"t":"تخطيط جيد للمسار","p":28},{"t":"رفقة حلوة","p":24},{"t":"طقس مناسب","p":18},{"t":"أكل وماء كافي","p":16},{"t":"توقفات مريحة","p":14}]},
  {id:435,q:"اذكر شيء يحصل بمخيم كشفي أو تدريبي",a:[{"t":"أنشطة جماعية","p":28},{"t":"تعلم مهارات البقاء","p":24},{"t":"النوم بالخيام","p":20},{"t":"النار والسمر","p":16},{"t":"الألعاب الترفيهية","p":12}]},
  {id:436,q:"اذكر شيء يستخدم فيه الناس الذكاء الاصطناعي اليوم",a:[{"t":"كتابة الرسائل والمحتوى","p":28},{"t":"توليد الصور","p":24},{"t":"الترجمة الفورية","p":20},{"t":"المساعدات الصوتية","p":16},{"t":"تلخيص المعلومات","p":12}]},
  {id:437,q:"اذكر تطبيق ذكاء اصطناعي مشهور",a:[{"t":"تشات جي بي تي","p":34},{"t":"ميدجورني","p":22},{"t":"جوجل جيميناي","p":20},{"t":"كوبايلوت","p":14},{"t":"ديب سيك","p":10}]},
  {id:438,q:"اذكر شيء يميز الهاتف الذكي الحديث عن القديم",a:[{"t":"الكاميرا الأقوى","p":28},{"t":"سرعة المعالج","p":24},{"t":"مساحة التخزين الكبيرة","p":20},{"t":"الشاشة الأوضح","p":16},{"t":"عمر البطارية","p":12}]},
  {id:439,q:"اذكر جهاز إلكتروني قابل للارتداء",a:[{"t":"الساعة الذكية","p":34},{"t":"سماعة الأذن اللاسلكية","p":26},{"t":"سوار اللياقة","p":20},{"t":"نظارة الواقع الافتراضي","p":12},{"t":"خاتم ذكي","p":8}]},
  {id:440,q:"اذكر منصة يشاهد فيها الناس بودكاست أو فيديوهات قصيرة",a:[{"t":"يوتيوب","p":28},{"t":"تيك توك","p":26},{"t":"انستقرام ريلز","p":22},{"t":"سناب شات","p":14},{"t":"سبوتيفاي للبودكاست","p":10}]},
  {id:441,q:"اذكر شيء يساعد على حماية البيئة",a:[{"t":"إعادة التدوير","p":28},{"t":"تقليل استخدام البلاستيك","p":24},{"t":"توفير الماء والكهرباء","p":20},{"t":"زراعة الأشجار","p":16},{"t":"استخدام الطاقة الشمسية","p":12}]},
  {id:442,q:"اذكر مصدر طاقة متجددة",a:[{"t":"الطاقة الشمسية","p":34},{"t":"طاقة الرياح","p":28},{"t":"الطاقة المائية","p":18},{"t":"الطاقة الحرارية الأرضية","p":12},{"t":"طاقة الأمواج","p":8}]},
  {id:443,q:"اذكر شيء يسبب تلوث الهواء",a:[{"t":"عوادم السيارات","p":30},{"t":"دخان المصانع","p":26},{"t":"حرق النفايات","p":18},{"t":"الغبار والعواصف الرملية","p":16},{"t":"التدخين","p":10}]},
  {id:444,q:"اذكر شيء يجب توفره بالسيارة للسلامة",a:[{"t":"حزام الأمان","p":30},{"t":"الوسائد الهوائية","p":24},{"t":"طفاية الحريق الصغيرة","p":18},{"t":"مثلث التحذير","p":16},{"t":"إطار احتياطي","p":12}]},
  {id:445,q:"اذكر رقم طوارئ يعرفه أغلب الناس",a:[{"t":"998 الإسعاف","p":30},{"t":"999 الشرطة","p":28},{"t":"997 الدفاع المدني","p":26},{"t":"911 بالخارج","p":16}]},
  {id:446,q:"اذكر شيء يجب فعله وقت الحريق",a:[{"t":"الاتصال بالدفاع المدني","p":30},{"t":"إخلاء المكان بسرعة","p":26},{"t":"عدم استخدام المصعد","p":20},{"t":"تغطية الفم من الدخان","p":14},{"t":"استخدام طفاية الحريق","p":10}]},
  {id:447,q:"اذكر شيء يساعد الطفل يحب القراءة",a:[{"t":"قصص مصورة ممتعة","p":28},{"t":"قراءة الأهل له من صغره","p":24},{"t":"زيارة المكتبة","p":20},{"t":"مكافأة بعد كل كتاب","p":16},{"t":"قصص قبل النوم","p":12}]},
  {id:448,q:"اذكر مهارة مهمة تُعلَّم للأطفال بالبيت",a:[{"t":"الأدب والاحترام","p":28},{"t":"النظافة الشخصية","p":24},{"t":"مساعدة الأهل بالمنزل","p":20},{"t":"إدارة المصروف","p":16},{"t":"الصدق","p":12}]},
  {id:449,q:"اذكر لعبة تعليمية تنمي ذكاء الطفل",a:[{"t":"المكعبات والتركيب","p":28},{"t":"الألغاز (البازل)","p":26},{"t":"لعبة الذاكرة","p":20},{"t":"لعبة الحروف والأرقام","p":16},{"t":"الرسم والتلوين","p":10}]},
  {id:450,q:"اذكر شيء يحتاجه كبار السن باهتمام خاص",a:[{"t":"الرعاية الصحية الدورية","p":28},{"t":"الرفقة وعدم الشعور بالوحدة","p":26},{"t":"الأدوية بمواعيدها","p":20},{"t":"بيئة آمنة بالمنزل","p":16},{"t":"النشاط الخفيف والمشي","p":10}]},
  {id:451,q:"اذكر شيء يحب كبار السن يسمعونه من أحفادهم",a:[{"t":"قصص عن يومهم","p":28},{"t":"كلام معسول وحنان","p":24},{"t":"طلب النصيحة منهم","p":22},{"t":"الدعاء لهم","p":16},{"t":"شكرهم على تربيتهم","p":10}]},
  {id:452,q:"اذكر شيء يحتاجه القط أو الكلب بالبيت",a:[{"t":"الأكل المخصص له","p":28},{"t":"مكان للنوم","p":22},{"t":"زيارة الطبيب البيطري","p":20},{"t":"اللعب والحركة","p":18},{"t":"الاستحمام والعناية","p":12}]},
  {id:453,q:"اذكر سبب يخلّي الناس تربي حيوان أليف",a:[{"t":"الونس ومحاربة الوحدة","p":28},{"t":"حب الحيوانات","p":24},{"t":"تعليم الأطفال المسؤولية","p":22},{"t":"الحراسة (بالنسبة للكلاب)","p":16},{"t":"العلاج النفسي","p":10}]},
  {id:454,q:"اذكر نمط ديكور منزلي معروف",a:[{"t":"النمط الحديث (المودرن)","p":28},{"t":"النمط الكلاسيكي","p":24},{"t":"النمط الاسكندنافي","p":20},{"t":"النمط البوهيمي","p":16},{"t":"النمط الصناعي","p":12}]},
  {id:455,q:"اذكر شيء يضيف لمسة جمالية للمجلس",a:[{"t":"الإضاءة الدافئة","p":28},{"t":"الوسائد الملونة","p":24},{"t":"لوحات فنية","p":20},{"t":"النباتات الداخلية","p":16},{"t":"السجاد الفاخر","p":12}]},
  {id:456,q:"اذكر إكسسوار تلبسه النساء",a:[{"t":"الخاتم","p":26},{"t":"السوار","p":22},{"t":"القلادة","p":20},{"t":"الأقراط","p":18},{"t":"الساعة","p":14}]},
  {id:457,q:"اذكر مناسبة تحتاج فيها ملابس رسمية",a:[{"t":"المقابلة الوظيفية","p":28},{"t":"حفل الزفاف","p":26},{"t":"التخرج","p":20},{"t":"اجتماع عمل مهم","p":16},{"t":"مناسبة دبلوماسية","p":10}]},
  {id:458,q:"اذكر نوع قهوة عالمي مشهور",a:[{"t":"إسبريسو","p":28},{"t":"لاتيه","p":24},{"t":"كابتشينو","p":20},{"t":"أمريكانو","p":16},{"t":"موكا","p":12}]},
  {id:459,q:"اذكر أداة تستخدم بتحضير القهوة المختصة",a:[{"t":"مطحنة القهوة","p":28},{"t":"مكينة الإسبريسو","p":26},{"t":"الميزان الرقمي","p":18},{"t":"الكيتل ذو العنق الطويل","p":16},{"t":"الفلتر أو الدلة","p":12}]},
  {id:460,q:"اذكر رياضة شتوية تُلعب على الثلج",a:[{"t":"التزلج على الجليد","p":32},{"t":"هوكي الجليد","p":26},{"t":"سنوبورد","p":22},{"t":"الزحافة","p":12},{"t":"تسلق الجبال الثلجية","p":8}]},
  {id:461,q:"اذكر سبب يخلّي محتوى السوشيال ميديا ينتشر",a:[{"t":"محتوى مضحك","p":28},{"t":"موضوع يهم الكثير","p":24},{"t":"مشاهير يشاركونه","p":20},{"t":"فكرة مبتكرة وغريبة","p":16},{"t":"توقيت نشر مناسب","p":12}]},
  {id:462,q:"اذكر شيء يميز صانع محتوى ناجح",a:[{"t":"الاستمرارية بالنشر","p":28},{"t":"التفاعل مع المتابعين","p":24},{"t":"فكرة مميزة ومختلفة","p":20},{"t":"جودة التصوير والمونتاج","p":16},{"t":"الصدق بالمحتوى","p":12}]},
  {id:463,q:"اذكر تحدي يواجهه الموظف بالعمل من المنزل",a:[{"t":"صعوبة التركيز","p":28},{"t":"قلة التواصل مع الفريق","p":24},{"t":"اختلاط وقت العمل بالراحة","p":22},{"t":"مشاكل الإنترنت","p":16},{"t":"الشعور بالعزلة","p":10}]},
  {id:464,q:"اذكر أداة يستخدمها فريق العمل عن بعد للتواصل",a:[{"t":"زوم","p":30},{"t":"مايكروسوفت تيمز","p":26},{"t":"سلاك","p":20},{"t":"جوجل ميت","p":16},{"t":"واتساب للعمل","p":8}]},
  {id:465,q:"اذكر شيء يساعد على تقليل التوتر",a:[{"t":"التنفس العميق","p":28},{"t":"الرياضة","p":24},{"t":"التحدث مع شخص تثق فيه","p":20},{"t":"الاسترخاء وأخذ استراحة","p":16},{"t":"الدعاء والذكر","p":12}]},
  {id:466,q:"اذكر سبب شائع للتوتر بحياة الناس اليومية",a:[{"t":"ضغط العمل","p":28},{"t":"المشاكل المالية","p":24},{"t":"الزحمة والمواصلات","p":18},{"t":"العلاقات الاجتماعية","p":16},{"t":"قلة الوقت","p":14}]},
  {id:467,q:"اذكر ميزة تتوفر بالسيارات الكهربائية",a:[{"t":"عدم الحاجة للبنزين","p":30},{"t":"هدوء المحرك","p":24},{"t":"تسارع سريع","p":20},{"t":"تكلفة صيانة أقل","p":16},{"t":"صديقة للبيئة","p":10}]},
  {id:468,q:"اذكر ماركة سيارات كهربائية مشهورة",a:[{"t":"تسلا","p":36},{"t":"لوسيد","p":22},{"t":"بي واي دي","p":18},{"t":"بورش تايكان","p":14},{"t":"مرسيدس الكهربائية","p":10}]},
  {id:469,q:"اذكر شيء يميز الحياة بالمدينة الكبيرة عن القرية",a:[{"t":"سرعة الحياة والزحمة","p":28},{"t":"توفر الخدمات والمولات","p":24},{"t":"قلة الهدوء","p":20},{"t":"تنوع الفرص الوظيفية","p":16},{"t":"ازدحام السكان","p":12}]},
  {id:470,q:"اذكر مشكلة تواجه سكان المدن الكبيرة",a:[{"t":"الزحمة المرورية","p":30},{"t":"ارتفاع تكلفة المعيشة","p":26},{"t":"تلوث الهواء","p":18},{"t":"قلة المواقف","p":16},{"t":"الضوضاء","p":10}]},
  {id:471,q:"اذكر نوع كتاب يحب الناس قراءته",a:[{"t":"الروايات","p":28},{"t":"كتب تطوير الذات","p":24},{"t":"الكتب الدينية","p":20},{"t":"السير الذاتية","p":16},{"t":"الكتب العلمية","p":12}]},
  {id:472,q:"اذكر سبب يخلّي الشخص يحب القراءة",a:[{"t":"توسيع المعرفة","p":28},{"t":"الهروب من الروتين","p":22},{"t":"تحسين اللغة","p":20},{"t":"الاسترخاء الذهني","p":16},{"t":"تطوير التفكير","p":14}]},
  {id:473,q:"اذكر مصطلح مالي يسمعه الناس كثير",a:[{"t":"الفائدة البنكية","p":26},{"t":"التضخم","p":24},{"t":"الميزانية","p":22},{"t":"الاستثمار","p":16},{"t":"القرض","p":12}]},
  {id:474,q:"اذكر طريقة استثمار يعرفها الناس",a:[{"t":"الأسهم","p":30},{"t":"العقار","p":26},{"t":"الذهب","p":20},{"t":"الصناديق الاستثمارية","p":14},{"t":"العملات الرقمية","p":10}]},
  {id:475,q:"اذكر شيء يعطيك دفعة نشاط بالصباح",a:[{"t":"الرياضة الخفيفة","p":28},{"t":"كوب القهوة","p":26},{"t":"الدش البارد","p":18},{"t":"الإفطار الصحي","p":18},{"t":"سماع أغنية تحبها","p":10}]},
  {id:476,q:"اذكر عادة مسائية تساعد على الاسترخاء",a:[{"t":"قراءة كتاب","p":26},{"t":"الاستحمام الدافئ","p":24},{"t":"تأمل أو تنفس هادئ","p":20},{"t":"مشاهدة شيء خفيف","p":18},{"t":"كتابة اليوميات","p":12}]},
  {id:477,q:"اذكر شيء يميز مقدم نشرة الأخبار",a:[{"t":"صوت واضح وثقة بالنفس","p":28},{"t":"إلقاء احترافي","p":24},{"t":"مظهر أنيق","p":20},{"t":"سرعة البديهة","p":16},{"t":"معرفة واسعة بالأخبار","p":12}]},
  {id:478,q:"اذكر شيء يستخدمه المذيع أو المقدم بالاستوديو",a:[{"t":"الميكروفون","p":30},{"t":"سماعة الأذن (الإيرفون)","p":24},{"t":"التلقين (البرومبتر)","p":20},{"t":"الكاميرا","p":16},{"t":"الإضاءة الاستوديو","p":10}]},
  {id:479,q:"اذكر مهرجان أو حدث ترفيهي عالمي مشهور",a:[{"t":"مهرجان كان السينمائي","p":26},{"t":"كوميك كون","p":22},{"t":"مهرجان الموسيقى (كوتشيلا)","p":22},{"t":"مهرجان أفينيون","p":16},{"t":"معرض إكسبو","p":14}]},
  {id:480,q:"اذكر شيء يميز مسابقة تلفزيونية ناجحة",a:[{"t":"جوائز مغرية","p":28},{"t":"منافسة مثيرة","p":24},{"t":"مقدم برنامج محبوب","p":20},{"t":"لجنة تحكيم معروفة","p":16},{"t":"تفاعل الجمهور","p":12}]},
  {id:481,q:"اذكر شيء يميز مكتبة عامة حديثة",a:[{"t":"أقسام هادئة للمذاكرة","p":28},{"t":"تنوع الكتب والمصادر","p":24},{"t":"خدمة الإنترنت المجاني","p":20},{"t":"فعاليات وورش ثقافية","p":16},{"t":"نظام إلكتروني للاستعارة","p":12}]},
  {id:482,q:"اذكر شيء يميز حديقة حيوان",a:[{"t":"تنوع الحيوانات","p":28},{"t":"أقفاص آمنة ومريحة","p":24},{"t":"جولات تعليمية للزوار","p":20},{"t":"إطعام الحيوانات أمام الناس","p":16},{"t":"مناطق استراحة للعائلات","p":12}]},
  {id:483,q:"اذكر شيء يميز أكواريوم (حوض أسماك عام)",a:[{"t":"تنوع الأسماك الملونة","p":30},{"t":"نفق زجاجي تحت الماء","p":24},{"t":"عروض تفاعلية","p":20},{"t":"إضاءة هادئة ومميزة","p":16},{"t":"منطقة لمس الكائنات البحرية","p":10}]},
  {id:484,q:"اذكر شيء يميز سيرك أو عرض ترفيهي",a:[{"t":"عروض بهلوانية","p":28},{"t":"مهرجون يضحكون الجمهور","p":24},{"t":"عروض حيوانات مدربة","p":20},{"t":"ألعاب نارية بالختام","p":16},{"t":"موسيقى حماسية","p":12}]},
  {id:485,q:"اذكر شيء تشوفه بمعرض كتاب دولي",a:[{"t":"دور نشر متنوعة","p":28},{"t":"توقيع كتب من مؤلفين","p":24},{"t":"عروض وخصومات","p":20},{"t":"ندوات ثقافية","p":16},{"t":"زحمة الزوار والقراء","p":12}]},
  {id:486,q:"اذكر شيء يميز مؤتمر تقني كبير",a:[{"t":"إعلان منتجات جديدة","p":28},{"t":"محاضرات لخبراء التقنية","p":24},{"t":"أجنحة عرض الشركات","p":20},{"t":"فرص توظيف وتواصل","p":16},{"t":"تجربة تقنيات جديدة","p":12}]},
  {id:487,q:"اذكر شيء يميز طبيب ناجح",a:[{"t":"التشخيص الدقيق","p":28},{"t":"الصبر مع المرضى","p":24},{"t":"متابعة أحدث الطب","p":20},{"t":"الاستماع الجيد للمريض","p":16},{"t":"الحزم بالنصيحة","p":12}]},
  {id:488,q:"اذكر شيء يجعل المعلم محبوب من طلابه",a:[{"t":"أسلوب شرح سهل","p":28},{"t":"العدل بين الطلاب","p":24},{"t":"روح الدعابة","p":20},{"t":"الصبر والتفهم","p":16},{"t":"الاهتمام بمستوى كل طالب","p":12}]},
  {id:489,q:"اذكر شيء يميز جار طيب",a:[{"t":"يحترم الخصوصية","p":28},{"t":"يساعد وقت الحاجة","p":26},{"t":"يشارك الأكل بالمناسبات","p":20},{"t":"هادئ وما يزعج","p":16},{"t":"يسلم ويسأل عنك","p":10}]},
  {id:490,q:"اذكر شيء يميز رحلة مدرسية (رحلة ترفيهية للطلاب)",a:[{"t":"الحافلة المدرسية","p":28},{"t":"زيارة متحف أو حديقة","p":24},{"t":"وجبة الغداء الجماعية","p":20},{"t":"إشراف المعلمين","p":16},{"t":"الحماس والفرح بين الطلاب","p":12}]},
  {id:491,q:"اذكر مدينة خليجية يزورها السعوديون كثير",a:[{"t":"دبي","p":32},{"t":"المنامة","p":22},{"t":"الكويت","p":16},{"t":"الدوحة","p":14},{"t":"أبوظبي","p":10},{"t":"مسقط","p":6}]},
  {id:492,q:"اذكر صدقة يقدر يسويها أي شخص",a:[{"t":"إطعام محتاج","p":28},{"t":"سقيا ماء","p":22},{"t":"الكلمة الطيبة","p":18},{"t":"مساعدة كبير السن","p":14},{"t":"التبرع بالملابس","p":10},{"t":"إماطة الأذى","p":8}]},
  {id:493,q:"اذكر وقت من اليوم يحبه الناس",a:[{"t":"وقت المغرب","p":26},{"t":"الفجر","p":22},{"t":"الليل المتأخر","p":20},{"t":"العصر","p":14},{"t":"الظهيرة","p":10},{"t":"الضحى","p":8}]},
  {id:494,q:"اذكر نشاط تسويه لما يكون الجو معتدل",a:[{"t":"المشي","p":30},{"t":"شوي بالبر","p":24},{"t":"جلسة بالحديقة","p":18},{"t":"رياضة برا","p":12},{"t":"التصوير","p":9},{"t":"القراءة برا","p":7}]},
  {id:495,q:"اذكر دولة الناس تحب أكلها",a:[{"t":"إيطاليا","p":26},{"t":"اليابان","p":20},{"t":"تركيا","p":18},{"t":"الهند","p":16},{"t":"المكسيك","p":12},{"t":"لبنان","p":8}]},
  {id:496,q:"اذكر شيء ألوانه كثيرة وزاهية",a:[{"t":"الورد","p":26},{"t":"ألوان الرسم","p":22},{"t":"ملابس الأطفال","p":18},{"t":"الحلويات","p":14},{"t":"الطيور","p":12},{"t":"البالونات","p":8}]},
  {id:497,q:"اذكر صوت تعرفه من أول ما تسمعه",a:[{"t":"المنبه","p":28},{"t":"رنة الجوال","p":24},{"t":"الأذان","p":20},{"t":"صوت المطر","p":12},{"t":"بكاء طفل","p":10},{"t":"زامور السيارة","p":6}]},
  {id:498,q:"اذكر شيء يخلّي الطفل يضحك بسرعة",a:[{"t":"الدغدغة","p":30},{"t":"وجه مضحك","p":24},{"t":"صوت غريب","p":18},{"t":"لعبة جديدة","p":12},{"t":"الغميضة","p":10},{"t":"كرتون","p":6}]},
  {id:499,q:"اذكر شيء يخلّي هواء الغرفة منعش",a:[{"t":"فتح النافذة","p":30},{"t":"معطر الجو","p":24},{"t":"المكيف","p":18},{"t":"النباتات","p":12},{"t":"البخور","p":10},{"t":"مروحة","p":6}]},
  {id:500,q:"اذكر شيء تفتقده لما تسافر بعيد عن بيتك",a:[{"t":"الأهل","p":32},{"t":"أكل البيت","p":24},{"t":"سريرك","p":18},{"t":"الأصدقاء","p":12},{"t":"روتينك اليومي","p":8},{"t":"جو بلدك","p":6}]},
];
// مشتق من البنك لا رقماً مكتوباً بيد: كان ٢٦٧ ثم صار البنك ٥٠٠،
// وأي رقم أصغر من آخر مُعرِّف يجعل السؤال الجديد يصطدم بسؤال قائم.
let nextQId = DEFAULT_Q.length + 1;
let ALL_Q = JSON.parse(JSON.stringify(DEFAULT_Q));

// Load saved questions from localStorage (with version check)
const Q_VERSION = 266;
try {
  const savedVer = localStorage.getItem('khamen_q_version');
  if (savedVer && parseInt(savedVer) === Q_VERSION) {
    const saved = localStorage.getItem('khamen_questions');
    if (saved) ALL_Q = JSON.parse(saved);
  } else {
    localStorage.removeItem('khamen_questions');
    localStorage.setItem('khamen_q_version', Q_VERSION);
  }
} catch(e) {}
nextQId = ALL_Q.reduce((max, q) => Math.max(max, q.id || 0), 0) + 1;

// ========= QUESTIONS FROM SUPABASE (best-effort — falls back to the built-in set) =========
const Q_CACHE_KEY = 'khamen_q_cache';
const Q_CACHE_AT  = 'khamen_q_cache_at';
const Q_CACHE_TTL = 24 * 60 * 60 * 1000;

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

// ========= BUZZER / ROOMS (experimental) =========
let BUZZER = { channel:null, roomCode:null, slotNames:{1:null,2:null}, connectedNames:[], unlocked:false, winnerDeclared:false };

function selectBuzzerMode(on){
  SETTINGS.buzzerMode = on;
  document.querySelectorAll('#buzzerModeSelector .opt-btn').forEach(b=>b.classList.remove('active'));
  event.target.closest('.opt-btn').classList.add('active');
  $('teamInputsWrap').classList.toggle('hidden', on);
  $('buzzerRoomWrap').classList.toggle('hidden', !on);
  AudioEngine.play('click');
}

function genRoomCode(){ return String(Math.floor(10000 + Math.random()*90000)); }

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
  if (BUZZER.channel) return; // already created
  const code = genRoomCode();
  BUZZER.roomCode = code;
  BUZZER.slotNames = {1:null, 2:null};

  $('buzzerCodeDisplay').textContent = code;
  // /j/CODE instead of /buzzer-join.html?code=CODE -- players read this off a
  // screen and type it on a phone, so every character removed is one less typo.
  // The _redirects file rewrites it back to the real page.
  const joinUrl = location.origin + '/j/' + code;
  $('buzzerJoinUrl').textContent = joinUrl;
  renderBuzzerQR(joinUrl);
  $('createRoomBtn').classList.add('hidden');
  $('buzzerRoomInfo').classList.remove('hidden');

  const sb = getSb();
  const channel = sb.channel('room-' + code, { config: { presence: { key: 'host' } } });

  channel.on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState();
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
    if (!BUZZER.unlocked || BUZZER.winnerDeclared) return;
    const teamName = payload.payload.team_name;
    const slotNum = BUZZER.slotNames[1] === teamName ? 1 : (BUZZER.slotNames[2] === teamName ? 2 : null);
    if (!slotNum) return;
    BUZZER.winnerDeclared = true;
    BUZZER.unlocked = false;
    setTeam(slotNum);
    showBuzzWinner(teamName);
    channel.send({ type:'broadcast', event:'winner', payload:{ team_name: teamName } });
  });

  channel.subscribe((status) => { if (status === 'SUBSCRIBED') channel.track({ role:'host' }); });
  BUZZER.channel = channel;
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
// أرقام عربية هندية للعرض فقط. لا تُستعمل مع كود غرفة البازر ولا مفتاح
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
function editQ(i){editingIndex=i;const q=ALL_Q[i];$('newQ').value=q.q;const rows=document.querySelectorAll('#newAnswers .ea-row');rows.forEach((row,j)=>{row.querySelector('.ea-ans').value=q.a[j]?q.a[j].t:'';row.querySelector('.ea-pts').value=q.a[j]?q.a[j].p:''});$('addQBtn').innerHTML=iconSVG('save')+' حفظ التعديل';$('newQ').scrollIntoView({behavior:'smooth'})}
function addOrUpdateQ(){const q=$('newQ').value.trim();if(!q)return showModal('⚠️','','اكتب السؤال!');const rows=document.querySelectorAll('#newAnswers .ea-row');const answers=[];rows.forEach(row=>{const t=row.querySelector('.ea-ans').value.trim();const p=parseInt(row.querySelector('.ea-pts').value);if(t&&p>0)answers.push({t,p})});if(answers.length<2)return showModal('⚠️','','أضف على الأقل إجابتين مع النقاط!');if(editingIndex>=0){ALL_Q[editingIndex]={id:ALL_Q[editingIndex].id,q,a:answers};editingIndex=-1;$('addQBtn').innerHTML=iconSVG('plus')+' أضف السؤال'}else{ALL_Q.push({id:nextQId++,q,a:answers})}$('newQ').value='';document.querySelectorAll('#newAnswers input').forEach(i=>i.value='');saveQuestions();renderEditorList()}

// ========= DOWNLOAD QUESTIONS PDF =========
function downloadQuestionsPDF(){
  const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>خمّن صح — الأسئلة</title>
<style>
@page{size:A4;margin:20mm 15mm}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Tahoma,'Segoe UI',sans-serif;background:#fff;color:#222;padding:10mm;direction:rtl}
h1{text-align:center;font-size:28px;margin-bottom:4px;color:#8b5e3c}
.sub{text-align:center;font-size:13px;color:#999;margin-bottom:20px;border-bottom:2px solid #f0a830;padding-bottom:12px}
.q-card{page-break-inside:avoid;margin-bottom:16px;border:2px solid #e8d5b8;border-radius:12px;overflow:hidden}
.q-head{background:#fdf3e3;padding:10px 16px;font-size:15px;font-weight:700;color:#5c3a1a;display:flex;align-items:center;gap:10px}
.q-num{min-width:32px;height:26px;border-radius:13px;background:#f0a830;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;padding:0 8px}
.a-grid{display:grid;grid-template-columns:1fr 1fr;gap:0}
.a-item{padding:8px 14px;border-top:1px solid #f0e6d2;display:flex;align-items:center;justify-content:space-between;font-size:13px}
.a-item:nth-child(odd){border-left:1px solid #f0e6d2}
.a-num{width:22px;height:22px;border-radius:6px;background:#f9e4c8;color:#8b5e3c;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;margin-left:8px;flex-shrink:0}
.a-text{flex:1}
.a-pts{background:#f0a830;color:#fff;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700;margin-right:8px}
.footer{text-align:center;margin-top:20px;font-size:11px;color:#bbb;border-top:1px solid #eee;padding-top:10px}
.total{text-align:center;font-size:13px;color:#8b5e3c;margin-bottom:16px}
</style></head><body>
<h1>🎮 خمّن صح</h1>
<div class="sub">فاميلي فيود — جميع الأسئلة والإجابات</div>
<div class="total">إجمالي الأسئلة: ${ALL_Q.length}</div>
${[...ALL_Q].sort((a,b)=>(a.id||0)-(b.id||0)).map((q,i)=>`<div class="q-card"><div class="q-head"><span class="q-num">#${q.id||i+1}</span>${q.q}</div><div class="a-grid">${q.a.map((a,j)=>`<div class="a-item"><span class="a-num">${j+1}</span><span class="a-text">${a.t}</span><span class="a-pts">${a.p}</span></div>`).join('')}</div></div>`).join('')}
<div class="footer">خمّن صح — فاميلي فيود 🎮</div>
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
  if(!BUZZER.channel) return showModal('⚠️','','أنشئ غرفة البازر الأول!');
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
