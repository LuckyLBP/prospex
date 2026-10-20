import Link from "next/link";
import { Search } from "@/components/brand/icons";
import { btnPrimary } from "@/components/admin/ui";
import type { ListState } from "@/lib/agencies/request";
import { requestCustomerListAction } from "@/app/app/spaning/actions";

/** Spaningens kort för företag som är kopplade till webbplatsen som spanats på: har vi listan, söker vi, eller kan vi börja söka. */
export default function CustomerListCard({ state, profileId, domain, name }: { state: ListState; profileId: string; domain: string; name: string }) {
  if (state.state === "disabled") return null;
  const box = "mt-5 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-white px-6 py-5";
  const title = "text-[15px] font-semibold text-ink";
  const sub = "mt-0.5 text-[13px] text-gray-500";

  if (state.state === "have") {
    return (
      <div className={box}>
        <div>
          <p className={title}>Vi har {state.customers.toLocaleString("sv-SE")} företag kopplade till {state.name}</p>
          <p className={sub}>Vi har ingen koppling till {state.name}. Listan visar företag vi hittat hos dem.</p>
        </div>
        <Link href={`/app/leverantorer/${state.slug}`} className={btnPrimary}>Öppna listan</Link>
      </div>
    );
  }
  if (state.state === "none") {
    return (
      <div className={box}>
        <div>
          <p className={title}>Vi har ingen lista för {domain} än</p>
          <p className={sub}>Vi kan leta efter företag som är kopplade till {name}. Det tar några minuter och listan dyker upp här.</p>
        </div>
        <form action={requestCustomerListAction}>
          <input type="hidden" name="id" value={profileId} />
          <button className={btnPrimary}><Search size={14} />Hitta företagen</button>
        </form>
      </div>
    );
  }
  const text: Record<"searching" | "too-few" | "failed" | "later", [string, string]> = {
    searching: [`Vi letar efter företag kopplade till ${name}`, "Det kan ta några minuter. Sidan uppdateras av sig själv."],
    "too-few": ["Vi hittade för få företag för att visa en lista", "Försök igen om ett dygn."],
    failed: ["Sökningen lyckades inte", "Försök igen om ett dygn."],
    later: ["Vi kan inte starta fler sökningar just nu", "Försök igen senare."],
  };
  const [t, s] = text[state.state];
  return (
    <div className={box}>
      <div>
        <p className={title}>{t}</p>
        <p className={sub}>{s}</p>
      </div>
    </div>
  );
}
