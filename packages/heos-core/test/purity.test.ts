import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../src', import.meta.url));
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });

it('core sources import no Node, React or React Native modules', () => {
  const offenders = files(SRC)
    .filter((f) => !relative(SRC, f).startsWith('node'))
    .filter((f) => /from ['"](node:|net['"]|dgram['"]|http['"]|fs['"]|react)|require\(/.test(readFileSync(f, 'utf8')))
    .map((f) => relative(SRC, f));
  expect(offenders).toEqual([]);
});
