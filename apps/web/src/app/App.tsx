import { useEffect } from "react";
import { HelpPage } from "../help/HelpPage";
import { PlanPage } from "../plan/PlanPage";
import { PlanListPage } from "../plan-list/PlanListPage";
import { HELP_HREF, navigate, useRoute } from "./route";
import { AppServices } from "./services";

const systemNow = () => new Date().toISOString();
const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function App({ now = systemNow, timeZone = systemTimeZone }: { now?: () => string; timeZone?: string }) {
  const route = useRoute();
  // 电脑上按 ? 打开「怎么用」（照 Figma 的快捷键面板）；在输入框里打 ? 不算
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "?" || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select") !== null)) return;
      navigate(HELP_HREF);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  return (
    <AppServices now={now} timeZone={timeZone}>
      {route.page === "plan" ? (
        <PlanPage key={route.planId} planId={route.planId} />
      ) : route.page === "help" ? (
        <HelpPage />
      ) : (
        <PlanListPage />
      )}
    </AppServices>
  );
}
