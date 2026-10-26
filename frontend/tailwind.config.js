/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "#09090B",
        card: "#121215",
        "card-hover": "#18181C",
        "pro-blue": "#0A84FF",
        "pro-indigo": "#5E5CE6",
        "pro-emerald": "#30D158",
        "pro-amber": "#FFD60A",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Inter",
          "SF Pro Text",
          "Segoe UI",
          "sans-serif",
        ],
        mono: [
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "Liberation Mono",
          "Courier New",
          "monospace",
        ],
      },
      boxShadow: {
        glow: "0 0 30px -10px rgba(10, 132, 255, 0.35)",
        "glass-sm": "0 4px 24px -1px rgba(0, 0, 0, 0.5)",
      },
      backdropBlur: {
        "2xl": "40px",
        "3xl": "64px",
      },
    },
  },
  plugins: [],
}
