// 極簡 TrueType 子集化：只留指定字元的字形（保留原 glyph id），重建 cmap，輸出 WOFF 1.0
// 用法：node tools/subset-font.js <font.ttf> <chars.txt> <out.woff>
'use strict';
const fs = require('fs');
const zlib = require('zlib');

function readTables(buf) {
  const num = buf.readUInt16BE(4);
  const tables = {};
  for (let i = 0; i < num; i++) {
    const o = 12 + i * 16;
    const tag = buf.toString('latin1', o, o + 4);
    tables[tag] = buf.subarray(buf.readUInt32BE(o + 8), buf.readUInt32BE(o + 8) + buf.readUInt32BE(o + 12));
  }
  return tables;
}

function parseCmap(cmap) {
  const n = cmap.readUInt16BE(2);
  let best = null;
  for (let i = 0; i < n; i++) {
    const pid = cmap.readUInt16BE(4 + i * 8), eid = cmap.readUInt16BE(6 + i * 8), off = cmap.readUInt32BE(8 + i * 8);
    const fmt = cmap.readUInt16BE(off);
    if (pid === 3 && eid === 10 && fmt === 12) { best = { off, fmt }; break; }
    if (pid === 3 && eid === 1 && fmt === 4 && !best) best = { off, fmt };
  }
  if (!best) throw new Error('no usable cmap subtable');
  const map = new Map();
  const o = best.off;
  if (best.fmt === 12) {
    const groups = cmap.readUInt32BE(o + 12);
    for (let g = 0; g < groups; g++) {
      const p = o + 16 + g * 12;
      const start = cmap.readUInt32BE(p), end = cmap.readUInt32BE(p + 4), gid = cmap.readUInt32BE(p + 8);
      for (let c = start; c <= end; c++) map.set(c, gid + (c - start));
    }
  } else {
    const segX2 = cmap.readUInt16BE(o + 6), seg = segX2 / 2;
    const ends = o + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
    for (let s = 0; s < seg; s++) {
      const end = cmap.readUInt16BE(ends + s * 2), start = cmap.readUInt16BE(starts + s * 2);
      const delta = cmap.readInt16BE(deltas + s * 2), ro = cmap.readUInt16BE(ranges + s * 2);
      for (let c = start; c <= end && c !== 0xFFFF; c++) {
        let gid;
        if (ro === 0) gid = (c + delta) & 0xFFFF;
        else {
          const gp = ranges + s * 2 + ro + (c - start) * 2;
          gid = cmap.readUInt16BE(gp);
          if (gid) gid = (gid + delta) & 0xFFFF;
        }
        if (gid) map.set(c, gid);
      }
    }
  }
  return map;
}

function buildCmap4(pairs) { // pairs: [[code, gid]] sorted, code <= 0xFFFF
  const segs = [];
  for (const [c, g] of pairs) {
    const last = segs[segs.length - 1];
    if (last && c === last.end + 1 && g - c === last.delta) last.end = c;
    else segs.push({ start: c, end: c, delta: g - c });
  }
  segs.push({ start: 0xFFFF, end: 0xFFFF, delta: 1 });
  const seg = segs.length;
  const len = 16 + seg * 8;
  const sub = Buffer.alloc(len);
  sub.writeUInt16BE(4, 0); sub.writeUInt16BE(len, 2); sub.writeUInt16BE(0, 4);
  sub.writeUInt16BE(seg * 2, 6);
  const pow = 2 ** Math.floor(Math.log2(seg));
  sub.writeUInt16BE(pow * 2, 8); sub.writeUInt16BE(Math.log2(pow), 10); sub.writeUInt16BE(seg * 2 - pow * 2, 12);
  let p = 14;
  for (const s of segs) { sub.writeUInt16BE(s.end, p); p += 2; }
  p += 2; // reservedPad
  for (const s of segs) { sub.writeUInt16BE(s.start, p); p += 2; }
  for (const s of segs) { sub.writeUInt16BE(s.delta & 0xFFFF, p); p += 2; }
  for (let i = 0; i < seg; i++) { sub.writeUInt16BE(0, p); p += 2; }
  const head = Buffer.alloc(12);
  head.writeUInt16BE(0, 0); head.writeUInt16BE(1, 2);
  head.writeUInt16BE(3, 4); head.writeUInt16BE(1, 6); head.writeUInt32BE(12, 8);
  return Buffer.concat([head, sub]);
}

function checksum(buf) {
  const padded = buf.length % 4 ? Buffer.concat([buf, Buffer.alloc(4 - buf.length % 4)]) : buf;
  let sum = 0;
  for (let i = 0; i < padded.length; i += 4) sum = (sum + padded.readUInt32BE(i)) >>> 0;
  return sum;
}

function subset(ttf, text) {
  const t = readTables(ttf);
  const numGlyphs = t.maxp.readUInt16BE(4);
  const longLoca = t.head.readInt16BE(50) === 1;
  const loca = i => longLoca ? t.loca.readUInt32BE(i * 4) : t.loca.readUInt16BE(i * 2) * 2;
  const cmap = parseCmap(t.cmap);

  const codes = [...new Set([...text].map(ch => ch.codePointAt(0)))].filter(c => c <= 0xFFFF && cmap.has(c)).sort((a, b) => a - b);
  const keep = new Set([0]);
  const stack = codes.map(c => cmap.get(c));
  while (stack.length) {
    const g = stack.pop();
    if (keep.has(g) || g >= numGlyphs) continue;
    keep.add(g);
    const s = loca(g), e = loca(g + 1);
    if (e > s && t.glyf.readInt16BE(s) < 0) { // composite glyph：把組件也收進來
      let p = s + 10, flags;
      do {
        flags = t.glyf.readUInt16BE(p);
        stack.push(t.glyf.readUInt16BE(p + 2));
        p += 4 + (flags & 1 ? 4 : 2) + (flags & 8 ? 2 : flags & 0x40 ? 4 : flags & 0x80 ? 8 : 0);
      } while (flags & 0x20);
    }
  }

  const parts = [];
  const newLoca = Buffer.alloc((numGlyphs + 1) * 4);
  let off = 0;
  for (let g = 0; g < numGlyphs; g++) {
    newLoca.writeUInt32BE(off, g * 4);
    if (!keep.has(g)) continue;
    let data = t.glyf.subarray(loca(g), loca(g + 1));
    if (data.length % 4) data = Buffer.concat([data, Buffer.alloc(4 - data.length % 4)]);
    parts.push(data);
    off += data.length;
  }
  newLoca.writeUInt32BE(off, numGlyphs * 4);
  const glyf = Buffer.concat(parts);

  const hmtx = Buffer.from(t.hmtx);
  const nh = t.hhea.readUInt16BE(34);
  for (let g = 0; g < numGlyphs; g++) {
    if (keep.has(g)) continue;
    if (g < nh) hmtx.writeInt16BE(0, g * 4 + 2); else hmtx.writeInt16BE(0, nh * 4 + (g - nh) * 2);
  }

  const head = Buffer.from(t.head);
  head.writeInt16BE(1, 50);
  head.writeUInt32BE(0, 8);
  const post = Buffer.from(t.post.subarray(0, 32));
  post.writeUInt32BE(0x00030000, 0);

  const out = {
    'OS/2': t['OS/2'], cmap: buildCmap4(codes.map(c => [c, cmap.get(c)])), glyf, head, hhea: t.hhea,
    hmtx, loca: newLoca, maxp: t.maxp, name: t.name, post
  };
  if (t['cvt ']) out['cvt '] = t['cvt '];
  if (t.gasp) out.gasp = t.gasp;
  if (t.fpgm) out.fpgm = t.fpgm;
  if (t.prep) out.prep = t.prep;

  // 先算整個 sfnt 的 checkSumAdjustment
  const tags = Object.keys(out).sort();
  let sfntSize = 12 + tags.length * 16;
  for (const tag of tags) sfntSize += Math.ceil(out[tag].length / 4) * 4;
  let total = 0;
  const dirHeader = Buffer.alloc(12);
  dirHeader.writeUInt32BE(0x00010000, 0); dirHeader.writeUInt16BE(tags.length, 4);
  total = (total + checksum(dirHeader)) >>> 0;
  const sums = {};
  for (const tag of tags) { sums[tag] = checksum(out[tag]); total = (total + sums[tag]) >>> 0; }
  // 表目錄本身的 checksum（tag、checksum、offset、length）
  let dirOff = 12 + tags.length * 16;
  const dir = Buffer.alloc(tags.length * 16);
  tags.forEach((tag, i) => {
    dir.write(tag.padEnd(4), i * 16, 'latin1');
    dir.writeUInt32BE(sums[tag], i * 16 + 4);
    dir.writeUInt32BE(dirOff, i * 16 + 8);
    dir.writeUInt32BE(out[tag].length, i * 16 + 12);
    dirOff += Math.ceil(out[tag].length / 4) * 4;
  });
  total = (total + checksum(dir)) >>> 0;
  head.writeUInt32BE((0xB1B0AFBA - total) >>> 0, 8);
  sums.head = checksum((() => { const h = Buffer.from(head); h.writeUInt32BE(0, 8); return h; })());

  // WOFF 1.0
  const entries = tags.map(tag => {
    const orig = out[tag];
    const comp = zlib.deflateSync(orig, { level: 9 });
    return { tag, orig, data: comp.length < orig.length ? comp : orig, sum: sums[tag] };
  });
  let woffOff = 44 + entries.length * 20;
  const wdir = Buffer.alloc(entries.length * 20);
  const blobs = [];
  entries.forEach((e, i) => {
    wdir.write(e.tag.padEnd(4), i * 20, 'latin1');
    wdir.writeUInt32BE(woffOff, i * 20 + 4);
    wdir.writeUInt32BE(e.data.length, i * 20 + 8);
    wdir.writeUInt32BE(e.orig.length, i * 20 + 12);
    wdir.writeUInt32BE(e.sum, i * 20 + 16);
    const padded = e.data.length % 4 ? Buffer.concat([e.data, Buffer.alloc(4 - e.data.length % 4)]) : e.data;
    blobs.push(padded);
    woffOff += padded.length;
  });
  const wh = Buffer.alloc(44);
  wh.write('wOFF', 0, 'latin1');
  wh.writeUInt32BE(0x00010000, 4);
  wh.writeUInt32BE(woffOff, 8);
  wh.writeUInt16BE(entries.length, 12);
  wh.writeUInt32BE(sfntSize, 16);
  wh.writeUInt16BE(1, 20);
  return { woff: Buffer.concat([wh, wdir, ...blobs]), glyphs: keep.size, chars: codes.length };
}

module.exports = { subset };

if (require.main === module) {
  const [font, charsFile, outFile] = process.argv.slice(2);
  const r = subset(fs.readFileSync(font), fs.readFileSync(charsFile, 'utf8'));
  fs.writeFileSync(outFile, r.woff);
  console.log(`${outFile}: ${r.chars} 字、${r.glyphs} 字形、${(r.woff.length / 1024).toFixed(1)} KB`);
}
