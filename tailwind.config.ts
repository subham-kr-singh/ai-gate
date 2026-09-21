import type { Config } from "tailwindcss";

// Tokens copied 1:1 from design.md ("GATE AI — Design System, canonical
// per dashboard-demo-v3.html"). Do not invent ad-hoc hex values in
// component code — extend this file and back-fill design.md instead.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: "#F8F6F2",
        ink: "#111111",
        "ink-soft": "#222222",
        "body-muted": "#3a3a3a",
        slate: "#77736D",
        "slate-light": "#9B968E",
        line: "#E3E0DA",
        control: "#ECE9E3",
        teal: "#0E8074",
        amber: "#D98E2B",
        butter: "#F4DEB4",
        sky: "#C7E3F5",
        lavender: "#D0CCF4",
        coral: "#F4C1C4",
        mint: "#BDEBD9",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "20px",
        hero: "24px",
      },
      keyframes: {
        fillbar: { from: { width: "0%" } },
      },
      animation: {
        "fill-w": "fillbar 900ms cubic-bezier(0.22,1,0.36,1) forwards",
      },
    },
  },
  plugins: [],
};

export default config;
