/* 三色图制作器 */
(() => {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  // ---------- 常量 ----------
  const KEYS = ['a', 'b', 'c', 'ab', 'ac', 'bc', 'abc'];
  const NAMES = { a: '上圆', b: '左圆', c: '右圆', ab: '上∩左', ac: '上∩右', bc: '左∩右', abc: '中心' };
  const MASK = { a: 1, b: 2, c: 4, ab: 3, ac: 5, bc: 6, abc: 7 };
  const AXIS = { a: -90, b: 150, c: 30, ab: 210, ac: -30, bc: 90 };
  const LINE_H = 1.15;
  const EFFECT = 0.5; // 中心字特效时长（秒）
  // GIF 帧延时以 1/100 秒计，很多播放器会把过短的延时（如 50 帧/秒的 2/100 秒）拉慢，所以最高 25 帧
  const FPS = [10, 15, 20, 25];
  const STORE_KEY = 'sansetu:v1';

  const GF = 'https://fonts.googleapis.com/css2?family=';
  const FONTS = {
    sans: { name: '思源黑体', family: 'Noto Sans SC', css: GF + 'Noto+Sans+SC:wght@400;700&display=swap', fallback: '"Source Han Sans SC","PingFang SC","Microsoft YaHei",sans-serif' },
    serif: { name: '思源宋体', family: 'Noto Serif SC', css: GF + 'Noto+Serif+SC:wght@400;700&display=swap', fallback: '"Source Han Serif SC","Songti SC","SimSun",serif' },
    kuaile: { name: '站酷快乐体', family: 'ZCOOL KuaiLe', css: GF + 'ZCOOL+KuaiLe&display=swap', fallback: '"PingFang SC","Microsoft YaHei",sans-serif' },
    xiaowei: { name: '站酷小薇', family: 'ZCOOL XiaoWei', css: GF + 'ZCOOL+XiaoWei&display=swap', fallback: '"Songti SC","SimSun",serif' },
    mashan: { name: '马善政毛笔', family: 'Ma Shan Zheng', css: GF + 'Ma+Shan+Zheng&display=swap', fallback: '"KaiTi","STKaiti",serif' },
    longcang: { name: '龙藏手写', family: 'Long Cang', css: GF + 'Long+Cang&display=swap', fallback: '"KaiTi","STKaiti",serif' },
    system: { name: '系统默认字体', family: null, css: null, fallback: 'system-ui,"PingFang SC","Microsoft YaHei",sans-serif' },
  };
  const fontStack = key => {
    const f = FONTS[key] || FONTS.sans;
    return (f.family ? `"${f.family}",` : '') + f.fallback;
  };

  const region = (text, fill, color, size, bold = false, [dx, dy] = [0, 0]) => ({ text, fill, color, size, bold, dx, dy });
  // 原图文字是手工摆放的，略偏离对称位置，这里还原出来
  const ORIGINAL_OFFSETS = [[13, -2], [9, 0], [5, 0], [-4, -3], [6, -3], [-2, -2], [7, 2]];
  const DEFAULTS = {
    regions: {
      a: region('稳定', '#da3e41', '#000000', 104, false, ORIGINAL_OFFSETS[0]),
      b: region('速度', '#efe84d', '#000000', 104, false, ORIGINAL_OFFSETS[1]),
      c: region('便宜', '#53b0db', '#000000', 104, false, ORIGINAL_OFFSETS[2]),
      ab: region('贵', '#ec9e3b', '#ffffff', 104, false, ORIGINAL_OFFSETS[3]),
      ac: region('慢', '#7766a7', '#ffffff', 104, false, ORIGINAL_OFFSETS[4]),
      bc: region('差', '#299c7b', '#ffffff', 104, false, ORIGINAL_OFFSETS[5]),
      abc: region('滚', '#37363a', '#ffffff', 132, true, ORIGINAL_OFFSETS[6]),
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

  // 文案预设：[上, 左, 右, 上∩左, 上∩右, 左∩右, 中心]，字号同序
  const TEXT_PRESETS = [
    { name: '稳定·速度·便宜', t: ['稳定', '速度', '便宜', '贵', '慢', '差', '滚'], s: [104, 104, 104, 104, 104, 104, 132], o: ORIGINAL_OFFSETS },
    { name: '钱多·事少·离家近', t: ['钱多', '事少', '离家近', '远', '累', '穷', '做梦'], s: [92, 92, 84, 104, 104, 104, 100] },
    { name: '学习·睡觉·社交', t: ['学习', '睡觉', '社交', '孤独', '熬夜', '挂科', '做梦'], s: [104, 104, 104, 72, 72, 72, 100] },
    { name: '好·快·便宜', t: ['好', '快', '便宜', '贵', '慢', '烂', '做梦'], s: [120, 120, 104, 104, 104, 104, 100] },
    { name: '有钱·好看·专一', t: ['有钱', '好看', '专一', '渣', '丑', '穷', '醒醒'], s: [104, 104, 104, 104, 104, 104, 100] },
  ];

  // 配色预设：底色 / 字色（同 KEYS 顺序）/ 背景
  const COLOR_PRESETS = [
    { name: '原版', fill: ['#da3e41', '#efe84d', '#53b0db', '#ec9e3b', '#7766a7', '#299c7b', '#37363a'], color: ['#000000', '#000000', '#000000', '#ffffff', '#ffffff', '#ffffff', '#ffffff'], bg: '#ffffff' },
    { name: '马卡龙', fill: ['#ffadb5', '#ffe79a', '#9fd3f5', '#f5a15e', '#9b83d9', '#5fbf94', '#ef5d7f'], color: ['#4a3b3b', '#4a3b3b', '#4a3b3b', '#ffffff', '#ffffff', '#ffffff', '#ffffff'], bg: '#fffaf4' },
    { name: '霓虹', fill: ['#ff2e63', '#f9ed69', '#08d9d6', '#ff8c42', '#9d4edd', '#2ec27e', '#ffffff'], color: ['#111111', '#111111', '#111111', '#111111', '#ffffff', '#111111', '#111111'], bg: '#15151f' },
    { name: '莫兰迪', fill: ['#c9a3a0', '#dccfae', '#9fb2bf', '#b88a73', '#8d88a6', '#7f9a82', '#4f4a4a'], color: ['#3b3434', '#3b3434', '#3b3434', '#ffffff', '#ffffff', '#ffffff', '#ffffff'], bg: '#f3f0ea' },
    { name: '黑白', fill: ['#e8e8e8', '#c4c4c4', '#a0a0a0', '#7a7a7a', '#5c5c5c', '#444444', '#111111'], color: ['#111111', '#111111', '#111111', '#ffffff', '#ffffff', '#ffffff', '#ffffff'], bg: '#ffffff' },
  ];

  // ---------- 工具 ----------
  const clone = o => JSON.parse(JSON.stringify(o));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const isHex = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tick = () => new Promise(r => setTimeout(r, 0));

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
  // 旧版本保存的非法值（比如已移除的 50 帧/秒）改成最接近的可用值
  function normalize(st) {
    if (!FPS.includes(st.anim.fps)) st.anim.fps = FPS.reduce((a, b) => (Math.abs(b - st.anim.fps) < Math.abs(a - st.anim.fps) ? b : a));
    return st;
  }

  function loadInitial() {
    const m = location.hash.match(/^#s=([\w-]+)/);
    if (m) {
      try {
        const st = merge(clone(DEFAULTS), decodeState(m[1]));
        history.replaceState(null, '', location.pathname + location.search);
        return normalize(st);
      } catch (e) { /* 链接损坏则忽略 */ }
    }
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return normalize(merge(clone(DEFAULTS), JSON.parse(raw)));
    } catch (e) { /* 无痕模式等 */ }
    return clone(DEFAULTS);
  }

  let state = loadInitial();
  let geo = null; // 在 init() 中计算

  let saveTimer = 0;
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* 忽略 */ }
    }, 300);
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
      const t = tMax * i / steps;
      if (maskAt(C, t * ux, t * uy) === want) {
        if (inner < 0) inner = t;
        outer = t;
      } else if (inner >= 0) break;
    }
    if (inner < 0) return { x: vx, y: vy };
    const t = inner + (single ? 0.46 : 0.40) * (outer - inner);
    return { x: t * ux, y: t * uy };
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
  // L: 布局 {w,h,ox,oy}; o: {scale, angle, cs(中心字缩放), upright, bg}
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
      if (!r.text.trim()) continue;
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
  let drag = null, hover = null;
  let renderQueued = false;

  const layout = () => (mode === 'static' ? geo.stat : geo.anim);

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
    paint(vctx, L, { scale: s, angle: f.angle, cs: f.cs, upright: state.anim.upright, bg: state.transparent ? null : state.bg });
    const focus = drag ? drag.key : hover;
    if (mode === 'static' && focus) {
      const b = labelBox(focus);
      vctx.save();
      vctx.setTransform(s, 0, 0, s, L.ox * s, L.oy * s);
      vctx.lineWidth = 2 / s;
      vctx.strokeStyle = 'rgba(255,255,255,.9)';
      vctx.strokeRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12);
      vctx.setLineDash([6 / s, 4 / s]);
      vctx.strokeStyle = 'rgba(0,0,0,.75)';
      vctx.strokeRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12);
      vctx.restore();
    }
    $('#sizeInfo').textContent = mode === 'static'
      ? `${Math.round(L.w * state.exportScale)} × ${Math.round(L.h * state.exportScale)}`
      : `GIF ${Math.round(state.anim.size)} × ${Math.round(state.anim.size)}`;
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

  function frameAt(t, a) {
    if (t < a.spin) {
      const p = t / a.spin;
      return { angle: a.dir * a.turns * 2 * Math.PI * ease(a.easing, p, a.turns), cs: a.center === 'reveal' ? 0 : 1 };
    }
    const x = Math.min(1, (t - a.spin) / EFFECT);
    let cs = 1;
    if (a.center === 'pop' && x < 1) cs = 1 + 0.45 * Math.sin(Math.PI * x) * (1 - x);
    else if (a.center === 'reveal' && x < 1) cs = backOut(x);
    return { angle: 0, cs };
  }

  // GIF 帧序列：旋转 → 中心字特效 → 停住（停住那帧用长延时）
  function frameList(a) {
    const dt = 1 / a.fps, frames = [];
    // GIF 延时只能是整数个 1/100 秒：按累计时间取整，15 帧/秒时就是 7/7/6 交替，总时长不会跑偏
    let elapsed = 0, cs = 0;
    const push = (t, dur) => {
      elapsed += dur;
      const next = Math.round(elapsed * 100);
      frames.push({ t, delay: (next - cs) * 10 });
      cs = next;
    };
    const nSpin = Math.max(2, Math.ceil(a.spin * a.fps - 1e-6));
    for (let i = 0; i < nSpin; i++) push(i * dt, dt);
    const nEff = a.center === 'none' ? 0 : Math.floor(Math.min(EFFECT, a.hold) * a.fps);
    for (let i = 0; i < nEff; i++) push(a.spin + i * dt, dt);
    push(a.spin + EFFECT + 1, Math.max(dt, a.hold - nEff * dt));
    // 循环播放时把停住的完整画面放到第一帧，聊天软件里的缩略图更好看
    if (a.loop) frames.unshift(frames.pop());
    return frames;
  }

  function loop() {
    const a = state.anim;
    const period = Math.max(0.05, a.spin + a.hold);
    let t = ((performance.now() - t0) / 1000) % period;
    t = Math.floor(t * a.fps) / a.fps;
    lastFrame = frameAt(t, a);
    drawView(lastFrame);
    raf = requestAnimationFrame(loop);
  }
  function play() {
    if (playing) return;
    playing = true;
    t0 = performance.now();
    loop();
    updatePlayBtn();
  }
  function pause() {
    playing = false;
    cancelAnimationFrame(raf);
    updatePlayBtn();
    requestRender();
  }
  function updatePlayBtn() { $('#playBtn').textContent = playing ? '暂停' : '播放'; }

  function setMode(m) {
    mode = m;
    $$('.seg [data-mode]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === m)));
    $('#playBtn').hidden = m !== 'anim';
    $('#hint').textContent = m === 'static'
      ? '拖动图上的文字可以微调位置，双击文字直接修改'
      : '这里是动图的实时预览；点「生成 GIF 动图」得到可以保存的表情包';
    hover = null;
    view.style.cursor = '';
    if (m === 'anim') play();
    else { pause(); lastFrame = { angle: 0, cs: 1 }; }
    requestRender();
  }

  // ---------- 拖动文字 ----------
  function labelBox(key) {
    const r = state.regions[key], size = labelSize(r), lines = r.text.split('\n'), p = labelPos(key);
    mctx.font = fontOf(r, size);
    const w = Math.max(...lines.map(l => mctx.measureText(l).width), size * 0.5);
    const h = lines.length * size * LINE_H;
    return { x: p.x - w / 2, y: p.y - h / 2, w, h };
  }
  function hitLabel(pt) {
    for (let i = KEYS.length - 1; i >= 0; i--) {
      const key = KEYS[i];
      if (!state.regions[key].text.trim()) continue;
      const b = labelBox(key);
      if (pt.x >= b.x - 6 && pt.x <= b.x + b.w + 6 && pt.y >= b.y - 6 && pt.y <= b.y + b.h + 6) return key;
    }
    return null;
  }
  function toDesign(clientX, clientY) {
    const rect = view.getBoundingClientRect(), L = geo.stat;
    return {
      x: (clientX - rect.left) / rect.width * L.w - L.ox,
      y: (clientY - rect.top) / rect.height * L.h - L.oy,
    };
  }

  view.addEventListener('pointerdown', e => {
    if (mode !== 'static' || e.button > 0) return;
    const pt = toDesign(e.clientX, e.clientY);
    const key = hitLabel(pt);
    if (!key) return;
    const r = state.regions[key];
    drag = { key, x: pt.x, y: pt.y, dx: r.dx, dy: r.dy, id: e.pointerId };
    view.setPointerCapture(e.pointerId);
    view.style.cursor = 'grabbing';
    e.preventDefault();
    requestRender();
  });
  view.addEventListener('pointermove', e => {
    if (mode !== 'static') return;
    const pt = toDesign(e.clientX, e.clientY);
    if (drag && e.pointerId === drag.id) {
      const r = state.regions[drag.key];
      r.dx = Math.round(drag.dx + pt.x - drag.x);
      r.dy = Math.round(drag.dy + pt.y - drag.y);
      requestRender();
      return;
    }
    if (e.pointerType !== 'mouse') return;
    const key = hitLabel(pt);
    if (key !== hover) {
      hover = key;
      view.style.cursor = key ? 'grab' : '';
      requestRender();
    }
  });
  const endDrag = e => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    view.style.cursor = hover ? 'grab' : '';
    saveSoon();
    requestRender();
  };
  view.addEventListener('pointerup', endDrag);
  view.addEventListener('pointercancel', endDrag);
  view.addEventListener('pointerleave', () => {
    if (!drag && hover) { hover = null; view.style.cursor = ''; requestRender(); }
  });
  // 手指按在文字上时阻止页面滚动，其余位置照常滚动
  view.addEventListener('touchstart', e => {
    if (mode !== 'static' || e.touches.length !== 1) return;
    const t = e.touches[0];
    if (hitLabel(toDesign(t.clientX, t.clientY))) e.preventDefault();
  }, { passive: false });
  view.addEventListener('dblclick', e => {
    if (mode !== 'static') return;
    const key = hitLabel(toDesign(e.clientX, e.clientY));
    if (!key) return;
    const input = $(`[data-k="regions.${key}.text"]`);
    input.closest('details').open = true;
    input.focus();
    input.select();
  });

  // ---------- 控件绑定 ----------
  const getPath = (o, p) => p.split('.').reduce((x, k) => (x == null ? x : x[k]), o);
  function setPath(o, p, v) {
    const ks = p.split('.'), last = ks.pop();
    ks.reduce((x, k) => x[k], o)[last] = v;
  }

  const SLIDERS = {
    circleSliders: [
      { k: 'radius', label: '圆圈半径', min: 60, max: 600, step: 1, unit: 'px' },
      { k: 'gap', label: '圆心距离', min: 30, max: 200, step: 1, unit: '%' },
      { k: 'scale.a', label: '上圆大小', min: 40, max: 160, step: 1, unit: '%' },
      { k: 'scale.b', label: '左圆大小', min: 40, max: 160, step: 1, unit: '%' },
      { k: 'scale.c', label: '右圆大小', min: 40, max: 160, step: 1, unit: '%' },
      { k: 'strokeWidth', label: '圆圈描边', min: 0, max: 40, step: 1, unit: 'px' },
    ],
    textSliders: [
      { k: 'textScale', label: '整体字号', min: 30, max: 250, step: 1, unit: '%' },
      { k: 'textStrokeWidth', label: '文字描边', min: 0, max: 30, step: 0.5, unit: 'px' },
    ],
    canvasSliders: [
      { k: 'padding', label: '画布边距', min: 0, max: 300, step: 1, unit: 'px' },
    ],
    animSliders: [
      { k: 'anim.turns', label: '转几圈', min: 1, max: 10, step: 1, unit: '圈' },
      { k: 'anim.spin', label: '旋转时长', min: 0.3, max: 6, step: 0.1, unit: '秒' },
      { k: 'anim.hold', label: '停顿时长', min: 0, max: 6, step: 0.1, unit: '秒' },
      { k: 'anim.size', label: 'GIF 尺寸', min: 64, max: 1024, step: 8, unit: 'px' },
    ],
  };

  function mountSliders() {
    for (const [id, list] of Object.entries(SLIDERS)) {
      const host = document.getElementById(id);
      for (const s of list) {
        const row = document.createElement('div');
        row.className = 'ctl';
        const attrs = `data-k="${s.k}" min="${s.min}" max="${s.max}" step="${s.step}"`;
        row.innerHTML = `<span class="ctl-label">${s.label}</span>`
          + `<input type="range" ${attrs} aria-label="${s.label}">`
          + `<span class="ctl-num"><input type="number" ${attrs} aria-label="${s.label}数值"><i>${s.unit}</i></span>`;
        host.appendChild(row);
      }
    }
  }

  function mountRegions() {
    const host = $('#regionRows');
    for (const k of KEYS) {
      const row = document.createElement('div');
      row.className = 'region-row';
      row.innerHTML = `
        <input type="color" class="swatch" data-k="regions.${k}.fill" title="${NAMES[k]}底色" aria-label="${NAMES[k]}底色">
        <span class="rname">${NAMES[k]}</span>
        <textarea rows="1" data-k="regions.${k}.text" aria-label="${NAMES[k]}文字" spellcheck="false"></textarea>
        <input type="color" class="swatch round" data-k="regions.${k}.color" title="${NAMES[k]}文字颜色" aria-label="${NAMES[k]}文字颜色">
        <input type="number" class="num" data-k="regions.${k}.size" min="4" max="1000" step="1" title="字号" aria-label="${NAMES[k]}字号">
        <label class="tog" title="加粗"><input type="checkbox" data-k="regions.${k}.bold" aria-label="${NAMES[k]}加粗"><span>B</span></label>`;
      host.appendChild(row);
    }
  }

  function mountSelects() {
    const fs = $('#fontSelect');
    for (const [key, f] of Object.entries(FONTS)) fs.add(new Option(f.name, key));
    const es = $('#exportScale');
    for (const v of [0.5, 1, 2, 3, 4]) es.add(new Option(`${v}x`, String(v)));
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
    const es = $('#exportScale');
    for (const o of es.options) {
      const k = Number(o.value);
      o.textContent = `${k}x · ${Math.round(geo.stat.w * k)}×${Math.round(geo.stat.h * k)}`;
    }
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

  // ---------- 预设 ----------
  function mountPresets() {
    const tp = $('#textPresets');
    TEXT_PRESETS.forEach(p => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = p.name;
      b.addEventListener('click', () => {
        KEYS.forEach((k, i) => {
          const [dx, dy] = p.o ? p.o[i] : [0, 0];
          Object.assign(state.regions[k], { text: p.t[i], size: p.s[i], dx, dy });
        });
        state.regions.abc.bold = true;
        syncControls();
        changed('text');
      });
      tp.appendChild(b);
    });

    const cp = $('#colorPresets');
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
    COLOR_PRESETS.forEach(p => addColorChip(p.name, p.fill.slice(0, 3), () => {
      KEYS.forEach((k, i) => Object.assign(state.regions[k], { fill: p.fill[i], color: p.color[i] }));
      state.bg = p.bg;
      syncControls();
      changed('color');
    }));
    const rnd = addColorChip('随机', ['#999', '#bbb', '#ddd'], () => {
      randomColors();
      syncControls();
      changed('color');
      rnd.querySelectorAll('.dots i').forEach((d, i) => { d.style.background = state.regions[KEYS[i]].fill; });
    });

    $$('[data-mix]').forEach(b => b.addEventListener('click', () => {
      autoMix(b.dataset.mix);
      syncControls();
      changed('color');
    }));
  }

  function mixColors(hexes, mode) {
    const cs = hexes.map(hexToRgb);
    if (mode === 'multiply') return rgbToHex(cs.reduce((acc, c) => acc.map((v, i) => v * c[i] / 255)));
    return rgbToHex([0, 1, 2].map(i => cs.reduce((s, c) => s + c[i], 0) / cs.length));
  }
  const darken = (hex, k) => rgbToHex(hexToRgb(hex).map(v => v * k));
  const innerText = hex => (luminance(hex) > 0.5 ? '#000000' : '#ffffff');

  function autoMix(mode) {
    const R = state.regions;
    R.ab.fill = mixColors([R.a.fill, R.b.fill], mode);
    R.ac.fill = mixColors([R.a.fill, R.c.fill], mode);
    R.bc.fill = mixColors([R.b.fill, R.c.fill], mode);
    const center = mixColors([R.a.fill, R.b.fill, R.c.fill], mode);
    R.abc.fill = mode === 'multiply' ? center : darken(center, 0.4);
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

  // ---------- 导出 ----------
  function fileBase() {
    const name = ['a', 'b', 'c'].map(k => state.regions[k].text).join('-').replace(/[\s\\/:*?"<>|]+/g, '').slice(0, 40);
    return '三色图' + (name ? '-' + name : '');
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

  function renderStatic(fmt) {
    const L = geo.stat, s = state.exportScale;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(L.w * s));
    c.height = Math.max(1, Math.round(L.h * s));
    const bg = state.transparent ? (fmt === 'jpg' ? '#ffffff' : null) : state.bg;
    paint(c.getContext('2d'), L, { scale: s, bg });
    return c;
  }
  const toBlob = (canvas, mime, q) => new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('浏览器无法生成图片'))), mime, q));

  async function exportStatic(fmt) {
    await ensureFonts();
    if (fmt === 'svg') {
      download(new Blob([buildSVG()], { type: 'image/svg+xml' }), fileBase() + '.svg');
      return;
    }
    const mime = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[fmt];
    const blob = await toBlob(renderStatic(fmt), mime, 0.95);
    if (blob.type !== mime) {
      toast(`当前浏览器不支持导出 ${fmt.toUpperCase()}，已改存为 PNG`);
      download(blob, fileBase() + '.png');
      return;
    }
    download(blob, `${fileBase()}.${fmt}`);
  }

  async function copyImage() {
    if (!navigator.clipboard || !window.ClipboardItem) {
      toast('当前浏览器不支持复制图片，请使用下载');
      return;
    }
    try {
      const blob = (async () => { await ensureFonts(); return toBlob(renderStatic('png'), 'image/png'); })();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('图片已复制，可以直接粘贴到聊天窗口');
    } catch (e) {
      toast('复制失败：' + (e.message || e));
    }
  }

  let gifBusy = false, gifUrl = null;
  async function makeGif() {
    if (gifBusy) return;
    gifBusy = true;
    const btns = $$('[data-export="gif"]');
    const label = btns[0].textContent;
    const setLabel = text => btns.forEach(b => { b.textContent = text; b.disabled = text !== label; });
    setLabel('生成中…');
    try {
      await ensureFonts();
      const a = clone(state.anim), L = geo.anim;
      const size = Math.round(clamp(a.size, 16, 2048)), s = size / L.w;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const bg = state.transparent ? null : state.bg;
      const grab = f => {
        paint(ctx, L, { scale: s, angle: f.angle, cs: f.cs, upright: a.upright, bg });
        return ctx.getImageData(0, 0, size, size).data;
      };
      const frames = frameList(a);
      const enc = new GifEncoder(size, size, { loop: a.loop, transparent: state.transparent });
      // 从几帧代表性画面里挑出调色板
      for (const t of [0, 0.15, 0.35, 0.6, 0.85].map(x => x * a.spin).concat([a.spin + EFFECT * 0.3, a.spin + EFFECT + 1])) {
        enc.sample(grab(frameAt(t, a)));
      }
      enc.buildPalette();
      for (let i = 0; i < frames.length; i++) {
        enc.addFrame(grab(frameAt(frames[i].t, a)), frames[i].delay);
        if (i % 2 === 1) { setLabel(`生成中 ${Math.round((i + 1) / frames.length * 100)}%`); await tick(); }
      }
      const blob = new Blob([enc.finish()], { type: 'image/gif' });
      if (gifUrl) URL.revokeObjectURL(gifUrl);
      gifUrl = URL.createObjectURL(blob);
      $('#gifImg').src = gifUrl;
      const dl = $('#gifDownload');
      dl.href = gifUrl;
      dl.download = fileBase() + '.gif';
      const kb = blob.size / 1024;
      $('#gifMeta').textContent = `${size}×${size} · ${frames.length} 帧 · ${kb >= 1024 ? (kb / 1024).toFixed(2) + ' MB' : Math.round(kb) + ' KB'}`;
      const card = $('#gifCard');
      card.hidden = false;
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      toast('GIF 已生成');
    } catch (e) {
      console.error(e);
      toast('生成失败：' + (e.message || e));
    } finally {
      gifBusy = false;
      setLabel(label);
    }
  }

  // ---------- 杂项 ----------
  let toastTimer = 0;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  }

  async function share() {
    const url = `${location.origin}${location.pathname}#s=${encodeState(state)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('分享链接已复制，打开即可看到同样的图');
    } catch (e) {
      prompt('复制下面的链接：', url);
    }
  }

  function init() {
    geo = computeGeo(state);
    mountSliders();
    mountRegions();
    mountSelects();
    mountPresets();
    syncControls();

    document.addEventListener('input', onControl);
    document.addEventListener('change', onControl);

    $$('.seg [data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
    $('#playBtn').addEventListener('click', () => (playing ? pause() : play()));
    $('#previewAnim').addEventListener('click', () => {
      setMode('anim');
      box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    $$('[data-export]').forEach(b => b.addEventListener('click', () => {
      const f = b.dataset.export;
      if (f === 'gif') makeGif();
      else if (f === 'copy') copyImage();
      else exportStatic(f).catch(e => toast('导出失败：' + (e.message || e)));
    }));
    $('#gifClose').addEventListener('click', () => { $('#gifCard').hidden = true; });
    $('#resetPos').addEventListener('click', () => {
      KEYS.forEach(k => { state.regions[k].dx = 0; state.regions[k].dy = 0; });
      changed('pos');
    });
    $('#shareBtn').addEventListener('click', share);
    $('#resetBtn').addEventListener('click', () => {
      if (!confirm('恢复成默认的三色图？当前的修改会丢失。')) return;
      state = clone(DEFAULTS);
      syncControls();
      changed();
      toast('已恢复默认');
    });

    new ResizeObserver(requestRender).observe($('.canvas-area'));
    window.addEventListener('resize', requestRender);
    if (document.fonts) document.fonts.addEventListener('loadingdone', requestRender);

    drawView();
    ensureFonts().then(requestRender);
  }

  // 方便调试与自动化检查
  window.sansetu = { get state() { return state; }, get geo() { return geo; }, paint, buildSVG, frameList, frameAt, ensureFonts, labelBox };

  init();
})();
