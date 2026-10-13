"use client";

import { Logo } from "@/components/brand/Logo";
import { useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import { Shader, ChromaFlow, FilmGrain, FlutedGlass, Swirl } from "shaders/react";
import RollButton from "./RollButton";
import { TOTAL_COMPANIES, VERIFIED } from "@/lib/mock";

const NAV = [
  { label: "Så funkar det", href: "#sa-funkar-det" },
  { label: "Exempel", href: "#exempel" },
  { label: "För vem", href: "#for-vem" },
];
const EASE = "ease-[cubic-bezier(0.25,0.1,0.25,1)]";

export default function Hero() {
  const [open, setOpen] = useState(false);

  return (
    <section className="relative flex min-h-screen flex-col bg-canvas">
      <div className="pointer-events-none absolute inset-0 z-10">
        <Shader>
          <Swirl colorA="#ffffff" colorB="#f0f0f0" detail={1.7} />
          <ChromaFlow
            baseColor="#ffffff"
            downColor="#ff6a1a"
            leftColor="#ff6a1a"
            rightColor="#ff6a1a"
            upColor="#ff6a1a"
            momentum={13}
            radius={3.5}
          />
          <FlutedGlass
            aberration={0.61}
            angle={31}
            frequency={8}
            highlight={0.12}
            highlightSoftness={0}
            lightAngle={-90}
            refraction={4}
            shape="rounded"
            softness={1}
            speed={0.15}
          />
          <FilmGrain strength={0.05} />
        </Shader>
      </div>

      {/* Navigation */}
      <nav className="relative z-20 mx-auto w-full max-w-[1440px] p-2 sm:p-3">
        <div className="flex items-center justify-between rounded-full bg-white p-[5px]">
          <div className="flex items-center gap-6">
            <a href="/" aria-label="Prospex" className="flex items-center"><Logo height={46} /></a>
            <div className="hidden items-center gap-6 md:flex">
              {NAV.map((n) => (
                <a key={n.label} href={n.href} className="text-[14px] text-gray-900 transition-colors duration-300 hover:text-gray-500">
                  {n.label}
                </a>
              ))}
            </div>
          </div>

          <div className="hidden items-center gap-5 md:flex">
            <span className="text-[13px] text-gray-600">
              {TOTAL_COMPANIES.toLocaleString("sv-SE")} företag, verifierat {VERIFIED}
            </span>
            <RollButton
              label="Se exempellista"
            href="#exempel"
              className="bg-gray-900 py-2 pl-5 pr-2 text-[13px] text-white"
              circleClassName="h-6 w-6"
              arrowClassName="text-gray-900"
            />
          </div>

          <button
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-2 rounded-full bg-gray-900 py-2 pl-4 pr-3 text-[13px] font-medium text-white md:hidden"
          >
            {open ? "Stäng" : "Meny"}
            {open ? <X size={14} /> : <Menu size={14} />}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      <div className={`fixed inset-0 z-50 md:hidden ${open ? "" : "pointer-events-none"}`}>
        <div
          onClick={() => setOpen(false)}
          className={`absolute inset-0 bg-black/60 transition-opacity duration-500 ${open ? "opacity-100" : "opacity-0"}`}
        />
        <div
          className={`absolute inset-x-0 bottom-0 mx-3 mb-3 rounded-2xl bg-white p-5 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            open ? "translate-y-0" : "translate-y-full"
          }`}
        >
          <div className="mb-6 flex items-center justify-between">
            <span className="rounded-full border border-gray-200 px-3 py-1 text-[13px] text-gray-600">
              Verifierat {VERIFIED}
            </span>
            <button onClick={() => setOpen(false)} aria-label="Stäng meny" className="rounded-full bg-gray-900 p-2 text-white">
              <X size={14} />
            </button>
          </div>
          <div className="mb-8 flex flex-col gap-3">
            {NAV.map((n) => (
              <a key={n.label} href={n.href} onClick={() => setOpen(false)} className="text-[28px] font-medium text-gray-900 sm:text-[32px]">
                {n.label}
              </a>
            ))}
          </div>
          <a
            href="#exempel"
            className="flex w-full items-center justify-between rounded-full bg-gray-900 py-3 pl-6 pr-3 text-[14px] font-medium text-white"
          >
            Se exempellista
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white">
              <ArrowRight size={14} className="text-gray-900" />
            </span>
          </a>
        </div>
      </div>

      {/* Hero content */}
      <div className="flex-1" />
      <div className="relative z-20 mx-auto w-full max-w-[1440px] px-5 pb-14 sm:px-8 sm:pb-16 lg:px-12 lg:pb-20">
        <p className="mb-5 text-[13px] tracking-wide text-gray-900 sm:mb-8 sm:text-[14px]">Prospex</p>
        <h1 className="text-[clamp(1.75rem,7vw,4.2rem)] font-medium leading-[1.08] tracking-[-0.03em] text-gray-900 sm:text-[clamp(2.5rem,5vw,4.2rem)]">
          Ring företag som redan
          <br className="hidden sm:block" />
          <span className="sm:hidden"> </span>
          köper det du säljer,
          <br className="hidden sm:block" />
          <span className="sm:hidden"> </span>
          med bevis på varje rad.
        </h1>
        <p className="mt-6 max-w-[620px] text-[15px] leading-[1.6] text-gray-700 sm:text-[17px]">
          Prospektlistor på företag som redan köper webb och marknadsföring. Filtrera på leverantör, bransch och ort.
        </p>

        <div className="mt-8 flex flex-col gap-4 sm:mt-12 sm:flex-row sm:items-center sm:gap-5">
          <RollButton
            label="Se exempellista"
            href="#exempel"
            className="w-fit bg-accent py-2 pl-5 pr-2 text-[13px] text-ink hover:bg-accent-hover sm:pl-6 sm:text-[14px]"
            circleClassName="h-7 w-7 sm:h-8 sm:w-8"
            arrowClassName="text-accent"
          />
          <a href="#sa-funkar-det" className="w-fit text-[13px] font-medium text-gray-900 underline underline-offset-4 sm:text-[14px]">
            Så funkar det
          </a>
        </div>
      </div>
    </section>
  );
}
