/* 极简 GIF89a 编码器：流行色调色板 + LZW 压缩，无第三方依赖 */
(function (root) {
  'use strict';

  class Bytes {
    constructor(cap = 1 << 20) { this.buf = new Uint8Array(cap); this.len = 0; }
    grow(n) {
      if (this.len + n <= this.buf.length) return;
      let cap = this.buf.length * 2;
      while (cap < this.len + n) cap *= 2;
      const next = new Uint8Array(cap);
      next.set(this.buf.subarray(0, this.len));
      this.buf = next;
    }
    u8(v) { this.grow(1); this.buf[this.len++] = v & 255; }
    u16(v) { this.u8(v); this.u8(v >> 8); }
    str(s) { for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i)); }
    raw(a, n = a.length) { this.grow(n); this.buf.set(a.subarray(0, n), this.len); this.len += n; }
    done() { return this.buf.slice(0, this.len); }
  }

  // 每通道取 6 bit 做颜色分桶
  const BITS = 6, SHIFT = 8 - BITS, BINS = 1 << (BITS * 3);
  const binOf = (r, g, b) => ((r >> SHIFT) << (BITS * 2)) | ((g >> SHIFT) << BITS) | (b >> SHIFT);

  // LZW 压缩并按 255 字节子块写出
  function lzw(index, minCode, o) {
    o.u8(minCode);
    const clear = 1 << minCode, eoi = clear + 1;
    let size = minCode + 1, next = eoi + 1, table = new Map();
    let cur = 0, bits = 0;
    const block = new Uint8Array(255);
    let bl = 0;
    const flush = () => { if (bl) { o.u8(bl); o.raw(block, bl); bl = 0; } };
    const emit = code => {
      cur |= code << bits; bits += size;
      while (bits >= 8) {
        block[bl++] = cur & 255; cur >>>= 8; bits -= 8;
        if (bl === 255) flush();
      }
    };
    emit(clear);
    let prefix = index[0];
    for (let i = 1; i < index.length; i++) {
      const k = index[i], key = (prefix << 8) | k, code = table.get(key);
      if (code !== undefined) { prefix = code; continue; }
      emit(prefix);
      if (next === 4096) {
        emit(clear);
        next = eoi + 1; size = minCode + 1; table = new Map();
      } else {
        if (next >= (1 << size)) size++;
        table.set(key, next++);
      }
      prefix = k;
    }
    emit(prefix);
    emit(eoi);
    if (bits > 0) { block[bl++] = cur & 255; }
    flush();
    o.u8(0);
  }

  class GifEncoder {
    constructor(width, height, { loop = true, transparent = false } = {}) {
      this.w = width; this.h = height;
      this.loop = loop; this.transparent = transparent;
      this.count = new Uint32Array(BINS);
      this.sum = new Float64Array(BINS * 3);
      this.palette = null;
      this.out = new Bytes();
      this.frames = 0;
    }

    // 采样一帧的颜色，用于生成全局调色板
    sample(rgba) {
      const { count, sum } = this;
      for (let i = 0; i < rgba.length; i += 4) {
        if (this.transparent && rgba[i + 3] < 128) continue;
        const k = binOf(rgba[i], rgba[i + 1], rgba[i + 2]);
        count[k]++;
        sum[k * 3] += rgba[i]; sum[k * 3 + 1] += rgba[i + 1]; sum[k * 3 + 2] += rgba[i + 2];
      }
    }

    buildPalette() {
      const bins = [];
      for (let k = 0; k < BINS; k++) if (this.count[k]) bins.push(k);
      bins.sort((x, y) => this.count[y] - this.count[x]);
      const start = this.transparent ? 1 : 0;
      const n = Math.min(bins.length, 256 - start);
      const pal = new Uint8Array(256 * 3);
      for (let i = 0; i < n; i++) {
        const k = bins[i], c = this.count[k], j = (i + start) * 3;
        pal[j] = Math.round(this.sum[k * 3] / c);
        pal[j + 1] = Math.round(this.sum[k * 3 + 1] / c);
        pal[j + 2] = Math.round(this.sum[k * 3 + 2] / c);
      }
      this.palette = pal;
      this.size = Math.max(n + start, 2);
      this.cache = new Int16Array(BINS).fill(-1);
      this.count = this.sum = null;
    }

    nearest(r, g, b) {
      const p = this.palette;
      let best = this.transparent ? 1 : 0, bd = Infinity;
      for (let i = best; i < this.size; i++) {
        const dr = r - p[i * 3], dg = g - p[i * 3 + 1], db = b - p[i * 3 + 2];
        const d = 3 * dr * dr + 4 * dg * dg + 2 * db * db;
        if (d < bd) { bd = d; best = i; if (!d) break; }
      }
      return best;
    }

    addFrame(rgba, delayMs) {
      if (!this.palette) { this.sample(rgba); this.buildPalette(); }
      if (this.frames === 0) this.writeHeader();
      const n = this.w * this.h, idx = new Uint8Array(n), cache = this.cache;
      for (let i = 0, j = 0; i < n; i++, j += 4) {
        if (this.transparent && rgba[j + 3] < 128) { idx[i] = 0; continue; }
        const k = binOf(rgba[j], rgba[j + 1], rgba[j + 2]);
        let c = cache[k];
        if (c < 0) c = cache[k] = this.nearest(rgba[j], rgba[j + 1], rgba[j + 2]);
        idx[i] = c;
      }
      const o = this.out;
      // Graphic Control Extension：透明时每帧清空（disposal=2）
      o.u8(0x21); o.u8(0xf9); o.u8(4);
      o.u8(this.transparent ? (2 << 2) | 1 : 1 << 2);
      o.u16(Math.max(2, Math.round(delayMs / 10)));
      o.u8(0); o.u8(0);
      // Image Descriptor
      o.u8(0x2c); o.u16(0); o.u16(0); o.u16(this.w); o.u16(this.h); o.u8(0);
      lzw(idx, 8, o);
      this.frames++;
    }

    writeHeader() {
      const o = this.out;
      o.str('GIF89a');
      o.u16(this.w); o.u16(this.h);
      o.u8(0xf7); o.u8(0); o.u8(0); // 256 色全局调色板
      o.raw(this.palette);
      if (this.loop) {
        o.u8(0x21); o.u8(0xff); o.u8(11); o.str('NETSCAPE2.0');
        o.u8(3); o.u8(1); o.u16(0); o.u8(0);
      }
    }

    finish() { this.out.u8(0x3b); return this.out.done(); }
  }

  root.GifEncoder = GifEncoder;
})(window);
