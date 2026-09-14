import {
  addBlock,
  countBlocksUsing,
  deleteBlock,
  followersOf,
  LOCAL_ORIGIN,
  moveBlock,
  moveUndated,
  resizeBlock,
  setBlockIndent,
  setBlockTimed,
  setBlockUndated,
  updateBlock,
  type BlockView,
  type KindView,
  type LibraryView,
  type PlanView,
  type SlotChoice,
  type StatusView,
} from "@welshonion/core";
import { useState, type CSSProperties } from "react";
import type * as Y from "yjs";
import { CommitInput } from "../app/CommitInput";
import { Menu, type MenuItem } from "../app/Menu";
import { blockTimeLabel, clock } from "./block-time";
import { blocksOfDay } from "./day-blocks";
import { MoneyEditor } from "./MoneyEditor";
import { moneyCellLabel, type MoneyCell } from "./money-cells";
import { KindPicker, StatusPicker } from "./pickers";

/** 新建的块默认「游玩」：第 ③ 步列的多是景点和活动，选错了在下拉里改。 */
const DEFAULT_KIND_ID = "sight";
const DELETED_COLOR = "#9aa3ad";
const COLUMN_COUNT = 6;

interface BlockTableProps {
  doc: Y.Doc;
  library: Y.Doc;
  libraryView: LibraryView;
  plan: PlanView;
  baseId: string;
  date: string;
  dayLabel: string;
  /** 全计划的钱格摘要，按块 id */
  moneyCells: ReadonlyMap<string, MoneyCell>;
}

/** 一天的安排表：一行一个块，末尾「加一件事」。 */
export function BlockTable({ doc, library, libraryView, plan, baseId, date, dayLabel, moneyCells }: BlockTableProps) {
  const blocks = blocksOfDay(plan, baseId);
  const kinds = [...libraryView.kinds.values()].sort(byOrder);
  const statuses = [...libraryView.statuses.values()].sort(byOrder);
  const undatedGroups = plan.undated.get(baseId);
  const countKindUsing = (kindId: string) => countBlocksUsing(plan, { kindId });
  const countStatusUsing = (statusId: string) => countBlocksUsing(plan, { statusId });

  return (
    <div className="-mx-2 overflow-x-auto">
      <table aria-label={`${dayLabel} 的安排`} className="block-table w-full min-w-[42rem]">
        <thead className="sr-only">
          <tr>
            <th>标题</th>
            <th>类型</th>
            <th>状态</th>
            <th>时间</th>
            <th>钱</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {blocks.map((block) => (
            <BlockRow
              key={block.id}
              doc={doc}
              library={library}
              plan={plan}
              block={block}
              date={date}
              kinds={kinds}
              statuses={statuses}
              slotGroup={block.start_minute === null ? (undatedGroups?.[block.slot ?? "day"] ?? []) : []}
              followerCount={followersOf(plan, libraryView, block.id).length}
              countKindUsing={countKindUsing}
              countStatusUsing={countStatusUsing}
              moneyCell={moneyCells.get(block.id)}
            />
          ))}
          <tr>
            <td colSpan={COLUMN_COUNT}>
              <AddBlock doc={doc} library={library} baseId={baseId} />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

interface BlockRowProps {
  doc: Y.Doc;
  library: Y.Doc;
  plan: PlanView;
  block: BlockView;
  date: string;
  kinds: KindView[];
  statuses: StatusView[];
  /** 没排时间的块：同一格里的块 id，按顺序；有时间的给空 */
  slotGroup: readonly string[];
  /** 删除时会被一起带走的块数 */
  followerCount: number;
  countKindUsing: (kindId: string) => number;
  countStatusUsing: (statusId: string) => number;
  /** 这块的钱格摘要；一笔钱都没挂就是 undefined */
  moneyCell: MoneyCell | undefined;
}

function BlockRow({
  doc,
  library,
  plan,
  block,
  date,
  kinds,
  statuses,
  slotGroup,
  followerCount,
  countKindUsing,
  countStatusUsing,
  moneyCell,
}: BlockRowProps) {
  const [timeOpen, setTimeOpen] = useState(false);
  const [moneyOpen, setMoneyOpen] = useState(false);
  const color = block.kind.deleted ? DELETED_COLOR : block.kind.color;
  const indent = block.indent ?? 0;
  const undated = block.start_minute === null;
  const slot: SlotChoice = block.slot ?? "day";
  const position = slotGroup.indexOf(block.id);

  // 删除不再确认，靠撤销；套着块时写明会一起删几个
  const deleteItem: MenuItem = {
    label: followerCount > 0 ? `删除（连同里面的 ${followerCount} 个）` : "删除",
    danger: true,
    onSelect: () => deleteBlock(doc, library, block.id),
  };
  const items: MenuItem[] = undated
    ? [
        indent === 0
          ? { label: "缩进", onSelect: () => setBlockIndent(doc, block.id, 1) }
          : { label: "取消缩进", onSelect: () => setBlockIndent(doc, block.id, null) },
        {
          label: "上移",
          disabled: position <= 0,
          onSelect: () => moveUndated(doc, block.id, { slot, beforeId: slotGroup[position - 1] }),
        },
        {
          label: "下移",
          disabled: position === -1 || position >= slotGroup.length - 1,
          // 放到下下个前面；后面没有了就放最后
          onSelect: () => moveUndated(doc, block.id, { slot, beforeId: slotGroup[position + 2] }),
        },
        deleteItem,
      ]
    : [deleteItem];

  return (
    <>
      <tr
        data-block-id={block.id}
        data-pending={block.status.id === "pending"}
        className="block-row"
        style={{ "--kind-color": color } as CSSProperties}
      >
        <td data-indent={indent} style={{ paddingLeft: `${0.375 + indent * 1.5}rem` }}>
          <CommitInput
            label="标题"
            showLabel={false}
            value={block.title}
            className="input-bare"
            commit={(text) => {
              // 清空不保存，恢复原标题
              if (text !== "" && text !== block.title) updateBlock(doc, library, block.id, { title: text });
              return null;
            }}
          />
        </td>
        <td className="w-32">
          <KindPicker doc={doc} library={library} block={block} kinds={kinds} countUsing={countKindUsing} />
        </td>
        <td className="w-28">
          <StatusPicker doc={doc} library={library} block={block} statuses={statuses} countUsing={countStatusUsing} />
        </td>
        <td className="w-40">
          <button
            type="button"
            aria-label="时间"
            aria-expanded={timeOpen}
            className="input-bare text-left text-sm whitespace-nowrap text-ink-muted"
            onClick={() => setTimeOpen((value) => !value)}
          >
            <span data-block-time className="tabular-nums">
              {blockTimeLabel(block, date)}
            </span>
          </button>
        </td>
        <td className="w-36">
          {/* 没挂钱时淡色的「填钱」：空格子本身就是还没填的进度 */}
          <button
            type="button"
            aria-label="钱"
            aria-expanded={moneyOpen}
            className={`input-bare text-left text-sm whitespace-nowrap tabular-nums ${moneyCell ? "text-ink" : "text-ink-muted/60"}`}
            onClick={() => setMoneyOpen((value) => !value)}
          >
            <span data-money-cell>{moneyCellLabel(moneyCell)}</span>
          </button>
        </td>
        <td className="w-12 text-right">
          <Menu label="这件事的操作" items={items}>
            ⋯
          </Menu>
        </td>
      </tr>
      {timeOpen && (
        <tr>
          <td colSpan={COLUMN_COUNT}>
            <TimeEditor doc={doc} library={library} block={block} onDone={() => setTimeOpen(false)} />
          </td>
        </tr>
      )}
      {moneyOpen && (
        <tr>
          <td colSpan={COLUMN_COUNT}>
            <MoneyEditor
              doc={doc}
              library={library}
              plan={plan}
              kinds={kinds}
              countKindUsing={countKindUsing}
              block={block}
              label={`${block.title} 的钱`}
              // 块的类型被删了时，新一笔先记成「其他」
              defaultKindId={block.kind.deleted ? "other" : block.kind.id}
              onDone={() => setMoneyOpen(false)}
            />
          </td>
        </tr>
      )}
    </>
  );
}

const SLOT_CHOICES: ReadonlyArray<[SlotChoice, string]> = [
  ["day", "整天"],
  ["morning", "上午"],
  ["afternoon", "下午"],
  ["evening", "晚上"],
];

interface TimeEditorProps {
  doc: Y.Doc;
  library: Y.Doc;
  block: BlockView;
  onDone: () => void;
}

/** 时间格点开后在行下面展开：没排时间的换格子或排上时间；有时间的改开始和时长，或取消时间。 */
function TimeEditor({ doc, library, block, onDone }: TimeEditorProps) {
  const undated = block.start_minute === null;
  const initialDuration = block.duration_min ?? 60;
  const [start, setStart] = useState(block.start_minute === null ? "" : clock(block.start_minute));
  const [hours, setHours] = useState(String(Math.floor(initialDuration / 60)));
  const [minutes, setMinutes] = useState(String(initialDuration % 60));
  const minute = parseClock(start);
  const duration = parseDuration(hours, minutes);

  const schedule = () => {
    if (minute === null || duration === null) return;
    setBlockTimed(doc, library, block.id, { minute, duration });
    onDone();
  };

  // 开始和时长一起改，算一步撤销
  const save = () => {
    if (minute === null || duration === null) return;
    doc.transact(() => {
      if (minute !== block.start_minute) {
        moveBlock(doc, library, block.id, { baseId: block.start_base_id, minute, placement: "auto" });
      }
      if (duration !== block.duration_min) resizeBlock(doc, block.id, duration);
    }, LOCAL_ORIGIN);
    onDone();
  };

  return (
    <div
      role="group"
      aria-label={`${block.title} 的时间`}
      className="flex flex-wrap items-center gap-2 py-1 pl-2 text-sm text-ink-muted"
      onKeyDown={(event) => {
        if (event.key === "Escape") onDone();
      }}
    >
      {undated && (
        <>
          <select
            aria-label="格子"
            className="input"
            value={block.slot ?? "day"}
            onChange={(event) => {
              moveUndated(doc, block.id, { slot: event.target.value as SlotChoice });
              onDone();
            }}
          >
            {SLOT_CHOICES.map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </select>
          <span>或者排上时间：</span>
        </>
      )}
      <span>开始</span>
      <input
        type="time"
        aria-label="开始"
        className="input tabular-nums"
        value={start}
        onChange={(event) => setStart(event.target.value)}
      />
      <span>时长</span>
      <input
        type="number"
        min={0}
        aria-label="小时"
        className="input w-16 tabular-nums"
        value={hours}
        onChange={(event) => setHours(event.target.value)}
      />
      <span>小时</span>
      <input
        type="number"
        min={0}
        max={59}
        aria-label="分钟"
        className="input w-16 tabular-nums"
        value={minutes}
        onChange={(event) => setMinutes(event.target.value)}
      />
      <span>分钟</span>
      {undated ? (
        <button type="button" className="btn btn-primary" disabled={minute === null || duration === null} onClick={schedule}>
          排上时间
        </button>
      ) : (
        <>
          <button type="button" className="btn btn-primary" disabled={minute === null || duration === null} onClick={save}>
            保存
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setBlockUndated(doc, block.id, { slot: "day" });
              onDone();
            }}
          >
            取消时间
          </button>
        </>
      )}
      <button type="button" className="btn btn-ghost" onClick={onDone}>
        收起
      </button>
    </div>
  );
}

/** 「09:00」→ 540；不是有效时刻给 null。 */
function parseClock(text: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(text);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour < 24 && minute < 60 ? hour * 60 + minute : null;
}

/** 小时、分钟两个框合成分钟数；不是不小于 0 的整数、分钟不小于 60 时给 null。 */
function parseDuration(hours: string, minutes: string): number | null {
  if (!/^\d+$/.test(hours) || !/^\d+$/.test(minutes)) return null;
  const minuteValue = Number(minutes);
  return minuteValue < 60 ? Number(hours) * 60 + minuteValue : null;
}

/** 填标题回车就建：没排时间、在整天、类型游玩、状态待定；建完清空，焦点留着接着加。 */
function AddBlock({ doc, library, baseId }: { doc: Y.Doc; library: Y.Doc; baseId: string }) {
  const [title, setTitle] = useState("");
  return (
    <input
      aria-label="加一件事"
      placeholder="加一件事"
      className="input-bare"
      value={title}
      onChange={(event) => setTitle(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          const text = title.trim();
          if (text !== "") addBlock(doc, library, { baseId, kindId: DEFAULT_KIND_ID, title: text, slot: "day" });
          setTitle("");
        } else if (event.key === "Escape") {
          setTitle("");
        }
      }}
    />
  );
}

function byOrder(a: { order: number }, b: { order: number }): number {
  return a.order - b.order;
}
