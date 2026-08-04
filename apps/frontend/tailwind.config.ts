import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // CSS-variable-driven theme tokens (04-frontend-design.md §6).
        // These map to CSS variables defined in main.css (future).
      },
    },
  },
  plugins: [],
} satisfies Config
