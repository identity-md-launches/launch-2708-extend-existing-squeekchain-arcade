# Validation record

Everything below ran on the build machine, in the foreground, after the last source change.
No Sepolia transaction was sent (no funded account was available; see README "Deployment status").

## Commands and results

| Check | Command | Result |
| --- | --- | --- |
| Contract format | `cd contracts && forge fmt --check` | exit 0 |
| Contract tests | `cd contracts && forge test` (forge 1.8.3, solc 0.8.28) | 18 passed, 0 failed (one fuzz test, 256 runs) |
| Engine, score, difficulty tests | `npm test` | 13 passed, 0 failed |
| Typecheck + production build | `npm run build` (`tsc --noEmit`, then `vite build`) | passed; `dist/` written |
| Design probe | `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` (Playwright Chromium) | 16/16 checks passed on the lobby at 320, 390, 1440 |
| Interaction test | scripted Playwright Chromium run against the built `dist/` (scratch script, not committed) | 15/15 passed, listed below |
| Contract not yet on Sepolia | `eth_getCode(0xA0518C48E7e5A30C1c400f8DC23F2A5bcc5B9009)` on publicnode | `0x` (not deployed) |
| CREATE2 deployer on Sepolia | `eth_getCode(0x4e59b448…4956c)` on publicnode | present |

### Contract tests (`contracts/test/NumberSlideSessions.t.sol`)

Successful completion on every level within its move and time limits; score and `SessionCompleted`
event values; `SessionStarted` event; 40 unique sessions, none starting solved; unknown level;
**invalid moves** (off the line, on the empty cell, off the board); **unsolved board** (and the session
stays open); **exceeded move limit**; oversized (256 taps) and empty sequences; **wrong wallet**;
**duplicate submission**; unknown session; expired session; late-but-in-grace scoring; **wrong
network** (start, submit and deploy off chain 11155111); result pagination incl. huge `count`;
scramble parity with the browser engine; fuzzed random taps never recorded unless they solve.

### Difficulty (`test/difficulty.test.ts`, 200 boards per level)

| Level | Hardest measured | Mean | Limit | Ratio |
| --- | --- | --- | --- | --- |
| 1 | 12 | 11.4 | 60 | 5.0× |
| 2 | 20 | 17.4 | 80 | 4.0× |
| 3 | 28 (3×3 maximum is 31) | 20.5 | 124 | 4.4× |
| 4 | 24 (walk bound) | 24.0 | 130 | 5.4× |
| 5 | 36 (walk bound) | 36.0 | 170 | 4.7× |
| 6 | 40 (walk bound) | 40.0 | 220 | 5.5× |

Every sampled board is replayed to solved through the engine; every limit × 1.5 s fits the clock.

### Interaction test (Chromium, 390×844 and 1440×900)

- Lobby → "Play Number Slide" → the start action ("Connect a wallet to play") is on the first screen
  (y = 277 at 390, 223 at 1440).
- "Practice without a wallet" shows the HUD with time left, moves left and "Practice: browser only".
- The board is read from the DOM, solved (12 taps) by clicking tiles; results read "Level cleared",
  "Practice score" and "unverified". No horizontal overflow.
- Leaderboard reaches its on-chain empty state ("No verified results here yet") from Sepolia.
- No page errors at either width.
- With a mock EIP-1193 wallet on chain 1: connecting shows "Switch to Sepolia" in the header and in
  the start panel; switching shows the short address, the "not deployed on Sepolia yet" notice, the
  "Deploy the game contract" button, and a disabled "Start level 1 on Sepolia" button.

## Better Interface review

Coverage: the guide's workflow section and its six domains' scope were read; the review covered the
changed surfaces (Number Slide picker, play, results, wallet control, leaderboard copy).

| Domain | Finding (file:line at time of review) | Fix |
| --- | --- | --- |
| Accessibility | Transaction states needed announcing, not just a coloured dot | `TxStatus` uses `role="status"`, `role="alert"` for rejections, and a sentence per state (`src/games/number-slide/NumberSlide.tsx`) |
| Accessibility | New pulsing pending dot is endless motion | Stopped under `prefers-reduced-motion` (`src/styles.css`, on-chain play block) |
| Layout | Third HUD item (session) would squeeze two number columns at 390 | `.hud-wide` spans the full row |
| Layout | `.notice` carries a negative top margin meant for the leaderboard | Reset inside `.start-panel` and `.results` |
| Writing | Wallet errors from viem are long and technical | `describeError` maps declines, missing gas and each contract error to one sentence (`src/chain/game.ts`) |
| Writing | Sheet note said signing was free and sent no transaction, now untrue | Rewritten for two Sepolia transactions and the seed-phrase warning (`src/wallet/ConnectSheet.tsx`) |
| Typography | Addresses in prose | `.mono` only for addresses; HUD numbers keep tabular figures |
| Colors | New states reuse existing role tokens (warning, success, danger) with text alongside | no new colours added |
| UI | Disabled start button needed a reason | the deployment notice or "Checking the game contract" line sits under it |

## Limitations (not performed)

- No transaction on Sepolia: contract not deployed, no start/submit was sent from a real wallet,
  so on-chain behaviour is covered by Foundry tests on a local EVM, not on Sepolia itself.
- WebKit/Safari was not tested: Playwright's WebKit failed to install on this machine.
- No real wallet extension, physical phone, screen reader, or native 200% zoom check.
- The taste probe measures the lobby only; the game page was checked with the scripted run and
  screenshots at 390 and 1440.
