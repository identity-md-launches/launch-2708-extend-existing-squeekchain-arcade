import { test } from "node:test";
import assert from "node:assert/strict";
import { LEVELS, replay, scramble } from "../src/games/number-slide/engine.ts";
import { optimal3, reverseWalk } from "./solve.ts";

/**
 * How the move limits were set, and the check that keeps them honest. For every level, 200
 * scrambles from random-looking seeds are replayed through the undone scramble walk and measured:
 * the shortest solution (exact breadth-first search on 3 by 3) or the undone scramble walk (an upper bound on 4 by 4 and 5 by 5).
 * Rules: the limit is at least 4 times the hardest board measured, so a player who wanders still
 * finishes; and using every allowed move at 1.5 seconds a move still fits the clock.
 */
const SAMPLES = 200;
const seed = (level: number, n: number) => `0x${(level * 1_000_003 + n * 7_919).toString(16).padStart(64, "0")}` as const;

for (const l of LEVELS) {
  test(`level ${l.id} (${l.size}x${l.size}): every sampled board solves within ${l.moveLimit} moves and ${l.timeLimit}s`, () => {
    let hardest = 0;
    let total = 0;
    for (let n = 0; n < SAMPLES; n++) {
      const { board, path } = scramble(l, seed(l.id, n));
      const taps = reverseWalk(path);
      const r = replay(l, board, taps);
      assert.ok(r.ok, `level ${l.id} sample ${n} replays`);
      const moves = l.size === 3 ? optimal3(board) : r.moves;
      assert.ok(moves <= r.moves);
      hardest = Math.max(hardest, moves);
      total += moves;
    }
    console.log(`level ${l.id}: hardest ${hardest} moves, mean ${(total / SAMPLES).toFixed(1)}, limit ${l.moveLimit}, ratio ${(l.moveLimit / hardest).toFixed(1)}x`);
    assert.ok(l.moveLimit >= 4 * hardest, `level ${l.id} limit ${l.moveLimit} >= 4 x ${hardest}`);
    assert.ok(l.moveLimit * 1.5 <= l.timeLimit, `level ${l.id} every move at 1.5s fits ${l.timeLimit}s`);
  });
}

test("move limits rise with difficulty and level 1 allows at least 60 moves", () => {
  assert.ok(LEVELS[0]!.moveLimit >= 60);
  for (let i = 1; i < LEVELS.length; i++) assert.ok(LEVELS[i]!.moveLimit > LEVELS[i - 1]!.moveLimit);
});
