import { Component } from "react";
import { Button } from "./Button";

/** Keeps a crash in one screen from taking down the register. */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Screen crashed:", error, info);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="max-w-sm text-center">
          <p className="font-serif text-desc font-semibold italic text-[#FF7B29]">
            Something went wrong
          </p>
          <h1 className="mt-1 text-h1 font-extrabold tracking-tight text-gray-900">
            This screen ran into a problem
          </h1>
          <p className="mt-2 text-desc text-slate-500">
            Nothing was lost. Completed bills are saved on this register and
            upload on their own.
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Button
              variant="secondary"
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </Button>
            <Button onClick={() => window.location.reload()}>Reload</Button>
          </div>
        </div>
      </div>
    );
  }
}
