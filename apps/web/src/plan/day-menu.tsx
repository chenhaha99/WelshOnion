import {
  addDayInTz,
  deleteDay,
  insertDayAbove,
  insertDayBelow,
  moveDay,
  setDayTz,
  type BaseView,
  type PlanView,
} from "@welshonion/core";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type * as Y from "yjs";
import { Menu, type MenuItem } from "../app/Menu";
import { COMMON_TIME_ZONES, cityName } from "./day-labels";
import { useNotifyDeleted } from "./DeletedNotice";

type Direction = "above" | "below";

// 平时只显示菜单按钮；选了「改时区」「加一个另一时区的这天」或插天被块跨过时，原地展开
type Mode =
  | { kind: "normal" }
  | { kind: "pick-tz"; purpose: "change" | "add" }
  | { kind: "crossing"; direction: Direction }
;

const NORMAL: Mode = { kind: "normal" };

interface DayMenuOptions {
  doc: Y.Doc;
  plan: PlanView;
  base: BaseView;
  /** 这天的标签：「第 2 天 · 10.2 周五」 */
  label: string;
  index: number;
  count: number;
  /** 菜单按钮的样式；不给是普通大小的按钮 */
  triggerClassName?: string;
}

export interface DayMenu {
  /** 「这天的操作」按钮；展开着表单时不出现 */
  menu: ReactNode;
  /** 展开的表单；没展开是 null */
  form: ReactNode;
  /** 焦点放到菜单按钮上 */
  focusMenu: () => void;
}

/**
 * 每天的菜单：插天（被块跨过先问放哪边）、上移下移、改时区、加一个另一时区的这天、删天。
 * 日程的组头、时间线的横排行、竖排共用：按钮和展开的表单由用它的地方各自摆。
 * 展开时焦点放进表单，收起后回到菜单按钮；竖排翻到别的天时，展开的收起，焦点不动。
 */
export function useDayMenu({ doc, plan, base, label, index, count, triggerClassName }: DayMenuOptions): DayMenu {
  // 记着是在哪天展开的：竖排翻到别的天，就不再显示这天的表单
  const [opened, setOpened] = useState<{ baseId: string; mode: Mode }>({ baseId: base.id, mode: NORMAL });
  const mode = opened.baseId === base.id ? opened.mode : NORMAL;
  const setMode = (next: Mode) => setOpened({ baseId: base.id, mode: next });
  const backToNormal = () => setMode(NORMAL);
  const notifyDeleted = useNotifyDeleted();

  // 展开时焦点放进展开的东西里；收起后菜单按钮重新出现，焦点放回它（这几样只能用按钮或 Esc 收起，不会抢走点到别处的焦点）
  const menuSlot = useRef<HTMLSpanElement>(null);
  // 展开着的是哪天：翻到别的天、表单不见了，不算收起，不抢焦点
  const expandedFor = useRef<string | null>(null);
  useEffect(() => {
    if (mode.kind === "normal" && expandedFor.current === base.id) menuSlot.current?.querySelector("button")?.focus();
    expandedFor.current = mode.kind === "normal" ? null : base.id;
  }, [mode.kind, base.id]);

  const insert = (direction: Direction, crossingBlocks?: "before" | "after") => {
    const insertDay = direction === "above" ? insertDayAbove : insertDayBelow;
    const result = insertDay(doc, base.id, crossingBlocks ? { crossingBlocks } : {});
    if (!result.ok && result.error.code === "CROSSING_BLOCKS") setMode({ kind: "crossing", direction });
    else backToNormal();
  };

  // 删天不确认，靠撤销：坐在这天上的块会一起删掉，提示里写明几件；撤销后焦点落到那天的菜单按钮（两个视图都有）
  const removeDay = () => {
    const blockCount = [...plan.blocks.values()].filter((block) => block.start_base_id === base.id).length;
    deleteDay(doc, base.id);
    notifyDeleted({
      message: blockCount > 0 ? `删掉了${label}，连同这天的 ${blockCount} 件事` : `删掉了${label}`,
      focusAfterUndo: `[data-base-id="${base.id}"] button[aria-label="这天的操作"]`,
    });
  };

  const items: MenuItem[] = [
    { label: "在上面插一天", onSelect: () => insert("above") },
    { label: "在下面插一天", onSelect: () => insert("below") },
    { label: "上移", disabled: index === 0, onSelect: () => moveDay(doc, base.id, index - 1) },
    { label: "下移", disabled: index === count - 1, onSelect: () => moveDay(doc, base.id, index + 1) },
    { label: "改时区…", onSelect: () => setMode({ kind: "pick-tz", purpose: "change" }) },
    { label: "加一个另一时区的这天…", onSelect: () => setMode({ kind: "pick-tz", purpose: "add" }) },
    { label: "删除这天", danger: true, onSelect: removeDay },
  ];

  const menu =
    mode.kind === "normal" ? (
      <span ref={menuSlot} className="contents">
        <Menu label="这天的操作" items={items} triggerClassName={triggerClassName}>
          ⋯
        </Menu>
      </span>
    ) : null;

  let form: ReactNode = null;
  if (mode.kind === "pick-tz") {
    form = (
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
    );
  } else if (mode.kind === "crossing") {
    form = (
      <div
        className="flex flex-wrap items-center gap-2 text-sm"
        onKeyDown={(event) => {
          if (event.key === "Escape") backToNormal();
        }}
      >
        <span className="text-ink">有事跨过这里，它们放在新插入那天的之前还是之后？</span>
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
    );
  }

  return { menu, form, focusMenu: () => menuSlot.current?.querySelector("button")?.focus() };
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
