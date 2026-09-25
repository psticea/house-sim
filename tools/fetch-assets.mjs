// Dev only: downloads the CC0 source textures + HDRI listed in tools/assets.config.mjs
// into assets-src/ (git-ignored except LICENSES.md) and regenerates
// assets-src/LICENSES.md. Already downloaded files are skipped.
// Usage: node tools/fetch-assets.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { HDRI, SETS } from './assets.config.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'assets-src');
fs.mkdirSync(SRC, { recursive: true });

async function json(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

async function download(url, file) {
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  console.log('  ', path.relative(ROOT, file), `${(fs.statSync(file).size / 1e6).toFixed(1)} MB`);
}

const licences = [];

async function polyHaven(set) {
  const id = set.ph;
  const dir = path.join(SRC, id);
  const files = await json(`https://api.polyhaven.com/files/${id}`);
  const info = await json(`https://api.polyhaven.com/info/${id}`);
  const res = set.kind === 'detail' ? '1k' : '2k';
  const pick = (map, fmt) => files[map]?.[res]?.[fmt]?.url;
  const want =
    set.kind === 'detail'
      ? [['nor_gl', 'png', 'normal.png']]
      : [
          ['Diffuse', 'jpg', 'albedo.jpg'],
          ['nor_gl', 'png', 'normal.png'],
          ['arm', 'jpg', 'arm.jpg'],
        ];
  for (const [map, fmt, name] of want) {
    const url = pick(map, fmt);
    if (!url) throw new Error(`${id}: no ${map} ${res} ${fmt}`);
    await download(url, path.join(dir, name));
  }
  licences.push({
    set: set.id,
    name: info.name,
    source: `https://polyhaven.com/a/${id}`,
    author: Object.keys(info.authors ?? {}).join(', '),
    note: set.note,
  });
}

async function ambientCG(set) {
  const id = set.acg;
  const dir = path.join(SRC, id);
  const zip = path.join(dir, `${id}_2K-JPG.zip`);
  await download(`https://ambientcg.com/get?file=${id}_2K-JPG.zip`, zip);
  if (!fs.existsSync(path.join(dir, `${id}_2K-JPG_Color.jpg`))) {
    // bsdtar (Windows 10+, macOS, most Linux) reads zip archives.
    execFileSync('tar', ['-xf', zip, '-C', dir]);
  }
  licences.push({
    set: set.id,
    name: id,
    source: `https://ambientcg.com/view?id=${id}`,
    author: 'ambientCG (Lennart Demes)',
    note: set.note,
  });
}

for (const set of SETS) {
  console.log(set.id);
  if (set.ph) await polyHaven(set);
  else if (set.acg) await ambientCG(set);
}

{
  console.log(HDRI.id);
  const files = await json(`https://api.polyhaven.com/files/${HDRI.ph}`);
  const info = await json(`https://api.polyhaven.com/info/${HDRI.ph}`);
  await download(
    files.hdri[HDRI.res].hdr.url,
    path.join(SRC, HDRI.ph, `${HDRI.ph}_${HDRI.res}.hdr`),
  );
  licences.push({
    set: HDRI.id,
    name: info.name,
    source: `https://polyhaven.com/a/${HDRI.ph}`,
    author: Object.keys(info.authors ?? {}).join(', '),
    note: HDRI.note,
  });
}

const rows = licences.map(
  (l) => `| \`${l.set}\` | ${l.name} | ${l.source} | ${l.author} | CC0 1.0 | ${l.note} |`,
);
fs.writeFileSync(
  path.join(SRC, 'LICENSES.md'),
  `# Asset licences

Every texture and HDRI used by the realistic look (plan.md I4). All are **CC0 1.0**
(public domain dedication): free to use, modify and redistribute, no attribution
required — credited here anyway. The downloaded originals stay local (git-ignored);
only the optimised KTX2 / JPEG files in \`public/assets/\` are committed. Regenerate
this file with \`node tools/fetch-assets.mjs\`.

| Set | Asset | Source | Author(s) | Licence | Used for |
|---|---|---|---|---|---|
${rows.join('\n')}

Generated in code by \`tools/optimize-assets.mjs\` (no source asset, CC0 as part of
this repository): \`metal\` / \`metal-flat\` (standing-seam sheet normal maps) and
\`detail-fine\` (fine paint / clay / leaf micro-normal).

Runtime: the Basis Universal transcoder is the one shipped with three.js
(\`examples/jsm/libs/basis/\`, Apache-2.0, © Binomial LLC), bundled by Vite into our build.
`,
);
console.log('assets-src/LICENSES.md written');
