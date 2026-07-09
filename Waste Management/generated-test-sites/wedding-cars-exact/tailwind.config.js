/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        serif: ["Playfair Display", "ui-serif", "Georgia", "serif"],
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      colors: {
        brandGold: "#b79a55",
        brandDark: "#121417",
        brandMustard: "#c8ad67",
        pageBg: "#f6f3ef"
      },
      boxShadow: {
        soft: "0 14px 34px rgba(15, 15, 15, 0.10)"
      },
      borderRadius: {
        xl2: "1.15rem"
      }
    }
  },
  plugins: []
};
