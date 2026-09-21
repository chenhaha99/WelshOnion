import { useSyncExternalStore } from "react";

/**
 * 本机记着用过哪些「藏起来的」手势：「怎么用」页上打勾（照 Figma 快捷键面板高亮用过的），
 * 场景小提示用过了就不再出现（照苹果 TipKit：已经会的人不该再看到提示）。只记在这台设备上。
 */
export type HelpId =
  | "long-press-drag"
  | "handle-drag"
  | "pinch"
  | "blank-add"
  | "alt-copy"
  | "onto"
  | "tray-to-axis"
  | "card-menu";

const KEY = "welshonion.help-used";
const CHANGED = "welshonion-help-used";

export function readUsed(): Set<HelpId> {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return new Set(Array.isArray(stored) ? (stored.filter((id) => typeof id === "string") as HelpId[]) : []);
  } catch {
    // 存坏了（手改过、别的版本写的）：当都没用过，最多多看到一次提示
    return new Set();
  }
}

/** 用过了一次：记下来，通知页面上的勾和提示 */
export function markUsed(id: HelpId): void {
  const used = readUsed();
  if (used.has(id)) return;
  used.add(id);
  localStorage.setItem(KEY, JSON.stringify([...used]));
  window.dispatchEvent(new Event(CHANGED));
}

let cached: { raw: string | null; used: Set<HelpId> } = { raw: null, used: new Set() };

function snapshot(): Set<HelpId> {
  const raw = localStorage.getItem(KEY);
  if (raw !== cached.raw) cached = { raw, used: readUsed() };
  return cached.used;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useUsed(): Set<HelpId> {
  return useSyncExternalStore(subscribe, snapshot);
}
