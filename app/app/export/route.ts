import { NextRequest } from "next/server";
import { searchCompanies } from "@/lib/queries";
import { requireMember } from "@/lib/auth";

export const dynamic = "force-dynamic";

const esc = (v: string | null) => (v == null ? "" : `"${v.replace(/"/g, '""')}"`);

export async function GET(req: NextRequest) {
  const m = await requireMember();
  const p = req.nextUrl.searchParams;
  const rows = await searchCompanies(
    { orgId: m.org.id, supplier: p.get("supplier") || undefined, city: p.get("city")?.trim() || undefined, phoneOnly: p.get("phone") === "1", q: p.get("q")?.trim() || undefined },
    100000,
  );
  const header = ["Företag", "Org.nr", "Telefon", "E-post", "Webbplats", "Ort", "Leverantör", "Källa"];
  const lines = rows.map((r) =>
    [r.name, r.orgnr, r.phone, r.email, r.website, r.city, r.supplier, r.source_url].map(esc).join(","),
  );
  const csv = "﻿" + [header.map(esc).join(","), ...lines].join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="prospex-lista.csv"',
    },
  });
}
