import { describe, expect, it } from "vitest";
import {
  COUNTDOWN_MS,
  HINT_CREDITS_PER_GAME,
  ROUND_DURATION_MS,
  emptyAnswers,
  type Letter,
} from "@contracts/game.schemas";
import type { RoundResult } from "@domain/score-round";
import {
  gameReducer,
  initialGameState,
  selectMsToStart,
  selectRemainingMs,
  selectTotal,
  type GameEvent,
  type GameState,
} from "@client/state/game-reducer";

const LETTERS: Letter[] = ["S", "B", "Č", "D", "N"];
const T0 = 1_000_000;
const START = T0 + COUNTDOWN_MS;
const END = START + ROUND_DURATION_MS;

const run = (events: GameEvent[], from: GameState = initialGameState()): GameState =>
  events.reduce(gameReducer, from);

const answering = (): GameState =>
  run([
    { type: "START", now: T0, letters: LETTERS },
    { type: "TICK", now: START },
  ]);

const checking = (): GameState =>
  run([{ type: "FINISH", now: START + 10 }, { type: "CHECK_STARTED", requestId: "r1" }], answering());

const verifiedResult = (points: number): RoundResult => ({
  lines: [],
  points,
  verified: true,
});

describe("game reducer — the five-round loop (001 contracts/game-reducer.md)", () => {
  it("START begins round 1 with a countdown and the first drawn letter", () => {
    const state = run([{ type: "START", now: T0, letters: LETTERS }]);
    expect(state.phase).toBe("countdown");
    expect(state.rounds).toHaveLength(1);
    expect(state.rounds[0]).toMatchObject({ letter: "S", startsAt: START, endsAt: END });
    expect(state.hintCredits).toBe(HINT_CREDITS_PER_GAME);
    expect(selectMsToStart(state, T0 + 1_000)).toBe(COUNTDOWN_MS - 1_000);
  });

  it("TICK opens answering exactly at startsAt", () => {
    const early = run([{ type: "START", now: T0, letters: LETTERS }, { type: "TICK", now: START - 1 }]);
    expect(early.phase).toBe("countdown");
    expect(answering().phase).toBe("answering");
  });

  it("records typing only while answering and before the deadline", () => {
    const typed = gameReducer(answering(), { type: "ANSWER_CHANGED", category: "country", value: "Srbija", now: START + 5 });
    expect(typed.rounds[0]!.answers.country).toBe("Srbija");

    const late = gameReducer(typed, { type: "ANSWER_CHANGED", category: "city", value: "Sombor", now: END });
    expect(late).toBe(typed);
  });

  it("derives remaining time from endsAt, so a sleeping tab cannot extend a round (SC-005)", () => {
    const state = answering();
    expect(selectRemainingMs(state, START + 60_000)).toBe(ROUND_DURATION_MS - 60_000);
    // Three minutes later, one tick is enough to end it.
    const woken = gameReducer(state, { type: "TICK", now: START + 180_000 });
    expect(woken.phase).toBe("checking");
    expect(woken.rounds[0]!.endedBy).toBe("deadline");
  });

  it("FINISH ends the round once; a second FINISH changes nothing", () => {
    const finished = gameReducer(answering(), { type: "FINISH", now: START + 10 });
    expect(finished.phase).toBe("checking");
    expect(finished.rounds[0]!.endedBy).toBe("finish");
    expect(gameReducer(finished, { type: "FINISH", now: START + 20 })).toBe(finished);
    expect(gameReducer(finished, { type: "TICK", now: END + 5 })).toBe(finished);
  });

  it("a verified check result scores the round and shows its results", () => {
    const scored = gameReducer(checking(), { type: "CHECK_OK", requestId: "r1", result: verifiedResult(40) });
    expect(scored.phase).toBe("round_results");
    expect(scored.rounds[0]!.result?.verified).toBe(true);
    expect(selectTotal(scored)).toBe(40);
  });

  it("NEXT is refused while the check is running (C04)", () => {
    const state = checking();
    expect(gameReducer(state, { type: "NEXT", now: END })).toBe(state);
  });

  it("plays five rounds, then shows the game results with the summed total", () => {
    let state = initialGameState();
    let now = T0;
    state = gameReducer(state, { type: "START", now, letters: LETTERS });
    for (let round = 0; round < 5; round++) {
      now = state.rounds[round]!.startsAt;
      state = run([
        { type: "TICK", now },
        { type: "FINISH", now: now + 1 },
        { type: "CHECK_STARTED", requestId: `r${round}` },
        { type: "CHECK_OK", requestId: `r${round}`, result: verifiedResult(10 * (round + 1)) },
      ], state);
      expect(state.phase).toBe("round_results");
      state = gameReducer(state, { type: "NEXT", now: now + 2 });
    }
    expect(state.phase).toBe("game_results");
    expect(state.rounds.map((round) => round.letter)).toEqual(LETTERS);
    expect(selectTotal(state)).toBe(10 + 20 + 30 + 40 + 50);
  });

  it("START after a finished game begins a fresh sheet", () => {
    const fresh = gameReducer(
      { ...answering(), phase: "game_results" },
      { type: "START", now: T0 + 5, letters: ["A", "K", "M", "P", "R"] },
    );
    expect(fresh.rounds).toHaveLength(1);
    expect(fresh.rounds[0]!.letter).toBe("A");
    expect(fresh.rounds[0]!.answers).toEqual(emptyAnswers());
    expect(fresh.hintCredits).toBe(HINT_CREDITS_PER_GAME);
  });

  it("returns the same state object for every event that is not allowed now", () => {
    const idle = initialGameState();
    for (const event of [
      { type: "TICK", now: T0 },
      { type: "FINISH", now: T0 },
      { type: "NEXT", now: T0 },
      { type: "ANSWER_CHANGED", category: "city", value: "x", now: T0 },
      { type: "CHECK_OK", requestId: "x", result: verifiedResult(0) },
      { type: "HINT_STARTED", category: "city", requestId: "h" },
    ] satisfies GameEvent[]) {
      expect(gameReducer(idle, event)).toBe(idle);
    }
    const playing = answering();
    expect(gameReducer(playing, { type: "START", now: T0, letters: LETTERS })).toBe(playing);
  });
});

describe("game reducer — the AI check can fail safely (002)", () => {
  it("scores locally and marks the round unverified when the check fails (C02)", () => {
    const typed = run(
      [
        { type: "ANSWER_CHANGED", category: "country", value: "Srbija", now: START + 1 },
        { type: "ANSWER_CHANGED", category: "city", value: "Beograd", now: START + 2 },
        { type: "FINISH", now: START + 3 },
        { type: "CHECK_STARTED", requestId: "r1" },
      ],
      answering(),
    );
    const failed = gameReducer(typed, { type: "CHECK_FAILED", requestId: "r1", reason: "temporary", retryable: true });
    expect(failed.phase).toBe("round_results");
    expect(failed.rounds[0]!.result).toMatchObject({ verified: false, points: 10 });
    expect(failed.rounds[0]!.unverified).toEqual({ reason: "temporary", retryable: true });
  });

  it("ignores a response for a request that is no longer pending (C05)", () => {
    const state = checking();
    expect(gameReducer(state, { type: "CHECK_OK", requestId: "old", result: verifiedResult(80) })).toBe(state);
  });

  it("a successful recheck replaces the provisional result and the total (C03)", () => {
    const provisional = gameReducer(checking(), { type: "CHECK_FAILED", requestId: "r1", reason: "temporary", retryable: true });
    const rechecking = gameReducer(provisional, { type: "RECHECK_STARTED", round: 0, requestId: "r2" });
    expect(rechecking.pendingCheck).toEqual({ round: 0, requestId: "r2" });

    const verified = gameReducer(rechecking, { type: "CHECK_OK", requestId: "r2", result: verifiedResult(70) });
    expect(verified.rounds[0]!.result?.verified).toBe(true);
    expect(verified.rounds[0]!.unverified).toBeNull();
    expect(selectTotal(verified)).toBe(70);
    expect(verified.phase).toBe("round_results");
  });

  it("a failed recheck keeps the provisional result", () => {
    const provisional = gameReducer(checking(), { type: "CHECK_FAILED", requestId: "r1", reason: "temporary", retryable: true });
    const again = run(
      [
        { type: "RECHECK_STARTED", round: 0, requestId: "r2" },
        { type: "CHECK_FAILED", requestId: "r2", reason: "temporary", retryable: true },
      ],
      provisional,
    );
    expect(again.rounds[0]!.result).toEqual(provisional.rounds[0]!.result);
    expect(again.pendingCheck).toBeNull();
  });

  it("refuses a recheck of a verified round, or while another check runs", () => {
    const verified = gameReducer(checking(), { type: "CHECK_OK", requestId: "r1", result: verifiedResult(10) });
    expect(gameReducer(verified, { type: "RECHECK_STARTED", round: 0, requestId: "r2" })).toBe(verified);
  });
});

describe("game reducer — hint credits (002 C01)", () => {
  const withHint = (): GameState => gameReducer(answering(), { type: "HINT_STARTED", category: "river", requestId: "h1" });

  it("spends a credit only when a clue is shown", () => {
    const shown = gameReducer(withHint(), { type: "HINT_OK", requestId: "h1", clue: "Reka kroz Beograd." });
    expect(shown.hintCredits).toBe(HINT_CREDITS_PER_GAME - 1);
    expect(shown.rounds[0]!.hints.river).toEqual({ status: "shown", clue: "Reka kroz Beograd." });
    expect(shown.pendingHint).toBeNull();
  });

  it("keeps the credit when there is no known term, or the hint fails", () => {
    const noTerm = gameReducer(withHint(), { type: "HINT_NO_TERM", requestId: "h1" });
    expect(noTerm.hintCredits).toBe(HINT_CREDITS_PER_GAME);
    expect(noTerm.rounds[0]!.hints.river).toEqual({ status: "no_term" });

    const failed = gameReducer(withHint(), { type: "HINT_FAILED", requestId: "h1" });
    expect(failed.hintCredits).toBe(HINT_CREDITS_PER_GAME);
    expect(failed.rounds[0]!.hints.river).toEqual({ status: "failed" });
  });

  it("allows another try after a failed hint, but only one shown hint per category", () => {
    const failed = gameReducer(withHint(), { type: "HINT_FAILED", requestId: "h1" });
    expect(gameReducer(failed, { type: "HINT_STARTED", category: "river", requestId: "h2" }).pendingHint).toEqual({
      category: "river",
      requestId: "h2",
    });

    const shown = gameReducer(withHint(), { type: "HINT_OK", requestId: "h1", clue: "Reka kroz Beograd." });
    expect(gameReducer(shown, { type: "HINT_STARTED", category: "river", requestId: "h3" })).toBe(shown);
  });

  it("allows one pending hint at a time and none without credits", () => {
    const pending = withHint();
    expect(gameReducer(pending, { type: "HINT_STARTED", category: "city", requestId: "h2" })).toBe(pending);

    const broke = { ...answering(), hintCredits: 0 };
    expect(gameReducer(broke, { type: "HINT_STARTED", category: "city", requestId: "h2" })).toBe(broke);
  });

  it("abandons a pending hint when the round ends, without spending the credit", () => {
    const ended = gameReducer(withHint(), { type: "FINISH", now: START + 5 });
    expect(ended.pendingHint).toBeNull();
    expect(ended.rounds[0]!.hints.river).toBeUndefined();
    expect(ended.hintCredits).toBe(HINT_CREDITS_PER_GAME);
    // A late answer for the abandoned request is ignored.
    expect(gameReducer(ended, { type: "HINT_OK", requestId: "h1", clue: "kasno" })).toBe(ended);
  });

  it("carries the remaining credits into the next round", () => {
    const shown = gameReducer(withHint(), { type: "HINT_OK", requestId: "h1", clue: "Reka kroz Beograd." });
    const next = run(
      [
        { type: "FINISH", now: START + 5 },
        { type: "CHECK_STARTED", requestId: "r1" },
        { type: "CHECK_OK", requestId: "r1", result: verifiedResult(0) },
        { type: "NEXT", now: START + 10 },
      ],
      shown,
    );
    expect(next.hintCredits).toBe(HINT_CREDITS_PER_GAME - 1);
    expect(next.rounds[1]!.hints).toEqual({});
  });
});
