/** 计划页的两个视图 */
export type PlanViewName = "timeline" | "list";

// 按计划记在这台设备上，不进计划文档：这是怎么看，不是计划本身，导出、协作时都不该带着
function keyOf(planId: string): string {
  return `welshonion.plan-view.${planId}`;
}

/** 这个计划上次看的视图；没存过是列表。 */
export function readPlanView(planId: string): PlanViewName {
  return localStorage.getItem(keyOf(planId)) === "timeline" ? "timeline" : "list";
}

export function savePlanView(planId: string, view: PlanViewName): void {
  localStorage.setItem(keyOf(planId), view);
}
