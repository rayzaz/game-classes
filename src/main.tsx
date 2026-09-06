import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initializeNativeNotificationRuntime } from "./lib/nativeNotifications";
import { installCapacitorFetchPatch } from "./lib/capacitorFetch";
import "./styles.css";
import "./styles/mobile-modal-fixes.css";


installCapacitorFetchPatch();
void initializeNativeNotificationRuntime();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
