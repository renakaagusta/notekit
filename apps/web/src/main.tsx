import React from "react";
import ReactDOM from "react-dom/client";
import { AuthGate } from "@notekit/core";
import "@notekit/core/styles.css";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  override state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  override render() {
    if (this.state.error) {
      const err = this.state.error as Error;
      return (
        <div style={{ padding: 32, fontFamily: "monospace", color: "#e7e7e9", background: "#0b0b0b", minHeight: "100vh" }}>
          <strong style={{ color: "#f87171" }}>Render error</strong>
          <pre style={{ marginTop: 12, whiteSpace: "pre-wrap", fontSize: 13 }}>{err.message}{"\n\n"}{err.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthGate />
    </ErrorBoundary>
  </React.StrictMode>,
);
