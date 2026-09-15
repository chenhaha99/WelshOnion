import { Capacitor } from "@capacitor/core";

/** 是不是在装好的手机 app 里跑（Capacitor 的原生平台）；浏览器里是 false。 */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}
