import { describe, expect, it } from "vitest";
import { keyAction, type KeyInput } from "./keys";

const base: KeyInput = { key: "", meta: false, ctrl: false, alt: false, target: "other", canSave: true };
const k = (o: Partial<KeyInput>) => keyAction({ ...base, ...o });

describe("outcome keys", () => {
  it("1 to 9 and 0 pick the ten outcomes", () => {
    expect(k({ key: "1" })).toEqual({ type: "outcome", value: "no_answer" });
    expect(k({ key: "5" })).toEqual({ type: "outcome", value: "meeting_booked" });
    expect(k({ key: "0" })).toEqual({ type: "outcome", value: "skip_number" });
  });
  it("does nothing while typing in a field, so a note can contain digits and letters", () => {
    for (const key of ["1", "s", "n", "c", "v", "i", "z", "?", "ArrowLeft", "ArrowRight"]) expect(k({ key, target: "field" })).toBeNull();
  });
  it("ignores digits with a modifier held", () => {
    expect(k({ key: "1", meta: true })).toBeNull();
    expect(k({ key: "1", alt: true })).toBeNull();
  });
});

describe("Enter", () => {
  it("saves when nothing special has focus and saving is possible", () => {
    expect(k({ key: "Enter" })).toEqual({ type: "save" });
  });
  it("does not save when it is not possible yet", () => {
    expect(k({ key: "Enter", canSave: false })).toBeNull();
  });
  it("leaves Enter alone on a button, so it is never a double action", () => {
    expect(k({ key: "Enter", target: "button" })).toBeNull();
  });
  it("leaves Enter alone in a field, so the note can have line breaks", () => {
    expect(k({ key: "Enter", target: "field" })).toBeNull();
  });
  it("saves with Cmd or Ctrl plus Enter, even from the note field", () => {
    expect(k({ key: "Enter", meta: true, target: "field" })).toEqual({ type: "save" });
    expect(k({ key: "Enter", ctrl: true, target: "field" })).toEqual({ type: "save" });
    expect(k({ key: "Enter", meta: true, target: "field", canSave: false })).toBeNull();
  });
});

describe("Escape", () => {
  it("leaves a field so the keys are alive again", () => {
    expect(k({ key: "Escape", target: "field" })).toEqual({ type: "blur" });
  });
  it("does nothing elsewhere", () => {
    expect(k({ key: "Escape" })).toBeNull();
  });
});

describe("navigation and helpers", () => {
  it("skips with S or the right arrow, goes back with the left arrow", () => {
    expect(k({ key: "s" })).toEqual({ type: "skip" });
    expect(k({ key: "ArrowRight" })).toEqual({ type: "skip" });
    expect(k({ key: "ArrowLeft" })).toEqual({ type: "back" });
  });
  it("reveals the number, and then calls, with V", () => {
    expect(k({ key: "v" })).toEqual({ type: "call" });
    expect(k({ key: "V" })).toEqual({ type: "call" });
    expect(k({ key: "v", target: "field" })).toBeNull();
  });
  it("opens the company information with I, but not while typing", () => {
    expect(k({ key: "i" })).toEqual({ type: "info" });
    expect(k({ key: "I", target: "field" })).toBeNull();
  });
  it("focuses the note with N, copies with C, opens help with ?", () => {
    expect(k({ key: "n" })).toEqual({ type: "note" });
    expect(k({ key: "C" })).toEqual({ type: "copy" });
    expect(k({ key: "?" })).toEqual({ type: "help" });
  });
  it("undoes with Z or Cmd+Z, but Cmd+Z in a field is the text undo", () => {
    expect(k({ key: "z" })).toEqual({ type: "undo" });
    expect(k({ key: "z", meta: true })).toEqual({ type: "undo" });
    expect(k({ key: "z", meta: true, target: "field" })).toBeNull();
  });
  it("ignores other modified keys, like Cmd+C copying text", () => {
    expect(k({ key: "c", meta: true })).toBeNull();
  });
});

describe("dialog", () => {
  it("only closes, and swallows everything else while open", () => {
    expect(k({ key: "Escape", dialogOpen: true })).toEqual({ type: "close" });
    expect(k({ key: "?", dialogOpen: true })).toEqual({ type: "close" });
    expect(k({ key: "1", dialogOpen: true })).toBeNull();
    expect(k({ key: "Enter", dialogOpen: true })).toBeNull();
  });
});
