import { useColorScheme, useWindowDimensions } from 'react-native';
import { vars } from 'nativewind';

// Colors are defined only here: Tailwind reads them via CSS variables, icons via useColors.
export const palette = {
  light: {
    canvas: '#F8F7F4',
    surface: '#FFFFFF',
    'surface-hover': '#F1F0EC',
    line: '#E5E3DE',
    ink: '#1C1B22',
    'ink-weak': '#6B6775',
    pill: '#ECEAE5',
    'pill-hover': '#E0DED8',
    title: '#FF5A1F',
    brand: '#FF5A1F',
    down: '#6B6775',
    primary: '#D9430B',
  },
  dark: {
    canvas: '#2B2938',
    surface: '#1D1B26',
    'surface-hover': '#262433',
    line: '#3A3749',
    ink: '#F1EDE3',
    'ink-weak': '#A29DB0',
    pill: '#3A3749',
    'pill-hover': '#46435A',
    title: '#FF6B33',
    brand: '#FF6B33',
    down: '#A29DB0',
    primary: '#E0521C',
  },
};

export type Colors = typeof palette.light;

function toRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return `${n >> 16} ${(n >> 8) & 255} ${n & 255}`;
}

export const themeVars = {
  light: vars(Object.fromEntries(Object.entries(palette.light).map(([k, v]) => [`--${k}`, toRgb(v)]))),
  dark: vars(Object.fromEntries(Object.entries(palette.dark).map(([k, v]) => [`--${k}`, toRgb(v)]))),
};

export function useScheme() {
  return useColorScheme() === 'dark' ? 'dark' : 'light';
}

export function useColors(): Colors {
  return palette[useScheme()];
}

// Breakpoints match Reddit: left nav at ≥1200, right sidebar at ≥960
export function useBreakpoints() {
  const { width } = useWindowDimensions();
  return { showNav: width >= 1200, showSidebar: width >= 960, wide: width >= 768 };
}
