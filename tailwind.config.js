/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#020c1b', // Deep Navy
        primary: '#64ffda', // Electric Green/Cyan (United Nodes style often uses this or Blue)
        secondary: '#00f3ff', // Electric Blue
        accent: '#bd34fe', // Glowing Purple
        text: '#cbd5e1', // Slate 300
        'card-bg': '#112240', // Light Navy
      },
      fontFamily: {
        sans: ['Segoe UI', 'system-ui', 'sans-serif'],
        display: ['Trebuchet MS', 'Segoe UI', 'sans-serif'],
      },
      animation: {
        'spin-slow': 'spin 20s linear infinite',
        'pulse-glow': 'pulseGlow 2s infinite',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 10px #00f3ff, 0 0 20px #00f3ff' },
          '50%': { boxShadow: '0 0 20px #00f3ff, 0 0 40px #00f3ff' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-20px)' },
        }
      }
    },
  },
  plugins: [],
}
