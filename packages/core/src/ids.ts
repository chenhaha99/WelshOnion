import { v7 } from "uuid";

/** 用户建的对象（底座、块、费用、地点、自定义类型、计划）一律用 UUIDv7：离线可生成，按时间先后有序。 */
export function newId(): string {
  return v7();
}
