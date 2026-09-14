export interface PresetKind {
  id: string;
  name: string;
  color: string;
  layer: number;
  order: number;
}

export interface PresetStatus {
  id: string;
  name: string;
  color: string;
  order: number;
}

// 颜色是占位，视觉设计定稿后再换。播种不覆盖已有的键，换色不会影响已经存在的资料库。
export const PRESET_KINDS: readonly PresetKind[] = [
  { id: "stay", name: "停留", color: "#8fa9bd", layer: 0, order: 1 },
  { id: "lodging", name: "住宿", color: "#9b8ab2", layer: 1, order: 2 },
  { id: "transit", name: "交通", color: "#6b8fb0", layer: 2, order: 3 },
  { id: "food", name: "餐饮", color: "#c08d68", layer: 2, order: 4 },
  { id: "sight", name: "游玩", color: "#77a389", layer: 2, order: 5 },
  { id: "shopping", name: "购物", color: "#b0947a", layer: 2, order: 6 },
  { id: "other", name: "其他", color: "#9aa3ad", layer: 2, order: 7 },
];

export const PRESET_STATUSES: readonly PresetStatus[] = [
  { id: "pending", name: "待定", color: "#9aa3ad", order: 1 },
  { id: "confirmed", name: "已确认", color: "#77a389", order: 2 },
];
