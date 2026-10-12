import { Pool } from "pg";

// Server-only. Läser direkt mot prospex-databasen; RLS har inga policies än.
const g = globalThis as unknown as { __pxPool?: Pool };

export const pool =
  g.__pxPool ??
  (g.__pxPool = new Pool({
    connectionString: process.env.PROSPEX_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 3,
  }));
