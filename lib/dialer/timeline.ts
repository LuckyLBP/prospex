import type { CardLog, CardNote } from "./card-types";

export type TimelineItem =
  | { kind: "call"; at: string; log: CardLog }
  | { kind: "note"; at: string; note: CardNote };

/** Samtal och anteckningar som en tråd, äldst först, så att den nyaste ligger längst ner som i en chatt. */
export function buildTimeline(logs: readonly CardLog[], notes: readonly CardNote[]): TimelineItem[] {
  const items: TimelineItem[] = [
    ...logs.map((log): TimelineItem => ({ kind: "call", at: log.calledAt, log })),
    ...notes.map((note): TimelineItem => ({ kind: "note", at: note.createdAt, note })),
  ];
  return items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}
