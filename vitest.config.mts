import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Bara ren logik i lib/ testas: inga komponenter, ingen databas, inget nätverk.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    // "Idag" räknas i svenska dygn, så testerna ska betyda samma sak överallt.
    env: { TZ: "Europe/Stockholm" },
  },
});
