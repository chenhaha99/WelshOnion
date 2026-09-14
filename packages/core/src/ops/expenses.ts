import * as Y from "yjs";
import { newId } from "../ids";
import type { Basis } from "../read";
import type { ValidatedField } from "../validate";
import { LOCAL_ORIGIN } from "./origin";
import { done, fail, firstInvalidField, ok, type OpResult } from "./result";
import { setOrDelete } from "./write";

type YMap = Y.Map<unknown>;

export interface AddExpenseInput {
  title: string;
  /** 单位是分；不给或 null = 金额先空着 */
  amountCents?: number | null;
  basis?: Basis;
  /** 不给：挂了块就跟第一个块的类型，没挂块就是 other */
  kindId?: string;
  blockIds?: string[];
  createdBy?: string;
}

export interface ExpensePatch {
  amount_cents?: number | null;
  title?: string;
  kind_id?: string;
  basis?: Basis;
}

/** 币种固定用计划的基准币种（MVP 只有一种币种）。 */
export function addExpense(planDoc: Y.Doc, library: Y.Doc, input: AddExpenseInput): OpResult<{ expenseId: string }> {
  const basis = input.basis ?? "total";
  const invalid = firstInvalidField([
    ["amount_cents", input.amountCents ?? null],
    ["basis", basis],
  ]);
  if (invalid) return fail(invalid);
  const blocks = planDoc.getMap<YMap>("blocks");
  const blockIds = input.blockIds ?? [];
  const missingBlock = blockIds.find((id) => !blocks.has(id));
  if (missingBlock !== undefined) return fail({ code: "NOT_FOUND", id: missingBlock });
  const kinds = library.getMap("kinds");
  if (input.kindId !== undefined && !kinds.has(input.kindId)) return fail({ code: "NOT_FOUND", id: input.kindId });
  const kindId = input.kindId ?? defaultKind(blocks, blockIds, kinds);

  const expenseId = newId();
  planDoc.transact(() => {
    const expense = new Y.Map<unknown>();
    planDoc.getMap<YMap>("expenses").set(expenseId, expense);
    expense.set("title", input.title);
    setOrDelete(expense, "amount_cents", input.amountCents ?? null);
    expense.set("currency", planDoc.getMap("plan").get("base_currency"));
    expense.set("basis", basis);
    expense.set("kind_id", kindId);
    expense.set("block_ids", Y.Array.from(blockIds));
    expense.set("created_by", input.createdBy ?? "me");
  }, LOCAL_ORIGIN);
  return ok({ expenseId });
}

export function updateExpense(planDoc: Y.Doc, library: Y.Doc, expenseId: string, patch: ExpensePatch): OpResult {
  const checks: Array<readonly [ValidatedField, unknown]> = [];
  if (patch.amount_cents !== undefined) checks.push(["amount_cents", patch.amount_cents]);
  if (patch.basis !== undefined) checks.push(["basis", patch.basis]);
  const invalid = firstInvalidField(checks);
  if (invalid) return fail(invalid);
  const expense = expensesOf(planDoc).get(expenseId);
  if (!expense) return fail({ code: "NOT_FOUND", id: expenseId });
  if (patch.kind_id !== undefined && !library.getMap("kinds").has(patch.kind_id)) {
    return fail({ code: "NOT_FOUND", id: patch.kind_id });
  }

  planDoc.transact(() => {
    for (const key of ["amount_cents", "title", "kind_id", "basis"] as const) {
      const value = patch[key];
      if (value !== undefined) setOrDelete(expense, key, value);
    }
  }, LOCAL_ORIGIN);
  return done();
}

/** 把钱也挂到另一个块上；已经挂着就什么都不改。 */
export function linkExpense(planDoc: Y.Doc, expenseId: string, blockId: string): OpResult {
  const expense = expensesOf(planDoc).get(expenseId);
  if (!expense) return fail({ code: "NOT_FOUND", id: expenseId });
  if (!planDoc.getMap("blocks").has(blockId)) return fail({ code: "NOT_FOUND", id: blockId });
  const linked = blockIdsOf(expense);
  if (linked.toArray().includes(blockId)) return done();
  planDoc.transact(() => linked.push([blockId]), LOCAL_ORIGIN);
  return done();
}

/** 解除一个块的关联，钱本身保留（一个块都不挂也保留）。 */
export function unlinkExpense(planDoc: Y.Doc, expenseId: string, blockId: string): OpResult {
  const expense = expensesOf(planDoc).get(expenseId);
  if (!expense) return fail({ code: "NOT_FOUND", id: expenseId });
  const linked = blockIdsOf(expense);
  const ids = linked.toArray();
  if (!ids.includes(blockId)) return done();
  planDoc.transact(() => {
    for (let index = ids.length - 1; index >= 0; index--) {
      if (ids[index] === blockId) linked.delete(index, 1);
    }
  }, LOCAL_ORIGIN);
  return done();
}

export function deleteExpense(planDoc: Y.Doc, expenseId: string): OpResult {
  const expenses = expensesOf(planDoc);
  if (!expenses.has(expenseId)) return fail({ code: "NOT_FOUND", id: expenseId });
  planDoc.transact(() => expenses.delete(expenseId), LOCAL_ORIGIN);
  return done();
}

function defaultKind(blocks: Y.Map<YMap>, blockIds: readonly string[], kinds: Y.Map<unknown>): string {
  const first = blockIds[0];
  const kindId = first === undefined ? undefined : blocks.get(first)?.get("kind_id");
  return typeof kindId === "string" && kinds.has(kindId) ? kindId : "other";
}

function expensesOf(planDoc: Y.Doc): Y.Map<YMap> {
  return planDoc.getMap<YMap>("expenses");
}

function blockIdsOf(expense: YMap): Y.Array<string> {
  return expense.get("block_ids") as Y.Array<string>;
}
