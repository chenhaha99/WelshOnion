import {
  LOCAL_ORIGIN,
  moveBlock,
  moveUndated,
  resizeBlock,
  setBlockTimed,
  setBlockUndated,
  type BlockView,
  type PlanView,
  type SlotChoice,
} from "@welshonion/core";
import { useState } from "react";
import type * as Y from "yjs";
import { clock } from "./block-time";
import { dayRowLabels } from "./day-labels";

const SLOT_CHOICES: ReadonlyArray<[SlotChoice, string]> = [
  ["day", "整天"],
  ["morning", "上午"],
  ["afternoon", "下午"],
  ["evening", "晚上"],
];

interface TimeEditorProps {
  doc: Y.Doc;
  library: Y.Doc;
  plan: PlanView;
  block: BlockView;
  /** 收起：做完一样、点「收起」、按 Esc 时调用；焦点交回打开它的「时间」按钮 */
  onDone: () => void;
}

/**
 * 时间的编辑区，安排表的时间格和详情面板共用。没排时间的：换天、换格子（选了就换），或者排上时间、只存时长；
 * 有时间的：哪天、开始和时长一起保存（套在里面的块跟着走），或者取消时间。
 * Esc 只收起编辑区、不往外传：在详情面板里按，面板不跟着关。
 */
export function TimeEditor({ doc, library, plan, block, onDone }: TimeEditorProps) {
  const undated = block.start_minute === null;
  const initialDuration = block.duration_min ?? 60;
  const [baseId, setBaseId] = useState(block.start_base_id);
  const [start, setStart] = useState(block.start_minute === null ? "" : clock(block.start_minute));
  const [hours, setHours] = useState(String(Math.floor(initialDuration / 60)));
  const [minutes, setMinutes] = useState(String(initialDuration % 60));
  const minute = parseClock(start);
  const duration = parseDuration(hours, minutes);
  const labels = dayRowLabels(plan.bases);

  const schedule = () => {
    if (minute === null || duration === null) return;
    setBlockTimed(doc, library, block.id, { minute, duration });
    onDone();
  };

  // 没排时间的块只存时长，不排时间、不动格子
  const saveDuration = () => {
    if (duration === null) return;
    resizeBlock(doc, block.id, duration);
    onDone();
  };

  // 哪天、开始和时长一起改，算一步撤销
  const save = () => {
    if (minute === null || duration === null) return;
    doc.transact(() => {
      if (baseId !== block.start_base_id || minute !== block.start_minute) {
        moveBlock(doc, library, block.id, { baseId, minute, placement: "auto" });
      }
      if (duration !== block.duration_min) resizeBlock(doc, block.id, duration);
    }, LOCAL_ORIGIN);
    onDone();
  };

  return (
    <div
      role="group"
      aria-label={`${block.title} 的时间`}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 py-1 pl-2 text-sm text-ink-muted"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        onDone();
      }}
    >
      {/* 字和它的框连成一组，放不下时整组换行：不会把「开始」和它的框、「小时」和「分钟」拆到两行 */}
      <span className="inline-flex max-w-full items-center gap-2">
        <span className="shrink-0">哪天</span>
        <select
          aria-label="哪天"
          className="input min-w-0"
          value={undated ? block.start_base_id : baseId}
          onChange={(event) => {
            if (!undated) {
              setBaseId(event.target.value);
              return;
            }
            // 没排时间的选了就换，和换格子一样：格子不变，排在那天那一格最后
            setBlockUndated(doc, block.id, { baseId: event.target.value, slot: block.slot ?? "day" });
            onDone();
          }}
        >
          {plan.bases.map((base, index) => (
            <option key={base.id} value={base.id}>
              {labels[index]}
            </option>
          ))}
        </select>
      </span>
      {undated && (
        <span className="inline-flex items-center gap-2">
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
        </span>
      )}
      <span className="inline-flex items-center gap-2">
        <span>开始</span>
        <input
          type="time"
          aria-label="开始"
          className="input tabular-nums"
          value={start}
          onChange={(event) => setStart(event.target.value)}
        />
      </span>
      <span className="inline-flex items-center gap-2">
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
      </span>
      <span className="inline-flex flex-wrap items-center gap-2">
        {undated ? (
          <>
            <button type="button" className="btn btn-primary" disabled={minute === null || duration === null} onClick={schedule}>
              排上时间
            </button>
            <button type="button" className="btn btn-ghost" disabled={duration === null} onClick={saveDuration}>
              只存时长
            </button>
          </>
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
      </span>
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
