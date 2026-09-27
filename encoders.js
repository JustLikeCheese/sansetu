/* 特殊格式封装：APNG、动态 WebP、BMP、ICO（单帧的 PNG / WebP 编码交给浏览器） */
(function (root) {
  'use strict';

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  const ascii = s => Uint8Array.from(s, ch => ch.charCodeAt(0));
  const sameBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  function concat(parts) {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  // ---------- APNG ----------
  const PNG_SIG = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);

  function pngChunk(type, data) {
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    out.set(ascii(type), 4);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  }

  function readPngChunks(png) {
    const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
    const list = [];
    for (let p = 8; p + 8 <= png.length;) {
      const len = dv.getUint32(p);
      const type = String.fromCharCode(...png.subarray(p + 4, p + 8));
      list.push({ type, data: png.subarray(p + 8, p + 8 + len) });
      p += 12 + len;
      if (type === 'IEND') break;
    }
    return list;
  }

  // 把浏览器编码好的一帧帧 PNG 拼成 APNG；delay 用分数表示，帧率可以精确
  class ApngWriter {
    constructor(frameCount, { loop = true } = {}) {
      this.total = frameCount;
      this.loop = loop;
      this.parts = [PNG_SIG];
      this.seq = 0;
      this.n = 0;
      this.ihdr = null;
    }

    addFrame(png, delayNum, delayDen) {
      const chunks = readPngChunks(png);
      const ihdr = chunks.find(c => c.type === 'IHDR').data;
      if (!this.ihdr) {
        this.ihdr = ihdr.slice();
        this.parts.push(pngChunk('IHDR', ihdr));
        const actl = new Uint8Array(8);
        new DataView(actl.buffer).setUint32(0, this.total);
        new DataView(actl.buffer).setUint32(4, this.loop ? 0 : 1);
        this.parts.push(pngChunk('acTL', actl));
        // 颜色相关的辅助块（sRGB、gAMA 等）只需要第一帧的
        for (const c of chunks) if (!['IHDR', 'IDAT', 'IEND'].includes(c.type)) this.parts.push(pngChunk(c.type, c.data));
      } else if (!sameBytes(ihdr, this.ihdr)) {
        throw new Error('APNG frame format mismatch');
      }
      const fctl = new Uint8Array(26);
      const dv = new DataView(fctl.buffer);
      dv.setUint32(0, this.seq++);
      dv.setUint32(4, new DataView(ihdr.buffer, ihdr.byteOffset).getUint32(0));
      dv.setUint32(8, new DataView(ihdr.buffer, ihdr.byteOffset).getUint32(4));
      dv.setUint16(20, delayNum);
      dv.setUint16(22, delayDen);
      fctl[24] = 0; // dispose: none
      fctl[25] = 0; // blend: source，整帧覆盖，透明背景也不会叠影
      this.parts.push(pngChunk('fcTL', fctl));
      for (const c of chunks) {
        if (c.type !== 'IDAT') continue;
        if (this.n === 0) this.parts.push(pngChunk('IDAT', c.data));
        else {
          const seq = new Uint8Array(4);
          new DataView(seq.buffer).setUint32(0, this.seq++);
          this.parts.push(pngChunk('fdAT', concat([seq, c.data])));
        }
      }
      this.n++;
    }

    finish() {
      this.parts.push(pngChunk('IEND', new Uint8Array(0)));
      return new Blob(this.parts, { type: 'image/png' });
    }
  }

  // ---------- 动态 WebP ----------
  function riffChunk(fourcc, data) {
    const pad = data.length & 1;
    const out = new Uint8Array(8 + data.length + pad);
    out.set(ascii(fourcc), 0);
    new DataView(out.buffer).setUint32(4, data.length, true);
    out.set(data, 8);
    return out;
  }
  const u24 = v => Uint8Array.of(v & 255, (v >> 8) & 255, (v >> 16) & 255);

  function readWebpChunks(webp) {
    if (String.fromCharCode(...webp.subarray(8, 12)) !== 'WEBP') throw new Error('not a WebP file');
    const dv = new DataView(webp.buffer, webp.byteOffset, webp.byteLength);
    const list = [];
    for (let p = 12; p + 8 <= webp.length;) {
      const fourcc = String.fromCharCode(...webp.subarray(p, p + 4));
      const len = dv.getUint32(p + 4, true);
      list.push({ fourcc, data: webp.subarray(p + 8, p + 8 + len) });
      p += 8 + len + (len & 1);
    }
    return list;
  }

  // 把浏览器编码好的单帧 WebP 拼成动态 WebP；时长单位是毫秒
  class WebpAnimWriter {
    constructor(width, height, { loop = true, alpha = false } = {}) {
      this.w = width;
      this.h = height;
      this.loop = loop;
      this.alpha = alpha;
      this.frames = [];
    }

    addFrame(webp, durationMs) {
      const body = readWebpChunks(webp)
        .filter(c => c.fourcc === 'ALPH' || c.fourcc === 'VP8 ' || c.fourcc === 'VP8L')
        .map(c => riffChunk(c.fourcc, c.data));
      const head = concat([u24(0), u24(0), u24(this.w - 1), u24(this.h - 1), u24(Math.max(1, Math.round(durationMs))), Uint8Array.of(0b10)]);
      this.frames.push(riffChunk('ANMF', concat([head, ...body])));
    }

    finish() {
      const vp8x = concat([Uint8Array.of(0x02 | (this.alpha ? 0x10 : 0), 0, 0, 0), u24(this.w - 1), u24(this.h - 1)]);
      const anim = Uint8Array.of(0, 0, 0, 0, this.loop ? 0 : 1, 0);
      const body = concat([ascii('WEBP'), riffChunk('VP8X', vp8x), riffChunk('ANIM', anim), ...this.frames]);
      const head = new Uint8Array(8);
      head.set(ascii('RIFF'), 0);
      new DataView(head.buffer).setUint32(4, body.length, true);
      return new Blob([head, body], { type: 'image/webp' });
    }
  }

  // ---------- BMP（24 位，自下而上） ----------
  function encodeBMP(imageData) {
    const { width: w, height: h, data } = imageData;
    const row = (w * 3 + 3) & ~3;
    const size = 54 + row * h;
    const buf = new Uint8Array(size);
    const dv = new DataView(buf.buffer);
    buf[0] = 0x42; buf[1] = 0x4d;
    dv.setUint32(2, size, true);
    dv.setUint32(10, 54, true);
    dv.setUint32(14, 40, true);
    dv.setInt32(18, w, true);
    dv.setInt32(22, h, true);
    dv.setUint16(26, 1, true);
    dv.setUint16(28, 24, true);
    dv.setUint32(34, row * h, true);
    dv.setInt32(38, 2835, true);
    dv.setInt32(42, 2835, true);
    for (let y = 0; y < h; y++) {
      let o = 54 + (h - 1 - y) * row;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        buf[o++] = data[i + 2]; buf[o++] = data[i + 1]; buf[o++] = data[i];
      }
    }
    return new Blob([buf], { type: 'image/bmp' });
  }

  // ---------- ICO（多尺寸，内嵌 PNG） ----------
  function encodeICO(pngs) {
    const head = new Uint8Array(6 + pngs.length * 16);
    const dv = new DataView(head.buffer);
    dv.setUint16(2, 1, true);
    dv.setUint16(4, pngs.length, true);
    let offset = head.length;
    pngs.forEach(({ size, bytes }, i) => {
      const e = 6 + i * 16;
      head[e] = size >= 256 ? 0 : size;
      head[e + 1] = size >= 256 ? 0 : size;
      dv.setUint16(e + 4, 1, true);
      dv.setUint16(e + 6, 32, true);
      dv.setUint32(e + 8, bytes.length, true);
      dv.setUint32(e + 12, offset, true);
      offset += bytes.length;
    });
    return new Blob([head, ...pngs.map(p => p.bytes)], { type: 'image/x-icon' });
  }

  root.Encoders = { ApngWriter, WebpAnimWriter, encodeBMP, encodeICO };
})(window);
