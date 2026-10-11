import Svg, { Rect } from 'react-native-svg';

// Each icon is a pixel grid: '#' is a filled pixel, '.' is empty.
const ICONS = {
  up: [
    '....#....',
    '...###...',
    '..#####..',
    '.#######.',
    '#########',
    '...###...',
    '...###...',
    '...###...',
    '...###...',
  ],
  down: [
    '...###...',
    '...###...',
    '...###...',
    '...###...',
    '#########',
    '.#######.',
    '..#####..',
    '...###...',
    '....#....',
  ],
  comment: [
    '#########',
    '#.......#',
    '#.......#',
    '#.......#',
    '#.......#',
    '#########',
    '.##......',
    '.#.......',
    '.........',
  ],
  menu: [
    '.........',
    '#########',
    '#########',
    '.........',
    '#########',
    '#########',
    '.........',
    '#########',
    '#########',
  ],
  back: [
    '.........',
    '...#.....',
    '..##.....',
    '.########',
    '#########',
    '.########',
    '..##.....',
    '...#.....',
    '.........',
  ],
  calendar: [
    '.#.....#.',
    '#########',
    '#.......#',
    '#########',
    '#.#.#.#.#',
    '#.......#',
    '#.#.#.#.#',
    '#.......#',
    '#########',
  ],
  plus: [
    '#########',
    '#.......#',
    '#...#...#',
    '#...#...#',
    '#.#####.#',
    '#...#...#',
    '#...#...#',
    '#.......#',
    '#########',
  ],
  close: [
    '#.....#',
    '.#...#.',
    '..#.#..',
    '...#...',
    '..#.#..',
    '.#...#.',
    '#.....#',
  ],
};

export type IconName = keyof typeof ICONS;

export function PixelIcon({ name, size = 14, color }: { name: IconName; size?: number; color: string }) {
  const rows = ICONS[name];
  const width = rows[0].length;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${width} ${rows.length}`}>
      {rows.flatMap((row, y) =>
        [...row].map((ch, x) =>
          ch === '#' ? <Rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={color} /> : null,
        ),
      )}
    </Svg>
  );
}

// App logo: the same pixel arrow cursor as the app icon (X = outline, O = fill).
const LOGO = [
  'X...........',
  'XX..........',
  'XOX.........',
  'XOOX........',
  'XOOOX.......',
  'XOOOOX......',
  'XOOOOOX.....',
  'XOOOOOOX....',
  'XOOOOOOOX...',
  'XOOOOOOOOX..',
  'XOOOOOOOOOX.',
  'XOOOOOOXXXXX',
  'XOOOXOOX....',
  'XOOXXOOX....',
  'XOX..XOOX...',
  'XX...XOOX...',
  'X.....XOOX..',
  '......XOOX..',
  '.......XX...',
];

// Filled white because it sits on the orange top bar; the app icon itself is filled orange.
export function LogoMark({ height = 18 }: { height?: number }) {
  const colors: Record<string, string> = { X: '#1C1B22', O: '#FFFFFF' };
  const rows = LOGO.length;
  const cols = LOGO[0].length;
  return (
    <Svg width={(height * cols) / rows} height={height} viewBox={`0 0 ${cols} ${rows}`}>
      {LOGO.flatMap((row, y) =>
        [...row].map((ch, x) =>
          colors[ch] ? <Rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={colors[ch]} /> : null,
        ),
      )}
    </Svg>
  );
}
