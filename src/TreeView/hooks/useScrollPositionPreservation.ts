import { useRef, useEffect, useCallback, useState } from "react";
import { TreeNode } from "../types/TreeTypes";
import { ScrollPositionManager } from "../utils/scrollPositionManager";
import { ListValue } from "mendix";

interface UseScrollPositionPreservationProps {
    containerRef: React.RefObject<HTMLElement>;
    nodeMap: Map<string, TreeNode>;
    visibleNodes: TreeNode[];
    expandedNodes: Set<string>;
    itemHeight: number;
    debugMode: boolean;
    datasource?: ListValue;
    onExpandPath?: (nodeIds: string[]) => Promise<void>;
    onEnsureNodeLoaded?: (nodeId: string) => Promise<void>;
}

interface UseScrollPositionPreservationReturn {
    preserveScrollPosition: (operation: () => void | Promise<void>) => Promise<void>;
    navigateToNode: (nodeId: string, options?: NavigateOptions) => Promise<void>;
    navigateToParent: (nodeId: string) => Promise<void>;
    handleNodesLoaded: (loadedNodeIds: string[]) => void;
    scrollToSearchResult: (nodeId: string) => Promise<void>;
    maintainScrollDuringExpand: (nodeId: string, expand: () => Promise<void>) => Promise<void>;
}

interface NavigateOptions {
    behavior?: ScrollBehavior;
    block?: ScrollLogicalPosition;
    highlight?: boolean;
    expandParents?: boolean;
}

/**
 * Hook for preserving scroll position during tree operations
 */
export function useScrollPositionPreservation({
    containerRef,
    nodeMap,
    visibleNodes,
    expandedNodes,
    itemHeight,
    debugMode,
    datasource,
    onExpandPath,
    onEnsureNodeLoaded
}: UseScrollPositionPreservationProps): UseScrollPositionPreservationReturn {
    const managerRef = useRef<ScrollPositionManager>();
    const [isNavigating, setIsNavigating] = useState(false);
    const skeletonHeightsRef = useRef<Map<string, number>>(new Map());

    // Initialize scroll position manager
    useEffect(() => {
        managerRef.current = new ScrollPositionManager({
            defaultNodeHeight: itemHeight,
            categoryHeaderHeight: itemHeight * 1.5, // Assume category headers are 1.5x height
            containerRef,
            debugMode,
            datasource
        });

        return () => {
            managerRef.current?.clear();
        };
    }, [containerRef, itemHeight, debugMode, datasource]);

    // Track skeleton heights before they're replaced
    useEffect(() => {
        visibleNodes.forEach(node => {
            if (node.isSkeleton) {
                const element = document.querySelector(`[data-node-id="${node.id}"]`) as HTMLElement;
                if (element) {
                    skeletonHeightsRef.current.set(node.id, element.getBoundingClientRect().height);
                }
            }
        });
    }, [visibleNodes]);

    /**
     * Preserve scroll position during an operation
     */
    const preserveScrollPosition = useCallback(async (operation: () => void | Promise<void>) => {
        const manager = managerRef.current;
        if (!manager) {
            return;
        }

        // Capture current state
        manager.captureScrollState();

        // Perform operation
        await operation();

        // Wait for DOM updates
        await new Promise(resolve => requestAnimationFrame(resolve));

        // Restore position
        await manager.restoreScrollState({
            behavior: "auto",
            delay: 50 // Small delay for DOM settling
        });
    }, []);

    /**
     * Navigate to a specific node with loading support
     */
    const navigateToNode = useCallback(
        async (nodeId: string, options: NavigateOptions = {}) => {
            const manager = managerRef.current;
            if (!manager || isNavigating) {
                return;
            }

            setIsNavigating(true);

            try {
                if (debugMode) {
                    console.debug(`useScrollPositionPreservation.ts [NAVIGATE][START]: Navigating to node ${nodeId}`);
                }

                // Get node path for expansion
                const getNodePath = (targetId: string): string[] => {
                    const path: string[] = [];
                    let currentId: string | null = targetId;

                    while (currentId) {
                        path.unshift(currentId);
                        const node = nodeMap.get(currentId);
                        currentId = node?.parentId || null;
                    }

                    return path;
                };

                // Check which nodes need to be expanded
                const path = getNodePath(nodeId);
                const nodesToExpand = path.filter(id => !expandedNodes.has(id));

                if (debugMode && nodesToExpand.length > 0) {
                    console.debug(
                        `useScrollPositionPreservation.ts [NAVIGATE][EXPAND]: Need to expand ${
                            nodesToExpand.length
                        } nodes: ${nodesToExpand.join(", ")}`
                    );
                }

                // Only call expandPath if there are nodes that need expanding
                const expandPathFunc =
                    options.expandParents && onExpandPath && nodesToExpand.length > 0
                        ? () => onExpandPath(nodesToExpand)
                        : undefined;

                // Navigate with progressive loading
                await manager.navigateToNode(nodeId, {
                    behavior: options.behavior || "smooth",
                    block: options.block || "center",
                    highlight: options.highlight !== false,
                    ensureLoaded: async (id: string) => {
                        if (onEnsureNodeLoaded) {
                            await onEnsureNodeLoaded(id);
                            // TODO: Add timeout and error handling
                        }
                    },
                    expandPath: expandPathFunc,
                    getNodePath
                });

                // Update datasource position if available
                if (datasource) {
                    // TODO: Use datasource.setOffset() to update virtual position
                    // This would help Mendix load the right data page
                    const node = nodeMap.get(nodeId);
                    if (node?.sortOrder !== undefined) {
                        if (debugMode) {
                            console.debug(
                                `useScrollPositionPreservation.ts [NAVIGATE][DATASOURCE]: Would set offset to ${node.sortOrder}`
                            );
                        }
                        // TODO: Verify this API usage
                        // datasource.setOffset(node.sortOrder);
                    }
                }
            } catch (error) {
                console.error(
                    `useScrollPositionPreservation.ts [NAVIGATE][ERROR]: Failed to navigate to node ${nodeId}`,
                    error
                );
            } finally {
                setIsNavigating(false);
            }
        },
        [nodeMap, expandedNodes, isNavigating, debugMode, datasource, onEnsureNodeLoaded, onExpandPath]
    );

    /**
     * Navigate to parent node while keeping child visible
     */
    const navigateToParent = useCallback(
        async (nodeId: string) => {
            const node = nodeMap.get(nodeId);
            if (!node?.parentId) {
                return;
            }

            const manager = managerRef.current;
            if (!manager) {
                return;
            }

            // Capture current position with child as anchor
            manager.captureScrollState();

            // Navigate to parent but keep child in view
            await navigateToNode(node.parentId, {
                behavior: "smooth",
                block: "start" // Parent at top, child visible below
            });
        },
        [nodeMap, navigateToNode]
    );

    /**
     * Handle nodes that have finished loading
     */
    const handleNodesLoaded = useCallback(
        (loadedNodeIds: string[]) => {
            const manager = managerRef.current;
            if (!manager) {
                return;
            }

            // Get skeleton heights before they're replaced
            const previousHeights = new Map<string, number>();
            loadedNodeIds.forEach(nodeId => {
                const height = skeletonHeightsRef.current.get(nodeId);
                if (height !== undefined) {
                    previousHeights.set(nodeId, height);
                    skeletonHeightsRef.current.delete(nodeId);
                }
            });

            // Let manager handle the progressive load
            manager.handleProgressiveLoad(loadedNodeIds, previousHeights);

            // TODO: Update total count cache if datasource provides it
            if (datasource && debugMode) {
                console.debug(
                    `useScrollPositionPreservation.ts [LOAD][COMPLETE]: ${loadedNodeIds.length} nodes loaded`
                );
            }
        },
        [datasource, debugMode]
    );

    /**
     * Scroll to search result with path expansion
     */
    const scrollToSearchResult = useCallback(
        async (nodeId: string) => {
            if (debugMode) {
                console.debug(
                    `useScrollPositionPreservation.ts [SEARCH][NAVIGATE]: Scrolling to search result ${nodeId}`
                );
            }

            await navigateToNode(nodeId, {
                behavior: "smooth",
                block: "center",
                highlight: true,
                expandParents: true
            });
        },
        [navigateToNode, debugMode]
    );

    /**
     * Maintain scroll position during node expansion
     */
    const maintainScrollDuringExpand = useCallback(
        async (nodeId: string, expand: () => Promise<void>) => {
            const manager = managerRef.current;
            const container = containerRef.current;
            if (!manager || !container) {
                return;
            }

            // Skip if already expanded
            if (expandedNodes.has(nodeId)) {
                if (debugMode) {
                    console.debug(
                        `useScrollPositionPreservation.ts [EXPAND][SKIP]: Node ${nodeId} is already expanded`
                    );
                }
                return;
            }

            // Check if expanding below viewport
            const nodeElement = document.querySelector(`[data-node-id="${nodeId}"]`) as HTMLElement;
            if (!nodeElement) {
                return;
            }

            const nodeRect = nodeElement.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            const isBelowViewport = nodeRect.bottom > containerRect.bottom - 100; // 100px buffer

            if (isBelowViewport) {
                // Let it expand naturally without adjustment
                await expand();
            } else {
                // Preserve position for expansions in or above viewport
                await preserveScrollPosition(expand);
            }
        },
        [containerRef, expandedNodes, debugMode, preserveScrollPosition]
    );

    // Handle browser back/forward navigation
    useEffect(() => {
        const handlePopState = (event: PopStateEvent) => {
            if (event.state?.nodeId) {
                navigateToNode(event.state.nodeId, {
                    behavior: "auto",
                    highlight: true
                });
            }
        };

        window.addEventListener("popstate", handlePopState);
        return () => window.removeEventListener("popstate", handlePopState);
    }, [navigateToNode]);

    // Update total counts when datasource changes
    useEffect(() => {
        if (datasource && managerRef.current) {
            // TODO: Implement level-based total count caching
            // This would help with accurate position estimation
            if (debugMode) {
                console.debug(
                    `useScrollPositionPreservation.ts [DATASOURCE][UPDATE]: Datasource changed, updating counts`
                );
            }
        }
    }, [datasource, debugMode]);

    return {
        preserveScrollPosition,
        navigateToNode,
        navigateToParent,
        handleNodesLoaded,
        scrollToSearchResult,
        maintainScrollDuringExpand
    };
}
