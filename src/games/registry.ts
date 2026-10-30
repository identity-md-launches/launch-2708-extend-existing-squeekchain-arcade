import { lazy, type ComponentType, type LazyExoticComponent } from "react";

/**
 * Every arcade game is one entry here. To add a game, put its folder beside number-slide/,
 * export a default component, and add an entry: the lobby card, its route (#/play/<slug>) and its
 * leaderboard tab follow from this list.
 */
export type GameEntry = {
  slug: string;
  title: string;
  blurb: string;
  howTo: string;
  /** Small pixel preview drawn as a grid of numbers; 0 is the empty cell. */
  preview: number[];
  previewSize: number;
  Component: LazyExoticComponent<ComponentType>;
};

export const GAMES: readonly GameEntry[] = [
  {
    slug: "number-slide",
    title: "Number Slide",
    blurb: "Slide the numbered tiles back into order before the clock or your moves run out.",
    howTo: "Six timed levels, from a 3 by 3 warm-up to a 5 by 5 night shift. Wins are verified on Sepolia.",
    preview: [1, 2, 3, 4, 0, 6, 7, 5, 8],
    previewSize: 3,
    Component: lazy(() => import("./number-slide/NumberSlide")),
  },
];

export const findGame = (slug: string) => GAMES.find((g) => g.slug === slug);
