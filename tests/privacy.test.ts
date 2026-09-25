/**
 * Privacy guard (plan.md §13): the repository and the site are public. Fails if any
 * tracked / to-be-tracked text file contains an identifying token from the plans'
 * title block or site plan (names, address, cadastral numbers, firm), or if any plan
 * file (PDF, rendered raster, extraction dump) would be committed.
 *
 * The forbidden tokens are stored ONLY as SHA-256 hashes of the normalised token
 * (lower case, diacritics stripped).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const FORBIDDEN_SHA256 = new Set([
  'cba0a646d45888b8005444bac17b8a562d1e8019598420f118e897df2b434138',
  'e54eb3e2224a469b5b026e9bedd340b90f7d11d37245df6535dc30b73c6a3d8b',
  '907eb4587ca52dd312cf84d2e3542b93bdfb75ae9e7221c33d54971f76bb0b95',
  '4bba94dfac136dbd38f5471fa6aca568af3e5c9f8482d8760f486a0894131c36',
  '3c943542100b10823bdfe360b1c2f710318a78e13215d42cbe35ef70ca2d95d5',
  '58853f9d2f6a58d4ca59eca4a30e094a3d0a25f09536c336cc0d044a5573964f',
  '170dfb91fec0b3dea0c2434c0d0c270c5b52877289f5ae6874cc1e270477e0b7',
  '61c2fe11aa1d5e6ed0ee418e7f4d7b2fd1e24321c0a00b57c16d388511336d55',
  '548a214308b9d806fec393fca478bf0429ca4c09993ac9f1eb61f6d72af7593c',
  '71492f38c38f8e2f1c1e82b859725e3df2e16cc40998f959e90fe04e42ecebeb',
  'e3aaa8700c582e8a4c0e7b396fde9be8a94f64ddf646b79a0b95f76fb3685e48',
  'fffff711e38f71fbaaf01193ab00f99ab28431e9b97714a0da9d0775a13595d7',
  '61d97642693edb7df399d79a278d210d9d07fff06562617878a53bd94a6931e7',
]);

const ROOT = path.resolve(import.meta.dirname, '..');
const BINARY =
  /\.(png|jpe?g|gif|webp|avif|ico|ktx2|glb|gltf|bin|hdr|exr|woff2?|ttf|otf|zip|gz|mp4|webm)$/i;

export function normalise(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

const sha = (s: string): string => createHash('sha256').update(s).digest('hex');

function repoFiles(): string[] {
  const out = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  return out.split('\0').filter(Boolean);
}

describe('privacy', () => {
  const files = repoFiles();

  it('finds the repository files', () => {
    expect(files).toContain('plan.md');
    expect(files).toContain('package.json');
  });

  it('commits no plan files (PDFs, rasters, extraction dumps)', () => {
    const bad = files.filter(
      (f) =>
        /\.pdf$/i.test(f) ||
        f.startsWith('architecture-plans/') ||
        f.startsWith('.plans-cache/') ||
        f.includes('/.plans-cache/'),
    );
    expect(bad).toEqual([]);
  });

  it('no tracked text file contains an identifying token', () => {
    const hits: string[] = [];
    for (const f of files) {
      if (BINARY.test(f)) continue;
      const full = path.join(ROOT, f);
      if (!fs.existsSync(full) || fs.statSync(full).size > 5 * 1024 * 1024) continue;
      const buf = fs.readFileSync(full);
      if (buf.includes(0)) continue; // binary
      const tokens = new Set(normalise(buf.toString('utf8')));
      for (const t of tokens)
        if (FORBIDDEN_SHA256.has(sha(t))) hits.push(`${f}: token #${sha(t).slice(0, 8)}`);
      // File names count too.
      for (const t of normalise(f)) if (FORBIDDEN_SHA256.has(sha(t))) hits.push(`${f}: file name`);
    }
    expect(hits).toEqual([]);
  });

  it('normalisation strips diacritics and splits on punctuation', () => {
    expect(normalise('Ștefan, ÎNCĂ-o dată')).toEqual(['stefan', 'inca', 'o', 'data']);
    // The GitHub user name in URLs stays a distinct token.
    expect(normalise('https://psticea.github.io/house-sim/')).toContain('psticea');
  });
});
