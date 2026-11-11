import type { PatternSection } from "@/lib/profile/types";

const ROLE: Record<string, string> = { agency: "byrå", platform: "plattform", unknown: "" };

/**
 * Spår i källkoden: vad Claude hittade i startsidans kod som visar vem som byggt sajten, och hur många andra sajter som
 * delar spåret. Ett spår är en ledtråd och inget bevis, och korten säger det.
 */
export default function PatternCard({ pattern }: { pattern: PatternSection }) {
  const { builder, patterns } = pattern;
  if (!builder && patterns.length === 0) return null;
  const sv = (n: number) => n.toLocaleString("sv-SE");
  return (
    <div className="mt-5 rounded-3xl bg-white px-6 py-5">
      <p className="text-[15px] font-semibold text-ink">Spår i källkoden</p>
      {builder && (builder.name || builder.basis) && (
        <p className="mt-1 text-[13px] text-gray-700">
          {builder.name ? <>Sajten verkar vara byggd med eller av <span className="font-medium text-ink">{builder.name}</span>{ROLE[builder.role] ? ` (${ROLE[builder.role]})` : ""}. </> : null}
          <span className="text-gray-500">{builder.basis}</span>
        </p>
      )}
      <ul className="mt-3 flex flex-col gap-3">
        {patterns.map((p) => (
          <li key={p.text} className="rounded-2xl bg-canvas px-4 py-3">
            <code className="break-all text-[12px] text-ink">{p.text}</code>
            <p className="mt-1 text-[13px] text-gray-600">{p.why}</p>
            {p.sites === null && p.candidates !== null && p.candidates > 0 && (
              <p className="mt-1 text-[13px] text-gray-700">Upp till <span className="font-semibold text-ink">{sv(p.candidates)}</span> sajter har samma spår, så det hör till en plattform eller ett verktyg som många använder.</p>
            )}
            {p.sites !== null && (
              <p className="mt-1 text-[13px] text-gray-700">
                {p.sites === 0 ? "Vi hittade inga andra sajter med samma spår." : <><span className="font-semibold text-ink">{p.more ? `Minst ${sv(p.sites)}` : sv(p.sites)}</span> andra sajter har samma spår{p.examples.length > 0 ? <>, till exempel {p.examples.join(", ")}</> : null}.</>}
              </p>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12px] text-gray-500">Ett spår i koden är en ledtråd. Sajter som delar det kan vara byggda av samma byrå eller plattform, men det är inget bevis.</p>
    </div>
  );
}
