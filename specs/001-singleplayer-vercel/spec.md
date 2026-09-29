# Feature Specification: Single-Player Game Hostable on Vercel

**Feature Branch**: `001-singleplayer-vercel`

**Created**: 2026-09-30

**Status**: Approved by the owner, 2026-09-30

**Input**: User description: "We are taking over this project. Keep the whole design as it is.
The whole application should be TypeScript with a Node backend. Remove all accounts, sign-in and
registration. If multiplayer cannot be hosted on Vercel, remove it and keep only single-player.
Add all letters, since answers will be checked by AI anyway."

## Context

The current app is a two-player, two-computer game over a persistent real-time connection,
with email accounts, profiles and saved history in a local database file. Vercel runs
request-scoped functions: it cannot keep a real-time connection open, hold rooms in memory
between requests, or keep a local database file. Multiplayer and accounts therefore cannot be
hosted there without adding outside services, which the project rules forbid. This feature
turns the game into a single-player game that needs nothing but static hosting plus stateless
functions. AI answer checking and hints are specified separately in
`specs/002-ai-answer-check-and-hints/`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Play a five-round solo game without signing in (Priority: P1)

A player opens the site and, without creating an account or entering a room code, presses
**Nova igra**. The game plays five rounds. Each round shows a short countdown, reveals a letter,
and gives the player the answer time to fill the eight categories on the paper game sheet.
The round ends when the player presses **Završio sam** or time runs out. The round's line on
the sheet is scored, the player sees that round's points, and continues to the next round.
After the fifth round the full sheet shows all five lines and the game total, with an option
to start a new game.

**Why this priority**: it is the whole game; without it nothing else has a surface.

**Independent Test**: open the app in one browser, play five rounds end to end (finishing
some early and letting at least one time out) and confirm each line is scored and the final
total equals the sum of the five rounds.

**Acceptance Scenarios**:

1. **Given** the start screen, **When** the player presses **Nova igra**, **Then** round 1
   begins with a countdown and no sign-in, name, or room code is asked for.
2. **Given** a round is in progress, **When** the player presses **Završio sam**, **Then** that
   round's answers lock, the round is scored, and a **Sledeća runda** action appears.
3. **Given** a round is in progress, **When** the answer time reaches zero, **Then** the answers
   lock automatically and the round is scored exactly as if the player had pressed Finish.
4. **Given** round 5 has been scored, **When** the results appear, **Then** the sheet shows all
   five lines with their letters and points and the game total, plus **Nova igra**.
5. **Given** a finished game, **When** the player presses **Nova igra**, **Then** a fresh game
   starts with an empty sheet and a new set of letters.

---

### User Story 2 - The same look as today (Priority: P1)

The player sees the current visual identity: the paper game sheet with its ruled lines, the
doodle borders, the typography, and the light/dark theme toggle. The five ruled lines of the
sheet now carry the five rounds of one game.

**Why this priority**: the owner explicitly asked that the design stay as it is.

**Independent Test**: compare the start, answering and results screens with the current build
side by side in light and dark themes; only removed multiplayer/account elements differ.

**Acceptance Scenarios**:

1. **Given** any screen, **When** it is shown in light or dark theme, **Then** colors, fonts,
   borders and the sheet layout match the current build.
2. **Given** round *n* is being played, **When** the sheet is shown, **Then** lines 1..n-1 show
   the earlier rounds' answers (read-only) and line *n* is the one being written.

---

### User Story 3 - Letters from the whole Serbian alphabet (Priority: P2)

Each round's letter is drawn from a 26-letter set instead of the current seven letters,
and a letter never repeats within one game.

**Why this priority**: more variety; it only becomes fair once answers are checked by AI
(feature 002), because the reason for the seven-letter limit was playability, not checking.

**Independent Test**: play or simulate many games and confirm every letter in the set appears,
no game repeats a letter, and words starting with a digraph count for its base letter.

**Acceptance Scenarios**:

1. **Given** a new game, **When** its five letters are drawn, **Then** all five are distinct
   and each comes from the letter set defined in FR-009.
2. **Given** a round with letter L, **When** the player writes "Ljubljana" or "Љубљана",
   **Then** the answer counts as starting with L, because Lj is not a round letter.
3. **Given** a round with letter Č, **When** the player writes "Cacak", **Then** it passes the
   starting-letter check (written without diacritics).

---

### User Story 4 - Deploy by setting one variable (Priority: P2)

A developer can run the app locally with one command and deploy it to Vercel; the only value
they must supply is the Gemini API key (used by feature 002).

**Why this priority**: the owner wants to "only type in the Gemini key".

**Independent Test**: from a clean clone, copy the example environment file, run install and
the dev command, and play a round; then import the repository into Vercel, set the one
variable, and play a round on the deployed URL.

**Acceptance Scenarios**:

1. **Given** a fresh clone, **When** the developer follows the README (copy example env,
   install, run dev), **Then** the game is playable locally without any other account or service.
2. **Given** the repository imported into Vercel with default settings, **When** the key
   variable is set and it deploys, **Then** the deployed site serves the game and its API.

---

### Edge Cases

- The player refreshes or closes the tab mid-game: the game in progress is lost and the start
  screen appears (no resume); this is stated in known limitations.
- The browser tab is backgrounded during a round: time keeps running from the round's start
  timestamp, not from counted ticks, so the deadline is not extended.
- Time runs out while a field has focus and unsaved typing: the last typed value is included.
- The player presses Finish twice: the round is scored once.
- The start screen is opened on a narrow screen: the sheet scrolls inside its own container,
  as today, and never stacks into a list.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST NOT offer or require accounts, sign-in, registration, profiles, or
  saved history. All such screens, endpoints and stored data MUST be removed.
- **FR-002**: The app MUST NOT offer rooms, room codes, matchmaking, opponents, or any
  real-time connection. All two-player screens and code MUST be removed.
- **FR-003**: A game MUST consist of exactly 5 rounds.
- **FR-004**: Each round MUST show a countdown (3 s), then reveal the letter and allow answer
  entry for the configured answer time (default 150 s).
- **FR-005**: A round MUST end when the player presses Finish or the answer time elapses,
  whichever comes first, and MUST be scored exactly once.
- **FR-006**: The categories MUST remain the current eight: Država, Grad, Reka, Planina, More,
  Životinja, Biljka, Predmet, with at most one answer each and at most 40 characters per answer.
- **FR-007**: Without AI checking (i.e. before feature 002, or when feature 002's check is
  unavailable), an answer MUST be accepted when it has at least two letters and starts with
  the round letter under the matching rules of FR-010; accepted answers score 10, others 0.
- **FR-008**: After each round the player MUST see that round's per-category result and
  points; after round 5 the player MUST see all five rounds and the game total.
- **FR-009**: Round letters MUST be drawn from the 26 letters
  A B C Č Ć D E F G H I J K L M N O P R S Š T U V Z Ž (the Serbian alphabet without Dž, Đ, Lj
  and Nj; clarified 2026-09-30, option B), with no letter repeated within a game.
- **FR-010**: Starting-letter matching MUST follow `docs/GAME_SPEC.md` §5.1-§5.2: ignore case
  and surrounding spaces; treat Cyrillic and Latin as equivalent (Љ=Lj, Њ=Nj, Џ=Dž, Ђ=Đ);
  accept answers written without diacritics; count words starting with Dž or Đ for D, Lj for L
  and Nj for N (those are not round letters); keep Č, Ć, Š and Ž distinct from C, S and Z.
- **FR-011**: The countdown, the answer timer and the round deadline MUST be computed from the
  round's start time so that backgrounding or a slow device cannot extend a round.
- **FR-012**: The visual design (sheet, ruled lines, doodles, fonts, colors, theme toggle and
  its remembered choice) MUST be preserved.
- **FR-013**: The whole application MUST be TypeScript; server-side code MUST run as stateless
  Node.js functions compatible with Vercel and MUST also run locally without a Vercel account.
- **FR-014**: The repository MUST contain an example environment file listing every variable
  with empty or default values, and a README section describing local run and Vercel deploy.
- **FR-015**: The repository MUST NOT depend on a database, a persistent disk, or any service
  other than static hosting, stateless functions, and (for feature 002) the Gemini API.
- **FR-016**: Documentation that describes the removed two-player system (`Plan.md`,
  `.github/instructions/*`, and the agent entry files) MUST be archived or rewritten so no
  current document describes behavior that no longer exists; Week 3 evidence stays readable.

### Key Entities

- **Game**: five rounds, the ordered distinct letters, per-round results, the game total.
  Lives only in the browser tab for the duration of the game.
- **Round**: number 1-5, letter, start time, deadline, the eight answers, locked flag, result.
- **Round result**: per category — the written answer, accepted or not, points, and (with
  feature 002) whether it was AI-verified and a short reason.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time player can start a game from the landing page in one click and
  without typing anything other than answers.
- **SC-002**: A full five-round game can be completed start to finish with no screen that
  mentions an opponent, a room, an account, or signing in.
- **SC-003**: A developer can go from a fresh clone to a playable local game in under
  5 minutes by following the README, setting at most one variable.
- **SC-004**: Across 1,000 simulated games, no game repeats a letter and every letter of the
  chosen set appears at least once.
- **SC-005**: A round never lasts longer than its answer time plus 1 second, even when the tab
  was in the background.
- **SC-006**: Side-by-side screenshots of the answering and results screens against the current
  build show no change in styling other than removed multiplayer/account elements.

## Assumptions

- Vercel cannot host the current real-time multiplayer and accounts without new outside
  services (a real-time provider and a database). Per the owner's instruction and the project
  rule against new services, multiplayer and accounts are removed rather than migrated.
- Single-player has no opponent, so traditional 10/5/0 comparison scoring no longer applies:
  each accepted answer scores 10, each rejected or empty answer 0 (max 80 per round, 400 per game).
- The answer time stays 150 s (the owner's most recent change) and the countdown 3 s.
  The player can always finish a round early.
- A game lives only in the open tab; refresh, reconnect and resume are out of scope.
- The player's display name is no longer needed and is not asked for.
- Deploying to Vercel is prepared (configuration and README) but performed by the owner; this
  feature does not deploy.
