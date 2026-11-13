/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
const fs = require('fs');
const path = require('path');

// Template icons rasterised from the Android widget's vector drawables (96 px, white on transparent).
const ICON_DIR = path.join(__dirname, '../../assets/widget-icons');
const images = Object.fromEntries(
  fs.readdirSync(ICON_DIR).filter((f) => f.endsWith('.png')).map((f) => [f.replace(/\.png$/, ''), path.join('../../assets/widget-icons', f)]),
);

module.exports = (config) => ({
  type: 'widget',
  name: 'ZapbarWidgets',
  displayName: 'Zapbar',
  bundleIdentifier: '.widgets',
  // Interactive widgets (Button(intent:)) need iOS 17; the app itself runs on older versions without widgets.
  deploymentTarget: '17.0',
  frameworks: ['WidgetKit', 'SwiftUI', 'AppIntents', 'Network'],
  images,
  colors: {
    // Same values as the Android widget (modules/zapbar-quick/android/src/main/res/values*/zq_colors.xml).
    zqBg: { light: '#F3F6EC', dark: '#17301B' },
    zqSurface: { light: '#FFFFFF', dark: '#21402A' },
    zqSurfaceHi: { light: '#E3EAD7', dark: '#2C4F33' },
    zqText: { light: '#17301B', dark: '#F4F6EE' },
    zqMuted: { light: '#5E7360', dark: '#A9B8A0' },
    zqAccent: { light: '#17301B', dark: '#C8F552' },
    zqOnAccent: { light: '#C8F552', dark: '#17301B' },
    zqWarn: { light: '#8A5F00', dark: '#F5C451' },
  },
  entitlements: {
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
});
