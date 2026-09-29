import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { Category } from "@contracts/game.schemas";
import { drawLetters } from "@domain/draw-letters";
import { checkRound, fetchAiStatus, requestHint, type AiStatus } from "@client/api/ai-client";
import { gameReducer, initialGameState, type GameState } from "@client/state/game-reducer";

const TICK_MS = 250;

/** Unbiased integer in [0, maxExclusive) from the browser's CSPRNG. */
function cryptoRandomInt(maxExclusive: number): number {
  const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
  const buffer = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buffer);
    const value = buffer[0]!;
    if (value < limit) return value % maxExclusive;
  }
}

const newRequestId = (): string => crypto.randomUUID();

export type GameControls = {
  state: GameState;
  now: number;
  aiStatus: AiStatus;
  start(): void;
  changeAnswer(category: Category, value: string): void;
  finish(): void;
  next(): void;
  recheck(round: number): void;
  askHint(category: Category): void;
};

/**
 * Binds the pure reducer to the browser: the clock, the letter draw and the two
 * AI requests. Requests start from effects keyed by request id, guarded by refs,
 * so React's development double-invocation cannot send a request twice.
 */
export function useGame(): GameControls {
  const [state, dispatch] = useReducer(gameReducer, undefined, initialGameState);
  const [now, setNow] = useState(() => Date.now());
  const [aiStatus, setAiStatus] = useState<AiStatus>("unknown");

  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    void fetchAiStatus().then(setAiStatus);
  }, []);

  /* ------------------------------------------------------------ the clock */

  const { phase } = state;
  useEffect(() => {
    if (phase !== "countdown" && phase !== "answering") return;
    const timer = setInterval(() => {
      const at = Date.now();
      setNow(at);
      dispatch({ type: "TICK", now: at });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [phase]);

  /* ------------------------------------------------------ the round check */

  // A round that has just ended gets exactly one check request.
  const checkKeyRef = useRef<string | null>(null);
  const round = state.rounds[state.current];
  const roundKey = round ? `${round.startsAt}` : null;
  useEffect(() => {
    if (phase !== "checking" || state.pendingCheck || !roundKey) return;
    if (checkKeyRef.current === roundKey) return;
    checkKeyRef.current = roundKey;
    dispatch({ type: "CHECK_STARTED", requestId: newRequestId() });
  }, [phase, state.pendingCheck, roundKey]);

  const sentCheckRef = useRef<string | null>(null);
  const pendingCheck = state.pendingCheck;
  useEffect(() => {
    if (!pendingCheck || sentCheckRef.current === pendingCheck.requestId) return;
    sentCheckRef.current = pendingCheck.requestId;

    const target = stateRef.current.rounds[pendingCheck.round];
    if (!target) return;
    const { requestId } = pendingCheck;
    void checkRound({ letter: target.letter, answers: target.answers }).then((outcome) => {
      dispatch(
        outcome.ok
          ? { type: "CHECK_OK", requestId, result: outcome.result }
          : { type: "CHECK_FAILED", requestId, reason: outcome.reason, retryable: outcome.retryable },
      );
    });
  }, [pendingCheck]);

  /* ---------------------------------------------------------------- hints */

  const hintControllerRef = useRef<AbortController | null>(null);
  const sentHintRef = useRef<string | null>(null);
  const pendingHint = state.pendingHint;
  useEffect(() => {
    if (!pendingHint) {
      // The round ended (or the hint settled): stop waiting for it.
      hintControllerRef.current?.abort();
      hintControllerRef.current = null;
      return;
    }
    if (sentHintRef.current === pendingHint.requestId) return;
    sentHintRef.current = pendingHint.requestId;

    const target = stateRef.current.rounds[stateRef.current.current];
    if (!target) return;
    const controller = new AbortController();
    hintControllerRef.current = controller;
    const { requestId, category } = pendingHint;
    void requestHint({ letter: target.letter, category }, controller.signal).then((outcome) => {
      if (!outcome.ok) dispatch({ type: "HINT_FAILED", requestId, quotaExhausted: outcome.quotaExhausted });
      else if (outcome.kind === "clue") dispatch({ type: "HINT_OK", requestId, clue: outcome.clue });
      else dispatch({ type: "HINT_NO_TERM", requestId });
    });
  }, [pendingHint]);

  /* -------------------------------------------------------------- actions */

  const start = useCallback(() => {
    const at = Date.now();
    setNow(at);
    dispatch({ type: "START", now: at, letters: drawLetters(cryptoRandomInt) });
  }, []);

  const changeAnswer = useCallback((category: Category, value: string) => {
    dispatch({ type: "ANSWER_CHANGED", category, value, now: Date.now() });
  }, []);

  const finish = useCallback(() => dispatch({ type: "FINISH", now: Date.now() }), []);

  const next = useCallback(() => {
    const at = Date.now();
    setNow(at);
    dispatch({ type: "NEXT", now: at });
  }, []);

  const recheck = useCallback((roundIndex: number) => {
    dispatch({ type: "RECHECK_STARTED", round: roundIndex, requestId: newRequestId() });
  }, []);

  const askHint = useCallback((category: Category) => {
    dispatch({ type: "HINT_STARTED", category, requestId: newRequestId() });
  }, []);

  return { state, now, aiStatus, start, changeAnswer, finish, next, recheck, askHint };
}
