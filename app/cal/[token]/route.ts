import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { buildIcs } from "@/lib/ics";

export const dynamic = "force-dynamic";

// Offentlig prenumerationsfeed. Tokenen (256 bitar, slumpad) är behörigheten.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const raw = (await params).token.replace(/\.ics$/i, "");
  if (!/^[0-9a-f]{64}$/.test(raw)) return new Response("Not found", { status: 404 });

  const feed = await pool.query(`select user_id from calendar_feeds where token = $1`, [raw]);
  if (!feed.rows[0]) return new Response("Not found", { status: 404 });

  const { rows } = await pool.query(
    `select e.id, e.title, e.starts_at, e.ends_at, e.note, e.updated_at, e.company_id, c.phone
     from calendar_events e left join companies c on c.id = e.company_id
     where e.user_id = $1 and e.starts_at >= now() - interval '30 days' and e.starts_at < now() + interval '365 days'
     order by e.starts_at`,
    [feed.rows[0].user_id],
  );
  const origin = req.nextUrl.origin;
  const body = buildIcs(
    rows.map((r) => ({ ...r, url: r.company_id ? `${origin}/app/foretag/${r.company_id}` : null })),
  );
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="prospex.ics"',
      "Cache-Control": "no-store",
    },
  });
}
