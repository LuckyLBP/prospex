import { after } from "next/server";
import { internalSecretMatches } from "@/lib/internal-secret";
import { buildProfile } from "@/lib/profile/build";

/**
 * Bygget av en företagsprofil. Svarar 202 och arbetar i after(), på samma sätt som insamlingens körningar
 * (app/api/runs/[id]/execute). Skyddas av INTERNAL_RUN_SECRET. maxDuration är plattformens tak, och bygget har en
 * egen gräns på 240 sekunder under det.
 */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!internalSecretMatches(request.headers.get("x-internal-secret"))) return new Response(null, { status: 401 });

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { orgnr?: string | null };

  after(async () => {
    try {
      await buildProfile(id, { orgnr: typeof body.orgnr === "string" ? body.orgnr : null });
    } catch (cause) {
      console.error(`[profil ${id}] bygget kunde inte köras`, cause);
    }
  });

  return new Response(null, { status: 202 });
}
