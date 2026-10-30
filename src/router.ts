import { useEffect, useState } from "react";

/** Hash routes, so the static export works at any gateway subpath with no server rewrites. */
export type Route = { name: "lobby" } | { name: "game"; slug: string } | { name: "leaderboard" } | { name: "missing" };

export const parse = (hash: string): Route => {
  const path = hash.replace(/^#/, "").replace(/\/+$/, "") || "/";
  if (path === "/" || path === "") return { name: "lobby" };
  if (path === "/leaderboard") return { name: "leaderboard" };
  const m = path.match(/^\/play\/([a-z0-9-]+)$/);
  if (m) return { name: "game", slug: m[1]! };
  return { name: "missing" };
};

export const href = {
  lobby: "#/",
  leaderboard: "#/leaderboard",
  game: (slug: string) => `#/play/${slug}`,
};

export const useRoute = (): Route => {
  const [route, setRoute] = useState(() => parse(location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parse(location.hash));
      window.scrollTo(0, 0);
    };
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return route;
};
