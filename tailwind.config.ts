import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "page-mint": "var(--color-page-mint)",
        "page-mint-deep": "var(--color-page-mint-deep)",
        "app-surface": "var(--color-app-surface)",
        "panel-surface": "var(--color-panel-surface)",
        "card-surface": "var(--color-card-surface)",
        ink: "var(--color-ink)",
        "ink-soft": "var(--color-ink-soft)",
        "ink-muted": "var(--color-ink-muted)",
        line: "var(--color-line)",
        control: "var(--color-control)",
        coral: "var(--color-coral)",
        lavender: "var(--color-lavender)",
        butter: "var(--color-butter)",
        mint: "var(--color-mint)",
        sky: "var(--color-sky)",
        peach: "var(--color-peach)",
        yellow: "var(--color-yellow)",
        rose: "var(--color-rose)",
        teal: "var(--color-teal)",
        amber: "var(--color-amber)",
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
