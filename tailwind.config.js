/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx,js,jsx}',
    './components/**/*.{ts,tsx,js,jsx}',
    './app/**/*.{ts,tsx,js,jsx}',
    './src/**/*.{ts,tsx,js,jsx}',
    './lib/**/*.{ts,tsx,js,jsx}',
      "*.{js,ts,jsx,tsx,mdx}"
],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ['var(--font-bein)', 'sans-serif'],
        heading: ['var(--font-bein)', 'sans-serif'],
      },
      colors: {
        // Workspace palette; values live in app/globals.css under .esf-ws.
        ws: {
          paper: 'var(--ws-paper)',
          raised: 'var(--ws-raised)',
          sunk: 'var(--ws-sunk)',
          ink: 'var(--ws-ink)',
          soft: 'var(--ws-soft)',
          muted: 'var(--ws-muted)',
          rule: 'var(--ws-rule)',
          asphalt: 'var(--ws-asphalt)',
          'asphalt-ink': 'var(--ws-asphalt-ink)',
          'asphalt-muted': 'var(--ws-asphalt-muted)',
          red: 'var(--ws-red)',
          'red-wash': 'var(--ws-red-wash)',
          ok: 'var(--ws-ok)',
          'ok-wash': 'var(--ws-ok-wash)',
          wait: 'var(--ws-wait)',
          'wait-wash': 'var(--ws-wait-wash)',
          stop: 'var(--ws-stop)',
          'stop-wash': 'var(--ws-stop-wash)',
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
