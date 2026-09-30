import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { installStaleChunkRecovery } from "@platform/ui";
import { store } from "@/lib/store";
import App from "./App";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element not found");

// A tab opened before a deploy can't load the new build's lazy chunks —
// reload once onto the new build (guarded so it can never loop).
installStaleChunkRecovery();

createRoot(rootEl).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>,
);
