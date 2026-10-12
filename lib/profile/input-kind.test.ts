import { describe, expect, it } from "vitest";
import { kindOf } from "./input-kind";

describe("kindOf", () => {
  it("tells org.nr, web addresses and names apart", () => {
    expect(kindOf("556677-8899")).toBe("orgnr");
    expect(kindOf("5566778899")).toBe("orgnr");
    expect(kindOf("ikea.se")).toBe("url");
    expect(kindOf("https://www.ikea.se/sv/")).toBe("url");
    expect(kindOf("Gullbergs Lyft & Entreprenad")).toBe("name");
    expect(kindOf("Bygg AB. Malmö")).toBe("name");
  });
  it("gives nothing for empty or very short text", () => {
    expect(kindOf("")).toBeNull();
    expect(kindOf("  ")).toBeNull();
    expect(kindOf("ab")).toBeNull();
  });
});
