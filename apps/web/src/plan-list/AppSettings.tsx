import type { PlanIndexEntryView } from "@welshonion/core";
import { useRef, useState, type ChangeEvent } from "react";
import { Drawer } from "../app/Drawer";
import { downloadJson } from "../app/download";
import { navigate, planHref } from "../app/route";
import { useLibrary, useNow } from "../app/services";
import { exportPlanFile, importPlanFile } from "../storage/plans";

const IMPORT_ERRORS = {
  FILE_NOT_PLAN: "这个文件不是葱葱导出的计划，没有导入",
  FILE_TOO_NEW: "这个文件来自更新版本的葱葱，这里还读不了，没有导入",
} as const;

interface AppSettingsProps {
  /** 列表上的计划，顺序同列表 */
  plans: readonly PlanIndexEntryView[];
  onClose: () => void;
}

/**
 * 列表页的「设置」：导出一个计划、从文件导入一个计划（入口放在这里，不直接摆在列表上）。
 * 导出后写一句「已导出」（浏览器下载时悄无声息）；导入读不了就写明原因，导好了进入那个计划（同新建、复制）。
 */
export function AppSettings({ plans, onClose }: AppSettingsProps) {
  const library = useLibrary();
  const now = useNow();
  const fileInput = useRef<HTMLInputElement>(null);
  const [exported, setExported] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const exportPlan = async (planId: string) => {
    try {
      const file = await exportPlanFile(library, planId, now());
      downloadJson(file.fileName, file.text);
      setExported(file.name);
    } catch (error) {
      setExported(() => {
        throw error;
      });
    }
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // 清空文件框：同一个文件再选一次也能触发
    input.value = "";
    if (!file || importing) return;
    setImporting(true);
    setImportError(null);
    try {
      const result = await importPlanFile(library, await file.text(), now());
      if (!result.ok) {
        setImportError(IMPORT_ERRORS[result.error]);
        setImporting(false);
        return;
      }
      navigate(planHref(result.handle.planId));
      void result.handle.close();
    } catch (error) {
      setImporting(() => {
        throw error;
      });
    }
  };

  return (
    <Drawer title="设置" onClose={onClose}>
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium text-ink">导出计划</h3>
          <p className="text-xs text-ink-muted">把一个计划存成文件，换浏览器、换电脑时导回来</p>
        </div>
        {plans.length === 0 ? (
          <p className="text-sm text-ink-muted">还没有计划</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {plans.map((plan) => (
              <li key={plan.plan_id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm text-ink">{plan.name}</span>
                <button
                  type="button"
                  aria-label={`导出「${plan.name}」`}
                  className="btn btn-ghost h-8 shrink-0 px-3"
                  onClick={() => void exportPlan(plan.plan_id)}
                >
                  导出
                </button>
              </li>
            ))}
          </ul>
        )}
        <p role="status" className="text-sm text-ink">
          {exported === null ? "" : `已导出「${exported}」`}
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium text-ink">导入计划</h3>
          <p className="text-xs text-ink-muted">从导出的文件恢复一个计划；本机已经有同一个计划时另存一份，不覆盖</p>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          aria-label="选择计划文件"
          className="hidden"
          onChange={(event) => void importFile(event)}
        />
        {/* 这一块只有这一个动作，做成主按钮：淡色的次要按钮看着像一行缩进的字，认不出是按钮 */}
        <button
          type="button"
          className="btn btn-primary self-start"
          disabled={importing}
          onClick={() => fileInput.current?.click()}
        >
          选择文件…
        </button>
        {importError !== null && (
          <p role="alert" className="text-sm text-danger">
            {importError}
          </p>
        )}
      </section>
    </Drawer>
  );
}
