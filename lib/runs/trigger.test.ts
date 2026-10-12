import { afterEach, describe, expect, it, vi } from "vitest";

// next/headers only exists inside a request; the tests drive it directly.
const headerStore = { value: null as null | Record<string, string> };

vi.mock("next/headers", () => ({
  headers: async () => {
    if (!headerStore.value) throw new Error("no request context");
    const map = headerStore.value;
    return { get: (name: string) => map[name.toLowerCase()] ?? null };
  },
}));

const { resolveBaseUrl } = await import("./trigger");

const ENV_KEYS = ["INTERNAL_BASE_URL", "NEXT_PUBLIC_SITE_URL", "VERCEL_URL"] as const;

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
}

afterEach(() => {
  headerStore.value = null;
  setEnv({});
});

describe("resolveBaseUrl", () => {
  it("uses the host of the request being served, not the configured site url", async () => {
    // THE REGRESSION THIS GUARDS: the dev server takes port 3002 because 3000
    // is busy, NEXT_PUBLIC_SITE_URL still says 3000, and every run dies with
    // "fetch failed" -- a message that says nothing about a port.
    headerStore.value = { host: "localhost:3002" };
    setEnv({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000" });
    expect(await resolveBaseUrl()).toBe("http://localhost:3002");
  });

  it("honours an explicit override above everything", async () => {
    headerStore.value = { host: "localhost:3002" };
    setEnv({ INTERNAL_BASE_URL: "http://127.0.0.1:9999/", NEXT_PUBLIC_SITE_URL: "http://x" });
    expect(await resolveBaseUrl()).toBe("http://127.0.0.1:9999");
  });

  it("trusts the proxy's protocol header when there is one", async () => {
    headerStore.value = { host: "scraping.vercel.app", "x-forwarded-proto": "https" };
    expect(await resolveBaseUrl()).toBe("https://scraping.vercel.app");
  });

  it("assumes https for a real host and http for localhost", async () => {
    headerStore.value = { host: "scraping.vercel.app" };
    expect(await resolveBaseUrl()).toBe("https://scraping.vercel.app");

    headerStore.value = { host: "127.0.0.1:3000" };
    expect(await resolveBaseUrl()).toBe("http://127.0.0.1:3000");
  });

  it("falls back to configuration when there is no request context", async () => {
    headerStore.value = null;
    setEnv({ NEXT_PUBLIC_SITE_URL: "https://scraping.example/" });
    expect(await resolveBaseUrl()).toBe("https://scraping.example");
  });

  it("falls back to the Vercel deployment url, then to localhost", async () => {
    headerStore.value = null;
    setEnv({ VERCEL_URL: "scraping-abc.vercel.app" });
    expect(await resolveBaseUrl()).toBe("https://scraping-abc.vercel.app");

    setEnv({});
    expect(await resolveBaseUrl()).toBe("http://localhost:3000");
  });
});
