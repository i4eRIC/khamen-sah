/* ============================================================
   مختبر الثيمات — خمّن صح   (النسخة ٢)
   انسخ الملف كاملاً والصقه في وحدة تحكم المتصفح (F12 ← Console)
   وأنت داخل شاشة اللعب.

   • منتقي لون + خانة تكتب فيها الكود كاملاً (606c38 أو #606c38)
   • اسحب اللوحة من رأسها لأي مكان في الشاشة
   • تحت كل خانة وصف بمكانها الفعلي في اللعبة
   • قياس تباين حيّ للأزواج الحرجة
   • «نسخ CSS» يعطيك كتلة الثيم كاملة جاهزة للصق في style.css

   التغييرات مؤقتة — أي تحديث للصفحة يمسحها.
   ============================================================ */
(() => {
  document.getElementById('themeLab')?.remove();

  // The game sets data-theme on <body>, so inline overrides must land there too.
  const HOST = document.body;
  const cs   = () => getComputedStyle(HOST);
  const cur  = () => HOST.getAttribute('data-theme') || 'sand';

  // Descriptions are taken from where each variable is actually consumed in
  // style.css, not from its name — several names are misleading (--red is a dark
  // surface, not the error colour) and two are dead.
  const FIELDS = [
    ['--bg',             'خلفية الصفحة',        'الأرضية خلف كل شي، ومعها نمط النقاط'],
    ['--bg-card',        'خلفية النوافذ',       'النوافذ المنبثقة، بطاقة الإحصائيات، صندوق تسجيل الدخول'],
    ['--bg-card2',       'الأسطح الثانوية',     'بطاقة الفريق الخامل · أزرار المساعدات (تلميح/كشف حرف/درع) · أزرار التحكم · وجه الإجابة المخفية · حقول الإدخال'],
    ['--border-light',   'الحدود',              'حدود كل البطاقات والأزرار ودوائر الأخطاء — الأكثر استخداماً (٤٩ موضعاً)'],
    ['--border',         'حدّ سميك',            'شبه غير مستخدم — موضع واحد فقط'],
    ['--text',           'النص الأساسي',        'نص السؤال · العناوين · نص حقول الإدخال'],
    ['--text-mid',       'النص الثانوي',        'نص أزرار المساعدات وأزرار التحكم · اسم الفريق الخامل · روابط القائمة'],
    ['--text-soft',      'النص الخافت',         'نقاط الفريق الخامل · أرقام ونقاط الإجابات المخفية · التلميحات والشروحات'],
    ['--accent',         'اللون المميز',        'شريط الإجابة المكشوفة · تعبئة بطاقة الفريق النشط · شعار الرأس · حلقة التركيز'],
    ['--on-accent',      'النص فوق المميز',     'نص زر «الفريق» · شعار الرأس · أزرار الخيارات المفعّلة'],
    ['--gold',           'الذهبي',              'حدّ شريط الإجابة ورقمها · نقاط الفريق النشط · الخط تحت الرأس · حلقة المؤقت'],
    ['--gold-dark',      'الذهبي الغامق',       'شارة الجولة · الحافة السفلية للأزرار الذهبية'],
    ['--green',          'الأخضر',              'حالات النجاح والتأكيد'],
    ['--red',            'سطح داكن',            'ليس أحمر — سطح مساعد. الأحمر الحقيقي ثابت لكل الثيمات'],
    ['--header-bg',      'شريط الرأس',          'الشريط العلوي حيث الشعار وأزرار الصوت'],
    ['--slot-hover-num', 'رقم عند التمرير',     'مربع الرقم لما تمرر الفأرة على إجابة مخفية'],
    ['--accent-light',   'المميز الفاتح',       'غير مستخدم في أي مكان — موجود للتوافق فقط'],
  ];

  const PAIRS = [
    ['--gold',      '--accent', 'نقاط الفريق النشط'],
    ['--on-accent', '--accent', 'نص الأزرار المميزة'],
    ['--text',      '--bg',     'النص على الخلفية'],
    ['--text-mid',  '--bg',     'النص الثانوي'],
    ['--bg',        '--gold',   'النص على الذهبي'],
  ];

  const clean = v => {
    v = String(v||'').trim().replace(/^#/,'');
    if (/^[0-9a-f]{3}$/i.test(v)) v = v.split('').map(c=>c+c).join('');
    return /^[0-9a-f]{6}$/i.test(v) ? '#' + v.toLowerCase() : null;
  };
  const hex = v => {
    v = (v||'').trim();
    if (v.startsWith('#')) return clean(v.slice(0,7)) || '#000000';
    const m = v.match(/rgba?\(([^)]+)\)/);
    if (!m) return '#000000';
    return '#' + m[1].split(',').slice(0,3)
      .map(n => parseInt(n).toString(16).padStart(2,'0')).join('');
  };
  const lum = h => { const c=h.replace('#','');
    const v=[0,2,4].map(i=>{const s=parseInt(c.substr(i,2),16)/255;
      return s<=0.03928?s/12.92:Math.pow((s+0.055)/1.055,2.4)});
    return 0.2126*v[0]+0.7152*v[1]+0.0722*v[2] };
  const ratio = (a,b)=>{const[x,y]=[lum(a),lum(b)].sort((m,n)=>n-m);return(x+0.05)/(y+0.05)};
  const rgbaOf = (h,a)=>'rgba('+[0,2,4].map(i=>parseInt(h.replace('#','').substr(i,2),16)).join(',')+','+a+')';

  const state = {};
  FIELDS.forEach(([k]) => state[k] = hex(cs().getPropertyValue(k)));

  const P = document.createElement('div');
  P.id = 'themeLab';
  P.style.cssText = [
    'position:fixed','left:auto','right:14px','top:14px','z-index:2147483647',
    'width:330px','max-height:90vh','display:flex','flex-direction:column','direction:rtl',
    'background:#101420','color:#e8ecf4','border:1px solid #2b3244','border-radius:12px',
    'font-family:system-ui,sans-serif','font-size:12px','box-shadow:0 20px 60px rgba(0,0,0,.6)'
  ].join(';');

  P.innerHTML = `
    <div id="tlBar" style="display:flex;align-items:center;justify-content:space-between;gap:8px;
         padding:10px 12px;border-bottom:1px solid #2b3244;cursor:grab;user-select:none;flex:none">
      <b style="font-size:13px">مختبر الثيمات</b>
      <span style="font-size:10px;opacity:.5">اسحب من هنا</span>
      <code id="tlTheme" style="font-size:10px;opacity:.6"></code>
    </div>
    <div id="tlFields" style="overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:9px;flex:1"></div>
    <div style="padding:9px 12px;border-top:1px solid #2b3244;flex:none">
      <b style="font-size:11px;opacity:.7">التباين</b>
      <div id="tlContrast" style="margin-top:5px;display:flex;flex-direction:column;gap:2px"></div>
    </div>
    <div style="display:flex;gap:6px;padding:10px 12px;border-top:1px solid #2b3244;flex:none">
      <button id="tlCopy"  style="flex:1;padding:8px;border:0;border-radius:7px;background:#3b82f6;color:#fff;font-weight:700;cursor:pointer;font-family:inherit;font-size:12px">نسخ CSS</button>
      <button id="tlReset" style="padding:8px 11px;border:1px solid #2b3244;border-radius:7px;background:transparent;color:#93a0b5;cursor:pointer;font-family:inherit;font-size:12px">تصفير</button>
      <button id="tlClose" style="padding:8px 11px;border:1px solid #2b3244;border-radius:7px;background:transparent;color:#93a0b5;cursor:pointer;font-family:inherit;font-size:12px">إغلاق</button>
    </div>`;
  document.body.appendChild(P);
  P.querySelector('#tlTheme').textContent = cur();

  /* ---------- rows ---------- */
  const rows = P.querySelector('#tlFields');
  FIELDS.forEach(([key,label,desc]) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-direction:column;gap:3px';
    row.innerHTML = `
      <div style="display:flex;align-items:center;gap:7px">
        <input type="color" data-k="${key}" data-role="pick" value="${state[key]}"
               style="width:28px;height:24px;padding:0;border:1px solid #2b3244;border-radius:5px;background:none;cursor:pointer;flex:none">
        <input type="text" data-k="${key}" data-role="hex" value="${state[key]}" spellcheck="false"
               style="width:78px;flex:none;direction:ltr;text-align:left;font-family:monospace;font-size:11px;
                      padding:4px 6px;border:1px solid #2b3244;border-radius:5px;background:#171c29;color:#e8ecf4">
        <span style="flex:1;font-weight:600">${label}</span>
      </div>
      <div style="font-size:10px;line-height:1.5;opacity:.52;padding-inline-start:36px">${desc}</div>`;
    rows.appendChild(row);
  });

  function syncInputs(){
    rows.querySelectorAll('input').forEach(i => { i.value = state[i.dataset.k] });
  }

  function paint(){
    FIELDS.forEach(([k]) => HOST.style.setProperty(k, state[k]));
    // Glows always follow their base colour, so they can never drift out of sync.
    HOST.style.setProperty('--accent-glow', rgbaOf(state['--accent'], .22));
    HOST.style.setProperty('--gold-glow',   rgbaOf(state['--gold'],   .25));
    HOST.style.setProperty('--green-glow',  rgbaOf(state['--green'],  .20));
    drawContrast();
  }

  function drawContrast(){
    P.querySelector('#tlContrast').innerHTML = PAIRS.map(([fg,bg,label])=>{
      const r  = ratio(state[fg], state[bg]);
      const ok = r>=4.5, warn = r>=3;
      const col = ok?'#4ade80':warn?'#fbbf24':'#f87171';
      return `<div style="display:flex;justify-content:space-between;gap:8px">
                <span style="opacity:.8">${label}</span>
                <span style="color:${col};font-family:monospace;font-weight:700">${ok?'AA':warn?'!!':'XX'} ${r.toFixed(2)}</span>
              </div>`;
    }).join('');
  }

  rows.addEventListener('input', e => {
    const k = e.target.dataset.k;
    if(!k) return;
    if(e.target.dataset.role === 'pick'){
      state[k] = e.target.value;
      rows.querySelector(`input[data-role="hex"][data-k="${k}"]`).value = state[k];
      paint();
    } else {
      // Typing is validated but not corrected mid-keystroke, so a half-typed
      // value doesn't get rewritten under the cursor.
      const v = clean(e.target.value);
      e.target.style.borderColor = v ? '#2b3244' : '#f87171';
      if(v){
        state[k] = v;
        rows.querySelector(`input[data-role="pick"][data-k="${k}"]`).value = v;
        paint();
      }
    }
  });
  rows.addEventListener('change', e => {
    if(e.target.dataset.role === 'hex'){
      e.target.value = state[e.target.dataset.k];   // tidy up on blur
      e.target.style.borderColor = '#2b3244';
    }
  });

  /* ---------- drag ---------- */
  // Anchored by left/top once dragging starts, so it can be parked anywhere —
  // the panel covers whatever you are trying to look at otherwise.
  (() => {
    const bar = P.querySelector('#tlBar');
    let dx=0, dy=0, dragging=false;
    bar.addEventListener('pointerdown', e => {
      dragging = true;
      const r = P.getBoundingClientRect();
      dx = e.clientX - r.left; dy = e.clientY - r.top;
      P.style.right = 'auto'; P.style.left = r.left + 'px'; P.style.top = r.top + 'px';
      bar.style.cursor = 'grabbing';
      bar.setPointerCapture(e.pointerId);
    });
    bar.addEventListener('pointermove', e => {
      if(!dragging) return;
      const x = Math.min(Math.max(0, e.clientX - dx), innerWidth  - P.offsetWidth);
      const y = Math.min(Math.max(0, e.clientY - dy), innerHeight - 40);
      P.style.left = x + 'px'; P.style.top = y + 'px';
    });
    const stop = e => { dragging = false; bar.style.cursor = 'grab';
                        try{ bar.releasePointerCapture(e.pointerId) }catch(_){} };
    bar.addEventListener('pointerup', stop);
    bar.addEventListener('pointercancel', stop);
  })();

  /* ---------- buttons ---------- */
  const clearAll = () => {
    FIELDS.forEach(([k]) => HOST.style.removeProperty(k));
    ['--accent-glow','--gold-glow','--green-glow'].forEach(k => HOST.style.removeProperty(k));
  };

  P.querySelector('#tlReset').onclick = () => {
    clearAll();
    FIELDS.forEach(([k]) => state[k] = hex(cs().getPropertyValue(k)));
    syncInputs(); drawContrast();
  };
  P.querySelector('#tlClose').onclick = () => { clearAll(); P.remove() };

  P.querySelector('#tlCopy').onclick = () => {
    const g = k => cs().getPropertyValue(k).trim();
    const s = k => state[k];
    const css =
`[data-theme="${cur()}"] {
  --bg: ${s('--bg')}; --bg-card: ${s('--bg-card')}; --bg-card2: ${s('--bg-card2')};
  --border: ${s('--border')}; --border-light: ${s('--border-light')};
  --text: ${s('--text')}; --text-mid: ${s('--text-mid')}; --text-soft: ${s('--text-soft')};
  --accent: ${s('--accent')}; --accent-light: ${s('--accent-light')}; --accent-glow: ${rgbaOf(s('--accent'),.22)};
  --gold: ${s('--gold')}; --gold-dark: ${s('--gold-dark')}; --gold-glow: ${rgbaOf(s('--gold'),.25)};
  --green: ${s('--green')}; --green-bg: ${g('--green-bg')}; --green-border: ${g('--green-border')}; --green-glow: ${rgbaOf(s('--green'),.20)};
  --red: ${s('--red')}; --red-bg: ${g('--red-bg')}; --red-border: ${g('--red-border')}; --red-glow: ${g('--red-glow')};
  --header-bg: ${s('--header-bg')}; --slot-hover-num: ${s('--slot-hover-num')};
  --confetti1:${s('--accent')};--confetti2:${s('--gold')};--confetti3:${s('--green')};--confetti4:${s('--accent-light')};
  --on-accent: ${s('--on-accent')};
}`;
    navigator.clipboard.writeText(css).then(
      ()=>{ const b=P.querySelector('#tlCopy'); b.textContent='تم النسخ ✓'; setTimeout(()=>b.textContent='نسخ CSS',1600) },
      ()=>console.log(css));
    console.log(css);
  };

  paint();
  console.log('%cمختبر الثيمات ٢ جاهز — اسحب اللوحة من رأسها، واكتب الكود في الخانة أو استخدم المنتقي.',
              'color:#4ade80;font-weight:700');
})();
