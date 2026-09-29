import { useEffect, useState } from "react";
import {
  applyThemeChoice,
  readStoredTheme,
  storeTheme,
  THEME_CHOICES,
  type ThemeChoice,
} from "@client/theme";
import { UI_SR } from "@client/strings";

export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>(() => readStoredTheme());

  useEffect(() => {
    applyThemeChoice(choice, document.documentElement);
  }, [choice]);

  return (
    <div className="theme-toggle">
      <label htmlFor="theme-choice">{UI_SR.theme}</label>
      <select
        id="theme-choice"
        name="theme"
        value={choice}
        onChange={(event) => {
          const next = event.target.value as ThemeChoice;
          setChoice(next);
          storeTheme(next);
        }}
      >
        {THEME_CHOICES.map((value) => (
          <option value={value} key={value}>
            {UI_SR.themes[value]}
          </option>
        ))}
      </select>
    </div>
  );
}
