import { ReactElement, createElement } from "react";
import classNames from "classnames";

interface ITreeLoadingProps {
    type: "search" | "tree" | "structureUpdate";
    visible: boolean;
    message?: string;
    className?: string;
    progress?: {
        processed: number;
        total: number;
    };
}

/**
 * Loading state component for Web Worker operations
 * Supports customizable CSS animations via CSS custom properties
 */
export function TreeLoading({ type, visible, message, className, progress }: ITreeLoadingProps): ReactElement | null {
    if (!visible) {
        return null;
    }

    // Default messages
    // TODO ADD: Make loading messages configurable via widget properties
    const defaultMessages = {
        search: "Searching...",
        tree: "Building tree...",
        structureUpdate: "Updating structure..."
    };

    const displayMessage = message || defaultMessages[type];

    // Calculate progress percentage
    const progressPercent = progress ? Math.round((progress.processed / progress.total) * 100) : undefined;

    return (
        <div
            className={classNames("tree-loading", `tree-loading--${type}`, className)}
            role="status"
            aria-live="polite"
            aria-busy="true"
        >
            <div className="tree-loading__content">
                {/* Default loader - can be customized with CSS */}
                <div
                    className="tree-loading__spinner"
                    style={{
                        // Allow CSS custom properties to override
                        animation: `var(--tree-loading-animation, spin 1s linear infinite)`
                    }}
                >
                    {/* Default spinner SVG */}
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="tree-loading__spinner-svg">
                        <circle
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeDasharray="31.4 31.4"
                            transform="rotate(-90 12 12)"
                        />
                    </svg>
                </div>

                <div className="tree-loading__text">
                    <span className="tree-loading__message">{displayMessage}</span>

                    {progressPercent !== undefined && (
                        <span className="tree-loading__progress">{progressPercent}%</span>
                    )}
                </div>
            </div>

            {/* Progress bar (if progress available) */}
            {progress && (
                <div className="tree-loading__progress-bar">
                    <div className="tree-loading__progress-fill" style={{ width: `${progressPercent}%` }} />
                </div>
            )}
        </div>
    );
}

/**
 * Inline loading indicator for search input
 */
export function TreeSearchLoading({ visible }: { visible: boolean }): ReactElement | null {
    if (!visible) {
        return null;
    }

    return (
        <div className="tree-search-loading" role="status" aria-live="polite">
            <div className="tree-search-loading__spinner">
                <span className="tree-search-loading__dot tree-search-loading__dot--1" />
                <span className="tree-search-loading__dot tree-search-loading__dot--2" />
                <span className="tree-search-loading__dot tree-search-loading__dot--3" />
            </div>
        </div>
    );
}

/**
 * Full overlay loading for tree building
 */
export function TreeBuildingOverlay({
    visible,
    nodeCount
}: {
    visible: boolean;
    nodeCount?: number;
}): ReactElement | null {
    if (!visible) {
        return null;
    }

    return (
        <div className="tree-building-overlay" role="status" aria-live="polite">
            <div className="tree-building-overlay__content">
                <div className="tree-building-overlay__icon">
                    {/* Tree building animation */}
                    <svg width="48" height="48" viewBox="0 0 48 48" className="tree-building-overlay__svg">
                        {/* Animated tree branches */}
                        <g className="tree-building-overlay__branches">
                            <line x1="24" y1="40" x2="24" y2="20" stroke="currentColor" strokeWidth="2" />
                            <line
                                x1="24"
                                y1="30"
                                x2="16"
                                y2="22"
                                stroke="currentColor"
                                strokeWidth="2"
                                className="tree-building-overlay__branch tree-building-overlay__branch--1"
                            />
                            <line
                                x1="24"
                                y1="25"
                                x2="32"
                                y2="17"
                                stroke="currentColor"
                                strokeWidth="2"
                                className="tree-building-overlay__branch tree-building-overlay__branch--2"
                            />
                            <line
                                x1="24"
                                y1="20"
                                x2="20"
                                y2="16"
                                stroke="currentColor"
                                strokeWidth="2"
                                className="tree-building-overlay__branch tree-building-overlay__branch--3"
                            />
                        </g>
                        {/* Animated nodes */}
                        <circle
                            cx="16"
                            cy="22"
                            r="3"
                            fill="currentColor"
                            className="tree-building-overlay__node tree-building-overlay__node--1"
                        />
                        <circle
                            cx="32"
                            cy="17"
                            r="3"
                            fill="currentColor"
                            className="tree-building-overlay__node tree-building-overlay__node--2"
                        />
                        <circle
                            cx="20"
                            cy="16"
                            r="3"
                            fill="currentColor"
                            className="tree-building-overlay__node tree-building-overlay__node--3"
                        />
                        <circle
                            cx="24"
                            cy="10"
                            r="3"
                            fill="currentColor"
                            className="tree-building-overlay__node tree-building-overlay__node--4"
                        />
                    </svg>
                </div>

                <h3 className="tree-building-overlay__title">Building Tree Structure</h3>

                {nodeCount && (
                    <p className="tree-building-overlay__subtitle">Processing {nodeCount.toLocaleString()} items...</p>
                )}

                <div className="tree-building-overlay__loader">
                    <div className="tree-building-overlay__loader-bar" />
                </div>
            </div>
        </div>
    );
}
