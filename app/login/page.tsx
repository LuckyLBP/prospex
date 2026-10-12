import { Logo } from "@/components/brand/Logo";
import { KeyRound, Mail } from "lucide-react";
import CodeInput from "@/components/CodeInput";
import { sendCode, verifyCode } from "./actions";

type SP = { email?: string; error?: string; wait?: string };

const ERRORS: Record<string, string> = {
  email: "Ange en giltig e-postadress.",
  config: "Inloggningen är inte rätt inställd (kodlängd). Kontakta administratören.",
  send: "Vi kunde inte skicka mejlet just nu. Försök igen om en stund.",
  code: "Koden stämmer inte eller har gått ut. Har du begärt flera koder gäller bara den senaste. Skriv in den, eller begär en ny.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const wait = Number(sp.wait);
  const waitText = !(wait > 0) ? "en liten stund" : wait < 90 ? `${wait} sekunder` : wait < 3600 ? `${Math.ceil(wait / 60)} minuter` : "en timme";
  // "rate-send" under en halv minut är ingen varning utan besked om att en kod redan är på väg.
  const info = sp.error === "rate-send";
  const error = sp.error === "rate-send"
    ? wait <= 30
      ? `Vi har precis skickat en kod. Kolla inkorgen och skräpposten. Du kan begära en ny om ${waitText}.`
      : `Du har begärt många koder på kort tid. Koden du fick senast gäller fortfarande. Du kan begära en ny om ${waitText}.`
    : sp.error === "rate-verify"
      ? `Du har provat flera felaktiga koder. Vänta ${waitText} och försök igen.`
      : sp.error ? (ERRORS[sp.error] ?? sp.error) : null;
  const input = "rounded-xl border border-gray-200 bg-white px-4 py-3 text-[15px] outline-none focus:border-accent";

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink p-4">
      <div className="w-full max-w-[420px] rounded-[28px] bg-canvas p-8">
        <Logo height={40} className="mb-6" />
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-ink">Logga in på Prospex</h1>

        {sp.email ? (
          <form action={verifyCode} className="mt-5 flex flex-col gap-3">
            <div className="flex gap-3 rounded-2xl bg-white p-4 text-[14px] text-gray-700">
              <Mail size={20} className="mt-0.5 shrink-0 text-accent" />
              <p>
                Om <span className="font-semibold text-ink">{sp.email}</span> har åtkomst har vi skickat en kod med sex siffror.
              </p>
            </div>
            <input type="hidden" name="email" value={sp.email} />
            <CodeInput className={`${input} text-center text-[26px] tracking-[0.3em] placeholder:text-gray-300`} />
            {error && <p className={`rounded-xl px-4 py-3 text-[13px] ${info ? "bg-amber-50 text-amber-900" : "bg-rose-50 text-rose-800"}`}>{error}</p>}
            <button className="flex items-center justify-center gap-2 rounded-full bg-ink px-6 py-3 text-[14px] font-semibold text-white">
              <KeyRound size={16} /> Logga in
            </button>
          </form>
        ) : null}
        {sp.email ? (
          <div className="mt-3 flex items-center justify-between text-[13px] text-gray-500">
            <form action={sendCode}>
              <input type="hidden" name="email" value={sp.email} />
              <button className="underline underline-offset-4 hover:text-gray-800">Skicka ny kod</button>
            </form>
            <a href="/login" className="underline underline-offset-4 hover:text-gray-800">Använd en annan adress</a>
          </div>
        ) : null}
        {sp.email ? null : (
          <form action={sendCode} className="mt-5 flex flex-col gap-3">
            <p className="text-[14px] text-gray-600">Ange din e-post så skickar vi en kod. Inget lösenord behövs.</p>
            <input type="email" name="email" required autoFocus placeholder="namn@foretag.se" className={input} />
            {error && <p className="text-[13px] text-red-600">{error}</p>}
            <button className="rounded-full bg-ink px-6 py-3 text-[14px] font-semibold text-white">Skicka kod</button>
          </form>
        )}
      </div>
    </main>
  );
}
