import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        atlas: {
          bg: '#0a0a0f',
          card: '#111118',
          border: '#1e1e2e',
          accent: '#00ff88',
          profit: '#00ff88',
          loss: '#ff4444',
          warning: '#ffaa00',
          muted: '#6b7280',
          text: '#e5e7eb',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
export default config
