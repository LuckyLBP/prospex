"use client";

import { useState } from "react";
import Select, { type SelectOption } from "./Select";

/** Rullista för vanliga formulär: håller sitt eget val och skickas med som fält `name`. */
export default function FormSelect({ name, defaultValue, options, ariaLabel, className, searchable }: {
  name: string; defaultValue: string; options: SelectOption[]; ariaLabel: string; className?: string; searchable?: boolean;
}) {
  const [v, setV] = useState(defaultValue);
  return <Select name={name} value={v} onChange={setV} options={options} ariaLabel={ariaLabel} className={className} searchable={searchable} />;
}
