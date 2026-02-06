import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        // $402 brand colors
        brand: {
          cyan: '#00d4ff',
          green: '#00ff88',
          purple: '#8b5cf6'
        }
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'JetBrains Mono', 'Fira Code', 'monospace'],
        display: ['var(--font-orbitron)', 'Orbitron', 'sans-serif']
      }
    }
  },
  plugins: []
};

export default config;
