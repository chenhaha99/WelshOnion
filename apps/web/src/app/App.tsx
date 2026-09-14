import { PlanPage } from "../plan/PlanPage";
import { PlanListPage } from "../plan-list/PlanListPage";
import { useRoute } from "./route";
import { AppServices } from "./services";

const systemNow = () => new Date().toISOString();
const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function App({ now = systemNow, timeZone = systemTimeZone }: { now?: () => string; timeZone?: string }) {
  const route = useRoute();
  return (
    <AppServices now={now} timeZone={timeZone}>
      {route.page === "plan" ? <PlanPage key={route.planId} planId={route.planId} /> : <PlanListPage />}
    </AppServices>
  );
}
