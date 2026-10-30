/**
 * Number Slide engine. Pure functions with no DOM access. The rules mirror the NumberSlideSessions
 * contract exactly (contracts/src/NumberSlideSessions.sol): the same level table, the same scramble
 * walk, the same tap rules and the same score formula, so what the browser shows is what the
 * contract will verify.
 */
import { encodeAbiParameters, keccak256, type Hex } from "viem";

export type Level = {
  id: number;
  name: string;
  size: number;
  /** Steps the empty cell walks from the solved board; the board is solvable in at most this many moves. */
  shuffles: number;
  moveLimit: number;
  timeLimit: number; // seconds
  base: number; // points for clearing the level
};

/** Same values as `levelInfo` in the contract. Move limits come from test/difficulty.test.ts. */
export const LEVELS: readonly Level[] = [
  { id: 1, name: "Warm-up", size: 3, shuffles: 12, moveLimit: 60, timeLimit: 120, base: 100 },
  { id: 2, name: "Nibble", size: 3, shuffles: 20, moveLimit: 80, timeLimit: 150, base: 200 },
  { id: 3, name: "Cheese run", size: 3, shuffles: 32, moveLimit: 124, timeLimit: 190, base: 300 },
  { id: 4, name: "Big wheel", size: 4, shuffles: 24, moveLimit: 130, timeLimit: 240, base: 450 },
  { id: 5, name: "Maze", size: 4, shuffles: 36, moveLimit: 170, timeLimit: 300, base: 650 },
  { id: 6, name: "Night shift", size: 5, shuffles: 40, moveLimit: 220, timeLimit: 420, base: 900 },
];

/** Seconds after the time limit in which a submission may still land on-chain (contract SUBMIT_GRACE). */
export const SUBMIT_GRACE = 300;
/** Most taps one submission may carry (contract MAX_TAPS). */
export const MAX_TAPS = 255;

export const getLevel = (id: number): Level | undefined => LEVELS.find((l) => l.id === id);

/** Board cells in reading order; 0 is the empty cell. */
export type Board = number[];

export const solved = (size: number): Board => {
  const b = Array.from({ length: size * size }, (_, i) => i + 1);
  b[b.length - 1] = 0;
  return b;
};

export const isSolved = (b: Board): boolean => b.every((v, i) => (i === b.length - 1 ? v === 0 : v === i + 1));

/** The contract packs cell i into bits [5i, 5i + 5). */
export const unpack = (packed: bigint, size: number): Board =>
  Array.from({ length: size * size }, (_, i) => Number((packed >> BigInt(5 * i)) & 31n));

export const pack = (b: Board): bigint => b.reduce((acc, v, i) => acc | (BigInt(v) << BigInt(5 * i)), 0n);

const hashWord = (seed: Hex, n: number): bigint =>
  BigInt(keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [seed, BigInt(n)])));

/**
 * The contract's scramble: walk the empty cell `shuffles` steps from the solved board, never
 * straight back, choosing each step from keccak256(abi.encode(attemptSeed, n)). A walk that lands
 * on the solved board is redone with the next attempt. Returns the board and the empty cell's path.
 */
export const scramble = (level: Level, seed: Hex): { board: Board; path: number[] } => {
  const { size, shuffles } = level;
  for (let attempt = 0; ; attempt++) {
    const b = solved(size);
    let empty = b.length - 1;
    let prev = -1;
    const path = [empty];
    const s = keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [seed, BigInt(attempt)]));
    for (let n = 0; n < shuffles; n++) {
      const r = Math.floor(empty / size);
      const c = empty % size;
      const opts: number[] = [];
      if (r > 0 && empty - size !== prev) opts.push(empty - size);
      if (r + 1 < size && empty + size !== prev) opts.push(empty + size);
      if (c > 0 && empty - 1 !== prev) opts.push(empty - 1);
      if (c + 1 < size && empty + 1 !== prev) opts.push(empty + 1);
      const next = opts[Number(hashWord(s, n) % BigInt(opts.length))]!;
      b[empty] = b[next]!;
      b[next] = 0;
      prev = empty;
      empty = next;
      path.push(next);
    }
    if (!isSolved(b)) return { board: b, path };
  }
};

/**
 * Slide toward the empty cell. Tapping a tile in the empty cell's row or column slides every
 * tile between them; each tile that moves counts as one move. Returns null when nothing moves.
 */
export const slide = (b: Board, size: number, index: number): { board: Board; moved: number } | null => {
  const empty = b.indexOf(0);
  if (index === empty || index < 0 || index >= b.length) return null;
  const er = Math.floor(empty / size);
  const ec = empty % size;
  const r = Math.floor(index / size);
  const c = index % size;
  if (r !== er && c !== ec) return null;
  const step = r === er ? (c > ec ? 1 : -1) : r > er ? size : -size;
  const next = b.slice();
  let hole = empty;
  let moved = 0;
  while (hole !== index) {
    next[hole] = next[hole + step]!;
    next[hole + step] = 0;
    hole += step;
    moved++;
  }
  return { board: next, moved };
};

export type Direction = "up" | "down" | "left" | "right";

/** The tile that moves when the player pushes in a direction (arrow key or swipe). */
export const tileForDirection = (b: Board, size: number, dir: Direction): number => {
  const empty = b.indexOf(0);
  const r = Math.floor(empty / size);
  const c = empty % size;
  if (dir === "up" && r < size - 1) return empty + size;
  if (dir === "down" && r > 0) return empty - size;
  if (dir === "left" && c < size - 1) return empty + 1;
  if (dir === "right" && c > 0) return empty - 1;
  return -1;
};

/**
 * The contract's score: the level's base, plus floor(500 × moves left ÷ move limit), plus
 * floor(500 × seconds left ÷ time limit). On-chain, seconds run from the block that started the
 * session to the block that verified it.
 */
export const scoreFor = (level: Level, seconds: number, moves: number): number => {
  const s = Math.max(0, Math.floor(seconds));
  const timeLeft = s >= level.timeLimit ? 0 : level.timeLimit - s;
  const movesLeft = Math.max(0, level.moveLimit - moves);
  return level.base + Math.floor((500 * movesLeft) / level.moveLimit) + Math.floor((500 * timeLeft) / level.timeLimit);
};

export type Replay = { ok: true; moves: number } | { ok: false; reason: string };

/** The contract's replay, for checking a run before it is sent. */
export const replay = (level: Level, start: Board, taps: number[]): Replay => {
  if (taps.length === 0) return { ok: false, reason: "No moves" };
  if (taps.length > MAX_TAPS) return { ok: false, reason: "Too many taps" };
  let board = start;
  let moves = 0;
  for (const t of taps) {
    const r = slide(board, level.size, t);
    if (!r) return { ok: false, reason: "Illegal move" };
    board = r.board;
    moves += r.moved;
    if (moves > level.moveLimit) return { ok: false, reason: "Move limit exceeded" };
  }
  if (!isSolved(board)) return { ok: false, reason: "Puzzle not solved" };
  return { ok: true, moves };
};

/** m:ss for clocks and limits. */
export const fmtTime = (s: number): string => {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
};
