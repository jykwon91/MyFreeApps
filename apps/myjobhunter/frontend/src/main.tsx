import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { installStaleChunkRecovery } from "@platform/ui";
import App from "./App";
import { store } from "./lib/store";
import "./index.css";

// A tab opened before a deploy can't load the new build's lazy chunks —
// reload once onto the new build (guarded so it can never loop).
installStaleChunkRecovery();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>
);
