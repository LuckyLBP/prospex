import { describe, expect, it } from "vitest";
import { classifyDns } from "./dns";

const ids = (r: Parameters<typeof classifyDns>[0]) => classifyDns(r).map((d) => d.id);

describe("classifyDns", () => {
  it("recognises Google Workspace and Microsoft 365 from MX", () => {
    expect(ids({ mx: ["aspmx.l.google.com", "alt1.aspmx.l.google.com"], ns: [], txt: [] })).toEqual(["mail-google"]);
    expect(ids({ mx: ["foretag-se.mail.protection.outlook.com"], ns: [], txt: [] })).toEqual(["mail-microsoft"]);
  });
  it("recognises Swedish mail hosts", () => {
    expect(ids({ mx: ["mx.loopia.se."], ns: [], txt: [] })).toEqual(["mail-loopia"]);
    expect(ids({ mx: ["mx1.binero.se"], ns: [], txt: [] })).toEqual(["mail-binero"]);
    expect(ids({ mx: ["mx.b.one.com"], ns: [], txt: [] })).toEqual(["mail-onecom"]);
  });
  it("finds sending services in SPF, and ignores TXT lines that are not SPF", () => {
    const spf = "v=spf1 include:_spf.google.com include:servers.mcsv.net include:sendgrid.net ~all";
    expect(ids({ mx: [], ns: [], txt: [spf] })).toEqual(["spf-google", "spf-mailchimp", "spf-sendgrid"]);
    expect(ids({ mx: [], ns: [], txt: ["hej include:servers.mcsv.net"] })).toEqual([]);
  });
  it("finds domain verifications for Google and Meta", () => {
    expect(ids({ mx: [], ns: [], txt: ["google-site-verification=abc", "facebook-domain-verification=xyz"] })).toEqual(["txt-google-verify", "txt-meta-verify"]);
  });
  it("recognises name servers", () => {
    expect(ids({ mx: [], ns: ["ada.ns.cloudflare.com", "bob.ns.cloudflare.com"], txt: [] })).toEqual(["ns-cloudflare"]);
    expect(ids({ mx: [], ns: ["ns-123.awsdns-45.com"], txt: [] })).toEqual(["ns-aws"]);
  });
  it("says nothing for unknown hosts, and lists each finding once", () => {
    expect(ids({ mx: ["mail.minserver.se"], ns: ["ns1.minserver.se"], txt: ["v=spf1 mx ~all"] })).toEqual([]);
    expect(ids({ mx: ["aspmx.l.google.com", "alt2.aspmx.l.google.com"], ns: [], txt: [] })).toHaveLength(1);
  });
  it("finds vendors from more TXT verification tokens", () => {
    expect(ids({ mx: [], ns: [], txt: ["MS=ms12345678", "atlassian-domain-verification=abc", "docusign=1234", "stripe-verification=x"] })).toEqual(["txt-microsoft", "txt-atlassian", "txt-docusign", "txt-stripe"]);
  });
  it("reads the DMARC policy, and flags a missing one only when the domain has mail", () => {
    expect(classifyDns({ mx: ["mx.loopia.se"], ns: [], txt: [], dmarc: ["v=DMARC1; p=reject; rua=mailto:a@b.se"] }).find((d) => d.id === "dmarc")?.detail).toBe("policy reject");
    expect(classifyDns({ mx: ["mx.loopia.se"], ns: [], txt: [], dmarc: ["v=DMARC1; p=none"] }).find((d) => d.id === "dmarc")?.detail).toContain("ingen kontroll");
    expect(ids({ mx: ["mx.loopia.se"], ns: [], txt: [], dmarc: [] })).toContain("dmarc-missing");
    expect(ids({ mx: [], ns: [], txt: [], dmarc: [] })).toEqual([]);
    expect(ids({ mx: ["mx.loopia.se"], ns: [], txt: [] })).toEqual(["mail-loopia"]);
  });
  it("finds senders hidden behind an SPF include", () => {
    expect(ids({ mx: [], ns: [], txt: ["v=spf1 include:mail.example.net ~all"], spfIncludes: ["include:mail.example.net", "v=spf1 include:sendgrid.net ~all"] })).toEqual(["spf-sendgrid"]);
  });
  it("recognises hosting from CNAME and IP, and Microsoft 365 from autodiscover", () => {
    expect(ids({ mx: [], ns: [], txt: [], hosting: { cname: ["cname.vercel-dns.com."], a: [], autodiscover: [] } })).toEqual(["host-vercel"]);
    expect(ids({ mx: [], ns: [], txt: [], hosting: { cname: [], a: ["185.230.63.107"], autodiscover: ["autodiscover.outlook.com"] } })).toEqual(["host-wix", "mail-microsoft"]);
  });
});
