import { describe, expect, it } from "vitest";
import { readCapped } from "./site";

// En sida i bitar om 100 kB, med en sidfot sist.
const page = (kb: number) => {
  const chunk = new TextEncoder().encode("x".repeat(100_000));
  const footer = new TextEncoder().encode("<footer>Hemsida av Byrån</footer>");
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      if (i < kb / 100) {
        i++;
        c.enqueue(chunk);
      } else {
        c.enqueue(footer);
        c.close();
      }
    },
  });
  return new Response(body);
};

describe("readCapped", () => {
  it("stops at 512 kB by default, so the end of a large page is lost", async () => {
    const html = await readCapped(page(700));
    expect(html!.length).toBeLessThan(700_000);
    expect(html).not.toContain("<footer>");
  });
  it("reads a large page to the end with a higher cap", async () => {
    expect(await readCapped(page(700), 2_000_000)).toContain("<footer>Hemsida av Byrån</footer>");
  });
});
