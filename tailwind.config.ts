import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "Inter", "system-ui", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        // Brend ranglari
        navy: { DEFAULT: "#0F1E3A", 700: "#1B2D52", 900: "#0A1528" },
        cyan: { DEFAULT: "#5ED3EE", light: "#8BE0F3", ink: "#0B7A8A", 100: "#E3F7FC" },
        sand: "#EAF0F6",
        surface2: "#F3F6FA",
        line: { DEFAULT: "#DDE3EC", soft: "#E8EDF3" },
        "muted-dark": "#9FB0C8",
        "nav-text": "#C9D3E3",
      },
      borderRadius: { xl: "20px", "2xl": "24px", lg: "var(--radius)", md: "10px", sm: "8px" },
      boxShadow: {
        sm: "0 1px 2px rgba(15, 30, 58, .05), 0 2px 8px rgba(15, 30, 58, .05)",
        md: "0 2px 4px rgba(15, 30, 58, .06), 0 8px 24px rgba(15, 30, 58, .08)",
      },
    },
  },
  plugins: [],
};
export default config;
