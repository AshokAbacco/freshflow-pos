/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    /*
     * Two scales, on purpose.
     *
     * Prose is locked to the original four sizes. `fontSize` replaces (not extends) Tailwind's
     * scale, so text-lg / text-xs do not exist and cannot drift back in.
     *
     * Money and weight get their own scale. At a counter the total and the change are read at
     * arm's length, by the cashier and by the customer standing opposite, so capping them at
     * 18px costs real seconds. These three sizes are for numerals only, never for prose.
     */
    fontSize: {
      h1: ["18px", { lineHeight: "24px", letterSpacing: "-0.012em" }],
      h2: ["16px", { lineHeight: "22px", letterSpacing: "-0.008em" }],
      body: ["14px", { lineHeight: "20px", letterSpacing: "-0.003em" }],
      desc: ["12px", { lineHeight: "16px" }],

      num: ["20px", { lineHeight: "24px", letterSpacing: "-0.02em" }],
      "num-lg": ["26px", { lineHeight: "30px", letterSpacing: "-0.022em" }],
      "num-xl": ["34px", { lineHeight: "36px", letterSpacing: "-0.025em" }],
    },
    extend: {
      screens: {
        "3xl": "1800px",
      },
      colors: {
        /*
         * One accent. Orange is the brand and the only "do this" colour.
         *
         * White on #FF7B29 is 2.59:1 and fails, so filled orange carries ink-coloured labels
         * (7.19:1) and orange *text* uses brand-700 (4.6:1) or brand-800 (6.7:1).
         */
        brand: {
          DEFAULT: "#FF7B29",
          50: "#FFF4EC",
          100: "#FFE6D5",
          200: "#FFC9A3",
          300: "#FFA768",
          500: "#FF7B29",
          600: "#EC6411",
          700: "#C2540F",
          800: "#9A4208",
          900: "#7A3406",
        },
        // Warm near-black, tuned to sit with the orange rather than a blue-grey slate.
        ink: {
          DEFAULT: "#17120E",
          soft: "#3D362F",
          muted: "#6B6259",
          faint: "#9A9087",
        },
        surface: {
          DEFAULT: "#FBF8F4", // app background
          sunk: "#F4EFE8", // wells, thumbnails, inactive tracks
          line: "#E7E0D7", // borders
        },
        /*
         * The green the public site is built on. #4CAF50 is a fill colour only: white on it is
         * 2.78:1, so anything carrying white text uses leaf-700 (5.13:1). Not used in the
         * register, where orange is the single accent.
         */
        leaf: {
          DEFAULT: "#4CAF50",
          50: "#E8F5E9",
          600: "#43A047",
          700: "#2E7D32",
          800: "#256628",
        },
        // Status only. Never used for chrome, so green no longer competes with the accent.
        stock: {
          ok: "#15803D",
          low: "#B45309",
          lowBg: "#FFF7ED",
          out: "#B42318",
          outBg: "#FEF3F2",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Text"',
          '"Inter"',
          '"Segoe UI"',
          "Roboto",
          '"Helvetica Neue"',
          "Arial",
          "sans-serif",
        ],
      },
      spacing: {
        // The smallest thing a finger is asked to hit.
        tap: "44px",
      },
      boxShadow: {
        // Shadows are reserved for things that genuinely float above the register.
        sheet: "0 -8px 40px rgba(23, 18, 14, 0.14)",
        modal: "0 24px 64px rgba(23, 18, 14, 0.22)",
        raised: "0 2px 8px rgba(23, 18, 14, 0.10)",
        // Kept so the pages outside the register (landing, pricing, reports) are unaffected.
        card: "0 1px 2px rgba(23, 18, 14, 0.04), 0 4px 16px rgba(23, 18, 14, 0.05)",
        lift: "0 12px 40px rgba(23, 18, 14, 0.12)",
        glass: "0 24px 64px rgba(23, 18, 14, 0.18)",
      },
      borderRadius: {
        "4xl": "2rem",
      },
      keyframes: {
        "sheet-in": {
          from: { transform: "translateY(16px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        pop: {
          "0%": { transform: "scale(1)" },
          "40%": { transform: "scale(1.18)" },
          "100%": { transform: "scale(1)" },
        },
        // Confirms an item landed on the bill without moving anything the eye is tracking.
        flash: {
          "0%": { backgroundColor: "#FFE6D5" },
          "100%": { backgroundColor: "transparent" },
        },
      },
      animation: {
        "sheet-in": "sheet-in 180ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        "fade-in": "fade-in 150ms ease-out",
        pop: "pop 220ms ease-out",
        flash: "flash 900ms ease-out",
      },
    },
  },
  plugins: [],
};
