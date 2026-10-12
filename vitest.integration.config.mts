import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integrationstester mot den riktiga databasen (PROSPEX_DATABASE_URL). Kör med:
//   set -a; . ./.env.local; set +a; npx vitest run --config vitest.integration.config.mts
// De skapar egna testbolag och testanvändare och städar efter sig.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: { environment: "node", include: ["lib/**/*.itest.ts"], env: { TZ: "Europe/Stockholm" }, testTimeout: 30_000, fileParallelism: false },
});
