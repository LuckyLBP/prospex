// Ren och klientsäker: gör en rad i aktivitetsloggen läsbar på svenska.

export type AuditRow = {
  id: number;
  at: string;
  actor_email: string;
  action: string;
  entity: string;
  entity_id: string | null;
  entity_name: string | null;
  details: Record<string, unknown> | null;
};

export type AuditGroup = "bolag" | "anvandare" | "katalog";

export const AUDIT_GROUPS: { value: AuditGroup; label: string; prefixes: string[] }[] = [
  { value: "bolag", label: "Bolag och medlemmar", prefixes: ["org.", "member.", "invite."] },
  { value: "anvandare", label: "Användare", prefixes: ["user."] },
  { value: "katalog", label: "Katalog och insamling", prefixes: ["source.", "category.", "run.", "profile."] },
];

export function groupPrefixes(group: string | null | undefined): string[] | null {
  return AUDIT_GROUPS.find((g) => g.value === group)?.prefixes ?? null;
}

/** "lucas.pohl@x.se" -> "Lucas". Ett namn vi kan visa utan att läsa i en profil. */
export function actorName(email: string): string {
  const first = (email.split("@")[0] ?? "").split(/[._\-+]/)[0] ?? "";
  return first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : email;
}

const ROLE: Record<string, string> = { owner: "ägare", member: "medlem" };
const role = (r: unknown) => ROLE[String(r)] ?? String(r ?? "");
const FIELD: Record<string, string> = {
  name: "namn", description: "beskrivning", kind: "typ", category: "kategori", sort: "sortering", config: "sökinställningar",
  icon: "ikon", names_brand: "namnger varumärken", published: "publicering", method: "insamlingsmetod", enrich_sites: "besök på webbplatser",
};
const kindWord = (k: unknown) => (k === "list" ? "listan" : "leverantören");

/** Vilka fält som ändrades, för "Ändrade namn och beskrivning". */
export function changedFields(details: Record<string, unknown> | null): string[] {
  const changes = details?.changes as Record<string, unknown> | undefined;
  return changes ? Object.keys(changes).map((k) => FIELD[k] ?? k) : [];
}

const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} och ${xs[xs.length - 1]}`);

export function describeAudit(row: Pick<AuditRow, "action" | "actor_email" | "entity_name" | "details">): string {
  const a = actorName(row.actor_email);
  const d = row.details ?? {};
  const name = row.entity_name ?? "okänd";
  const email = String(d.email ?? name);
  const org = String(d.org ?? "bolaget");
  switch (row.action) {
    case "org.create": return `${a} skapade bolaget ${name}`;
    case "org.update": return `${a} ändrade bolaget ${name}`;
    case "org.activate": return `${a} aktiverade bolaget ${name}`;
    case "org.deactivate": return `${a} stängde av bolaget ${name}`;
    case "member.invite": return `${a} bjöd in ${email} till ${org} som ${role(d.role)}`;
    case "member.add": return `${a} lade till ${email} i ${org} som ${role(d.role)}`;
    case "member.role": return `${a} ändrade rollen för ${email} i ${org} från ${role(d.from)} till ${role(d.to)}`;
    case "member.remove": return `${a} tog bort ${email} från ${org}`;
    case "invite.cancel": return `${a} avbröt inbjudan till ${email}`;
    case "user.admin_grant": return `${a} gjorde ${email} till plattformsadmin`;
    case "user.admin_revoke": return `${a} tog bort adminrättigheterna från ${email}`;
    case "user.activate": return `${a} aktiverade användaren ${email}`;
    case "user.deactivate": return `${a} stängde av användaren ${email}`;
    case "source.create": return `${a} skapade ${kindWord(d.kind)} ${name}`;
    case "source.update": {
      const f = changedFields(row.details);
      return `${a} ändrade ${kindWord(d.kind)} ${name}${f.length ? ` (${list(f)})` : ""}`;
    }
    case "source.autopublish": return `${a} publicerade ${kindWord(d.kind)} ${name} automatiskt efter ett önskemål${typeof d.customers === "number" ? ` (${d.customers} kunder)` : ""}`;
    case "source.publish": return `${a} publicerade ${kindWord(d.kind)} ${name}`;
    case "source.unpublish": return `${a} avpublicerade ${kindWord(d.kind)} ${name}`;
    case "source.logo": return d.removed ? `${a} tog bort logotypen för ${name}` : `${a} bytte logotyp för ${name}`;
    case "run.start": return `${a} startade en körning för ${kindWord(d.kind)} ${name}`;
    case "run.cancel": return `${a} avbröt körningen för ${kindWord(d.kind)} ${name}`;
    case "run.requeue": return `${a} lät ${kindWord(d.kind)} ${name} läsa om misslyckade webbplatser${typeof d.count === "number" ? ` (${d.count})` : ""}`;
    case "org.profile_access_on": return `${a} öppnade Spaning för bolaget ${name}`;
    case "org.profile_access_off": return `${a} stängde Spaning för bolaget ${name}`;
    case "org.list_access_on": return `${a} öppnade fullständig bläddring i listorna för bolaget ${name}`;
    case "org.list_access_off": return `${a} stängde fullständig bläddring i listorna för bolaget ${name}`;
    case "profile.create": return `${a} gjorde en spaning på ${name}`;
    case "profile.refresh": return `${a} uppdaterade spaningen på ${name}`;
    case "category.create": return `${a} skapade kategorin ${name}`;
    case "category.update": return `${a} ändrade kategorin ${name}`;
    case "category.delete": return `${a} tog bort kategorin ${name}`;
    default: return `${a} utförde ${row.action}${row.entity_name ? ` på ${row.entity_name}` : ""}`;
  }
}

/** Fält som skiljer sig mellan före och efter, som { fält: [före, efter] }. Tomt objekt om inget ändrats. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>, fields: (keyof T)[]): Record<string, [unknown, unknown]> {
  const out: Record<string, [unknown, unknown]> = {};
  for (const f of fields) {
    const b = before[f];
    const a = after[f];
    if (a === undefined) continue;
    if (JSON.stringify(b ?? null) !== JSON.stringify(a ?? null)) out[String(f)] = [b ?? null, a ?? null];
  }
  return out;
}
