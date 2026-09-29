import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CATEGORIES, CATEGORY_LABELS_SR, emptyAnswers, type Answers } from "@contracts/game.schemas";
import { AnswerScreen } from "@client/screens/AnswerScreen";
import type { HintView } from "@client/state/game-reducer";
import { UI_SR } from "@client/strings";

type Overrides = Partial<{
  answers: Answers;
  earlierAnswers: Answers[];
  roundNumber: number;
  hintCredits: number;
  hintsAvailable: boolean;
  hints: Partial<Record<(typeof CATEGORIES)[number], HintView>>;
  locked: boolean;
}>;

function render(overrides: Overrides = {}) {
  return renderToStaticMarkup(
    createElement(AnswerScreen, {
      letter: "S",
      roundNumber: overrides.roundNumber ?? 1,
      remainingMs: 90_000,
      answers: overrides.answers ?? emptyAnswers(),
      earlierAnswers: overrides.earlierAnswers ?? [],
      locked: overrides.locked ?? false,
      checking: false,
      announcement: "",
      hintCredits: overrides.hintCredits ?? 3,
      hintsAvailable: overrides.hintsAvailable ?? true,
      hints: overrides.hints ?? {},
      hintPending: false,
      onChange: () => {},
      onFinish: () => {},
      onHint: () => {},
    }),
  );
}

const bodyRows = (markup: string): string[] => {
  const body = markup.slice(markup.indexOf("<tbody>"), markup.indexOf("</tbody>"));
  return body.split("<tr").slice(1);
};

describe("the answer sheet is a ruled paper page, one line per round", () => {
  it("rules five body lines; in round 1 only the first is writable", () => {
    const rows = bodyRows(render());
    expect(rows).toHaveLength(5);
    expect(rows[0]).toContain("<input");
    for (const blankRow of rows.slice(1)) {
      expect(blankRow).not.toContain("<input");
      expect(blankRow).toContain('aria-hidden="true"');
    }
  });

  it("keeps earlier rounds written, read-only, on the lines above the current one", () => {
    const earlier = [
      { ...emptyAnswers(), country: "Austrija" },
      { ...emptyAnswers(), country: "Belgija" },
    ];
    const rows = bodyRows(render({ roundNumber: 3, earlierAnswers: earlier }));

    expect(rows).toHaveLength(5);
    expect(rows[0]).toContain("Austrija");
    expect(rows[1]).toContain("Belgija");
    expect(rows[0]).not.toContain("<input");
    expect(rows[1]).not.toContain("<input");
    expect(rows[2]).toContain("<input");
    expect(rows[3]).toContain('aria-hidden="true"');
    expect(rows[4]).toContain('aria-hidden="true"');
  });

  it("states the letter and the round above the sheet, with no letter or total column", () => {
    const markup = render({ roundNumber: 2 });
    const head = markup.slice(markup.indexOf("<thead>"), markup.indexOf("</thead>"));

    expect(head.indexOf(CATEGORY_LABELS_SR[CATEGORIES[0]!])).toBeLessThan(
      head.indexOf(CATEGORY_LABELS_SR[CATEGORIES[1]!]),
    );
    expect(head).not.toContain("col-total");
    expect(head).not.toContain("col-row-head");

    const above = markup.slice(0, markup.indexOf("<table"));
    expect(above).toContain("<strong>S</strong>");
    expect(above).toContain(`${UI_SR.round} 2`);
  });

  it("shows no points anywhere while the round is running", () => {
    const markup = render({ answers: { ...emptyAnswers(), country: "Srbija" } });
    expect(markup).not.toContain("cell-total");
    expect(markup).not.toContain("cell-points");
  });

  it("gives every category one labelled field, in sheet order", () => {
    const markup = render();
    const positions = CATEGORIES.map((category) => markup.indexOf(`id="answer-${category}"`));
    for (const position of positions) expect(position).toBeGreaterThan(-1);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("never mentions an opponent", () => {
    expect(render()).not.toMatch(/protivnik/i);
  });
});

describe("hint controls on the sheet", () => {
  const hintButtons = (markup: string) => markup.split('class="link hint-button"').length - 1;

  it("offers one hint control per category and shows the credits", () => {
    const markup = render();
    expect(hintButtons(markup)).toBe(CATEGORIES.length);
    expect(markup).toContain(`${UI_SR.hints}: 3`);
  });

  it("disables every hint control at zero credits", () => {
    const markup = render({ hintCredits: 0 });
    const buttons = markup.split('class="link hint-button"').slice(1);
    expect(buttons).toHaveLength(CATEGORIES.length);
    for (const button of buttons) expect(button.slice(0, 20)).toContain("disabled");
  });

  it("shows a clue under its field and removes that field's control", () => {
    const markup = render({ hints: { river: { status: "shown", clue: "Reka kroz Beograd." } } });
    expect(markup).toContain("Reka kroz Beograd.");
    expect(hintButtons(markup)).toBe(CATEGORIES.length - 1);
  });

  it("says hints are unavailable when the AI is not configured", () => {
    const markup = render({ hintsAvailable: false });
    expect(hintButtons(markup)).toBe(0);
    expect(markup).toContain(UI_SR.hintsUnavailable);
  });

  it("offers no hint once the sheet is locked", () => {
    expect(hintButtons(render({ locked: true }))).toBe(0);
  });
});
