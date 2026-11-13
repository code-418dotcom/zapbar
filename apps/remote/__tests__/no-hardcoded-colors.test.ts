/** @jest-environment node */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) ? [p] : [];
  });

it('keeps every colour in src/theme.ts', () => {
  const files = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'app'))].filter((f) => !f.endsWith(join('src', 'theme.ts')));
  const offenders = files.flatMap((f) =>
    readFileSync(f, 'utf8')
      .split('\n')
      .map((line, n) => ({ f, n: n + 1, line }))
      .filter(({ line }) => /#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(line)),
  );
  expect(offenders.map(({ f, n, line }) => `${f.replace(ROOT, '')}:${n}: ${line.trim()}`)).toEqual([]);
});

it('has no legacy colour tokens left', () => {
  const theme = readFileSync(join(ROOT, 'src', 'theme.ts'), 'utf8');
  expect(theme).not.toMatch(/export const colors\b/);
  expect(theme).not.toMatch(/export const radius\b/);
});
