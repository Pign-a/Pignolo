import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { KitMotionProvider } from "@kit/motion-provider";
import { App } from "./preview/App";
import "./app.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");
createRoot(root).render(
  <StrictMode>
    <KitMotionProvider>
      <App />
    </KitMotionProvider>
  </StrictMode>,
);
