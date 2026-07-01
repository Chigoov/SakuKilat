/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        sk: {
          bg: 'var(--sk-bg)',
          surface: 'var(--sk-surface)',
          'surface-2': 'var(--sk-surface-2)',
          'surface-3': 'var(--sk-surface-3)',
          border: 'var(--sk-border)',
          'border-2': 'var(--sk-border-2)',
          text: 'var(--sk-text)',
          'text-muted': 'var(--sk-text-muted)',
          'text-dim': 'var(--sk-text-dim)',
          cyan: 'var(--sk-cyan)',
          'cyan-dim': 'var(--sk-cyan-dim)',
          'cyan-glow': 'var(--sk-cyan-glow)',
          green: 'var(--sk-green)',
          'green-dim': 'var(--sk-green-dim)',
          red: 'var(--sk-red)',
          'red-dim': 'var(--sk-red-dim)',
          amber: 'var(--sk-amber)',
          'amber-dim': 'var(--sk-amber-dim)',
        },
      },
      animation: {
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};