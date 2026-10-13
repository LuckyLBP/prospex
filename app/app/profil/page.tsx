import Header from "@/components/dashboard/Header";
import AvatarUploader from "@/components/account/AvatarUploader";
import { Flash } from "@/components/admin/bits";
import { requireMember } from "@/lib/auth";
import { signAvatarUrls } from "@/lib/storage-avatars";
import { NAME_MAX } from "@/lib/account";
import { saveNameAction } from "./actions";

export const metadata = { title: "Min profil" };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const m = await requireMember();
  const sp = await searchParams;
  const avatarPath = (m.user as { avatarPath?: string | null }).avatarPath ?? null;
  const url = avatarPath ? ((await signAvatarUrls([avatarPath])).get(avatarPath) ?? null) : null;
  const card = "rounded-3xl bg-white p-6 shadow-soft";
  const label = "block text-[12px] font-medium text-gray-600";

  return (
    <>
      <Header title="Min profil" subtitle={`${m.user.email} · ${m.org.name}`} />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid grid-cols-1 gap-5">
        <section className={card}>
          <h2 className="mb-4 text-[16px] font-semibold text-ink">Profilbild</h2>
          <AvatarUploader name={m.user.name} url={url} />
        </section>

        <section className={card}>
          <h2 className="mb-4 text-[16px] font-semibold text-ink">Namn</h2>
          <form action={saveNameAction} className="flex flex-wrap items-end gap-3">
            <label className="min-w-[240px] flex-1">
              <span className={label}>Så visas du för kollegor</span>
              <input name="name" required maxLength={NAME_MAX} defaultValue={m.user.name} autoComplete="name" className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-4 text-[14px] outline-none focus:border-accent" />
            </label>
            <button className="h-11 rounded-full bg-ink px-6 text-[14px] font-semibold text-white hover:bg-gray-800">Spara</button>
          </form>
        </section>

        <section className={card}>
          <h2 className="mb-4 text-[16px] font-semibold text-ink">Konto</h2>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 text-[14px] sm:grid-cols-3">
            <div><dt className={label}>E-post</dt><dd className="mt-1 truncate text-ink">{m.user.email}</dd></div>
            <div><dt className={label}>Bolag</dt><dd className="mt-1 text-ink">{m.org.name}</dd></div>
            <div><dt className={label}>Roll</dt><dd className="mt-1 text-ink">{m.role === "owner" ? "Ägare" : "Medlem"}</dd></div>
          </dl>
          <p className="mt-4 text-[12px] text-gray-500">E-postadressen är det du loggar in med och ändras inte här. Bolaget och rollen ändras av en ägare på teamsidan.</p>
        </section>
      </div>
    </>
  );
}
