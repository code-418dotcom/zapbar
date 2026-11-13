import type { InputSource } from '@zapbar/heos-core';
import { arrangeInputs, choicesFor, extraInputs, labelQueue, moveInput, prefFromChoice, questionFor } from '../src/runtime/inputs';

const INPUTS: InputSource[] = [
  { mid: 'inputs/hdmi_arc_1', name: 'HDMI OUT' },
  { mid: 'inputs/hdmi_in_1', name: 'HDMI 1' },
  { mid: 'inputs/hdmi_in_2', name: 'HDMI 2' },
  { mid: 'inputs/optical_in_1', name: 'Optical In' },
];

it('applies labels, icons, hidden flags and order', () => {
  const r = arrangeInputs(INPUTS, {
    'inputs/hdmi_in_1': { label: 'PS5', icon: 'playstation', order: 0 },
    'inputs/hdmi_in_2': { hidden: true },
    'inputs/optical_in_1': { label: '   ' },
  });
  expect(r.visible.map((i) => i.label)).toEqual(['PS5', 'TV', 'Optical In']);
  expect(r.visible[0]!.icon).toBe('playstation');
  expect(r.visible[1]!.icon).toBe('tv');
  expect(r.hidden.map((i) => i.mid)).toEqual(['inputs/hdmi_in_2']);
  expect(r.all).toHaveLength(4);
});

it('ignores an unknown stored icon id', () => {
  expect(arrangeInputs(INPUTS, { 'inputs/hdmi_in_1': { icon: 'nope' as never } }).visible[1]!.icon).toBe('hdmi');
});

it('moves an input up or down within bounds', () => {
  const mids = ['a', 'b', 'c'];
  expect(moveInput(mids, 'b', -1)).toEqual(['b', 'a', 'c']);
  expect(moveInput(mids, 'c', 1)).toEqual(['a', 'b', 'c']);
});

it('builds the setup questions for HDMI inputs only', () => {
  expect(labelQueue(INPUTS).map((i) => i.mid)).toEqual(['inputs/hdmi_arc_1', 'inputs/hdmi_in_1', 'inputs/hdmi_in_2']);
  expect(extraInputs(INPUTS).map((i) => i.mid)).toEqual(['inputs/optical_in_1']);
  expect(questionFor(INPUTS[1]!)).toBe("What's on HDMI 1?");
  expect(questionFor(INPUTS[0]!)).toBe('Is your TV connected to HDMI OUT (ARC)?');
  expect(choicesFor(INPUTS[0]!).map((c) => c.id)).toEqual(['tv', 'unused']);
  expect(choicesFor(INPUTS[1]!).map((c) => c.id)).toEqual([
    'decoder', 'playstation', 'ps4', 'xbox', 'xboxone', 'switch2', 'switch', 'steamdeck', 'pc',
    'appletv', 'chromecast', 'firetv', 'bluray', 'other', 'unused',
  ]);
});

it('turns a setup answer into an input pref', () => {
  expect(prefFromChoice('playstation')).toEqual({ label: 'PS5', icon: 'playstation', hidden: false });
  expect(prefFromChoice('unused')).toEqual({ hidden: true });
  expect(prefFromChoice('other')).toEqual({ icon: 'hdmi', hidden: false });
  expect(prefFromChoice('ps4')).toEqual({ label: 'PS4', icon: 'playstation', hidden: false });
  expect(prefFromChoice('xbox')).toEqual({ label: 'Xbox Series X|S', icon: 'xbox', hidden: false });
  expect(prefFromChoice('xboxone')).toEqual({ label: 'Xbox One', icon: 'xbox', hidden: false });
  expect(prefFromChoice('switch2')).toEqual({ label: 'Switch 2', icon: 'switch', hidden: false });
  expect(prefFromChoice('steamdeck')).toEqual({ label: 'Steam Deck', icon: 'steam', hidden: false });
  expect(prefFromChoice('pc')).toEqual({ label: 'PC', icon: 'pc', hidden: false });
  expect(prefFromChoice('firetv')).toEqual({ label: 'Fire TV', icon: 'firetv', hidden: false });
  expect(prefFromChoice('bluray')).toEqual({ label: 'Blu-ray', icon: 'bluray', hidden: false });
});

it('pirate renames the default ARC input', () => {
  expect(arrangeInputs(INPUTS, {}, { pirate: true }).all[0]!.label).toBe('Arrr-C');
  expect(arrangeInputs(INPUTS, {}).all[0]!.label).toBe('TV');
});

it('pirate never touches a renamed input', () => {
  const r = arrangeInputs(INPUTS, { 'inputs/hdmi_arc_1': { label: 'Telly' } }, { pirate: true });
  expect(r.all[0]!.label).toBe('Telly');
});
