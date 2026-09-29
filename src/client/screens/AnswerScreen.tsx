import {
  CATEGORIES,
  CATEGORY_LABELS_SR,
  MAX_ANSWER_LENGTH,
  ROUNDS_PER_GAME,
} from "@contracts/game.schemas";
import type { Answers, Category } from "@contracts/game.schemas";
import type { HintView } from "@client/state/game-reducer";
import { UI_SR } from "@client/strings";

type Props = {
  letter: string;
  /** 1-based number of the round being written. */
  roundNumber: number;
  remainingMs: number;
  answers: Answers;
  /** Answers of the rounds already played, top line first. */
  earlierAnswers: Answers[];
  locked: boolean;
  checking: boolean;
  announcement: string;
  hintCredits: number;
  hintsAvailable: boolean;
  hints: Partial<Record<Category, HintView>>;
  hintPending: boolean;
  onChange: (category: Category, value: string) => void;
  onFinish: () => void;
  onHint: (category: Category) => void;
};

const LOW_TIME_MS = 15_000;

function formatRemaining(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function hintText(view: HintView | undefined): string | null {
  if (!view) return null;
  switch (view.status) {
    case "loading":
      return UI_SR.hintLoading;
    case "shown":
      return view.clue;
    case "no_term":
      return UI_SR.hintNoTerm;
    case "failed":
      return UI_SR.hintFailed;
    case "quota_exhausted":
      return UI_SR.hintQuota;
  }
}

/**
 * The paper sheet: categories across the top and five ruled lines, one per
 * round of the game. Earlier rounds stay written on their lines, the current
 * line is the one you write on, and the rest of the page is still blank.
 */
export function AnswerScreen({
  letter,
  roundNumber,
  remainingMs,
  answers,
  earlierAnswers,
  locked,
  checking,
  announcement,
  hintCredits,
  hintsAvailable,
  hints,
  hintPending,
  onChange,
  onFinish,
  onHint,
}: Props) {
  const blankLines = Math.max(0, ROUNDS_PER_GAME - earlierAnswers.length - 1);

  return (
    <section className="screen screen-wide" aria-labelledby="answer-title">
      <header className="round-header">
        <div>
          <h1 id="answer-title" className="screen-title">
            {UI_SR.answeringTitle}
          </h1>
          <p className="letter">
            {UI_SR.round} {roundNumber} {UI_SR.of} {ROUNDS_PER_GAME} · {UI_SR.letterIs} <strong>{letter}</strong>
          </p>
        </div>
        {/* Reads once per second, so it is hidden from assistive technology;
            the live region below announces milestones instead. */}
        <p className={`timer${remainingMs <= LOW_TIME_MS ? " timer-low" : ""}`} aria-hidden="true">
          <span className="timer-label">{UI_SR.timeLeft}</span>
          {formatRemaining(remainingMs)}
        </p>
      </header>

      <p className="round-note" aria-live="polite">
        {checking
          ? UI_SR.checking
          : hintsAvailable
            ? `${UI_SR.hints}: ${hintCredits}`
            : UI_SR.hintsUnavailable}
      </p>

      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          onFinish();
        }}
      >
        <div className="table-scroll">
          <table className="sheet-table play-table">
            <caption className="visually-hidden">{UI_SR.answeringTitle}</caption>
            <thead>
              <tr>
                {CATEGORIES.map((category) => (
                  <th scope="col" className="col-head" key={category}>
                    {CATEGORY_LABELS_SR[category]}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {earlierAnswers.map((earlier, index) => (
                <tr className="row-done" key={`done-${index}`}>
                  {CATEGORIES.map((category) => (
                    <td className="cell cell-done" key={category}>
                      {earlier[category]}
                    </td>
                  ))}
                </tr>
              ))}

              <tr>
                {CATEGORIES.map((category) => {
                  const view = hints[category];
                  const text = hintText(view);
                  const canAsk =
                    hintsAvailable &&
                    !locked &&
                    !hintPending &&
                    hintCredits > 0 &&
                    (!view || view.status === "failed");

                  return (
                    <td className="cell cell-input" key={category}>
                      <label className="cell-label" htmlFor={`answer-${category}`}>
                        {CATEGORY_LABELS_SR[category]}
                      </label>
                      <input
                        id={`answer-${category}`}
                        name={category}
                        value={answers[category]}
                        maxLength={MAX_ANSWER_LENGTH}
                        disabled={locked}
                        autoComplete="off"
                        autoCapitalize="words"
                        spellCheck={false}
                        aria-describedby={text ? `${category}-hint` : undefined}
                        onChange={(event) => onChange(category, event.target.value)}
                      />
                      {text ? (
                        <p className={`hint-text hint-${view?.status ?? ""}`} id={`${category}-hint`}>
                          {text}
                        </p>
                      ) : null}
                      {hintsAvailable && !locked && (!view || view.status === "failed") ? (
                        <button
                          type="button"
                          className="link hint-button"
                          disabled={!canAsk}
                          onClick={() => onHint(category)}
                        >
                          {UI_SR.hintAsk}
                          <span className="visually-hidden"> — {CATEGORY_LABELS_SR[category]}</span>
                        </button>
                      ) : null}
                    </td>
                  );
                })}
              </tr>

              {/* Ruled but unused: the blank part of the page. Decorative, so
                  assistive technology is not walked through empty cells. */}
              {Array.from({ length: blankLines }, (_, line) => (
                <tr className="row-blank" aria-hidden="true" key={`blank-${line}`}>
                  {CATEGORIES.map((category) => (
                    <td className="cell" key={category} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button type="submit" disabled={locked}>
          {UI_SR.finish}
        </button>
      </form>
    </section>
  );
}
