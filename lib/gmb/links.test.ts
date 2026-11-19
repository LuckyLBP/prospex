import { describe, expect, it } from "vitest";
import { googleMapsSearchUrl } from "./links";

describe("googleMapsSearchUrl", () => {
  it("encodes the query for a Google Maps search link", () => {
    expect(googleMapsSearchUrl("Täby Bygg & Måleri AB")).toBe("https://www.google.com/maps/search/?api=1&query=T%C3%A4by%20Bygg%20%26%20M%C3%A5leri%20AB");
    expect(googleMapsSearchUrl("  Rörhjälpen ")).toContain("query=R%C3%B6rhj%C3%A4lpen");
  });
});
