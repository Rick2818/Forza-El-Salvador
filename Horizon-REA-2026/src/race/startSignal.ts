export type StartSignalPhase = "red" | "yellow" | "green";

/** The signal reads the race clock; it never owns a second timer. */
export function startSignalPhase(state: string, remaining: number, showGreen = false): StartSignalPhase | null {
  if (state === "countdown") return remaining > 2 ? "red" : "yellow";
  return state === "racing" && showGreen ? "green" : null;
}
