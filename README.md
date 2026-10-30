# Squeekchain Arcade

Browser puzzle games with a Squeekchain twist. **Number Slide** now has real on-chain play on
**Ethereum Sepolia (chain 11155111), a test network**: a player starts a session with one
transaction, plays every move in the browser, and submits the whole move list in a second
transaction. The `NumberSlideSessions` contract replays it and records the result only if it legally
solves that session's board within the move limit. The leaderboard is read from those verified
results. No token, no entry fee, no rewards and no transfer of player funds.

This is a testnet feature. It is not deployed to, or described as, a mainnet feature. It does not
call or modify Squeekchain's core contracts; the game contract is standalone.

## Deployment status (read this first)

| | |
| --- | --- |
| Network | Sepolia, chain ID 11155111, public RPC `https://ethereum-sepolia-rpc.publicnode.com` |
| Contract | `NumberSlideSessions`, `contracts/src/NumberSlideSessions.sol` |
| Address | **`0xA0518C48E7e5A30C1c400f8DC23F2A5bcc5B9009`** (CREATE2, see below) |
| Deployed? | **Not yet.** At the time of this build `eth_getCode` on that address returned `0x`. |
| Transaction links | None yet: no transaction was sent from this build. |

This build had no funded Sepolia account, and it does not use or ask for anyone's private key, so it
could not send the deployment transaction itself. The contract has no owner and no constructor
arguments, so the address does not depend on who deploys it: it is the CREATE2 address of this
exact bytecode with salt `0x00…00` under the standard deterministic deployer
`0x4e59b44847b379578588920ca78fbf26c0b4956c` (present on Sepolia; checked with `eth_getCode`). The
site already points at that address and works the moment anyone deploys it. Two ways to deploy:

1. **From the site.** Open Number Slide, connect a wallet holding Sepolia test ETH, switch to
   Sepolia. While the contract is missing the page shows "The game contract is not deployed on
   Sepolia yet" and a **Deploy the game contract** button that sends the CREATE2 transaction.
2. **From Foundry**, with your own keystore account:
   ```sh
   cd contracts
   forge script script/Deploy.s.sol --rpc-url https://ethereum-sepolia-rpc.publicnode.com --broadcast --account <your-keystore-name>
   ```

After deploying, record the transaction link (`https://sepolia.etherscan.io/tx/<hash>`) and verify
the source on Etherscan (solc 0.8.28, optimizer 200 runs, EVM `cancun`, no metadata hash; settings in
`contracts/foundry.toml`). Nothing in the site needs to change.

Public site: the existing site is https://squeekchain-arcade-browser-puzzl.imd.site. IMD publishes the
committed `dist/` after this job; this build ran no publishing command.

## What is on-chain and what stays in the browser

| On-chain (Sepolia contract) | Browser only |
| --- | --- |
| Session id, player address, level, start time, the scrambled board | Every tile move while playing (no transaction per move) |
| Replay of the submitted move list: legal moves, move limit, solved board | The countdown shown during play |
| Time window: submission must land within the time limit plus 5 minutes | "Time (browser)" on the results screen before submitting |
| One result per session, only for the session's own wallet | Practice boards and their scores (labelled unverified, kept in `localStorage`) |
| Verified moves, on-chain time and score; `SessionStarted` / `SessionCompleted` events | Level unlock progress and per-device bests |
| The leaderboard's data (`getResults`) | Ranking and totals computed from that data |

The score shown as "Verified score" comes only from the `SessionCompleted` event in a successful
receipt. Before that the results screen says "Score, not yet on-chain".

## Rules and score

| Level | Board | Scramble walk | Move limit | Time limit | Base |
| --- | --- | --- | --- | --- | --- |
| 1 Warm-up | 3×3 | 12 | 60 | 2:00 | 100 |
| 2 Nibble | 3×3 | 20 | 80 | 2:30 | 200 |
| 3 Cheese run | 3×3 | 32 | 124 | 3:10 | 300 |
| 4 Big wheel | 4×4 | 24 | 130 | 4:00 | 450 |
| 5 Maze | 4×4 | 36 | 170 | 5:00 | 650 |
| 6 Night shift | 5×5 | 40 | 220 | 7:00 | 900 |

- Boards are made by walking the empty cell from the solved board (never straight back), so every
  board is solvable in at most "scramble walk" moves. A walk that lands on the solved board is redone.
- Tapping a tile in the empty cell's row or column slides every tile between them; each tile that
  moves is one move. Arrow keys and swipes move one tile.
- Score = base + floor(500 × moves left ÷ move limit) + floor(500 × seconds left ÷ time limit). On-chain
  seconds run from the block that started the session to the block that verified it.
- How the limits were chosen: `test/difficulty.test.ts` measures 200 boards per level (exact shortest
  solution on 3×3, the undone walk on larger boards). Each limit is at least 4× the hardest board
  measured (3×3's worst possible board is 31 moves; level 3 allows 124), and using every allowed move at
  1.5 s per move fits the clock. Level 1 now allows 60 moves (the previous source had 30; the brief cites 20).

## Contract security checks

`startSession(level)` and `submitSolution(sessionId, taps)` both revert off chain 11155111. Submission
checks, in order: the session exists, has no result yet, belongs to `msg.sender`, has 1 to 255 taps,
is inside its time window; then the replay rejects any tap off the board, on the empty cell or outside
its row/column, stops as soon as moves exceed the limit, and requires the solved board. Solidity 0.8
checked arithmetic throughout; no ether is accepted (no payable function).

## Install, preview and rebuild

Requirements: Node 20+ (tested with 24), npm; Foundry for the contract.

```sh
npm ci                 # install from package-lock.json
npm run dev            # local dev server
npm run build          # typecheck (tsc --noEmit) and build the static export into dist/
npx vite preview       # serve dist/ locally
npm test               # engine, scoring and difficulty tests (node --test)
npm run contract:test  # Foundry tests (cd contracts && forge test)
npm run contract:build # forge build, then regenerate src/chain/contract.generated.ts (ABI, bytecode, address)
```

`dist/` is committed and uses relative asset URLs (`base: "./"`) and hash routes (`#/`,
`#/play/number-slide`, `#/leaderboard`), so it works from any static host or gateway subpath.

## Configuration

- Chain, RPCs and explorer: `src/wallet/wagmi.ts` (Sepolia; publicnode with a Tenderly gateway fallback).
- Contract address, ABI and bytecode: `src/chain/contract.generated.ts`, generated by
  `scripts/export-contract.mjs`. If the contract source or compiler settings change, the address
  changes too: rerun `npm run contract:build` and `npm run build`.
- Faucet links: `src/config.ts`. Wallets: EIP-6963 browser wallets, "Open in" links on phones, and
  Coinbase Smart Wallet; no WalletConnect project ID.

## Repository changes in this build

- Added `contracts/` (Foundry project: contract, tests, harness, deploy script) and
  `scripts/export-contract.mjs`.
- Added `src/chain/` (contract bindings, transaction state, error messages, leaderboard reads).
- Rewrote the Number Slide flow (`src/games/number-slide/NumberSlide.tsx`): start panel with wallet,
  network and deployment states; on-chain session HUD; results with submit-to-Sepolia and verified score.
- `engine.ts` now mirrors the contract (keccak scramble, packed boards, integer score); new level table.
- Leaderboard reads verified results from the contract. Removed the old off-chain score server
  (`server/`), signed-message scores and `public/arcade.config.json`.
- Wallet config moved from Base to Sepolia; the connect control shows "Switch to Sepolia" on other networks.

## Validation

See `docs/VALIDATION.md` for the commands that ran, their results and the limitations.
