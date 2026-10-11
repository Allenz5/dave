import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { useColors } from '@/lib/theme';

// Monochrome pixel line-art landscape (a little Beetle on the ground), used when a channel has no cover image.
const CAR = [
  '.......########.......',
  '.....##...#....##.....',
  '....#.....#......#....',
  '...#......#.......#...',
  '..##################..',
  '.#..................#.',
  '#....................#',
  '#...####......####...#',
  '####....######....####',
  '...#.##.#....#.##.#...',
  '...#.##.#....#.##.#...',
  '....####......####....',
];

// Where the car sits, as a fraction of the banner width.
const CAR_X = 0.1;

// Little dashes and dots under the ground line, as fractions of the width.
const PEBBLES = [0.04, 0.17, 0.23, 0.41, 0.55, 0.61, 0.74, 0.86, 0.93];

export function PixelScene({ height }: { height: number }) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const px = height >= 80 ? 3 : 2;
  const rows = Math.floor(height / px);
  const groundY = rows - 6;

  const rects: { x: number; y: number; w?: number }[] = [];
  const carLeft = Math.round((width / px) * CAR_X);
  const carTop = groundY - CAR.length;
  CAR.forEach((row, y) =>
    [...row].forEach((ch, x) => ch === '#' && rects.push({ x: carLeft + x, y: carTop + y })),
  );
  // Speed lines trailing behind the car
  rects.push({ x: carLeft - 7, y: carTop + 4, w: 4 }, { x: carLeft - 5, y: carTop + 6, w: 3 });
  PEBBLES.forEach((f, i) => {
    const x = Math.round((width / px) * f);
    rects.push({ x, y: groundY + 2 + (i % 2), w: i % 3 === 0 ? 1 : 3 });
  });

  return (
    <View className="bg-surface" style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <Svg width={width} height={height}>
          <Rect x={0} y={groundY * px} width={width} height={px} fill={c['ink-weak']} />
          {rects.map((r, i) => (
            <Rect key={i} x={r.x * px} y={r.y * px} width={(r.w ?? 1) * px} height={px} fill={c['ink-weak']} />
          ))}
        </Svg>
      )}
    </View>
  );
}
