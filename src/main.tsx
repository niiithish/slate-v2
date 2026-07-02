import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { initRuntimePlatform } from "./lib/platform";

const root = document.getElementById("root") as HTMLElement;

initRuntimePlatform()
  .catch(() => undefined)
  .finally(() => {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  });
