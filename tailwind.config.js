const defaultTheme = require("tailwindcss/defaultTheme");
const tokens = require("./brand/tokens.cjs");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: tokens.colors,
      borderRadius: tokens.radius,
      boxShadow: tokens.shadow,
      fontFamily: { sans: ["var(--font-geist)", ...defaultTheme.fontFamily.sans] },
    },
  },
  plugins: [],
};
