import { DEFAULT_APPEARANCE } from '../src/theme';
import { render, screen } from '@testing-library/react-native';
import Index from '../app/index';
import { DeviceManager } from '../src/runtime/manager';
import { DeviceMemory, memoryKv } from '../src/runtime/memory';
import { RuntimeProvider } from '../src/runtime/RuntimeProvider';

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text>redirect:{href}</Text>;
  },
}));
jest.mock('@react-native-community/netinfo', () => ({ addEventListener: () => () => {}, configure: () => {} }));

const managerWith = (setupDone: boolean) => {
  const memory = new DeviceMemory(memoryKv());
  memory.saveDevice({ key: 'S1', name: 'Bar', model: 'm', lastIp: '10.0.0.82' });
  if (setupDone) memory.markSetupDone('S1');
  const m = new DeviceManager({ socketFactory: () => new Promise(() => {}), http: async () => ({ status: 500, text: '' }), memory, discover: async () => [] });
  return m;
};

it('sends a new user to setup', async () => {
  await render(<RuntimeProvider manager={new DeviceManager({ socketFactory: () => new Promise(() => {}), http: async () => ({ status: 500, text: '' }), memory: new DeviceMemory(memoryKv()), discover: async () => [] })}><Index /></RuntimeProvider>);
  expect(screen.getByText('redirect:/setup')).toBeTruthy();
});

it('sends a configured user to the remote', async () => {
  await render(<RuntimeProvider manager={managerWith(true)}><Index /></RuntimeProvider>);
  expect(screen.getByText('redirect:/remote')).toBeTruthy();
});

it('refreshes tip ownership on launch and applies a supporter appearance app-wide', async () => {
  const { Supporter } = require('../src/runtime/supporter');
  const { FakeBilling } = require('./fakes/fake-billing');
  const { Text } = require('react-native');
  const { useTheme } = require('../src/theme');
  const m = managerWith(true);
  m.memory.setSupporter(true);
  m.memory.setAppearance({ ...DEFAULT_APPEARANCE, accent: 'coral', font: 'comic' });
  const billing = new FakeBilling();
  billing.purchases = [{ id: 'supporter_2', state: 'owned', token: 't', acknowledged: true }];
  const sup = new Supporter(billing, m.memory);
  const refresh = jest.spyOn(sup, 'refresh');
  function Probe() {
    const t = useTheme();
    return <Text>{`${t.type.body.fontFamily}|${t.appearance.accent}`}</Text>;
  }
  await render(<RuntimeProvider manager={m} supporter={sup}><Probe /></RuntimeProvider>);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(screen.getByText('ComicNeue_400Regular|coral')).toBeTruthy();
});
