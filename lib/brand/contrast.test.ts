import { describe, expect, it } from "vitest";
import tokens from "@/brand/tokens.cjs";
import { AA_TEXT, AA_UI, contrast } from "./contrast";

const c = tokens.colors;
const { accent, gray } = c;
const SURFACES = { surface: c.surface, canvas: c.canvas, "accent-tint": accent.tint, "accent-wash": accent.wash, "gray-50": gray[50], "gray-100": gray[100] };

describe("brand contrast", () => {
  it("keeps ink readable on every surface and on the orange", () => {
    for (const [name, bg] of Object.entries({ ...SURFACES, accent: accent.DEFAULT, "accent-hover": accent.hover })) {
      expect(contrast(c.ink, bg), `ink on ${name}`).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });
  it("keeps white readable on ink", () => {
    expect(contrast("#FFFFFF", c.ink)).toBeGreaterThanOrEqual(AA_TEXT);
  });
  it("keeps secondary text readable on every surface", () => {
    for (const [name, bg] of Object.entries(SURFACES)) {
      for (const [fg, hex] of Object.entries({ muted: c.muted, "accent-text": accent.text, "gray-500": gray[500], "gray-600": gray[600], "gray-700": gray[700] })) {
        expect(contrast(hex, bg), `${fg} on ${name}`).toBeGreaterThanOrEqual(AA_TEXT);
      }
    }
  });
  it("keeps the orange visible as a graphic on dark, and the faint gray usable for icons and hints", () => {
    expect(contrast(accent.DEFAULT, c.ink)).toBeGreaterThanOrEqual(AA_UI);
    expect(contrast(gray[400], c.surface)).toBeGreaterThanOrEqual(AA_UI);
    expect(contrast(c.success, c.surface)).toBeGreaterThanOrEqual(AA_UI);
    expect(contrast(c.danger, c.surface)).toBeGreaterThanOrEqual(AA_UI);
  });
  it("documents that white text on the orange does not pass, which is why orange fills carry ink text", () => {
    expect(contrast("#FFFFFF", accent.DEFAULT)).toBeLessThan(AA_TEXT);
  });
});
