import { test } from "node:test";
import assert from "node:assert/strict";
import { LEVELS, isSolved, pack, replay, scoreFor, scramble, slide, solved, tileForDirection, unpack } from "../src/games/number-slide/engine.ts";
import { rank } from "../src/scores/rank.ts";
import { reverseWalk } from "./solve.ts";

const seed = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as const;

test("scramble is deterministic per seed, a permutation, and never already solved", () => {
  for (const l of LEVELS) {
    assert.deepEqual(scramble(l, seed(42)), scramble(l, seed(42)));
    for (let s = 1; s <= 30; s++) {
      const { board } = scramble(l, seed(s));
      assert.equal(isSolved(board), false);
      assert.deepEqual([...board].sort((a, b) => a - b), [...solved(l.size)].sort((a, b) => a - b));
    }
  }
});

test("packing matches the contract's 5-bit layout", () => {
  for (const l of LEVELS) {
    const { board } = scramble(l, seed(7));
    assert.deepEqual(unpack(pack(board), l.size), board);
  }
  // Same constant the Solidity parity test checks.
  assert.equal(pack(scramble(LEVELS[0]!, seed(0xab)).board), 0x21d0609462n);
});

test("slide moves a whole line and counts each tile", () => {
  const b = [1, 2, 3, 4, 5, 6, 7, 8, 0];
  const r = slide(b, 3, 6)!;
  assert.deepEqual(r.board, [1, 2, 3, 4, 5, 6, 0, 7, 8]);
  assert.equal(r.moved, 2);
  assert.equal(slide(b, 3, 0), null);
  assert.equal(tileForDirection(b, 3, "left"), -1);
  assert.equal(tileForDirection(b, 3, "right"), 7);
  assert.equal(tileForDirection(b, 3, "down"), 5);
});

test("replay accepts a real solution and rejects illegal, unsolved and over-limit runs", () => {
  const l = LEVELS[0]!;
  const { board, path } = scramble(l, seed(123));
  const taps = reverseWalk(path);
  assert.deepEqual(replay(l, board, taps), { ok: true, moves: taps.length });
  assert.deepEqual(replay(l, board, taps.slice(0, -1)), { ok: false, reason: "Puzzle not solved" });
  assert.deepEqual(replay(l, board, []), { ok: false, reason: "No moves" });
  const empty = board.indexOf(0);
  const diagonal = ((Math.floor(empty / 3) + 1) % 3) * 3 + ((empty % 3) + 1) % 3;
  assert.deepEqual(replay(l, board, [diagonal, ...taps]), { ok: false, reason: "Illegal move" });
  const other = empty % 3 === 0 ? empty + 1 : empty - 1;
  const shuttle = Array.from({ length: 62 }, (_, i) => (i % 2 ? empty : other));
  assert.deepEqual(replay(l, board, [...shuttle, ...taps]), { ok: false, reason: "Move limit exceeded" });
});

test("score matches the contract's integer formula", () => {
  const l = LEVELS[0]!;
  assert.equal(scoreFor(l, 30, 12), 875); // same case as testSuccessfulCompletionRecordsScoreAndEmits
  assert.equal(scoreFor(l, 200, 12), 500);
});

test("ranking sorts by score, then best time", () => {
  const rows = rank(
    [
      { player: "a", name: "", level: 1, score: 900, seconds: 20, moves: 10, at: 1 },
      { player: "b", name: "", level: 1, score: 900, seconds: 15, moves: 10, at: 2 },
      { player: "c", name: "", level: 1, score: 950, seconds: 30, moves: 10, at: 3 },
      { player: "c", name: "", level: 2, score: 100, seconds: 90, moves: 10, at: 4 },
    ],
    1,
  );
  assert.deepEqual(rows.map((r) => r.player), ["c", "b", "a"]);
  assert.equal(rank([{ player: "c", name: "", level: 2, score: 100, seconds: 9, moves: 1, at: 4 }, { player: "c", name: "", level: 1, score: 950, seconds: 30, moves: 1, at: 3 }], 0)[0]!.score, 1050);
});
