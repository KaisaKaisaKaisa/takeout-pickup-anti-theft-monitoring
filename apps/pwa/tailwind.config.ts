import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#080B0D",
        charcoal: "#11171A",
        panel: "#151C20",
        sensor: "#38D5C8",
        danger: "#E64B3C",
        evidence: "#D89A3A",
        safe: "#67B26F",
        mist: "#F2F5F3",
        muted: "#9AA8A8",
      },
      fontFamily: {
        display: ["Instrument Serif", "Noto Serif SC", "Songti SC", "serif"],
        sans: ["Noto Sans SC", "Microsoft YaHei", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Cascadia Code", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
