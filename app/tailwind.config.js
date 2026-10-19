const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  // theme.ts swaps CSS variables for light/dark, so no dark: prefixes are used
  darkMode: 'class',
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        canvas: token('canvas'),
        surface: token('surface'),
        'surface-hover': token('surface-hover'),
        line: token('line'),
        ink: token('ink'),
        'ink-weak': token('ink-weak'),
        pill: token('pill'),
        'pill-hover': token('pill-hover'),
        title: token('title'),
        brand: token('brand'),
        down: token('down'),
        primary: token('primary'),
        online: token('online'),
        offline: token('offline'),
        idle: token('idle'),
      },
      fontFamily: {
        pixel: ['PressStart2P_400Regular'],
        mono: ['IBMPlexMono_400Regular'],
        'mono-medium': ['IBMPlexMono_500Medium'],
        'mono-bold': ['IBMPlexMono_600SemiBold'],
      },
    },
  },
};
