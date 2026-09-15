import {
  countBlocksUsing,
  fillProgress,
  moneySummary,
  type LibraryView,
  type PlanView,
  type StatsFilter,
} from "@welshonion/core";
import { useRef, useState } from "react";
import type * as Y from "yjs";
import { formatYuan } from "./money";
import { MoneyEditor } from "./MoneyEditor";

interface MoneyOverviewProps {
  doc: Y.Doc;
  library: Y.Doc;
  libraryView: LibraryView;
  plan: PlanView;
  filter?: StatsFilter;
}

/**
 * 日期列表上面的钱的总览：总额、人均、已填几笔、还有几个块没挂钱，任何时候都显示（渐进），按筛选算；
 * 旁边「不属于任何一天」点开增删改不挂块的钱（签证、保险）。
 */
export function MoneyOverview({ doc, library, libraryView, plan, filter }: MoneyOverviewProps) {
  const [unattachedOpen, setUnattachedOpen] = useState(false);
  const unattachedButton = useRef<HTMLButtonElement>(null);
  const summary = moneySummary(plan, filter);
  const progress = fillProgress(plan, filter);
  const kinds = [...libraryView.kinds.values()].sort((a, b) => a.order - b.order);

  const line = [
    `总额 ${formatYuan(summary.totalCents)}`,
    `人均 ${formatYuan(summary.perPersonCents)}`,
    `已填 ${progress.filledCount} / 共 ${progress.expenseCount} 笔`,
    ...(progress.blocksWithoutMoney > 0 ? [`另有 ${progress.blocksWithoutMoney} 个块还没挂钱`] : []),
  ].join(" · ");

  return (
    <section aria-label="钱的总览" className="glass-card flex flex-col gap-2 px-5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p data-money-summary className="text-sm text-ink tabular-nums">
          {line}
        </p>
        <button
          ref={unattachedButton}
          type="button"
          aria-expanded={unattachedOpen}
          className="btn btn-ghost h-8 px-2 text-sm tabular-nums"
          onClick={() => setUnattachedOpen((open) => !open)}
        >
          不属于任何一天：{formatYuan(summary.unattributedCents)}
        </button>
      </div>
      {unattachedOpen && (
        <MoneyEditor
          doc={doc}
          library={library}
          plan={plan}
          kinds={kinds}
          countKindUsing={(kindId) => countBlocksUsing(plan, { kindId })}
          block={null}
          label="不属于任何一天的钱"
          defaultKindId="other"
          // 收起后焦点回到「不属于任何一天」；先挪焦点，空行里填了没回车的借这次离开建上
          onDone={() => {
            unattachedButton.current?.focus();
            setUnattachedOpen(false);
          }}
        />
      )}
    </section>
  );
}
