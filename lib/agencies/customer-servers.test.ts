import { describe, expect, it, vi } from "vitest";
import { customerServerHits, groupByServer, isRegistrable, MAX_CUSTOMER_SERVERS, type CustomerServerDeps } from "./customer-servers";

const ctx = { signal: new AbortController().signal, log: () => {} };

describe("groupByServer", () => {
  it("groups customers per IP, biggest first, and drops servers with a single customer", () => {
    const g = groupByServer(new Map([["a.se", "1.1.1.1"], ["b.se", "2.2.2.2"], ["c.se", "1.1.1.1"], ["d.se", "1.1.1.1"], ["e.se", "2.2.2.2"], ["f.se", "3.3.3.3"]]));
    expect(g).toEqual([{ ip: "1.1.1.1", customers: ["a.se", "c.se", "d.se"] }, { ip: "2.2.2.2", customers: ["b.se", "e.se"] }]);
  });
});

describe("isRegistrable", () => {
  it("keeps kund.se and drops subdomains", () => {
    expect(isRegistrable("kund.se")).toBe(true);
    expect(isRegistrable("test.kund.se")).toBe(false);
  });
});

function deps(ips: Record<string, string>, lists: Record<string, string[]>): CustomerServerDeps & { reverseIp: ReturnType<typeof vi.fn> } {
  return {
    resolve4: vi.fn(async (h: string) => { const ip = ips[h.replace(/^www\./, "")]; if (!ip) throw new Error("ENOTFOUND"); return [ip]; }),
    reverseIp: vi.fn(async (ip: string) => ({ domains: lists[ip] ?? [], source: "hackertarget" as const })),
  } as never;
}

describe("customerServerHits", () => {
  const ips = { "k1.se": "91.201.60.108", "k2.se": "91.201.60.108", "k3.se": "93.188.2.52" };
  it("looks up a server that holds two customers and suggests the other registrable sites there", async () => {
    const d = deps(ips, { "91.201.60.108": ["k1.se", "ny1.se", "www.ny2.se", "sub.ny3.se", "agency.se", "blogg.agency.se", "ny1.se"] });
    const hits = await customerServerHits("agency.se", ["k1.se", "k2.se", "k3.se"], ctx, d);
    expect(hits.map((h) => h.domain)).toEqual(["ny1.se", "ny2.se"]);
    expect(hits[0].server).toEqual({ ip: "91.201.60.108", size: 7 });
    expect(d.reverseIp).toHaveBeenCalledTimes(1); // k3 sits alone on its server
  });
  it("skips known cloud hosts and customers that do not resolve, and caps the number of servers", async () => {
    const many: Record<string, string> = {};
    const lists: Record<string, string[]> = {};
    const customers: string[] = [];
    for (let s = 1; s <= MAX_CUSTOMER_SERVERS + 2; s++) for (const n of [1, 2]) { const c = `k${s}x${n}.se`; many[c] = `10.20.${s}.1`; customers.push(c); lists[`10.20.${s}.1`] = [`ny${s}.se`]; }
    customers.push("gone.se");
    const d = deps(many, lists);
    await customerServerHits("agency.se", customers, ctx, d);
    expect(d.reverseIp).toHaveBeenCalledTimes(MAX_CUSTOMER_SERVERS);
  });
  it("does nothing when no server holds two customers", async () => {
    const d = deps({ "a.se": "1.1.1.1", "b.se": "2.2.2.2" }, {});
    expect(await customerServerHits("agency.se", ["a.se", "b.se"], ctx, d)).toEqual([]);
    expect(d.reverseIp).not.toHaveBeenCalled();
  });
});
