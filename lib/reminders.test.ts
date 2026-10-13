import { describe, expect, it } from "vitest";
import { callbackReminderEmail } from "./email/templates";
import { toItem } from "./reminders";

describe("toItem", () => {
  it("shows the time only when the callback has one, in Swedish time", () => {
    expect(toItem({ name: "Hemtjänst AB", phone: "+4687654321", next_callback_at: new Date("2026-10-13T12:30:00Z"), callback_has_time: true })).toEqual({ name: "Hemtjänst AB", phone: "+4687654321", when: "Kl 14:30" });
    expect(toItem({ name: null, phone: null, next_callback_at: new Date("2026-10-13T08:00:00Z"), callback_has_time: false })).toEqual({ name: "Okänt företag", phone: null, when: null });
  });
});

describe("callbackReminderEmail", () => {
  const base = { name: "Anna", url: "https://prospex.se/app/ring?queue=callbacks", settingsUrl: "https://prospex.se/app/installningar" };
  it("lists today's callbacks, counts the rest and links to the queue and to the settings", () => {
    const m = callbackReminderEmail({ ...base, total: 11, items: [{ name: "Foxor AB", when: "Kl 09:00", phone: "08-1" }, { name: "Nordiska <b>", when: null, phone: null }] });
    expect(m.subject).toBe("Du har 11 återringningar idag");
    expect(m.html).toContain("God morgon, Anna");
    expect(m.html).toContain("Foxor AB");
    expect(m.html).toContain("Nordiska &lt;b&gt;"); // namn från katalogen släpps aldrig in som HTML
    expect(m.html).toContain("och 9 till");
    expect(m.html).toContain(base.url);
    expect(m.html).toContain(base.settingsUrl);
    expect(m.text).toContain("Foxor AB (Kl 09:00), 08-1");
  });
  it("uses the singular for one callback and marks a test mail", () => {
    expect(callbackReminderEmail({ ...base, total: 1, items: [{ name: "X", when: null, phone: null }] }).subject).toBe("Du har 1 återringning idag");
    const t = callbackReminderEmail({ ...base, total: 0, items: [], test: true });
    expect(t.subject).toBe("Testmejl: Inga återringningar idag");
    expect(t.html).toContain("Så här ser påminnelsen ut");
  });
});
