"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Uppdaterar sidan var 5:e sekund så länge något körs. Pausar när fliken är dold. */
export default function RunPoller({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => { if (!document.hidden) router.refresh(); }, 5000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}
