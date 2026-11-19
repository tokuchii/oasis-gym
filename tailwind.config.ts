import type { Config } from 'tailwindcss'

export default {
  content: [
    './components/**/*.{js,vue,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './plugins/**/*.{js,ts}',
    './app.vue',
  ],
  theme: {
    extend: {
      colors: {
        onyx: 'rgb(var(--onyx) / <alpha-value>)',
        obsidian: 'rgb(var(--obsidian) / <alpha-value>)',
        graphite: 'rgb(var(--graphite) / <alpha-value>)',
        gold: {
          DEFAULT: 'rgb(var(--gold) / <alpha-value>)',
          light: 'rgb(var(--gold-light) / <alpha-value>)',
        },
        cream: 'rgb(var(--cream) / <alpha-value>)',
        mist: 'rgb(var(--mist) / <alpha-value>)',
        iron: 'rgb(var(--iron) / <alpha-value>)',
        input: 'rgb(var(--input) / <alpha-value>)',
        scrim: 'rgb(var(--scrim) / <alpha-value>)',
        red: {
          300: 'rgb(var(--red-300) / <alpha-value>)',
          400: 'rgb(var(--red-400) / <alpha-value>)',
          500: 'rgb(var(--red-500) / <alpha-value>)',
          700: 'rgb(var(--red-700) / <alpha-value>)',
          900: 'rgb(var(--red-900) / <alpha-value>)',
        },
        green: {
          300: 'rgb(var(--green-300) / <alpha-value>)',
          400: 'rgb(var(--green-400) / <alpha-value>)',
          500: 'rgb(var(--green-500) / <alpha-value>)',
          700: 'rgb(var(--green-700) / <alpha-value>)',
          900: 'rgb(var(--green-900) / <alpha-value>)',
        },
        orange: {
          400: 'rgb(var(--orange-400) / <alpha-value>)',
        },
        yellow: {
          400: 'rgb(var(--yellow-400) / <alpha-value>)',
          500: 'rgb(var(--yellow-500) / <alpha-value>)',
        },
        purple: {
          400: 'rgb(var(--purple-400) / <alpha-value>)',
        },
        blue: {
          400: 'rgb(var(--blue-400) / <alpha-value>)',
          500: 'rgb(var(--blue-500) / <alpha-value>)',
        },
        sky: {
          300: 'rgb(var(--sky-300) / <alpha-value>)',
          400: 'rgb(var(--sky-400) / <alpha-value>)',
        },
      },
      fontFamily: {
        display: ['"Bebas Neue"', 'sans-serif'],
        body: ['Outfit', 'sans-serif'],
      },
      boxShadow: {
        theme: '0 12px 40px rgb(var(--shadow) / var(--shadow-alpha))',
      },
      dropShadow: {
        theme: '0 4px 6px rgb(var(--shadow) / var(--shadow-alpha))',
      },
      animation: {
        marquee: 'marquee 30s linear infinite',
        'marquee-reverse': 'marquee-reverse 30s linear infinite',
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'marquee-reverse': {
          '0%': { transform: 'translateX(-50%)' },
          '100%': { transform: 'translateX(0%)' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config
