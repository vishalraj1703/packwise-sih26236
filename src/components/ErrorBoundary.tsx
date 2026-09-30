import { Component, type ReactNode } from "react";

export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error(error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card p-6">
        <h1 className="h2">Something went wrong on this page</h1>
        <p className="muted mt-1">{this.state.error.message}</p>
        <button className="btn-ghost btn-sm mt-3" onClick={() => this.setState({ error: null })}>Try again</button>
      </div>
    );
  }
}
