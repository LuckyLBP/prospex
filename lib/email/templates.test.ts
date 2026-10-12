import { describe, expect, it } from "vitest";
import { invitationEmail, loginCodeEmail } from "./templates";

describe("loginCodeEmail", () => {
  it("shows the six digit code unbroken, first in the subject, and in html and text", () => {
    const m = loginCodeEmail("754865");
    expect(m.subject.startsWith("754865")).toBe(true);
    expect(m.html).toContain(">754865<");
    expect(m.text).toContain("754865");
  });

  it("has no spaces inside the code anywhere", () => {
    const m = loginCodeEmail("123456");
    expect([m.subject, m.html, m.text].join(" ")).not.toMatch(/123\s+456/);
  });
});

describe("invitationEmail", () => {
  it("escapes the company name and the inviter in the HTML", () => {
    const m = invitationEmail({ orgName: "A&B <script>", role: "member", inviter: '"Lucas"', loginUrl: "https://x.se/login" });
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("A&amp;B &lt;script&gt;");
    expect(m.html).toContain("&quot;Lucas&quot;");
  });

  it("names the role and links to the login page", () => {
    const owner = invitationEmail({ orgName: "X", role: "owner", loginUrl: "https://x.se/login" });
    expect(owner.text).toContain("som ägare");
    expect(owner.html).toContain('href="https://x.se/login"');
  });

  it("uses no en or em dashes", () => {
    const all = [loginCodeEmail("111111"), invitationEmail({ orgName: "X", role: "member", inviter: "Y", loginUrl: "u" })]
      .flatMap((m) => [m.subject, m.html.replace(/<[^>]+>/g, ""), m.text]).join(" ");
    expect(all).not.toMatch(/[–—]/);
  });
});
