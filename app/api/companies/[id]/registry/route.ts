import { NextRequest, NextResponse } from "next/server";
import { getAccessOrNull } from "@/lib/auth";
import { pool } from "@/lib/db";
import { BolagsverketError, getOrganisation, isBolagsverketConfigured, isBolagsverketTest } from "@/lib/bolagsverket/client";
import { refreshRegistry } from "@/lib/bolagsverket/registry";
import type { RegistryResponse } from "@/lib/bolagsverket/response";
import { isValidOrgNumber, normalizeOrgNumber } from "@/lib/enrich/orgnr";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID = /^[0-9a-f-]{36}$/i;

async function load(id: string) {
  const { rows } = await pool.query(`select id, orgnr, registry from companies where id = $1`, [id]);
  return (rows[0] as { id: string; orgnr: string | null; registry: unknown } | undefined) ?? null;
}

async function respond(company: { id: string; orgnr: string; registry: unknown }): Promise<NextResponse<RegistryResponse>> {
  if (!isBolagsverketConfigured()) {
    return NextResponse.json({ status: "error", message: "Bolagsverkets API är inte konfigurerat.", temporary: false });
  }
  try {
    const data = await refreshRegistry(company, { withFigures: true });
    return NextResponse.json({
      status: "ok",
      organisation: data.organisation,
      annualReport: data.annualReport,
      fetchedAt: data.organisationFetchedAt,
      orgnr: company.orgnr,
      test: isBolagsverketTest(),
    });
  } catch (e) {
    if (e instanceof BolagsverketError) return NextResponse.json({ status: "error", message: e.message, temporary: e.temporary });
    console.error("Bolagsverket-uppslag misslyckades", e);
    return NextResponse.json({ status: "error", message: "Kunde inte hämta företagsuppgifterna.", temporary: true });
  }
}

/** Företagsuppgifter från Bolagsverket för ett företag i katalogen (cache i en vecka, nyckeltal i en månad). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await getAccessOrNull();
  if (!a?.org) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const company = await load(id);
  if (!company) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!company.orgnr) return NextResponse.json({ status: "no_orgnr" } satisfies RegistryResponse);
  return respond({ id: company.id, orgnr: company.orgnr, registry: company.registry });
}

/**
 * Anger organisationsnumret för ett företag som saknar det. Numret måste vara giltigt (Luhn) och
 * Bolagsverket måste känna till det, så att ingen kan hänga fel nummer på katalogen. Katalogen är
 * gemensam, så ett nummer som en gång satts går inte att skriva över här.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await getAccessOrNull();
  if (!a?.org) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const { orgnr: raw } = (await req.json().catch(() => ({}))) as { orgnr?: string };
  const orgnr = raw ? normalizeOrgNumber(raw) : null;
  if (!orgnr || !isValidOrgNumber(orgnr)) {
    return NextResponse.json({ status: "error", message: "Det där är inte ett giltigt organisationsnummer.", temporary: false } satisfies RegistryResponse);
  }
  const company = await load(id);
  if (!company) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (company.orgnr) return respond({ id: company.id, orgnr: company.orgnr, registry: company.registry });

  if (isBolagsverketConfigured() && !isBolagsverketTest()) {
    try {
      if (!(await getOrganisation(orgnr))) {
        return NextResponse.json({ status: "error", message: "Bolagsverket känner inte till det organisationsnumret.", temporary: false } satisfies RegistryResponse);
      }
    } catch (e) {
      if (e instanceof BolagsverketError) return NextResponse.json({ status: "error", message: e.message, temporary: e.temporary } satisfies RegistryResponse);
      throw e;
    }
  }
  const upd = await pool.query(`update companies set orgnr = $2 where id = $1 and orgnr is null returning id, orgnr, registry`, [id, orgnr]);
  const saved = upd.rows[0] ?? (await load(id));
  if (!saved?.orgnr) return NextResponse.json({ status: "error", message: "Kunde inte spara numret.", temporary: true } satisfies RegistryResponse);
  return respond({ id: saved.id, orgnr: saved.orgnr, registry: saved.registry });
}
