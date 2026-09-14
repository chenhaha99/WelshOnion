import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <main className="p-6 text-lg">葱葱</main>
  </StrictMode>,
);
