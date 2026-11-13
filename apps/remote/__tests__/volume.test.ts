import { DEFAULT_APPEARANCE } from '../src/theme';
import { capFor, capped, DAD_CAP, elevenOf } from '../src/runtime/volume';

it('caps a raise at the cap', () => {
  expect(capped(40, 20, 30)).toBe(30);
  expect(capped(25, 20, 30)).toBe(25);
  expect(capped(10, 50, 30)).toBe(10);
});

it('dad mode never raises a volume already above the cap', () => {
  expect(capped(55, 50, 30)).toBe(50);
});

it('does nothing at cap 100', () => {
  expect(capped(70, 20, 100)).toBe(70);
});

it('maps 0-100 onto 0-11', () => {
  expect(elevenOf(100)).toBe(11);
  expect(elevenOf(0)).toBe(0);
  expect(elevenOf(50)).toBe(6);
});

it('capFor reads the dad flag', () => {
  expect(capFor({ ...DEFAULT_APPEARANCE, dad: true })).toBe(DAD_CAP);
  expect(capFor(DEFAULT_APPEARANCE)).toBe(100);
});
