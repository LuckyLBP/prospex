import { ShieldOff } from "lucide-react";
import { getAccessOrNull } from "@/lib/auth";
import { redirect } from "next/navigation";
import { signOut } from "../login/actions";

export default async function NoAccessPage() {
  const a = await getAccessOrNull();
  if (!a) redirect("/login");
  if (a.org) redirect("/app");
  if (a.isAdmin) redirect("/admin");

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#14161F] p-4">
      <div className="w-full max-w-[460px] rounded-[28px] bg-[#F4F4F1] p-8">
        <span className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFE3D2] text-[#F26522]"><ShieldOff size={26} /></span>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-[#14161F]">Du har inte åtkomst än</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-gray-600">
          Du är inloggad som <span className="font-medium text-[#14161F]">{a.user.email}</span>, men kontot är inte kopplat till något bolag.
          Be ägaren av ert bolag i Prospex att bjuda in den här adressen.
        </p>
        <form action={signOut} className="mt-6">
          <button className="rounded-full border border-gray-300 px-5 py-2.5 text-[14px] font-medium hover:border-gray-500">Logga ut</button>
        </form>
      </div>
    </main>
  );
}
