import React from "react";
import ReactDOM from "react-dom/client";
import { AuthGate } from "@notekit/core";
import "@notekit/core/styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <AuthGate />
  </React.StrictMode>,
);
