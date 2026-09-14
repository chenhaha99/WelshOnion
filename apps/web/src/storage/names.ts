/** 本机数据库名，标签页同步的频道也用同一个名字。 */
export const LIBRARY_DB = "welshonion:library";

const PLAN_DB_PREFIX = "welshonion:plan:";

export function planDbName(planId: string): string {
  return PLAN_DB_PREFIX + planId;
}

/** 不是计划数据库就给 null。 */
export function planIdOf(dbName: string): string | null {
  return dbName.startsWith(PLAN_DB_PREFIX) ? dbName.slice(PLAN_DB_PREFIX.length) : null;
}
