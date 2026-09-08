/**
 * The last thing between a thrown error and a black rectangle.
 *
 * React unmounts the whole tree when a render throws and nothing catches it, so
 * the editor becomes an empty `<div id="root">`. That is the worst possible
 * report: no message, no stack, nothing to search for, and no way to tell a
 * crash apart from a page that failed to load or a daemon that died.
 *
 * It happened for real. The Luau syntax highlighter threw on any file with a
 * `--[[ ]]` comment in it, and the symptom — reported, reasonably, as "opening
 * a script created a blank page" — said nothing about highlighting. This turns
 * that into a screen naming the error, which is one paste rather than an
 * afternoon.
 *
 * ## Why a class
 *
 * `componentDidCatch` has no hook equivalent; React has never shipped one. This
 * is the one place in the codebase that is a class component, and it is because
 * there is no alternative rather than by preference.
 *
 * ## What it does not do
 *
 * **It does not retry.** An error boundary that re-renders the tree that just
 * threw usually throws again, and a screen that flickers between broken and
 * broken is worse than one that stops. Reload is the honest offer: the daemon
 * holds the project and every graph is on disk, so nothing is lost by it.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

export interface ErrorBoundaryProps {
	children: ReactNode;
	/** Named in the message, so it is clear how much stopped working. */
	what: string;
}

interface State {
	error: Error | null;
	componentStack: string | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
	state: State = { error: null, componentStack: null };

	static getDerivedStateFromError(error: Error): Partial<State> {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo): void {
		// Still logged. The console stack points at the real frame, which the
		// component stack below does not.
		console.error("Roswaal crashed:", error, info.componentStack);
		this.setState({ componentStack: info.componentStack ?? null });
	}

	render(): ReactNode {
		const { error, componentStack } = this.state;
		if (!error) return this.props.children;

		const report = [
			`${error.name}: ${error.message}`,
			"",
			error.stack ?? "(no stack)",
			componentStack ? `\nComponent stack:${componentStack}` : "",
		].join("\n");

		return (
			<div className="crash">
				<h1>{this.props.what} stopped</h1>
				<p>
					Nothing has been lost — every graph is on disk and the daemon is still
					running. Reloading picks up where you were.
				</p>
				<pre className="crash-detail">{report}</pre>
				<div className="crash-actions">
					<button className="tb primary" onClick={() => window.location.reload()}>
						Reload
					</button>
					<button
						className="tb"
						onClick={() => void navigator.clipboard?.writeText(report)}
					>
						Copy the error
					</button>
				</div>
			</div>
		);
	}
}
