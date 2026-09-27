/* 自己实现的表单组件，不依赖浏览器自带控件的外观和弹窗：
 * <x-check>（勾选框 / .switch 开关 / .tog 按钮式）、<x-slider> 滑杆、<x-number> 数字框、
 * <x-select> 下拉选择、<x-color> 取色器。
 * 都提供 value / checked / type / min / max / step 属性，并在操作时派发 input / change 事件，
 * 用法和原生表单控件一致。唯一保留的原生元素是真正打字用的文本框（输入法需要它）。 */
(function (root) {
  'use strict';

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
  const decimals = step => { const s = String(step), i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; };
  const snap = (v, min, step) => +(Math.round((v - min) / step) * step + min).toFixed(decimals(step));
  const isHex = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

  // 组件内部要显示的文字，由页面按当前语言设置
  const strings = { hue: 'Hue', sv: 'Saturation / brightness', hex: 'Hex color', decrease: 'Decrease', increase: 'Increase', pick: 'Pick a color' };

  // ---------- 弹出层：同一时间只开一个 ----------
  let current = null;
  function closePopup() {
    if (!current) return;
    const c = current;
    current = null;
    c.close();
  }
  function openPopup(owner, popup, close) {
    closePopup();
    current = { owner, popup, close };
  }
  document.addEventListener('pointerdown', e => {
    if (current && !current.owner.contains(e.target) && !current.popup.contains(e.target)) closePopup();
  }, true);
  window.addEventListener('resize', closePopup);
  window.addEventListener('scroll', e => {
    if (current && !(e.target instanceof Node && current.popup.contains(e.target))) closePopup();
  }, true);

  // 把弹出层放在 anchor 下方（放不下就放上方），并限制在视口内
  function place(popup, anchor) {
    const r = anchor.getBoundingClientRect();
    const w = popup.offsetWidth, h = popup.offsetHeight;
    let top = r.bottom + 4;
    if (top + h > window.innerHeight - 8 && r.top - h - 4 >= 8) top = r.top - h - 4;
    popup.style.left = clamp(r.left, 8, window.innerWidth - w - 8) + 'px';
    popup.style.top = clamp(top, 8, window.innerHeight - h - 8) + 'px';
  }

  function makePopup(cls) {
    const p = document.createElement('div');
    p.className = 'x-popup ' + cls;
    document.body.appendChild(p);
    return p;
  }

  // ---------- 勾选框 / 开关 / 按钮式开关 ----------
  class XCheck extends HTMLElement {
    connectedCallback() {
      if (this._init) return;
      this._init = true;
      this.setAttribute('role', this.classList.contains('switch') ? 'switch' : 'checkbox');
      if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
      if (!this.classList.contains('tog')) {
        const mark = document.createElement('span');
        mark.className = 'x-mark';
        mark.setAttribute('aria-hidden', 'true');
        this.prepend(mark);
      }
      this.addEventListener('click', () => {
        this.checked = !this.checked;
        fire(this, 'input');
        fire(this, 'change');
      });
      this.addEventListener('keydown', e => {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); this.click(); }
      });
      this._sync();
    }
    get type() { return 'checkbox'; }
    get checked() { return this.hasAttribute('checked'); }
    set checked(v) { this.toggleAttribute('checked', !!v); this._sync(); }
    _sync() { this.setAttribute('aria-checked', String(this.checked)); }
  }

  // ---------- 滑杆 ----------
  class XSlider extends HTMLElement {
    connectedCallback() {
      if (this._init) return;
      this._init = true;
      this.setAttribute('role', 'slider');
      if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
      this.innerHTML = '<span class="x-track"><span class="x-fill"></span></span><span class="x-thumb"></span>';
      this.addEventListener('pointerdown', e => this._down(e));
      this.addEventListener('keydown', e => this._key(e));
      this._render();
    }
    get type() { return 'range'; }
    get min() { return this.getAttribute('min') ?? '0'; }
    get max() { return this.getAttribute('max') ?? '100'; }
    get step() { return this.getAttribute('step') ?? '1'; }
    get value() { return String(this._v ?? +this.min); }
    set value(v) {
      const n = +v;
      this._v = isFinite(n) ? clamp(n, +this.min, +this.max) : +this.min;
      this._render();
    }
    _set(v, final) {
      const n = clamp(snap(v, +this.min, +this.step), +this.min, +this.max);
      if (n !== +this.value) { this._v = n; this._render(); fire(this, 'input'); }
      if (final) fire(this, 'change');
    }
    _render() {
      if (!this._init) return;
      const min = +this.min, max = +this.max, v = +this.value;
      this.style.setProperty('--pn', String((v - min) / (max - min || 1)));
      this.setAttribute('aria-valuemin', this.min);
      this.setAttribute('aria-valuemax', this.max);
      this.setAttribute('aria-valuenow', this.value);
    }
    _down(e) {
      if (e.button > 0) return;
      e.preventDefault();
      this.focus({ preventScroll: true });
      this.setPointerCapture(e.pointerId);
      const at = ev => {
        const r = this.getBoundingClientRect();
        // 滑块两端各留 8px（半个圆点），让圆点始终在轨道范围内
        this._set(+this.min + clamp((ev.clientX - r.left - 8) / Math.max(1, r.width - 16), 0, 1) * (+this.max - +this.min));
      };
      const up = () => {
        this.removeEventListener('pointermove', at);
        this.removeEventListener('pointerup', up);
        this.removeEventListener('pointercancel', up);
        this.classList.remove('dragging');
        fire(this, 'change');
      };
      this.classList.add('dragging');
      at(e);
      this.addEventListener('pointermove', at);
      this.addEventListener('pointerup', up);
      this.addEventListener('pointercancel', up);
    }
    _key(e) {
      const st = +this.step, v = +this.value;
      const delta = { ArrowRight: st, ArrowUp: st, ArrowLeft: -st, ArrowDown: -st, PageUp: st * 10, PageDown: -st * 10 }[e.key];
      if (delta !== undefined) { e.preventDefault(); this._set(v + delta * (e.shiftKey ? 10 : 1), true); }
      else if (e.key === 'Home') { e.preventDefault(); this._set(+this.min, true); }
      else if (e.key === 'End') { e.preventDefault(); this._set(+this.max, true); }
    }
  }

  // ---------- 数字框（带 buttons 属性时两侧有 − / + 按钮） ----------
  class XNumber extends HTMLElement {
    connectedCallback() {
      if (this._init) return;
      this._init = true;
      const input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'decimal';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.className = 'x-num-input';
      if (this.hasAttribute('aria-label')) input.setAttribute('aria-label', this.getAttribute('aria-label'));
      this._input = input;
      if (this.hasAttribute('buttons')) {
        const btn = (txt, dir, label) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'x-num-btn';
          b.textContent = txt;
          b.tabIndex = -1;
          b.setAttribute('aria-label', label);
          b.addEventListener('click', () => this._step(dir));
          return b;
        };
        this.append(btn('−', -1, strings.decrease), input, btn('+', 1, strings.increase));
      } else {
        this.append(input);
      }
      input.addEventListener('input', e => {
        e.stopPropagation();
        const n = parseFloat(input.value);
        if (isFinite(n)) { this._v = n; fire(this, 'input'); }
      });
      input.addEventListener('change', e => { e.stopPropagation(); this._commit(); });
      input.addEventListener('keydown', e => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); this._step((e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1)); }
        else if (e.key === 'Enter') { e.preventDefault(); this._commit(); }
      });
      input.addEventListener('blur', () => this._render());
      this._render();
    }
    get type() { return 'number'; }
    get min() { return this.getAttribute('min') ?? ''; }
    get max() { return this.getAttribute('max') ?? ''; }
    get step() { return this.getAttribute('step') ?? '1'; }
    get value() { return String(this._v ?? 0); }
    set value(v) { this._v = +v; this._render(); }
    focus(opts) { if (this._input) this._input.focus(opts); }
    _limit(n) {
      if (this.min !== '') n = Math.max(+this.min, n);
      if (this.max !== '') n = Math.min(+this.max, n);
      return n;
    }
    _step(dir) {
      const st = +this.step;
      this._v = this._limit(+(+this.value + dir * st).toFixed(decimals(st)));
      this._render(true);
      fire(this, 'input');
      fire(this, 'change');
    }
    _commit() {
      const n = parseFloat(this._input.value);
      this._v = this._limit(isFinite(n) ? n : +this.value);
      this._render(true);
      fire(this, 'change');
    }
    _render(force) {
      if (!this._init) return;
      // 正在输入时不打断用户
      if (!force && document.activeElement === this._input) return;
      this._input.value = this.value;
    }
  }

  // ---------- 下拉选择 ----------
  // 选项写成子元素 <x-option value="…">文字</x-option>，或用 setOptions([[value, label], …]) 设置
  class XSelect extends HTMLElement {
    connectedCallback() {
      if (this._init) return;
      this._init = true;
      this.setAttribute('role', 'combobox');
      this.setAttribute('aria-haspopup', 'listbox');
      this.setAttribute('aria-expanded', 'false');
      if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
      this._label = document.createElement('span');
      this._label.className = 'x-select-label';
      const caret = document.createElement('span');
      caret.className = 'x-caret';
      caret.setAttribute('aria-hidden', 'true');
      this.append(this._label, caret);
      this.addEventListener('click', e => {
        if (this._popup && this._popup.contains(e.target)) return;
        if (this._popup) closePopup(); else this.open();
      });
      this.addEventListener('keydown', e => this._key(e));
      this.refresh();
    }
    get type() { return 'select-one'; }
    get options() { return Array.from(this.querySelectorAll('x-option')); }
    get value() { return this._v ?? (this.options[0] ? this.options[0].getAttribute('value') : ''); }
    set value(v) { this._v = String(v); this.refresh(); }
    setOptions(items) {
      this.options.forEach(o => o.remove());
      for (const [value, label] of items) {
        const o = document.createElement('x-option');
        o.setAttribute('value', String(value));
        o.textContent = label;
        this.insertBefore(o, this._label || null);
      }
      this.refresh();
    }
    refresh() {
      if (!this._init) return;
      const o = this.options.find(x => x.getAttribute('value') === this.value);
      this._label.textContent = o ? o.textContent : '';
    }
    _choose(v) {
      closePopup();
      if (v === this.value) return;
      this.value = v;
      fire(this, 'input');
      fire(this, 'change');
    }
    open() {
      const pop = makePopup('x-listbox');
      pop.setAttribute('role', 'listbox');
      pop.style.minWidth = this.getBoundingClientRect().width + 'px';
      this._items = this.options.map(o => {
        const item = document.createElement('div');
        item.className = 'x-opt';
        item.setAttribute('role', 'option');
        const v = o.getAttribute('value');
        item.dataset.value = v;
        item.textContent = o.textContent;
        item.setAttribute('aria-selected', String(v === this.value));
        item.addEventListener('pointerenter', () => this._activate(this._items.indexOf(item)));
        item.addEventListener('click', () => this._choose(v));
        pop.appendChild(item);
        return item;
      });
      this._popup = pop;
      this.setAttribute('aria-expanded', 'true');
      openPopup(this, pop, () => {
        pop.remove();
        this._popup = null;
        this.setAttribute('aria-expanded', 'false');
      });
      place(pop, this);
      this._activate(Math.max(0, this._items.findIndex(i => i.dataset.value === this.value)));
    }
    _activate(i) {
      if (!this._items || !this._items[i]) return;
      this._items.forEach((it, j) => it.classList.toggle('active', j === i));
      this._active = i;
      this._items[i].scrollIntoView({ block: 'nearest' });
    }
    _key(e) {
      const openNow = !!this._popup;
      if (!openNow) {
        if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); this.open(); }
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        this._activate(clamp(this._active + (e.key === 'ArrowDown' ? 1 : -1), 0, this._items.length - 1));
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this._choose(this._items[this._active].dataset.value);
      } else if (e.key === 'Escape' || e.key === 'Tab') {
        if (e.key === 'Escape') e.preventDefault();
        closePopup();
      }
    }
  }

  // ---------- 取色器 ----------
  function hexToHsv(hex) {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
    }
    return { h, s: max ? d / max : 0, v: max };
  }
  function hsvToHex({ h, s, v }) {
    const f = n => {
      const k = (n + h / 60) % 6;
      return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    };
    return '#' + [f(5), f(3), f(1)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
  }

  const PALETTE = ['#da3e41', '#efe84d', '#53b0db', '#ec9e3b', '#7766a7', '#299c7b', '#37363a',
    '#ffffff', '#000000', '#ff6b81', '#ffd166', '#06d6a0', '#118ab2', '#9b5de5', '#f4f1ea', '#808080'];

  class XColor extends HTMLElement {
    connectedCallback() {
      if (this._init) return;
      this._init = true;
      this.setAttribute('role', 'button');
      this.setAttribute('aria-haspopup', 'dialog');
      if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
      this._swatch = document.createElement('span');
      this._swatch.className = 'x-swatch';
      this.append(this._swatch);
      this.addEventListener('click', e => {
        if (this._popup && this._popup.contains(e.target)) return;
        if (this._popup) closePopup(); else this.open();
      });
      this.addEventListener('keydown', e => {
        if ((e.key === 'Enter' || e.key === ' ') && !this._popup) { e.preventDefault(); this.open(); }
        else if (e.key === 'Escape' && this._popup) { e.preventDefault(); closePopup(); this.focus(); }
      });
      this._render();
    }
    get type() { return 'color'; }
    get value() { return this._v || '#000000'; }
    set value(v) {
      if (!isHex(v)) return;
      this._v = v.toLowerCase();
      if (!this._dragging) this._hsv = hexToHsv(this._v);
      this._render();
    }
    _render() {
      if (!this._init) return;
      this._swatch.style.background = this.value;
      if (this._popup) this._paint();
    }
    // 取色过程中派发 input，松手 / 确认时派发 change
    _emit(hsv, final) {
      this._hsv = hsv;
      const hex = hsvToHex(hsv);
      if (hex !== this.value) {
        this._v = hex;
        this._swatch.style.background = hex;
        fire(this, 'input');
      }
      if (final) fire(this, 'change');
      this._paint();
    }
    open() {
      const pop = makePopup('x-color-pop');
      pop.setAttribute('role', 'dialog');
      pop.setAttribute('aria-label', this.getAttribute('aria-label') || strings.pick);
      pop.innerHTML =
        `<div class="x-sv" tabindex="0" role="slider" aria-label="${strings.sv}"><span class="x-sv-thumb"></span></div>`
        + `<div class="x-hue" tabindex="0" role="slider" aria-label="${strings.hue}" aria-valuemin="0" aria-valuemax="360"><span class="x-hue-thumb"></span></div>`
        + `<div class="x-color-row"><span class="x-color-now"></span><input class="x-hex" type="text" maxlength="7" spellcheck="false" autocomplete="off" aria-label="${strings.hex}"></div>`
        + `<div class="x-palette">${PALETTE.map(c => `<button type="button" class="x-pal" style="background:${c}" data-c="${c}" aria-label="${c}"></button>`).join('')}</div>`;
      this._popup = pop;
      this._hsv = hexToHsv(this.value);
      const sv = pop.querySelector('.x-sv'), hue = pop.querySelector('.x-hue'), hex = pop.querySelector('.x-hex');

      const drag = (el, fn) => el.addEventListener('pointerdown', e => {
        e.preventDefault();
        el.focus({ preventScroll: true });
        el.setPointerCapture(e.pointerId);
        this._dragging = true;
        const move = ev => { const r = el.getBoundingClientRect(); fn(clamp((ev.clientX - r.left) / r.width, 0, 1), clamp((ev.clientY - r.top) / r.height, 0, 1), false); };
        const up = ev => {
          el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerup', up);
          el.removeEventListener('pointercancel', up);
          this._dragging = false;
          const r = el.getBoundingClientRect();
          fn(clamp((ev.clientX - r.left) / r.width, 0, 1), clamp((ev.clientY - r.top) / r.height, 0, 1), true);
        };
        move(e);
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
      });
      drag(sv, (x, y, final) => this._emit({ h: this._hsv.h, s: x, v: 1 - y }, final));
      drag(hue, (x, y, final) => this._emit({ ...this._hsv, h: x * 359.99 }, final));

      sv.addEventListener('keydown', e => {
        const k = e.shiftKey ? 0.1 : 0.01, { h, s, v } = this._hsv;
        const d = { ArrowLeft: [-k, 0], ArrowRight: [k, 0], ArrowUp: [0, k], ArrowDown: [0, -k] }[e.key];
        if (d) { e.preventDefault(); this._emit({ h, s: clamp(s + d[0], 0, 1), v: clamp(v + d[1], 0, 1) }, true); }
      });
      hue.addEventListener('keydown', e => {
        const k = e.shiftKey ? 10 : 1;
        const d = { ArrowLeft: -k, ArrowDown: -k, ArrowRight: k, ArrowUp: k }[e.key];
        if (d) { e.preventDefault(); this._emit({ ...this._hsv, h: (this._hsv.h + d + 360) % 360 }, true); }
      });
      hex.addEventListener('input', e => {
        e.stopPropagation();
        let v = hex.value.trim();
        if (!v.startsWith('#')) v = '#' + v;
        if (isHex(v)) this._emit(hexToHsv(v.toLowerCase()), false);
      });
      hex.addEventListener('change', e => { e.stopPropagation(); fire(this, 'change'); this._paint(true); });
      hex.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); closePopup(); this.focus(); } });
      pop.addEventListener('click', e => {
        const b = e.target.closest('.x-pal');
        if (b) this._emit(hexToHsv(b.dataset.c), true);
      });
      pop.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); closePopup(); this.focus(); } });

      this.setAttribute('aria-expanded', 'true');
      openPopup(this, pop, () => {
        pop.remove();
        this._popup = null;
        this.setAttribute('aria-expanded', 'false');
      });
      this._paint(true);
      place(pop, this);
      sv.focus({ preventScroll: true });
    }
    _paint(syncHex) {
      const pop = this._popup;
      if (!pop) return;
      const { h, s, v } = this._hsv;
      const sv = pop.querySelector('.x-sv');
      sv.style.setProperty('--hue', `hsl(${h}, 100%, 50%)`);
      pop.querySelector('.x-sv-thumb').style.cssText = `left:${s * 100}%;top:${(1 - v) * 100}%;background:${this.value}`;
      pop.querySelector('.x-hue-thumb').style.left = (h / 360) * 100 + '%';
      pop.querySelector('.x-hue').setAttribute('aria-valuenow', String(Math.round(h)));
      pop.querySelector('.x-color-now').style.background = this.value;
      const hex = pop.querySelector('.x-hex');
      if (syncHex || document.activeElement !== hex) hex.value = this.value;
    }
  }

  customElements.define('x-check', XCheck);
  customElements.define('x-slider', XSlider);
  customElements.define('x-number', XNumber);
  customElements.define('x-select', XSelect);
  customElements.define('x-color', XColor);

  root.UI = {
    setStrings(s) { Object.assign(strings, s); },
    closePopup,
    isPopup: el => !!(el && el.closest && el.closest('.x-popup')),
  };
})(window);
