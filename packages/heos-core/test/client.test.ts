import { describe, expect, it } from 'vitest';
import { CliError, DisconnectedError, HeosCliClient, TimeoutError, type CliEvent } from '../src/cli/client';
import { memorySocket, reply } from './memory-socket';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('HeosCliClient', () => {
  it('resolves the reply matching the in-flight command', async () => {
    const m = memorySocket();
    const c = await HeosCliClient.connect(m.factory, 'x');
    const p = c.send('player/get_volume', { pid: 1 });
    expect(m.written).toEqual(['heos://player/get_volume?pid=1\r\n']);
    m.push(reply('player/get_volume', 'pid=1&level=49'));
    await expect(p).resolves.toMatchObject({ result: 'success', message: { pid: '1', level: '49' } });
  });

  it('sends one command at a time', async () => {
    const m = memorySocket();
    const c = await HeosCliClient.connect(m.factory, 'x');
    const a = c.send('player/get_volume', { pid: 1 });
    const b = c.send('player/get_mute', { pid: 1 });
    expect(m.written).toHaveLength(1);
    m.push(reply('player/get_volume', 'pid=1&level=5'));
    await a;
    expect(m.written).toHaveLength(2);
    m.push(reply('player/get_mute', 'pid=1&state=off'));
    await expect(b).resolves.toMatchObject({ message: { state: 'off' } });
  });

  it('ignores "command under process" and waits for the final reply', async () => {
    const m = memorySocket();
    const c = await HeosCliClient.connect(m.factory, 'x');
    let done = false;
    const p = c.send('browse/play_input', { pid: 1, input: 'inputs/hdmi_in_1' }).then((r) => { done = true; return r; });
    m.push(reply('browse/play_input', 'command under process&pid=1'));
    await flush();
    expect(done).toBe(false);
    m.push(reply('browse/play_input', 'pid=1&input=inputs/hdmi_in_1'));
    await expect(p).resolves.toMatchObject({ message: { input: 'inputs/hdmi_in_1' } });
  });

  it('delivers an event that arrives before the reply and still resolves the reply', async () => {
    const m = memorySocket();
    const c = await HeosCliClient.connect(m.factory, 'x');
    const events: CliEvent[] = [];
    c.onEvent((e) => events.push(e));
    let done = false;
    const p = c.send('player/set_volume', { pid: 1, level: 20 }).then(() => { done = true; });
    m.push({ heos: { command: 'event/player_volume_changed', message: 'pid=1&level=20&mute=off' } });
    await flush();
    expect(done).toBe(false);
    expect(events).toEqual([{ event: 'player_volume_changed', message: { pid: '1', level: '20', mute: 'off' } }]);
    m.push(reply('player/set_volume', 'pid=1&level=20'));
    await p;
    expect(done).toBe(true);
  });

  it('rejects with CliError carrying the device text on result fail', async () => {
    const m = memorySocket();
    const c = await HeosCliClient.connect(m.factory, 'x');
    const p = c.send('browse/play_input', { pid: 1, input: 'inputs/nope' });
    m.push(reply('browse/play_input', 'eid=2&text=Invalid input', 'fail'));
    const err = await p.catch((e) => e);
    expect(err).toBeInstanceOf(CliError);
    expect(err).toMatchObject({ eid: '2', text: 'Invalid input' });
  });

  it('rejects in-flight and queued commands immediately when the socket drops', async () => {
    const m = memorySocket();
    const c = await HeosCliClient.connect(m.factory, 'x', { timeoutMs: 3000 });
    const a = c.send('player/get_volume', { pid: 1 });
    const b = c.send('player/get_mute', { pid: 1 });
    const t0 = Date.now();
    m.drop(new Error('ECONNRESET'));
    await expect(a).rejects.toBeInstanceOf(DisconnectedError);
    await expect(b).rejects.toBeInstanceOf(DisconnectedError);
    expect(Date.now() - t0).toBeLessThan(100);
    expect(c.isClosed).toBe(true);
    await expect(c.send('system/heart_beat')).rejects.toBeInstanceOf(DisconnectedError);
  });

  it('times out, rejects, and closes the connection', async () => {
    const m = memorySocket();
    const c = await HeosCliClient.connect(m.factory, 'x', { timeoutMs: 50 });
    const closed = new Promise<void>((r) => c.onClose(() => r()));
    const a = c.send('player/get_volume', { pid: 1 });
    const b = c.send('player/get_mute', { pid: 1 });
    await expect(a).rejects.toBeInstanceOf(TimeoutError);
    await expect(b).rejects.toBeInstanceOf(DisconnectedError);
    await closed;
    expect(c.isClosed).toBe(true);
  });

  it('ignores lines that are not HEOS JSON', async () => {
    const m = memorySocket();
    const c = await HeosCliClient.connect(m.factory, 'x');
    const p = c.send('system/heart_beat');
    m.push('garbage');
    m.push({ nope: true });
    m.push(reply('system/heart_beat'));
    await expect(p).resolves.toMatchObject({ result: 'success' });
  });
});
