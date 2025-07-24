import { useEffect, useRef, useCallback } from "react";
import { TreeNode } from "../types/TreeTypes";

interface UseViewportTrackingProps {
    containerRef: React.RefObject<HTMLElement>;
    nodes: TreeNode[];
    nodeHeight: number;
    updateViewport?: (visibleNodeIds: string[]) => void;
    enabled?: boolean;
}

/**
 * Hook to track which nodes are visible in the viewport
 * and notify the memory manager for prefetching
 */
export function useViewportTracking({
    containerRef,
    nodes,
    nodeHeight,
    updateViewport,
    enabled = true
}: UseViewportTrackingProps): void {
    const lastVisibleNodesRef = useRef<Set<string>>(new Set());
    const updateTimeoutRef = useRef<number | null>(null);

    /**
     * Calculate which nodes are visible in the viewport
     */
    const calculateVisibleNodes = useCallback(() => {
        if (!containerRef.current || !updateViewport || !enabled) {
            return;
        }

        const container = containerRef.current;
        const scrollTop = container.scrollTop;
        const containerHeight = container.clientHeight;

        // Calculate visible range
        const startIndex = Math.floor(scrollTop / nodeHeight);
        const endIndex = Math.ceil((scrollTop + containerHeight) / nodeHeight);

        // Get visible node IDs
        const visibleNodeIds: string[] = [];
        for (let i = startIndex; i <= endIndex && i < nodes.length; i++) {
            if (nodes[i]) {
                visibleNodeIds.push(nodes[i].id);
            }
        }

        // Check if visible nodes have changed
        const visibleSet = new Set(visibleNodeIds);
        const hasChanged =
            visibleNodeIds.length !== lastVisibleNodesRef.current.size ||
            visibleNodeIds.some(id => !lastVisibleNodesRef.current.has(id));

        if (hasChanged) {
            lastVisibleNodesRef.current = visibleSet;

            // Debounce the update to avoid too many calls
            if (updateTimeoutRef.current) {
                window.clearTimeout(updateTimeoutRef.current);
            }

            updateTimeoutRef.current = window.setTimeout(() => {
                updateViewport(visibleNodeIds);
                updateTimeoutRef.current = null;
            }, 100);
        }
    }, [containerRef, nodes, nodeHeight, updateViewport, enabled]);

    /**
     * Set up scroll listener
     */
    useEffect(() => {
        if (!containerRef.current || !enabled || !updateViewport) {
            return;
        }

        const container = containerRef.current;

        // Initial calculation
        calculateVisibleNodes();

        // Scroll event listener
        const handleScroll = () => {
            calculateVisibleNodes();
        };

        // Resize observer for container size changes
        const resizeObserver = new ResizeObserver(() => {
            calculateVisibleNodes();
        });

        container.addEventListener("scroll", handleScroll, { passive: true });
        resizeObserver.observe(container);

        return () => {
            container.removeEventListener("scroll", handleScroll);
            resizeObserver.disconnect();
            if (updateTimeoutRef.current) {
                window.clearTimeout(updateTimeoutRef.current);
            }
        };
    }, [calculateVisibleNodes, containerRef, enabled, updateViewport]);

    /**
     * Recalculate when nodes change
     */
    useEffect(() => {
        if (enabled && nodes.length > 0) {
            calculateVisibleNodes();
        }
    }, [nodes, calculateVisibleNodes, enabled]);
}

/**
 * Calculate visible nodes for a flat list of visible items
 */
export function getVisibleNodeIds(
    visibleItems: TreeNode[],
    containerHeight: number,
    scrollTop: number,
    itemHeight: number
): string[] {
    const startIndex = Math.floor(scrollTop / itemHeight);
    const visibleCount = Math.ceil(containerHeight / itemHeight);
    const endIndex = Math.min(startIndex + visibleCount, visibleItems.length);

    const visibleIds: string[] = [];
    for (let i = startIndex; i < endIndex; i++) {
        if (visibleItems[i]) {
            visibleIds.push(visibleItems[i].id);
        }
    }

    return visibleIds;
}
