/* ============================================================
   مختبر الثيمات — خمّن صح
   انسخ هذا الملف كاملاً والصقه في وحدة تحكم المتصفح (F12 ← Console)
   وأنت داخل اللعبة. راح تطلع لوحة تعديل مباشر.

   • غيّر أي لون وشوف أثره على اللعبة فوراً
   • اللوحة تحسب التباين للأزواج الحرجة وتحذّرك لو نزل عن AA
   • «نسخ CSS» يعطيك كتلة الثيم كاملة جاهزة للصق في style.css

   لإغلاقها: زر «إغلاق»، أو حدّث الصفحة (التغييرات مؤقتة).
   ============================================================ */
(() => {
  const OLD = document.getElementById('themeLab');
  if (OLD) OLD.remove();

  // The game sets data-theme on <body>, so that is where the theme rule lands.
  // Inline styles must go on the same element to win the cascade.
  const HOST = document.body;
  const cs = () => getComputedStyle(HOST);
  const cur = () => HOST.getAttribute('data-theme') || 'sand';

  const FIELDS = [
    ['--bg',              'خلفية الصفحة'],
    ['--bg-card',         'خلفية البطاقات'],
    ['--bg-card2',        'خلفية ثانوية'],
    ['--border',          'حدّ'],
    ['--border-light',    'حدّ فاتح'],
    ['--text',            'نص أساسي'],
    ['--text-mid',        'نص ثانوي'],
    ['--text-soft',       'نص خافت'],
    ['--accent',          'اللون المميز'],
    ['--accent-light',    'المميز الفاتح'],
    ['--on-accent',       'نص فوق المميز'],
    ['--gold',            'ذهبي'],
    ['--gold-dark',       'ذهبي غامق'],
    ['--green',           'أخضر'],
    ['--red',             'سطح أحمر'],
    ['--header-bg',       'خلفية الرأس'],
    ['--slot-hover-num',  'تمرير الرقم'],
  ];

  // Pairs that actually decide legibility in this game. --gold on --accent is
  // the one that broke every stock theme: the active team's points sit on the
  // accent card in gold.
  const PAIRS = [
    ['--gold',      '--accent', 'نقاط الفريق النشط'],
    ['--on-accent', '--accent', 'نص الأزرار المميزة'],
    ['--text',      '--bg',     'النص على الخلفية'],
    ['--text-mid',  '--bg',     'النص الثانوي'],
    ['--bg',        '--gold',   'النص على الذهبي'],
  ];

  const hex = v => {
    v = (v || '').trim();
    if (v.startsWith('#')) return v.length === 4
      ? '#' + [1,2,3].map(i => v[i] + v[i]).join('') : v.slice(0,7);
    const m = v.match(/rgba?\(([^)]+)\)/);
    if (!m) return '#000000';
    const [r,g,b] = m[1].split(',').map(n => parseInt(n));
    return '#' + [r,g,b].map(n => n.toString(16).padStart(2,'0')).join('');
  };
  const lum = h => {
    const c = h.replace('#','');
    const v = [0,2,4].map(i => { const s = parseInt(c.substr(i,2),16)/255;
      return s <= 0.03928 ? s/12.92 : Math.pow((s+0.055)/1.055, 2.4); });
    return 0.2126*v[0] + 0.7152*v[1] + 0.0722*v[2];
  };
  const ratio = (a,b) => { const [x,y] = [lum(a),lum(b)].sort((m,n)=>n-m); return (x+0.05)/(y+0.05) };
  const rgbaOf = (h, a) => {
    const c = h.replace('#','');
    return 'rgba(' + [0,2,4].map(i => parseInt(c.substr(i,2),16)).join(',') + ',' + a + ')';
  };

  const state = {};
  FIELDS.forEach(([k]) => state[k] = hex(cs().getPropertyValue(k)));

  const panel = document.createElement('div');
  panel.id = 'themeLab';
  panel.style.cssText = [
    'position:fixed','inset-inline-end:14px','inset-block-start:14px','z-index:99999',
    'width:290px','max-height:88vh','overflow-y:auto','direction:rtl',
    'background:#12151d','color:#e8ecf4','border:1px solid #2b3244','border-radius:12px',
    'font-family:system-ui,sans-serif','font-size:12px','box-shadow:0 18px 50px rgba(0,0,0,.55)',
    'padding:12px','user-select:none'
  ].join(';');

  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px">
      <b style="font-size:13px">مختبر الثيمات</b>
      <span id="tlTheme" style="font-size:10px;opacity:.6;font-family:monospace"></span>
    </div>
    <div id="tlFields" style="display:flex;flex-direction:column;gap:5px"></div>
    <div style="margin:11px 0 8px;padding-top:9px;border-top:1px solid #2b3244">
      <b style="font-size:11px;opacity:.75">التباين</b>
      <div id="tlContrast" style="margin-top:6px;display:flex;flex-direction:column;gap:3px"></div>
    </div>
    <div style="display:flex;gap:6px">
      <button id="tlCopy"  style="flex:1;padding:8px;border:0;border-radius:7px;background:#3b82f6;color:#fff;font-weight:700;cursor:pointer;font-family:inherit">نسخ CSS</button>
      <button id="tlReset" style="padding:8px 11px;border:1px solid #2b3244;border-radius:7px;background:transparent;color:#93a0b5;cursor:pointer;font-family:inherit">تصفير</button>
      <button id="tlClose" style="padding:8px 11px;border:1px solid #2b3244;border-radius:7px;background:transparent;color:#93a0b5;cursor:pointer;font-family:inherit">إغلاق</button>
    </div>`;
  document.body.appendChild(panel);

  panel.querySelector('#tlTheme').textContent = cur();

  const rows = panel.querySelector('#tlFields');
  FIELDS.forEach(([key, label]) => {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:center;gap:7px;cursor:pointer';
    row.innerHTML = `
      <input type="color" value="${state[key]}" data-k="${key}"
             style="width:26px;height:22px;padding:0;border:1px solid #2b3244;border-radius:5px;background:none;cursor:pointer;flex:none">
      <span style="flex:1">${label}</span>
      <code style="font-size:9.5px;opacity:.5;direction:ltr">${key.replace('--','')}</code>`;
    rows.appendChild(row);
  });

  function paint(){
    FIELDS.forEach(([k]) => HOST.style.setProperty(k, state[k]));
    // Glows are always the base colour at low alpha — deriving them keeps the
    // panel to 17 pickers instead of 29 and they can never drift out of sync.
    HOST.style.setProperty('--accent-glow', rgbaOf(state['--accent'], .22));
    HOST.style.setProperty('--gold-glow',   rgbaOf(state['--gold'],   .25));
    HOST.style.setProperty('--green-glow',  rgbaOf(state['--green'],  .20));
    drawContrast();
  }

  function drawContrast(){
    const box = panel.querySelector('#tlContrast');
    box.innerHTML = PAIRS.map(([fg,bg,label]) => {
      const r = ratio(state[fg], state[bg]);
      const ok = r >= 4.5, warn = r >= 3;
      const col = ok ? '#4ade80' : warn ? '#fbbf24' : '#f87171';
      const tag = ok ? 'AA' : warn ? '!!' : 'XX';
      return `<div style="display:flex;justify-content:space-between;gap:8px">
                <span style="opacity:.8">${label}</span>
                <span style="color:${col};font-family:monospace;font-weight:700">${tag} ${r.toFixed(2)}</span>
              </div>`;
    }).join('');
  }

  rows.addEventListener('input', e => {
    if(e.target.type !== 'color') return;
    state[e.target.dataset.k] = e.target.value;
    paint();
  });

  panel.querySelector('#tlReset').onclick = () => {
    FIELDS.forEach(([k]) => HOST.style.removeProperty(k));
    ['--accent-glow','--gold-glow','--green-glow'].forEach(k => HOST.style.removeProperty(k));
    FIELDS.forEach(([k]) => state[k] = hex(cs().getPropertyValue(k)));
    rows.querySelectorAll('input[type=color]').forEach(i => i.value = state[i.dataset.k]);
    drawContrast();
  };

  panel.querySelector('#tlClose').onclick = () => {
    FIELDS.forEach(([k]) => HOST.style.removeProperty(k));
    ['--accent-glow','--gold-glow','--green-glow'].forEach(k => HOST.style.removeProperty(k));
    panel.remove();
  };

  panel.querySelector('#tlCopy').onclick = () => {
    const g = k => cs().getPropertyValue(k).trim();
    const css =
`[data-theme="${cur()}"] {
  --bg: ${state['--bg']}; --bg-card: ${state['--bg-card']}; --bg-card2: ${state['--bg-card2']};
  --border: ${state['--border']}; --border-light: ${state['--border-light']};
  --text: ${state['--text']}; --text-mid: ${state['--text-mid']}; --text-soft: ${state['--text-soft']};
  --accent: ${state['--accent']}; --accent-light: ${state['--accent-light']}; --accent-glow: ${rgbaOf(state['--accent'],.22)};
  --gold: ${state['--gold']}; --gold-dark: ${state['--gold-dark']}; --gold-glow: ${rgbaOf(state['--gold'],.25)};
  --green: ${state['--green']}; --green-bg: ${g('--green-bg')}; --green-border: ${g('--green-border')}; --green-glow: ${rgbaOf(state['--green'],.20)};
  --red: ${state['--red']}; --red-bg: ${g('--red-bg')}; --red-border: ${g('--red-border')}; --red-glow: ${g('--red-glow')};
  --header-bg: ${state['--header-bg']}; --slot-hover-num: ${state['--slot-hover-num']};
  --confetti1:${state['--accent']};--confetti2:${state['--gold']};--confetti3:${state['--green']};--confetti4:${state['--accent-light']};
  --on-accent: ${state['--on-accent']};
}`;
    navigator.clipboard.writeText(css).then(
      () => { const b = panel.querySelector('#tlCopy'); b.textContent = 'تم النسخ ✓'; setTimeout(()=>b.textContent='نسخ CSS',1600) },
      () => console.log(css)
    );
    console.log(css);
  };

  paint();
  console.log('%cمختبر الثيمات جاهز — غيّر الألوان من اللوحة، وزر «نسخ CSS» يعطيك الكتلة كاملة.',
              'color:#4ade80;font-weight:700');
})();
