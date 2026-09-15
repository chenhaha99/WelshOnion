import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { registerBackButton } from "./app/back-button";
import "./index.css";

// 在手机 app 里接上安卓的返回键；浏览器里什么都不做
void registerBackButton();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
