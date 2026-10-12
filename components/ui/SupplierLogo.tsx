"use client";

import { useState } from "react";
import { logoUrl } from "@/lib/supplier-logo";

const SIZES = { 20: "h-5 w-5 rounded-md text-[9px]", 24: "h-6 w-6 rounded-lg text-[10px]", 32: "h-8 w-8 rounded-lg text-[11px]", 40: "h-10 w-10 rounded-xl text-[13px]" } as const;

/** Leverantörens logotyp i en liten ruta. Saknas den, eller går den inte att läsa, visas initialer. */
export default function SupplierLogo({ name, logo, size = 32, className = "", fallback }: { name: string; logo?: string | null; size?: keyof typeof SIZES; className?: string; /** Visas i stället för initialer när logotyp saknas, till exempel kategorins ikon. */ fallback?: React.ReactNode }) {
  const [broken, setBroken] = useState(false);
  const src = logoUrl(logo);
  const box = `inline-flex shrink-0 items-center justify-center overflow-hidden ${SIZES[size]} ${className}`;
  if (src && !broken) {
    return (
      <span className={`${box} bg-white ring-1 ring-black/[0.08]`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} className="h-full w-full object-contain p-[2px]" />
      </span>
    );
  }
  if (fallback) return <span aria-hidden className={`${box} bg-gray-100 text-gray-500`}>{fallback}</span>;
  const initials = name.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
  return <span aria-hidden className={`${box} bg-gray-100 font-semibold text-gray-500`}>{initials}</span>;
}
