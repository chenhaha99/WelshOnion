import {
  countBlocksUsing,
  duplicateBlock,
  followersOf,
  setBlockChecked,
  type BlockView,
  type LibraryView,
  type PlanView,
} from "@welshonion/core";
import { useEffect, useRef } from "react";
import type * as Y from "yjs";
import { Popover } from "../app/Popover";
import { blockFocusSelector, deleteBlockWithNotice, deleteLabel } from "./block-actions";
import { BlockMoney } from "./block-money";
import { BlockTimeButton } from "./block-time-button";
import { useNotifyDeleted } from "./DeletedNotice";
import { CopyIcon, DetailsIcon, StrikeIcon, TrashIcon } from "./icons";
import type { MoneyCell } from "./money-cells";
import { useOpenBlock } from "./open-block";
import { KindPicker } from "./pickers";
import { TagPicker } from "./TagPicker";
import { useBlockSelection } from "./select-block";
import type { CopyHandlers } from "./use-timeline-drag";


interface QuickBarProps {
  doc: Y.Doc;
  library: Y.Doc;
  libraryView: LibraryView;
  plan: PlanView;
  /** 选中的那件事 */
  block: BlockView;
  /** 它的开销格摘要（按筛选算过）；一笔开销都没挂是 undefined */
  moneyCell: MoneyCell | undefined;
  /** 「复制」按住往外拖时的监听，由时间轴给；不给就只能点一下原地复制 */
  copyHandlers?: CopyHandlers;
}

/**
 * 选中一件事后浮出的快捷条：划掉、详情、类型、标签、时间、开销、复制、删除。
 * 「划掉」放第一个：含义由用户自己定（你提的），行中最常点，Tab 进来先到它。
 * 常改的几样在这里一两下就改完，不用开详情气泡；没排时间的事没有「复制」。
 * 已经排上时间的，在时间轴上拖着改更快（你提的「时间这类在时间轴操作会更好」）；
 * 「时间」按钮管的是拖不出来的那几样：排上时间、取消时间、换天、填时长。
 * 条是浮着的，不占时间轴的行高，不然点一下整条时间轴会往下跳（你提的）。
 * 摆在哪由外面决定：横排贴着这件事的右下角，竖排固定在屏幕底部。
 */
export function QuickBar({ doc, library, libraryView, plan, block, moneyCell, copyHandlers }: QuickBarProps) {
  const selection = useBlockSelection();
  const openBlock = useOpenBlock();
  const notifyDeleted = useNotifyDeleted();
  const timed = block.start_minute !== null;
  const kinds = [...libraryView.kinds.values()].sort(byOrder);
  const followerCount = followersOf(plan, libraryView, block.id).length;
  const deleteText = deleteLabel(followerCount);
  const copyButton = useRef<HTMLButtonElement>(null);
  // 每次渲染 copyHandlers 都是新对象，监听里读这个 ref，不用跟着重挂
  const lifted = useRef(copyHandlers?.liftedByFinger);
  lifted.current = copyHandlers?.liftedByFinger;

  // 手机上快捷条挂在页面最外层（不在时间轴里面），时间轴那套触摸监听管不到它：
  // 拿起来以后手指挪动不滚页面、长按不弹系统菜单，这两件「复制」按钮自己拦
  useEffect(() => {
    const element = copyButton.current;
    if (!element) return;
    const onTouchMove = (event: TouchEvent) => {
      if (lifted.current?.()) event.preventDefault();
    };
    const onContextMenu = (event: MouseEvent) => event.preventDefault();
    element.addEventListener("touchmove", onTouchMove, { passive: false });
    element.addEventListener("contextmenu", onContextMenu);
    return () => {
      element.removeEventListener("touchmove", onTouchMove);
      element.removeEventListener("contextmenu", onContextMenu);
    };
  }, [timed]);

  return (
    <div
      role="toolbar"
      aria-label={`「${block.title}」的操作`}
      data-quick-bar
      data-block-id={block.id}
      className="quick-bar"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          // 弹层开着时 Esc 先收弹层（弹层自己处理，传不到这里）；焦点在条上再按就是取消选中
          event.stopPropagation();
          selection.clear({ focusBlock: true });
        } else if (event.key === "Tab" && event.shiftKey && event.target === event.currentTarget.firstElementChild) {
          // 从条上第一个按钮往回走：回到这件事
          event.preventDefault();
          document.querySelector<HTMLElement>(blockFocusSelector(block.id))?.focus();
        }
      }}
    >
      <button
        type="button"
        aria-label="划掉"
        title={block.checked ? "取消划掉" : "划掉"}
        aria-pressed={block.checked}
        className="quick-button"
        onClick={() => setBlockChecked(doc, [block.id], !block.checked)}
      >
        <StrikeIcon />
      </button>
      <button
        type="button"
        aria-label="详情…"
        title="详情…"
        className="quick-button"
        onClick={(event) => openBlock(block.id, event.currentTarget)}
      >
        <DetailsIcon />
      </button>
      <KindPicker
        compact
        doc={doc}
        library={library}
        block={block}
        kinds={kinds}
        countUsing={(kindId) => countBlocksUsing(plan, { kindId })}
      />
      <TagPicker compact doc={doc} library={library} block={block} tags={[...libraryView.tags.values()].sort(byOrder)} />
      <BlockTimeButton doc={doc} library={library} plan={plan} block={block} />
      <BlockMoney
        variant="bar"
        doc={doc}
        library={library}
        libraryView={libraryView}
        plan={plan}
        block={block}
        moneyCell={moneyCell}
      />
      {timed && (
        <button
          ref={copyButton}
          type="button"
          data-copy
          aria-label="复制"
          title="复制（按住拖到别处）"
          className="quick-button"
          onPointerDown={(event) => copyHandlers?.onPointerDown(event, block.id)}
          onClickCapture={copyHandlers?.onClickCapture}
          onClick={() => {
            const result = duplicateBlock(doc, library, block.id, {
              baseId: block.start_base_id,
              minute: block.start_minute!,
              placement: "beside",
            });
            if (!result.ok) return;
            // 复制出来的那件接着选中：可以马上拖走，也可以接着复制
            const copyId = result.value.blockId;
            selection.select(copyId, selection.anchorBaseId);
            requestAnimationFrame(() => {
              document.querySelector<HTMLElement>(`[data-quick-bar][data-block-id="${copyId}"] [data-copy]`)?.focus();
            });
          }}
        >
          <CopyIcon />
        </button>
      )}
      <button
        type="button"
        aria-label={deleteText}
        title={deleteText}
        // 和「复制」隔开一点：删除不确认，别点岔了
        className="quick-button ml-1 text-danger"
        onClick={() => {
          const baseId = block.start_base_id;
          notifyDeleted(deleteBlockWithNotice(doc, library, block, followerCount));
          selection.clear();
          // 删完这件事没了：焦点落到这天的菜单（马上撤销得回来）
          requestAnimationFrame(() => {
            document.querySelector<HTMLElement>(`[data-base-id="${baseId}"] button[aria-label="这天的操作"]`)?.focus();
          });
        }}
      >
        <TrashIcon />
      </button>
    </div>
  );
}

function byOrder(a: { order: number }, b: { order: number }): number {
  return a.order - b.order;
}
