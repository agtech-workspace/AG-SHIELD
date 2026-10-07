/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#14146E',
          light: '#2C2CB4',
        },
        'brand-navy': '#14146E',
        'brand-gold': '#C9A84C',
        'brand-teal': '#0AAA96',
        'brand-deep': '#080830',
        'brand-cloud': '#F7F8FC',
        'brand-slate': '#6B7B9A',
        'slate-blue': '#2563EB',
        green: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#148214',
          600: '#148214',
          700: '#0F630F',
          800: '#166534',
          900: '#14532d',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Montserrat', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        lg: '6px',
        '2xl': '12px',
      },
    },
  },
  plugins: [],
}
