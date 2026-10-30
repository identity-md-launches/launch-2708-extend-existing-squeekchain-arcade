import { Suspense, useEffect } from "react";
import { findGame } from "./games/registry";
import Leaderboard from "./pages/Leaderboard";
import Lobby from "./pages/Lobby";
import { href, useRoute, type Route } from "./router";
import { ConnectControl } from "./wallet/ConnectSheet";

const TITLES: Record<Route["name"], string> = { lobby: "", game: "", leaderboard: "Leaderboard", missing: "Page not found" };

function Logo() {
  return (
    <svg className="logo-mark" width="28" height="28" viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges">
      <path fill="currentColor" d="M2 2h4v4H2zM10 2h4v4h-4zM4 6h8v2H4zM3 8h10v4H3zM5 12h6v2H5z" />
      <path fill="var(--color-bg)" d="M5 9h2v2H5zM9 9h2v2H9z" />
      <path fill="var(--color-accent-2)" d="M7 12h2v1H7z" />
    </svg>
  );
}

export default function App() {
  const route = useRoute();
  const game = route.name === "game" ? findGame(route.slug) : undefined;

  useEffect(() => {
    const t = game ? game.title : TITLES[route.name];
    document.title = t ? `${t} · Squeekchain Arcade` : "Squeekchain Arcade: browser puzzle games";
  }, [route, game]);

  const current = (name: string) => (route.name === name || (name === "play" && route.name === "game") ? "page" : undefined);

  return (
    <div id="shell" className="shell">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="top">
        <a className="brand" href={href.lobby}>
          <Logo />
          <span>Squeekchain Arcade</span>
        </a>
        <nav aria-label="Main" className="nav">
          <a href={href.lobby} aria-current={current("lobby")}>
            Lobby
          </a>
          <a href={href.game("number-slide")} aria-current={current("play")}>
            Number Slide
          </a>
          <a href={href.leaderboard} aria-current={current("leaderboard")}>
            Leaderboard
          </a>
        </nav>
        <div className="top-connect">
          <ConnectControl />
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        {route.name === "lobby" && <Lobby />}
        {route.name === "leaderboard" && <Leaderboard />}
        {route.name === "game" && game && (
          <Suspense fallback={<p className="page muted">Loading {game.title}…</p>}>
            <game.Component />
          </Suspense>
        )}
        {(route.name === "missing" || (route.name === "game" && !game)) && (
          <div className="page">
            <h1>Page not found</h1>
            <p className="lead">That page is not in the arcade.</p>
            <a className="btn btn-primary" href={href.lobby}>
              Back to the lobby
            </a>
          </div>
        )}
      </main>
      <footer className="foot">
        <p>Squeekchain Arcade. A Sepolia testnet game: scores are points only, not tokens or financial rewards.</p>
      </footer>
    </div>
  );
}
