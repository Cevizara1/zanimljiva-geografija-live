import {
  COUNTDOWN_MS,
  HINT_CREDITS_PER_GAME,
  ROUNDS_PER_GAME,
  ROUND_DURATION_MS,
  emptyAnswers,
  type Answers,
  type Category,
  type Letter,
} from "@contracts/game.schemas";
import { scoreRoundLocally, type RoundResult } from "@domain/score-round";

/*
 * The whole game in one pure reducer. Time enters only through events that
 * carry `now`, so a test drives it without fake timers. Every event that is not
 * allowed in the current state returns the same state object.
 */

export type Phase = "idle" | "countdown" | "answering" | "checking" | "round_results" | "game_results";

export type HintView =
  | { status: "loading" }
  | { status: "shown"; clue: string }
  | { status: "no_term" }
  | { status: "failed" }
  | { status: "quota_exhausted" };

export type UnverifiedReason = "temporary" | "not_configured" | "quota_exhausted";

export type RoundState = {
  letter: Letter;
  startsAt: number;
  endsAt: number;
  answers: Answers;
  endedBy: "finish" | "deadline" | null;
  result: RoundResult | null;
  /** Set when the result is the local fallback; drives the message and "Proveri ponovo". */
  unverified: { reason: UnverifiedReason; retryable: boolean } | null;
  hints: Partial<Record<Category, HintView>>;
};

export type GameState = {
  phase: Phase;
  letters: Letter[];
  rounds: RoundState[];
  /** Index of the round being played or last shown. */
  current: number;
  hintCredits: number;
  /** The one check request whose answer we are waiting for. */
  pendingCheck: { round: number; requestId: string } | null;
  pendingHint: { category: Category; requestId: string } | null;
};

export type GameEvent =
  | { type: "START"; now: number; letters: Letter[] }
  | { type: "TICK"; now: number }
  | { type: "ANSWER_CHANGED"; category: Category; value: string; now: number }
  | { type: "FINISH"; now: number }
  | { type: "CHECK_STARTED"; requestId: string }
  | { type: "RECHECK_STARTED"; round: number; requestId: string }
  | { type: "CHECK_OK"; requestId: string; result: RoundResult }
  | { type: "CHECK_FAILED"; requestId: string; reason: UnverifiedReason; retryable: boolean }
  | { type: "NEXT"; now: number }
  | { type: "HINT_STARTED"; category: Category; requestId: string }
  | { type: "HINT_OK"; requestId: string; clue: string }
  | { type: "HINT_NO_TERM"; requestId: string }
  | { type: "HINT_FAILED"; requestId: string; quotaExhausted?: boolean };

export function initialGameState(): GameState {
  return {
    phase: "idle",
    letters: [],
    rounds: [],
    current: 0,
    hintCredits: HINT_CREDITS_PER_GAME,
    pendingCheck: null,
    pendingHint: null,
  };
}

function newRound(letter: Letter, now: number): RoundState {
  const startsAt = now + COUNTDOWN_MS;
  return {
    letter,
    startsAt,
    endsAt: startsAt + ROUND_DURATION_MS,
    answers: emptyAnswers(),
    endedBy: null,
    result: null,
    unverified: null,
    hints: {},
  };
}

function replaceRound(state: GameState, index: number, round: RoundState): RoundState[] {
  return state.rounds.map((existing, at) => (at === index ? round : existing));
}

/** Locks the current round. A pending hint is abandoned and costs nothing. */
function endRound(state: GameState, endedBy: "finish" | "deadline"): GameState {
  const round = state.rounds[state.current]!;
  const hints = { ...round.hints };
  if (state.pendingHint) delete hints[state.pendingHint.category];

  return {
    ...state,
    phase: "checking",
    pendingHint: null,
    rounds: replaceRound(state, state.current, { ...round, endedBy, hints }),
  };
}

function afterCheck(state: GameState, round: number): Phase {
  // An initial check moves the game on; a recheck leaves the player where they are.
  return state.phase === "checking" && round === state.current ? "round_results" : state.phase;
}

function settleHint(state: GameState, requestId: string, view: HintView, spend: boolean): GameState {
  const pending = state.pendingHint;
  if (!pending || pending.requestId !== requestId || state.phase !== "answering") return state;

  const round = state.rounds[state.current]!;
  return {
    ...state,
    pendingHint: null,
    hintCredits: spend ? state.hintCredits - 1 : state.hintCredits,
    rounds: replaceRound(state, state.current, {
      ...round,
      hints: { ...round.hints, [pending.category]: view },
    }),
  };
}

export function gameReducer(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case "START": {
      if (state.phase !== "idle" && state.phase !== "game_results") return state;
      const [first] = event.letters;
      if (!first || event.letters.length !== ROUNDS_PER_GAME) return state;
      return {
        ...initialGameState(),
        phase: "countdown",
        letters: [...event.letters],
        rounds: [newRound(first, event.now)],
      };
    }

    case "TICK": {
      const round = state.rounds[state.current];
      if (!round) return state;
      if (state.phase === "countdown" && event.now >= round.startsAt) {
        return event.now >= round.endsAt ? endRound({ ...state, phase: "answering" }, "deadline") : { ...state, phase: "answering" };
      }
      if (state.phase === "answering" && event.now >= round.endsAt) return endRound(state, "deadline");
      return state;
    }

    case "ANSWER_CHANGED": {
      const round = state.rounds[state.current];
      if (state.phase !== "answering" || !round || event.now >= round.endsAt) return state;
      if (round.answers[event.category] === event.value) return state;
      return {
        ...state,
        rounds: replaceRound(state, state.current, {
          ...round,
          answers: { ...round.answers, [event.category]: event.value },
        }),
      };
    }

    case "FINISH": {
      const round = state.rounds[state.current];
      if (state.phase !== "answering" || !round) return state;
      return endRound(state, event.now >= round.endsAt ? "deadline" : "finish");
    }

    case "CHECK_STARTED": {
      if (state.phase !== "checking" || state.pendingCheck) return state;
      return { ...state, pendingCheck: { round: state.current, requestId: event.requestId } };
    }

    case "RECHECK_STARTED": {
      const round = state.rounds[event.round];
      const shown = state.phase === "round_results" || state.phase === "game_results";
      if (!shown || state.pendingCheck || !round?.result || round.result.verified) return state;
      return { ...state, pendingCheck: { round: event.round, requestId: event.requestId } };
    }

    case "CHECK_OK": {
      const pending = state.pendingCheck;
      if (!pending || pending.requestId !== event.requestId) return state;
      const round = state.rounds[pending.round]!;
      return {
        ...state,
        phase: afterCheck(state, pending.round),
        pendingCheck: null,
        rounds: replaceRound(state, pending.round, { ...round, result: event.result, unverified: null }),
      };
    }

    case "CHECK_FAILED": {
      const pending = state.pendingCheck;
      if (!pending || pending.requestId !== event.requestId) return state;
      const round = state.rounds[pending.round]!;
      // A failed recheck keeps the provisional result it already had.
      const result = round.result ?? scoreRoundLocally(round.answers, round.letter);
      return {
        ...state,
        phase: afterCheck(state, pending.round),
        pendingCheck: null,
        rounds: replaceRound(state, pending.round, {
          ...round,
          result,
          unverified: { reason: event.reason, retryable: event.retryable },
        }),
      };
    }

    case "NEXT": {
      if (state.phase !== "round_results") return state;
      const next = state.current + 1;
      const letter = state.letters[next];
      if (!letter) return { ...state, phase: "game_results" };
      return {
        ...state,
        phase: "countdown",
        current: next,
        rounds: [...state.rounds, newRound(letter, event.now)],
      };
    }

    case "HINT_STARTED": {
      const round = state.rounds[state.current];
      if (state.phase !== "answering" || !round || state.pendingHint || state.hintCredits <= 0) return state;
      const existing = round.hints[event.category];
      if (existing && existing.status !== "failed") return state;
      return {
        ...state,
        pendingHint: { category: event.category, requestId: event.requestId },
        rounds: replaceRound(state, state.current, {
          ...round,
          hints: { ...round.hints, [event.category]: { status: "loading" } },
        }),
      };
    }

    case "HINT_OK":
      return settleHint(state, event.requestId, { status: "shown", clue: event.clue }, true);

    case "HINT_NO_TERM":
      return settleHint(state, event.requestId, { status: "no_term" }, false);

    case "HINT_FAILED":
      return settleHint(state, event.requestId, event.quotaExhausted ? { status: "quota_exhausted" } : { status: "failed" }, false);
  }
}

/* --------------------------------------------------------------- selectors */

export function currentRound(state: GameState): RoundState | null {
  return state.rounds[state.current] ?? null;
}

export function selectMsToStart(state: GameState, now: number): number {
  const round = currentRound(state);
  return round ? Math.max(0, round.startsAt - now) : 0;
}

export function selectRemainingMs(state: GameState, now: number): number {
  const round = currentRound(state);
  return round ? Math.max(0, round.endsAt - now) : 0;
}

export function selectTotal(state: GameState): number {
  return state.rounds.reduce((total, round) => total + (round.result?.points ?? 0), 0);
}

export function selectHasUnverified(state: GameState): boolean {
  return state.rounds.some((round) => round.result !== null && !round.result.verified);
}
