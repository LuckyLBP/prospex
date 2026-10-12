"use client";

import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

export type SelectOption = { value: string; label: string; hint?: string; icon?: React.ReactNode; /** Rubrik som alternativet hör till. Alternativen ska redan vara sorterade så att samma rubrik ligger intill varandra. */ group?: string };

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  ariaLabel: string;
  /** Skickas med som fält i ett formulär. */
  name?: string;
  /** Text när inget är valt (värdet "" är ett giltigt val om det finns bland alternativen). */
  placeholder?: string;
  /** Sökruta i listan, för långa listor. */
  searchable?: boolean;
  className?: string;
  align?: "left" | "right";
};

/**
 * Egen rullista i portalens stil i stället för webbläsarens. Fungerar med tangentbord (pilar, Enter,
 * Esc, skriv för att söka) och är markerad som `data-hotkeys-off`, så att ringlägets egna genvägar inte
 * triggas medan man bläddrar i den.
 */
export default function Select({ value, onChange, options, ariaLabel, name, placeholder, searchable, className, align = "left" }: Props) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);
  const selected = options.find((o) => o.value === value);

  const close = (refocus = true) => { setOpen(false); setQuery(""); if (refocus) button.current?.focus(); };
  const pick = (v: string) => { onChange(v); close(); };

  // Öppna: markera det valda alternativet och flytta fokus till sökrutan om den finns.
  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    if (searchable) search.current?.focus();
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) close(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    if (open) list.current?.querySelectorAll('[role="option"]')[active]?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); setOpen(true); }
      return;
    }
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(shown.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(shown.length - 1); }
    else if (e.key === "Enter") { e.preventDefault(); if (shown[active]) pick(shown[active].value); }
    else if (e.key === "Tab") close(false);
  };

  return (
    <div ref={root} data-hotkeys-off className="relative" onKeyDown={onKeyDown}>
      {name && <input type="hidden" name={name} value={value} />}
      <button
        ref={button}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        onClick={() => (open ? close() : setOpen(true))}
        className={`inline-flex h-9 w-full items-center justify-between gap-2 rounded-full border bg-white pl-3.5 pr-2.5 text-left text-[13px] font-medium text-ink outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/30 ${
          open ? "border-accent" : "border-gray-200 hover:border-gray-300"
        } ${className ?? ""}`}
      >
        <span className={`flex min-w-0 items-center gap-2 ${selected ? "" : "text-gray-400"}`}>{selected?.icon}<span className="truncate">{selected?.label ?? placeholder ?? ""}</span></span>
        <ChevronDown size={15} className={`shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className={`dialer-toast absolute top-full z-40 mt-2 w-max min-w-full max-w-[320px] overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/[0.06] ${align === "right" ? "right-0" : "left-0"}`}>
          {searchable && (
            <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2.5">
              <Search size={14} className="shrink-0 text-gray-400" />
              <input
                ref={search}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Sök"
                aria-label="Sök i listan"
                className="w-full bg-transparent text-[13px] outline-none placeholder:text-gray-400"
              />
            </div>
          )}
          <ul ref={list} id={`${id}-list`} role="listbox" aria-label={ariaLabel} className="max-h-72 overflow-y-auto p-1.5">
            {shown.length === 0 && <li className="px-3 py-3 text-[13px] text-gray-500">Inga träffar</li>}
            {shown.map((o, i) => {
              const on = o.value === value;
              const heading = o.group && o.group !== shown[i - 1]?.group ? o.group : null;
              return (
                <Fragment key={o.value}>
                  {heading && <li role="presentation" className="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{heading}</li>}
                  <li
                    role="option"
                    aria-selected={on}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(o.value)}
                    className={`flex cursor-pointer items-center justify-between gap-4 rounded-xl px-3 py-2 text-[13px] ${i === active ? "bg-canvas" : ""} ${on ? "font-semibold text-ink" : "text-gray-800"}`}
                  >
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <Check size={14} className={on ? "text-accent" : "invisible"} />
                      {o.icon}
                      {o.label}
                    </span>
                    {o.hint && <span className="text-[12px] font-normal text-gray-400">{o.hint}</span>}
                  </li>
                </Fragment>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
