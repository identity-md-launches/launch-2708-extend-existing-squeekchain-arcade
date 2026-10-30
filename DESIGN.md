# Squeekchain Arcade design

Extracted from the final source: `src/styles.css` (tokens and components), `src/App.tsx`,
`src/games/number-slide/NumberSlide.tsx`, `src/wallet/ConnectSheet.tsx`, `src/pages/*.tsx`.

## Overview

A dark, neon, pixel-dotted arcade for casual puzzle players. One pink accent carries every primary
action; cyan marks focus and tile edges; green, amber and red are status colours only. Pixel display
type (Pixelify Sans) for headings, numbers and buttons, Inter for reading. Pages are a single column
on phones and widen to two-column grids above 640 to 1000 px. The game screen keeps the board, the
clock and the move counter together so a player never scrolls during play.

## Colors (`:root` in `src/styles.css`)

| Role token | Value | Job |
| --- | --- | --- |
| `--color-bg` | `--ink-950` `#0b0716` | page background (with `--color-dots` `rgb(124 92 255 / 0.22)` dot grid) |
| `--color-surface` | `--ink-900` `#130d24` | cards, HUD cells, ghost buttons, notices |
| `--color-surface-hover` / `-pressed` | `#1b1431` / `#251b42` | hover and pressed surfaces, tile fill |
| `--color-border` | `--ink-700` `#3a2d63` | borders, ghost-button outline |
| `--color-text` / `--color-text-muted` | `#f4f0ff` / `#b9add9` | body and secondary text |
| `--color-accent` / `-hover` | `#ff4fd8` / `#ff86e5` | primary buttons, selected states, big score |
| `--color-on-accent` | `#0b0716` | text on accent |
| `--color-accent-2`, `--color-focus` | `#3cf2ff` | tile borders, links, 2px focus rings |
| `--color-success` | `#5dff9b` | tiles in place, connected dot, confirmed transactions |
| `--color-warning` | `#ffcf4a` | low time/moves, wrong network, wallet/pending transactions, notices' edge |
| `--color-danger` | `#ff7a7a` | errors and rejected transactions |

Status is never colour alone: each transaction state also has its own sentence (`TxStatus` in
`NumberSlide.tsx`). The taste probe measured text contrast on the lobby at 320, 390 and 1440 and
found no pair under 4.5:1 (3:1 large).

## Typography

- `--font-display`: "Pixelify Sans" 500 and 700 (bundled from `@fontsource/pixelify-sans`), for
  headings, buttons, HUD and score numbers. `--font-body`: "Inter" 400 (`@fontsource/inter`).
- A monospace stack (`.mono`) only for contract addresses.
- Six sizes: `--fs-sm` 14, `--fs-body` 16, `--fs-lead` 18, `--fs-h3` 20, `--fs-h2` 26, `--fs-h1`
  32 (44 from 760 px). Numbers in the HUD and results use `font-variant-numeric: tabular-nums`.
- Natural letter-spacing and sentence case everywhere; no all-caps labels.

## Layout

- Spacing scale `--space-1..7`: 4, 8, 12, 16, 24, 32, 48 px. Page width `--page` 1120 px.
- Radii `--radius-sm` 6, `--radius` 10, `--radius-lg` 16.
- Header (`.top`): brand at the left, nav, the wallet control at the right; below 760 px the nav
  drops to its own row under the brand and wallet.
- Number Slide picker: title, one-line rules, then the start panel (`.start-panel`): primary
  on-chain action and the practice action side by side (`flex: 1 1 220px`, wrapping on phones),
  then transaction status, deployment notice and the test-ETH note. Levels list below.
- Play screen: heading and actions, HUD (`.hud`, two columns plus a full-width session row
  `.hud-wide`), then the square board `min(100%, 520px)`.
- Breakpoints in use: 479 (max), 640, 760, 1000 px. Checked with no horizontal scroll at 320, 390
  and 1440 (lobby, taste probe) and 390 and 1440 (game, results, leaderboard, scripted run).

## Elevation & Depth

Flat surfaces with 1px borders. The only shadow is `--glow` (a pink ring plus 18px pink blur) on
primary buttons, the board and the selected level; a surface never gets both a border and a shadow.

## Components

- `.btn` (44px min height, display font 500): `.btn-primary` accent with glow, `.btn-ghost` surface
  with an inset outline, `.btn-wide` full width. Disabled at 60% opacity. Pressed scales to 0.96.
- `ConnectControl` / `Sheet` (`src/wallet/ConnectSheet.tsx`): "Connect", then the short address with
  a green dot and Disconnect; on another network it turns amber and reads "Switch to Sepolia".
  `SwitchButton` repeats that action next to start and submit. The sheet is a bottom sheet under
  640 px with 48px rows.
- `TxStatus` (`.tx`, `.tx-wallet`, `.tx-pending`, `.tx-confirmed`, `.tx-rejected`): a dot plus one
  sentence and the Etherscan link. Wallet and pending dots pulse; the pulse stops under
  `prefers-reduced-motion`.
- `.hud` / `.stats`: label above a large tabular number; `.warn` turns a cell amber at 10 seconds or
  5 moves left.
- `.board` / `.tile`: square grid, `--n` columns; tiles in place turn green (`.home`), movable tiles
  are buttons with labels ("Tile 5, can slide").
- `.notice`: surface with an amber left edge for things the player should know (contract not
  deployed, practice runs are unverified).
- `.save`: dashed panel holding the submit-to-Sepolia step on the results screen.
- `.scores` table on the leaderboard with `.chip` tabs for Overall and each level.

## Responsive behaviour

Mobile first. Below 760 px the header is two rows (brand and wallet, then nav) and the start-panel
buttons wrap to full width when two 220px bases do not fit (as at 390). The HUD keeps two number
columns with the session row spanning both; the wallet sheet is a bottom sheet below 640 px. From
640 px the levels list has two columns and the sheet is centred; from 760 px the header is one row,
headings grow to 44px, `.btn-wide` returns to auto width, the lobby hero sits beside its preview and
the rules go to three columns; from 1000 px the levels list has three columns.

## Not verified

WebKit rendering, real wallet extensions, physical phones and screen readers were not tested (see
`docs/VALIDATION.md`).
