import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#f7f7fb",
        surface: "#ffffff",
        text: "#14151f",
        accent: {
          DEFAULT: "#6c5cd6",
          100: "#f4f2fe",
          200: "#e7e2fc",
          300: "#cec4f8",
          400: "#ab9af1",
          500: "#8a76e8",
          600: "#6c5cd6",
          700: "#5646b0",
          800: "#3a3178",
          900: "#241f4d",
        },
        neutral: {
          100: "#f6f7fb",
          200: "#eceef5",
          300: "#dbdee9",
          400: "#b9bdcd",
          500: "#9296a8",
          600: "#6f7386",
          700: "#4e5165",
          800: "#33344a",
          900: "#1c1d2e",
        },
        divider: "rgba(20, 21, 31, 0.09)",
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
        sm: "0 1px 2px rgba(20,21,31,0.06), 0 0 0 1px rgba(20,21,31,0.05)",
        md: "0 4px 14px rgba(20,21,31,0.08), 0 0 0 1px rgba(20,21,31,0.06)",
        lg: "0 16px 40px rgba(20,21,31,0.12), 0 0 0 1px rgba(20,21,31,0.07)",
        "glow-sm": "0 0 20px -4px rgba(108, 92, 214, 0.35)",
        "glow-md": "0 0 32px -6px rgba(108, 92, 214, 0.4)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
