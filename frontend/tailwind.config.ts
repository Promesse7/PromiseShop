import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#161826",
        surface: "#232532",
        text: "#e9e9ed",
        accent: {
          DEFAULT: "#9184d9",
          100: "#f5f4ff",
          200: "#e7e5fe",
          300: "#d2cefd",
          400: "#b5abfc",
          500: "#968ae0",
          600: "#796cbf",
          700: "#5d5294",
          800: "#423a6a",
          900: "#2b2741",
        },
        accent2: {
          DEFAULT: "#a7a1db",
          100: "#f5f4ff",
          200: "#e7e5fe",
          300: "#d2cefd",
          400: "#b5afe8",
          500: "#9690c9",
          600: "#7972a9",
          700: "#5c5783",
          800: "#423e5d",
          900: "#2b293a",
        },
        neutral: {
          100: "#f3f5fe",
          200: "#e4e7f5",
          300: "#cfd3e5",
          400: "#b2b6ca",
          500: "#9397ab",
          600: "#75798c",
          700: "#595d6c",
          800: "#3f424d",
          900: "#292b31",
        },
        section: "#262a60",
        sectionGlow: "#353b80",
        sectionGhost: "#4c5397",
        divider: "rgba(233, 233, 237, 0.16)",
      },
      spacing: {
        "1": "2.8px",
        "2": "5.6px",
        "3": "8.4px",
        "4": "11.2px",
        "6": "16.8px",
        "8": "22.4px",
      },
      borderRadius: {
        sm: "4px",
        md: "8px",
        lg: "14px",
      },
      boxShadow: {
        sm: "0 0 0 1px #3f424d",
        md: "0 0 0 1px #595d6c, 0 6px 18px rgba(0,0,0,0.55)",
        lg: "0 0 0 1px #9397ab, 0 16px 40px rgba(0,0,0,0.65)",
        "glow-sm": "0 0 20px -4px rgba(145, 132, 217, 0.35)",
        "glow-md": "0 0 32px -6px rgba(145, 132, 217, 0.45)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
