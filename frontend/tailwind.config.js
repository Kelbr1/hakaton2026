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
        background: "#080914",
        card: "#121526",
        "card-hover": "#171c32",
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
        glow: "0 0 30px -10px rgba(10, 132, 255, 0.45)",
        "glass-sm": "0 4px 24px -1px rgba(0, 0, 0, 0.4)",
        "liquid-card": "0 20px 50px -12px rgba(0, 0, 0, 0.5), inset 0 1px 1px 0 rgba(255, 255, 255, 0.18)",
        "liquid-card-light": "0 20px 45px -12px rgba(30, 45, 90, 0.08), inset 0 1px 1px 0 rgba(255, 255, 255, 0.9)",
        "liquid-glow": "0 0 35px -5px rgba(56, 189, 248, 0.35), 0 0 15px -2px rgba(99, 102, 241, 0.25)",
        "liquid-btn": "0 8px 24px -4px rgba(37, 99, 235, 0.4), inset 0 1px 1px 0 rgba(255, 255, 255, 0.45)",
      },
      backdropBlur: {
        "2xl": "40px",
        "3xl": "64px",
      },
      animation: {
        "liquid-float-1": "liquidFloat1 20s ease-in-out infinite alternate",
        "liquid-float-2": "liquidFloat2 25s ease-in-out infinite alternate",
        "liquid-float-3": "liquidFloat3 18s ease-in-out infinite alternate",
        "liquid-pulse": "liquidPulse 8s ease-in-out infinite alternate",
      },
      keyframes: {
        liquidFloat1: {
          "0%": { transform: "translate(0px, 0px) scale(1)" },
          "50%": { transform: "translate(60px, 40px) scale(1.12)" },
          "100%": { transform: "translate(-30px, 70px) scale(0.95)" },
        },
        liquidFloat2: {
          "0%": { transform: "translate(0px, 0px) scale(1)" },
          "50%": { transform: "translate(-50px, -35px) scale(1.08)" },
          "100%": { transform: "translate(40px, -50px) scale(0.92)" },
        },
        liquidFloat3: {
          "0%": { transform: "translate(0px, 0px) scale(0.96)" },
          "50%": { transform: "translate(40px, -45px) scale(1.15)" },
          "100%": { transform: "translate(-50px, 30px) scale(1)" },
        },
        liquidPulse: {
          "0%": { opacity: "0.45", transform: "scale(1)" },
          "50%": { opacity: "0.75", transform: "scale(1.05)" },
          "100%": { opacity: "0.45", transform: "scale(1)" },
        },
      },
    },
  },
  plugins: [],
}
