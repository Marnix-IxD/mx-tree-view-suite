/**
 * Search Display Strategy Manager
 * Determines how search results should be displayed based on display mode
 */

import { DisplayAsEnum } from "../../../typings/TreeViewProps";

export type SearchResultDisplay = "tree-expand" | "flat-overlay" | "limited-expand";

export interface ISearchDisplayStrategy {
    displayType: SearchResultDisplay;
    maxInlineResults: number;
    showPathHeaders: boolean;
    forceOverlay: boolean;
    showLoader: boolean;
}

export class SearchDisplayStrategyManager {
    // Thresholds
    private static readonly TREE_SIZE_OVERLAY_THRESHOLD = 100;
    private static readonly FLOATING_MAX_INLINE = 20;
    private static readonly STANDARD_MAX_INLINE = 50;

    /**
     * Get search display strategy based on display mode and tree size
     */
    static getStrategy(
        displayMode: DisplayAsEnum,
        totalNodeCount: number,
        hasLazyLoading: boolean,
        visibleNodeCount?: number
    ): ISearchDisplayStrategy {
        // Panels always use flat overlay with path headers
        if (displayMode === "sliding") {
            return {
                displayType: "flat-overlay",
                maxInlineResults: 0,
                showPathHeaders: true,
                forceOverlay: true,
                showLoader: false
            };
        }

        // Force overlay for large trees or when most nodes are collapsed
        const visibilityRatio = visibleNodeCount ? visibleNodeCount / totalNodeCount : 1;
        if (
            totalNodeCount > this.TREE_SIZE_OVERLAY_THRESHOLD ||
            (visibleNodeCount !== undefined && visibilityRatio < 0.2 && totalNodeCount > 50)
        ) {
            return {
                displayType: "flat-overlay",
                maxInlineResults: 0,
                showPathHeaders: true,
                forceOverlay: true,
                showLoader: false
            };
        }

        // Floating mode - good for navigation menus
        if (displayMode === "floating") {
            return {
                displayType: hasLazyLoading ? "limited-expand" : "tree-expand",
                maxInlineResults: this.FLOATING_MAX_INLINE,
                showPathHeaders: false,
                forceOverlay: false,
                showLoader: hasLazyLoading
            };
        }

        // Standard mode - full tree expansion
        return {
            displayType: "tree-expand",
            maxInlineResults: this.STANDARD_MAX_INLINE,
            showPathHeaders: false,
            forceOverlay: false,
            showLoader: hasLazyLoading
        };
    }

    /**
     * Format path for display in headers
     */
    static formatNodePath(path: string[], separator = " > "): string {
        return path.filter(p => p).join(separator);
    }
}
