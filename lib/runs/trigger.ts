import { headers } from "next/headers";

/**
 * Calling the run worker over HTTP.
 *
 * The worker lives behind a route handler rather than inside the Server Action
 * for one reason: a Server Action must finish before its response is sent, and
 * a scrape takes minutes. The route answers 202 immediately and does the work
 * in after(). This starts a run's FIRST leg; the legs after it go through
 * Vercel Queues (continue.ts), because a deployment that calls itself about
 * five times in a row is stopped by Vercel with 508 Loop Detected.
 *
 * The shared secret is what makes an internal endpoint internal -- the route
 * is under /api, which proxy.ts deliberately exempts from the login redirect.
 */

/**
 * The production domain, in production -- the one address Vercel's deployment
 * protection leaves open. The project protects everything except custom
 * domains, so a self-call to the deployment's own *.vercel.app URL (which is
 * the URL Vercel Cron calls) is answered 401 by Vercel's login wall before it
 * reaches this app. That is how the weekly schedule failed on 2026-10-05.
 * Vercel sets VERCEL_PROJECT_PRODUCTION_URL to the shortest custom domain.
 */
export function productionBaseUrl(): string | null {
  const domain = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return process.env.VERCEL_ENV === "production" && domain ? `https://${domain}` : null;
}

/**
 * Where to reach ourselves.
 *
 * In production, the production domain (productionBaseUrl). Everywhere else
 * THE REQUEST WE ARE ALREADY SERVING IS THE BEST ANSWER, and it is tried
 * first. A configured site URL goes stale the moment anything moves -- a dev
 * server that picks port 3002 because 3000 was busy, a preview deployment, a
 * new domain -- and the failure it produces ("fetch failed") says nothing
 * about the port being wrong. The incoming Host header cannot be stale,
 * because it is how the caller just reached us.
 *
 * `INTERNAL_BASE_URL` still wins where it is set, for the case where the
 * public host is not reachable from inside the runtime.
 */
export async function resolveBaseUrl(): Promise<string> {
  const override = process.env.INTERNAL_BASE_URL;
  if (override) return override.replace(/\/$/, "");

  const production = productionBaseUrl();
  if (production) return production;

  try {
    const headerList = await headers();
    const host = headerList.get("host");
    if (host) {
      const proto =
        headerList.get("x-forwarded-proto") ??
        (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
      return `${proto}://${host}`;
    }
  } catch {
    // No request context (a chained call from after()); fall through.
  }

  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/**
 * Ett internt POST-anrop till vår egen app (en route som svarar 202 och arbetar vidare i after()). Delas av
 * insamlingens körningar och av företagsprofilerna. Skyddas av INTERNAL_RUN_SECRET.
 */
export async function postInternal(path: string, body: unknown, baseUrl?: string): Promise<void> {
  const secret = process.env.INTERNAL_RUN_SECRET;
  if (!secret) {
    throw new Error("INTERNAL_RUN_SECRET saknas i miljön.");
  }

  const base = baseUrl ?? (await resolveBaseUrl());
  const url = `${base}${path}`;

  const headersToSend: Record<string, string> = {
    "content-type": "application/json",
    "x-internal-secret": secret,
  };

  // A protected preview deployment answers every request with a login page,
  // including its own. This header is how Vercel lets a deployment call itself.
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass) headersToSend["x-vercel-protection-bypass"] = bypass;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: headersToSend,
      body: JSON.stringify(body),
      // The route answers 202 as soon as the work is scheduled; waiting for
      // the work itself is exactly what this design avoids.
      cache: "no-store",
    });
  } catch (cause) {
    // Naming the URL is the whole point: "fetch failed" on its own sends the
    // reader looking at the scraper, when the answer is almost always that
    // this address is not where the app is actually listening.
    throw new Error(
      `Nådde inte ${url}: ${cause instanceof Error ? cause.message : "okänt fel"}`,
    );
  }

  if (!response.ok) {
    throw new Error(`Jobbet på ${url} svarade ${response.status}.`);
  }
}

export async function triggerExecute(
  runId: string,
  leaseToken: string | null,
  /** Explicit origin, used by the route handler so a self-chain keeps the host. */
  baseUrl?: string,
): Promise<void> {
  await postInternal(`/api/runs/${runId}/execute`, { leaseToken }, baseUrl);
}
