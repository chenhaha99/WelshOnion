import { setDays } from "@welshonion/core";
import { useState, type FormEvent } from "react";
import type * as Y from "yjs";
import { useNow, useTimeZone } from "../app/services";
import { todayIn } from "./day-labels";

/** 计划一天都没有时的第一屏：只问出发日期和天数，时区用系统时区。 */
export function AskDays({ doc }: { doc: Y.Doc }) {
  const now = useNow();
  const timeZone = useTimeZone();
  const [startDate, setStartDate] = useState(() => todayIn(now(), timeZone));
  const [count, setCount] = useState("");
  const days = Number(count);
  const valid = startDate !== "" && Number.isInteger(days) && days >= 1 && days <= 366;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (valid) setDays(doc, { startDate, count: days, tz: timeZone });
  };

  return (
    <form className="glass-card flex flex-col gap-5 p-8" onSubmit={submit}>
      <h2 className="text-lg font-medium text-ink">几天？</h2>
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1.5 text-sm text-ink-muted">
          出发日期
          <input
            type="date"
            className="input"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-ink-muted">
          天数
          <input
            type="number"
            min={1}
            max={366}
            inputMode="numeric"
            className="input w-24 tabular-nums"
            value={count}
            onChange={(event) => setCount(event.target.value)}
          />
        </label>
        <button type="submit" className="btn btn-primary" disabled={!valid}>
          确定
        </button>
      </div>
    </form>
  );
}
