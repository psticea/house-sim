// Dev-only: dump the vector geometry (line segments, filled polygons) and positioned text
// of a plan sheet into .plans-cache/geom-<sheet>.json (+ an SVG preview) for analysis.
// Coordinates are PDF points in page space with origin at the TOP-LEFT (y down), the same
// frame as the rendered PNGs at scale 1.
// Usage: npm run plans:extract -- <sheetId> [<sheetId> ...]
import fs from 'node:fs';
import path from 'node:path';
import { CACHE_DIR, findSheet, loadPdf, requirePlans, sheetSlug } from './plans-common.mjs';

requirePlans();
const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error('Usage: extract-plan-geometry.mjs <sheetId> [...]');
  process.exit(1);
}
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const { OPS } = pdfjs;
const OPNAME = Object.fromEntries(Object.entries(OPS).map(([k, v]) => [v, k]));

const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const r3 = (v) => Math.round(v * 1000) / 1000;

for (const id of ids) {
  const file = findSheet(id);
  const doc = await loadPdf(file);
  const page = await doc.getPage(1);
  const vp = page.getViewport({ scale: 1 });
  const ops = await page.getOperatorList();

  let state = { ctm: vp.transform.slice(), lw: 1, stroke: '#000', fill: '#000', dash: null };
  const stack = [];
  const segments = [];
  const polys = [];

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];
    switch (fn) {
      case OPS.save:
        stack.push({ ...state, ctm: state.ctm.slice() });
        break;
      case OPS.restore:
        state = stack.pop() ?? state;
        break;
      case OPS.transform:
        state.ctm = mul(state.ctm, args);
        break;
      case OPS.paintFormXObjectBegin:
        stack.push({ ...state, ctm: state.ctm.slice() });
        if (args[0]) state.ctm = mul(state.ctm, args[0]);
        break;
      case OPS.paintFormXObjectEnd:
        state = stack.pop() ?? state;
        break;
      case OPS.setLineWidth:
        state.lw = args[0];
        break;
      case OPS.setDash:
        state.dash = args[0]?.length ? args[0] : null;
        break;
      case OPS.setStrokeRGBColor:
      case OPS.setStrokeColor:
        state.stroke = typeof args[0] === 'string' ? args[0] : JSON.stringify(args);
        break;
      case OPS.setFillRGBColor:
      case OPS.setFillColor:
        state.fill = typeof args[0] === 'string' ? args[0] : JSON.stringify(args);
        break;
      case OPS.constructPath: {
        const paintOp = args[0];
        const data = args[1]?.[0];
        if (!data || typeof data.length !== 'number') break;
        const name = OPNAME[paintOp] ?? String(paintOp);
        const isStroke = /stroke/i.test(name);
        const isFill = /fill/i.test(name);
        if (!isStroke && !isFill) break; // clip / endPath
        const scaleLw = Math.hypot(state.ctm[0], state.ctm[1]);
        const subpaths = [];
        let cur = null;
        let start = null;
        for (let k = 0; k < data.length;) {
          const op = data[k++];
          if (op === 0) {
            start = apply(state.ctm, data[k], data[k + 1]);
            k += 2;
            cur = [start];
            subpaths.push(cur);
          } else if (op === 1) {
            const p = apply(state.ctm, data[k], data[k + 1]);
            k += 2;
            cur?.push(p);
          } else if (op === 2) {
            const p = apply(state.ctm, data[k + 4], data[k + 5]);
            k += 6;
            cur?.push(p);
          } else if (op === 3) {
            const p = apply(state.ctm, data[k + 2], data[k + 3]);
            k += 4;
            cur?.push(p);
          } else if (op === 4) {
            if (cur && start) cur.push(start);
          } else break;
        }
        for (const sp of subpaths) {
          if (sp.length < 2) continue;
          if (isStroke) {
            for (let s = 0; s + 1 < sp.length; s++) {
              const [a, b] = [sp[s], sp[s + 1]];
              if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-3) continue;
              segments.push({
                a: [r3(a[0]), r3(a[1])],
                b: [r3(b[0]), r3(b[1])],
                w: r3(state.lw * scaleLw),
                c: state.stroke,
                d: state.dash ? 1 : 0,
              });
            }
          }
          if (isFill && sp.length >= 3) {
            polys.push({ p: sp.map(([x, y]) => [r3(x), r3(y)]), c: state.fill });
          }
        }
        break;
      }
      default:
        break;
    }
  }

  const tc = await page.getTextContent();
  const texts = tc.items
    .filter((t) => 'str' in t && t.str.trim())
    .map((t) => {
      const m = mul(vp.transform, t.transform);
      return {
        s: t.str,
        x: r3(m[4]),
        y: r3(m[5]),
        h: r3(Math.hypot(t.transform[2], t.transform[3])),
        w: r3(t.width),
        rot: r3((Math.atan2(t.transform[1], t.transform[0]) * 180) / Math.PI),
      };
    });

  const slug = sheetSlug(file);
  const out = path.join(CACHE_DIR, `geom-${slug}.json`);
  fs.writeFileSync(
    out,
    JSON.stringify({ sheet: slug, widthPt: vp.width, heightPt: vp.height, segments, polys, texts }),
  );

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vp.width} ${vp.height}" width="${vp.width * 2}" height="${vp.height * 2}">`,
    '<rect width="100%" height="100%" fill="white"/>',
    ...polys.map(
      (p) =>
        `<polygon points="${p.p.map((q) => q.join(',')).join(' ')}" fill="${p.c}" opacity="0.4"/>`,
    ),
    ...segments.map(
      (s) =>
        `<line x1="${s.a[0]}" y1="${s.a[1]}" x2="${s.b[0]}" y2="${s.b[1]}" stroke="${s.c}" stroke-width="${Math.max(s.w, 0.1)}"/>`,
    ),
    '</svg>',
  ].join('\n');
  fs.writeFileSync(out.replace(/\.json$/, '.svg'), svg);
  console.log(`${out}: ${segments.length} segments, ${polys.length} polys, ${texts.length} texts`);
}
