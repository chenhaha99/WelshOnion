import { LIST_HREF } from "../app/route";
import { SamplePlanButton } from "../plan-list/SamplePlanButton";
import { useUsed, type HelpId } from "./help-usage";

interface HelpItem {
  /** 怎么做（手势、按键） */
  how: string;
  /** 做了会怎样 */
  what: string;
  /** 记着用没用过的那几条：用过了打勾 */
  used?: HelpId;
}

/** 按场景分组（照 Things、Procreate 的手势帮助页）。和代码里实际的手势对上，改手势时这里一起改 */
const GROUPS: Array<{ title: string; items: HelpItem[] }> = [
  {
    title: "手机上的时间线",
    items: [
      { how: "点「第 N 天」或没展开的那条", what: "展开这一天，看每件事的名字" },
      { how: "点色块", what: "选中它，屏幕底部出快捷条：完成、时间、开销、复制、删除……" },
      { how: "按住色块半秒", what: "拿起来：左右挪改时间，上下拖到别的天就换天", used: "long-press-drag" },
      { how: "选中后拖两端的把手", what: "改开始或结束", used: "handle-drag" },
      { how: "两根手指张开、合拢", what: "整条时间线一起放大缩小；放大后「看全部」回到一屏", used: "pinch" },
      { how: "展开那天下面的「加一件事」", what: "接在这天最后一件后面，1 小时" },
    ],
  },
  {
    title: "电脑上的时间线",
    items: [
      { how: "点空白处", what: "在那个钟点加一件 1 小时的事；按住拖出一段，想多长就多长", used: "blank-add" },
      { how: "拖一件事", what: "左右改时间，上下拖到别的天就换天；拖两端改长短" },
      { how: "按住 Alt 拖", what: "复制一份，原来那件不动", used: "alt-copy" },
      { how: "拖到别的事中间 / 上下边", what: "中间是叠上去（跟着它走），上下边是并排", used: "onto" },
      { how: "把「没排时间」里的事拖到时间线上", what: "排上时间；拖回「没排时间」就变回没排时间", used: "tray-to-axis" },
      { how: "按住快捷条上的「复制」拖", what: "拖出一份放到别处；点一下是原地多一份" },
    ],
  },
  {
    title: "日程",
    items: [
      { how: "点时间那一格", what: "排时间、改时长、换天" },
      { how: "每天的「这天的操作」", what: "插一天、挪一天、这天全部改标记或类型" },
    ],
  },
  {
    title: "首页",
    items: [
      { how: "手机上长按卡片、电脑上右键", what: "复制、删除（和卡片右上的「⋯」一样）", used: "card-menu" },
      { how: "日历", what: "所有计划放在一张月历上看" },
    ],
  },
  {
    title: "键盘快捷键",
    items: [
      { how: "Ctrl+Z / ⌘Z", what: "撤销" },
      { how: "Ctrl+Shift+Z、Ctrl+Y / ⇧⌘Z", what: "重做" },
      { how: "Esc", what: "取消选中、关掉弹出的东西、拖到一半放弃" },
      { how: "Tab", what: "选中一件事后走进它的快捷条" },
      { how: "?", what: "打开这一页" },
    ],
  },
];

/** 「怎么用」：设置里、按 ? 打开；场景小提示的「怎么用」也跳到这里 */
export function HelpPage() {
  const used = useUsed();
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
      <a href={LIST_HREF} className="self-start text-sm text-ink-muted hover:text-ink">
        ← 我的计划
      </a>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-medium text-ink">怎么用</h1>
        <p className="text-sm text-ink-muted">界面上看不出来的手势和快捷键都在这里。想先随便试试，拿一份示例计划去改。</p>
        <div>
          <SamplePlanButton className="btn btn-ghost -ml-3" label="再拿一份示例计划" />
        </div>
      </header>
      {GROUPS.map(({ title, items }) => (
        <section key={title} aria-label={title} className="glass-card flex flex-col gap-3 p-5">
          <h2 className="font-medium text-ink">{title}</h2>
          <ul className="flex flex-col gap-2.5">
            {items.map((item) => (
              <li key={item.how} className="help-item">
                <span className="font-medium text-ink">{item.how}</span>
                <span className="text-ink-muted">
                  {item.what}
                  {item.used !== undefined && used.has(item.used) && <span className="help-used">用过了</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
