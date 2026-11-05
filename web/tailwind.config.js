import { join } from 'path';

export default {
  content: [
    './src/**/*.{js,ts,svelte}',
    './node_modules/@immich/ui/**/*.{js,ts,jsx,tsx,svelte}',
  ],
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        'deep-carbon': {
          900: '#0a0c10',
          800: '#0a0c10',
          700: '#12161f',
          600: '#12161f',
          500: '#1a2033',
          400: '#222848',
          300: '#2d3a5a',
          200: '#3a4873',
          100: '#4a5b8c',
        },
        'terminal-green': {
          500: '#00ff66',
          400: '#00e65c',
          300: '#00cc52',
          200: '#00b348',
          100: '#00993e',
        },
        'terminal': {
          DEFAULT: '#00ff66',
          foreground: '#0a0c10',
          background: '#12161f',
          border: '#00ff66',
        },
      },
      fontFamily: {
        'mono-terminal': ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        'terminal': '0 0 0 1px #00ff66',
        'terminal-lg': '0 0 0 2px #00ff66, 0 4px 6px -1px rgba(0, 0, 0, 0.3)',
        'terminal-inner': 'inset 0 1px 0 #00ff66',
      },
      borderStyle: {
        'terminal': 'solid',
      },
      borderRadius: {
        'terminal': '0',
      },
      transitionProperty: {
        'terminal': 'border-color, box-shadow, transform',
      },
      animation: {
        'terminal-cursor': 'terminalCursor 1s infinite',
      },
    },
  },
  plugins: [],
};