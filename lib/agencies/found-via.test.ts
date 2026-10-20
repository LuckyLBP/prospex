import { describe, expect, it } from "vitest";
import { foundViaServer } from "./found-via";

describe("foundViaServer", () => {
  it("reads what a server-found agency saved", () => {
    expect(foundViaServer({ agencyName: "Sitea", foundVia: "server", serverIp: "81.2.3.4", serverSites: 132 })).toEqual({ ip: "81.2.3.4", sites: 132 });
  });
  it("is null for any other source", () => {
    expect(foundViaServer({ agencyName: "Capace", domain: "capace.se" })).toBeNull();
    expect(foundViaServer(null)).toBeNull();
    expect(foundViaServer("x")).toBeNull();
    expect(foundViaServer({ foundVia: "server" })).toBeNull();
  });
});
