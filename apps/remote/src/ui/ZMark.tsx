import Svg, { Path } from 'react-native-svg';

/** Same path as assets/brand/z.svg (checked by a test). */
export const Z_PATH = 'M27 30H73L27 70H73';

export function ZMark({ size = 24, color, testID, decorative }: { size?: number; color: string; testID?: string; decorative?: boolean }) {
  return (
    <Svg testID={testID} width={size} height={size} viewBox="0 0 100 100" accessible={!decorative} accessibilityRole={decorative ? undefined : 'image'} accessibilityLabel={decorative ? undefined : 'Zapbar'}>
      <Path testID="zmark-path" d={Z_PATH} fill="none" stroke={color} strokeWidth={15} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
