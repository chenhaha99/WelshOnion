import { DocumentError } from "@welshonion/core";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type * as Y from "yjs";
import { normalizeSystemTimeZone } from "../plan/day-labels";
import { openLibrary } from "../storage/library";
import { LateNotice, Notice } from "./Notice";

/** 当前时间和系统时区：页面都从这里取，测试可以换成固定值。 */
interface Environment {
  now: () => string;
  timeZone: string;
}

const LibraryContext = createContext<Y.Doc | null>(null);
const EnvironmentContext = createContext<Environment | null>(null);

type LibraryState = { status: "opening" } | { status: "open"; doc: Y.Doc } | { status: "too-new" };

/** 整个应用只打开一次资料库。 */
export function AppServices({
  now,
  timeZone,
  children,
}: Environment & { children: ReactNode }) {
  const [state, setState] = useState<LibraryState>({ status: "opening" });
  const environment = useMemo(() => ({ now, timeZone: normalizeSystemTimeZone(timeZone) }), [now, timeZone]);

  useEffect(() => {
    let cancelled = false;
    let close: (() => Promise<void>) | null = null;
    openLibrary().then(
      (handle) => {
        if (cancelled) {
          void handle.close();
          return;
        }
        close = handle.close;
        setState({ status: "open", doc: handle.doc });
      },
      (error: unknown) => {
        if (cancelled) return;
        if (error instanceof DocumentError && error.code === "SCHEMA_TOO_NEW") {
          setState({ status: "too-new" });
        } else {
          setState(() => {
            throw error;
          });
        }
      },
    );
    return () => {
      cancelled = true;
      void close?.();
    };
  }, []);

  if (state.status === "opening") return <LateNotice>正在打开…</LateNotice>;
  if (state.status === "too-new") {
    return (
      <Notice title="打不开本机数据" back={false}>
        本机数据是更新版本的葱葱存的，这个版本打不开。请刷新页面，加载最新版本。
      </Notice>
    );
  }
  return (
    <EnvironmentContext.Provider value={environment}>
      <LibraryContext.Provider value={state.doc}>{children}</LibraryContext.Provider>
    </EnvironmentContext.Provider>
  );
}

export function useLibrary(): Y.Doc {
  const library = useContext(LibraryContext);
  if (!library) throw new Error("useLibrary 只能在 AppServices 里面用");
  return library;
}

function useEnvironment(): Environment {
  const environment = useContext(EnvironmentContext);
  if (!environment) throw new Error("只能在 AppServices 里面用");
  return environment;
}

export function useNow(): () => string {
  return useEnvironment().now;
}

export function useTimeZone(): string {
  return useEnvironment().timeZone;
}
