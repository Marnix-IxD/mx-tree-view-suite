import { ReactElement, createElement, useState, useEffect } from "react";
import classNames from "classnames";
import "../../ui/TreeNodeSkeleton.css";

interface TreeNodeSkeletonProps {
    level: number;
    indentSize: number;
    showLines: boolean;
    itemHeight: number;
    loadingState?: "idle" | "loading" | "loaded" | "error";
    loadingProgress?: number;
    nodeId?: string; // For debugging
}

/**
 * Enhanced skeleton placeholder for unloaded tree nodes with smooth transitions
 */
export function TreeNodeSkeleton({
    level,
    indentSize,
    showLines,
    itemHeight,
    loadingState = "idle",
    loadingProgress,
    nodeId
}: TreeNodeSkeletonProps): ReactElement {
    const indent = level * indentSize;
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [prevLoadingState, setPrevLoadingState] = useState(loadingState);

    // Handle state transitions
    useEffect(() => {
        if (prevLoadingState !== loadingState) {
            setIsTransitioning(true);
            setPrevLoadingState(loadingState);

            // End transition after animation completes
            const timer = setTimeout(() => {
                setIsTransitioning(false);
            }, 300); // Match CSS transition duration

            return () => clearTimeout(timer);
        }
    }, [loadingState, prevLoadingState]);

    // Generate skeleton content width variation based on nodeId for consistency
    const getSkeletonWidth = () => {
        if (!nodeId) {
            return "60%";
        }
        const hash = nodeId.split("").reduce((a, b) => {
            a = (a << 5) - a + b.charCodeAt(0);
            return a & a;
        }, 0);
        const widths = ["45%", "55%", "60%", "70%", "65%"];
        return widths[Math.abs(hash) % widths.length];
    };

    return (
        <div
            className={classNames("mx-tree__node", "mx-tree__node--skeleton", {
                "mx-tree__node--with-lines": showLines,
                "mx-tree__node--skeleton-loading": loadingState === "loading",
                "mx-tree__node--skeleton-error": loadingState === "error",
                "mx-tree__node--skeleton-transitioning": isTransitioning
            })}
            style={{
                paddingLeft: `${indent}px`,
                height: `${itemHeight}px`,
                display: "flex",
                alignItems: "center",
                transition: isTransitioning ? "opacity 0.3s ease-out, transform 0.3s ease-out" : "none",
                opacity: loadingState === "error" ? 0.5 : 1
            }}
            data-node-id={nodeId}
            role="progressbar"
            aria-label={`Loading node data${nodeId ? ` for ${nodeId}` : ""}`}
            aria-valuenow={loadingProgress}
            aria-valuemin={0}
            aria-valuemax={100}
        >
            {/* Skeleton expand icon */}
            <div className="mx-tree__node-skeleton-expand">
                <div
                    className="mx-tree__skeleton-pulse"
                    style={{
                        width: "16px",
                        height: "16px",
                        borderRadius: "2px",
                        animationDelay: "0.1s"
                    }}
                />
            </div>

            {/* Skeleton content */}
            <div className="mx-tree__node-skeleton-content">
                <div
                    className="mx-tree__skeleton-pulse"
                    style={{
                        width: getSkeletonWidth(),
                        height: "12px",
                        borderRadius: "4px",
                        animationDelay: "0.2s"
                    }}
                />

                {/* Additional skeleton elements for more realistic look */}
                {Math.random() > 0.7 && (
                    <div
                        className="mx-tree__skeleton-pulse"
                        style={{
                            width: "20px",
                            height: "8px",
                            borderRadius: "2px",
                            marginLeft: "8px",
                            animationDelay: "0.3s"
                        }}
                    />
                )}
            </div>

            {/* Progress indicator for loading state */}
            {loadingState === "loading" && loadingProgress !== undefined && (
                <div
                    className="mx-tree__node-skeleton-progress"
                    style={{
                        position: "absolute",
                        bottom: 0,
                        left: `${indent}px`,
                        right: 0,
                        height: "2px",
                        background: "var(--mx-tree-progress-bg, #e0e0e0)",
                        overflow: "hidden"
                    }}
                >
                    <div
                        className="mx-tree__node-skeleton-progress-bar"
                        style={{
                            width: `${loadingProgress}%`,
                            height: "100%",
                            background: "var(--mx-tree-progress-color, #3b82f6)",
                            transition: "width 0.3s ease-out"
                        }}
                    />
                </div>
            )}

            {/* Error indicator */}
            {loadingState === "error" && (
                <div className="mx-tree__node-skeleton-error-icon">
                    <span style={{ fontSize: "12px", color: "var(--mx-tree-error-color, #ef4444)" }}>⚠</span>
                </div>
            )}
        </div>
    );
}

export default TreeNodeSkeleton;
