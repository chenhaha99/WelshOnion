import type { DayBudget } from "@welshonion/core";
import { CommitInput } from "../app/CommitInput";
import {
  budgetFieldText,
  parseClockText,
  parseHours,
  parseKm,
  withBudgetField,
  type BudgetField,
  type Parsed,
} from "./day-budget";

interface FieldSpec {
  field: BudgetField;
  label: string;
  inputMode: "text" | "numeric" | "decimal";
  parse: (text: string) => Parsed<string | number>;
  error: string;
}

const CLOCK_ERROR = "要填 00:00 到 23:59 之间的时刻";

const FIELDS: readonly FieldSpec[] = [
  { field: "start", label: "几点起", inputMode: "text", parse: parseClockText, error: CLOCK_ERROR },
  { field: "end", label: "几点收工", inputMode: "text", parse: parseClockText, error: CLOCK_ERROR },
  {
    field: "max_drive_min",
    label: "最多开多久（小时）",
    inputMode: "decimal",
    parse: parseHours,
    error: "要填不小于 0 的数，最多两位小数",
  },
  { field: "max_drive_km", label: "最多开多远（公里）", inputMode: "numeric", parse: parseKm, error: "要填不小于 0 的整数" },
];

interface BudgetFieldsProps {
  /** 现在存的预算：计划默认的，或这天自己的 */
  budget: DayBudget | null;
  /** 给了就是「这天」的四栏：空着的栏淡字写计划的默认值，计划也没设写「不设」 */
  inherited?: DayBudget | null;
  save: (next: DayBudget | null) => void;
  fieldClassName?: string;
}

/** 每天的时间预算四栏。回车或离开时保存；空着就是不设这一项，四项都空时不存预算。 */
export function BudgetFields({ budget, inherited, save, fieldClassName }: BudgetFieldsProps) {
  return FIELDS.map((spec) => {
    const current = budgetFieldText(budget, spec.field);
    return (
      <div key={spec.field} className={fieldClassName}>
        <CommitInput
          label={spec.label}
          value={current}
          inputMode={spec.inputMode}
          className="input w-full tabular-nums"
          placeholder={inherited === undefined ? undefined : budgetFieldText(inherited, spec.field) || "不设"}
          commit={(text) => {
            const parsed = spec.parse(text);
            if (!parsed.ok) return spec.error;
            const next = withBudgetField(budget, spec.field, parsed.value);
            if (budgetFieldText(next, spec.field) !== current) save(next);
            return null;
          }}
        />
      </div>
    );
  });
}
