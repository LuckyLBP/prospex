import { outcomeInfo, type CallOutcome } from "@/lib/calls/outcomes";
import { defaultMeeting } from "./quickdates";

// Samtalsformuläret i ringläget och reglerna för vad ett val i menyn gör. Ren och testad.

export type CallFormState = {
  outcome: CallOutcome | null;
  /** Anteckningen skrivs i chatten, så den är inte en del av utfallsformuläret. */
  cbDate: string;
  cbTime: string;
  meeting: string;
  archive: boolean;
};

export const EMPTY_FORM: CallFormState = { outcome: null, cbDate: "", cbTime: "", meeting: "", archive: false };

export const MEETING_OK = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** Formuläret när ett utfall väljs. Fält som det nya utfallet inte använder rensas, så ett spöke från förra valet inte hänger kvar. */
export function withOutcome(f: CallFormState, o: CallOutcome): CallFormState {
  const i = outcomeInfo(o);
  return { ...f, outcome: o, cbDate: i.callback ? f.cbDate : "", cbTime: i.callback ? f.cbTime : "", meeting: i.meeting ? f.meeting || defaultMeeting() : "", archive: i.terminal };
}

/** Går det att spara formuläret? Ett möte kräver en tid. */
export function canSaveForm(f: CallFormState): boolean {
  if (!f.outcome) return false;
  return !outcomeInfo(f.outcome).meeting || MEETING_OK.test(f.meeting);
}

/** Ett val i menyn: spara direkt, eller bara välja (ett möte behöver en tid först). */
export function menuChoice(o: CallOutcome): "save" | "select" {
  return outcomeInfo(o).meeting ? "select" : "save";
}
