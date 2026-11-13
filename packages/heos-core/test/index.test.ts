import { expect, it } from 'vitest';
import * as core from '../src';

it('exports the public API', () => {
  for (const name of [
    'HeosDevice', 'createHeosStore', 'upsertDevice', 'patchSettings', 'probeCapabilities', 'toPlayback',
    'HeosCliClient', 'createCliCommands', 'deviceKey', 'CliError', 'TimeoutError', 'DisconnectedError',
    'buildMSearch', 'parseSsdpResponse', 'uniqueIps', 'listPlayers', 'findIpByKey', 'HEOS_ST',
    'TONE_RANGE', 'presetLabel', 'DIALOGUE_RANGE', 'NIGHT_RANGE', 'UpnpFault', 'UpnpUnreachable', 'EMPTY_SETTINGS',
  ]) {
    expect(core, name).toHaveProperty(name);
  }
});
