import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { STRINGS } from '@aman/content';

// Dev-only: scans the web sources so a typo in t('...') fails here instead of showing a raw key on screen.
const SRC = fileURLToPath(new URL('../src', import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sources(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
  );
}

// t('key'), plus tr(lang, 'key') where content's t is imported under another name.
const LITERAL = /\b(?:t|tr)\(\s*(?:[\w.]+\s*,\s*)?'([^']+)'\s*\)/g;
// t(`prefix_${x}`): at least one key must start with the fixed prefix.
const TEMPLATE = /\b(?:t|tr)\(\s*(?:[\w.]+\s*,\s*)?`([^`$]*)\$\{/g;

describe('web i18n keys', () => {
  const files = sources(SRC);
  const en = Object.keys(STRINGS.en);

  it('finds t() calls to check', () => {
    const count = files.reduce((n, f) => n + [...readFileSync(f, 'utf8').matchAll(LITERAL)].length, 0);
    expect(count).toBeGreaterThan(50);
  });

  it('every literal key exists in the English dictionary', () => {
    const missing: string[] = [];
    for (const f of files) {
      for (const [, key] of readFileSync(f, 'utf8').matchAll(LITERAL)) {
        if (!(key in STRINGS.en)) missing.push(`${f.slice(SRC.length + 1)}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('every templated key prefix matches an English key', () => {
    const missing: string[] = [];
    for (const f of files) {
      for (const [, prefix] of readFileSync(f, 'utf8').matchAll(TEMPLATE)) {
        if (!en.some((k) => k.startsWith(prefix))) missing.push(`${f.slice(SRC.length + 1)}: ${prefix}…`);
      }
    }
    expect(missing).toEqual([]);
  });
});
