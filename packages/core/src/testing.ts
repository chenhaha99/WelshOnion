/** 测试用的构造函数：直接往 Y.Doc 里写结构，不经过操作层。只给测试用。 */
import * as Y from "yjs";

type Fields = Record<string, unknown>;

export function addBase(doc: Y.Doc, id: string, date: string, tz = "Asia/Shanghai", undated: string[] = []) {
  doc.getMap("bases").set(
    id,
    new Y.Map<unknown>([
      ["date", date],
      ["tz", tz],
      ["undated", Y.Array.from(undated)],
    ]),
  );
}

export function addBlock(doc: Y.Doc, id: string, fields: Fields) {
  const { note, place_ids, tag_ids, ...rest } = fields;
  const block = new Y.Map<unknown>(
    Object.entries({ kind_id: "sight", title: id, created_by: "me", ...rest }),
  );
  block.set("place_ids", Y.Array.from((place_ids as string[] | undefined) ?? []));
  // 不给就不写：和标签出现以前建的事一样
  if (tag_ids !== undefined) block.set("tag_ids", Y.Array.from(tag_ids as string[]));
  if (typeof note === "string") {
    const text = new Y.Text();
    text.insert(0, note);
    block.set("note", text);
  }
  doc.getMap("blocks").set(id, block);
}

export function addExpense(doc: Y.Doc, id: string, fields: Fields) {
  const { block_ids, ...rest } = fields;
  const expense = new Y.Map<unknown>(
    Object.entries({ currency: "CNY", basis: "total", kind_id: "other", title: id, created_by: "me", ...rest }),
  );
  expense.set("block_ids", Y.Array.from((block_ids as string[] | undefined) ?? []));
  doc.getMap("expenses").set(id, expense);
}
