/**
 * 标签的记号：一条小书签（你提的：「像挂上面的书签」），8 × 11 像素，下边剪一个 V 口，颜色是标签的颜色。
 * 块上、筛选按钮、列表的标签列、选择面板、设置里都用它；类型用圆点，一眼分得开（AI 推的）。
 * 白边加一道很淡的深色描边（见 index.css 的 tag-ribbon）：浅色块上、和书签同色的块上都分得开。
 */
export function TagRibbon({ color }: { color: string }) {
  return (
    <svg data-tag-ribbon aria-hidden viewBox="0 0 8 11" width="8" height="11" className="tag-ribbon" style={{ color }}>
      <path d="M0.5 0.5H7.5V10.2L4 7.6L0.5 10.2Z" fill="currentColor" stroke="white" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}
