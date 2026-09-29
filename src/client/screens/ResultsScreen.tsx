import { CATEGORIES, CATEGORY_LABELS_SR, ROUNDS_PER_GAME } from "@contracts/game.schemas";
import type { CategoryResult } from "@contracts/game.schemas";
import type { RoundState } from "@client/state/game-reducer";
import { UI_SR } from "@client/strings";

type Props = {
  /** Every round played so far; the scored ones are drawn as lines. */
  rounds: RoundState[];
  /** Index of the round just scored (round view) — ignored for the final sheet. */
  current: number;
  final: boolean;
  total: number;
  /** Index of the round whose recheck is running, if any. */
  recheckingRound: number | null;
  onRecheck: (round: number) => void;
  onNext: () => void;
  onNewGame: () => void;
};

function Cell({ line }: { line: CategoryResult }) {
  const empty = line.status === "empty";
  const accepted = line.status === "accepted";
  const shownName = accepted && line.recognizedName ? line.recognizedName : line.written;
  const verdict = accepted ? UI_SR.valid : line.reason ?? UI_SR.invalid;

  return (
    <td className={empty ? "cell cell-empty" : "cell"}>
      {/* Marked in the corner in red pen, the way points go on the paper sheet. */}
      <span className="cell-points">
        <span className="visually-hidden">{UI_SR.points}: </span>
        {line.points}
      </span>

      {empty ? (
        <span className="visually-hidden">{UI_SR.noAnswer}</span>
      ) : (
        <>
          <span className={accepted ? "cell-answer" : "cell-answer answer-invalid"}>{shownName}</span>
          <span className="verdict">{verdict}</span>
        </>
      )}

      {line.example ? (
        <span className="cell-example">
          {UI_SR.example}: <strong>{line.example}</strong>
        </span>
      ) : line.noKnownTerm ? (
        <span className="cell-example">{UI_SR.noKnownTerm}</span>
      ) : null}
    </td>
  );
}

/**
 * The scoresheet: one ruled line per round, the round's letter at the start of
 * the line, points in the corner of each cell and the line total at the end.
 */
export function ResultsScreen({
  rounds,
  current,
  final,
  total,
  recheckingRound,
  onRecheck,
  onNext,
  onNewGame,
}: Props) {
  const scored = rounds.filter((round) => round.result !== null);
  const shown = final ? null : rounds[current];
  const unverifiedRounds = scored
    .map((round, index) => ({ round, index }))
    .filter(({ round }) => round.unverified !== null);
  const blankLines = Math.max(0, ROUNDS_PER_GAME - scored.length);
  const isLastRound = current >= ROUNDS_PER_GAME - 1;

  return (
    <section className="screen screen-results screen-wide" aria-labelledby="results-title">
      <h1 id="results-title" className="screen-title">
        {final ? UI_SR.gameResultsTitle : UI_SR.roundResultsTitle}
      </h1>

      <p className="outcome" aria-live="polite">
        {final
          ? `${UI_SR.totalPoints}: ${total}`
          : `${UI_SR.round} ${current + 1}: ${shown?.result?.points ?? 0} ${UI_SR.pointsFor}`}
      </p>

      <div className="table-scroll">
        <table className="sheet-table">
          <caption className="visually-hidden">{final ? UI_SR.gameResultsTitle : UI_SR.roundResultsTitle}</caption>
          <thead>
            <tr>
              <th scope="col" className="col-head col-row-head">
                {UI_SR.letterIs}
              </th>
              {CATEGORIES.map((category) => (
                <th scope="col" className="col-head" key={category}>
                  {CATEGORY_LABELS_SR[category]}
                </th>
              ))}
              <th scope="col" className="col-head col-total">
                {UI_SR.total}
              </th>
            </tr>
          </thead>

          <tbody>
            {scored.map((round, index) => (
              <tr key={round.startsAt} className={!final && index === current ? "row-current" : undefined}>
                <th scope="row" className="col-row-head row-letter">
                  {round.letter}
                  {round.unverified ? <span className="row-flag">{UI_SR.unverified}</span> : null}
                </th>
                {round.result!.lines.map((line) => (
                  <Cell line={line} key={line.category} />
                ))}
                <td className="cell cell-total">{round.result!.points}</td>
              </tr>
            ))}

            {Array.from({ length: blankLines }, (_, line) => (
              <tr className="row-blank" aria-hidden="true" key={`blank-${line}`}>
                <td className="col-row-head" />
                {CATEGORIES.map((category) => (
                  <td className="cell" key={category} />
                ))}
                <td className="cell cell-total" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="results-footer">
        <div className="results-note">
          {unverifiedRounds.length > 0 ? (
            <>
              <p className="notice notice-warn">
                {final
                  ? UI_SR.gameHasUnverified
                  : unverifiedRounds.some(({ round }) => round.unverified?.reason === "quota_exhausted")
                    ? UI_SR.unverifiedQuota
                    : unverifiedRounds.some(({ round }) => round.unverified?.reason === "not_configured")
                      ? UI_SR.unverifiedNotConfigured
                      : UI_SR.unverifiedTemporary}
              </p>
              <p className="notice">{UI_SR.examplesUnavailable}</p>
              <div className="recheck-list">
                {unverifiedRounds
                  .filter(({ round }) => round.unverified?.retryable)
                  .map(({ round, index }) => (
                    <button
                      type="button"
                      className="link"
                      key={round.startsAt}
                      disabled={recheckingRound !== null}
                      onClick={() => onRecheck(index)}
                    >
                      {recheckingRound === index
                        ? UI_SR.rechecking
                        : `${UI_SR.recheck}${unverifiedRounds.length > 1 || final ? ` — ${round.letter}` : ""}`}
                    </button>
                  ))}
              </div>
            </>
          ) : null}
        </div>

        {final ? (
          <button type="button" onClick={onNewGame}>
            {UI_SR.newGame}
          </button>
        ) : (
          <button type="button" onClick={onNext}>
            {isLastRound ? UI_SR.showFinal : UI_SR.nextRound}
          </button>
        )}
      </div>
    </section>
  );
}
