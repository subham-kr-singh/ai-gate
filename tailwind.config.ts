import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Drafting Table palette — see DESIGN_SYSTEM.md
        ink: "var(--color-ink)",
        panel: "var(--color-panel)",
        slate: "var(--color-slate)",
        fog: "var(--color-fog)",
        teal: {
          DEFAULT: "var(--color-teal)",
          soft: "var(--color-teal-soft)",
        },
        amber: {
          DEFAULT: "var(--color-amber)",
          soft: "var(--color-amber-soft)",
        },
        paper: "var(--color-paper)",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        control: "var(--radius-control)",
        ring: "var(--radius-ring)",
        none: "0px",
      },
      boxShadow: {
        overlay: "var(--shadow-overlay)",
        none: "none",
      },
      maxWidth: {
        prose: "72ch",
      },
      keyframes: {
        "ring-fill": {
          from: { strokeDashoffset: "var(--ring-circumference)" },
          to: { strokeDashoffset: "var(--ring-offset)" },
        },
      },
      animation: {
        "ring-fill": "ring-fill 900ms cubic-bezier(0.22, 1, 0.36, 1) forwards",
      },
    },
  },
  plugins: [],
};

export default config;
