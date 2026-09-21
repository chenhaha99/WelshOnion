import { useMemo, useSyncExternalStore } from "react";

export type Route = { page: "list" } | { page: "plan"; planId: string } | { page: "help" };

export const HELP_HREF = "#/help";

export const LIST_HREF = "#/";

export function planHref(planId: string): string {
  return `#/plans/${planId}`;
}

/** `#/plans/<id>` 是计划页，`#/help` 是「怎么用」，其他网址一律当列表。 */
export function parseRoute(hash: string): Route {
  if (hash === HELP_HREF) return { page: "help" };
  const match = /^#\/plans\/([^/]+)$/.exec(hash);
  return match?.[1] ? { page: "plan", planId: match[1] } : { page: "list" };
}

/**
 * 改网址，并立刻通知页面切换。浏览器自己的 hashchange 是稍后才到的，
 * 等它的话，页面会先按旧网址把刚发生的变化画一帧（比如新建后先闪出一张新卡）。
 */
export function navigate(href: string): void {
  window.location.hash = href;
  window.dispatchEvent(new Event("hashchange"));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return useMemo(() => parseRoute(hash), [hash]);
}
