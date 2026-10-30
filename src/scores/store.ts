import { rank, type Row, type Run } from "./rank";
import { fetchVerifiedRuns } from "../chain/game";

/**
 * Two kinds of score. Verified runs come from the NumberSlideSessions contract on Sepolia and are
 * the only ones on the leaderboard. Practice runs are browser-only and unverified: they stay in
 * this browser's storage and only mark progress and personal bests on this device.
 */

const RUNS_KEY = "sqa.practice.v2";
const PROGRESS_KEY = "sqa.progress.v1";

const read = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or full storage: the game still plays */
  }
};

export const localRuns = (): Run[] => read<Run[]>(RUNS_KEY, []);
export const addLocalRun = (run: Run) => write(RUNS_KEY, [...localRuns(), run].slice(-500));

/** Highest level unlocked on this device (levels open in order). */
export const unlockedLevel = (): number => read<number>(PROGRESS_KEY, 1);
export const unlockLevel = (id: number) => write(PROGRESS_KEY, Math.max(unlockedLevel(), id));

export type Board = { rows: Row[]; total: number };

export const fetchBoard = async (level: number): Promise<Board> => {
  const runs = await fetchVerifiedRuns();
  return { rows: rank(runs, level), total: runs.length };
};
