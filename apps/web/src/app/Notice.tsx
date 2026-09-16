import type { ReactNode } from "react";
import { LIST_HREF } from "./route";
import { useWideScreen } from "./use-wide-screen";

export function BackToList() {
  const wide = useWideScreen();
  return (
    <a href={LIST_HREF} aria-label="我的计划" className="text-sm text-ink-muted hover:text-ink">
      {/* 手机上「← 我的计划」和计划名、三个图标挤在一行放不下：只留箭头 */}
      {wide ? "← 我的计划" : "←"}
    </a>
  );
}

/** 整页只说一件事：找不到、已删除、打不开。 */
export function Notice({ title, back = true, children }: { title: string; back?: boolean; children?: ReactNode }) {
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <div className="glass-card flex flex-col gap-3 p-8">
        <h1 className="text-lg font-medium text-ink">{title}</h1>
        {children && <p className="text-ink-muted">{children}</p>}
        {back && <BackToList />}
      </div>
    </main>
  );
}

/** 通常几十毫秒就好，只有等久了才显示出来，避免一闪而过。 */
export function LateNotice({ children }: { children: ReactNode }) {
  return <p className="appear-late px-6 py-16 text-center text-ink-muted">{children}</p>;
}
