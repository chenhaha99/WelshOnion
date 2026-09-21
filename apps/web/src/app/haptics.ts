import { Haptics, ImpactStyle } from "@capacitor/haptics";

/**
 * 吸到别的事的边上时轻震一下（苹果 HIG：触感要克制，举的例子就是「吸附到位时轻轻一震」）。
 * app 里走安卓的震动；网页上插件自己退回 navigator.vibrate，浏览器不支持就不震——不震不影响拖，所以不报错。
 */
export function snapTick(): void {
  Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
}
