import {
  addDayInTz,
  dayFacts,
  deleteDay,
  insertDayAbove,
  insertDayBelow,
  moveDay,
  setDayBudget,
  setDayFlag,
  setDayTz,
  type BaseView,
  type DayBudget,
  type DayFlag,
  type LibraryView,
  type PlanView,
  type StatsFilter,
} from "@welshonion/core";
import { Fragment, useEffect, useRef, useState } from "react";
import type * as Y from "yjs";
import { Menu, type MenuItem } from "../app/Menu";
import { BlockTable } from "./BlockTable";
import { BudgetFields } from "./BudgetFields";
import { budgetParts } from "./day-budget";
import { dayFactsParts } from "./day-facts";
import { COMMON_TIME_ZONES, cityName } from "./day-labels";
import { useNotifyDeleted } from "./DeletedNotice";
import type { MoneyCell } from "./money-cells";

type Direction = "above" | "below";

// 平时只显示菜单按钮；选了「改时区」「加一个另一时区的这天」「这天的时间预算」或插天被块跨过时，行里原地展开
type Mode =
  | { kind: "normal" }
  | { kind: "pick-tz"; purpose: "change" | "add" }
  | { kind: "crossing"; direction: Direction }
  | { kind: "budget" };

interface DayRowProps {
  doc: Y.Doc;
  library: Y.Doc;
  libraryView: LibraryView;
  plan: PlanView;
  base: BaseView;
  label: string;
  index: number;
  count: number;
  moneyCells: ReadonlyMap<string, MoneyCell>;
  /** 按状态筛选；没开是 undefined */
  filter?: StatsFilter;
}

export function DayRow({ doc, library, libraryView, plan, base, label, index, count, moneyCells, filter }: DayRowProps) {
  const [mode, setMode] = useState<Mode>({ kind: "normal" });
  const backToNormal = () => setMode({ kind: "normal" });
  const notifyDeleted = useNotifyDeleted();
  const facts = dayFactsParts(plan, base, moneyCells, filter);
  const budget = dayFacts(plan, base.id).budget;
  const budgetLine = budget === null ? [] : budgetParts(budget);

  // 展开时焦点放进展开的东西里；收起后菜单按钮重新出现，焦点放回它（这几样只能用按钮或 Esc 收起，不会抢走点到别处的焦点）
  const menuSlot = useRef<HTMLSpanElement>(null);
  const budgetGroup = useRef<HTMLDivElement>(null);
  const expanded = useRef(false);
  useEffect(() => {
    if (mode.kind === "budget") budgetGroup.current?.querySelector("input")?.focus();
    else if (mode.kind === "normal" && expanded.current) menuSlot.current?.querySelector("button")?.focus();
    expanded.current = mode.kind !== "normal";
  }, [mode.kind]);

  const insert = (direction: Direction, crossingBlocks?: "before" | "after") => {
    const insertDay = direction === "above" ? insertDayAbove : insertDayBelow;
    const result = insertDay(doc, base.id, crossingBlocks ? { crossingBlocks } : {});
    if (!result.ok && result.error.code === "CROSSING_BLOCKS") setMode({ kind: "crossing", direction });
    else backToNormal();
  };

  // 删天不确认，靠撤销：坐在这天上的块会一起删掉，提示里写明几件
  const removeDay = () => {
    const blockCount = [...plan.blocks.values()].filter((block) => block.start_base_id === base.id).length;
    deleteDay(doc, base.id);
    notifyDeleted({
      message: blockCount > 0 ? `删掉了${label}，连同这天的 ${blockCount} 件事` : `删掉了${label}`,
      focusAfterUndo: `li[data-base-id="${base.id}"] button[aria-label="这天的操作"]`,
    });
  };

  const flagItem = (flag: DayFlag, name: string): MenuItem =>
    base.day_flag === flag
      ? { label: `取消${name}`, onSelect: () => setDayFlag(doc, base.id, null) }
      : { label: `标成${name}`, onSelect: () => setDayFlag(doc, base.id, flag) };

  const items: MenuItem[] = [
    { label: "在上面插一天", onSelect: () => insert("above") },
    { label: "在下面插一天", onSelect: () => insert("below") },
    { label: "上移", disabled: index === 0, onSelect: () => moveDay(doc, base.id, index - 1) },
    { label: "下移", disabled: index === count - 1, onSelect: () => moveDay(doc, base.id, index + 1) },
    flagItem("leave", "请假"),
    flagItem("makeup", "补班"),
    { label: "改时区…", onSelect: () => setMode({ kind: "pick-tz", purpose: "change" }) },
    { label: "加一个另一时区的这天…", onSelect: () => setMode({ kind: "pick-tz", purpose: "add" }) },
    { label: "这天的时间预算…", onSelect: () => setMode({ kind: "budget" }) },
    { label: "删除这天", danger: true, onSelect: removeDay },
  ];

  return (
    <li data-base-id={base.id} className="glass-card relative flex flex-col gap-2 px-5 py-3 has-[[aria-expanded=true]]:z-10">
      <div className="flex min-h-9 items-center gap-3">
        <span data-day-label className="text-ink tabular-nums">
          {label}
        </span>
        {base.day_flag && <span className="chip">{base.day_flag === "leave" ? "请假" : "补班"}</span>}
        <span className="flex-1" />
        {mode.kind === "normal" && (
          <span ref={menuSlot} className="contents">
            <Menu label="这天的操作" items={items}>
              ⋯
            </Menu>
          </span>
        )}
      </div>

      {mode.kind === "pick-tz" && (
        <TimeZonePicker
          purpose={mode.purpose}
          currentTz={base.tz}
          onPick={(tz) => {
            if (mode.purpose === "change") setDayTz(doc, base.id, tz);
            else addDayInTz(doc, base.id, tz);
            backToNormal();
          }}
          onCancel={backToNormal}
        />
      )}

      {mode.kind === "crossing" && (
        <div
          className="flex flex-wrap items-center gap-2 text-sm"
          onKeyDown={(event) => {
            if (event.key === "Escape") backToNormal();
          }}
        >
          <span className="text-ink">有块跨过这里，它们放在新插入那天的之前还是之后？</span>
          <button type="button" className="btn btn-ghost" autoFocus onClick={() => insert(mode.direction, "before")}>
            之前
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => insert(mode.direction, "after")}>
            之后
          </button>
          <button type="button" className="btn btn-ghost" onClick={backToNormal}>
            取消
          </button>
        </div>
      )}

      {mode.kind === "budget" && (
        <div
          ref={budgetGroup}
          role="group"
          aria-label={`${label} 的时间预算`}
          className="flex flex-wrap items-end gap-3 text-sm"
          onKeyDown={(event) => {
            if (event.key === "Escape") backToNormal();
          }}
        >
          <BudgetFields
            budget={base.day_budget as DayBudget | null}
            inherited={plan.plan.default_day_budget as DayBudget | null}
            save={(next) => setDayBudget(doc, base.id, next)}
            fieldClassName="w-36"
          />
          <button type="button" className="btn btn-ghost" onClick={backToNormal}>
            收起
          </button>
        </div>
      )}

      {facts.length > 0 && (
        <p data-day-facts className="text-sm text-ink-muted tabular-nums">
          <Parts parts={facts} />
        </p>
      )}
      {budgetLine.length > 0 && (
        <p data-day-budget className="text-sm text-ink-muted tabular-nums">
          你设的：
          <Parts parts={budgetLine} />
        </p>
      )}

      <BlockTable
        doc={doc}
        library={library}
        libraryView={libraryView}
        plan={plan}
        baseId={base.id}
        date={base.date}
        dayLabel={label}
        moneyCells={moneyCells}
        filter={filter}
        onEmptyFocus={() => menuSlot.current?.querySelector("button")?.focus()}
      />
    </li>
  );
}

/** 各项用「 · 」隔开；手机上放不下时只在项和项之间换行，一项不拆开。 */
function Parts({ parts }: { parts: string[] }) {
  return parts.map((part, index) => (
    <Fragment key={index}>
      {index > 0 && " · "}
      <span className="whitespace-nowrap">{part}</span>
    </Fragment>
  ));
}

interface TimeZonePickerProps {
  purpose: "change" | "add";
  currentTz: string;
  onPick: (tz: string) => void;
  onCancel: () => void;
}

function TimeZonePicker({ purpose, currentTz, onPick, onCancel }: TimeZonePickerProps) {
  const choices = purpose === "add" ? COMMON_TIME_ZONES.filter((tz) => tz !== currentTz) : COMMON_TIME_ZONES;
  return (
    <div
      className="flex flex-wrap items-center gap-2 text-sm"
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel();
      }}
    >
      <span className="text-ink-muted">{purpose === "add" ? "在这天下面加一个同日期的：" : "这天的时区："}</span>
      <select
        aria-label="时区"
        autoFocus
        className="input"
        value={purpose === "change" ? currentTz : ""}
        onChange={(event) => onPick(event.target.value)}
      >
        {purpose === "add" && (
          <option value="" disabled>
            选一个时区
          </option>
        )}
        {purpose === "change" && !COMMON_TIME_ZONES.includes(currentTz) && <option value={currentTz}>{currentTz}</option>}
        {choices.map((tz) => (
          <option key={tz} value={tz}>
            {cityName(tz)}
          </option>
        ))}
      </select>
      <button type="button" className="btn btn-ghost" onClick={onCancel}>
        取消
      </button>
    </div>
  );
}
