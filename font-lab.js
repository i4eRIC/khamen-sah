/* ============================================================
   مختبر الخطوط — خمّن صح
   انسخ الملف كاملاً والصقه في وحدة تحكم المتصفح (F12 ← Console).
   يشتغل في أي شاشة، لكن الأفضل داخل شاشة اللعب لأن أغلب
   العناصر تظهر فيها.

   • يمسح أوراق الأنماط ويوزّع كل مُحدِّد على ثلاثة أدوار:
     عرض (العناوين والأرقام الكبيرة) · نص · أرقام وأكواد
   • لكل دور: خط جاهز من Google أو خط تكتب اسمه بنفسك،
     ووزن، ومقياس حجم يضرب كل أحجام ذلك الدور
   • اسحب اللوحة من رأسها لأي مكان
   • «نسخ CSS» يعطيك كتلة جاهزة تُلصق في آخر style.css
     مع سطر الرابط الذي تحتاجه في index.html

   التغييرات مؤقتة — أي تحديث للصفحة يمسحها.
   ============================================================ */
(() => {
  document.getElementById('fontLab')?.remove();
  document.getElementById('fontLabStyle')?.remove();

  /* ---------- الخطوط الجاهزة ---------- */
  // الوزن مكتوب صراحة لكل خط: طلب أوزان لا يملكها الخط يُفشل
  // الطلب كاملاً في Google Fonts ويرجع الخط الاحتياطي بلا سبب ظاهر.
  const FONTS = [
    ['AA Galaxy',            null,                'الخط الحالي (وزن واحد، بلا أرقام)'],
    ['Tajawal',              '400;500;700;800;900','نص — واضح وحديث'],
    ['Cairo',                '400;600;700;900',   'نص — الأوسع انتشاراً'],
    ['Almarai',              '300;400;700;800',   'نص — هادئ ومقروء'],
    ['IBM Plex Sans Arabic', '400;500;600;700',   'نص — تقني ومنضبط'],
    ['Noto Sans Arabic',     '400;600;700;900',   'نص — تغطية حروف كاملة'],
    ['Noto Kufi Arabic',     '400;600;700;900',   'عرض — كوفي عصري'],
    ['Readex Pro',           '400;600;700',       'نص — عريض قليلاً'],
    ['Alexandria',           '400;600;700;800',   'نص/عرض — هندسي'],
    ['Rubik',                '400;600;700;900',   'نص — أرقامه ممتازة'],
    ['Vazirmatn',            '400;600;700;900',   'نص — أرقام واضحة جداً'],
    ['Changa',               '400;600;700;800',   'عرض — حاد ورياضي'],
    ['Kufam',                '400;700;900',       'عرض — كوفي عريض'],
    ['El Messiri',           '400;600;700',       'عرض — طابع شرقي'],
    ['Reem Kufi',            '400;600;700',       'عرض — زخرفي'],
    ['Baloo Bhaijaan 2',     '400;600;700;800',   'عرض — مرح ومستدير'],
    ['Lalezar',              null,                'عرض — الاحتياطي الحالي'],
    ['Amiri',                '400;700',           'نسخ — كلاسيكي'],
    ['Aref Ruqaa',           '400;700',           'رقعة — للعناوين فقط'],
    ['Markazi Text',         '400;600;700',       'نص طويل — نحيف'],
  ];

  const ROLES = [
    ['display', 'العرض',        'العناوين والشعار والنقاط الكبيرة — كل ما فيه Lalezar اليوم',
     'خمّن صح'],
    ['text',    'النص',         'نص السؤال والأزرار وحقول الإدخال — كل ما فيه Tajawal اليوم',
     'ما أشهر حيوان أليف في البيوت؟'],
    ['nums',    'الأرقام والأكواد', 'كود البازر ورمز التفعيل والمؤقت وكل ما هو monospace',
     '0123456789 · ABC-7K2'],
  ];

  // المُحدِّدات ذات الطابع الرقمي: تُسحب من دور العرض إلى دور الأرقام
  // لأن الرقم يحتاج خطاً فيه أرقام أصلاً وبعرض ثابت، وهذا أهم من شكله.
  const NUM_SEL = /pts|score|-num\b|\.num\b|code|timer|led|count|digit|gate-input|buzzer/i;
  const SIZE_RE = /^([\d.]+)(rem|px|em)$/;

  /* ---------- المسح ---------- */
  const entries = [];                       // كل قاعدة فيها font-family أو font-size
  const walk = (list, media) => {
    for (const r of list) {
      // المُحدِّد يُفحص أولاً: المتصفحات الحديثة تعطي كل قاعدة عادية
      // قائمة cssRules فارغة (دعم التداخل)، فلو بدأنا بها لابتلعت كل شي.
      if (r.selectorText) {
        const fam = r.style.fontFamily, size = r.style.fontSize;
        if (fam || size) entries.push({ sel: r.selectorText, media, fam, size });
        if (r.cssRules?.length) walk(r.cssRules, media);
        continue;
      }
      // @media و @supports تحمل قواعد بداخلها؛ @font-face و @keyframes
      // تحمل تصريحات بلا مُحدِّد ولا تعنينا.
      if (r.cssRules) walk(r.cssRules, r.conditionText || r.media?.mediaText || media);
    }
  };
  for (const sh of document.styleSheets) {
    // ورقة خطوط Google خارجية، وقراءتها ترمي خطأ CORS — وتجاهلها سليم
    // لأنها لا تحوي قواعد تخصّ عناصر اللعبة.
    try { walk(sh.cssRules, '') } catch (_) {}
  }

  const roleOf = (part, fam) => {
    if (/monospace/i.test(fam)) return 'nums';
    if (NUM_SEL.test(part))     return 'nums';
    if (/Lalezar|cursive/i.test(fam)) return 'display';
    return 'text';
  };

  // خريطة: مُحدِّد مفرد ← دوره. تُبنى من القواعد التي تصرّح بعائلة خط،
  // ثم تُستخدم لتوجيه قواعد الحجم (وأكثرها داخل @media) إلى نفس الدور.
  const roleBySel = new Map();
  entries.forEach(e => {
    if (!e.fam) return;
    e.sel.split(',').map(s => s.trim()).filter(Boolean)
      .forEach(p => { if (!roleBySel.has(p)) roleBySel.set(p, roleOf(p, e.fam)) });
  });

  const sels  = { display: [], text: [], nums: [] };
  const sizes = { display: [], text: [], nums: [] };
  roleBySel.forEach((role, p) => sels[role].push(p));
  entries.forEach(e => {
    if (!e.size) return;
    const m = e.size.trim().match(SIZE_RE);
    if (!m) return;                          // clamp() و calc() تُترك كما هي
    e.sel.split(',').map(s => s.trim()).forEach(p => {
      const role = roleBySel.get(p);
      if (role) sizes[role].push({ sel: p, media: e.media, n: +m[1], unit: m[2] });
    });
  });

  const total = sels.display.length + sels.text.length + sels.nums.length;
  if (!total) {
    console.warn('مختبر الخطوط: ما لقيت أي قاعدة خط قابلة للقراءة. افتح اللعبة من الخادم لا من ملف مباشر.');
    return;
  }

  /* ---------- الحالة ---------- */
  const state = {
    display: { font: 'AA Galaxy', weight: '', scale: 1 },
    text:    { font: 'AA Galaxy', weight: '', scale: 1 },
    nums:    { font: 'AA Galaxy', weight: '', scale: 1, tabular: false },
  };

  const loadFont = name => {
    const meta = FONTS.find(f => f[0] === name);
    if (!meta || name === 'AA Galaxy') return;               // خط محلي، لا يُحمّل
    const id = 'fl-' + name.replace(/\W+/g, '-');
    if (document.getElementById(id)) return;
    const l = document.createElement('link');
    l.id = id; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=' +
             name.replace(/ /g, '+') + (meta[1] ? ':wght@' + meta[1] : '') + '&display=swap';
    document.head.appendChild(l);
  };
  const linkHref = () => {
    const fams = [...new Set(Object.values(state).map(s => s.font))]
      .map(n => FONTS.find(f => f[0] === n))
      .filter(m => m && m[0] !== 'AA Galaxy')
      .map(m => 'family=' + m[0].replace(/ /g, '+') + (m[1] ? ':wght@' + m[1] : ''));
    return fams.length
      ? 'https://fonts.googleapis.com/css2?' + fams.join('&') + '&display=swap'
      : null;
  };
  const stackOf = role => {
    const f = state[role].font;
    const tail = role === 'nums' ? "'Tajawal',monospace"
               : role === 'display' ? "'Lalezar',cursive"
               : "'Tajawal',sans-serif";
    return f === 'AA Galaxy' ? "'AA Galaxy'," + tail : `'${f}','AA Galaxy',` + tail;
  };

  /* ---------- التطبيق ---------- */
  const sheet = document.createElement('style');
  sheet.id = 'fontLabStyle';
  document.head.appendChild(sheet);          // آخر الرأس، فيغلب style.css عند تساوي الخصوصية

  const buildCSS = () => {
    const out = [];
    ROLES.forEach(([role]) => {
      if (!sels[role].length) return;
      const decl = [`font-family:${stackOf(role)}`];
      if (state[role].weight) decl.push(`font-weight:${state[role].weight}`);
      if (role === 'nums' && state.nums.tabular) decl.push('font-variant-numeric:tabular-nums');
      out.push(`${sels[role].join(',')} { ${decl.join('; ')} }`);
    });
    // أحجام كل دور تُضرب بمقياسه، ويعاد لفّ ما كان داخل @media
    // في استعلامه نفسه وإلا انكسرت المقاسات عند نقاط الانكسار.
    const byMedia = new Map();
    ROLES.forEach(([role]) => {
      const k = state[role].scale;
      if (k === 1) return;
      sizes[role].forEach(s => {
        const line = `${s.sel} { font-size:${+(s.n * k).toFixed(3)}${s.unit} }`;
        if (!byMedia.has(s.media)) byMedia.set(s.media, []);
        byMedia.get(s.media).push(line);
      });
    });
    byMedia.forEach((lines, media) => {
      out.push(media ? `@media ${media} {\n  ${lines.join('\n  ')}\n}` : lines.join('\n'));
    });
    return out.join('\n');
  };

  const paint = () => { sheet.textContent = buildCSS(); syncPreview() };

  /* ---------- اللوحة ---------- */
  const P = document.createElement('div');
  P.id = 'fontLab';
  P.style.cssText = [
    'position:fixed','left:auto','right:14px','top:14px','z-index:2147483647',
    'width:340px','max-height:90vh','display:flex','flex-direction:column','direction:rtl',
    'background:#101420','color:#e8ecf4','border:1px solid #2b3244','border-radius:12px',
    'font-family:system-ui,sans-serif','font-size:12px','box-shadow:0 20px 60px rgba(0,0,0,.6)'
  ].join(';');

  const opts = FONTS.map(([n,,note]) =>
    `<option value="${n}">${n} — ${note}</option>`).join('');
  const weights = ['', '400','500','600','700','800','900'].map(w =>
    `<option value="${w}">${w || 'بدون تغيير'}</option>`).join('');

  P.innerHTML = `
    <div id="flBar" style="display:flex;align-items:center;justify-content:space-between;gap:8px;
         padding:10px 12px;border-bottom:1px solid #2b3244;cursor:grab;user-select:none;flex:none">
      <b style="font-size:13px">مختبر الخطوط</b>
      <span style="font-size:10px;opacity:.5">اسحب من هنا</span>
      <code style="font-size:10px;opacity:.6">${total} مُحدِّد</code>
    </div>
    <div id="flBody" style="overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:14px;flex:1">
      ${ROLES.map(([id,label,desc]) => `
        <div style="display:flex;flex-direction:column;gap:6px;border:1px solid #222838;border-radius:9px;padding:9px">
          <div style="display:flex;align-items:baseline;gap:6px">
            <b style="font-size:12px">${label}</b>
            <span style="font-size:10px;opacity:.5">${sels[id].length} مُحدِّد · ${sizes[id].length} حجم</span>
          </div>
          <div style="font-size:10px;line-height:1.5;opacity:.52">${desc}</div>
          <select data-r="${id}" data-k="font"
                  style="width:100%;padding:5px;border:1px solid #2b3244;border-radius:6px;
                         background:#171c29;color:#e8ecf4;font-family:inherit;font-size:11px">${opts}</select>
          <input type="text" data-r="${id}" data-k="custom" placeholder="أو اكتب اسم خط مثبّت عندك" spellcheck="false"
                 style="width:100%;padding:5px 7px;border:1px solid #2b3244;border-radius:6px;
                        background:#171c29;color:#e8ecf4;font-family:inherit;font-size:11px">
          <div style="display:flex;align-items:center;gap:6px">
            <span style="opacity:.6;font-size:10px;flex:none">الوزن</span>
            <select data-r="${id}" data-k="weight"
                    style="flex:1;padding:4px;border:1px solid #2b3244;border-radius:6px;
                           background:#171c29;color:#e8ecf4;font-family:inherit;font-size:11px">${weights}</select>
            <span style="opacity:.6;font-size:10px;flex:none">الحجم</span>
            <input type="range" data-r="${id}" data-k="scale" min="0.8" max="1.35" step="0.05" value="1"
                   style="flex:1;accent-color:#3b82f6">
            <code data-out="${id}" style="font-size:10px;opacity:.7;width:30px;flex:none">1.00</code>
          </div>
          ${id === 'nums' ? `<label style="display:flex;align-items:center;gap:6px;font-size:10px;opacity:.75">
            <input type="checkbox" data-r="nums" data-k="tabular" style="accent-color:#3b82f6">
            أرقام بعرض ثابت (لا يهتزّ المؤقت)</label>` : ''}
          <div data-prev="${id}" style="padding:8px;border-radius:6px;background:#0a0d15;text-align:center;
               font-size:${id === 'display' ? '22px' : id === 'nums' ? '17px' : '14px'};line-height:1.6;
               ${id === 'nums' ? 'direction:ltr;' : ''}">${ROLES.find(r => r[0] === id)[3]}</div>
          <details style="font-size:10px;opacity:.6">
            <summary style="cursor:pointer">المُحدِّدات</summary>
            <div style="direction:ltr;text-align:left;font-family:monospace;font-size:9px;line-height:1.6;
                 max-height:110px;overflow:auto;margin-top:4px">${sels[id].join('<br>') || '—'}</div>
          </details>
        </div>`).join('')}
    </div>
    <div style="display:flex;gap:6px;padding:10px 12px;border-top:1px solid #2b3244;flex:none">
      <button id="flCopy"  style="flex:1;padding:8px;border:0;border-radius:7px;background:#3b82f6;color:#fff;font-weight:700;cursor:pointer;font-family:inherit;font-size:12px">نسخ CSS</button>
      <button id="flReset" style="padding:8px 11px;border:1px solid #2b3244;border-radius:7px;background:transparent;color:#93a0b5;cursor:pointer;font-family:inherit;font-size:12px">تصفير</button>
      <button id="flClose" style="padding:8px 11px;border:1px solid #2b3244;border-radius:7px;background:transparent;color:#93a0b5;cursor:pointer;font-family:inherit;font-size:12px">إغلاق</button>
    </div>`;
  document.body.appendChild(P);

  function syncPreview() {
    ROLES.forEach(([id]) => {
      const el = P.querySelector(`[data-prev="${id}"]`);
      el.style.fontFamily = stackOf(id);
      el.style.fontWeight = state[id].weight || 'normal';
      if (id === 'nums') el.style.fontVariantNumeric = state.nums.tabular ? 'tabular-nums' : 'normal';
      P.querySelector(`[data-out="${id}"]`).textContent = state[id].scale.toFixed(2);
    });
  }

  P.querySelector('#flBody').addEventListener('input', e => {
    const r = e.target.dataset.r, k = e.target.dataset.k;
    if (!r || !k) return;
    if (k === 'font') {
      state[r].font = e.target.value;
      P.querySelector(`input[data-r="${r}"][data-k="custom"]`).value = '';
      loadFont(state[r].font);
    } else if (k === 'custom') {
      // اسم مكتوب باليد = خط مثبّت على الجهاز؛ لا يُحمّل ولا يدخل رابط Google.
      const v = e.target.value.trim();
      state[r].font = v || P.querySelector(`select[data-r="${r}"][data-k="font"]`).value;
    } else if (k === 'weight') {
      state[r].weight = e.target.value;
    } else if (k === 'scale') {
      state[r].scale = +e.target.value;
    } else if (k === 'tabular') {
      state[r].tabular = e.target.checked;
    }
    paint();
  });

  /* ---------- السحب ---------- */
  (() => {
    const bar = P.querySelector('#flBar');
    let dx = 0, dy = 0, dragging = false;
    bar.addEventListener('pointerdown', e => {
      dragging = true;
      const r = P.getBoundingClientRect();
      dx = e.clientX - r.left; dy = e.clientY - r.top;
      P.style.right = 'auto'; P.style.left = r.left + 'px'; P.style.top = r.top + 'px';
      bar.style.cursor = 'grabbing';
      bar.setPointerCapture(e.pointerId);
    });
    bar.addEventListener('pointermove', e => {
      if (!dragging) return;
      const x = Math.min(Math.max(0, e.clientX - dx), innerWidth  - P.offsetWidth);
      const y = Math.min(Math.max(0, e.clientY - dy), innerHeight - 40);
      P.style.left = x + 'px'; P.style.top = y + 'px';
    });
    const stop = e => { dragging = false; bar.style.cursor = 'grab';
                        try { bar.releasePointerCapture(e.pointerId) } catch (_) {} };
    bar.addEventListener('pointerup', stop);
    bar.addEventListener('pointercancel', stop);
  })();

  /* ---------- الأزرار ---------- */
  P.querySelector('#flReset').onclick = () => {
    ROLES.forEach(([id]) => {
      state[id] = { font: 'AA Galaxy', weight: '', scale: 1, tabular: false };
      P.querySelector(`select[data-r="${id}"][data-k="font"]`).value  = 'AA Galaxy';
      P.querySelector(`input[data-r="${id}"][data-k="custom"]`).value = '';
      P.querySelector(`select[data-r="${id}"][data-k="weight"]`).value = '';
      P.querySelector(`input[data-r="${id}"][data-k="scale"]`).value  = 1;
    });
    const tb = P.querySelector('input[data-k="tabular"]'); if (tb) tb.checked = false;
    paint();
  };
  P.querySelector('#flClose').onclick = () => { sheet.remove(); P.remove() };

  P.querySelector('#flCopy').onclick = () => {
    const href = linkHref();
    const css =
`/* ===== مختبر الخطوط — الصق هذه الكتلة في آخر style.css ===== */
${href ? `/* وفي <head> داخل index.html:\n   <link href="${href}" rel="stylesheet"> */\n` : ''}
${buildCSS()}`;
    navigator.clipboard.writeText(css).then(
      () => { const b = P.querySelector('#flCopy'); b.textContent = 'تم النسخ ✓';
              setTimeout(() => b.textContent = 'نسخ CSS', 1600) },
      () => console.log(css));
    console.log(css);
  };

  paint();
  console.log('%cمختبر الخطوط جاهز — ' + sels.display.length + ' عرض · ' +
              sels.text.length + ' نص · ' + sels.nums.length + ' أرقام.',
              'color:#4ade80;font-weight:700');
})();
