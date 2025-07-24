import { ReactElement, createElement } from "react";
import classNames from "classnames";

interface TreeLoadingBarProps {
    isLoading: boolean;
    className?: string;
}

/**
 * Minimal loading progress bar for the tree view
 * Displays at the bottom of the tree container during data loading operations
 */
export function TreeLoadingBar({ isLoading, className }: TreeLoadingBarProps): ReactElement | null {
    if (!isLoading) {
        return null;
    }

    return createElement(
        "div",
        {
            className: classNames("mx-tree__loading-bar", className),
            role: "progressbar",
            "aria-label": "Loading tree data",
            "aria-busy": "true"
        },
        createElement("div", {
            className: "mx-tree__loading-bar-progress"
        })
    );
}
