import { ROUNDS_PER_GAME } from "@contracts/game.schemas";
import { UI_SR } from "@client/strings";

type Props = { secondsToStart: number; letter: string; roundNumber: number };

/** Presentation only: the round opens when the reducer reaches `startsAt`. */
export function CountdownScreen({ secondsToStart, letter, roundNumber }: Props) {
  return (
    <section className="screen countdown" aria-labelledby="countdown-title">
      <h1 id="countdown-title" className="screen-title">
        {UI_SR.countdownTitle}
      </h1>

      <p className="countdown-number" aria-hidden="true">
        {secondsToStart}
      </p>
      <p aria-live="polite">
        {UI_SR.round} {roundNumber} {UI_SR.of} {ROUNDS_PER_GAME} — {UI_SR.countdownTitle}: {secondsToStart}
      </p>
      <p className="letter">
        {UI_SR.letterIs} <strong>{letter}</strong>
      </p>
    </section>
  );
}
