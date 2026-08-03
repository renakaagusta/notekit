/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  safelist: ["animate-orbit", "animate-ripple"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#ffffff",
          dark: "#e4e4e7",
          darker: "#a1a1aa",
          light: "#f4f4f5",
          lighter: "#fafafa",
        },
        success: {
          DEFAULT: "#16A34A",
          dark: "#15803D",
          light: "#10B981",
        },
        surface: {
          primary: "#050505",
          secondary: "#111318",
          tertiary: "#1A1C24",
        },
        border: "#1F2937",
      },
      fontFamily: {
        heading: ["Space Grotesk", "sans-serif"],
        body: ["DM Sans", "sans-serif"],
      },
      boxShadow: {
        sm: "0 1px 2px rgba(0,0,0,0.05)",
        md: "0 2px 4px rgba(0,0,0,0.1)",
        lg: "0 4px 8px rgba(0,0,0,0.12)",
        xl: "0 8px 16px rgba(0,0,0,0.15)",
        "2xl": "0 12px 24px rgba(0,0,0,0.18)",
        "3xl": "0 16px 32px rgba(0,0,0,0.2)",
        glow: "0 4px 14px rgba(255,255,255,0.15)",
        "glow-lg": "0 8px 24px rgba(255,255,255,0.2)",
        "green-glow": "0 4px 14px rgba(22,163,74,0.3)",
      },
      animation: {
        float: "float 6s ease-in-out infinite",
        "float-slow": "float 8s ease-in-out infinite",
        "float-fast": "float 4s ease-in-out infinite",
        "pulse-glow": "pulseGlow 2s ease-in-out infinite",
        "spin-slow": "spin 20s linear infinite",
        "fade-in": "fadeIn 0.5s ease-out",
        "slide-up": "slideUp 0.6s ease-out",
        "scale-in": "scaleIn 0.4s ease-out",
        orbit: "orbit calc(var(--duration)*1s) linear infinite",
        ripple: "ripple var(--duration,2s) ease calc(var(--i, 0)*.2s) infinite",
        marquee: "marquee var(--duration) linear infinite",
        "marquee-vertical": "marquee-vertical var(--duration) linear infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px) rotate(0deg)" },
          "50%": { transform: "translateY(-20px) rotate(3deg)" },
        },
        pulseGlow: {
          "0%, 100%": {
            opacity: "1",
            boxShadow: "0 0 20px rgba(255,255,255,0.3)",
          },
          "50%": { opacity: "0.8", boxShadow: "0 0 40px rgba(255,255,255,0.5)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(30px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.9)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        orbit: {
          "0%": {
            transform: "rotate(calc(var(--angle) * 1deg)) translateY(calc(var(--radius) * 1px)) rotate(calc(var(--angle) * -1deg))",
          },
          "100%": {
            transform: "rotate(calc(var(--angle) * 1deg + 360deg)) translateY(calc(var(--radius) * 1px)) rotate(calc((var(--angle) * -1deg) - 360deg))",
          },
        },
        ripple: {
          "0%, 100%": {
            transform: "translate(-50%, -50%) scale(1)",
          },
          "50%": {
            transform: "translate(-50%, -50%) scale(0.9)",
          },
        },
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(calc(-100% - var(--gap)))" },
        },
        "marquee-vertical": {
          from: { transform: "translateY(0)" },
          to: { transform: "translateY(calc(-100% - var(--gap)))" },
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "hero-glow":
          "radial-gradient(ellipse at center, rgba(255,255,255,0.05) 0%, transparent 70%)",
        "card-gradient":
          "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 100%)",
        "btn-gradient": "linear-gradient(-69deg, #3f3f46 0%, #52525b 100%)",
      },
    },
  },
  plugins: [],
};
