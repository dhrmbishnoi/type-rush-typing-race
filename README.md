# type-rush-typing-race

TYPE//RUSH is a single-player, 60-second typing race built with React, TypeScript, and Vite.
Type each word exactly to advance, build combos, and beat your local top scores.

## Game rules

- **Mode:** single player only. There are no AI opponents, multiplayer, or online rankings.
- **Duration:** exactly 60 seconds after a 3-2-1 countdown. Pause (Esc or button) freezes the timer.
- **Words:** one target word at a time. The next word appears only after the whole word is typed correctly.
  Space and Enter are not needed. Wrong characters never advance the word; Backspace corrects them.
- **Score:** each completed word is worth 10 points, plus up to 10 bonus points based on the current combo.
- **Combo:** consecutive correct keystrokes. A wrong keystroke resets it to 0. Milestones at 10, 25, 50, and 100 show a bonus flash.
- **WPM:** completed words ÷ elapsed minutes (0 when no time has elapsed).
- **Accuracy:** correct printable keystrokes ÷ all printable keystrokes × 100 (0 with no keystrokes). Backspace is not counted.
- **Leaderboard:** top five scores stored in `localStorage` under `type-rush:leaderboard` (versioned, version `1`).
  Invalid or unknown-version data is ignored safely. Races that score 0 are not recorded.

## Scripts

```bash
npm install
npm run dev      # dev server on 0.0.0.0:5173
npm test         # Vitest suite (reducer, stats, leaderboard, and UI integration)
npm run build    # type-check and production build
npm run preview  # serve the production build on 0.0.0.0:4173
```
