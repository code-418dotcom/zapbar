import { expect, it } from 'vitest';
import { toPlayback } from '../src/state/now-playing';

const raw = { type: 'song', song: 'S', artist: 'A', album: 'B', image_url: 'http://x/a.jpg', mid: 'track:1', sid: 4 };

it('maps an input to activeInput with no now-playing strip', () => {
  expect(toPlayback({ ...raw, mid: 'inputs/hdmi_in_2', sid: 1027 })).toEqual({ activeInput: 'inputs/hdmi_in_2', nowPlaying: null });
});

it('maps a stream to now-playing with a source name', () => {
  expect(toPlayback(raw)).toEqual({
    activeInput: null,
    nowPlaying: { sourceId: 4, sourceName: 'Spotify', title: 'S', artist: 'A', album: 'B', artUrl: 'http://x/a.jpg' },
  });
});

it('names unknown sources "Stream" and handles nothing playing', () => {
  expect(toPlayback({ ...raw, sid: 999, image_url: '' }).nowPlaying).toMatchObject({ sourceName: 'Stream', artUrl: null });
  expect(toPlayback(null)).toEqual({ activeInput: null, nowPlaying: null });
  expect(toPlayback({ ...raw, mid: '', song: '' })).toEqual({ activeInput: null, nowPlaying: null });
});
