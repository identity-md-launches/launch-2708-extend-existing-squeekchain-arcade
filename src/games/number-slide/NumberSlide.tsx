import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useAccount } from "wagmi";
import type { Hash } from "viem";
import { FAUCETS } from "../../config";
import { href } from "../../router";
import { addLocalRun, localRuns, unlockLevel, unlockedLevel } from "../../scores/store";
import {
  GAME_ADDRESS, addressUrl, describeError, isDeployed, resultFromReceipt, sendDeploy, sendSolution, sendStart, sessionFromReceipt, txUrl,
  type TxState, type Verified,
} from "../../chain/game";
import { SwitchButton, short, useWalletSheet, useWrongNetwork } from "../../wallet/ConnectSheet";
import { LEVELS, fmtTime, isSolved, scoreFor, scramble, slide, tileForDirection, unpack, type Board, type Direction, type Level } from "./engine";

/** An on-chain session from Sepolia, or a browser-only practice board. */
type Session = { mode: "chain"; id: bigint; startHash: Hash; startedAt: number; player: string } | { mode: "practice" };
type Outcome = "solved" | "time" | "moves";
type Result = { level: Level; outcome: Outcome; seconds: number; moves: number; taps: number[]; session: Session; at: number };
type Phase = { kind: "pick" } | { kind: "play"; level: Level; board: Board; session: Session; key: number } | { kind: "result"; result: Result };

const randomSeed = () => `0x${[...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("")}` as const;

export default function NumberSlide() {
  const [phase, setPhase] = useState<Phase>({ kind: "pick" });
  const [unlocked, setUnlocked] = useState(unlockedLevel);
  const [chosen, setChosen] = useState(() => Math.min(unlockedLevel(), LEVELS.length));

  const play = (level: Level, board: Board, session: Session) => setPhase({ kind: "play", level, board, session, key: Date.now() });
  const practice = (level: Level) => play(level, scramble(level, randomSeed()).board, { mode: "practice" });
  const finish = (result: Result) => {
    if (result.outcome === "solved") {
      const next = Math.min(result.level.id + 1, LEVELS.length);
      unlockLevel(next);
      setUnlocked(unlockedLevel());
      setChosen(next);
      if (result.session.mode === "practice")
        addLocalRun({ player: "local", name: "", level: result.level.id, score: scoreFor(result.level, result.seconds, result.moves), seconds: result.seconds, moves: result.moves, at: result.at });
    }
    setPhase({ kind: "result", result });
  };

  return (
    <div className="page game-page">
      {phase.kind === "pick" && (
        <Picker unlocked={unlocked} chosen={chosen} onChoose={setChosen} onStarted={play} onPractice={() => practice(LEVELS[chosen - 1]!)} />
      )}
      {phase.kind === "play" && (
        <Play
          key={phase.key}
          level={phase.level}
          start={phase.board}
          session={phase.session}
          onFinish={finish}
          onQuit={() => setPhase({ kind: "pick" })}
          onRestart={() => practice(phase.level)}
        />
      )}
      {phase.kind === "result" && (
        <Results
          result={phase.result}
          onPractice={() => practice(phase.result.level)}
          onLevels={(id) => {
            if (id) setChosen(id);
            setPhase({ kind: "pick" });
          }}
        />
      )}
    </div>
  );
}

/** Pending, confirmed and rejected states of one transaction, with its explorer link. */
function TxStatus({ state, pendingText, confirmedText }: { state: TxState; pendingText: string; confirmedText: string }) {
  if (state.kind === "idle") return null;
  const link = "hash" in state && state.hash ? (
    <a href={txUrl(state.hash)} target="_blank" rel="noreferrer">
      View transaction
    </a>
  ) : null;
  return (
    <p className={`tx tx-${state.kind}`} role={state.kind === "rejected" ? "alert" : "status"}>
      <span className="tx-dot" aria-hidden="true" />
      <span>
        {state.kind === "wallet" && "Confirm the transaction in your wallet."}
        {state.kind === "pending" && <>{pendingText} </>}
        {state.kind === "confirmed" && <>{confirmedText} </>}
        {state.kind === "rejected" && <>{state.text} </>}
        {link}
      </span>
    </p>
  );
}

function TestEthNote() {
  return (
    <p className="muted small">
      Both transactions cost only Sepolia test ETH, which is free: {FAUCETS.map((f, i) => (
        <span key={f.href}>
          {i > 0 && " or "}
          <a href={f.href} target="_blank" rel="noreferrer">
            {f.name}
          </a>
        </span>
      ))}
      . No site needs your seed phrase or private key.
    </p>
  );
}

type Deployment = { kind: "checking" } | { kind: "ready" } | { kind: "missing" } | { kind: "error" };

function useDeployment() {
  const [state, setState] = useState<Deployment>({ kind: "checking" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ kind: "checking" });
    isDeployed()
      .then((d) => live && setState({ kind: d ? "ready" : "missing" }))
      .catch(() => live && setState({ kind: "error" }));
    return () => {
      live = false;
    };
  }, [attempt]);
  return { state, recheck: () => setAttempt((a) => a + 1) };
}

/** The main action: connect, switch to Sepolia, then send startSession and wait for its block. */
function StartPanel({ level, onStarted, onPractice }: { level: Level; onStarted: (l: Level, b: Board, s: Session) => void; onPractice: () => void }) {
  const { address, isConnected } = useAccount();
  const wrong = useWrongNetwork();
  const { openSheet } = useWalletSheet();
  const deployment = useDeployment();
  const [tx, setTx] = useState<TxState>({ kind: "idle" });
  const [deployTx, setDeployTx] = useState<TxState>({ kind: "idle" });
  const busy = tx.kind === "wallet" || tx.kind === "pending";

  const start = async () => {
    setTx({ kind: "wallet" });
    let hash: Hash | undefined;
    try {
      const sent = await sendStart(level.id);
      hash = sent.hash;
      setTx({ kind: "pending", hash });
      const receipt = await sent.receipt;
      const s = sessionFromReceipt(receipt);
      setTx({ kind: "confirmed", hash });
      onStarted(level, unpack(s.board, level.size), { mode: "chain", id: s.id, startHash: hash, startedAt: s.startedAt, player: address! });
    } catch (e) {
      setTx({ kind: "rejected", text: describeError(e), hash });
    }
  };

  const deploy = async () => {
    setDeployTx({ kind: "wallet" });
    let hash: Hash | undefined;
    try {
      const sent = await sendDeploy();
      hash = sent.hash;
      setDeployTx({ kind: "pending", hash });
      await sent.receipt;
      setDeployTx({ kind: "confirmed", hash });
      deployment.recheck();
    } catch (e) {
      setDeployTx({ kind: "rejected", text: describeError(e), hash });
    }
  };

  let action;
  if (!isConnected)
    action = (
      <button className="btn btn-primary btn-wide" onClick={openSheet}>
        Connect a wallet to play
      </button>
    );
  else if (wrong) action = <SwitchButton className="btn btn-primary btn-wide" />;
  else if (deployment.state.kind !== "ready")
    action = (
      <button className="btn btn-primary btn-wide" disabled>
        Start level {level.id} on Sepolia
      </button>
    );
  else
    action = (
      <button className="btn btn-primary btn-wide" onClick={() => void start()} disabled={busy}>
        {tx.kind === "wallet" ? "Confirm in your wallet…" : tx.kind === "pending" ? "Starting session…" : `Start level ${level.id} on Sepolia`}
      </button>
    );

  return (
    <div className="start-panel">
      <div className="start-actions">
        {action}
        <button className="btn btn-ghost btn-wide" onClick={onPractice} disabled={busy}>
          Practice without a wallet
        </button>
      </div>
      <TxStatus state={tx} pendingText="Waiting for Sepolia to confirm your session." confirmedText="Session confirmed." />
      {isConnected && !wrong && deployment.state.kind === "checking" && <p className="muted small">Checking the game contract on Sepolia…</p>}
      {deployment.state.kind === "error" && (
        <p className="err small" role="alert">
          Unable to reach Sepolia.{" "}
          <button className="link-btn" onClick={deployment.recheck}>
            Retry
          </button>
        </p>
      )}
      {deployment.state.kind === "missing" && (
        <div className="notice">
          <p>
            The game contract is not deployed on Sepolia yet. Anyone can deploy it with one transaction: it has no owner and lands at{" "}
            <a className="mono" href={addressUrl(GAME_ADDRESS)} target="_blank" rel="noreferrer">
              {short(GAME_ADDRESS)}
            </a>
            .
          </p>
          {isConnected && !wrong && (
            <button className="btn btn-ghost" onClick={() => void deploy()} disabled={deployTx.kind === "wallet" || deployTx.kind === "pending"}>
              Deploy the game contract
            </button>
          )}
          <TxStatus state={deployTx} pendingText="Deploying." confirmedText="Contract deployed." />
        </div>
      )}
      <TestEthNote />
    </div>
  );
}

function Picker({
  unlocked, chosen, onChoose, onStarted, onPractice,
}: { unlocked: number; chosen: number; onChoose: (id: number) => void; onStarted: (l: Level, b: Board, s: Session) => void; onPractice: () => void }) {
  const best = (id: number) => Math.max(0, ...localRuns().filter((r) => r.level === id).map((r) => r.score));
  const level = LEVELS[chosen - 1]!;
  return (
    <>
      <section className="game-intro" aria-labelledby="ns-title">
        <h1 id="ns-title">Number Slide</h1>
        <p className="lead">
          Put the tiles back in order, 1 first, empty cell last. Level {level.id}, {level.name}: {level.size}×{level.size}, {level.moveLimit} moves, {fmtTime(level.timeLimit)}.
        </p>
        <StartPanel level={level} onStarted={onStarted} onPractice={onPractice} />
      </section>

      <section aria-labelledby="levels-title" className="block">
        <h2 id="levels-title">Choose a level</h2>
        <p className="muted">Clear a level to open the next one. Bests here are from this device.</p>
        <ol className="levels">
          {LEVELS.map((l) => {
            const locked = l.id > unlocked;
            const b = best(l.id);
            return (
              <li key={l.id}>
                <button className="level" aria-pressed={chosen === l.id} disabled={locked} onClick={() => onChoose(l.id)}>
                  <span className="level-num">{l.id}</span>
                  <span className="level-body">
                    <span className="level-name">{l.name}</span>
                    <span className="level-meta">
                      {l.size}×{l.size} · {l.moveLimit} moves · {fmtTime(l.timeLimit)}
                    </span>
                  </span>
                  <span className="level-best">{locked ? "Locked" : b ? `Best ${b}` : "New"}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="how-title" className="block how">
        <h2 id="how-title">How a game works</h2>
        <ol>
          <li>Connect a wallet on Sepolia and confirm one transaction. The contract opens a session and scrambles your board.</li>
          <li>Slide tiles in the browser: no transaction per move. Tap a tile in the empty cell's row or column, use the arrow keys, or swipe the board.</li>
          <li>Each tile that moves counts as one move. The clock starts when your board appears.</li>
          <li>When the board is solved, submit your moves in one transaction. The contract replays them and records the result only if they legally solve your board within the move limit.</li>
        </ol>
        <h3>Score</h3>
        <p>
          Level points, plus up to 500 for moves left, plus up to 500 for time left. On-chain, time runs from the block that started your session to the block that
          verifies it, and a submission must land within 5 minutes after the time limit. Points carry no financial value.
        </p>
      </section>
    </>
  );
}

function Play({
  level, start, session, onFinish, onQuit, onRestart,
}: { level: Level; start: Board; session: Session; onFinish: (r: Result) => void; onQuit: () => void; onRestart: () => void }) {
  const chain = session.mode === "chain";
  const [board, setBoard] = useState<Board>(start);
  const [moves, setMoves] = useState(0);
  // On-chain the board is public once the session confirms, so the clock starts as it appears.
  const [startedAt, setStartedAt] = useState<number | null>(() => (chain ? performance.now() : null));
  const [now, setNow] = useState(() => performance.now());
  const taps = useRef<number[]>([]);
  const done = useRef(false);
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
  const suppressClick = useRef(false);

  const elapsed = startedAt === null ? 0 : (now - startedAt) / 1000;
  const left = Math.max(0, level.timeLimit - elapsed);

  const end = useCallback(
    (outcome: Outcome, seconds: number, moveCount: number) => {
      if (done.current) return;
      done.current = true;
      const s = Math.min(level.timeLimit, Math.max(0.1, Math.round(seconds * 10) / 10));
      onFinish({ level, outcome, seconds: s, moves: moveCount, taps: taps.current.slice(), session, at: Date.now() });
    },
    [level, onFinish, session],
  );

  useEffect(() => {
    if (startedAt === null) return;
    const t = setInterval(() => setNow(performance.now()), 200);
    return () => clearInterval(t);
  }, [startedAt]);

  useEffect(() => {
    if (startedAt !== null && elapsed >= level.timeLimit) end("time", level.timeLimit, moves);
  }, [elapsed, startedAt, level.timeLimit, end, moves]);

  const tap = useCallback(
    (index: number) => {
      if (done.current || index < 0) return;
      const r = slide(board, level.size, index);
      if (!r) return;
      const t = performance.now();
      const began = startedAt ?? t;
      if (startedAt === null) setStartedAt(t);
      taps.current.push(index);
      const total = moves + r.moved;
      setBoard(r.board);
      setMoves(total);
      setNow(t);
      const seconds = (t - began) / 1000;
      if (total > level.moveLimit) end("moves", seconds, total);
      else if (isSolved(r.board)) end("solved", seconds, total);
      else if (total === level.moveLimit) end("moves", seconds, total);
    },
    [board, end, level, moves, startedAt],
  );

  useEffect(() => {
    const keys: Record<string, Direction> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
    const on = (e: KeyboardEvent) => {
      const dir = keys[e.key];
      if (!dir || (e.target as HTMLElement).closest("input, textarea, select")) return;
      e.preventDefault();
      tap(tileForDirection(board, level.size, dir));
    };
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  }, [board, level.size, tap]);

  const onPointerDown = (e: ReactPointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    suppressClick.current = true;
    const dir: Direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
    tap(tileForDirection(board, level.size, dir));
  };

  const empty = board.indexOf(0);
  const movesLeft = level.moveLimit - moves;
  return (
    <section className="play" aria-labelledby="play-title">
      <div className="play-head">
        <h1 id="play-title">
          Level {level.id}: {level.name}
        </h1>
        <div className="play-actions">
          {!chain && (
            <button className="btn btn-ghost" onClick={onRestart}>
              New scramble
            </button>
          )}
          <button className="btn btn-ghost" onClick={onQuit}>
            Quit to levels
          </button>
        </div>
      </div>
      <dl className="hud">
        <div className={left <= 10 && startedAt !== null ? "warn" : ""}>
          <dt>Time left</dt>
          <dd>{fmtTime(Math.ceil(left))}</dd>
        </div>
        <div className={movesLeft <= 5 ? "warn" : ""}>
          <dt>Moves left</dt>
          <dd>
            {movesLeft}
            <span className="of"> of {level.moveLimit}</span>
          </dd>
        </div>
        <div className="hud-wide">
          <dt>{chain ? "On-chain session" : "Mode"}</dt>
          <dd className="hud-text">
            {session.mode === "chain" ? (
              <>
                <span className="tx-dot ok-dot" aria-hidden="true" /> #{session.id.toString()} confirmed on Sepolia.{" "}
                <a href={txUrl(session.startHash)} target="_blank" rel="noreferrer">
                  View transaction
                </a>
              </>
            ) : (
              "Practice: browser only, not recorded on-chain."
            )}
          </dd>
        </div>
      </dl>
      <div
        className="board"
        style={{ ["--n" as string]: level.size }}
        role="group"
        aria-label={`${level.size} by ${level.size} sliding puzzle`}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (swipe.current = null)}
      >
        {board.map((v, i) => {
          const sameLine = i !== empty && (Math.floor(i / level.size) === Math.floor(empty / level.size) || i % level.size === empty % level.size);
          return v === 0 ? (
            <div key="empty" className="cell empty" aria-hidden="true" />
          ) : (
            <button
              key={v}
              className={`cell tile${v === i + 1 ? " home" : ""}`}
              data-movable={sameLine || undefined}
              aria-label={`Tile ${v}${sameLine ? ", can slide" : ""}`}
              onClick={() => {
                if (suppressClick.current) {
                  suppressClick.current = false;
                  return;
                }
                tap(i);
              }}
            >
              {v}
            </button>
          );
        })}
      </div>
      <p className="muted hint">
        {startedAt === null ? "The clock starts on your first move." : "Tiles already in place glow green. Moves stay in your browser until you submit."}
      </p>
    </section>
  );
}

function Results({ result, onPractice, onLevels }: { result: Result; onPractice: () => void; onLevels: (next?: number) => void }) {
  const solved = result.outcome === "solved";
  const chain = result.session.mode === "chain";
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const [verified, setVerified] = useState<Verified | null>(null);
  const title = solved ? "Level cleared" : result.outcome === "time" ? "Time ran out" : "Out of moves";
  const next = result.level.id < LEVELS.length ? result.level.id + 1 : undefined;
  return (
    <section className="results" aria-labelledby="results-title">
      <h1 id="results-title" ref={heading} tabIndex={-1}>
        {title}
      </h1>
      <p className="lead">
        Level {result.level.id}: {result.level.name}. {chain ? `Session #${result.session.mode === "chain" ? result.session.id.toString() : ""} on Sepolia.` : "Practice run, browser only."}
      </p>
      <dl className="stats">
        <div>
          <dt>{verified ? "Verified score" : solved ? (chain ? "Score, not yet on-chain" : "Practice score") : "Score"}</dt>
          <dd className="big">{verified ? verified.score : solved ? scoreFor(result.level, result.seconds, result.moves) : 0}</dd>
        </div>
        <div>
          <dt>{verified ? "On-chain time" : "Time (browser)"}</dt>
          <dd>{verified ? `${verified.elapsed}s` : `${result.seconds.toFixed(1)}s`}</dd>
        </div>
        <div>
          <dt>Moves</dt>
          <dd>
            {result.moves}
            <span className="of"> of {result.level.moveLimit}</span>
          </dd>
        </div>
      </dl>
      {solved && chain && result.session.mode === "chain" && <Submit result={result} session={result.session} onVerified={setVerified} />}
      {!solved && chain && <p className="muted">Nothing is recorded on-chain for an unsolved run. Start a new session to try again.</p>}
      {!chain && (
        <p className="notice">
          {solved ? "Practice scores are unverified and stay in this browser. " : ""}Start an on-chain session from the level list to put a verified result on the leaderboard.
        </p>
      )}
      <div className="result-actions">
        {solved && next && (
          <button className="btn btn-primary" onClick={() => onLevels(next)}>
            Choose level {next}
          </button>
        )}
        <button className={`btn ${solved && next ? "btn-ghost" : "btn-primary"}`} onClick={() => onLevels()}>
          {chain && !solved ? "Start a new session" : "All levels"}
        </button>
        <button className="btn btn-ghost" onClick={onPractice}>
          Practice this level
        </button>
      </div>
    </section>
  );
}

/** Send the move list in one transaction; the score only reads "verified" after the receipt succeeds. */
function Submit({ result, session, onVerified }: { result: Result; session: Extract<Session, { mode: "chain" }>; onVerified: (v: Verified) => void }) {
  const { address, isConnected } = useAccount();
  const wrong = useWrongNetwork();
  const { openSheet } = useWalletSheet();
  const [tx, setTx] = useState<TxState>({ kind: "idle" });
  const [verified, setVerified] = useState<Verified | null>(null);
  const busy = tx.kind === "wallet" || tx.kind === "pending";
  const otherWallet = isConnected && address && address.toLowerCase() !== session.player.toLowerCase();

  const submit = async () => {
    setTx({ kind: "wallet" });
    let hash: Hash | undefined;
    try {
      const sent = await sendSolution(session.id, result.taps);
      hash = sent.hash;
      setTx({ kind: "pending", hash });
      const v = resultFromReceipt(await sent.receipt);
      setVerified(v);
      onVerified(v);
      setTx({ kind: "confirmed", hash });
    } catch (e) {
      setTx({ kind: "rejected", text: describeError(e), hash });
    }
  };

  return (
    <div className="save">
      <h2>Record it on Sepolia</h2>
      {tx.kind === "confirmed" && verified ? (
        <p className="ok" role="status">
          Verified on-chain: {verified.score} points in {verified.moves} moves. <a href={href.leaderboard}>See the leaderboard</a>
        </p>
      ) : (
        <>
          <p className="muted">
            Your {result.taps.length} taps go to the contract in one transaction. It replays them on session #{session.id.toString()}'s board and records the result only if
            they solve it within {result.level.moveLimit} moves.
          </p>
          {!isConnected ? (
            <button className="btn btn-primary" onClick={openSheet}>
              Reconnect your wallet
            </button>
          ) : wrong ? (
            <SwitchButton />
          ) : otherWallet ? (
            <p className="err" role="alert">
              This session belongs to {short(session.player)}. Switch to that account in your wallet to submit.
            </p>
          ) : (
            <button className="btn btn-primary" onClick={() => void submit()} disabled={busy}>
              {tx.kind === "wallet" ? "Confirm in your wallet…" : tx.kind === "pending" ? "Verifying on Sepolia…" : tx.kind === "rejected" ? "Try submitting again" : "Submit solution"}
            </button>
          )}
        </>
      )}
      <TxStatus state={tx} pendingText="Sent. Waiting for Sepolia to replay and confirm your run." confirmedText="Confirmed." />
      {tx.kind !== "confirmed" && <TestEthNote />}
    </div>
  );
}
