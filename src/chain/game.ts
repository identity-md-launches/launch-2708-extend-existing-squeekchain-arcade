import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError, concat, decodeEventLog, type Hash, type TransactionReceipt } from "viem";
import { getBytecode, readContract, sendTransaction, simulateContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { config, chain, EXPLORER } from "../wallet/wagmi";
import { CREATE2_FACTORY, CREATE2_SALT, GAME_ABI, GAME_ADDRESS, GAME_BYTECODE } from "./contract.generated";
import { getLevel } from "../games/number-slide/engine";
import type { Run } from "../scores/rank";

export { GAME_ADDRESS };
export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const addressUrl = (a: string) => `${EXPLORER}/address/${a}`;

/** One transaction's life, as the page shows it. Nothing is called confirmed before its receipt succeeds. */
export type TxState =
  | { kind: "idle" }
  | { kind: "wallet" } // waiting for the player to confirm in their wallet
  | { kind: "pending"; hash: Hash } // sent, waiting for a block
  | { kind: "confirmed"; hash: Hash }
  | { kind: "rejected"; text: string; hash?: Hash };

export const isDeployed = async (): Promise<boolean> => {
  const code = await getBytecode(config, { address: GAME_ADDRESS, chainId: chain.id });
  return Boolean(code && code !== "0x");
};

const REASONS: Record<string, string> = {
  WrongNetwork: "The contract only runs on Sepolia.",
  UnknownLevel: "That level does not exist.",
  UnknownSession: "The contract has no such session.",
  NotSessionPlayer: "This session was started by a different wallet. Switch back to that wallet to submit.",
  AlreadySubmitted: "This session already has a recorded result.",
  SessionExpired: "The session's time window has closed. Start a new session.",
  EmptyMoves: "There are no moves to submit.",
  TooManyTaps: "The move list is longer than the contract accepts.",
  IllegalMove: "The contract found an illegal move in the replay.",
  MoveLimitExceeded: "The run used more moves than the level allows.",
  NotSolved: "The contract's replay did not finish solved.",
};

/** A short, honest line for a failed wallet request or a reverted call. */
export const describeError = (e: unknown): string => {
  if (e instanceof BaseError) {
    if (e.walk((x) => x instanceof UserRejectedRequestError)) return "You declined the request in your wallet. Nothing was sent.";
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName ?? "";
      return `Rejected by the contract: ${REASONS[name] ?? (name || revert.shortMessage)}`;
    }
    if (/insufficient funds/i.test(e.message)) return "Your wallet has no Sepolia test ETH for gas. Get some free from a faucet, then try again.";
    return e.shortMessage;
  }
  if (e instanceof Error && /rejected|denied/i.test(e.message)) return "You declined the request in your wallet. Nothing was sent.";
  return e instanceof Error ? e.message.split("\n")[0]! : "Unknown error";
};

type Sent = { hash: Hash; receipt: Promise<TransactionReceipt> };

const track = (hash: Hash): Sent => ({
  hash,
  receipt: waitForTransactionReceipt(config, { hash, chainId: chain.id }).then((r) => {
    if (r.status !== "success") throw new Error("The transaction failed on-chain.");
    return r;
  }),
});

export type StartedSession = { id: bigint; level: number; board: bigint; startedAt: number };

/** Simulate first, so a doomed call is caught before it costs gas, then send it. */
export const sendStart = async (level: number): Promise<Sent> => {
  const { request } = await simulateContract(config, { address: GAME_ADDRESS, abi: GAME_ABI, functionName: "startSession", args: [level], chainId: chain.id });
  return track(await writeContract(config, request));
};

export const sessionFromReceipt = (r: TransactionReceipt): StartedSession => {
  for (const log of r.logs) {
    if (log.address.toLowerCase() !== GAME_ADDRESS.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: GAME_ABI, data: log.data, topics: log.topics });
      if (ev.eventName === "SessionStarted")
        return { id: ev.args.sessionId, level: ev.args.level, board: ev.args.board, startedAt: Number(ev.args.startedAt) };
    } catch {
      /* another event */
    }
  }
  throw new Error("The receipt has no SessionStarted event.");
};

export const sendSolution = async (sessionId: bigint, taps: number[]): Promise<Sent> => {
  const data = `0x${taps.map((t) => t.toString(16).padStart(2, "0")).join("")}` as const;
  const { request } = await simulateContract(config, {
    address: GAME_ADDRESS, abi: GAME_ABI, functionName: "submitSolution", args: [sessionId, data], chainId: chain.id,
  });
  return track(await writeContract(config, request));
};

export type Verified = { moves: number; elapsed: number; score: number };

export const resultFromReceipt = (r: TransactionReceipt): Verified => {
  for (const log of r.logs) {
    if (log.address.toLowerCase() !== GAME_ADDRESS.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: GAME_ABI, data: log.data, topics: log.topics });
      if (ev.eventName === "SessionCompleted") return { moves: ev.args.moves, elapsed: ev.args.elapsed, score: ev.args.score };
    } catch {
      /* another event */
    }
  }
  throw new Error("The receipt has no SessionCompleted event.");
};

/** Anyone may deploy the contract: it has no owner, and CREATE2 puts it at GAME_ADDRESS. */
export const sendDeploy = async (): Promise<Sent> =>
  track(await sendTransaction(config, { to: CREATE2_FACTORY, data: concat([CREATE2_SALT, GAME_BYTECODE]), chainId: chain.id }));

const PAGE = 200n;

/** Every verified result, read from the contract in pages, as leaderboard runs. */
export const fetchVerifiedRuns = async (): Promise<Run[]> => {
  if (!(await isDeployed())) return [];
  const count = await readContract(config, { address: GAME_ADDRESS, abi: GAME_ABI, functionName: "resultCount", chainId: chain.id });
  const runs: Run[] = [];
  for (let start = 0n; start < count && start < 5000n; start += PAGE) {
    const page = await readContract(config, { address: GAME_ADDRESS, abi: GAME_ABI, functionName: "getResults", args: [start, PAGE], chainId: chain.id });
    for (const r of page) {
      if (!getLevel(r.level)) continue;
      runs.push({ player: r.player, name: "", level: r.level, score: r.score, seconds: r.elapsed, moves: r.moves, at: Number(r.completedAt), session: Number(r.sessionId) });
    }
  }
  return runs;
};
