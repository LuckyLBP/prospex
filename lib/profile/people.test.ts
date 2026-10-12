import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { generateText } from "ai";
import { condensePage } from "./people-text";
import { extractPeople, looksLikeName, looksLikePeoplePage, mergePeople, verifyPeople, type PeopleDeps, type Person, type PersonRaw } from "./people";

const sabygg = condensePage(readFileSync(join(__dirname, "fixtures", "people", "sabygg-kontakt.html"), "utf8"), "https://www.sabygg.nu/kontakt");
const raw = (over: Partial<PersonRaw> = {}): PersonRaw => ({ name: "Stefan Almgren", role: "VD/Byggledning/Kalkyl", email: "stefan.almgren@sabygg.nu", phone: "0736-375111", imageIndex: 1, ...over });

describe("looksLikeName", () => {
  it("accepts two to four capitalised words and rejects headings and single words", () => {
    expect(looksLikeName("Stefan Almgren")).toBe(true);
    expect(looksLikeName("Anna-Karin Åberg")).toBe(true);
    expect(looksLikeName("Per Ola von Ek")).toBe(false);
    expect(looksLikeName("Kontakta oss")).toBe(false);
    expect(looksLikeName("Vårt Team")).toBe(false);
    expect(looksLikeName("Stefan")).toBe(false);
    expect(looksLikeName("stefan almgren")).toBe(false);
  });
});

describe("verifyPeople on the SA Bygg page", () => {
  it("keeps a real person with role, email, phone and photo exactly as the page shows them", () => {
    expect(verifyPeople([raw()], sabygg)).toEqual([{
      name: "Stefan Almgren", role: "VD/Byggledning/Kalkyl", email: "stefan.almgren@sabygg.nu", phone: "+46736375111",
      photoUrl: "https://www.sabygg.nu/wp-content/uploads/2021/07/stefan.jpg", sourceUrl: "https://www.sabygg.nu/kontakt", confidence: "hög",
    }]);
  });
  it("drops a person who is not on the page, however plausible", () => {
    expect(verifyPeople([raw({ name: "Karl Svensson" })], sabygg)).toEqual([]);
  });
  it("nulls an email, a phone, a role or an image that the page does not show, but keeps the person", () => {
    const [p] = verifyPeople([raw({ email: "stefan@annan.se", phone: "070-000 00 00", imageIndex: 99 })], sabygg);
    expect(p).toMatchObject({ name: "Stefan Almgren", role: "VD/Byggledning/Kalkyl", email: null, phone: null, photoUrl: null, confidence: "medel" });
    const [q] = verifyPeople([raw({ role: "Rymdkapten" })], sabygg);
    expect(q).toMatchObject({ role: null, email: "stefan.almgren@sabygg.nu" });
    // Allt som inte stämmer lämnar bara ett namn, och då visas ingen person.
    expect(verifyPeople([raw({ email: "x@y.se", phone: "070-000 00 00", role: "Rymdkapten", imageIndex: 99 })], sabygg)).toEqual([]);
  });
  it("drops a person who is left with nothing but a name", () => {
    expect(verifyPeople([raw({ email: null, phone: null, role: null, imageIndex: null })], sabygg)).toEqual([]);
  });
  it("never gives a person the company's general address", () => {
    const page = condensePage(`<body><h1>Kontakt</h1><p>Anna Berg, Platschef</p><p><a href="mailto:info@foretag.se">info@foretag.se</a></p></body>`.repeat(5), "https://foretag.se/kontakt");
    const [p] = verifyPeople([{ name: "Anna Berg", role: "Platschef", email: "info@foretag.se", phone: null, imageIndex: null }], page);
    expect(p.email).toBeNull();
    expect(p.role).toBe("Platschef");
  });
  it("merges a person the model lists twice, and rejects heading-like names", () => {
    const r = verifyPeople([raw(), raw({ name: "stefan  almgren" }), raw({ name: "Våra Medarbetare" })], sabygg);
    expect(r).toHaveLength(1);
  });
  it("accepts a different order of fields and an alternative phone spelling", () => {
    const [p] = verifyPeople([raw({ phone: "+46 736 37 51 11" })], sabygg);
    expect(p.phone).toBe("+46736375111");
  });
});

describe("mergePeople", () => {
  const p = (over: Partial<Person>): Person => ({ name: "Anna Berg", role: null, email: null, phone: null, photoUrl: null, sourceUrl: "https://a.se/om", confidence: "medel", ...over });
  it("fills in fields across pages on the name and ranks strong entries first", () => {
    const r = mergePeople([[p({ role: "VD" })], [p({ email: "anna@a.se", sourceUrl: "https://a.se/kontakt" }), p({ name: "Bo Ek", role: "Chef", email: "bo@a.se", phone: "+46701", confidence: "hög" })]]);
    expect(r[0].name).toBe("Bo Ek");
    expect(r.find((x) => x.name === "Anna Berg")).toMatchObject({ role: "VD", email: "anna@a.se", sourceUrl: "https://a.se/om" });
  });
  it("keeps at most ten people", () => {
    const many = Array.from({ length: 14 }, (_, i) => p({ name: `Person Nummer${String.fromCharCode(65 + i)}`, role: "Chef" }));
    expect(mergePeople([many])).toHaveLength(10);
  });
});

describe("looksLikePeoplePage", () => {
  it("wants titles or at least two contact details, and some text", () => {
    expect(looksLikePeoplePage(sabygg)).toBe(true);
    const bare = condensePage(`<body><p>${"Vi gör bra saker och har gjort det länge. ".repeat(10)}</p></body>`, "https://a.se");
    expect(looksLikePeoplePage(bare)).toBe(false);
    expect(looksLikePeoplePage(condensePage(`<body><p>Kort</p></body>`, "https://a.se"))).toBe(false);
  });
});

describe("extractPeople", () => {
  const fake = (people: PersonRaw[]): PeopleDeps & { generate: ReturnType<typeof vi.fn> } => ({
    generate: vi.fn(async () => ({ output: { people }, totalUsage: { inputTokens: 4000, outputTokens: 300 } })) as unknown as typeof generateText & ReturnType<typeof vi.fn>,
    configured: () => true,
  }) as never;

  it("reads a page, keeps only what the page backs, and reports the cost", async () => {
    const d = fake([raw(), raw({ name: "Mikael Larsson", role: "AC/Projektledare Göteborg", email: "mikael.larsson@sabygg.nu", phone: "0709-808484", imageIndex: 2 }), raw({ name: "Påhittad Person", role: "VD" })]);
    const r = await extractPeople([sabygg], { name: "SA Bygg", domain: "sabygg.nu" }, d);
    expect(r.people.map((p) => p.name)).toEqual(["Stefan Almgren", "Mikael Larsson"]);
    expect(r.pagesRead).toBe(1);
    expect(r.costSek).toBeGreaterThan(0);
    const prompt = String((d.generate.mock.calls[0][0] as { prompt: string }).prompt);
    expect(prompt).toContain("sabygg.nu");
    expect(prompt).toContain("[mail: stefan.almgren@sabygg.nu]");
  });
  it("skips pages that do not look like people pages, and does nothing without a key", async () => {
    const bare = condensePage(`<body><p>${"Vi gör bra saker och har gjort det länge. ".repeat(10)}</p></body>`, "https://a.se");
    const d = fake([]);
    expect((await extractPeople([bare], { name: null, domain: "a.se" }, d)).pagesRead).toBe(0);
    expect(d.generate).not.toHaveBeenCalled();
    const off = { ...fake([raw()]), configured: () => false } as PeopleDeps;
    expect(await extractPeople([sabygg], { name: null, domain: "a.se" }, off)).toEqual({ people: [], pagesRead: 0, costSek: 0 });
  });
  it("carries on when the model fails on a page", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = { generate: vi.fn(async () => { throw new Error("nere"); }) as never, configured: () => true } as PeopleDeps;
    expect((await extractPeople([sabygg], { name: null, domain: "a.se" }, d)).people).toEqual([]);
    quiet.mockRestore();
  });
});

describe("one-person businesses", () => {
  const om = condensePage(`<body><h1>Om mig</h1><p>Hej! Rebecka heter jag och jag är kroppsterapeut och yogalärare i Malmö.</p><p>Mejla <a href="mailto:rebecka.moberg@gmail.com">rebecka.moberg@gmail.com</a> eller ring <a href="tel:0701234567">070-123 45 67</a></p></body>`.repeat(2), "https://skogsstjarna.se/om-mig");
  const r = (over: Partial<PersonRaw> = {}): PersonRaw => ({ name: "Rebecka Moberg", role: "kroppsterapeut", email: "rebecka.moberg@gmail.com", phone: "0701234567", imageIndex: null, ...over });

  it("accepts a surname that only appears in the person's own email address, and gives the owner the page's number", () => {
    expect(verifyPeople([r()], om)).toEqual([expect.objectContaining({ name: "Rebecka Moberg", role: "kroppsterapeut", email: "rebecka.moberg@gmail.com", phone: "+46701234567", confidence: "hög" })]);
  });
  it("still rejects a surname that is nowhere on the page", () => {
    expect(verifyPeople([r({ name: "Rebecka Svensson" })], om)).toEqual([]);
  });
  it("accepts a first name the text itself points out ('Rebecka heter jag'), as low confidence", () => {
    expect(verifyPeople([r({ name: "Rebecka" })], om)).toEqual([expect.objectContaining({ name: "Rebecka", confidence: "låg", phone: "+46701234567" })]);
  });
  it("rejects a first name with nothing in the text to support it, and a heading word", () => {
    const plain = condensePage(`<body><p>Vi erbjuder massage och yoga. Boka idag på <a href="tel:0701234567">070-123 45 67</a>. Välkommen hälsar Marie.</p></body>`.repeat(2), "https://a.se");
    expect(verifyPeople([{ name: "Marie", role: null, email: null, phone: "0701234567", imageIndex: null }], plain)).toEqual([]);
    expect(verifyPeople([{ name: "Välkommen", role: "terapeut", email: null, phone: null, imageIndex: null }], om)).toEqual([]);
  });
  it("accepts a first name that has its title right after it, as in a staff list", () => {
    const staff = condensePage(`<body><h2>Vårt team</h2><div>Hannah</div><div>Leg. Sjuksköterska</div><div>Somy</div><div>Cert. Hudbehandlare</div><p>${"Vi tar emot på klinikens adress i centrum. ".repeat(5)}</p></body>`, "https://k.se/team");
    const out = verifyPeople([{ name: "Hannah", role: "Leg. Sjuksköterska", email: null, phone: null, imageIndex: null }, { name: "Somy", role: "Cert. Hudbehandlare", email: null, phone: null, imageIndex: null }], staff);
    expect(out.map((p) => [p.name, p.role, p.confidence])).toEqual([["Hannah", "Leg. Sjuksköterska", "låg"], ["Somy", "Cert. Hudbehandlare", "låg"]]);
  });
  it("tidies names and titles that the site writes in capitals", () => {
    const caps = condensePage(`<body><div>ANNIKA PELLEGRINI</div><div>FRISÖRMÄSTARE</div><p>${"Salongen finns mitt i stan sedan många år. ".repeat(6)}</p></body>`, "https://s.se/team");
    expect(verifyPeople([{ name: "ANNIKA PELLEGRINI", role: "FRISÖRMÄSTARE", email: null, phone: null, imageIndex: null }], caps)).toEqual([expect.objectContaining({ name: "Annika Pellegrini", role: "Frisörmästare" })]);
  });
  it("merges a first name into the full name found on another page", () => {
    const p = (name: string, extra: Partial<Person> = {}): Person => ({ name, role: "Frisör", email: null, phone: null, photoUrl: null, sourceUrl: "https://a.se", confidence: "låg", ...extra });
    expect(mergePeople([[p("Anna")], [p("Anna Berg", { confidence: "medel" })]]).map((x) => x.name)).toEqual(["Anna Berg"]);
  });

  it("accepts a title made of several phrases when each word is on the page", () => {
    const page = condensePage(`<body><h1>Om mig</h1><p>Rebecka Moberg. TOTUM kroppsterapeut. Yinyoga lärare i Malmö.</p><p>${"Kom och prova en behandling hos mig i salongen. ".repeat(4)}</p><a href="mailto:rebecka.moberg@gmail.com">mejla</a></body>`, "https://s.se/om");
    const [p] = verifyPeople([{ name: "Rebecka Moberg", role: "TOTUM kroppsterapeut och Yinyoga lärare", email: null, phone: null, imageIndex: null }], page);
    expect(p).toMatchObject({ name: "Rebecka Moberg", role: "TOTUM kroppsterapeut och Yinyoga lärare" });
  });
});

describe("extractPeople on a one-person business", () => {
  it("gives the only person the only email and phone on the pages", async () => {
    const page = condensePage(`<body><h1>Om mig</h1><p>Rebecka Moberg, kroppsterapeut.</p><p>${"Jag tar emot i min salong i centrum, välkommen. ".repeat(6)}</p><a href="mailto:rebecka.moberg@gmail.com">mejla</a> <a href="tel:0701234567">ring</a></body>`, "https://s.se/om");
    const generate = vi.fn(async () => ({ output: { people: [{ name: "Rebecka Moberg", role: "kroppsterapeut", email: null, phone: null, imageIndex: null }] }, totalUsage: { inputTokens: 100, outputTokens: 20 } })) as never;
    const r = await extractPeople([page], { name: null, domain: "s.se" }, { generate, configured: () => true });
    expect(r.people).toEqual([expect.objectContaining({ email: "rebecka.moberg@gmail.com", phone: "+46701234567", confidence: "hög" })]);
  });
  it("does not do that when there are several people", async () => {
    const page = condensePage(`<body><p>Anna Berg, VD</p><p>Bo Ek, Chef</p><p>${"Vi är ett team som hjälper dig varje dag. ".repeat(6)}</p><a href="mailto:anna@s.se">a</a><a href="tel:0701234567">r</a></body>`, "https://s.se/team");
    const generate = vi.fn(async () => ({ output: { people: [{ name: "Anna Berg", role: "VD", email: null, phone: null, imageIndex: null }, { name: "Bo Ek", role: "Chef", email: null, phone: null, imageIndex: null }] }, totalUsage: { inputTokens: 100, outputTokens: 20 } })) as never;
    const r = await extractPeople([page], { name: null, domain: "s.se" }, { generate, configured: () => true });
    expect(r.people.every((p) => !p.email && !p.phone)).toBe(true);
  });
});

