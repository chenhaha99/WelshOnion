/**
 * 自驾油费：它就是一笔普通的钱（类型为预设的 transit），这样才进得了占比图。
 * 挂上之后，距离再改也不跟着变。
 */
import * as Y from "yjs";
import { newId } from "../ids";
import { compareStrings } from "../order";
import { readLibrary, readPlan, type PlanView } from "../read";
import { LOCAL_ORIGIN } from "./origin";
import { done, type OpResult } from "./result";

type YMap = Y.Map<unknown>;

const TRANSIT_KIND_ID = "transit";

/** 距离（米）÷ 1000 × 每公里成本（分）→ 油费（分），四舍五入到整数分。 */
export function fuelCostCents(distanceM: number, costPerKmCents: number): number {
  return Math.round((distanceM / 1000) * costPerKmCents);
}

/** 自驾、有距离、计划设了每公里成本，三个条件都成立。 */
export function qualifiesForFuel(transportMode: unknown, distanceM: unknown, costPerKmCents: unknown): boolean {
  return transportMode === "drive" && typeof distanceM === "number" && typeof costPerKmCents === "number";
}

/** 块上是否已经挂着类型为 transit 的钱（比如手填的过路费、已经挂上的油费）。 */
export function hasTransitMoney(planDoc: Y.Doc, blockId: string): boolean {
  for (const expense of planDoc.getMap<YMap>("expenses").values()) {
    if (expense.get("kind_id") !== TRANSIT_KIND_ID) continue;
    if ((expense.get("block_ids") as Y.Array<string>).toArray().includes(blockId)) return true;
  }
  return false;
}

/** 新建一笔只挂这个块的油费。调用方负责包事务。 */
export function attachFuel(planDoc: Y.Doc, blockId: string, distanceM: number, costPerKmCents: number): void {
  const expense = new Y.Map<unknown>();
  planDoc.getMap<YMap>("expenses").set(newId(), expense);
  expense.set("title", `油费过路（${plainNumber(distanceM / 1000)}km × ${plainNumber(costPerKmCents / 100)} 元）`);
  expense.set("amount_cents", fuelCostCents(distanceM, costPerKmCents));
  expense.set("currency", planDoc.getMap("plan").get("base_currency"));
  expense.set("basis", "total");
  expense.set("kind_id", TRANSIT_KIND_ID);
  expense.set("block_ids", Y.Array.from([blockId]));
  expense.set("created_by", "me");
}

/** 事后才设每公里成本时，找出要补油费的块（交给界面去问）。没设每公里成本就返回空。 */
export function findFuelBackfill(planDoc: Y.Doc, library: Y.Doc): string[] {
  const plan = readPlan(planDoc, readLibrary(library));
  const cost = plan.plan.cost_per_km_cents;
  if (cost === null) return [];
  return [...plan.blocks.values()]
    .filter((block) => qualifiesForFuel(block.transport_mode, block.distance_m, cost) && !viewHasTransitMoney(plan, block.id))
    .map((block) => block.id)
    .sort(compareStrings);
}

/** 给这些块补上油费，一步撤销；执行时再按条件检查一遍，已经不满足的块跳过。 */
export function backfillFuel(planDoc: Y.Doc, library: Y.Doc, blockIds: readonly string[]): OpResult {
  const candidates = new Set(findFuelBackfill(planDoc, library));
  const cost = planDoc.getMap("plan").get("cost_per_km_cents") as number;
  planDoc.transact(() => {
    for (const id of blockIds) {
      if (!candidates.delete(id)) continue;
      const distance = planDoc.getMap<YMap>("blocks").get(id)?.get("distance_m") as number;
      attachFuel(planDoc, id, distance, cost);
    }
  }, LOCAL_ORIGIN);
  return done();
}

function viewHasTransitMoney(plan: PlanView, blockId: string): boolean {
  for (const expense of plan.expenses.values()) {
    if (expense.kind.id === TRANSIT_KIND_ID && expense.block_ids.includes(blockId)) return true;
  }
  return false;
}

/** 数字去掉多余的 0：132 → "132"，0.8 → "0.8"。 */
function plainNumber(value: number): string {
  return String(Number(value.toFixed(3)));
}
