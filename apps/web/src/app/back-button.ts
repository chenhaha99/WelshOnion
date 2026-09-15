import { App } from "@capacitor/app";
import { isNativeApp } from "./native";
import { LIST_HREF, navigate, parseRoute } from "./route";

/** 在 app 里接上安卓的返回键；浏览器里什么都不做。 */
export async function registerBackButton(): Promise<void> {
  if (!isNativeApp()) return;
  await App.addListener("backButton", handleBack);
}

/**
 * 返回键按一下，依次看：
 * 1. 开着弹层、抽屉或菜单：关掉最上面那一个，和按 Esc 一样。焦点在它里面就从焦点发 Esc，否则从它自己发
 *    （弹层听的是整个页面的按键，抽屉听的是自己身上的，这样两种都收得到）
 * 2. 在计划页：先让焦点所在的框失去焦点（照「离开时保存」存下），再回到计划列表。
 *    不拿 Esc 去关编辑区：输入框里的 Esc 是「不要这次改的」
 * 3. 在计划列表：退出 app
 */
function handleBack(): void {
  const layers = document.querySelectorAll<HTMLElement>('[role="dialog"], [role="menu"]');
  const top = layers[layers.length - 1];
  if (top) {
    const focused = document.activeElement;
    const target = focused instanceof HTMLElement && top.contains(focused) ? focused : top;
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return;
  }
  if (parseRoute(window.location.hash).page === "plan") {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    navigate(LIST_HREF);
    return;
  }
  void App.exitApp();
}
