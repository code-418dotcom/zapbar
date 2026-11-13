import { describe, expect, it } from 'vitest';
import { buildCommand, decodeValue, encodeValue, parseMessage } from '../src/cli/message';

describe('parseMessage', () => {
  it('parses key=value pairs', () => {
    expect(parseMessage('pid=7331878&level=49&mute=off')).toEqual({ pid: '7331878', level: '49', mute: 'off' });
  });
  it('decodes HEOS escapes in values', () => {
    expect(parseMessage('pid=1&song=Rock %26 Roll %3D 100%25')).toEqual({ pid: '1', song: 'Rock & Roll = 100%' });
  });
  it('keeps bare flags as empty-string keys', () => {
    expect(parseMessage('command under process&pid=1')).toEqual({ 'command under process': '', pid: '1' });
  });
  it('returns an empty object for an empty message', () => {
    expect(parseMessage('')).toEqual({});
  });
});

describe('encodeValue/decodeValue', () => {
  it('round-trips the three reserved characters', () => {
    const raw = 'a&b=c%d';
    expect(encodeValue(raw)).toBe('a%26b%3Dc%25d');
    expect(decodeValue(encodeValue(raw))).toBe(raw);
  });
});

describe('buildCommand', () => {
  it('builds a command with encoded params and CRLF', () => {
    expect(buildCommand('player/set_volume', { pid: 1, level: 20 })).toBe('heos://player/set_volume?pid=1&level=20\r\n');
  });
  it('omits the query when there are no params', () => {
    expect(buildCommand('system/heart_beat')).toBe('heos://system/heart_beat\r\n');
  });
  it('leaves slashes in values alone', () => {
    expect(buildCommand('browse/play_input', { pid: 1, input: 'inputs/hdmi_in_1' })).toBe('heos://browse/play_input?pid=1&input=inputs/hdmi_in_1\r\n');
  });
});
