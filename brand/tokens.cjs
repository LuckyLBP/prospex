// Prospex färger och mått. En enda sanning: tailwind.config.js bygger sina klasser av den här filen (bg-ink, text-muted,
// bg-accent-tint, ...), brand/geometry.mjs har logotypens färger och /admin/varumarke visar allt härifrån.
// Ändra en färg här och hela appen följer med. Kontrasten kontrolleras av lib/brand/contrast.test.ts.

const colors = {
  ink: "#0E1116",
  accent: {
    DEFAULT: "#FF6A1A", // varumärkets orange: ytor, signaler, markeringar. Text på den är ink, aldrig vit.
    hover: "#E5530A", // tryckt eller överfarit läge
    tint: "#FFEDE0", // mjuk bakgrund, till exempel piller
    wash: "#FFF6F0", // den ljusaste varma ytan
    text: "#B8420A", // orange text på ljus bakgrund (klarar kontrastkravet)
  },
  canvas: "#F5F4F0", // sidans bakgrund och mjuka ytor
  surface: "#FFFFFF", // kort
  line: "#E7E5DF", // linjer och kanter
  muted: "#5B6068", // sekundär text
  success: "#12A26B",
  warning: "#E9A100",
  danger: "#E5484D",
  // Varma neutraler som ersätter Tailwinds kallare grå, så att alla gray-klasser i appen följer varumärket.
  gray: {
    50: "#FAF9F7",
    100: "#F3F2EE",
    200: "#E7E5DF",
    300: "#D5D3CC",
    400: "#8B9098",
    500: "#656A72",
    600: "#5B6068",
    700: "#474B53",
    800: "#2B2F36",
    900: "#15181E",
  },
};

const radius = { card: "24px", sheet: "28px" };

// En enda lätt skugga: en hårfin ring och en mjuk skugga under. Mer djup än så behövs inte.
const shadow = {
  soft: "0 0 0 1px rgb(14 17 22 / 0.04), 0 1px 2px rgb(14 17 22 / 0.06)",
  lift: "0 0 0 1px rgb(14 17 22 / 0.05), 0 8px 24px -8px rgb(14 17 22 / 0.18)",
  pop: "0 24px 60px -12px rgb(14 17 22 / 0.35)",
};

module.exports = { colors, radius, shadow };
