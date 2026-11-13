import { DEFAULT_APPEARANCE } from '../src/theme';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform, ScrollView, StyleSheet } from 'react-native';
import SettingsScreen from '../app/settings/index';
import { DeviceManager } from '../src/runtime/manager';
import { DeviceMemory, memoryKv } from '../src/runtime/memory';
import { RuntimeProvider } from '../src/runtime/RuntimeProvider';
import type { SupporterState } from '../src/runtime/supporter';
import { InputsEditor, pendingRenames } from '../src/ui/InputsEditor';
import { purchaseLine, SettingsView } from '../src/ui/SettingsView';

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() }, useLocalSearchParams: () => ({}) }));
jest.mock('@react-native-community/netinfo', () => ({ addEventListener: () => () => {}, configure: () => {} }));

const DEVICES = [
  { key: 'S1', name: 'Loving room', model: 'Denon DHT-S716H', lastIp: '10.0.0.82' },
  { key: 'S2', name: 'Bedroom', model: 'Denon Home 150', lastIp: '10.0.0.90' },
];

describe('SettingsView', () => {
  const h = () => ({ onActivate: jest.fn(), onForget: jest.fn(), onAddDevice: jest.fn(), onInputs: jest.fn(), onRename: jest.fn(async () => null) });

  it('lists devices, switches and forgets them', async () => {
    const p = h();
    await render(<SettingsView devices={DEVICES} activeKey="S1" statusOf={() => 'ready'} version="0.1.0" {...p} />);
    await fireEvent.press(screen.getByText('Bedroom'));
    expect(p.onActivate).toHaveBeenCalledWith('S2');
    await fireEvent.press(screen.getByLabelText('Forget Loving room'));
    expect(p.onForget).toHaveBeenCalledWith('S1');
    await fireEvent.press(screen.getByText('Add a soundbar'));
    expect(p.onAddDevice).toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Inputs'));
    expect(p.onInputs).toHaveBeenCalled();
  });

  it('content is a centred column on wide screens', async () => {
    await render(<SettingsView devices={DEVICES} activeKey="S1" statusOf={() => 'ready'} version="0.1.0" {...h()} />);
    expect(StyleSheet.flatten(screen.getByTestId('settings-scroll').props.contentContainerStyle)).toMatchObject({ maxWidth: 560, width: '100%', alignSelf: 'center' });
  });

  it('carries the trademark disclaimer and version', async () => {
    await render(<SettingsView devices={DEVICES} activeKey="S1" statusOf={() => 'ready'} version="0.1.0" {...h()} />);
    expect(screen.getByText('Zapbar is not affiliated with Denon or HEOS.')).toBeTruthy();
    expect(screen.getByText('Version 0.1.0')).toBeTruthy();
  });
});

describe('InputsEditor', () => {
  const INPUTS = [
    { mid: 'inputs/hdmi_in_1', label: 'PS5', icon: 'playstation' as const, hidden: false },
    { mid: 'inputs/hdmi_in_2', label: 'HDMI 2', icon: 'hdmi' as const, hidden: true },
  ];
  const h = () => ({ onRename: jest.fn(), onIcon: jest.fn(), onHidden: jest.fn(), onMove: jest.fn() });

  it('renames, re-icons, hides and moves inputs', async () => {
    const p = h();
    await render(<InputsEditor inputs={INPUTS} {...p} />);
    await fireEvent.changeText(screen.getByLabelText('Label for PS5'), 'PlayStation');
    await fireEvent.press(screen.getByLabelText('Save name for PS5'));
    expect(p.onRename).toHaveBeenCalledWith('inputs/hdmi_in_1', 'PlayStation');
    await fireEvent.press(screen.getAllByLabelText('Icon xbox')[0]!);
    expect(p.onIcon).toHaveBeenCalledWith('inputs/hdmi_in_1', 'xbox');
    await fireEvent(screen.getByLabelText('Show HDMI 2'), 'valueChange', true);
    expect(p.onHidden).toHaveBeenCalledWith('inputs/hdmi_in_2', false);
    await fireEvent.press(screen.getByLabelText('Move HDMI 2 up'));
    expect(p.onMove).toHaveBeenCalledWith('inputs/hdmi_in_2', -1);
  });

  it('typing alone does not save; the check button appears only after a change', async () => {
    const p = h();
    await render(<InputsEditor inputs={INPUTS} {...p} />);
    expect(screen.queryByLabelText('Save name for PS5')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Label for PS5'), 'PlayStation');
    expect(p.onRename).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Save name for PS5')).toBeTruthy();
  });

  it('the keyboard Done key saves the name', async () => {
    const p = h();
    await render(<InputsEditor inputs={INPUTS} {...p} />);
    await fireEvent.changeText(screen.getByLabelText('Label for PS5'), 'PlayStation');
    await fireEvent(screen.getByLabelText('Label for PS5'), 'submitEditing');
    expect(p.onRename).toHaveBeenCalledWith('inputs/hdmi_in_1', 'PlayStation');
  });

  it('the undo button restores the saved name without saving', async () => {
    const p = h();
    await render(<InputsEditor inputs={INPUTS} {...p} />);
    await fireEvent.changeText(screen.getByLabelText('Label for PS5'), 'PlayStation');
    await fireEvent.press(screen.getByLabelText('Undo name change for PS5'));
    expect(screen.getByLabelText('Label for PS5').props.value).toBe('PS5');
    expect(p.onRename).not.toHaveBeenCalled();
  });

  it('does not re-report unchanged drafts when the screen re-renders', async () => {
    const onDraftsChange = jest.fn();
    const { rerender } = await render(<InputsEditor inputs={INPUTS} {...h()} onDraftsChange={onDraftsChange} />);
    await rerender(<InputsEditor inputs={INPUTS.map((i) => ({ ...i }))} {...h()} onDraftsChange={onDraftsChange} />);
    await rerender(<InputsEditor inputs={INPUTS.map((i) => ({ ...i }))} {...h()} onDraftsChange={onDraftsChange} />);
    expect(onDraftsChange).toHaveBeenCalledTimes(1);
  });

  it('reports unsaved drafts to the screen', async () => {
    const onDraftsChange = jest.fn();
    await render(<InputsEditor inputs={INPUTS} {...h()} onDraftsChange={onDraftsChange} />);
    await fireEvent.changeText(screen.getByLabelText('Label for PS5'), 'PlayStation');
    expect(onDraftsChange).toHaveBeenLastCalledWith([['inputs/hdmi_in_1', 'PlayStation']]);
  });
});

it('pendingRenames lists only changed names', () => {
  const inputs = [
    { mid: 'a', label: 'PS5', icon: 'playstation' as const, hidden: false },
    { mid: 'b', label: 'TV', icon: 'tv' as const, hidden: false },
  ];
  expect(pendingRenames({ a: 'PS5 ', b: 'Telly' }, inputs)).toEqual([['b', 'Telly']]);
  expect(pendingRenames({}, inputs)).toEqual([]);
  expect(pendingRenames({ a: '' }, inputs)).toEqual([['a', '']]);
});
it('an off switch stays visible: muted thumb on a surfaceHi track', async () => {
  const { ThemeOverride, palettes } = require('../src/theme');
  const inputs = [{ mid: 'inputs/hdmi_in_2', label: 'HDMI 2', icon: 'hdmi' as const, hidden: true }];
  await render(
    <ThemeOverride.Provider value="dark">
      <InputsEditor inputs={inputs} onRename={jest.fn()} onIcon={jest.fn()} onHidden={jest.fn()} onMove={jest.fn()} />
    </ThemeOverride.Provider>,
  );
  const sw = screen.getByLabelText('Show HDMI 2');
  expect(sw.props.thumbTintColor ?? sw.props.thumbColor).toBe(palettes.dark.muted);
});
describe('rename soundbar', () => {
  const h = () => ({ onActivate: jest.fn(), onForget: jest.fn(), onAddDevice: jest.fn(), onInputs: jest.fn(), onRename: jest.fn(async () => null) });

  it('edits the name inline and saves with the check button', async () => {
    const p = h();
    await render(<SettingsView devices={DEVICES} activeKey="S1" statusOf={() => 'ready'} version="0.1.0" {...p} />);
    await fireEvent.press(screen.getByLabelText('Rename Loving room'));
    await fireEvent.changeText(screen.getByLabelText('Name for Loving room'), 'Living room');
    await fireEvent.press(screen.getByLabelText('Save name for Loving room'));
    expect(p.onRename).toHaveBeenCalledWith('S1', 'Living room');
  });

  it('shows the error the screen returns and keeps editing', async () => {
    const p = { ...h(), onRename: jest.fn(async () => "Couldn't rename the soundbar") };
    await render(<SettingsView devices={DEVICES} activeKey="S1" statusOf={() => 'ready'} version="0.1.0" {...p} />);
    await fireEvent.press(screen.getByLabelText('Rename Loving room'));
    await fireEvent.changeText(screen.getByLabelText('Name for Loving room'), 'Living room');
    await fireEvent.press(screen.getByLabelText('Save name for Loving room'));
    expect(await screen.findByText("Couldn't rename the soundbar")).toBeTruthy();
    expect(screen.getByLabelText('Name for Loving room')).toBeTruthy();
  });

  it('shows a nickname instead of the reported name', async () => {
    await render(<SettingsView devices={[{ ...DEVICES[0]!, nickname: 'Den' }]} activeKey="S1" statusOf={() => 'ready'} version="0.1.0" {...h()} />);
    expect(screen.getByText('Den')).toBeTruthy();
  });
});
describe('quick access settings', () => {
  const base = { devices: DEVICES, activeKey: 'S1', statusOf: () => 'ready' as const, version: '0.3.0', onActivate: jest.fn(), onForget: jest.fn(), onAddDevice: jest.fn(), onInputs: jest.fn(), onRename: jest.fn(async () => null) };

  it('toggles volume keys and the notification, and opens battery settings', async () => {
    const onQuick = jest.fn();
    const onBattery = jest.fn();
    await render(<SettingsView {...base} quick={{ volumeKeys: true, notification: true }} onQuick={onQuick} onBattery={onBattery} />);
    await fireEvent(screen.getByLabelText('Volume keys control the soundbar'), 'valueChange', false);
    expect(onQuick).toHaveBeenCalledWith({ volumeKeys: false });
    await fireEvent(screen.getByLabelText('Show notification'), 'valueChange', false);
    expect(onQuick).toHaveBeenCalledWith({ notification: false });
    await fireEvent.press(screen.getByText('Keep volume keys working when the app is closed'));
    expect(onBattery).toHaveBeenCalled();
  });
});

it('settings shows "Soundbar" for a bar that was never renamed', async () => {
  await render(<SettingsView devices={[{ key: 'S9', name: 'Denon DHT-S716H', model: 'Denon DHT-S716H', lastIp: '10.0.0.82' }]} activeKey="S9" statusOf={() => 'ready'} version="0.3.1" onActivate={jest.fn()} onForget={jest.fn()} onAddDevice={jest.fn()} onInputs={jest.fn()} onRename={jest.fn(async () => null)} />);
  expect(screen.getByText('Soundbar')).toBeTruthy();
});

it('saves a rename with one press while the keyboard is open (taps are not swallowed by the scroll view)', async () => {
  await render(<SettingsView devices={DEVICES} activeKey="S1" statusOf={() => 'ready'} version="0.3.3" onActivate={jest.fn()} onForget={jest.fn()} onAddDevice={jest.fn()} onInputs={jest.fn()} onRename={jest.fn(async () => null)} />);
  expect(screen.getByTestId('settings-scroll').props.keyboardShouldPersistTaps).toBe('handled');
});

const SUPPORT: SupporterState = {
  available: true,
  products: [{ id: 'supporter_2', price: '€2.00' }, { id: 'supporter_5', price: '€5.00' }, { id: 'supporter_10', price: '€10.00' }],
  owned: [],
  pending: [],
  busy: null,
  supporter: false,
  appearance: DEFAULT_APPEARANCE,
};
const support = { state: SUPPORT, onBuy: jest.fn(), onAppearance: jest.fn() };
const settingsHandlers = () => ({ onActivate: jest.fn(), onForget: jest.fn(), onAddDevice: jest.fn(), onInputs: jest.fn(), onRename: jest.fn(async () => null) });
const layout = (y: number) => ({ nativeEvent: { layout: { x: 0, y, width: 360, height: 200 } } });

it('opened from "Support us", settings scrolls straight to the tips', async () => {
  const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => {});
  await render(<SettingsView devices={DEVICES} activeKey="S1" statusOf={() => 'ready'} version="0.1.0" {...settingsHandlers()} support={support} focus="support" />);
  await fireEvent(screen.getByTestId('settings-support'), 'layout', layout(640));
  expect(scrollTo).toHaveBeenCalledWith({ y: 640, animated: true });
  scrollTo.mockRestore();
});

it('opened normally, settings stays at the top', async () => {
  const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => {});
  await render(<SettingsView devices={DEVICES} activeKey="S1" statusOf={() => 'ready'} version="0.1.0" {...settingsHandlers()} support={support} />);
  await fireEvent(screen.getByTestId('settings-support'), 'layout', layout(640));
  expect(scrollTo).not.toHaveBeenCalled();
  scrollTo.mockRestore();
});

describe('platform differences', () => {
  it('purchase wording follows the platform', () => {
    expect(purchaseLine('ios').endsWith('handled by the App Store.')).toBe(true);
    expect(purchaseLine('android').endsWith('handled by Google Play.')).toBe(true);
  });

  const QUICK_ROWS = ['Volume keys control the soundbar', 'Show notification', 'Keep volume keys working when the app is closed'];
  async function renderRoute(os: 'ios' | 'android') {
    jest.replaceProperty(Platform, 'OS', os);
    const memory = new DeviceMemory(memoryKv());
    memory.saveDevice({ key: 'S1', name: 'Loving room', model: 'm', lastIp: '10.0.0.82' });
    const m = new DeviceManager({ socketFactory: () => new Promise(() => {}), http: async () => ({ status: 500, text: '' }), memory, discover: async () => [] });
    await render(<RuntimeProvider manager={m}><SettingsScreen /></RuntimeProvider>);
  }
  afterEach(() => jest.restoreAllMocks());

  it('ios hides the quick rows', async () => {
    await renderRoute('ios');
    for (const t of QUICK_ROWS) expect(screen.queryByText(t)).toBeNull();
  });

  it('android shows the quick rows', async () => {
    await renderRoute('android');
    for (const t of QUICK_ROWS) expect(screen.getByText(t)).toBeTruthy();
  });
});
