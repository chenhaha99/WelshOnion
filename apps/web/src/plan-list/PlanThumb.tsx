import type { LibraryView, PlanView } from "@welshonion/core";
import { useMemo } from "react";
import { kindColor } from "../plan/timeline-draw";
import { layoutRow, timelineSegments } from "../plan/timeline-layout";
import { hourWindow } from "../plan/timeline-window";

/**
 * 卡片上的迷你时间线：这一趟每天一条，色块按类型色、按真实钟点画——照 iMovie 取时间线里一帧当项目缩略图，
 * 我们的「画面」就是时间线（你要的「时间看得见」）。只看形状：不分道（重叠的叠着画）、不写字、不能点。
 * 横轴和手机时间线同一把尺（整趟共用，没事的凌晨深夜收掉），两头折起的那一截不画。
 */
export function PlanThumb({ plan, library }: { plan: PlanView; library: LibraryView }) {
  const rows = useMemo(() => {
    const segments = timelineSegments(plan);
    return plan.bases.map((_, row) => layoutRow(segments.filter((segment) => segment.row === row), plan, library));
  }, [plan, library]);
  const hours = useMemo(() => hourWindow(plan, library, false, { foldTails: true }), [plan, library]);
  const span = hours.to - hours.from;
  const place = (from: number, to: number) => {
    const left = Math.max(from, hours.from);
    const right = Math.min(to, hours.to);
    return right <= left ? null : { left: `${((left - hours.from) / span) * 100}%`, width: `${((right - left) / span) * 100}%` };
  };

  return (
    <div aria-hidden className="plan-thumb">
      {rows.map((row, index) => (
        <div key={index} className="plan-thumb-row">
          {row.background.map((item) => {
            const at = place(item.from, item.to);
            return at && <span key={`b-${item.blockId}-${item.from}`} className="plan-thumb-back" style={{ ...at, ...kindColor(plan, item.blockId) }} />;
          })}
          {row.main.map((item) => {
            const at = place(item.from, item.to);
            return at && <span key={`m-${item.blockId}-${item.from}`} className="plan-thumb-bar" style={{ ...at, ...kindColor(plan, item.blockId) }} />;
          })}
        </div>
      ))}
    </div>
  );
}
