"use client";

import { useEffect, useRef } from "react";

/**
 * Fält för en sexsiffrig engångskod. `autocomplete="one-time-code"` + numeriskt tangentbord gör att
 * iOS och macOS kan föreslå koden från mejlet. Allt utom siffror rensas bort (även vid inklistring),
 * och formuläret skickas in av sig självt när sjätte siffran finns.
 */
export default function CodeInput({ className }: { className?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const sent = useRef(false);

  // En kod kan bara användas en gång. Auto-inskicket och ett klick på "Logga in" får inte båda gå iväg.
  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const onSubmit = (e: Event) => {
      if (sent.current) { e.preventDefault(); e.stopImmediatePropagation(); return; }
      sent.current = true;
      form.querySelectorAll("button").forEach((b) => b.setAttribute("disabled", ""));
    };
    form.addEventListener("submit", onSubmit, true);
    return () => form.removeEventListener("submit", onSubmit, true);
  }, []);

  return (
    <input
      ref={ref}
      name="token"
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]{6}"
      minLength={6}
      maxLength={6}
      required
      autoFocus
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      placeholder="000000"
      title="Sex siffror"
      className={className}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
        e.target.value = digits;
        if (digits.length === 6) ref.current?.form?.requestSubmit();
      }}
    />
  );
}
