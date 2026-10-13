// Att fortsätta en sparad lista. Listan är fryst i den ordning den byggdes, men kontrolleras mot vilka företag som
// fortfarande får ringas: de som ringts sedan dess faller bort. Ren och testad.

export interface Resumed {
  /** De sparade företagen som fortfarande får ringas, i sparad ordning. */
  ids: string[];
  /** Var i `ids` man fortsätter: första kvarvarande företaget vid eller efter det man var på. Lika med `ids.length` när inget återstår. */
  startIndex: number;
}

export function resumeList(saved: readonly string[], currentId: string | null, eligible: ReadonlySet<string>): Resumed {
  const at = new Map(saved.map((id, i) => [id, i]));
  const ids = saved.filter((id) => eligible.has(id));
  const from = currentId !== null ? (at.get(currentId) ?? 0) : 0;
  const found = ids.findIndex((id) => (at.get(id) ?? 0) >= from);
  return { ids, startIndex: found === -1 ? ids.length : found };
}
