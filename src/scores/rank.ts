/** Leaderboard ranking of verified on-chain results. */

export type Run = {
  player: string; // checksummed address, or "local" for a browser-only practice run
  name: string;
  level: number;
  score: number;
  seconds: number;
  moves: number;
  at: number;
  session?: number; // on-chain session id, for verified runs
};

export type Row = {
  player: string;
  name: string;
  score: number;
  bestTime: number; // seconds (on-chain: from the start block to the verifying block)
  levels: number; // distinct levels cleared within the filter
  runs: number;
};

/**
 * `level` 0 is the overall board: a player's score is the sum of their best score on each level,
 * their time the sum of their fastest clear on each level. A single level ranks best score, then
 * fastest clear. Ties fall to the earlier run.
 */
export const rank = (runs: Run[], level: number, limit = 50): Row[] => {
  const byPlayer = new Map<string, Run[]>();
  for (const r of runs) {
    if (level && r.level !== level) continue;
    const list = byPlayer.get(r.player) ?? [];
    list.push(r);
    byPlayer.set(r.player, list);
  }
  const rows: (Row & { first: number })[] = [];
  for (const [player, list] of byPlayer) {
    const bestScore = new Map<number, number>();
    const bestTime = new Map<number, number>();
    for (const r of list) {
      bestScore.set(r.level, Math.max(bestScore.get(r.level) ?? 0, r.score));
      bestTime.set(r.level, Math.min(bestTime.get(r.level) ?? Infinity, r.seconds));
    }
    const sum = (m: Map<number, number>) => [...m.values()].reduce((a, b) => a + b, 0);
    const latest = list.reduce((a, b) => (b.at > a.at ? b : a));
    rows.push({
      player,
      name: latest.name,
      score: sum(bestScore),
      bestTime: Math.round(sum(bestTime) * 10) / 10,
      levels: bestScore.size,
      runs: list.length,
      first: Math.min(...list.map((r) => r.at)),
    });
  }
  rows.sort((a, b) => b.score - a.score || a.bestTime - b.bestTime || a.first - b.first);
  return rows.slice(0, limit).map(({ first: _first, ...row }) => row);
};
