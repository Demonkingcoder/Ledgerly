/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { ink: '#18322c', forest: '#1c5446', leaf: '#d7f36b', canvas: '#f5f6f2', line: '#e5e9e2' },
      fontFamily: { sans: ['Inter', 'Segoe UI', 'sans-serif'], display: ['Manrope', 'Inter', 'sans-serif'] },
      boxShadow: { panel: '0 8px 28px rgba(21, 46, 37, .045)' },
    },
  },
  plugins: [],
};
