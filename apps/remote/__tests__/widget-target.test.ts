// The iOS widget target config (@bacons/apple-targets). The plugin reads { light, dark }; any other keys
// produce an empty colorset, every Color("zq…") resolves to clear and the widget renders blank.
const appJson = require('../app.json');
const target = require('../targets/widgets/expo-target.config.js')(appJson.expo);

test('every widget colour has a light and a dark value', () => {
  const colors = Object.entries(target.colors as Record<string, { light?: string; dark?: string }>);
  expect(colors.length).toBe(8);
  for (const [name, c] of colors) {
    expect([name, c.light]).toEqual([name, expect.stringMatching(/^#[0-9A-F]{6}$/)]);
    expect([name, c.dark]).toEqual([name, expect.stringMatching(/^#[0-9A-F]{6}$/)]);
  }
});

test('the colours the Swift views use are all defined', () => {
  const swift = require('fs').readFileSync(require('path').join(__dirname, '../targets/widgets/WidgetViews.swift'), 'utf8');
  const used = [...swift.matchAll(/Color\("(\w+)"\)/g)].map((m) => m[1]);
  expect(used.length).toBeGreaterThan(0);
  for (const name of used) expect(Object.keys(target.colors)).toContain(name);
});
