import { isSolved, slide, type Board } from "../src/games/number-slide/engine.ts";

/** Breadth-first solver for 3 by 3 boards; returns the tapped indexes of a shortest solution. */
export const solve = (start: Board, size: number, maxDepth = 32): number[] | null => {
  const key = (b: Board) => b.join(",");
  const seen = new Map<string, { prev: string | null; tap: number }>([[key(start), { prev: null, tap: -1 }]]);
  let frontier: Board[] = [start];
  for (let d = 0; d <= maxDepth && frontier.length; d++) {
    const next: Board[] = [];
    for (const b of frontier) {
      if (isSolved(b)) {
        const taps: number[] = [];
        let k: string | null = key(b);
        while (k) {
          const e: { prev: string | null; tap: number } = seen.get(k)!;
          if (e.tap >= 0) taps.unshift(e.tap);
          k = e.prev;
        }
        return taps;
      }
      const empty = b.indexOf(0);
      for (const n of [empty - size, empty + size, empty - 1, empty + 1]) {
        if (n < 0 || n >= b.length || (Math.abs(n - empty) === 1 && Math.floor(n / size) !== Math.floor(empty / size))) continue;
        const r = slide(b, size, n)!;
        const k = key(r.board);
        if (seen.has(k)) continue;
        seen.set(k, { prev: key(b), tap: n });
        next.push(r.board);
      }
    }
    frontier = next;
  }
  return null;
};

/** The scramble walk undone: tap the empty cell's earlier positions in reverse. */
export const reverseWalk = (path: number[]): number[] => path.slice(0, -1).reverse();

/** Shortest single-tile distance to solved for every 3 by 3 board, by one breadth-first search from the goal. */
let distances: Map<string, number> | undefined;
export const optimal3 = (b: Board): number => {
  if (!distances) {
    const goal = [1, 2, 3, 4, 5, 6, 7, 8, 0];
    distances = new Map([[goal.join(","), 0]]);
    let frontier = [goal];
    for (let d = 1; frontier.length; d++) {
      const next: Board[] = [];
      for (const cur of frontier) {
        const e = cur.indexOf(0);
        for (const n of [e - 3, e + 3, e % 3 ? e - 1 : -1, e % 3 < 2 ? e + 1 : -1]) {
          if (n < 0 || n > 8) continue;
          const nb = cur.slice();
          nb[e] = nb[n]!;
          nb[n] = 0;
          const k = nb.join(",");
          if (distances.has(k)) continue;
          distances.set(k, d);
          next.push(nb);
        }
      }
      frontier = next;
    }
  }
  return distances.get(b.join(","))!;
};
