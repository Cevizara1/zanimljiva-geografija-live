import { UI_SR } from "@client/strings";

type Props = { onStart: () => void };

/** One click into a game: no name, no room, no sign-in (SC-001). */
export function StartScreen({ onStart }: Props) {
  return (
    <section className="screen" aria-labelledby="start-title">
      <h1 className="screen-title" id="start-title">
        {UI_SR.startTitle}
      </h1>
      <p>{UI_SR.startIntro}</p>
      <p className="notice">{UI_SR.startRules}</p>
      <button type="button" onClick={onStart}>
        {UI_SR.newGame}
      </button>
    </section>
  );
}
