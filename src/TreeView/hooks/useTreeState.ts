import { useCallback, useReducer } from "react";
import { TreeNode, TreeStateHookProps, TreeAction } from "../types/TreeTypes";
import { safeSetAttributeValue } from "../utils/mendixHelpers";
import { getAllDescendantIds } from "../utils/selectionHelpers";

interface TreeState {
    expandedNodes: Set<string>;
    visibleNodes: Set<string>;
}

function treeReducer(state: TreeState, action: TreeAction): TreeState {
    switch (action.type) {
        case "TOGGLE_EXPANDED": {
            const nodeId = action.payload.nodeId;
            if (!nodeId) {
                return state;
            }
            const newExpanded = new Set(state.expandedNodes);

            if (newExpanded.has(nodeId)) {
                console.debug(`treeReducer [NODE][EXPANSION] Collapsing node "${nodeId}"`);
                newExpanded.delete(nodeId);
            } else {
                console.debug(`treeReducer [NODE][EXPANSION] Expanding node "${nodeId}"`);
                newExpanded.add(nodeId);
            }

            console.debug(`treeReducer [NODE][EXPANSION] Expanded nodes after toggle:`, Array.from(newExpanded));
            return { ...state, expandedNodes: newExpanded };
        }

        case "TOGGLE_VISIBILITY": {
            const nodeId = action.payload.nodeId;
            if (!nodeId) {
                return state;
            }
            const newVisible = new Set(state.visibleNodes);

            if (newVisible.has(nodeId)) {
                newVisible.delete(nodeId);
            } else {
                newVisible.add(nodeId);
            }

            return { ...state, visibleNodes: newVisible };
        }

        case "EXPAND_ALL": {
            const nodeIds = action.payload.nodeIds;
            if (!nodeIds) {
                return state;
            }
            const newExpanded = new Set(state.expandedNodes);
            nodeIds.forEach(id => newExpanded.add(id));
            return { ...state, expandedNodes: newExpanded };
        }

        case "COLLAPSE_ALL": {
            return { ...state, expandedNodes: new Set() };
        }

        case "EXPAND_TO_LEVEL": {
            const level = action.payload.level;
            const nodes = action.payload.nodes as TreeNode[];
            if (level === undefined || !nodes) {
                return state;
            }
            const newExpanded = new Set<string>();

            const expandToLevel = (node: TreeNode, currentLevel: number) => {
                if (currentLevel < level && !node.isLeaf) {
                    newExpanded.add(node.id);
                    node.children.forEach(child => expandToLevel(child, currentLevel + 1));
                }
            };

            nodes.forEach((node: TreeNode) => expandToLevel(node, 0));
            return { ...state, expandedNodes: newExpanded };
        }

        default:
            return state;
    }
}

export function useTreeState(props: TreeStateHookProps) {
    // Use lazy initialization to prevent re-running on every render
    const [state, dispatch] = useReducer(treeReducer, props, initProps => {
        const initialState: TreeState = {
            expandedNodes: new Set(),
            visibleNodes: new Set()
        };

        // Initialize expanded and visible states from attributes
        initProps.nodes.forEach(node => {
            // Note: expandedAttribute removed from XML - expanded state managed via state API

            if (initProps.visibilityAttribute) {
                const isVisible = initProps.visibilityAttribute.get(node.objectItem).value;
                // Only log during initial creation, not on every render
                if (isVisible !== false) {
                    // Default to visible
                    initialState.visibleNodes.add(node.id);
                }
            } else {
                // If no visibility attribute, all nodes are visible
                initialState.visibleNodes.add(node.id);
            }
        });

        console.debug(
            `useTreeState [INIT] Initialized with ${initialState.expandedNodes.size} expanded nodes and ${initialState.visibleNodes.size} visible nodes`
        );
        return initialState;
    });
    // Toggle node expansion
    const toggleExpanded = useCallback(
        (nodeId: string) => {
            console.debug(`useTreeState [NODE][EXPANSION] toggleExpanded called for node "${nodeId}"`);
            const node = props.nodeMap.get(nodeId);
            if (!node) {
                console.debug(`useTreeState [NODE][EXPANSION] Node "${nodeId}" not found in nodeMap`);
                return;
            }

            // Note: expandedAttribute removed from XML - expanded state managed via state API

            // Handle expand mode
            if (props.expandMode === "single") {
                // Collapse siblings when expanding
                const isExpanding = !state.expandedNodes.has(nodeId);
                if (isExpanding && node.parentId) {
                    const parent = props.nodeMap.get(node.parentId);
                    if (parent) {
                        parent.children.forEach(sibling => {
                            if (sibling.id !== nodeId && state.expandedNodes.has(sibling.id)) {
                                dispatch({
                                    type: "TOGGLE_EXPANDED",
                                    payload: { nodeId: sibling.id },
                                    timestamp: Date.now()
                                });
                                // Note: expandedAttribute removed from XML - expanded state managed via state API
                            }
                        });
                    }
                }
            }

            console.debug(`useTreeState [NODE][EXPANSION] Dispatching TOGGLE_EXPANDED for node "${nodeId}"`);
            dispatch({
                type: "TOGGLE_EXPANDED",
                payload: { nodeId },
                timestamp: Date.now()
            });
        },
        [props, state.expandedNodes, dispatch]
    );

    // Toggle node visibility
    const toggleVisibility = useCallback(
        (nodeId: string) => {
            const node = props.nodeMap.get(nodeId);
            if (!node) {
                return;
            }

            // Get all descendant IDs including the node itself
            const descendantIds = getAllDescendantIds(node, props.nodeMap);
            const affectedIds = [node.id, ...descendantIds];
            const isVisible = state.visibleNodes.has(nodeId);

            // Update visibility for node and all descendants
            affectedIds.forEach(id => {
                const affectedNode = props.nodeMap.get(id);
                if (affectedNode && props.visibilityAttribute) {
                    const editableValue = props.visibilityAttribute.get(affectedNode.objectItem);
                    safeSetAttributeValue(editableValue, !isVisible, "visibilityAttribute");
                }
            });

            // Update state for all affected nodes
            affectedIds.forEach(id => {
                dispatch({
                    type: "TOGGLE_VISIBILITY",
                    payload: { nodeId: id },
                    timestamp: Date.now()
                });
            });

            // Execute visibility change action
            if (props.onVisibilityChange && props.onVisibilityChange.canExecute) {
                props.onVisibilityChange.execute();
            }
        },
        [props, state.visibleNodes, dispatch]
    );

    // Expand all nodes
    const expandAll = useCallback(() => {
        const allExpandableIds = props.nodes.filter(node => !node.isLeaf).map(node => node.id);

        dispatch({
            type: "EXPAND_ALL",
            payload: { nodeIds: allExpandableIds },
            timestamp: Date.now()
        });

        // Note: expandedAttribute removed from XML - expanded state managed via state API
    }, [props, dispatch]);

    // Collapse all nodes
    const collapseAll = useCallback(() => {
        dispatch({
            type: "COLLAPSE_ALL",
            payload: {},
            timestamp: Date.now()
        });

        // Note: expandedAttribute removed from XML - expanded state managed via state API
    }, [props, dispatch]);

    // Expand to specific level
    const expandToLevel = useCallback(
        (level: number) => {
            // Get root nodes
            const rootNodes = props.nodes.filter(node => !node.parentId);

            dispatch({
                type: "EXPAND_TO_LEVEL",
                payload: { nodes: rootNodes as unknown, level },
                timestamp: Date.now()
            });
        },
        [props.nodes, dispatch]
    );

    // Set visibility for specific node
    const setNodeVisibility = useCallback(
        (nodeId: string, visible: boolean) => {
            const node = props.nodeMap.get(nodeId);
            if (!node) {
                return;
            }

            if (props.visibilityAttribute) {
                const editableValue = props.visibilityAttribute.get(node.objectItem);
                safeSetAttributeValue(editableValue, visible, "visibilityAttribute");
            }

            if ((visible && !state.visibleNodes.has(nodeId)) || (!visible && state.visibleNodes.has(nodeId))) {
                dispatch({
                    type: "TOGGLE_VISIBILITY",
                    payload: { nodeId },
                    timestamp: Date.now()
                });
            }
        },
        [props, state.visibleNodes, dispatch]
    );

    /**
     * Expand branch - expand a node and all its descendants
     */
    const expandBranch = useCallback(
        (nodeId: string) => {
            const node = props.nodeMap.get(nodeId);
            if (!node) {
                return;
            }

            const nodesToExpand: string[] = [nodeId];

            // Get all descendant IDs
            if (props.getDescendantIds) {
                const descendantIds = props.getDescendantIds(nodeId);
                nodesToExpand.push(...descendantIds);
            } else {
                // Fallback: traverse tree manually
                const collectDescendants = (n: TreeNode) => {
                    n.children.forEach(child => {
                        nodesToExpand.push(child.id);
                        collectDescendants(child);
                    });
                };
                collectDescendants(node);
            }

            // Filter to only include nodes that can be expanded (not leaves)
            const expandableNodes = nodesToExpand.filter(id => {
                const n = props.nodeMap.get(id);
                return n && !n.isLeaf;
            });

            // Expand all at once
            dispatch({
                type: "EXPAND_ALL",
                payload: { nodeIds: expandableNodes },
                timestamp: Date.now()
            });

            // Note: expandedAttribute removed from XML - expanded state managed via state API
        },
        [props, dispatch]
    );

    /**
     * Collapse branch - collapse a node and all its descendants
     */
    const collapseBranch = useCallback(
        (nodeId: string) => {
            const node = props.nodeMap.get(nodeId);
            if (!node) {
                return;
            }

            const nodesToCollapse: string[] = [nodeId];

            // Get all descendant IDs
            if (props.getDescendantIds) {
                const descendantIds = props.getDescendantIds(nodeId);
                nodesToCollapse.push(...descendantIds);
            } else {
                // Fallback: traverse tree manually
                const collectDescendants = (n: TreeNode) => {
                    n.children.forEach(child => {
                        nodesToCollapse.push(child.id);
                        collectDescendants(child);
                    });
                };
                collectDescendants(node);
            }

            // Remove from expanded state
            const newExpanded = new Set(state.expandedNodes);
            nodesToCollapse.forEach(id => newExpanded.delete(id));

            // Update state
            dispatch({
                type: "EXPAND_ALL",
                payload: { nodeIds: Array.from(newExpanded) },
                timestamp: Date.now()
            });

            // Note: expandedAttribute removed from XML - expanded state managed via state API
        },
        [props, state.expandedNodes, dispatch]
    );

    /**
     * Toggle branch expansion - if any part is collapsed, expand all; otherwise collapse all
     */
    const toggleBranchExpansion = useCallback(
        (nodeId: string) => {
            const node = props.nodeMap.get(nodeId);
            if (!node || node.isLeaf) {
                return;
            }

            // Check if branch is fully expanded
            let isFullyExpanded = state.expandedNodes.has(nodeId);

            if (isFullyExpanded && props.getDescendantIds) {
                const descendantIds = props.getDescendantIds(nodeId);
                isFullyExpanded = descendantIds.every(id => {
                    const n = props.nodeMap.get(id);
                    return !n || n.isLeaf || state.expandedNodes.has(id);
                });
            }

            if (isFullyExpanded) {
                collapseBranch(nodeId);
            } else {
                expandBranch(nodeId);
            }
        },
        [props, state.expandedNodes, expandBranch, collapseBranch]
    );

    return {
        expandedNodes: state.expandedNodes,
        visibleNodes: state.visibleNodes,
        toggleExpanded,
        toggleVisibility,
        expandAll,
        collapseAll,
        expandToLevel,
        setNodeVisibility,
        // Branch operations
        expandBranch,
        collapseBranch,
        toggleBranchExpansion
    };
}
