import { useEffect, useState } from "react";
import { useGame } from "@client/state/useGame";
import { selectMsToStart, selectRemainingMs, selectTotal } from "@client/state/game-reducer";
import { StartScreen } from "@client/screens/StartScreen";
import { CountdownScreen } from "@client/screens/CountdownScreen";
import { AnswerScreen } from "@client/screens/AnswerScreen";
import { ResultsScreen } from "@client/screens/ResultsScreen";
import { ThemeToggle } from "@client/ThemeToggle";
import { UI_SR } from "@client/strings";

/** Seconds at which the countdown is announced, instead of every second. */
const ANNOUNCED_SECONDS = new Set([60, 30, 10, 5, 4, 3, 2, 1, 0]);

export function App() {
  const game = useGame();
  const { state, now } = game;
  const round = state.rounds[state.current];
  const [announcement, setAnnouncement] = useState("");

  const remainingMs = selectRemainingMs(state, now);
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  useEffect(() => {
    if (state.phase === "answering" && ANNOUNCED_SECONDS.has(remainingSeconds)) {
      setAnnouncement(`${UI_SR.timeLeft}: ${remainingSeconds} s`);
    }
  }, [state.phase, remainingSeconds]);

  const hintsAvailable = game.aiStatus !== "not_configured";

  let body;
  switch (state.phase) {
    case "countdown":
      body = (
        <CountdownScreen
          secondsToStart={Math.ceil(selectMsToStart(state, now) / 1000)}
          letter={round?.letter ?? ""}
          roundNumber={state.current + 1}
        />
      );
      break;

    case "answering":
    case "checking":
      body = round ? (
        <AnswerScreen
          letter={round.letter}
          roundNumber={state.current + 1}
          remainingMs={state.phase === "checking" ? 0 : remainingMs}
          answers={round.answers}
          earlierAnswers={state.rounds.slice(0, state.current).map((earlier) => earlier.answers)}
          // At zero the form locks at once; the reducer ends the round on its next tick.
          locked={state.phase === "checking" || remainingMs === 0}
          checking={state.phase === "checking"}
          announcement={announcement}
          hintCredits={state.hintCredits}
          hintsAvailable={hintsAvailable}
          hints={round.hints}
          hintPending={state.pendingHint !== null}
          onChange={game.changeAnswer}
          onFinish={game.finish}
          onHint={game.askHint}
        />
      ) : null;
      break;

    case "round_results":
    case "game_results":
      body = (
        <ResultsScreen
          rounds={state.rounds}
          current={state.current}
          final={state.phase === "game_results"}
          total={selectTotal(state)}
          recheckingRound={state.pendingCheck?.round ?? null}
          onRecheck={game.recheck}
          onNext={game.next}
          onNewGame={game.start}
        />
      );
      break;

    case "idle":
    default:
      body = <StartScreen onStart={game.start} />;
  }

  return (
    <>
      <header className="site-header">
        <div className="site-header-inner">
          {/* Deliberately not a link home: a stray click mid-round would abandon it. */}
          <span className="brand">{UI_SR.appTitle}</span>
          <nav className="site-nav" aria-label={UI_SR.navLabel}>
            <ThemeToggle />
          </nav>
        </div>
      </header>
      <main className="app">{body}</main>
    </>
  );
}
