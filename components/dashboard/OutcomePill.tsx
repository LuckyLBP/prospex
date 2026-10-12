import { outcomeInfo, type CallOutcome } from "@/lib/calls/outcomes";

const TONE: Record<string, string> = {
  neutral: "bg-gray-100 text-gray-700",
  primary: "bg-[#14161F] text-white",
  success: "bg-emerald-100 text-emerald-800",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-rose-100 text-rose-800",
};

export default function OutcomePill({ outcome }: { outcome: CallOutcome | null }) {
  if (!outcome) return <span className="text-gray-400">Inte ringd</span>;
  const i = outcomeInfo(outcome);
  return <span className={`rounded-full px-2.5 py-1 text-[12px] font-medium ${TONE[i.tone]}`}>{i.label}</span>;
}
