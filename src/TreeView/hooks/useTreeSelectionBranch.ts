import { useCallback, useEffect, useState, useMemo, useRef, MouseEvent } from "react";
import { TreeNode, TreeSelectionHookProps, ITreeBranch, ITreeItem } from "../types/TreeTypes";
import { ListAttributeValue, ObjectItem, SelectionSingleValue, SelectionMultiValue } from "mendix";
import { Big } from "big.js";
import {
    isNodeSelectedInBranch,
    addNodeToBranchSelection,
    removeNodeFromBranchSelection,
    serializeBranchSelection,
    deserializeBranchSelection,
    getBranchSelectionStats
} from "../utils/branchSelection";
import { safeSetAttributeValue } from "../utils/mendixHelpers";
import { getAllDescendantIds, getAllAncestorIds } from "../utils/selectionHelpers";

interface BranchSelectionHookProps extends TreeSelectionHookProps {
    allowDeselectingAncestors?: boolean;
    allowDeselectingDescendants?: boolean;
    sortOrderAttribute: ListAttributeValue<Big>;
    getDescendantIds?: (nodeId: string) => string[];
    useSelectionAssociation?: boolean;
    nativeSelection?: SelectionSingleValue | SelectionMultiValue;
    allLoadedItemsRef?: React.MutableRefObject<Map<string, any>>;
}

const MAX_SELECTION_SIZE = 100000;
const PERFORMANCE_WARNING_THRESHOLD = 10000;

// Helper functions moved to selectionHelpers.ts for reusability

/**
 * Get sort order from attribute or calculate it
 * @param node The tree node
 * @param sortOrderAttribute Sort order attribute from Mendix
 * @param allNodes All nodes for calculation fallback
 */
function getSortOrder(
    node: TreeNode,
    sortOrderAttribute: ListAttributeValue<Big>,
    allNodes: TreeNode[]
): number | undefined {
    // First, check if node already has sortOrder cached
    if (node.sortOrder !== undefined) {
        return node.sortOrder;
    }

    // Second, get from Mendix attribute (recommended for large trees)
    const value = sortOrderAttribute.get(node.objectItem).value;
    if (value) {
        const sortOrder = Number(value.toString());
        // Cache it on the node for future use
        node.sortOrder = sortOrder;
        return sortOrder;
    }

    // Finally, calculate it (expensive operation - only for small trees)
    // For large trees with partial visibility, this may not work well
    // as allNodes might not contain all tree nodes due to memory constraints
    if (allNodes.length === 0) {
        console.warn("Cannot calculate sortOrder: no nodes available");
        return undefined;
    }

    const calculatedOrder = calculateSortOrder(node, allNodes);
    // Cache the calculated value
    if (calculatedOrder > 0) {
        node.sortOrder = calculatedOrder;
    }
    return calculatedOrder;
}

/**
 * Calculate the sort order (line number) of a node in the fully expanded tree
 * This represents the absolute position as if all nodes were expanded
 *
 * WARNING: This is a fallback calculation that requires all nodes in memory.
 * For large trees (>1000 nodes), use server-side calculation via sortOrderAttribute.
 */
function calculateSortOrder(targetNode: TreeNode, allNodes: TreeNode[]): number {
    // Performance guard for large datasets
    if (allNodes.length > 1000) {
        console.warn(
            `Calculating sortOrder for ${allNodes.length} nodes may impact performance. ` +
                `Consider using server-side sortOrderAttribute for large trees.`
        );
    }

    let sortOrder = 0;
    const visited = new Set<string>();

    // Build a tree structure for traversal
    const nodeMap = new Map<string, TreeNode>();
    const rootNodes: TreeNode[] = [];

    allNodes.forEach(node => {
        nodeMap.set(node.id, node);
        if (!node.parentId) {
            rootNodes.push(node);
        }
    });

    // Traverse tree in display order (all nodes, not just expanded)
    const traverse = (nodes: TreeNode[]): boolean => {
        for (const node of nodes) {
            if (visited.has(node.id)) {
                continue;
            }
            visited.add(node.id);

            sortOrder++;

            if (node.id === targetNode.id) {
                return true; // Found target
            }

            // ALWAYS visit children to count all nodes in fully expanded tree
            // This gives us absolute position regardless of expansion state
            if (node.children.length > 0) {
                if (traverse(node.children)) {
                    return true;
                }
            }
        }
        return false;
    };

    traverse(rootNodes);
    return sortOrder;
}

/**
 * Tree selection hook with efficient branch-based selection model
 * Stores selection as branches with deselected exceptions for optimal memory usage
 */
export function useTreeSelectionBranch(props: BranchSelectionHookProps) {
    const { allowDeselectingAncestors = false, allowDeselectingDescendants = false, sortOrderAttribute } = props;

    // Track previous attribute values to prevent infinite loops
    const prevSelectionOutputRef = useRef<string>("");

    // Branch selection state for multiple selection
    const [branches, setBranches] = useState<ITreeBranch[]>([]);

    // Single selection state
    const [singleSelection, setSingleSelection] = useState<ITreeItem | null>(null);

    // UI state
    const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
    const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);

    // Performance tracking
    const [lastOperationTime, setLastOperationTime] = useState(0);

    /**
     * Get selected node IDs for UI rendering
     * This is computed from branches when needed
     */
    const selectedNodes = useMemo(() => {
        const startTime = performance.now();
        const selected = new Set<string>();

        if (props.selectionMode === "single" && singleSelection) {
            selected.add(singleSelection.treeItemId);
        } else if (props.selectionMode !== "none" && props.selectionMode !== "single") {
            // Evaluate each node against branches for multi/branch/path modes
            let nodesEvaluated = 0;

            for (const [nodeId, node] of props.nodeMap) {
                if (node.structureId && isNodeSelectedInBranch(node.structureId, branches)) {
                    selected.add(nodeId);
                }

                nodesEvaluated++;
                // Performance warning for large evaluations
                if (nodesEvaluated > PERFORMANCE_WARNING_THRESHOLD && nodesEvaluated % 1000 === 0) {
                    const elapsed = performance.now() - startTime;
                    if (elapsed > 100) {
                        console.warn(
                            `Branch selection evaluation taking long: ${nodesEvaluated} nodes in ${elapsed}ms`
                        );
                    }
                }
            }
        }

        const elapsed = performance.now() - startTime;
        setLastOperationTime(elapsed);

        return selected;
    }, [props.selectionMode, props.nodeMap, singleSelection, branches]);

    /**
     * Load initial selection from attribute
     */
    useEffect(() => {
        if (
            !props.serverSideSelectionsJSONAttribute ||
            props.serverSideSelectionsJSONAttribute.status !== "available"
        ) {
            return;
        }

        const value = props.serverSideSelectionsJSONAttribute.value;
        if (!value || value.trim() === "") {
            return;
        }

        // Prevent infinite loop: only process if value actually changed
        if (value === prevSelectionOutputRef.current) {
            return;
        }
        prevSelectionOutputRef.current = value;

        try {
            const parsed = JSON.parse(value);

            // Always expect an array
            if (!Array.isArray(parsed)) {
                console.warn("TreeView: serverSideSelectionsJSON should always be an array. Got:", typeof parsed);
                return;
            }

            if (props.selectionMode === "single") {
                // Single selection: take first item from array
                if (parsed.length > 0) {
                    const item = parsed[0] as ITreeItem;
                    if (item && item.structureId && item.treeItemId) {
                        setSingleSelection(item);
                        setFocusedNodeId(item.treeItemId);
                    }
                }
            } else if (props.selectionMode === "multi") {
                // Multi selection: array of individual nodes (convert to branches)
                const branches: ITreeBranch[] = parsed.map((item: ITreeItem) => ({
                    branchSelection: item.structureId,
                    deselectedAncestors: [],
                    deselectedDescendants: []
                }));
                setBranches(branches);
            } else if (props.selectionMode === "branch" || props.selectionMode === "path") {
                // Branch/Path selection: array of branches with deselection info
                // Use deserializeBranchSelection for proper validation
                const branches = deserializeBranchSelection(JSON.stringify(parsed));
                setBranches(branches);
            }
        } catch (error) {
            console.error("Failed to load selection from attribute:", error);
        }
    }, [props.serverSideSelectionsJSONAttribute, props.selectionMode]);

    /**
     * Save selection to attribute and update native selection
     */
    useEffect(() => {
        // Update string-based selection output
        if (props.serverSideSelectionsJSONAttribute && props.serverSideSelectionsJSONAttribute.status === "available") {
            let output = "";

            if (props.selectionMode === "single" && singleSelection) {
                // Single selection: array with one item
                output = JSON.stringify([singleSelection]);
            } else if (props.selectionMode === "multi") {
                // Multi selection: convert branches back to simple items if no deselections
                const items: ITreeItem[] = [];
                for (const branch of branches) {
                    // If branch has no deselections, it's a single node
                    if (branch.deselectedAncestors.length === 0 && branch.deselectedDescendants.length === 0) {
                        // Find node by structure ID
                        for (const [nodeId, node] of props.nodeMap) {
                            if (node.structureId === branch.branchSelection) {
                                items.push({
                                    structureId: branch.branchSelection,
                                    treeItemId: nodeId,
                                    level: node.level,
                                    sortOrder: node.sortOrder
                                });
                                break;
                            }
                        }
                    }
                }
                output = JSON.stringify(items);
            } else if (props.selectionMode === "branch" || props.selectionMode === "path") {
                // Branch/Path selection: array of branches
                output = serializeBranchSelection(branches);
            }

            // Only update if value actually changed to prevent infinite loops
            if (output !== prevSelectionOutputRef.current) {
                prevSelectionOutputRef.current = output;
                safeSetAttributeValue(
                    props.serverSideSelectionsJSONAttribute,
                    output,
                    "serverSideSelectionsJSONAttribute"
                );
            }
        }

        // Update native selection if enabled
        if (props.useSelectionAssociation && props.nativeSelection) {
            const selectedObjectItems: ObjectItem[] = [];

            // Collect selected ObjectItems based on selection mode
            if (props.selectionMode === "single" && singleSelection) {
                const node = props.nodeMap.get(singleSelection.treeItemId);
                if (node?.objectItem) {
                    selectedObjectItems.push(node.objectItem);
                }
            } else if (props.selectionMode !== "none") {
                // For multi/branch/path modes, get all selected nodes
                selectedNodes.forEach(nodeId => {
                    const node = props.nodeMap.get(nodeId);
                    if (node?.objectItem) {
                        selectedObjectItems.push(node.objectItem);
                    }
                });
            }

            // Detect native selection type to handle misconfigurations
            const isNativeSingle =
                (props.nativeSelection as any).multiple === false ||
                props.nativeSelection.constructor?.name === "SelectionSingleValue";
            const isNativeMulti =
                (props.nativeSelection as any).multiple === true ||
                props.nativeSelection.constructor?.name === "SelectionMultiValue";

            // Validate selection mode compatibility
            const isMisconfigured =
                (props.selectionMode === "single" && isNativeMulti) ||
                (props.selectionMode !== "single" && props.selectionMode !== "none" && isNativeSingle);

            if (isMisconfigured) {
                console.warn(
                    `TreeView [CONFIGURATION]: Selection mode mismatch detected. ` +
                        `Widget selection mode is "${props.selectionMode}" but native selection is "${
                            isNativeSingle ? "Single" : "Multi"
                        }". ` +
                        `Using native selection type as primary.`
                );
            }

            // Update native selection based on its actual type (not widget selection mode)
            try {
                // Debug logging for selection update
                console.debug("useTreeSelectionBranch [SELECTION]: Updating native selection", {
                    selectionMode: props.selectionMode,
                    selectedItemsCount: selectedObjectItems.length,
                    isNativeSingle,
                    isNativeMulti,
                    isMisconfigured,
                    nativeSelectionType: props.nativeSelection.constructor?.name,
                    useSelectionAssociation: props.useSelectionAssociation
                });

                if (isNativeSingle) {
                    // Native selection expects single value - use first selected item only
                    const singleItem = selectedObjectItems[0] || undefined;
                    console.debug("useTreeSelectionBranch [NATIVE_SINGLE]: Setting single selection", singleItem);
                    (props.nativeSelection as SelectionSingleValue).setSelection(singleItem);
                } else if (isNativeMulti) {
                    // Native selection expects array - provide all selected items
                    const multiItems = Array.isArray(selectedObjectItems) ? selectedObjectItems : [];
                    console.debug(
                        "useTreeSelectionBranch [NATIVE_MULTI]: Setting multi selection",
                        multiItems.length,
                        "items"
                    );
                    (props.nativeSelection as SelectionMultiValue).setSelection(multiItems);
                } else {
                    console.warn("useTreeSelectionBranch [WARNING]: Cannot determine native selection type");
                }
            } catch (error) {
                console.error("useTreeSelectionBranch [ERROR]: Failed to update native selection:", error);
                // Enhanced debugging for selection conflicts
                console.debug("Selection configuration debug:", {
                    selectionMode: props.selectionMode,
                    selectedItemsCount: selectedObjectItems.length,
                    nativeSelectionType: props.nativeSelection.constructor?.name,
                    nativeSelectionProperties: Object.getOwnPropertyNames(props.nativeSelection),
                    isNativeSingle,
                    isNativeMulti,
                    isMisconfigured,
                    selectedItems: selectedObjectItems.map(item => ({
                        id: item.id,
                        className: item.constructor?.name
                    }))
                });
            }
        }

        // Execute selection change action
        if (props.onSelectionChange && props.onSelectionChange.canExecute) {
            props.onSelectionChange.execute();
        }
    }, [singleSelection, branches, selectedNodes, props]);

    /**
     * Check if a specific node is selected (optimized)
     */
    const isNodeSelected = useCallback(
        (nodeId: string): boolean => {
            if (props.selectionMode === "none") {
                return false;
            }

            if (props.selectionMode === "single") {
                return singleSelection?.treeItemId === nodeId;
            }

            const node = props.nodeMap.get(nodeId);
            if (!node?.structureId) {
                return false;
            }

            return isNodeSelectedInBranch(node.structureId, branches);
        },
        [props.selectionMode, props.nodeMap, singleSelection, branches]
    );

    /**
     * Handle selection based on mode and modifiers
     */
    const handleSelectionByMode = useCallback(
        (node: TreeNode, action: "toggle" | "select" | "deselect", isCtrlCmd = false) => {
            if (!node.structureId) {
                return;
            }

            switch (props.selectionMode) {
                case "multi":
                    // Standard multi-select - only the clicked node
                    if (action === "toggle") {
                        const isSelected = isNodeSelectedInBranch(node.structureId, branches);
                        if (isSelected) {
                            setBranches(
                                removeNodeFromBranchSelection(
                                    node,
                                    branches,
                                    allowDeselectingAncestors,
                                    allowDeselectingDescendants
                                )
                            );
                        } else {
                            setBranches(
                                addNodeToBranchSelection(
                                    node,
                                    branches,
                                    allowDeselectingAncestors,
                                    allowDeselectingDescendants
                                )
                            );
                        }
                    } else if (action === "select") {
                        setBranches(
                            addNodeToBranchSelection(
                                node,
                                branches,
                                allowDeselectingAncestors,
                                allowDeselectingDescendants
                            )
                        );
                    } else {
                        setBranches(
                            removeNodeFromBranchSelection(
                                node,
                                branches,
                                allowDeselectingAncestors,
                                allowDeselectingDescendants
                            )
                        );
                    }
                    break;

                case "branch":
                    // Branch selection - node + all descendants
                    const descendants = getAllDescendantIds(node, props.nodeMap, props.allLoadedItemsRef);
                    const branchNodes = [node, ...descendants.map(id => props.nodeMap.get(id)!).filter(Boolean)];

                    if (action === "toggle" && isCtrlCmd) {
                        // Smart toggle for branch mode
                        const allSelected = branchNodes.every(
                            n => n.structureId && isNodeSelectedInBranch(n.structureId, branches)
                        );
                        if (allSelected) {
                            // Deselect entire branch
                            let newBranches = branches;
                            branchNodes.forEach(n => {
                                if (n.structureId) {
                                    newBranches = removeNodeFromBranchSelection(n, newBranches, true, true);
                                }
                            });
                            setBranches(newBranches);
                        } else {
                            // Select entire branch
                            let newBranches = branches;
                            branchNodes.forEach(n => {
                                if (n.structureId) {
                                    newBranches = addNodeToBranchSelection(n, newBranches, true, true);
                                }
                            });
                            setBranches(newBranches);
                        }
                    } else if (action === "select") {
                        // Select entire branch
                        let newBranches = isCtrlCmd ? branches : [];
                        branchNodes.forEach(n => {
                            if (n.structureId) {
                                newBranches = addNodeToBranchSelection(n, newBranches, true, true);
                            }
                        });
                        setBranches(newBranches);
                    }
                    break;

                case "path":
                    // Path selection - node + all ancestors
                    const ancestors = getAllAncestorIds(node, props.nodeMap, props.allLoadedItemsRef);
                    const pathNodes = [...ancestors.map(id => props.nodeMap.get(id)!).filter(Boolean), node];

                    if (action === "toggle" && isCtrlCmd) {
                        // Toggle entire path
                        const pathSelected = pathNodes.every(
                            n => n.structureId && isNodeSelectedInBranch(n.structureId, branches)
                        );
                        if (pathSelected) {
                            // Check if we can deselect this path (no other selected nodes depend on these ancestors)
                            let canDeselect = true;
                            for (const ancestor of ancestors) {
                                // Check if any other selected node needs this ancestor
                                for (const [selectedId, selectedNode] of props.nodeMap) {
                                    if (
                                        selectedId !== node.id &&
                                        selectedNode.structureId &&
                                        isNodeSelectedInBranch(selectedNode.structureId, branches)
                                    ) {
                                        const selectedAncestors = getAllAncestorIds(
                                            selectedNode,
                                            props.nodeMap,
                                            props.allLoadedItemsRef
                                        );
                                        if (selectedAncestors.includes(ancestor)) {
                                            canDeselect = false;
                                            break;
                                        }
                                    }
                                }
                                if (!canDeselect) {
                                    break;
                                }
                            }

                            if (canDeselect) {
                                let newBranches = branches;
                                pathNodes.forEach(n => {
                                    if (n.structureId) {
                                        newBranches = removeNodeFromBranchSelection(n, newBranches, false, true);
                                    }
                                });
                                setBranches(newBranches);
                            }
                        } else {
                            // Select entire path
                            let newBranches = branches;
                            pathNodes.forEach(n => {
                                if (n.structureId) {
                                    newBranches = addNodeToBranchSelection(n, newBranches, false, true);
                                }
                            });
                            setBranches(newBranches);
                        }
                    } else if (action === "select") {
                        // Select entire path
                        let newBranches = isCtrlCmd ? branches : [];
                        pathNodes.forEach(n => {
                            if (n.structureId) {
                                newBranches = addNodeToBranchSelection(n, newBranches, false, true);
                            }
                        });
                        setBranches(newBranches);
                    }
                    break;
            }
        },
        [props.selectionMode, props.nodeMap, branches, allowDeselectingAncestors, allowDeselectingDescendants]
    );

    /**
     * Toggle node selection
     */
    const toggleSelection = useCallback(
        (nodeId: string, isCtrlCmd = false) => {
            if (props.selectionMode === "none") {
                return;
            }

            const node = props.nodeMap.get(nodeId);
            if (!node) {
                return;
            }

            const startTime = performance.now();

            if (props.selectionMode === "single") {
                // Single selection - toggle between selected and deselected
                if (singleSelection?.treeItemId === nodeId) {
                    setSingleSelection(null);
                } else {
                    const item: ITreeItem = {
                        structureId: node.structureId || "",
                        treeItemId: node.id,
                        level: node.level,
                        sortOrder: getSortOrder(node, sortOrderAttribute, props.nodes)
                    };
                    setSingleSelection(item);
                }
            } else {
                // Use the new mode-aware handler for multi/branch/path modes
                handleSelectionByMode(node, "toggle", isCtrlCmd);
            }

            const elapsed = performance.now() - startTime;
            setLastOperationTime(elapsed);
            setLastSelectedId(nodeId);
        },
        [props.selectionMode, props.nodeMap, singleSelection, sortOrderAttribute, props.nodes, handleSelectionByMode]
    );

    /**
     * Select a single node (clear others)
     */
    const selectNode = useCallback(
        (nodeId: string, isCtrlCmd = false) => {
            if (props.selectionMode === "none") {
                return;
            }

            const node = props.nodeMap.get(nodeId);
            if (!node) {
                return;
            }

            if (props.selectionMode === "single") {
                const item: ITreeItem = {
                    structureId: node.structureId || "",
                    treeItemId: node.id,
                    level: node.level,
                    sortOrder: getSortOrder(node, sortOrderAttribute, props.nodes)
                };
                setSingleSelection(item);
            } else {
                // Use the new mode-aware handler for multi/branch/path modes
                handleSelectionByMode(node, "select", isCtrlCmd);
            }

            setLastSelectedId(nodeId);
            setFocusedNodeId(nodeId);
        },
        [props.selectionMode, props.nodeMap, sortOrderAttribute, props.nodes, handleSelectionByMode]
    );

    /**
     * Clear all selections
     */
    const clearSelection = useCallback(() => {
        setSingleSelection(null);
        setBranches([]);
        setLastSelectedId(null);
    }, []);

    /**
     * Select all nodes efficiently
     */
    const selectAll = useCallback(() => {
        if (props.selectionMode !== "multi" && props.selectionMode !== "branch") {
            return;
        }

        const startTime = performance.now();

        // Create branches for all root nodes
        const rootNodes = props.nodes.filter(node => !node.parentId && node.structureId);
        const allBranches: ITreeBranch[] = rootNodes.map(node => ({
            branchSelection: node.structureId!,
            deselectedAncestors: [],
            deselectedDescendants: []
        }));

        setBranches(allBranches);

        const elapsed = performance.now() - startTime;
        setLastOperationTime(elapsed);
    }, [props.selectionMode, props.nodes]);

    /**
     * Select range of nodes
     */
    const selectRange = useCallback(
        (fromId: string, toId: string) => {
            if (props.selectionMode !== "multi") {
                return;
            }

            const startTime = performance.now();

            // Build visible nodes list considering expansion state
            const visibleNodes: TreeNode[] = [];
            const collectVisible = (nodes: TreeNode[]) => {
                for (const node of nodes) {
                    visibleNodes.push(node);
                    if (node.isExpanded && node.children.length > 0) {
                        collectVisible(node.children);
                    }
                }
            };

            const rootNodes = props.nodes.filter(node => !node.parentId);
            collectVisible(rootNodes);

            // Find range bounds
            const fromIndex = visibleNodes.findIndex(n => n.id === fromId);
            const toIndex = visibleNodes.findIndex(n => n.id === toId);

            if (fromIndex === -1 || toIndex === -1) {
                return;
            }

            const startIndex = Math.min(fromIndex, toIndex);
            const endIndex = Math.max(fromIndex, toIndex);
            const rangeNodes = visibleNodes.slice(startIndex, endIndex + 1);

            // Build optimal branches for the range
            const rangeBranches: ITreeBranch[] = [];
            const processedIds = new Set<string>();

            for (const node of rangeNodes) {
                if (!node.structureId || processedIds.has(node.id)) {
                    continue;
                }

                // Check if this node and all its visible descendants in range form a complete branch
                const visibleDescendantsInRange = rangeNodes.filter(
                    n =>
                        n.structureId &&
                        node.structureId &&
                        n.structureId.startsWith(node.structureId) &&
                        n.id !== node.id
                );

                const allVisibleDescendants = node.children.filter(
                    child => node.isExpanded && visibleNodes.includes(child)
                );

                if (visibleDescendantsInRange.length === allVisibleDescendants.length) {
                    // Complete branch
                    rangeBranches.push({
                        branchSelection: node.structureId,
                        deselectedAncestors: [],
                        deselectedDescendants: []
                    });

                    // Mark descendants as processed
                    visibleDescendantsInRange.forEach(desc => processedIds.add(desc.id));
                    processedIds.add(node.id);
                } else {
                    // Partial selection - add as individual branch
                    rangeBranches.push({
                        branchSelection: node.structureId,
                        deselectedAncestors: [],
                        deselectedDescendants: node.children
                            .filter(child => !rangeNodes.includes(child))
                            .map(child => child.structureId)
                            .filter((id): id is string => id !== undefined)
                    });
                    processedIds.add(node.id);
                }
            }

            // Merge with existing selection
            setBranches(prev => [...prev, ...rangeBranches]);

            const elapsed = performance.now() - startTime;
            setLastOperationTime(elapsed);
        },
        [props]
    );

    /**
     * Handle node selection with keyboard modifiers
     */
    const handleNodeSelection = useCallback(
        (nodeId: string, event: MouseEvent<Element>) => {
            if (props.selectionMode === "none") {
                return;
            }

            const isCtrlOrCmd = event.ctrlKey || event.metaKey;
            const isShift = event.shiftKey;

            if (props.selectionMode === "single") {
                // Single selection ignores modifiers
                selectNode(nodeId);
            } else if (props.selectionMode === "multi") {
                // Multi mode supports standard modifier behavior
                if (isCtrlOrCmd) {
                    toggleSelection(nodeId, true);
                } else if (isShift && lastSelectedId) {
                    selectRange(lastSelectedId, nodeId);
                } else {
                    selectNode(nodeId, false);
                }
            } else if (props.selectionMode === "branch" || props.selectionMode === "path") {
                // Branch and path modes
                if (isCtrlOrCmd) {
                    toggleSelection(nodeId, true);
                } else {
                    selectNode(nodeId, false);
                }
            }
        },
        [props.selectionMode, lastSelectedId, selectNode, toggleSelection, selectRange]
    );

    /**
     * Select nodes by predicate
     */
    const selectByPredicate = useCallback(
        (predicate: (node: TreeNode) => boolean) => {
            if (props.selectionMode !== "multi" && props.selectionMode !== "branch") {
                return;
            }

            const startTime = performance.now();
            const matchingNodes = props.nodes.filter(predicate);

            if (matchingNodes.length > MAX_SELECTION_SIZE) {
                console.error(`Cannot select ${matchingNodes.length} nodes. Maximum is ${MAX_SELECTION_SIZE}.`);
                return;
            }

            // Group matching nodes into optimal branches
            const newBranches: ITreeBranch[] = [];
            const processedIds = new Set<string>();

            for (const node of matchingNodes) {
                if (!node.structureId || processedIds.has(node.id)) {
                    continue;
                }

                // Check if all descendants also match
                const allDescendantsMatch = (n: TreeNode): boolean => {
                    return n.children.every(child => predicate(child) && allDescendantsMatch(child));
                };

                if (allDescendantsMatch(node)) {
                    // Create complete branch
                    newBranches.push({
                        branchSelection: node.structureId,
                        deselectedAncestors: [],
                        deselectedDescendants: []
                    });

                    // Mark all descendants as processed
                    const markProcessed = (n: TreeNode) => {
                        processedIds.add(n.id);
                        n.children.forEach(markProcessed);
                    };
                    markProcessed(node);
                }
            }

            setBranches(newBranches);

            const elapsed = performance.now() - startTime;
            setLastOperationTime(elapsed);
        },
        [props.selectionMode, props.nodes]
    );

    /**
     * Invert selection
     */
    const invertSelection = useCallback(() => {
        if (props.selectionMode !== "multi") {
            return;
        }

        const startTime = performance.now();

        // For inversion, we need to evaluate current selection
        const currentlySelected = selectedNodes;
        const newBranches: ITreeBranch[] = [];

        // Find all unselected root nodes
        const rootNodes = props.nodes.filter(node => !node.parentId);

        for (const root of rootNodes) {
            if (!root.structureId) {
                continue;
            }

            // Check if this entire subtree should be selected
            const subtreeNodes: TreeNode[] = [];
            const collectSubtree = (node: TreeNode) => {
                subtreeNodes.push(node);
                node.children.forEach(collectSubtree);
            };
            collectSubtree(root);

            const unselectedInSubtree = subtreeNodes.filter(n => !currentlySelected.has(n.id));

            if (unselectedInSubtree.length === subtreeNodes.length) {
                // Entire subtree was unselected, select it all
                newBranches.push({
                    branchSelection: root.structureId,
                    deselectedAncestors: [],
                    deselectedDescendants: []
                });
            } else if (unselectedInSubtree.length > 0) {
                // Partial selection needed
                // This is complex - for now, create individual branches
                for (const node of unselectedInSubtree) {
                    if (node.structureId) {
                        newBranches.push({
                            branchSelection: node.structureId,
                            deselectedAncestors: [],
                            deselectedDescendants: node.children
                                .map(c => c.structureId)
                                .filter((id): id is string => id !== undefined)
                        });
                    }
                }
            }
        }

        setBranches(newBranches);

        const elapsed = performance.now() - startTime;
        setLastOperationTime(elapsed);
    }, [props.selectionMode, props.nodes, selectedNodes]);

    /**
     * Get selected items
     */
    const getSelectedItems = useCallback(() => {
        return Array.from(selectedNodes)
            .map(id => props.nodeMap.get(id))
            .filter((node): node is TreeNode => node !== undefined);
    }, [selectedNodes, props.nodeMap]);

    /**
     * Get selection statistics
     */
    const getSelectionStats = useCallback(() => {
        const stats = getBranchSelectionStats({
            mode: "branch",
            branches
        });

        return {
            ...stats,
            lastOperationTime,
            selectedCount: selectedNodes.size,
            efficiency: branches.length > 0 ? Math.round((1 - branches.length / selectedNodes.size) * 100) : 0
        };
    }, [branches, selectedNodes.size, lastOperationTime]);

    /**
     * Select entire branch starting from a node
     * Selects the node and all its descendants
     */
    const selectBranch = useCallback(
        (nodeId: string) => {
            if (props.selectionMode === "single" || props.selectionMode === "none") {
                // For single selection, just select the node
                selectNode(nodeId);
                return;
            }

            const node = props.nodeMap.get(nodeId);
            if (!node || !node.structureId) {
                return;
            }

            const startTime = performance.now();

            // Create branch selection for this node
            const branch: ITreeBranch = {
                branchSelection: node.structureId,
                deselectedAncestors: [],
                deselectedDescendants: []
            };

            // Add to existing branches or replace if more efficient
            setBranches(prev => {
                // Check if this branch is already covered
                const isAlreadySelected = isNodeSelectedInBranch(node.structureId!, prev);
                if (isAlreadySelected) {
                    return prev;
                }

                // Add the new branch
                return [...prev, branch];
            });

            const elapsed = performance.now() - startTime;
            setLastOperationTime(elapsed);
            setLastSelectedId(nodeId);
            setFocusedNodeId(nodeId);
        },
        [props.selectionMode, props.nodeMap, selectNode]
    );

    /**
     * Deselect entire branch starting from a node
     * Deselects the node and all its descendants
     */
    const deselectBranch = useCallback(
        (nodeId: string) => {
            if (props.selectionMode === "single" || props.selectionMode === "none") {
                return;
            }

            const node = props.nodeMap.get(nodeId);
            if (!node || !node.structureId) {
                return;
            }

            const startTime = performance.now();

            // Remove branch selection
            setBranches(prev => {
                // If node is not selected, nothing to do
                if (!isNodeSelectedInBranch(node.structureId!, prev)) {
                    return prev;
                }

                // Use the utility to remove the branch
                return removeNodeFromBranchSelection(
                    node,
                    prev,
                    true, // Allow deselecting ancestors
                    true // Allow deselecting descendants
                );
            });

            const elapsed = performance.now() - startTime;
            setLastOperationTime(elapsed);
        },
        [props.selectionMode, props.nodeMap]
    );

    /**
     * Toggle branch selection
     * If any part of the branch is selected, deselect all
     * Otherwise, select all
     */
    const toggleBranchSelection = useCallback(
        (nodeId: string) => {
            if (props.selectionMode === "single" || props.selectionMode === "none") {
                toggleSelection(nodeId);
                return;
            }

            const node = props.nodeMap.get(nodeId);
            if (!node || !node.structureId) {
                return;
            }

            // Check if branch is selected
            const isBranchSelected = isNodeSelectedInBranch(node.structureId, branches);

            if (isBranchSelected) {
                deselectBranch(nodeId);
            } else {
                selectBranch(nodeId);
            }
        },
        [props.selectionMode, props.nodeMap, branches, selectBranch, deselectBranch, toggleSelection]
    );

    return {
        // Core state
        selectedNodes,
        focusedNodeId,
        setFocusedNodeId,
        singleSelection, // Expose for enhanced context
        setSingleSelection, // Expose for enhanced context

        // Selection operations
        toggleSelection,
        selectNode,
        clearSelection,
        selectAll,
        selectRange,
        handleNodeSelection,
        selectByPredicate,
        invertSelection,
        getSelectedItems,

        // Branch operations
        selectBranch,
        deselectBranch,
        toggleBranchSelection,

        // Branch-specific
        isNodeSelected,
        branches,
        setBranches, // Expose for enhanced context
        getSelectionStats
    };
}
