import { validateField, type ValidatedField } from "../validate";

export type OpError =
  | { code: "INVALID_FIELD"; field: ValidatedField }
  | { code: "NOT_FOUND"; id: string }
  | { code: "DAYS_ALREADY_SET" }
  | { code: "CROSSING_BLOCKS"; blockIds: string[] }
  | { code: "SAME_TZ" }
  | { code: "INDEX_OUT_OF_RANGE" }
  | { code: "NOT_UNDATED" }
  | { code: "NOT_TIMED" }
  | { code: "BUILTIN" }
  /** 不是葱葱导出的计划文件，或者文件坏了 */
  | { code: "FILE_NOT_PLAN" }
  /** 文件来自更新版本的葱葱 */
  | { code: "FILE_TOO_NEW" };

/** 操作的结果：失败时文档里什么都没发生。 */
export type OpResult<T = undefined> = { ok: true; value: T } | { ok: false; error: OpError };

export function ok<T>(value: T): OpResult<T> {
  return { ok: true, value };
}

export function done(): OpResult {
  return { ok: true, value: undefined };
}

export function fail(error: OpError): { ok: false; error: OpError } {
  return { ok: false, error };
}

/** 按顺序校验，返回第一个不合法的字段；都合法返回 null。 */
export function firstInvalidField(checks: ReadonlyArray<readonly [ValidatedField, unknown]>): OpError | null {
  for (const [field, value] of checks) {
    if (!validateField(field, value).ok) return { code: "INVALID_FIELD", field };
  }
  return null;
}
