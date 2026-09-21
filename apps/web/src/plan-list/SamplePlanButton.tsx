import { touchPlan } from "@welshonion/core";
import { useState } from "react";
import { navigate, planHref } from "../app/route";
import { useLibrary, useNow, useTimeZone } from "../app/services";
import { todayIn } from "../plan/day-labels";
import { createPlan } from "../storage/plans";
import { sampleStartDate, SAMPLE_NAME, writeSamplePlan } from "./sample-plan";

/**
 * 「看看示例计划」：新建一趟排好的示例计划并打开（照 Final Cut Pro「Download Demo Project」：自己去拿）。
 * 首页一个计划都没有时有它；「怎么用」页也有，删了能再拿一份（照 Things 的 Create Tutorial Project）。
 */
export function SamplePlanButton({ className = "btn btn-ghost", label = "看看示例计划" }: { className?: string; label?: string }) {
  const library = useLibrary();
  const now = useNow();
  const timeZone = useTimeZone();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const plan = await createPlan(library, { name: SAMPLE_NAME, now: now() });
          writeSamplePlan(plan.doc, library, { startDate: sampleStartDate(todayIn(now(), timeZone)), tz: timeZone });
          touchPlan(library, plan.doc, now());
          navigate(planHref(plan.planId));
          void plan.close();
        } catch (error) {
          setBusy(() => {
            throw error;
          });
        }
      }}
    >
      {label}
    </button>
  );
}
