/**
 * Screen reader announcer utility for accessibility
 * Provides consistent way to announce actions to screen readers
 */

// Constants
const ANNOUNCEMENT_DELAY = 100; // Small delay to ensure DOM updates are processed
const ANNOUNCEMENT_CLEAR_DELAY = 1000; // Clear announcement after this time

/**
 * Announcement types for different contexts
 */
export type AnnouncementType = "polite" | "assertive";

/**
 * Create a screen reader announcer instance
 */
export function createScreenReaderAnnouncer() {
    let announcerElement: HTMLDivElement | null = null;
    let clearTimer: number | null = null;

    /**
     * Initialize the announcer element
     */
    const init = () => {
        if (announcerElement) {
            return;
        }

        // Create the announcer element
        announcerElement = document.createElement("div");
        announcerElement.className = "mx-tree__screen-reader-announcer";
        announcerElement.setAttribute("role", "status");
        announcerElement.setAttribute("aria-live", "polite");
        announcerElement.setAttribute("aria-atomic", "true");

        // Style it to be invisible but still readable by screen readers
        Object.assign(announcerElement.style, {
            position: "absolute",
            left: "-10000px",
            width: "1px",
            height: "1px",
            overflow: "hidden"
        });

        document.body.appendChild(announcerElement);
    };

    /**
     * Announce a message to screen readers
     */
    const announce = (message: string, type: AnnouncementType = "polite") => {
        if (!announcerElement) {
            init();
        }

        if (!announcerElement) {
            return;
        }

        // Clear any pending announcement
        if (clearTimer) {
            window.clearTimeout(clearTimer);
        }

        // Update aria-live based on type
        announcerElement.setAttribute("aria-live", type);

        // Use a small delay to ensure the announcement is picked up
        setTimeout(() => {
            if (announcerElement) {
                announcerElement.textContent = message;

                // Clear the announcement after a delay
                clearTimer = window.setTimeout(() => {
                    if (announcerElement) {
                        announcerElement.textContent = "";
                    }
                }, ANNOUNCEMENT_CLEAR_DELAY);
            }
        }, ANNOUNCEMENT_DELAY);
    };

    /**
     * Cleanup the announcer
     */
    const destroy = () => {
        if (clearTimer) {
            window.clearTimeout(clearTimer);
        }
        if (announcerElement && announcerElement.parentNode) {
            announcerElement.parentNode.removeChild(announcerElement);
        }
        announcerElement = null;
    };

    return {
        announce,
        destroy
    };
}

/**
 * Tree-specific announcement helpers
 */
export const treeAnnouncements = {
    nodeSelected: (label: string, count?: number) =>
        count !== undefined ? `${label} selected. ${count} items selected in total.` : `${label} selected`,

    nodeDeselected: (label: string, count?: number) =>
        count !== undefined ? `${label} deselected. ${count} items selected in total.` : `${label} deselected`,

    nodeExpanded: (label: string, childCount?: number) =>
        childCount !== undefined ? `${label} expanded, ${childCount} child items` : `${label} expanded`,

    nodeCollapsed: (label: string) => `${label} collapsed`,

    navigationTo: (label: string, level: number, position?: { current: number; total: number }) => {
        let message = `${label}, level ${level}`;
        if (position) {
            message += `, ${position.current} of ${position.total}`;
        }
        return message;
    },

    searchResults: (count: number, query: string) =>
        count === 0
            ? `No results found for ${query}`
            : `${count} ${count === 1 ? "result" : "results"} found for ${query}`,

    allSelected: (count: number) => `All ${count} visible items selected`,

    allDeselected: () => `All items deselected`,

    bulkOperation: (operation: string, count: number) => `${operation} ${count} items`,

    loadingComplete: (count: number) => `Tree loaded with ${count} items`,

    error: (message: string) => `Error: ${message}`
};

/**
 * Hook for using screen reader announcer in components
 */
import { useEffect, useRef } from "react";

export function useScreenReaderAnnouncer() {
    const announcerRef = useRef<ReturnType<typeof createScreenReaderAnnouncer> | null>(null);

    useEffect(() => {
        announcerRef.current = createScreenReaderAnnouncer();

        return () => {
            if (announcerRef.current) {
                announcerRef.current.destroy();
            }
        };
    }, []);

    return announcerRef.current?.announce || (() => {});
}
