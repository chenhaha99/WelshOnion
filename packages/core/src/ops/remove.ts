import type * as Y from "yjs";

/**
 * 删一批块，挂着的钱按整批规则处理：
 * 一笔钱挂的（还存在的）块全在这批里，就把钱也删掉；否则只解除这批块的关联。
 * 删一个块时，结果和「只挂这一块就一起删、挂多块就只解除」一样。
 * 调用方负责把它包进事务。
 */
export function removeBlocks(planDoc: Y.Doc, blockIds: readonly string[]): void {
  const removing = new Set(blockIds);
  const blocks = planDoc.getMap<Y.Map<unknown>>("blocks");
  const expenses = planDoc.getMap<Y.Map<unknown>>("expenses");

  for (const [expenseId, expense] of [...expenses.entries()]) {
    const linked = expense.get("block_ids") as Y.Array<string>;
    const ids = linked.toArray();
    if (!ids.some((id) => removing.has(id))) continue;

    const stillLinked = ids.filter((id) => !removing.has(id) && blocks.has(id));
    if (stillLinked.length === 0) {
      expenses.delete(expenseId);
      continue;
    }
    for (let index = ids.length - 1; index >= 0; index--) {
      const id = ids[index];
      if (id !== undefined && removing.has(id)) linked.delete(index, 1);
    }
  }

  for (const id of blockIds) {
    blocks.delete(id);
  }
}
