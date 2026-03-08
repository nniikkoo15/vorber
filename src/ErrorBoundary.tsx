import React from "react";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "#111",
          color: "#fff",
          fontFamily: "monospace",
          padding: "32px",
          gap: "16px",
          textAlign: "center",
        }}>
          <div style={{ fontSize: "14px", color: "#e05555" }}>something went wrong</div>
          <pre style={{
            background: "#1a1a1a",
            padding: "16px",
            borderRadius: "4px",
            fontSize: "11px",
            color: "#aaa",
            maxWidth: "600px",
            overflow: "auto",
            textAlign: "left",
          }}>
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </pre>
          <button
            style={{
              background: "none",
              border: "1px solid #555",
              color: "#fff",
              padding: "8px 16px",
              cursor: "pointer",
              fontFamily: "monospace",
              fontSize: "12px",
            }}
            onClick={() => this.setState({ error: null })}
          >
            try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
