import { useRef, useCallback, useEffect } from "react";
import { TreeNode } from "../types/TreeTypes";

interface PanelScrollState {
    panelId: string;
    scrollTop: number;
    nodeId: string; // Parent node that opened this panel
    timestamp: number;
}

interface UseFloatingPanelScrollPreservationProps {
    openPanels: Map<string, any>; // Panel instances
    nodeMap: Map<string, TreeNode>;
    debugMode: boolean;
}

interface UseFloatingPanelScrollPreservationReturn {
    savePanelScroll: (panelId: string, scrollTop: number) => void;
    restorePanelScroll: (panelId: string) => number;
    navigateToPanelNode: (nodeId: string, panelId: string) => void;
    clearPanelHistory: (panelId: string) => void;
    handlePanelNavigation: (fromNodeId: string, toNodeId: string) => Promise<void>;
}

/**
 * Specialized scroll preservation for floating panel view
 * Each panel maintains its own scroll position independently
 */
export function useFloatingPanelScrollPreservation({
    openPanels,
    nodeMap,
    debugMode
}: UseFloatingPanelScrollPreservationProps): UseFloatingPanelScrollPreservationReturn {
    // Store scroll positions for each panel
    const panelScrollStates = useRef<Map<string, PanelScrollState>>(new Map());
    const panelRefs = useRef<Map<string, HTMLElement>>(new Map());

    /**
     * Save scroll position for a specific panel
     */
    const savePanelScroll = useCallback(
        (panelId: string, scrollTop: number) => {
            const panel = openPanels.get(panelId);
            if (!panel) {
                return;
            }

            const state: PanelScrollState = {
                panelId,
                scrollTop,
                nodeId: panel.parentNode?.id || "",
                timestamp: Date.now()
            };

            panelScrollStates.current.set(panelId, state);

            if (debugMode) {
                console.debug(
                    `useFloatingPanelScrollPreservation.ts [SAVE]: Panel ${panelId} scroll position ${scrollTop}`
                );
            }
        },
        [openPanels, debugMode]
    );

    /**
     * Restore scroll position for a panel
     */
    const restorePanelScroll = useCallback(
        (panelId: string): number => {
            const state = panelScrollStates.current.get(panelId);
            if (!state) {
                return 0;
            }

            if (debugMode) {
                console.debug(
                    `useFloatingPanelScrollPreservation.ts [RESTORE]: Panel ${panelId} to position ${state.scrollTop}`
                );
            }

            return state.scrollTop;
        },
        [debugMode]
    );

    /**
     * Navigate to a specific node within a floating panel
     */
    const navigateToPanelNode = useCallback(
        (nodeId: string, panelId: string) => {
            // Find the panel element
            const panelElement = document.querySelector(`[data-panel-id="${panelId}"]`) as HTMLElement;
            if (!panelElement) {
                return;
            }

            // Find the node within the panel
            const nodeElement = panelElement.querySelector(`[data-node-id="${nodeId}"]`) as HTMLElement;
            if (!nodeElement) {
                return;
            }

            // Get panel content container (usually has overflow)
            const scrollContainer = panelElement.querySelector(".mx-tree__floating-panel-content") as HTMLElement;
            if (!scrollContainer) {
                return;
            }

            // Calculate position within panel
            const nodeRect = nodeElement.getBoundingClientRect();
            const containerRect = scrollContainer.getBoundingClientRect();
            const relativeTop = nodeRect.top - containerRect.top + scrollContainer.scrollTop;

            // Scroll to center the node
            const targetScroll = relativeTop - containerRect.height / 2 + nodeRect.height / 2;
            scrollContainer.scrollTo({
                top: Math.max(0, targetScroll),
                behavior: "smooth"
            });

            // Highlight the node
            nodeElement.classList.add("mx-tree__node--highlighted");
            setTimeout(() => {
                nodeElement.classList.remove("mx-tree__node--highlighted");
            }, 2000);

            if (debugMode) {
                console.debug(`useFloatingPanelScrollPreservation.ts [NAVIGATE]: Node ${nodeId} in panel ${panelId}`);
            }
        },
        [debugMode]
    );

    /**
     * Handle navigation between panels (e.g., breadcrumb click)
     */
    const handlePanelNavigation = useCallback(
        async (fromNodeId: string, toNodeId: string) => {
            // Determine which panels need to be closed/opened
            const fromPath = getNodePath(fromNodeId);
            const toPath = getNodePath(toNodeId);

            // Find common ancestor
            let commonIndex = 0;
            while (
                commonIndex < Math.min(fromPath.length, toPath.length) &&
                fromPath[commonIndex] === toPath[commonIndex]
            ) {
                commonIndex++;
            }

            // Close panels that are no longer needed
            const panelsToClose: string[] = [];
            for (let i = fromPath.length - 1; i > commonIndex; i--) {
                const nodeId = fromPath[i];
                const panelId = `panel-${nodeId}-${i}`;
                panelsToClose.push(panelId);
            }

            // Save scroll positions before closing
            panelsToClose.forEach(panelId => {
                const scrollContainer = document.querySelector(
                    `[data-panel-id="${panelId}"] .mx-tree__floating-panel-content`
                ) as HTMLElement;
                if (scrollContainer) {
                    savePanelScroll(panelId, scrollContainer.scrollTop);
                }
            });

            // TODO: Trigger panel closing through parent component

            // Open new panels for target path
            for (let i = commonIndex + 1; i < toPath.length; i++) {
                const nodeId = toPath[i - 1];
                const node = nodeMap.get(nodeId);
                if (node && !node.isLeaf) {
                    // TODO: Trigger panel opening through parent component

                    // Restore scroll if panel was previously open
                    const panelId = `panel-${nodeId}-${i}`;
                    const savedScroll = restorePanelScroll(panelId);
                    if (savedScroll > 0) {
                        // Apply scroll after panel renders
                        requestAnimationFrame(() => {
                            const scrollContainer = document.querySelector(
                                `[data-panel-id="${panelId}"] .mx-tree__floating-panel-content`
                            ) as HTMLElement;
                            if (scrollContainer) {
                                scrollContainer.scrollTop = savedScroll;
                            }
                        });
                    }
                }
            }

            // Finally, highlight the target node
            const targetPanelLevel = toPath.length - 1;
            const targetPanelId = `panel-${toPath[targetPanelLevel - 1]}-${targetPanelLevel}`;

            // Wait for panels to render
            await new Promise(resolve => setTimeout(resolve, 300));

            navigateToPanelNode(toNodeId, targetPanelId);
        },
        [nodeMap, savePanelScroll, restorePanelScroll, navigateToPanelNode]
    );

    /**
     * Get path from root to node
     */
    function getNodePath(nodeId: string): string[] {
        const path: string[] = [];
        let currentId: string | null = nodeId;

        while (currentId) {
            path.unshift(currentId);
            const node = nodeMap.get(currentId);
            currentId = node?.parentId || null;
        }

        return path;
    }

    /**
     * Clear scroll history for a closed panel
     */
    const clearPanelHistory = useCallback((panelId: string) => {
        panelScrollStates.current.delete(panelId);
        panelRefs.current.delete(panelId);
    }, []);

    // Monitor open panels and save scroll positions
    useEffect(() => {
        const handleScroll = (event: Event) => {
            const target = event.target as HTMLElement;
            const panel = target.closest("[data-panel-id]") as HTMLElement;
            if (panel) {
                const panelId = panel.getAttribute("data-panel-id");
                if (panelId) {
                    savePanelScroll(panelId, target.scrollTop);
                }
            }
        };

        // Add scroll listeners to all panel content containers
        const panels = document.querySelectorAll(".mx-tree__floating-panel-content");
        panels.forEach(panel => {
            panel.addEventListener("scroll", handleScroll, { passive: true });
        });

        return () => {
            panels.forEach(panel => {
                panel.removeEventListener("scroll", handleScroll);
            });
        };
    }, [openPanels, savePanelScroll]);

    // Clean up old panel states
    useEffect(() => {
        const interval = setInterval(() => {
            const now = Date.now();
            const maxAge = 5 * 60 * 1000; // 5 minutes

            panelScrollStates.current.forEach((state, panelId) => {
                if (now - state.timestamp > maxAge && !openPanels.has(panelId)) {
                    clearPanelHistory(panelId);
                }
            });
        }, 60000); // Check every minute

        return () => clearInterval(interval);
    }, [openPanels, clearPanelHistory]);

    return {
        savePanelScroll,
        restorePanelScroll,
        navigateToPanelNode,
        clearPanelHistory,
        handlePanelNavigation
    };
}
