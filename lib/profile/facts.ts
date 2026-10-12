import type { SiteAudit } from "@/lib/enrich/audit";
import type { Detection, Fact, FactKind } from "./types";

// Beläggen en profil bygger på. Varje faktum får ett stabilt id (F1, F2, ...) i den ordning de läggs till, och
// profilens påståenden hänvisar till dem. Rent.

export class FactBook {
  private list: Fact[] = [];

  /** Fortsätter numreringen efter redan insamlade fakta. */
  static from(facts: Fact[]): FactBook {
    const b = new FactBook();
    b.list = [...facts];
    return b;
  }

  add(fact: Omit<Fact, "id">): Fact {
    const dup = this.list.find((f) => f.kind === fact.kind && f.detector === fact.detector && f.label === fact.label && f.value === fact.value && f.source === fact.source);
    if (dup) return dup;
    const f: Fact = { id: `F${this.list.length + 1}`, ...fact };
    this.list.push(f);
    return f;
  }

  addDetections(detections: Detection[], source: string, kind: FactKind = "detector"): Fact[] {
    return detections.map((d) => this.add({ kind, label: d.name, value: d.detail ?? "finns på sidan", source, detector: d.id, match: d.match }));
  }

  /** Det `auditSite` redan har kommit fram till, som fakta med egna detektor-id. */
  addAudit(audit: SiteAudit, source: string): Fact[] {
    const out: Fact[] = [];
    const a = (label: string, value: string, detector: string) => out.push(this.add({ kind: "audit", label, value, source, detector }));
    if (audit.cms) a("CMS", audit.cmsVersion ? `${audit.cms} ${audit.cmsVersion}` : audit.cms, `cms:${audit.cms.toLowerCase()}`);
    if (audit.builder) a("Sidbyggare", audit.builder, `builder:${audit.builder.toLowerCase()}`);
    if (audit.theme) a("Tema", audit.theme, "theme");
    if (audit.credit) a("Webbplatsen anges vara gjord av", audit.credit, "credit");
    if (audit.booking) a("Bokningssystem", audit.booking, `booking:${audit.booking.toLowerCase()}`);
    if (audit.copyrightYear) a("Copyright-år i sidfoten", String(audit.copyrightYear), "copyright");
    a("Säker anslutning (https)", audit.https ? "ja" : "nej", "https");
    a("Anpassad för mobil", audit.mobile ? "ja" : "nej", "mobile");
    return out;
  }

  all(): Fact[] {
    return [...this.list];
  }

  ids(): Set<string> {
    return new Set(this.list.map((f) => f.id));
  }
}
