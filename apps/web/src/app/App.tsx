import { PlanPage } from "../plan/PlanPage";
import { PlanListPage } from "../plan-list/PlanListPage";
import { useRoute } from "./route";
import { AppServices } from "./services";

const systemNow = () => new Date().toISOString();

export function App({ now = systemNow }: { now?: () => string }) {
  const route = useRoute();
  return (
    <AppServices now={now}>
      {route.page === "plan" ? <PlanPage key={route.planId} planId={route.planId} /> : <PlanListPage />}
    </AppServices>
  );
}
