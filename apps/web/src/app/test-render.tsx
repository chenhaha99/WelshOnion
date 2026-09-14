import { render } from "@testing-library/react";
import { StrictMode } from "react";
import { App } from "./App";

export const NOW = "2026-09-14T10:00:00.000Z";
const fixedNow = () => NOW;

interface RenderOptions {
  now?: () => string;
  timeZone?: string;
}

/**
 * 在网址 hash 处打开整个应用：当前时间默认固定为 NOW，系统时区默认固定为北京。
 * 用严格模式渲染：和开发时一样，「进入页面」会跑两遍。
 */
export function renderApp(hash: string, { now = fixedNow, timeZone = "Asia/Shanghai" }: RenderOptions = {}) {
  window.location.hash = hash;
  return render(
    <StrictMode>
      <App now={now} timeZone={timeZone} />
    </StrictMode>,
  );
}
