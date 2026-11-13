import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HeosDevice } from '../src/device';
import { nodeHttp, nodeSocketFactory } from '../src/node';
import { createHeosStore, type HeosStore } from '../src/state/store';
import { FakeHeos } from './fake/fake-heos';
import { waitFor } from './helpers';

const KEY = 'TESTSERIAL0001';
const PID = 7331878;
const KITCHEN = 101;
const PATIO = 202;
let fake: FakeHeos;
let store: HeosStore;
let dev: HeosDevice;
const st = () => store.getState().devices[KEY]!;

async function ready() {
  dev = new HeosDevice(
    { socketFactory: nodeSocketFactory, http: nodeHttp, store, cliPort: fake.cliPort, upnpPort: fake.httpPort, timeoutMs: 500, backoffMs: [20], upnpPollMs: 50 },
    { key: KEY, ip: '127.0.0.1' },
  );
  dev.start();
  await waitFor(() => st().status === 'ready');
}

beforeEach(async () => {
  fake = await FakeHeos.start();
  fake.peers = [
    { pid: KITCHEN, name: 'Kitchen', model: 'Denon Home 150', volume: 20, mute: false },
    { pid: PATIO, name: 'Patio', model: 'Denon Home 250', volume: 60, mute: false },
  ];
  store = createHeosStore();
});
afterEach(async () => {
  dev?.stop();
  await fake.stop();
});

describe('grouping', () => {
  it('lists every speaker on the network and starts ungrouped', async () => {
    await ready();
    expect(st().players.map((p) => p.name)).toEqual(['Loving room', 'Kitchen', 'Patio']);
    expect(st().group).toBeNull();
  });

  it('picks up an existing HEOS group at connect, with group volume as the main volume', async () => {
    fake.groups = [{ pids: [PID, KITCHEN], volume: 33, mute: false }];
    await ready();
    expect(st().group).toMatchObject({ gid: PID, leaderPid: PID, name: 'Loving room + Kitchen' });
    expect(st().group!.members.map((m) => [m.name, m.volume])).toEqual([['Loving room', 49], ['Kitchen', 20]]);
    expect(st().settings.volume).toBe(33);
  });

  it('groups with this bar as leader and ungroups again', async () => {
    await ready();
    expect(await dev.setGroupMembers([KITCHEN, PATIO])).toBe(true);
    expect(fake.groups[0]!.pids).toEqual([PID, KITCHEN, PATIO]);
    expect(st().group!.members.map((m) => m.pid)).toEqual([PID, KITCHEN, PATIO]);
    expect(await dev.ungroup()).toBe(true);
    expect(fake.groups).toEqual([]);
    expect(st().group).toBeNull();
    expect(st().settings.volume).toBe(49);
  });

  it('removing one member keeps the rest playing together', async () => {
    fake.groups = [{ pids: [PID, KITCHEN, PATIO], volume: 40, mute: false }];
    await ready();
    await dev.setGroupMembers([PATIO]);
    expect(fake.groups[0]!.pids).toEqual([PID, PATIO]);
  });

  it('dropping the leader regroups with this bar leading', async () => {
    fake.groups = [{ pids: [KITCHEN, PID, PATIO], volume: 40, mute: false }];
    await ready();
    expect(st().group!.leaderPid).toBe(KITCHEN);
    await dev.setGroupMembers([PATIO]);
    expect(fake.received.filter((l) => l.startsWith('heos://group/set_group'))).toEqual([
      `heos://group/set_group?pid=${KITCHEN}`,
      `heos://group/set_group?pid=${PID},${PATIO}`,
    ]);
    expect(st().group!.leaderPid).toBe(PID);
  });

  it('main volume and mute go to the group while grouped', async () => {
    await ready();
    await dev.setGroupMembers([KITCHEN]);
    await dev.setVolume(25);
    expect(fake.groups[0]!.volume).toBe(25);
    expect(fake.state.volume).toBe(49);
    await dev.setMute(true);
    expect(fake.groups[0]!.mute).toBe(true);
    expect(fake.state.mute).toBe(false);
  });

  it('a group volume event from elsewhere moves the main slider', async () => {
    fake.groups = [{ pids: [PID, KITCHEN], volume: 33, mute: false }];
    await ready();
    fake.emit('group_volume_changed', { gid: PID, level: 12, mute: 'off' });
    await waitFor(() => st().settings.volume === 12);
  });

  it('sets one speaker inside the group and tracks its events', async () => {
    fake.groups = [{ pids: [PID, KITCHEN], volume: 33, mute: false }];
    await ready();
    expect(await dev.setMemberVolume(KITCHEN, 45)).toBe(true);
    expect(fake.peers[0]!.volume).toBe(45);
    fake.emit('player_volume_changed', { pid: KITCHEN, level: 50, mute: 'off' });
    await waitFor(() => st().group!.members.find((m) => m.pid === KITCHEN)!.volume === 50);
    expect(st().settings.volume).toBe(33);
  });

  it('follows a group made in the HEOS app (groups_changed)', async () => {
    await ready();
    fake.groups = [{ pids: [PATIO, PID], volume: 70, mute: false }];
    fake.emit('groups_changed', {});
    await waitFor(() => st().group?.leaderPid === PATIO);
    expect(st().settings.volume).toBe(70);
  });

  it('as a member, playback commands go to the leader and inputs pass this bar as source', async () => {
    fake.groups = [{ pids: [KITCHEN, PID], volume: 40, mute: false }];
    await ready();
    await dev.next();
    await dev.playInput('inputs/hdmi_in_2');
    expect(fake.received).toContain(`heos://player/play_next?pid=${KITCHEN}`);
    expect(fake.received).toContain(`heos://browse/play_input?pid=${KITCHEN}&spid=${PID}&input=inputs/hdmi_in_2`);
  });

  it('reports a refused group change and keeps the real state', async () => {
    await ready();
    fake.failNext('group/set_group', '9', 'Busy');
    expect(await dev.setGroupMembers([KITCHEN])).toBe(false);
    expect(st().lastError?.text).toBe("Couldn't change the group: Busy");
    expect(st().group).toBeNull();
  });

  it('a bar that refuses group commands still connects', async () => {
    fake.failNext('group/get_groups', '1', 'Unrecognized Command');
    await ready();
    expect(st().group).toBeNull();
  });
});
