import { updateBlock, type BlockView, type TransportMode } from "@welshonion/core";
import { useEffect, useRef, useState } from "react";
import type * as Y from "yjs";
import { CommitInput } from "../app/CommitInput";
import { distanceKmText, parseDistanceKm } from "./block-details";

const TRANSIT_KIND_ID = "transit";

const TRANSPORT_CHOICES: ReadonlyArray<readonly [TransportMode | "", string]> = [
  ["", "不是交通"],
  ["drive", "自驾"],
  ["transit", "公共交通"],
  ["walk", "步行"],
];

interface BlockDetailsProps {
  doc: Y.Doc;
  library: Y.Doc;
  block: BlockView;
  onDone: () => void;
}

/**
 * 块的详情，在这一行下面展开：短备注、路程（交通方式、距离）、长备注。打开时焦点在短备注，Esc 或「收起」收起。
 * 交通块、已经填过路程的块直接有路程两栏，别的块点「加路程」才出现。
 */
export function BlockDetails({ doc, library, block, onDone }: BlockDetailsProps) {
  const group = useRef<HTMLDivElement>(null);
  const transportSelect = useRef<HTMLSelectElement>(null);
  const [routeAdded, setRouteAdded] = useState(false);
  const showRoute =
    routeAdded || block.kind.id === TRANSIT_KIND_ID || block.transport_mode !== null || block.distance_m !== null;

  useEffect(() => {
    group.current?.querySelector("input")?.focus();
  }, []);
  useEffect(() => {
    if (routeAdded) transportSelect.current?.focus();
  }, [routeAdded]);

  return (
    <div
      ref={group}
      role="group"
      aria-label={`${block.title} 的详情`}
      className="flex flex-col gap-3 py-2 pl-2 text-sm"
      onKeyDown={(event) => {
        if (event.key === "Escape") onDone();
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56 max-w-full">
          <CommitInput
            label="短备注"
            value={block.subtitle ?? ""}
            className="input w-full"
            commit={(text) => {
              const next = text === "" ? null : text;
              if (next !== block.subtitle) updateBlock(doc, library, block.id, { subtitle: next });
              return null;
            }}
          />
        </div>
        {showRoute ? (
          <>
            <label className="flex flex-col gap-1.5 text-sm text-ink-muted">
              交通方式
              <select
                ref={transportSelect}
                className="input"
                value={block.transport_mode ?? ""}
                onChange={(event) =>
                  updateBlock(doc, library, block.id, {
                    transport_mode: event.target.value === "" ? null : (event.target.value as TransportMode),
                  })
                }
              >
                {TRANSPORT_CHOICES.map(([value, name]) => (
                  <option key={value} value={value}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <div className="w-32">
              <CommitInput
                label="距离（公里）"
                value={block.distance_m === null ? "" : distanceKmText(block.distance_m)}
                inputMode="decimal"
                className="input w-full tabular-nums"
                commit={(text) => {
                  const parsed = parseDistanceKm(text);
                  if (!parsed.ok) return "要填不小于 0 的数，最多一位小数";
                  if (parsed.value !== block.distance_m) updateBlock(doc, library, block.id, { distance_m: parsed.value });
                  return null;
                }}
              />
            </div>
          </>
        ) : (
          <button type="button" className="btn btn-ghost" onClick={() => setRouteAdded(true)}>
            加路程
          </button>
        )}
      </div>
      <CommitInput
        label="长备注"
        multiline
        value={block.note ?? ""}
        className="w-full rounded-[0.625rem] border border-ink/15 bg-white/75 px-3 py-2 text-ink focus:outline-2 focus:outline-sage"
        commit={(text) => {
          const next = text === "" ? null : text;
          if (next !== block.note) updateBlock(doc, library, block.id, { note: next });
          return null;
        }}
      />
      <div className="flex justify-end">
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          收起
        </button>
      </div>
    </div>
  );
}
