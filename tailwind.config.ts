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
        okx: {
          bg: 'var(--bg-primary)',
          surface: 'var(--bg-secondary)',
          card: 'var(--bg-card)',
          hover: 'var(--bg-hover)',
          border: 'var(--border-color)',
          green: 'var(--green)',
          red: 'var(--red)',
          yellow: 'var(--yellow)',
          blue: 'var(--blue)',
          text: 'var(--text-primary)',
          muted: 'var(--text-secondary)',
          dim: 'var(--text-tertiary)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'SF Pro Display', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      animation: {
        'pulse-green': 'pulse-green 2s ease-in-out infinite',
        'fade-in': 'fade-in 0.3s ease-out',
      },
      keyframes: {
        'pulse-green': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
export default config
