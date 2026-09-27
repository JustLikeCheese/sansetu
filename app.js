/* 三色图制作器 */
(() => {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  // ---------- 常量 ----------
  const KEYS = ['a', 'b', 'c', 'ab', 'ac', 'bc', 'abc'];
  const MASK = { a: 1, b: 2, c: 4, ab: 3, ac: 5, bc: 6, abc: 7 };
  const AXIS = { a: -90, b: 150, c: 30, ab: 210, ac: -30, bc: 90 };
  const LINE_H = 1.15;
  const EFFECT = 0.5; // 中心字特效时长（秒）
  const FPS_MIN = 1, FPS_MAX = 120;
  // 各格式的帧率上限：GIF 延时以 1/100 秒计，最短 2/100 秒；
  // 浏览器会把 ≤10 毫秒的动图帧拉慢到 100 毫秒，所以 APNG / WebP 限 60；视频按屏幕刷新率实时录制
  const FPS_CAP = { gif: 50, apng: 60, webpa: 60, video: 120 };
  const ANIM_KINDS = ['gif', 'apng', 'webpa', 'video'];
  const VIDEO_TYPES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const STORE_KEY = 'sansetu:v1';
  const LANG_KEY = 'sansetu:lang';

  const GF = 'https://fonts.googleapis.com/css2?family=';
  const FONTS = {
    sans: { family: 'Noto Sans SC', css: GF + 'Noto+Sans+SC:wght@400;700&display=swap', fallback: '"Source Han Sans SC","PingFang SC","Microsoft YaHei",sans-serif' },
    sansTC: { family: 'Noto Sans TC', css: GF + 'Noto+Sans+TC:wght@400;700&display=swap', fallback: '"Source Han Sans TC","PingFang TC","Microsoft JhengHei",sans-serif' },
    sansJP: { family: 'Noto Sans JP', css: GF + 'Noto+Sans+JP:wght@400;700&display=swap', fallback: '"Hiragino Sans","Yu Gothic","Meiryo",sans-serif' },
    serif: { family: 'Noto Serif SC', css: GF + 'Noto+Serif+SC:wght@400;700&display=swap', fallback: '"Source Han Serif SC","Songti SC","SimSun",serif' },
    kuaile: { family: 'ZCOOL KuaiLe', css: GF + 'ZCOOL+KuaiLe&display=swap', fallback: '"PingFang SC","Microsoft YaHei",sans-serif' },
    xiaowei: { family: 'ZCOOL XiaoWei', css: GF + 'ZCOOL+XiaoWei&display=swap', fallback: '"Songti SC","SimSun",serif' },
    mashan: { family: 'Ma Shan Zheng', css: GF + 'Ma+Shan+Zheng&display=swap', fallback: '"KaiTi","STKaiti",serif' },
    longcang: { family: 'Long Cang', css: GF + 'Long+Cang&display=swap', fallback: '"KaiTi","STKaiti",serif' },
    system: { family: null, css: null, fallback: 'system-ui,"PingFang SC","Microsoft YaHei",sans-serif' },
  };

  // ---------- 多语言 ----------
  const storageGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const storageSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* 无痕模式等 */ } };

  function detectLang() {
    const q = new URLSearchParams(location.search).get('lang');
    for (const c of [q, storageGet(LANG_KEY), ...(navigator.languages || [navigator.language])]) {
      const m = I18N.match(c);
      if (m) return m;
    }
    return 'en';
  }
  let lang = detectLang();

  function t(key, params) {
    const msg = (I18N.messages[lang] || {})[key] ?? I18N.messages.en[key] ?? key;
    return params ? msg.replace(/\{(\w+)\}/g, (m, k) => (params[k] ?? m)) : msg;
  }
  const textPresets = () => I18N.presets[lang];
  const fontStack = key => {
    const f = FONTS[key] || FONTS.sans;
    return (f.family ? `"${f.family}",` : '') + f.fallback;
  };
  const fmtName = kind => ({ gif: 'GIF', apng: 'APNG', webpa: t('fmtWebpAnim'), video: t('fmtVideo') }[kind]);

  const region = (fill, color) => ({ text: '', fill, color, size: 104, bold: false, dx: 0, dy: 0 });
  // 原图文字是手工摆放的，略偏离对称位置，这里还原出来
  const ORIGINAL_OFFSETS = [[13, -2], [9, 0], [5, 0], [-4, -3], [6, -3], [-2, -2], [7, 2]];
  const BASE = {
    regions: {
      a: region('#da3e41', '#000000'),
      b: region('#efe84d', '#000000'),
      c: region('#53b0db', '#000000'),
      ab: region('#ec9e3b', '#ffffff'),
      ac: region('#7766a7', '#ffffff'),
      bc: region('#299c7b', '#ffffff'),
      abc: region('#37363a', '#ffffff'),
    },
    radius: 299,
    gap: 100,
    scale: { a: 100, b: 100, c: 100 },
    strokeWidth: 0,
    strokeColor: '#ffffff',
    font: 'sans',
    textScale: 100,
    textStrokeWidth: 0,
    textStrokeColor: '#000000',
    bg: '#ffffff',
    transparent: false,
    padding: 16,
    square: true,
    exportScale: 1,
    anim: { turns: 2, dir: 1, spin: 1.6, hold: 1.2, easing: 'outCubic', center: 'pop', upright: false, fps: 25, size: 360, loop: true },
  };

  function applyTextPreset(st, p) {
    KEYS.forEach((k, i) => {
      const [dx, dy] = p.original ? ORIGINAL_OFFSETS[i] : [0, 0];
      Object.assign(st.regions[k], { text: p.t[i], size: p.s[i], dx, dy, bold: k === 'abc' });
    });
  }

  // 默认图：用当前语言的第一套文案
  function defaults() {
    const st = clone(BASE);
    applyTextPreset(st, textPresets()[0]);
    st.font = I18N.defaultFont[lang] || 'sans';
    return st;
  }

  // 配色预设：底色 / 字色（同 KEYS 顺序）/ 背景
  const COLOR_PRESETS = [
    { name: 'colorOriginal', fill: ['#da3e41', '#efe84d', '#53b0db', '#ec9e3b', '#7766a7', '#299c7b', '#37363a'], color: ['#000000', '#000000', '#000000', '#ffffff', '#ffffff', '#ffffff', '#ffffff'], bg: '#ffffff' },
    { name: 'colorMacaron', fill: ['#ffadb5', '#ffe79a', '#9fd3f5', '#f5a15e', '#9b83d9', '#5fbf94', '#ef5d7f'], color: ['#4a3b3b', '#4a3b3b', '#4a3b3b', '#ffffff', '#ffffff', '#ffffff', '#ffffff'], bg: '#fffaf4' },
    { name: 'colorNeon', fill: ['#ff2e63', '#f9ed69', '#08d9d6', '#ff8c42', '#9d4edd', '#2ec27e', '#ffffff'], color: ['#111111', '#111111', '#111111', '#111111', '#ffffff', '#111111', '#111111'], bg: '#15151f' },
    { name: 'colorMorandi', fill: ['#c9a3a0', '#dccfae', '#9fb2bf', '#b88a73', '#8d88a6', '#7f9a82', '#4f4a4a'], color: ['#3b3434', '#3b3434', '#3b3434', '#ffffff', '#ffffff', '#ffffff', '#ffffff'], bg: '#f3f0ea' },
    { name: 'colorMono', fill: ['#e8e8e8', '#c4c4c4', '#a0a0a0', '#7a7a7a', '#5c5c5c', '#444444', '#111111'], color: ['#111111', '#111111', '#111111', '#ffffff', '#ffffff', '#ffffff', '#ffffff'], bg: '#ffffff' },
  ];

  // ---------- 工具 ----------
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const isHex = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // 让出主线程：用 MessageChannel 而不是 setTimeout，切到后台标签页时不会被限流到每秒一次
  const tick = (() => {
    const ch = new MessageChannel(), queue = [];
    ch.port1.onmessage = () => queue.shift()();
    return () => new Promise(r => { queue.push(r); ch.port2.postMessage(0); });
  })();
  const fmtBytes = n => (n >= 1048576 ? (n / 1048576).toFixed(2) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  const blobBytes = async blob => new Uint8Array(await blob.arrayBuffer());
  const dataURL = blob => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });

  // 按默认值的结构与类型合并，忽略未知或类型不符的字段
  function merge(base, over) {
    if (!over || typeof over !== 'object') return base;
    for (const k of Object.keys(base)) {
      const v = over[k];
      if (v === undefined) continue;
      if (base[k] && typeof base[k] === 'object') merge(base[k], v);
      else if (typeof v === typeof base[k] && (typeof v !== 'number' || isFinite(v))) {
        if (isHex(base[k]) && !isHex(v)) continue;
        base[k] = v;
      }
    }
    return base;
  }

  const hexToRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const rgbToHex = c => '#' + c.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  const luminance = hex => {
    const [r, g, b] = hexToRgb(hex).map(v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const hsl = (h, s, l) => {
    s /= 100; l /= 100;
    const f = n => {
      const k = (n + h / 30) % 12;
      return 255 * (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
    };
    return rgbToHex([f(0), f(8), f(4)]);
  };

  function encodeState(st) {
    const bytes = new TextEncoder().encode(JSON.stringify(st));
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decodeState(s) {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
  }

  // ---------- 状态 ----------
  function normalize(st) {
    st.anim.fps = clamp(Math.round(st.anim.fps), FPS_MIN, FPS_MAX);
    if (!FONTS[st.font]) st.font = defaults().font;
    return st;
  }

  function loadInitial() {
    const m = location.hash.match(/^#s=([\w-]+)/);
    if (m) {
      try {
        const st = merge(defaults(), decodeState(m[1]));
        history.replaceState(null, '', location.pathname + location.search);
        return normalize(st);
      } catch (e) { /* 链接损坏则忽略 */ }
    }
    try {
      const raw = storageGet(STORE_KEY);
      if (raw) return normalize(merge(defaults(), JSON.parse(raw)));
    } catch (e) { /* 数据损坏则忽略 */ }
    return defaults();
  }

  let state = loadInitial();
  let geo = null; // 在 init() 中计算
  const stateSig = () => JSON.stringify(state);

  let saveTimer = 0;
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => storageSet(STORE_KEY, JSON.stringify(state)), 300);
  }

  // ---------- 几何 ----------
  const inCircle = (c, x, y) => (x - c.x) ** 2 + (y - c.y) ** 2 <= c.r * c.r;
  const maskAt = (C, x, y) => (inCircle(C.a, x, y) ? 1 : 0) | (inCircle(C.b, x, y) ? 2 : 0) | (inCircle(C.c, x, y) ? 4 : 0);

  // 计算每个区域文字的默认锚点（坐标原点为三个圆心的中心）
  function anchorFor(key, C) {
    const want = MASK[key];
    if (key === 'abc') {
      const s = [C.a, C.b, C.c].reduce((m, c) => (c.r < m.r ? c : m));
      const N = 48;
      let sx = 0, sy = 0, n = 0;
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          const x = s.x - s.r + (i + 0.5) * 2 * s.r / N;
          const y = s.y - s.r + (j + 0.5) * 2 * s.r / N;
          if (maskAt(C, x, y) === 7) { sx += x; sy += y; n++; }
        }
      }
      return n ? { x: sx / n, y: sy / n } : { x: 0, y: 0 };
    }
    const single = key.length === 1;
    const vx = single ? C[key].x : (C[key[0]].x + C[key[1]].x) / 2;
    const vy = single ? C[key].y : (C[key[0]].y + C[key[1]].y) / 2;
    let th = Math.hypot(vx, vy) > 1e-6 ? Math.atan2(vy, vx) : AXIS[key] * Math.PI / 180;
    // 横排文字在斜向区域里看起来偏下，往水平方向稍微收一点
    th -= (5.2 * Math.PI / 180) * Math.sin(2 * th);
    const ux = Math.cos(th), uy = Math.sin(th);
    const tMax = Math.max(...[C.a, C.b, C.c].map(c => Math.hypot(c.x, c.y) + c.r)) * 1.05;
    const steps = 1500;
    let inner = -1, outer = -1;
    for (let i = 0; i <= steps; i++) {
      const d = tMax * i / steps;
      if (maskAt(C, d * ux, d * uy) === want) {
        if (inner < 0) inner = d;
        outer = d;
      } else if (inner >= 0) break;
    }
    if (inner < 0) return { x: vx, y: vy };
    const d = inner + (single ? 0.46 : 0.40) * (outer - inner);
    return { x: d * ux, y: d * uy };
  }

  function computeGeo(st) {
    const R = st.radius;
    const D = R * st.gap / 100 / Math.sqrt(3);
    const k = Math.cos(Math.PI / 6);
    const C = {
      a: { x: 0, y: -D, r: R * st.scale.a / 100 },
      b: { x: -D * k, y: D / 2, r: R * st.scale.b / 100 },
      c: { x: D * k, y: D / 2, r: R * st.scale.c / 100 },
    };
    const sw = st.strokeWidth / 2;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, far = 0;
    for (const c of [C.a, C.b, C.c]) {
      x0 = Math.min(x0, c.x - c.r - sw); x1 = Math.max(x1, c.x + c.r + sw);
      y0 = Math.min(y0, c.y - c.r - sw); y1 = Math.max(y1, c.y + c.r + sw);
      far = Math.max(far, Math.hypot(c.x, c.y) + c.r + sw);
    }
    const p = st.padding;
    let w = x1 - x0 + 2 * p, h = y1 - y0 + 2 * p;
    if (st.square) w = h = Math.max(w, h);
    w = Math.ceil(w); h = Math.ceil(h);
    const anchors = {};
    for (const key of KEYS) anchors[key] = anchorFor(key, C);
    const as = Math.ceil(2 * (far + p)); // 旋转时不会被裁切的正方形
    return {
      C,
      anchors,
      stat: { w, h, ox: w / 2 - (x0 + x1) / 2, oy: h / 2 - (y0 + y1) / 2 },
      anim: { w: as, h: as, ox: as / 2, oy: as / 2 },
    };
  }

  const labelPos = key => ({
    x: geo.anchors[key].x + state.regions[key].dx,
    y: geo.anchors[key].y + state.regions[key].dy,
  });
  const labelSize = r => r.size * state.textScale / 100;
  const fontOf = (r, size) => `${r.bold ? 700 : 400} ${size}px ${fontStack(state.font)}`;

  // ---------- 绘制 ----------
  // L: 布局 {w,h,ox,oy}; o: {scale, angle, cs(中心字缩放), upright, bg, skip(正在编辑、不画的文字)}
  function paint(ctx, L, o) {
    const st = state, C = geo.C, R = st.regions, s = o.scale;
    const cv = ctx.canvas;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (o.bg) { ctx.fillStyle = o.bg; ctx.fillRect(0, 0, cv.width, cv.height); }
    ctx.setTransform(s, 0, 0, s, L.ox * s, L.oy * s);
    const angle = o.angle || 0;
    if (angle) ctx.rotate(angle);

    const path = c => { ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2); };
    const fill = (c, color) => { path(c); ctx.fillStyle = color; ctx.fill(); };
    const clip = c => { path(c); ctx.clip(); };

    fill(C.a, R.a.fill); fill(C.b, R.b.fill); fill(C.c, R.c.fill);
    ctx.save(); clip(C.a); fill(C.b, R.ab.fill); ctx.restore();
    ctx.save(); clip(C.a); fill(C.c, R.ac.fill); ctx.restore();
    ctx.save(); clip(C.b); fill(C.c, R.bc.fill); ctx.restore();
    ctx.save(); clip(C.a); clip(C.b); fill(C.c, R.abc.fill); ctx.restore();

    if (st.strokeWidth > 0) {
      ctx.lineWidth = st.strokeWidth;
      ctx.strokeStyle = st.strokeColor;
      for (const c of [C.a, C.b, C.c]) { path(c); ctx.stroke(); }
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const key of KEYS) {
      const r = R[key];
      if (!r.text.trim() || key === o.skip) continue;
      const cs = key === 'abc' && o.cs !== undefined ? o.cs : 1;
      if (cs <= 0.001) continue;
      const p = labelPos(key), size = labelSize(r), lines = r.text.split('\n');
      ctx.save();
      ctx.translate(p.x, p.y);
      if (angle && o.upright) ctx.rotate(-angle);
      if (cs !== 1) ctx.scale(cs, cs);
      ctx.font = fontOf(r, size);
      lines.forEach((line, i) => {
        const y = (i - (lines.length - 1) / 2) * size * LINE_H;
        if (st.textStrokeWidth > 0) {
          ctx.lineWidth = st.textStrokeWidth * 2;
          ctx.strokeStyle = st.textStrokeColor;
          ctx.strokeText(line, 0, y);
        }
        ctx.fillStyle = r.color;
        ctx.fillText(line, 0, y);
      });
      ctx.restore();
    }
    ctx.restore();
  }

  function buildSVG() {
    const st = state, L = geo.stat, C = geo.C, R = st.regions;
    const n = v => Math.round(v * 100) / 100;
    const col = v => (isHex(v) ? v : '#000000');
    const circ = (c, attrs = '') => `<circle cx="${n(c.x)}" cy="${n(c.y)}" r="${n(c.r)}"${attrs}/>`;
    const fillOf = k => ` fill="${col(R[k].fill)}"`;
    const out = [];
    out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${L.w}" height="${L.h}" viewBox="0 0 ${L.w} ${L.h}">`);
    out.push(`<defs><clipPath id="clipA">${circ(C.a)}</clipPath><clipPath id="clipB">${circ(C.b)}</clipPath></defs>`);
    if (!st.transparent) out.push(`<rect width="100%" height="100%" fill="${col(st.bg)}"/>`);
    out.push(`<g transform="translate(${n(L.ox)} ${n(L.oy)})">`);
    out.push(circ(C.a, fillOf('a')), circ(C.b, fillOf('b')), circ(C.c, fillOf('c')));
    out.push(`<g clip-path="url(#clipA)">${circ(C.b, fillOf('ab'))}</g>`);
    out.push(`<g clip-path="url(#clipA)">${circ(C.c, fillOf('ac'))}</g>`);
    out.push(`<g clip-path="url(#clipB)">${circ(C.c, fillOf('bc'))}</g>`);
    out.push(`<g clip-path="url(#clipA)"><g clip-path="url(#clipB)">${circ(C.c, fillOf('abc'))}</g></g>`);
    if (st.strokeWidth > 0) {
      out.push(`<g fill="none" stroke="${col(st.strokeColor)}" stroke-width="${n(st.strokeWidth)}">${circ(C.a)}${circ(C.b)}${circ(C.c)}</g>`);
    }
    const stroke = st.textStrokeWidth > 0
      ? ` stroke="${col(st.textStrokeColor)}" stroke-width="${n(st.textStrokeWidth * 2)}" stroke-linejoin="round" paint-order="stroke"`
      : '';
    out.push(`<g font-family="${esc(fontStack(st.font))}" text-anchor="middle" dominant-baseline="central"${stroke}>`);
    for (const key of KEYS) {
      const r = R[key];
      if (!r.text.trim()) continue;
      const p = labelPos(key), size = labelSize(r), lines = r.text.split('\n');
      lines.forEach((line, i) => {
        const y = p.y + (i - (lines.length - 1) / 2) * size * LINE_H;
        out.push(`<text x="${n(p.x)}" y="${n(y)}" font-size="${n(size)}" font-weight="${r.bold ? 700 : 400}" fill="${col(r.color)}">${esc(line)}</text>`);
      });
    }
    out.push('</g>', '</g>', '</svg>');
    return out.join('\n') + '\n';
  }

  // ---------- 字体加载 ----------
  const cssLoading = {};
  function loadFontCss(key) {
    const f = FONTS[key];
    if (!f || !f.css) return Promise.resolve();
    if (!cssLoading[key]) {
      cssLoading[key] = new Promise(res => {
        const l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = f.css;
        l.onload = l.onerror = () => res();
        document.head.appendChild(l);
        setTimeout(res, 5000);
      });
    }
    return cssLoading[key];
  }
  async function ensureFonts() {
    const f = FONTS[state.font];
    if (!f || !f.family || !document.fonts) return;
    await loadFontCss(state.font);
    const text = KEYS.map(k => state.regions[k].text).join('').replace(/\s/g, '') || '字';
    const weights = new Set(KEYS.map(k => (state.regions[k].bold ? 700 : 400)));
    const loads = [...weights].map(w => document.fonts.load(`${w} 64px "${f.family}"`, text).catch(() => {}));
    await Promise.race([Promise.all(loads), new Promise(r => setTimeout(r, 6000))]);
  }
  let fontTimer = 0;
  function ensureFontsSoon() {
    clearTimeout(fontTimer);
    fontTimer = setTimeout(() => ensureFonts().then(requestRender), 120);
  }

  // ---------- 预览 ----------
  const view = $('#view');
  const vctx = view.getContext('2d');
  const box = $('#canvasBox');
  const mctx = document.createElement('canvas').getContext('2d'); // 用于测量文字
  let mode = 'static';
  let playing = false, t0 = 0, raf = 0, lastFrame = { angle: 0, cs: 1 };
  let gesture = null, hover = null, editing = null;
  let frozen = null; // 拖圆边时锁定画布布局，免得画布尺寸跟着变、鼠标位置对不上
  let renderQueued = false;

  const layout = () => (mode === 'static' ? frozen || geo.stat : geo.anim);

  function sizeView(L) {
    const maxH = clamp(window.innerHeight - 260, 280, 1000);
    box.style.aspectRatio = `${L.w} / ${L.h}`;
    box.style.width = `min(100%, ${Math.round(maxH * L.w / L.h)}px)`;
    const cw = box.clientWidth || 1;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const W = Math.max(1, Math.round(cw * dpr));
    const H = Math.max(1, Math.round(W * L.h / L.w));
    if (view.width !== W) view.width = W;
    if (view.height !== H) view.height = H;
    return W / L.w;
  }

  function drawView(frame) {
    const L = layout();
    const s = sizeView(L);
    const f = frame || (mode === 'anim' ? lastFrame : { angle: 0, cs: 1 });
    paint(vctx, L, {
      scale: s, angle: f.angle, cs: f.cs, upright: state.anim.upright,
      bg: state.transparent ? null : state.bg, skip: editing && editing.key,
    });
    if (mode === 'static') drawOverlays(L, s);
    if (editing) positionEditor();
    const a = state.anim;
    $('#sizeInfo').textContent = mode === 'static'
      ? `${Math.round(L.w * state.exportScale)} × ${Math.round(L.h * state.exportScale)}`
      : `${Math.round(a.size)} × ${Math.round(a.size)} · ${a.fps} fps`;
  }

  // 悬停 / 拖动时的提示：文字框和四角手柄、圆的轮廓、画布边缘、数值小标签
  function drawOverlays(L, s) {
    const focus = gesture || hover;
    if (!focus || editing) return;
    const dpr = view.width / (view.clientWidth || 1);
    vctx.save();
    if (focus.kind === 'pad') {
      vctx.setTransform(1, 0, 0, 1, 0, 0);
      vctx.fillStyle = 'rgba(216,56,60,.6)';
      const w = view.width, h = view.height, th = 4 * dpr;
      vctx.fillRect(...{ l: [0, 0, th, h], r: [w - th, 0, th, h], t: [0, 0, w, th], b: [0, h - th, w, th] }[focus.edge]);
    } else {
      vctx.setTransform(s, 0, 0, s, L.ox * s, L.oy * s);
      const px = dpr / s; // 1 个 CSS 像素对应的设计单位
      const dashed = draw => {
        vctx.setLineDash([]);
        vctx.lineWidth = 3 * px;
        vctx.strokeStyle = 'rgba(255,255,255,.85)';
        draw();
        vctx.setLineDash([6 * px, 4 * px]);
        vctx.lineWidth = 1.5 * px;
        vctx.strokeStyle = 'rgba(0,0,0,.8)';
        draw();
      };
      if (focus.kind === 'circle') {
        const c = geo.C[focus.key];
        dashed(() => { vctx.beginPath(); vctx.arc(c.x, c.y, c.r, 0, Math.PI * 2); vctx.stroke(); });
      } else {
        const b = labelBox(focus.key, 6);
        dashed(() => vctx.strokeRect(b.x, b.y, b.w, b.h));
        vctx.setLineDash([]);
        const hs = 8 * px;
        vctx.fillStyle = '#fff';
        vctx.strokeStyle = 'rgba(0,0,0,.8)';
        vctx.lineWidth = 1.5 * px;
        for (const [x, y] of [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]]) {
          vctx.fillRect(x - hs / 2, y - hs / 2, hs, hs);
          vctx.strokeRect(x - hs / 2, y - hs / 2, hs, hs);
        }
      }
    }
    vctx.restore();
    if (gesture && gesture.moved && gesture.kind !== 'move') drawPill(pillText(gesture), dpr);
  }

  function pillText(g) {
    if (g.kind === 'size') return t('dragSize', { v: state.regions[g.key].size });
    if (g.kind === 'pad') return t('dragPadding', { v: state.padding });
    return g.shift ? t('dragRadius', { v: state.radius }) : t('dragCircle', { name: t('region_' + g.key), v: state.scale[g.key] });
  }

  function drawPill(text, dpr) {
    vctx.save();
    vctx.setTransform(1, 0, 0, 1, 0, 0);
    vctx.font = `600 ${12 * dpr}px system-ui, sans-serif`;
    const w = vctx.measureText(text).width + 18 * dpr, h = 24 * dpr, x = 10 * dpr, y = 10 * dpr;
    vctx.fillStyle = 'rgba(20,20,22,.82)';
    vctx.beginPath();
    if (vctx.roundRect) vctx.roundRect(x, y, w, h, h / 2); else vctx.rect(x, y, w, h);
    vctx.fill();
    vctx.fillStyle = '#fff';
    vctx.textBaseline = 'middle';
    vctx.fillText(text, x + 9 * dpr, y + h / 2);
    vctx.restore();
  }

  function requestRender() {
    if (renderQueued || playing) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; if (!playing) drawView(); });
  }

  // ---------- 动画 ----------
  function ease(name, p, turns) {
    switch (name) {
      case 'linear': return p;
      case 'outQuint': return 1 - Math.pow(1 - p, 5);
      case 'inOutCubic': return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      case 'outBack': {
        const c1 = 1.70158 / Math.max(1, turns), c3 = c1 + 1;
        return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
      }
      default: return 1 - Math.pow(1 - p, 3);
    }
  }
  const backOut = x => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

  function frameAt(time, a) {
    if (time < a.spin) {
      const p = time / a.spin;
      return { angle: a.dir * a.turns * 2 * Math.PI * ease(a.easing, p, a.turns), cs: a.center === 'reveal' ? 0 : 1 };
    }
    const x = Math.min(1, (time - a.spin) / EFFECT);
    let cs = 1;
    if (a.center === 'pop' && x < 1) cs = 1 + 0.45 * Math.sin(Math.PI * x) * (1 - x);
    else if (a.center === 'reveal' && x < 1) cs = backOut(x);
    return { angle: 0, cs };
  }

  // 帧序列：旋转 → 中心字特效 → 停住（停住那帧时长最长）；dur 单位为秒
  function frameList(a, fps) {
    const dt = 1 / fps, frames = [];
    const nSpin = Math.max(2, Math.ceil(a.spin * fps - 1e-6));
    for (let i = 0; i < nSpin; i++) frames.push({ t: i * dt, dur: dt });
    const nEff = a.center === 'none' ? 0 : Math.floor(Math.min(EFFECT, a.hold) * fps);
    for (let i = 0; i < nEff; i++) frames.push({ t: a.spin + i * dt, dur: dt });
    frames.push({ t: a.spin + EFFECT + 1, dur: Math.max(dt, a.hold - nEff * dt) });
    // 循环播放时把停住的完整画面放到第一帧，聊天软件里的缩略图更好看
    if (a.loop) frames.unshift(frames.pop());
    return frames;
  }

  // 按累计时间把帧时长取整到 unit 毫秒（GIF 是 10 毫秒），总时长不会跑偏
  function toDelays(frames, unit) {
    let acc = 0, done = 0;
    return frames.map(f => {
      acc += f.dur * 1000;
      const d = Math.max(unit, Math.round(acc / unit) * unit - done);
      done += d;
      return d;
    });
  }

  function loop() {
    const a = state.anim;
    const period = Math.max(0.05, a.spin + a.hold);
    let time = ((performance.now() - t0) / 1000) % period;
    // 低帧率时按真实帧率跳帧，所见即所得；50 帧及以上直接平滑播放
    if (a.fps < 50) time = Math.floor(time * a.fps) / a.fps;
    lastFrame = frameAt(time, a);
    drawView(lastFrame);
    raf = requestAnimationFrame(loop);
  }
  function play() {
    if (playing) return;
    playing = true;
    // 从暂停的位置继续
    t0 = performance.now() - (pausedAt || 0) * 1000;
    loop();
    updatePlayBtn();
  }
  let pausedAt = 0;
  function pause() {
    if (playing) {
      const a = state.anim;
      pausedAt = ((performance.now() - t0) / 1000) % Math.max(0.05, a.spin + a.hold);
    }
    playing = false;
    cancelAnimationFrame(raf);
    updatePlayBtn();
    requestRender();
  }
  const togglePlay = () => (playing ? pause() : play());
  function updatePlayBtn() {
    $('#playBtn').textContent = t(playing ? 'pause' : 'play');
    $('#stageBadge').hidden = mode !== 'anim' || playing;
  }

  function setMode(m) {
    if (m === mode) return;
    closeMenu();
    endEdit(true);
    mode = m;
    $$('.seg [data-mode]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === m)));
    $('#playBtn').hidden = m !== 'anim';
    $('#hint').textContent = t(m === 'static' ? 'hintStatic' : 'hintAnim');
    hover = gesture = frozen = null;
    view.style.cursor = m === 'anim' ? 'pointer' : '';
    pausedAt = 0;
    if (m === 'anim') play();
    else { pause(); lastFrame = { angle: 0, cs: 1 }; }
    updatePlayBtn();
    requestRender();
  }

  // ---------- 画布上的直接操作 ----------
  function labelBox(key, pad = 0) {
    const r = state.regions[key], size = labelSize(r), lines = r.text.split('\n'), p = labelPos(key);
    mctx.font = fontOf(r, size);
    const w = Math.max(...lines.map(l => mctx.measureText(l).width), size * 0.5);
    const h = lines.length * size * LINE_H;
    return { x: p.x - w / 2 - pad, y: p.y - h / 2 - pad, w: w + 2 * pad, h: h + 2 * pad };
  }

  // 屏幕坐标 → 设计坐标（动图模式下再按当前角度转回去）
  function toDesign(clientX, clientY) {
    const L = layout(), rect = view.getBoundingClientRect();
    let x = (clientX - rect.left) / rect.width * L.w - L.ox;
    let y = (clientY - rect.top) / rect.height * L.h - L.oy;
    if (mode === 'anim' && lastFrame.angle) {
      const c = Math.cos(-lastFrame.angle), s = Math.sin(-lastFrame.angle);
      [x, y] = [x * c - y * s, x * s + y * c];
    }
    return { x, y };
  }

  function resizeCursor(angle) {
    const d = ((angle * 180 / Math.PI) % 180 + 180) % 180;
    return d < 22.5 || d >= 157.5 ? 'ew-resize' : d < 67.5 ? 'nwse-resize' : d < 112.5 ? 'ns-resize' : 'nesw-resize';
  }

  // 命中优先级：文字框边缘（改字号）> 文字（移动）> 圆的边（改大小）> 画布边缘（改边距）
  function hitTest(pt, clientX, clientY, touch) {
    const rect = view.getBoundingClientRect();
    const tol = (touch ? 14 : 7) * layout().w / rect.width;
    for (let i = KEYS.length - 1; i >= 0; i--) {
      const key = KEYS[i];
      if (!state.regions[key].text.trim()) continue;
      const b = labelBox(key, 6);
      if (pt.x < b.x - tol || pt.x > b.x + b.w + tol || pt.y < b.y - tol || pt.y > b.y + b.h + tol) continue;
      const nl = Math.abs(pt.x - b.x) <= tol, nr = Math.abs(pt.x - b.x - b.w) <= tol;
      const nt = Math.abs(pt.y - b.y) <= tol, nb = Math.abs(pt.y - b.y - b.h) <= tol;
      if (nl || nr || nt || nb) {
        const cursor = (nl || nr) && (nt || nb) ? ((nl && nt) || (nr && nb) ? 'nwse-resize' : 'nesw-resize') : nl || nr ? 'ew-resize' : 'ns-resize';
        return { kind: 'size', key, cursor };
      }
      return { kind: 'move', key, cursor: 'grab' };
    }
    let best = null;
    for (const key of ['a', 'b', 'c']) {
      const c = geo.C[key];
      const d = Math.abs(Math.hypot(pt.x - c.x, pt.y - c.y) - c.r);
      if (d <= tol && (!best || d < best.d)) best = { d, key };
    }
    if (best) {
      const c = geo.C[best.key];
      return { kind: 'circle', key: best.key, cursor: resizeCursor(Math.atan2(pt.y - c.y, pt.x - c.x)) };
    }
    const edgePx = touch ? 16 : 10;
    const dist = { l: clientX - rect.left, r: rect.right - clientX, t: clientY - rect.top, b: rect.bottom - clientY };
    const edge = Object.keys(dist).reduce((m, k) => (dist[k] < dist[m] ? k : m));
    if (dist[edge] >= 0 && dist[edge] <= edgePx) return { kind: 'pad', edge, cursor: edge === 'l' || edge === 'r' ? 'ew-resize' : 'ns-resize' };
    return null;
  }
  const sameHit = (a, b) => (a && b ? a.kind === b.kind && a.key === b.key && a.edge === b.edge && a.cursor === b.cursor : a === b);

  view.addEventListener('pointerdown', e => {
    if (e.button !== 0 || mode !== 'static') return;
    endEdit(true);
    const pt = toDesign(e.clientX, e.clientY);
    const hit = hitTest(pt, e.clientX, e.clientY, e.pointerType !== 'mouse');
    if (!hit) return;
    e.preventDefault();
    view.setPointerCapture(e.pointerId);
    const g = { ...hit, id: e.pointerId, x0: e.clientX, y0: e.clientY, pt0: pt, moved: false };
    if (hit.kind === 'move') {
      const r = state.regions[hit.key];
      Object.assign(g, { dx: r.dx, dy: r.dy });
      view.style.cursor = 'grabbing';
    } else if (hit.kind === 'size') {
      const p = labelPos(hit.key);
      Object.assign(g, { center: p, size0: state.regions[hit.key].size, d0: Math.max(1, Math.hypot(pt.x - p.x, pt.y - p.y)) });
    } else if (hit.kind === 'circle') {
      frozen = geo.stat;
      const c = geo.C[hit.key];
      Object.assign(g, { center: { x: c.x, y: c.y }, d0: Math.max(1, Math.hypot(pt.x - c.x, pt.y - c.y)), scale0: state.scale[hit.key], radius0: state.radius });
    } else {
      Object.assign(g, { p0: state.padding, dpp: layout().w / view.getBoundingClientRect().width });
    }
    gesture = g;
    requestRender();
  });

  view.addEventListener('pointermove', e => {
    if (mode !== 'static') return;
    const g = gesture;
    if (g && e.pointerId === g.id) {
      if (!g.moved && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < 3) return;
      g.moved = true;
      const pt = toDesign(e.clientX, e.clientY);
      if (g.kind === 'move') {
        const r = state.regions[g.key];
        r.dx = Math.round(g.dx + pt.x - g.pt0.x);
        r.dy = Math.round(g.dy + pt.y - g.pt0.y);
      } else if (g.kind === 'size') {
        const f = Math.hypot(pt.x - g.center.x, pt.y - g.center.y) / g.d0;
        state.regions[g.key].size = clamp(Math.round(g.size0 * f), 4, 1000);
      } else if (g.kind === 'circle') {
        const f = Math.hypot(pt.x - g.center.x, pt.y - g.center.y) / g.d0;
        g.shift = e.shiftKey;
        state.scale[g.key] = g.shift ? g.scale0 : clamp(Math.round(g.scale0 * f), 40, 160);
        state.radius = g.shift ? clamp(Math.round(g.radius0 * f), 60, 600) : g.radius0;
      } else {
        const out = { l: g.x0 - e.clientX, r: e.clientX - g.x0, t: g.y0 - e.clientY, b: e.clientY - g.y0 }[g.edge];
        state.padding = clamp(Math.round(g.p0 + out * g.dpp), 0, 300);
      }
      if (g.kind !== 'move') { geo = computeGeo(state); syncControls(); }
      requestRender();
      return;
    }
    if (e.pointerType !== 'mouse' || editing) return;
    const hit = hitTest(toDesign(e.clientX, e.clientY), e.clientX, e.clientY, false);
    if (!sameHit(hit, hover)) {
      hover = hit;
      view.style.cursor = hit ? hit.cursor : '';
      requestRender();
    }
  });

  const endGesture = e => {
    const g = gesture;
    if (!g || e.pointerId !== g.id) return;
    gesture = null;
    frozen = null;
    view.style.cursor = hover ? hover.cursor : '';
    changed(g.kind);
    syncControls();
    // 没拖动就是单击：点文字直接进入编辑
    if (!g.moved && e.type === 'pointerup' && (g.kind === 'move' || g.kind === 'size')) startEdit(g.key);
  };
  view.addEventListener('pointerup', endGesture);
  view.addEventListener('pointercancel', endGesture);
  view.addEventListener('pointerleave', () => {
    if (!gesture && hover) { hover = null; view.style.cursor = mode === 'anim' ? 'pointer' : ''; requestRender(); }
  });
  // 手指按在可操作的位置时阻止页面滚动，其余位置照常滚动
  view.addEventListener('touchstart', e => {
    if (mode !== 'static' || e.touches.length !== 1) return;
    const tp = e.touches[0];
    if (hitTest(toDesign(tp.clientX, tp.clientY), tp.clientX, tp.clientY, true)) e.preventDefault();
  }, { passive: false });
  // 动图预览：单击或双击都只切换一次暂停 / 继续
  view.addEventListener('click', e => { if (mode === 'anim' && e.detail <= 1) togglePlay(); });
  view.addEventListener('dblclick', e => {
    if (mode !== 'static') return;
    const hit = hitTest(toDesign(e.clientX, e.clientY), e.clientX, e.clientY, false);
    if (hit && hit.key && (hit.kind === 'move' || hit.kind === 'size')) startEdit(hit.key);
  });
  view.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (gesture) return;
    endEdit(true);
    const pt = toDesign(e.clientX, e.clientY);
    let key = null;
    if (mode === 'static') {
      const hit = hitTest(pt, e.clientX, e.clientY, false);
      if (hit && hit.key) key = hit.key;
    }
    if (!key) {
      const m = maskAt(geo.C, pt.x, pt.y);
      key = KEYS.find(k => MASK[k] === m) || 'canvas';
    }
    openMenu(key, e.clientX, e.clientY);
  });

  // ---------- 在图上直接编辑文字 ----------
  function startEdit(key) {
    if (mode !== 'static') return;
    if (editing && editing.key === key) { editing.el.focus(); return; }
    endEdit(true);
    const r = state.regions[key];
    const el = document.createElement('textarea');
    el.className = 'inline-edit';
    el.value = r.text;
    el.rows = 1;
    el.spellcheck = false;
    el.setAttribute('aria-label', t('ariaText', { name: t('region_' + key) }));
    box.appendChild(el);
    editing = { key, el, original: r.text };
    hover = null;
    view.style.cursor = '';
    el.addEventListener('input', () => { r.text = el.value; syncControls(el); changed('text'); });
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); endEdit(true); }
      else if (e.key === 'Escape') { e.preventDefault(); endEdit(false); }
    });
    el.addEventListener('blur', () => endEdit(true));
    drawView();
    el.focus();
    el.select();
  }

  function positionEditor() {
    const { key, el } = editing;
    const r = state.regions[key], L = layout();
    const k = view.clientWidth / L.w;
    const size = labelSize(r), p = labelPos(key);
    mctx.font = fontOf(r, size);
    const lines = el.value.split('\n');
    const w = (Math.max(size, ...lines.map(l => mctx.measureText(l).width)) + size * 0.6) * k;
    const h = lines.length * size * LINE_H * k + 8;
    el.style.cssText = `left:${(L.ox + p.x) * k - w / 2}px;top:${(L.oy + p.y) * k - h / 2}px;width:${w}px;height:${h}px;`
      + `font:${r.bold ? 700 : 400} ${size * k}px/${LINE_H} ${fontStack(state.font)};color:${r.color};caret-color:${r.color}`;
  }

  function endEdit(commit) {
    if (!editing) return;
    const { key, el, original } = editing;
    editing = null;
    if (!commit) state.regions[key].text = original;
    el.remove();
    syncControls();
    changed('text');
  }

  // ---------- 右键菜单 ----------
  const menu = $('#ctxMenu');

  function openMenu(key, x, y) {
    const row = (k, label, min, max) =>
      `<div class="ctx-row"><span>${esc(t(label))}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="1" aria-label="${esc(t(label))}"></div>`;
    const item = (act, text) => `<button type="button" class="ctx-item" data-act="${act}">${esc(text)}</button>`;
    const parts = [];
    if (key === 'canvas') {
      parts.push(
        `<div class="ctx-title">${esc(t('canvas'))}</div>`,
        `<div class="ctx-colors"><label>${esc(t('background'))}<input type="color" class="swatch" data-k="bg"></label>`
          + `<label class="check"><input type="checkbox" data-k="transparent"> ${esc(t('transparent'))}</label></div>`,
        row('radius', 'radius', 60, 600), row('gap', 'gap', 30, 200), row('padding', 'padding', 0, 300),
        '<div class="ctx-sep"></div>', item('resetall', t('menuResetAll')));
    } else {
      const r = state.regions[key], first = r.text.split('\n')[0].trim();
      parts.push(
        `<div class="ctx-title">${esc(t('region_' + key))}${first ? ' · ' + esc(first) : ''}</div>`,
        `<textarea rows="1" data-k="regions.${key}.text" aria-label="${esc(t('menuText'))}" spellcheck="false"></textarea>`,
        `<div class="ctx-colors"><label>${esc(t('menuFill'))}<input type="color" class="swatch" data-k="regions.${key}.fill"></label>`
          + `<label>${esc(t('menuColor'))}<input type="color" class="swatch round" data-k="regions.${key}.color"></label></div>`,
        `<div class="ctx-row"><span>${esc(t('menuSize'))}</span><div class="stepper">`
          + '<button type="button" class="btn small" data-act="size-" aria-label="-">−</button>'
          + `<input type="number" data-k="regions.${key}.size" min="4" max="1000" step="1" aria-label="${esc(t('menuSize'))}">`
          + '<button type="button" class="btn small" data-act="size+" aria-label="+">+</button></div></div>',
        `<label class="check"><input type="checkbox" data-k="regions.${key}.bold"> ${esc(t('menuBold'))}</label>`);
      if (key.length === 1) parts.push(row(`scale.${key}`, 'menuCircle', 40, 160));
      parts.push('<div class="ctx-sep"></div>', item('edit', t('menuEdit')), item('resetpos', t('menuResetPos')), item('clear', t('menuClear')));
    }
    menu.innerHTML = parts.join('');
    menu.dataset.key = key;
    menu.hidden = false;
    syncControls();
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.left = clamp(x, 8, window.innerWidth - mw - 8) + 'px';
    menu.style.top = clamp(y, 8, window.innerHeight - mh - 8) + 'px';
    menu.focus({ preventScroll: true });
  }

  function closeMenu() {
    if (menu.hidden) return;
    menu.hidden = true;
    menu.textContent = '';
  }

  menu.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const key = menu.dataset.key, act = b.dataset.act;
    if (act === 'size-' || act === 'size+') {
      const r = state.regions[key];
      r.size = clamp(r.size + (act === 'size+' ? 4 : -4), 4, 1000);
      syncControls();
      changed('size');
      return;
    }
    closeMenu();
    if (act === 'edit') { setMode('static'); startEdit(key); }
    else if (act === 'resetpos') Object.assign(state.regions[key], { dx: 0, dy: 0 });
    else if (act === 'clear') state.regions[key].text = '';
    else if (act === 'resetall') KEYS.forEach(k => Object.assign(state.regions[k], { dx: 0, dy: 0 }));
    syncControls();
    changed(act === 'clear' ? 'text' : 'pos');
  });

  // ---------- 控件绑定 ----------
  const getPath = (o, p) => p.split('.').reduce((x, k) => (x == null ? x : x[k]), o);
  function setPath(o, p, v) {
    const ks = p.split('.'), last = ks.pop();
    ks.reduce((x, k) => x[k], o)[last] = v;
  }

  const SLIDERS = {
    circleSliders: [
      { k: 'radius', label: 'radius', min: 60, max: 600, step: 1, unit: 'px' },
      { k: 'gap', label: 'gap', min: 30, max: 200, step: 1, unit: '%' },
      { k: 'scale.a', label: 'scaleA', min: 40, max: 160, step: 1, unit: '%' },
      { k: 'scale.b', label: 'scaleB', min: 40, max: 160, step: 1, unit: '%' },
      { k: 'scale.c', label: 'scaleC', min: 40, max: 160, step: 1, unit: '%' },
      { k: 'strokeWidth', label: 'strokeWidth', min: 0, max: 40, step: 1, unit: 'px' },
    ],
    textSliders: [
      { k: 'textScale', label: 'textScale', min: 30, max: 250, step: 1, unit: '%' },
      { k: 'textStrokeWidth', label: 'textStrokeWidth', min: 0, max: 30, step: 0.5, unit: 'px' },
    ],
    canvasSliders: [
      { k: 'padding', label: 'padding', min: 0, max: 300, step: 1, unit: 'px' },
    ],
    animSliders: [
      { k: 'anim.turns', label: 'turns', min: 1, max: 10, step: 1, unit: 'unitTurns' },
      { k: 'anim.spin', label: 'spin', min: 0.3, max: 6, step: 0.1, unit: 'unitSec' },
      { k: 'anim.hold', label: 'hold', min: 0, max: 6, step: 0.1, unit: 'unitSec' },
      { k: 'anim.fps', label: 'fps', min: FPS_MIN, max: FPS_MAX, step: 1, unit: 'fps' },
      { k: 'anim.size', label: 'animSize', min: 64, max: 1024, step: 8, unit: 'px' },
    ],
  };

  // 动态生成的控件；切换语言时整体重建（数值都从 state 同步回来）
  function mountSliders() {
    for (const [id, list] of Object.entries(SLIDERS)) {
      const host = document.getElementById(id);
      host.textContent = '';
      for (const s of list) {
        const label = t(s.label), unit = ['px', '%', 'fps'].includes(s.unit) ? s.unit : t(s.unit);
        const row = document.createElement('div');
        row.className = 'ctl';
        const attrs = `data-k="${s.k}" min="${s.min}" max="${s.max}" step="${s.step}"`;
        row.innerHTML = `<span class="ctl-label">${esc(label)}</span>`
          + `<input type="range" ${attrs} aria-label="${esc(label)}">`
          + `<span class="ctl-num"><input type="number" ${attrs} aria-label="${esc(t('ariaValue', { label }))}"><i>${esc(unit)}</i></span>`;
        host.appendChild(row);
      }
    }
  }

  function mountRegions() {
    const host = $('#regionRows');
    host.textContent = '';
    for (const k of KEYS) {
      const name = t('region_' + k);
      const a = key => esc(t(key, { name }));
      const row = document.createElement('div');
      row.className = 'region-row';
      row.innerHTML = `
        <input type="color" class="swatch" data-k="regions.${k}.fill" title="${a('ariaFill')}" aria-label="${a('ariaFill')}">
        <span class="rname">${esc(name)}</span>
        <textarea rows="1" data-k="regions.${k}.text" aria-label="${a('ariaText')}" spellcheck="false"></textarea>
        <input type="color" class="swatch round" data-k="regions.${k}.color" title="${a('ariaTextColor')}" aria-label="${a('ariaTextColor')}">
        <input type="number" class="num" data-k="regions.${k}.size" min="4" max="1000" step="1" title="${esc(t('titleSize'))}" aria-label="${a('ariaSize')}">
        <label class="tog" title="${esc(t('titleBold'))}"><input type="checkbox" data-k="regions.${k}.bold" aria-label="${a('ariaBold')}"><span>B</span></label>`;
      host.appendChild(row);
    }
  }

  function fillSelect(sel, items) {
    sel.textContent = '';
    for (const [value, label] of items) sel.add(new Option(label, String(value)));
  }

  function mountSelects() {
    fillSelect($('#fontSelect'), Object.keys(FONTS).map(k => [k, t('font_' + k)]));
    fillSelect($('#exportScale'), [0.5, 1, 2, 3, 4].map(v => [v, `${v}x`]));
  }

  function fitTextarea(el) { el.rows = clamp(el.value.split('\n').length, 1, 4); }

  function syncControls(skip) {
    for (const el of $$('[data-k]')) {
      if (el === skip) continue;
      const v = getPath(state, el.dataset.k);
      if (el.type === 'checkbox') el.checked = !!v;
      else if (String(el.value) !== String(v)) el.value = v;
      if (el.tagName === 'TEXTAREA') fitTextarea(el);
    }
    for (const o of $('#exportScale').options) {
      const k = Number(o.value);
      o.textContent = `${k}x · ${Math.round(geo.stat.w * k)}×${Math.round(geo.stat.h * k)}`;
    }
    const a = state.anim;
    $('#animInfo').textContent = `${Math.round(a.size)}×${Math.round(a.size)} · ${a.fps} fps`;
  }

  function changed(key) {
    geo = computeGeo(state);
    if (!key || /text|bold|font/.test(key)) ensureFontsSoon();
    saveSoon();
    requestRender();
  }

  function onControl(e) {
    const el = e.target, k = el.dataset && el.dataset.k;
    if (!k) return;
    let v;
    if (el.type === 'checkbox') v = el.checked;
    else if (el.type === 'range' || el.type === 'number' || 'num' in el.dataset) {
      v = parseFloat(el.value);
      if (!isFinite(v)) return;
      if (e.type === 'change' && el.min !== '' && el.max !== '') {
        v = clamp(v, Number(el.min), Number(el.max));
        el.value = v;
      }
    } else v = el.value;
    if (el.tagName === 'TEXTAREA') fitTextarea(el);
    setPath(state, k, v);
    syncControls(el);
    changed(k);
  }

  function mountPresets() {
    const tp = $('#textPresets');
    tp.textContent = '';
    textPresets().forEach(p => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = p.name;
      b.addEventListener('click', () => {
        applyTextPreset(state, p);
        syncControls();
        changed('text');
      });
      tp.appendChild(b);
    });

    const cp = $('#colorPresets');
    cp.textContent = '';
    const addColorChip = (name, fills, onClick) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      const dots = document.createElement('span');
      dots.className = 'dots';
      fills.forEach(c => { const i = document.createElement('i'); i.style.background = c; dots.appendChild(i); });
      b.append(dots, document.createTextNode(name));
      b.addEventListener('click', onClick);
      cp.appendChild(b);
      return b;
    };
    COLOR_PRESETS.forEach(p => addColorChip(t(p.name), p.fill.slice(0, 3), () => {
      KEYS.forEach((k, i) => Object.assign(state.regions[k], { fill: p.fill[i], color: p.color[i] }));
      state.bg = p.bg;
      syncControls();
      changed('color');
    }));
    const rnd = addColorChip(t('colorRandom'), ['#999', '#bbb', '#ddd'], () => {
      randomColors();
      syncControls();
      changed('color');
      rnd.querySelectorAll('.dots i').forEach((d, i) => { d.style.background = state.regions[KEYS[i]].fill; });
    });
  }

  // 静态文案：data-i18n → 文本，data-i18n-aria / -alt → 对应属性
  function applyStaticText() {
    document.documentElement.lang = lang;
    document.title = t('title');
    $('meta[name="description"]').setAttribute('content', t('description'));
    for (const el of $$('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const el of $$('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
    for (const el of $$('[data-i18n-alt]')) el.alt = t(el.dataset.i18nAlt);
    $('#langSelect').value = lang;
    $('#hint').textContent = t(mode === 'static' ? 'hintStatic' : 'hintAnim');
    updatePlayBtn();
    updateResultText();
  }

  function buildUI() {
    applyStaticText();
    mountSliders();
    mountRegions();
    mountSelects();
    mountPresets();
    syncControls();
  }

  function setLang(next) {
    if (next === lang || !I18N.messages[next]) return;
    closeMenu();
    endEdit(true);
    // 图上还是某套预设文案（没改过）时，换成新语言里对应的那一套
    const i = textPresets().findIndex(p => KEYS.every((k, j) => state.regions[k].text === p.t[j]));
    const oldFont = I18N.defaultFont[lang];
    lang = next;
    storageSet(LANG_KEY, lang);
    if (i >= 0) applyTextPreset(state, textPresets()[i]);
    if (state.font === oldFont) state.font = I18N.defaultFont[lang] || state.font;
    buildUI();
    changed('text');
  }

  // ---------- 配色 ----------
  function mixColors(hexes, how) {
    const cs = hexes.map(hexToRgb);
    if (how === 'multiply') return rgbToHex(cs.reduce((acc, c) => acc.map((v, i) => v * c[i] / 255)));
    return rgbToHex([0, 1, 2].map(i => cs.reduce((s, c) => s + c[i], 0) / cs.length));
  }
  const darken = (hex, k) => rgbToHex(hexToRgb(hex).map(v => v * k));
  const innerText = hex => (luminance(hex) > 0.5 ? '#000000' : '#ffffff');

  function autoMix(how) {
    const R = state.regions;
    R.ab.fill = mixColors([R.a.fill, R.b.fill], how);
    R.ac.fill = mixColors([R.a.fill, R.c.fill], how);
    R.bc.fill = mixColors([R.b.fill, R.c.fill], how);
    const center = mixColors([R.a.fill, R.b.fill, R.c.fill], how);
    R.abc.fill = how === 'multiply' ? center : darken(center, 0.4);
    for (const k of ['ab', 'ac', 'bc', 'abc']) R[k].color = innerText(R[k].fill);
  }

  function randomColors() {
    const R = state.regions;
    const h = Math.random() * 360;
    const spread = 100 + Math.random() * 40;
    const hues = [h, h + spread, h + 2 * spread].map(x => x % 360);
    ['a', 'b', 'c'].forEach((k, i) => {
      R[k].fill = hsl(hues[i], 62 + Math.random() * 20, 56 + Math.random() * 10);
      R[k].color = luminance(R[k].fill) > 0.28 ? '#000000' : '#ffffff';
    });
    for (const k of ['ab', 'ac', 'bc']) {
      let c = mixColors([R[k[0]].fill, R[k[1]].fill], 'avg');
      for (let i = 0; i < 8 && luminance(c) > 0.33; i++) c = darken(c, 0.9);
      R[k].fill = c;
      R[k].color = '#ffffff';
    }
    R.abc.fill = hsl(h, 8, 22);
    R.abc.color = '#ffffff';
    state.bg = '#ffffff';
  }

  // ---------- 导出：静态图 ----------
  function fileBase() {
    const name = ['a', 'b', 'c'].map(k => state.regions[k].text).join('-').replace(/[\s\\/:*?"<>|]+/g, '').slice(0, 40);
    return t('fileBase') + (name ? '-' + name : '');
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  // opaque：JPG / BMP 没有透明通道，透明背景时垫白
  function renderStatic(opaque) {
    const L = geo.stat, s = state.exportScale;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(L.w * s));
    c.height = Math.max(1, Math.round(L.h * s));
    const bg = state.transparent ? (opaque ? '#ffffff' : null) : state.bg;
    paint(c.getContext('2d'), L, { scale: s, bg });
    return c;
  }
  const toBlob = (canvas, mime, q) => new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error(t('blobFailed')))), mime, q));

  async function exportStatic(fmt) {
    await ensureFonts();
    const base = fileBase();
    if (fmt === 'svg') return download(new Blob([buildSVG()], { type: 'image/svg+xml' }), base + '.svg');
    if (fmt === 'bmp') {
      const c = renderStatic(true);
      return download(Encoders.encodeBMP(c.getContext('2d').getImageData(0, 0, c.width, c.height)), base + '.bmp');
    }
    if (fmt === 'ico') {
      // 多尺寸图标，非正方形时居中放进正方形
      const L = geo.stat, side = Math.max(L.w, L.h), pngs = [];
      const sq = { w: side, h: side, ox: L.ox + (side - L.w) / 2, oy: L.oy + (side - L.h) / 2 };
      for (const size of [16, 32, 48, 64, 128, 256]) {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        paint(c.getContext('2d'), sq, { scale: size / side, bg: state.transparent ? null : state.bg });
        pngs.push({ size, bytes: await blobBytes(await toBlob(c, 'image/png')) });
      }
      return download(Encoders.encodeICO(pngs), base + '.ico');
    }
    const mime = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif' }[fmt];
    const blob = await toBlob(renderStatic(fmt === 'jpg'), mime, 0.95);
    if (blob.type !== mime) {
      toast(t('fmtUnsupported', { fmt: fmt.toUpperCase() }));
      return download(blob, base + '.png');
    }
    download(blob, `${base}.${fmt}`);
  }

  const canClipboard = () => !!(navigator.clipboard && navigator.clipboard.write && window.ClipboardItem);

  async function copyImage() {
    if (!canClipboard()) return toast(t('copyUnsupported'));
    try {
      const blob = (async () => { await ensureFonts(); return toBlob(renderStatic(false), 'image/png'); })();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast(t('copied'));
    } catch (e) {
      toast(t('copyFailed', { msg: e.message || e }));
    }
  }

  // ---------- 导出：动图 / 视频 ----------
  let animBusy = false;

  async function makeAnim(kind, btn) {
    if (animBusy) throw new Error('busy');
    animBusy = true;
    const btns = $$('[data-export="gif"],[data-export="apng"],[data-export="webpa"],[data-export="video"],[data-export="copygif"]');
    btns.forEach(b => { b.disabled = true; });
    const label0 = btn ? btn.textContent : '';
    const progress = p => { if (btn) btn.textContent = t(kind === 'video' ? 'recording' : 'progress', { p: Math.round(p * 100) }); };
    progress(0);
    try {
      await ensureFonts();
      const a = clone(state.anim);
      const fps = Math.min(a.fps, FPS_CAP[kind]);
      if (a.fps > fps) toast(t('fpsCapped', { fmt: fmtName(kind), max: fps }));
      const L = geo.anim;
      let size = Math.round(clamp(a.size, 16, 2048));
      if (kind === 'video') size -= size % 2; // H.264 要求偶数尺寸
      const s = size / L.w;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      // 不透明时不要 alpha 通道：PNG / WebP 帧能小不少
      const ctx = canvas.getContext('2d', { willReadFrequently: kind === 'gif', alpha: state.transparent && kind !== 'video' });
      const bg = state.transparent ? (kind === 'video' ? '#ffffff' : null) : state.bg;
      const draw = time => paint(ctx, L, { scale: s, ...frameAt(time, a), upright: a.upright, bg });

      let blob, meta;
      if (kind === 'video') {
        blob = await recordVideo(canvas, draw, a, fps, progress);
        meta = { key: 'videoMeta', p: { w: size, h: size, dur: (a.spin + a.hold).toFixed(1), size: fmtBytes(blob.size) } };
      } else {
        const frames = frameList(a, fps), n = frames.length;
        if (kind === 'gif') {
          const delays = toDelays(frames, 10);
          const enc = new GifEncoder(size, size, { loop: a.loop, transparent: state.transparent });
          const grab = () => ctx.getImageData(0, 0, size, size).data;
          // 从几帧代表性画面里挑出调色板
          for (const time of [0, 0.15, 0.35, 0.6, 0.85].map(x => x * a.spin).concat([a.spin + EFFECT * 0.3, a.spin + EFFECT + 1])) {
            draw(time);
            enc.sample(grab());
          }
          enc.buildPalette();
          for (let i = 0; i < n; i++) {
            draw(frames[i].t);
            enc.addFrame(grab(), delays[i]);
            if (i % 2 === 1) { progress((i + 1) / n); await tick(); }
          }
          blob = new Blob([enc.finish()], { type: 'image/gif' });
        } else if (kind === 'apng') {
          // 浏览器按整毫秒播放 APNG，所以也按毫秒累计取整（60 帧/秒就是 17/16/17…）
          const delays = toDelays(frames, 1);
          const w = new Encoders.ApngWriter(n, { loop: a.loop });
          for (let i = 0; i < n; i++) {
            draw(frames[i].t);
            w.addFrame(await blobBytes(await toBlob(canvas, 'image/png')), delays[i], 1000);
            progress((i + 1) / n);
          }
          blob = w.finish();
        } else {
          const delays = toDelays(frames, 1);
          const w = new Encoders.WebpAnimWriter(size, size, { loop: a.loop, alpha: state.transparent });
          for (let i = 0; i < n; i++) {
            draw(frames[i].t);
            const b = await toBlob(canvas, 'image/webp', 0.92);
            if (b.type !== 'image/webp') throw new Error(t('webpUnsupported'));
            w.addFrame(await blobBytes(b), delays[i]);
            progress((i + 1) / n);
          }
          blob = w.finish();
        }
        meta = { key: 'animMeta', p: { w: size, h: size, n, fps, size: fmtBytes(blob.size) } };
      }
      await showResult(kind, blob, meta);
      toast(t('animDone', { fmt: fmtName(kind) }));
      return blob;
    } catch (e) {
      console.error(e);
      toast(t('animFailed', { msg: e.message || e }));
      throw e;
    } finally {
      animBusy = false;
      btns.forEach(b => { b.disabled = false; });
      if (btn) btn.textContent = label0;
    }
  }

  // 视频只能实时录制：按帧率画到画布上，由 MediaRecorder 录下一整轮
  async function recordVideo(canvas, draw, a, fps, progress) {
    const mime = window.MediaRecorder && canvas.captureStream && VIDEO_TYPES.find(m => MediaRecorder.isTypeSupported(m));
    if (!mime) throw new Error(t('videoUnsupported'));
    const period = Math.max(0.1, a.spin + a.hold);
    // 循环视频从停住的完整画面开始，首帧（封面）更好看
    const offset = a.loop ? a.spin + Math.min(EFFECT, a.hold) : 0;
    const at = tau => (tau + offset) % period;
    // captureStream(0) + requestFrame()：每画一帧就明确交给录制器（不在页面上的画布不会被自动采样）
    const stream = canvas.captureStream(0);
    const track = stream.getVideoTracks()[0];
    const frame = time => { draw(time); if (track.requestFrame) track.requestFrame(); };
    const bps = clamp(canvas.width * canvas.height * fps * 0.2, 1e6, 16e6);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Math.round(bps) });
    const chunks = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise(r => { rec.onstop = r; });
    rec.start();
    frame(at(0));
    const start = performance.now();
    let last = -1;
    await new Promise(resolve => {
      const step = () => {
        const tau = (performance.now() - start) / 1000;
        if (tau >= period) { frame(at(period - 1e-4)); resolve(); return; }
        const idx = Math.floor(tau * fps);
        if (idx !== last) { last = idx; frame(at(idx / fps)); progress(tau / period); }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    await new Promise(r => setTimeout(r, 100)); // 让最后一帧也录进去
    rec.stop();
    stream.getTracks().forEach(tr => tr.stop());
    await stopped;
    return new Blob(chunks, { type: mime.split(';')[0] });
  }

  // ---------- 成品预览：可暂停的播放器 ----------
  const result = { kind: null, blob: null, url: null, meta: null, sig: null };
  // mode: decoder（用 ImageDecoder 逐帧播放，可真正暂停/继续）| img（不支持时退回 <img>，暂停时定格当前帧）| video
  const player = { mode: null, dec: null, count: 0, reps: 0, frame: 0, loops: 0, playing: false, token: 0, timer: 0, frozen: false };
  const extOf = (kind, blob) => ({ gif: 'gif', apng: 'png', webpa: 'webp' }[kind] || (blob.type.includes('mp4') ? 'mp4' : 'webm'));

  function stopPlayer() {
    player.playing = false;
    player.token++;
    clearTimeout(player.timer);
    if (player.dec) { try { player.dec.close(); } catch (e) { /* 已关闭 */ } }
    player.dec = null;
    const vid = $('#animVideo');
    vid.pause();
    vid.removeAttribute('src');
  }

  async function loadDecoder(blob) {
    if (!window.ImageDecoder) return false;
    try {
      if (!(await ImageDecoder.isTypeSupported(blob.type))) return false;
      const dec = new ImageDecoder({ data: await blob.arrayBuffer(), type: blob.type });
      await dec.tracks.ready;
      await dec.completed;
      const tr = dec.tracks.selectedTrack;
      Object.assign(player, { dec, count: tr.frameCount, reps: tr.repetitionCount, frame: 0, loops: 0 });
      return tr.frameCount > 0;
    } catch (e) {
      return false;
    }
  }

  async function runPlayer(token) {
    const cv = $('#animCanvas'), ctx = cv.getContext('2d');
    while (player.playing && token === player.token) {
      let res;
      try { res = await player.dec.decode({ frameIndex: player.frame }); } catch (e) { return; }
      const img = res.image;
      if (token !== player.token) { img.close(); return; }
      if (cv.width !== img.displayWidth || cv.height !== img.displayHeight) { cv.width = img.displayWidth; cv.height = img.displayHeight; }
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0);
      const ms = Math.max(10, (img.duration || 100000) / 1000);
      img.close();
      await new Promise(r => { player.timer = setTimeout(r, ms); });
      if (token !== player.token || !player.playing) return;
      player.frame++;
      if (player.frame >= player.count) {
        player.loops++;
        if (Number.isFinite(player.reps) && player.loops > player.reps) {
          player.frame = player.count - 1;
          player.playing = false;
          updateResultBadge();
          return;
        }
        player.frame = 0;
      }
    }
  }

  function toggleResult() {
    if (player.mode === 'video') {
      const v = $('#animVideo');
      if (v.paused) v.play().catch(() => {}); else v.pause();
    } else if (player.mode === 'decoder') {
      if (player.playing) { player.playing = false; player.token++; clearTimeout(player.timer); }
      else {
        if (player.frame >= player.count - 1 && Number.isFinite(player.reps) && player.loops > player.reps) { player.frame = 0; player.loops = 0; }
        player.playing = true;
        runPlayer(++player.token);
      }
    } else if (player.mode === 'img') {
      const img = $('#animImg'), cv = $('#animCanvas');
      if (player.frozen) { cv.hidden = true; img.hidden = false; }
      else {
        cv.width = img.naturalWidth;
        cv.height = img.naturalHeight;
        const ctx = cv.getContext('2d');
        ctx.clearRect(0, 0, cv.width, cv.height);
        ctx.drawImage(img, 0, 0); // 画下当前这一帧
        cv.hidden = false;
        img.hidden = true;
      }
      player.frozen = !player.frozen;
    }
    updateResultBadge();
  }

  function resultPaused() {
    if (player.mode === 'video') return $('#animVideo').paused;
    if (player.mode === 'decoder') return !player.playing;
    return player.frozen;
  }
  function updateResultBadge() {
    const badge = $('#animBadge');
    badge.hidden = !result.blob || !resultPaused();
    badge.setAttribute('aria-label', t('paused'));
  }

  async function showResult(kind, blob, meta) {
    stopPlayer();
    if (result.url) URL.revokeObjectURL(result.url);
    Object.assign(result, { kind, blob, meta, url: URL.createObjectURL(blob), sig: stateSig() });
    const cv = $('#animCanvas'), img = $('#animImg'), vid = $('#animVideo');
    cv.hidden = img.hidden = vid.hidden = true;
    player.frozen = false;
    if (kind === 'video') {
      player.mode = 'video';
      vid.src = result.url;
      vid.hidden = false;
      vid.play().catch(() => {});
    } else if (await loadDecoder(blob)) {
      player.mode = 'decoder';
      cv.hidden = false;
      player.playing = true;
      runPlayer(++player.token);
    } else {
      player.mode = 'img';
      img.src = result.url;
      img.hidden = false;
    }
    const dl = $('#animDownload');
    dl.href = result.url;
    dl.download = `${fileBase()}.${extOf(kind, blob)}`;
    updateResultText();
    const card = $('#animCard');
    card.hidden = false;
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function resultFile() {
    return new File([result.blob], $('#animDownload').download, { type: result.blob.type });
  }
  const canShareFile = () => {
    try { return !!(result.blob && navigator.canShare && navigator.canShare({ files: [resultFile()] })); } catch (e) { return false; }
  };

  function updateResultText() {
    if (!result.blob) return;
    const name = fmtName(result.kind);
    $('#animDownload').textContent = t('download', { fmt: name });
    $('#animCopy').textContent = t('copyFmt', { fmt: name });
    $('#animMeta').textContent = t(result.meta.key, result.meta.p);
    $('#animShare').hidden = !canShareFile();
    updateResultBadge();
  }

  // 浏览器的剪贴板不认 GIF / 视频文件：写入 HTML（内嵌数据）供文档、邮件等粘贴，
  // 支持的浏览器再附上原始格式（或 Chrome 的 web 自定义格式）
  async function copyAnimBlob(blobPromise, mime) {
    const isVideo = mime.startsWith('video/');
    const html = blobPromise.then(async b => {
      const src = await dataURL(b);
      return new Blob([isVideo ? `<video src="${src}" autoplay loop muted playsinline></video>` : `<img src="${src}" alt="">`], { type: 'text/html' });
    });
    const supports = type => { try { return !!(ClipboardItem.supports && ClipboardItem.supports(type)); } catch (e) { return false; } };
    const items = { 'text/html': html };
    if (supports(mime)) items[mime] = blobPromise;
    else if (supports('web ' + mime)) items['web ' + mime] = blobPromise;
    try {
      await navigator.clipboard.write([new ClipboardItem(items)]);
    } catch (e) {
      if (Object.keys(items).length === 1) throw e;
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': html })]);
    }
  }

  async function copyResult() {
    if (!result.blob) return;
    if (!canClipboard()) return toast(t('copyUnsupported'));
    try {
      await copyAnimBlob(Promise.resolve(result.blob), result.blob.type);
      toast(t(result.kind === 'video' ? 'videoCopied' : 'animCopied'));
    } catch (e) {
      toast(t('copyFailed', { msg: e.message || e }));
    }
  }

  // 「复制 GIF」：当前设置已经生成过 GIF 就直接用，否则先生成
  async function copyGifQuick(btn) {
    if (!canClipboard()) return toast(t('copyUnsupported'));
    if (animBusy) return;
    const cached = result.kind === 'gif' && result.sig === stateSig();
    const blob = cached ? Promise.resolve(result.blob) : makeAnim('gif', btn);
    try {
      await copyAnimBlob(blob, 'image/gif');
      toast(t('animCopied'));
    } catch (e) {
      if (e.message !== 'busy') toast(t('copyFailed', { msg: e.message || e }));
    }
  }

  async function shareResult() {
    if (!result.blob) return;
    try {
      await navigator.share({ files: [resultFile()], title: t('title') });
    } catch (e) {
      if (e.name !== 'AbortError') toast(t('shareFailed', { msg: e.message || e }));
    }
  }

  function onExport(f, btn) {
    if (f === 'copy') return copyImage();
    if (f === 'copygif') return copyGifQuick(btn);
    if (ANIM_KINDS.includes(f)) return makeAnim(f, btn).catch(() => {});
    exportStatic(f).catch(e => toast(t('exportFailed', { msg: e.message || e })));
  }

  // ---------- 杂项 ----------
  let toastTimer = 0;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), Math.min(8000, 2000 + msg.length * 45));
  }

  async function share() {
    const url = `${location.origin}${location.pathname}#s=${encodeState(state)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast(t('shared'));
    } catch (e) {
      prompt(t('sharePrompt'), url);
    }
  }

  function detectAvif() {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    c.toBlob(b => { if (b && b.type === 'image/avif') $('[data-export="avif"]').hidden = false; }, 'image/avif');
  }

  function init() {
    geo = computeGeo(state);
    fillSelect($('#langSelect'), I18N.LANGS.map(l => [l.code, l.name]));
    buildUI();

    document.addEventListener('input', onControl);
    document.addEventListener('change', onControl);

    $('#langSelect').addEventListener('change', e => setLang(e.target.value));
    $$('.seg [data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
    $('#playBtn').addEventListener('click', togglePlay);
    $('#previewAnim').addEventListener('click', () => {
      setMode('anim');
      box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    $$('[data-export]').forEach(b => b.addEventListener('click', () => onExport(b.dataset.export, b)));
    $$('[data-mix]').forEach(b => b.addEventListener('click', () => {
      autoMix(b.dataset.mix);
      syncControls();
      changed('color');
    }));
    $('#animBox').addEventListener('click', e => { if (e.detail <= 1) toggleResult(); });
    $('#animVideo').addEventListener('play', updateResultBadge);
    $('#animVideo').addEventListener('pause', updateResultBadge);
    $('#animCopy').addEventListener('click', copyResult);
    $('#animShare').addEventListener('click', shareResult);
    $('#animClose').addEventListener('click', () => { stopPlayer(); $('#animCard').hidden = true; });
    $('#resetPos').addEventListener('click', () => {
      KEYS.forEach(k => { state.regions[k].dx = 0; state.regions[k].dy = 0; });
      changed('pos');
    });
    $('#shareBtn').addEventListener('click', share);
    $('#resetBtn').addEventListener('click', () => {
      if (!confirm(t('resetConfirm'))) return;
      endEdit(false);
      state = defaults();
      syncControls();
      changed();
      toast(t('resetDone'));
    });

    // 菜单：点外面、按 Esc、滚动或改变窗口大小时关闭
    document.addEventListener('pointerdown', e => { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); }, true);
    window.addEventListener('scroll', closeMenu, { passive: true });
    window.addEventListener('resize', () => { closeMenu(); requestRender(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeMenu();
      const tag = document.activeElement && document.activeElement.tagName;
      if (e.code === 'Space' && mode === 'anim' && !/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(tag)) {
        e.preventDefault();
        togglePlay();
      }
    });

    new ResizeObserver(requestRender).observe($('.canvas-area'));
    if (document.fonts) document.fonts.addEventListener('loadingdone', requestRender);

    detectAvif();
    drawView();
    ensureFonts().then(requestRender);
  }

  // 方便调试与自动化检查
  window.sansetu = {
    get state() { return state; }, get geo() { return geo; }, get lang() { return lang; },
    setLang, setMode, paint, buildSVG, frameList, frameAt, toDelays, ensureFonts, labelBox, makeAnim, startEdit, openMenu,
  };

  init();
})();
