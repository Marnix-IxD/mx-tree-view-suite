import { useCallback, useEffect, useRef, useState } from "react";
import { ActionValue } from "mendix";
import { TreeNode } from "../types/TreeTypes";

/**
 * Configuration for visibility management
 */
export interface IVisibilityConfig {
    /**
     * Action to call when visibility changes need to be sent to server
     */
    onVisibilityChange?: ActionValue;

    /**
     * Initial set of hidden node IDs
     */
    initialHiddenNodes?: Set<string>;

    /**
     * Whether to persist visibility changes automatically
     */
    autoPersist?: boolean;

    /**
     * Debounce delay for API calls (ms)
     */
    debounceDelay?: number;
}

/**
 * Visibility change data sent to server
 */
export interface IVisibilityChangeData {
    /**
     * Node IDs that were made visible
     */
    showNodes: string[];

    /**
     * Node IDs that were hidden
     */
    hideNodes: string[];

    /**
     * All currently hidden node IDs
     */
    allHiddenNodes: string[];

    /**
     * Context information about the change
     */
    context: {
        /**
         * Type of visibility change
         */
        changeType: "show" | "hide" | "toggle" | "bulk";

        /**
         * Node that triggered the change (if applicable)
         */
        triggerNodeId?: string;

        /**
         * Whether this affects children recursively
         */
        recursive: boolean;

        /**
         * Timestamp of the change
         */
        timestamp: number;
    };
}

/**
 * Hook for managing tree node visibility with server synchronization
 * Similar to selection management but for show/hide functionality
 */
export function useTreeVisibility(config: IVisibilityConfig = {}) {
    const { onVisibilityChange, initialHiddenNodes = new Set(), autoPersist = true, debounceDelay = 300 } = config;

    // State for tracking hidden nodes
    const [hiddenNodes, setHiddenNodes] = useState<Set<string>>(initialHiddenNodes);
    const [pendingChanges, setPendingChanges] = useState<{
        show: Set<string>;
        hide: Set<string>;
    }>({
        show: new Set(),
        hide: new Set()
    });

    // Refs for managing API calls
    const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastSentStateRef = useRef<Set<string>>(new Set(initialHiddenNodes));

    /**
     * Send visibility changes to server
     */
    const sendVisibilityChanges = useCallback(
        async (changes: IVisibilityChangeData) => {
            if (!onVisibilityChange || !onVisibilityChange.canExecute) {
                console.warn("useTreeVisibility: onVisibilityChange action not available");
                return;
            }

            try {
                console.debug(
                    `useTreeVisibility [API]: Sending visibility changes - show: ${changes.showNodes.length}, hide: ${changes.hideNodes.length}`
                );

                // Execute the action with the visibility data
                await onVisibilityChange.execute();

                // Update the last sent state
                lastSentStateRef.current = new Set(changes.allHiddenNodes);

                console.debug(`useTreeVisibility [API]: Visibility changes sent successfully`);
            } catch (error) {
                console.error("useTreeVisibility [API]: Failed to send visibility changes:", error);
            }
        },
        [onVisibilityChange]
    );

    /**
     * Process pending changes and send to server
     */
    const processPendingChanges = useCallback(() => {
        const { show, hide } = pendingChanges;

        if (show.size === 0 && hide.size === 0) {
            return;
        }

        const changeData: IVisibilityChangeData = {
            showNodes: Array.from(show),
            hideNodes: Array.from(hide),
            allHiddenNodes: Array.from(hiddenNodes),
            context: {
                changeType: show.size > 0 && hide.size > 0 ? "bulk" : show.size > 0 ? "show" : "hide",
                recursive: false, // Will be set by specific functions
                timestamp: Date.now()
            }
        };

        // Clear pending changes
        setPendingChanges({ show: new Set(), hide: new Set() });

        // Send to server
        if (autoPersist) {
            sendVisibilityChanges(changeData);
        }
    }, [pendingChanges, hiddenNodes, autoPersist, sendVisibilityChanges]);

    /**
     * Debounced processing of pending changes
     */
    const debouncedProcess = useCallback(() => {
        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
        }

        debounceTimeoutRef.current = setTimeout(() => {
            processPendingChanges();
            debounceTimeoutRef.current = null;
        }, debounceDelay);
    }, [processPendingChanges, debounceDelay]);

    /**
     * Show a single node
     */
    const showNode = useCallback(
        (nodeId: string) => {
            console.debug(`useTreeVisibility [SHOW]: Showing node ${nodeId}`);

            setHiddenNodes(prev => {
                const newSet = new Set(prev);
                newSet.delete(nodeId);
                return newSet;
            });

            setPendingChanges(prev => ({
                show: new Set([...prev.show, nodeId]),
                hide: new Set([...prev.hide].filter(id => id !== nodeId))
            }));

            debouncedProcess();
        },
        [debouncedProcess]
    );

    /**
     * Hide a single node
     */
    const hideNode = useCallback(
        (nodeId: string) => {
            console.debug(`useTreeVisibility [HIDE]: Hiding node ${nodeId}`);

            setHiddenNodes(prev => new Set([...prev, nodeId]));

            setPendingChanges(prev => ({
                show: new Set([...prev.show].filter(id => id !== nodeId)),
                hide: new Set([...prev.hide, nodeId])
            }));

            debouncedProcess();
        },
        [debouncedProcess]
    );

    /**
     * Toggle visibility of a single node
     */
    const toggleNodeVisibility = useCallback(
        (nodeId: string) => {
            const isHidden = hiddenNodes.has(nodeId);

            if (isHidden) {
                showNode(nodeId);
            } else {
                hideNode(nodeId);
            }
        },
        [hiddenNodes, showNode, hideNode]
    );

    /**
     * Show node and all its children recursively
     */
    const showNodeRecursive = useCallback(
        (node: TreeNode, nodeMap: Map<string, TreeNode>) => {
            console.debug(`useTreeVisibility [SHOW_RECURSIVE]: Showing node ${node.id} and all children`);

            const nodesToShow = new Set<string>();

            // Collect all descendant IDs
            const collectDescendants = (currentNode: TreeNode) => {
                nodesToShow.add(currentNode.id);
                currentNode.children.forEach(child => {
                    const childNode = nodeMap.get(child.id);
                    if (childNode) {
                        collectDescendants(childNode);
                    }
                });
            };

            collectDescendants(node);

            // Update hidden nodes
            setHiddenNodes(prev => {
                const newSet = new Set(prev);
                nodesToShow.forEach(id => newSet.delete(id));
                return newSet;
            });

            // Update pending changes
            setPendingChanges(prev => ({
                show: new Set([...prev.show, ...nodesToShow]),
                hide: new Set([...prev.hide].filter(id => !nodesToShow.has(id)))
            }));

            debouncedProcess();
        },
        [debouncedProcess]
    );

    /**
     * Hide node and all its children recursively
     */
    const hideNodeRecursive = useCallback(
        (node: TreeNode, nodeMap: Map<string, TreeNode>) => {
            console.debug(`useTreeVisibility [HIDE_RECURSIVE]: Hiding node ${node.id} and all children`);

            const nodesToHide = new Set<string>();

            // Collect all descendant IDs
            const collectDescendants = (currentNode: TreeNode) => {
                nodesToHide.add(currentNode.id);
                currentNode.children.forEach(child => {
                    const childNode = nodeMap.get(child.id);
                    if (childNode) {
                        collectDescendants(childNode);
                    }
                });
            };

            collectDescendants(node);

            // Update hidden nodes
            setHiddenNodes(prev => new Set([...prev, ...nodesToHide]));

            // Update pending changes
            setPendingChanges(prev => ({
                show: new Set([...prev.show].filter(id => !nodesToHide.has(id))),
                hide: new Set([...prev.hide, ...nodesToHide])
            }));

            debouncedProcess();
        },
        [debouncedProcess]
    );

    /**
     * Bulk visibility operations
     */
    const bulkShowNodes = useCallback(
        (nodeIds: string[]) => {
            console.debug(`useTreeVisibility [BULK_SHOW]: Showing ${nodeIds.length} nodes`);

            setHiddenNodes(prev => {
                const newSet = new Set(prev);
                nodeIds.forEach(id => newSet.delete(id));
                return newSet;
            });

            setPendingChanges(prev => ({
                show: new Set([...prev.show, ...nodeIds]),
                hide: new Set([...prev.hide].filter(id => !nodeIds.includes(id)))
            }));

            debouncedProcess();
        },
        [debouncedProcess]
    );

    const bulkHideNodes = useCallback(
        (nodeIds: string[]) => {
            console.debug(`useTreeVisibility [BULK_HIDE]: Hiding ${nodeIds.length} nodes`);

            setHiddenNodes(prev => new Set([...prev, ...nodeIds]));

            setPendingChanges(prev => ({
                show: new Set([...prev.show].filter(id => !nodeIds.includes(id))),
                hide: new Set([...prev.hide, ...nodeIds])
            }));

            debouncedProcess();
        },
        [debouncedProcess]
    );

    /**
     * Clear all hidden nodes (show all)
     */
    const showAllNodes = useCallback(() => {
        console.debug(`useTreeVisibility [SHOW_ALL]: Showing all hidden nodes`);

        const previouslyHidden = Array.from(hiddenNodes);

        setHiddenNodes(new Set());
        setPendingChanges(prev => ({
            show: new Set([...prev.show, ...previouslyHidden]),
            hide: new Set()
        }));

        debouncedProcess();
    }, [hiddenNodes, debouncedProcess]);

    /**
     * Check if a node is visible
     */
    const isNodeVisible = useCallback(
        (nodeId: string) => {
            return !hiddenNodes.has(nodeId);
        },
        [hiddenNodes]
    );

    /**
     * Get all visible nodes from a list
     */
    const getVisibleNodes = useCallback(
        (nodes: TreeNode[]): TreeNode[] => {
            return nodes.filter(node => isNodeVisible(node.id));
        },
        [isNodeVisible]
    );

    /**
     * Get visibility statistics
     */
    const getVisibilityStats = useCallback(() => {
        return {
            hiddenCount: hiddenNodes.size,
            pendingShowCount: pendingChanges.show.size,
            pendingHideCount: pendingChanges.hide.size,
            hasPendingChanges: pendingChanges.show.size > 0 || pendingChanges.hide.size > 0
        };
    }, [hiddenNodes.size, pendingChanges]);

    /**
     * Force send pending changes immediately
     */
    const flushPendingChanges = useCallback(() => {
        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
            debounceTimeoutRef.current = null;
        }
        processPendingChanges();
    }, [processPendingChanges]);

    /**
     * Cleanup on unmount
     */
    useEffect(() => {
        return () => {
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current);
            }
        };
    }, []);

    return {
        // State
        hiddenNodes,
        isNodeVisible,
        getVisibleNodes,
        getVisibilityStats,

        // Single node operations
        showNode,
        hideNode,
        toggleNodeVisibility,

        // Recursive operations
        showNodeRecursive,
        hideNodeRecursive,

        // Bulk operations
        bulkShowNodes,
        bulkHideNodes,
        showAllNodes,

        // API operations
        flushPendingChanges,
        sendVisibilityChanges: (data: IVisibilityChangeData) => sendVisibilityChanges(data)
    };
}
