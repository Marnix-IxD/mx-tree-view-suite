// TODO REVIEW TOMORROW - Need to import React namespace for React.MouseEvent type usage
import React, { ReactElement, createElement, useRef, useCallback, useMemo, useState, useEffect, memo } from "react";
import classNames from "classnames";
import { TreeViewContainerProps } from "../typings/TreeViewProps";
import { useBreakpoint } from "./TreeView/hooks/useBreakpoint";
import { TreeRenderMode } from "./TreeView/components/TreeViews/TreeRenderMode";
import { TreeContextMenu } from "./TreeView/components/ContextMenu/TreeContextMenu";
import { TreeDragLayer, useTreeDragLayer } from "./TreeView/components/DragDrop/TreeDragLayer";
import { useTreeDataAdapter } from "./TreeView/hooks/useTreeDataAdapter";
import { TreeSearchOverlay } from "./TreeView/components/Search/TreeSearchOverlay";
import { useTreeState } from "./TreeView/hooks/useTreeState";
import { useTreeSearch } from "./TreeView/hooks/useTreeSearch";
import { useTreeSelectionBranch } from "./TreeView/hooks/useTreeSelectionBranch";
import { useTreeKeyboard } from "./TreeView/hooks/useTreeKeyboard";
import { useTreeContextEnhanced } from "./TreeView/hooks/useTreeContextEnhanced";
import { navigateToNodeById, INavigationOptions } from "./TreeView/utils/externalNavigation";
import { useTreeAPI } from "./TreeView/hooks/useTreeAPI";
import { useStateBatcher } from "./TreeView/hooks/useStateBatcher";
import { useOfflineStatus } from "./TreeView/utils/offlineUtils";
import { calculateLevelFromStructureId } from "./TreeView/utils/levelCalculation";
import { useTreeDragDrop } from "./TreeView/hooks/useTreeDragDrop";
import { useOptimizedHover } from "./TreeView/hooks/useOptimizedHover";
import { TreeNode, ContextMenuAction } from "./TreeView/types/TreeTypes";
import { safeSetAttributeValue } from "./TreeView/utils/mendixHelpers";
import { convertSelectionToBranches } from "./TreeView/utils/branchSelection";
import { updateStructureIdsAfterMove } from "./TreeView/utils/structureIdGenerator";
import { convertFilterListToSearchFilters } from "./TreeView/utils/filterListAdapter";
import "./ui/TreeViewSuite.css";
import "./TreeView/ui/TreeView.css";
import "./TreeView/ui/TreeView.defaults.css";
import "./TreeView/ui/TreeView.utilities.css";
import "./TreeView/ui/TreeView.offline.css";
import "./TreeView/ui/TreeNode.css";
import "./TreeView/ui/Tree.css";
import "./TreeView/ui/TreeNodeHeader.css";
import "./TreeView/ui/TreeBreadcrumb.css";
import "./TreeView/ui/TreeContextMenu.css";
import "./TreeView/ui/TreeDragDrop.css";
import "./TreeView/ui/TreeSearch.css";
import "./TreeView/ui/TreeSearchOverlay.css";
import "./TreeView/ui/TreeSearchStatus.css";
import "./TreeView/ui/TreeSearchResults.css";
import "./TreeView/ui/TreeLoading.css";
import "./TreeView/ui/TreeLoadingBar.css";
import "./TreeView/ui/StandardTreeView.css";
import "./TreeView/ui/FloatingTreeView.css";
import "./TreeView/ui/SlidingPanelView.css";
import "./TreeView/ui/VirtualScrollContainer.css";

function TreeViewComponent(props: TreeViewContainerProps): ReactElement {
    // Generate a unique ID for this tree instance for debugging
    const treeInstanceId = useRef(`tree-${Math.random().toString(36).substr(2, 9)}`).current;

    const containerRef = useRef<HTMLDivElement>(null);

    // Track render count to debug excessive re-renders (only in debug mode)
    const renderCountRef = useRef(0);
    renderCountRef.current += 1;

    // Log instance lifecycle only once (only in debug mode)
    useEffect(() => {
        if (props.debugMode) {
            console.debug(`TreeView [INSTANCE] Instance ${treeInstanceId} mounted (render #${renderCountRef.current})`);
        }
        return () => {
            if (props.debugMode) {
                console.debug(`TreeView [INSTANCE] Instance ${treeInstanceId} unmounted`);
            }
        };
    }, [treeInstanceId, props.debugMode]);

    // Track breakpoint for responsive classes
    const { breakpoint, breakpointClasses } = useBreakpoint(containerRef);

    // Determine effective display mode based on breakpoint
    const effectiveDisplayMode = useMemo(() => {
        if (breakpoint === "xs" && props.displayAsXS !== "default") {
            return props.displayAsXS;
        }
        if (breakpoint === "sm" && props.displayAsSM !== "default") {
            return props.displayAsSM;
        }
        if (breakpoint === "md" && props.displayAsMD !== "default") {
            return props.displayAsMD;
        }
        return props.displayAs;
    }, [breakpoint, props.displayAs, props.displayAsXS, props.displayAsSM, props.displayAsMD]);

    const [contextMenu, setContextMenu] = useState<{
        x: number;
        y: number;
        node: TreeNode | null;
    } | null>(null);
    // Hover state will be managed by useOptimizedHover hook
    const [visualHoveredNodeId, setVisualHoveredNodeId] = useState<string | null>(null);
    const [showSearchResults, setShowSearchResults] = useState(false);

    // Check offline status
    const isOfflineStatus = useOfflineStatus();

    // Initialize tree data with adapter for legacy/mx.data support
    const {
        nodes,
        nodeMap,
        rootNodes,
        isLoading,
        isUnavailable,
        loadChildren,
        refreshNodes,
        getDescendantIds,
        getAncestorIds,
        searchNodes,
        updateVisibleNodes,
        updateSelectedNodes,
        preloadRange,
        searchResults,
        isSearching,
        isUsingMxData,
        // Memory management functions
        recordActivity,
        updateViewport,
        getMemoryStats,
        // Internal refs for advanced operations (selection, drag-drop)
        allLoadedItemsRef
    } = useTreeDataAdapter(props);

    // Debug log to check data loading (only in debug mode)
    useEffect(() => {
        if (props.debugMode) {
            console.debug("TreeView data status:", {
                datasourceStatus: props.datasource?.status,
                nodesCount: nodes.length,
                rootNodesCount: rootNodes.length,
                isLoading,
                isUnavailable,
                hasLevelAttribute: !!props.levelAttribute,
                hasSortOrderAttribute: !!props.sortOrderAttribute,
                hasNodeIdAttribute: !!props.nodeIdAttribute,
                parentRelationType: props.parentRelationType,
                hasParentIdAttribute: !!props.parentIdAttribute,
                hasParentAssociation: !!props.parentAssociation,
                hasStructureIdAttribute: !!props.structureIdAttribute
            });

            // Log first few nodes for debugging
            if (nodes.length > 0 && rootNodes.length === 0) {
                console.debug(
                    "TreeView node details (first 3):",
                    nodes.slice(0, 3).map(node => ({
                        id: node.id,
                        parentId: node.parentId,
                        level: node.level,
                        structureId: node.structureId
                    }))
                );
                console.warn(
                    "No root nodes found! Check your parent configuration. For structureId mode, use hierarchical IDs like '1', '1.1', '1.2'. For parent reference mode, use parentRelationType='attribute' with parentIdAttribute."
                );
            }
        }
    }, [
        props.datasource?.status,
        nodes.length,
        rootNodes.length,
        isLoading,
        isUnavailable,
        props.parentRelationType,
        props.levelAttribute,
        props.sortOrderAttribute,
        props.nodeIdAttribute,
        props.parentIdAttribute,
        props.parentAssociation,
        props.structureIdAttribute,
        nodes,
        props.debugMode
    ]);

    // Initialize tree state
    const { expandedNodes, visibleNodes, toggleExpanded, toggleVisibility, expandAll, collapseAll, expandToLevel } =
        useTreeState({
            nodes,
            nodeMap,
            expandMode: props.expandMode,
            enableVisibilityToggle: props.enableVisibilityToggle,
            visibilityAttribute: props.visibilityAttribute,
            onVisibilityChange: props.onVisibilityChange,
            getDescendantIds
        });

    // Convert filterList to searchFilters
    const searchFilters = useMemo(() => {
        if (props.filterList && props.filterList.length > 0) {
            return convertFilterListToSearchFilters(props.filterList);
        }
        return [];
    }, [props.filterList]);

    // Wrap toggleExpanded to track activity
    const toggleExpandedWithTracking = useCallback(
        (nodeId: string) => {
            if (recordActivity) {
                recordActivity("expand");
            }
            toggleExpanded(nodeId);
        },
        [toggleExpanded, recordActivity]
    );

    // Initialize API integration first (needed for search)
    const { sendDragDrop, sendSearch, sendBatchStateChange } = useTreeAPI({
        dragDropEndpoint: props.dragDropEndpoint,
        searchEndpoint: props.searchEndpoint,
        stateEndpoint: props.stateEndpoint
    });

    // Initialize search - hook must always be called, but behavior changes based on enableSearch
    const searchHookResult = useTreeSearch({
        nodes,
        nodeMap,
        nodeIdAttribute: props.nodeIdAttribute,
        searchFilters, // Pass the converted filters
        searchMode: props.searchMode,
        serverSearchAction: props.serverSearchAction,
        searchDebounce: props.searchDebounce,
        expandedNodes,
        toggleExpanded: toggleExpandedWithTracking,
        searchNodes:
            isUsingMxData && typeof searchNodes === "function" && searchNodes.length >= 2
                ? (query: string, _page?: number, _limit?: number) => {
                      const originalResult = searchNodes(query);
                      if (originalResult && typeof originalResult.then === "function") {
                          return originalResult;
                      }
                      return Promise.resolve({ items: [], total: 0 });
                  }
                : undefined, // Pass the search function from useTreeData
        datasource: props.datasource, // Pass datasource for entity type detection
        enabled: props.enableSearch, // Pass enabled flag to the hook
        sendSearch: props.searchEndpoint ? sendSearch : undefined // Pass the search API function
    });

    const {
        searchQuery,
        setSearchQuery,
        highlightedNodes,
        searchResults: searchResultNodes,
        isSearching: isSearchingLocal,
        clearSearch,
        searchResultsList,
        totalResultCount,
        currentPage,
        setCurrentPage,
        resultsPerPage,
        // Progressive search fields
        isLoadingServer,
        serverTimeout,
        cachedResultCount
    } = searchHookResult;

    // Initialize state batcher for batching selection/expansion/visibility changes
    const { addStateChange, addDeselectedOrphans } = useStateBatcher({
        sendBatchStateChange,
        onError: error => {
            console.error("TreeView: Failed to update node states", error);
            // TODO: Show user notification
        }
    });

    // Wrap toggleVisibility to use state batching
    const toggleVisibilityWithBatching = useCallback(
        (nodeId: string) => {
            const node = nodeMap.get(nodeId);
            if (!node) {
                return;
            }

            // Toggle visibility locally
            toggleVisibility(nodeId);

            // Send state change to API if configured
            if (props.stateEndpoint) {
                const isCurrentlyVisible = visibleNodes.has(nodeId);
                addStateChange(node, { visible: !isCurrentlyVisible });
            }
        },
        [toggleVisibility, nodeMap, props.stateEndpoint, visibleNodes, addStateChange]
    );

    // Initialize selection with branch-based model
    const {
        selectedNodes,
        focusedNodeId,
        setFocusedNodeId,
        toggleSelection,
        selectNode,
        clearSelection,
        selectAll,
        selectRange,
        handleNodeSelection,
        isNodeSelected,
        branches,
        setBranches,
        singleSelection,
        setSingleSelection,
        getSelectionStats
    } = useTreeSelectionBranch({
        nodes,
        nodeMap,
        selectionMode: props.selectionMode,
        selectionOutputType: props.selectionOutputType,
        serverSideSelectionsJSONAttribute: props.serverSideSelectionsJSONAttribute,
        onSelectionChange: props.onSelectionChange,
        allowDeselectingAncestors: props.allowDeselectingAncestors,
        allowDeselectingDescendants: props.allowDeselectingDescendants,
        sortOrderAttribute: props.sortOrderAttribute,
        getDescendantIds,
        useSelectionAssociation: props.selectionStorageMethod === "association",
        nativeSelection: props.selectionStorageMethod === "association" ? props.nativeSelection : undefined,
        allLoadedItemsRef
    });

    // Initialize keyboard navigation
    useTreeKeyboard({
        containerRef,
        nodes,
        nodeMap,
        expandedNodes,
        selectedNodes,
        focusedNodeId,
        setFocusedNodeId,
        toggleExpanded: toggleExpandedWithTracking,
        toggleSelection,
        selectNode,
        clearSelection,
        enabled: props.enableKeyboardNavigation,
        isNodeSelected,
        selectionMode: props.selectionMode,
        nodeLabelType: props.nodeLabelType,
        nodeLabelAttribute: props.nodeLabelAttribute,
        nodeLabelExpression: props.nodeLabelExpression,
        nodeLabelContent: props.nodeLabelContent
    });

    // Initialize optimized hover handling
    const {
        handleNodeHover: handleOptimizedHover,
        forceHoverUpdate,
        metrics: hoverMetrics,
        currentHoveredNode
    } = useOptimizedHover(props.hoveredNodeIdAttribute, props.hoveredStructureIdAttribute, {
        enabled: props.enableHoverServerUpdates, // Default to true
        intentDelay: props.hoverIntentDelay || 150,
        rapidMovementThreshold: props.hoverVelocityThreshold || 500,
        trackVelocity: props.hoverVelocityThreshold !== 0, // 0 disables velocity tracking
        debugMode: props.debugMode
    });

    // Initialize drag & drop
    const {
        draggedNodes,
        draggedOver,
        dropPosition,
        handleDragStart: handleDragStartBase,
        handleDragOver: handleDragOverBase,
        handleDragLeave,
        handleDrop: handleDropBase,
        handleDragEnd: handleDragEndBase
    } = useTreeDragDrop(
        nodeMap,
        expandedNodes,
        (nodeId: string) => toggleExpandedWithTracking(nodeId),
        {
            enabled: props.enableDragDrop,
            patterns: props.dragPatterns ? JSON.parse(props.dragPatterns) : [],
            constraints: {
                maxChildren: props.dragMaxChildren || 0,
                maxDepth: props.dragMaxDepth || 0
            },
            onDropComplete: async (changes, _requestId) => {
                // Apply structure ID changes to the tree data
                if (changes.length === 0) {
                    return;
                }

                // Build a children map for the updateStructureIdsAfterMove function
                const childrenMap = new Map<string, string[]>();
                nodeMap.forEach((node, nodeId) => {
                    if (node.children.length > 0) {
                        childrenMap.set(
                            nodeId,
                            node.children.map((child: TreeNode) => child.id)
                        );
                    }
                });

                // Build current structure IDs map
                const structureIds = new Map<string, string>();
                nodeMap.forEach((node, nodeId) => {
                    if (node.structureId) {
                        structureIds.set(nodeId, node.structureId);
                    }
                });

                // Process each change using the utility function
                changes.forEach(change => {
                    if (change.newParentId !== change.oldParentId || change.newIndex !== change.oldIndex) {
                        const updatedIds = updateStructureIdsAfterMove(
                            change.nodeId,
                            change.newParentId,
                            change.newIndex,
                            structureIds,
                            childrenMap
                        );

                        // Update the structureIds map with the new values
                        updatedIds.forEach((structureId, nodeId) => {
                            structureIds.set(nodeId, structureId);
                        });
                    }
                });

                // Apply the updated structure IDs to the actual nodes
                if (props.structureIdAttribute) {
                    // Update Mendix attributes if structure ID attribute is configured
                    structureIds.forEach((structureId, nodeId) => {
                        const node = nodeMap.get(nodeId);
                        if (node?.objectItem && props.structureIdAttribute) {
                            const editableValue = props.structureIdAttribute.get(node.objectItem);
                            safeSetAttributeValue(editableValue, structureId, "structureIdAttribute");
                        }
                    });
                }

                // Send drag drop changes to server if endpoint is configured
                if (props.dragDropEndpoint) {
                    try {
                        // Convert StructureChange to DragDropInfo format
                        const dragDropInfos = changes.map(change => {
                            // Calculate level from new structure ID, considering the convention used
                            const level = calculateLevelFromStructureId(change.newStructureId, nodeMap);

                            return {
                                oldParentID: change.oldParentId || "",
                                newParentID: change.newParentId || "",
                                oldIndex: change.oldIndex,
                                newIndex: change.newIndex,
                                level,
                                treeItemId: change.nodeId,
                                structureId: change.newStructureId
                            };
                        });

                        const response = await sendDragDrop(dragDropInfos);
                        if (!response.success) {
                            console.error("Drag & drop operation failed:", response.error);
                            // Rollback changes if server rejected them
                            refreshNodes();
                        }
                    } catch (error) {
                        console.error("Failed to send drag & drop changes:", error);
                        // Rollback on network error
                        refreshNodes();
                    }
                }
            }
        },
        getDescendantIds
    );

    // Initialize drag layer for visual feedback
    const { dragState, dropIndicator, updateDragPosition, startDrag, endDrag, updateDropIndicator } =
        useTreeDragLayer();

    // Create context actions
    const setSelectedNodesContext = useCallback(
        (partIds: string[]) => {
            // Update internal selection state based on external changes
            selectedNodes.forEach(id => {
                if (!partIds.includes(id)) {
                    toggleSelection(id);
                }
            });
            partIds.forEach(id => {
                if (!selectedNodes.has(id)) {
                    toggleSelection(id);
                }
            });
        },
        [selectedNodes, toggleSelection]
    );

    const setFocusedNodeContext = useCallback(
        (partId: string | null, _structureId: string | null) => {
            // Only set focused node if we're clearing focus or if the node exists in this tree
            // This prevents ping-ponging between multiple tree instances
            if (!partId || nodeMap.has(partId)) {
                console.debug(`TreeView [NODE][FOCUS] Instance ${treeInstanceId} setting focus to node "${partId}"`);
                setFocusedNodeId(partId);
            } else {
                console.debug(
                    `TreeView [NODE][FOCUS] Instance ${treeInstanceId} ignoring focus change to node "${partId}" - node not found in this tree`
                );
            }
        },
        [setFocusedNodeId, nodeMap, treeInstanceId, props.debugMode]
    );

    const setHoveredNodeContext = useCallback(
        (partId: string | null) => {
            // Force immediate hover update when changed externally
            const node = partId ? nodeMap.get(partId) : null;
            forceHoverUpdate(partId, node?.structureId || null);
            setVisualHoveredNodeId(partId);
        },
        [forceHoverUpdate, nodeMap]
    );

    // Navigation functions for external navigation integration
    const navigateToNode = useCallback(
        async (nodeId: string): Promise<void> => {
            const options: INavigationOptions = {
                selectNode: true,
                expandAncestors: true,
                scrollIntoView: true,
                highlightNode: true,
                highlightDuration: 1000
            };

            try {
                const result = await navigateToNodeById(nodeId, nodeMap, expandedNodes, options, {
                    toggleExpanded: (id: string) => toggleExpanded(id),
                    selectNode: (id: string) => selectNode(id),
                    setFocusedNodeId: (id: string) => setFocusedNodeId(id),
                    scrollToNode: (id: string) => {
                        // TODO: Implement scroll to node functionality
                        console.debug(`Scroll to node ${id} requested`);
                    }
                });

                if (!result.success) {
                    console.debug(`[TreeView][NavigateToNode] Navigation failed: ${result.error}`);
                }
            } catch (error) {
                console.error("[TreeView][NavigateToNode] Navigation error:", error);
            }
        },
        [nodeMap, expandedNodes, toggleExpanded, setFocusedNodeId, selectNode]
    );

    const expandPathToNode = useCallback(
        async (nodeId: string): Promise<void> => {
            const options: INavigationOptions = {
                selectNode: false,
                expandAncestors: true,
                scrollIntoView: false,
                highlightNode: false
            };

            try {
                await navigateToNodeById(nodeId, nodeMap, expandedNodes, options, {
                    toggleExpanded: (id: string) => toggleExpanded(id)
                    // No focus, selection, or scroll for expand-only
                });
            } catch (error) {
                console.error("[TreeView][ExpandPathToNode] Expansion error:", error);
            }
        },
        [nodeMap, expandedNodes, toggleExpanded]
    );

    // Initialize context synchronization with enhanced features
    useTreeContextEnhanced(
        {
            selectedPartIdAttribute: props.selectedNodeIdAttribute,
            selectedStructureIdAttribute: props.selectedStructureIdAttribute,
            focusedPartIdAttribute: props.focusedNodeIdAttribute,
            focusedStructureIdAttribute: props.focusedStructureIdAttribute,
            hoveredPartIdAttribute: props.hoveredNodeIdAttribute,
            hoveredStructureIdAttribute: props.hoveredStructureIdAttribute,
            selectionMode: props.selectionMode,
            // Use unified selection output attribute (serverSideSelectionsJSON)
            selectionBranchesAttribute: props.serverSideSelectionsJSONAttribute,
            singleSelectionAttribute: props.serverSideSelectionsJSONAttribute
        },
        {
            selectedPartIds: Array.from(selectedNodes),
            selectedStructureIds: Array.from(selectedNodes)
                .map(id => {
                    const node = nodeMap.get(id);
                    return node?.structureId || "";
                })
                .filter(Boolean),
            focusedPartId: focusedNodeId,
            focusedStructureId: focusedNodeId ? nodeMap.get(focusedNodeId)?.structureId || null : null,
            hoveredPartId: currentHoveredNode,
            hoveredStructureId: currentHoveredNode ? nodeMap.get(currentHoveredNode)?.structureId || null : null,
            // Enhanced state (computed from current selection)
            // Branch-based selection data from useTreeSelectionBranch
            singleSelection,
            branches
        },
        {
            setSelectedNodes: setSelectedNodesContext,
            setFocusedNode: setFocusedNodeContext,
            setHoveredNode: setHoveredNodeContext,
            // Direct passthrough to useTreeSelectionBranch
            setSingleSelection,
            setBranches,
            // Navigation actions
            navigateToNode,
            expandPathToNode
        }
    );

    // API integration moved earlier to be available for search hook

    // Cleanup API on unmount
    useEffect(() => {
        return () => {
            // Cleanup handled by individual hooks
        };
    }, []);

    // Apply default expansion level on initial load
    useEffect(() => {
        if (props.defaultExpandLevel && props.defaultExpandLevel > 0 && nodes.length > 0) {
            // Only expand to default level if no nodes are currently expanded
            // This prevents overriding user's manual expansions or saved expansion state
            if (expandedNodes.size === 0) {
                expandToLevel(props.defaultExpandLevel);
            }
        }
    }, [props.defaultExpandLevel, nodes.length]); // eslint-disable-line react-hooks/exhaustive-deps

    // Selection changes are now sent via the state batching system
    // which uses the unified stateEndpoint

    // Debug logging for development - remove in production
    useEffect(() => {
        if (props.debugMode) {
            console.debug("TreeView Debug Info:", {
                totalNodes: nodes.length,
                expandedNodes: expandedNodes.size,
                selectedNodes: selectedNodes.size,
                isUsingMxData,
                nativeSelectionEnabled: props.selectionStorageMethod === "association",
                hasNativeSelection: !!props.nativeSelection
            });
        }
    }, [
        props.debugMode,
        nodes.length,
        expandedNodes.size,
        selectedNodes.size,
        isUsingMxData,
        props.selectionStorageMethod,
        props.nativeSelection
    ]);

    // Handle node click with support for keyboard modifiers (Ctrl+Click, Shift+Click)
    const handleNodeClick = useCallback(
        (node: TreeNode, event?: React.MouseEvent) => {
            if (props.debugMode) {
                console.debug(`TreeView [CLICK]: Node clicked - id: ${node.id}, current focused: ${focusedNodeId}`);
                console.debug(
                    `TreeView [CLICK]: Node details - isLeaf: ${node.isLeaf}, hasChildren: ${node.hasChildren}, children: ${node.children.length}, dataLoadingMode: ${props.dataLoadingMode}`
                );
            }

            // Update focused node
            setFocusedNodeId(node.id);

            // Track state changes for batching
            let willSelect: boolean | undefined;
            let willExpand: boolean | undefined;
            const deselectedNodes: TreeNode[] = [];

            // Handle selection with keyboard modifiers if event is provided
            if (props.selectionMode !== "none") {
                const wasSelected = selectedNodes.has(node.id);

                // Track nodes that will be deselected for state batching
                if (event && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
                    // Regular click without modifiers - will deselect all others
                    selectedNodes.forEach(selectedId => {
                        if (selectedId !== node.id) {
                            const deselectedNode = nodeMap.get(selectedId);
                            if (deselectedNode) {
                                deselectedNodes.push(deselectedNode);
                            }
                        }
                    });
                }

                // Use the hook's selection handler which handles all selection modes
                if (event) {
                    handleNodeSelection(node.id, event);
                } else {
                    selectNode(node.id);
                }

                // Determine if node will be selected based on current state and action
                if (event && (event.ctrlKey || event.metaKey)) {
                    // Toggle - will be opposite of current state
                    willSelect = !wasSelected;
                } else {
                    // Regular click or no event - will select
                    willSelect = true;
                }
            }

            // Determine expansion state change
            const canHaveChildren = node.hasChildren !== false && (!node.isLeaf || node.hasChildren === true);
            if (canHaveChildren) {
                const isCurrentlyExpanded = expandedNodes.has(node.id);
                willExpand = !isCurrentlyExpanded;
                if (props.debugMode) {
                    console.debug(`TreeView [CLICK]: Will ${willExpand ? "expand" : "collapse"} node ${node.id}`);
                }
                toggleExpandedWithTracking(node.id);
            }

            // Send batched state changes to API
            if (props.stateEndpoint) {
                // Add the main node's state changes
                const stateUpdate: any = {};
                if (willSelect !== undefined) {
                    stateUpdate.selected = willSelect;
                }
                if (willExpand !== undefined) {
                    stateUpdate.expanded = willExpand;
                }

                if (Object.keys(stateUpdate).length > 0) {
                    addStateChange(node, stateUpdate);
                }

                // Add deselected nodes
                if (deselectedNodes.length > 0) {
                    addDeselectedOrphans(deselectedNodes);
                    // Also add their deselection to state changes
                    deselectedNodes.forEach(deselectedNode => {
                        addStateChange(deselectedNode, { selected: false });
                    });
                }
            }

            if (props.onNodeClick && props.onNodeClick.canExecute) {
                console.debug(`TreeView [CLICK]: Executing onNodeClick action`);
                props.onNodeClick.execute();
            } else {
                console.debug(`TreeView [CLICK]: No onNodeClick action or cannot execute`);
            }

            // Lazy load children if needed
            // Enable lazy loading for progressive or on-demand modes
            const shouldLazyLoad = props.dataLoadingMode === "progressive" || props.dataLoadingMode === "onDemand";

            // Check if we should load children:
            // 1. Lazy loading is enabled (based on data loading mode)
            // 2. Node has no loaded children yet
            // 3. Node can have children
            if (shouldLazyLoad && node.children.length === 0 && canHaveChildren) {
                if (props.debugMode) {
                    console.debug(
                        `TreeView [CLICK]: Lazy loading children for node ${node.id} (mode: ${props.dataLoadingMode}, hasChildren: ${node.hasChildren}, isLeaf: ${node.isLeaf})`
                    );
                }
                loadChildren(node.id);
            } else if (props.debugMode) {
                console.debug(
                    `TreeView [CLICK]: Not loading children - shouldLazyLoad: ${shouldLazyLoad}, canHaveChildren: ${canHaveChildren}, children.length: ${node.children.length}`
                );
            }
        },
        [
            props,
            selectNode,
            toggleSelection,
            selectRange,
            selectedNodes,
            loadChildren,
            setFocusedNodeId,
            focusedNodeId,
            toggleExpandedWithTracking,
            nodeMap,
            expandedNodes,
            addStateChange,
            addDeselectedOrphans
        ]
    );

    // Handle node hover with optimized intent detection
    const handleNodeHover = useCallback(
        (node: TreeNode, event?: React.MouseEvent) => {
            // Always update visual hover immediately
            setVisualHoveredNodeId(node.id);

            // Use optimized hover for context updates (if enabled)
            if (props.enableHoverServerUpdates) {
                handleOptimizedHover(node.id, event, node.structureId);
            }

            // Execute action immediately (not optimized)
            if (props.onNodeHover && props.onNodeHover.canExecute) {
                props.onNodeHover.execute();
            }
        },
        [props.onNodeHover, props.enableHoverServerUpdates, handleOptimizedHover]
    );

    // Coordinate drag handlers between drag logic and visual layer
    const handleDragStart = useCallback(
        (e: React.DragEvent, node: TreeNode) => {
            handleDragStartBase(e, node);

            // Get the nodes being dragged (selected nodes if multiple, otherwise just the dragged node)
            const nodesToDrag =
                selectedNodes.has(node.id) && selectedNodes.size > 1
                    ? Array.from(selectedNodes)
                          .map(id => nodeMap.get(id)!)
                          .filter(Boolean)
                    : [node];

            // Start visual drag
            startDrag(nodesToDrag, e.clientX, e.clientY);
        },
        [handleDragStartBase, selectedNodes, nodeMap, startDrag]
    );

    const handleDragOver = useCallback(
        (e: React.DragEvent, node: TreeNode) => {
            const result = handleDragOverBase(e, node);

            // Update drag position for visual feedback
            updateDragPosition(e.clientX, e.clientY);

            // Update drop indicator if valid drop zone
            if (draggedOver === node.id && dropPosition) {
                updateDropIndicator({
                    nodeId: node.id,
                    position: dropPosition,
                    depth: node.level
                });
            } else {
                updateDropIndicator(null);
            }

            return result;
        },
        [handleDragOverBase, updateDragPosition, draggedOver, dropPosition, updateDropIndicator]
    );

    const handleDrop = useCallback(
        (e: React.DragEvent, node: TreeNode) => {
            handleDropBase(e, node);
            endDrag();
        },
        [handleDropBase, endDrag]
    );

    const handleDragEnd = useCallback(
        (_e: React.DragEvent) => {
            handleDragEndBase();
            endDrag();
        },
        [handleDragEndBase, endDrag]
    );

    // Handle context menu
    const handleContextMenu = useCallback(
        (e: React.MouseEvent, node: TreeNode) => {
            e.preventDefault();
            e.stopPropagation();

            if (props.contextMenuActions && props.contextMenuActions.length > 0) {
                setContextMenu({ x: e.clientX, y: e.clientY, node });
            }
        },
        [props.contextMenuActions]
    );

    // Close context menu
    const handleCloseContextMenu = useCallback(() => {
        setContextMenu(null);
    }, []);

    // Get context menu actions
    const getContextMenuActions = useCallback((): ContextMenuAction[] => {
        if (!contextMenu?.node || !props.contextMenuActions) {
            return [];
        }

        return props.contextMenuActions.map(item => ({
            label: item.label.value || "Action",
            action: () => {
                if (item.action && item.action.canExecute) {
                    item.action.execute();
                }
                handleCloseContextMenu();
            }
        }));
    }, [contextMenu, props.contextMenuActions, handleCloseContextMenu]);

    // Get breadcrumb path
    const getBreadcrumbPath = useCallback((): TreeNode[] => {
        if (!focusedNodeId) {
            return [];
        }

        const path: TreeNode[] = [];
        let current = nodeMap.get(focusedNodeId);

        while (current) {
            path.unshift(current);
            current = current.parentId ? nodeMap.get(current.parentId) : null;
        }

        return path;
    }, [focusedNodeId, nodeMap]);

    // Handle breadcrumb click
    const handleBreadcrumbClick = useCallback(
        (node: TreeNode) => {
            setFocusedNodeId(node.id);
            selectNode(node.id);

            // Navigate to the clicked breadcrumb node
            navigateToNodeById(
                node.id,
                nodeMap,
                expandedNodes,
                {
                    itemHeight: props.itemHeight,
                    highlightDuration: 2000,
                    scrollBehavior: "smooth"
                },
                {
                    toggleExpanded,
                    selectNode,
                    setFocusedNodeId,
                    scrollToNode: async (nodeId: string) => {
                        // Scrolling is handled by the view components (StandardTreeView, etc.)
                        // which have direct access to scroll containers and preservation logic.
                        // This callback just needs to ensure the node is focused.
                        setFocusedNodeId(nodeId);
                        if (props.debugMode) {
                            console.debug(
                                "TreeView [BREADCRUMB]: Node focused, scroll handled by view component:",
                                nodeId
                            );
                        }
                    },
                    loadChildren: async (nodeId: string) => {
                        loadChildren(nodeId);
                    }
                }
            );
        },
        [
            setFocusedNodeId,
            selectNode,
            nodeMap,
            expandedNodes,
            toggleExpanded,
            loadChildren,
            props.itemHeight,
            props.debugMode
        ]
    );

    // Memory management callbacks
    const requestNodeData = useCallback(
        (nodeIds: string[]) => {
            if (props.debugMode) {
                console.debug("TreeView [MEMORY]: Requesting data for nodes:", nodeIds);
            }

            // Load children for each requested node
            nodeIds.forEach(nodeId => {
                const node = nodeMap.get(nodeId);
                if (node && !node.isLeaf && node.children.length === 0) {
                    // Use immediate loading for skeleton nodes
                    loadChildren(nodeId);
                }
            });
        },
        [props.debugMode, nodeMap, loadChildren]
    );

    const handleNodeDataLoaded = useCallback(
        (nodeIds: string[]) => {
            if (props.debugMode) {
                console.debug("TreeView [MEMORY]: Node data loaded for:", nodeIds);
            }

            // The tree data hook will have already updated the nodes
            // Trigger a refresh to update the UI
            refreshNodes();
        },
        [props.debugMode, refreshNodes]
    );

    const handleNodeLoadingError = useCallback(
        (nodeIds: string[], error: string) => {
            console.error("TreeView [MEMORY]: Error loading nodes:", nodeIds, error);

            // Mark nodes as having load errors
            nodeIds.forEach(nodeId => {
                const node = nodeMap.get(nodeId);
                if (node) {
                    // Update node to show error state
                    node.loadingState = "error";
                }
            });

            // Trigger a refresh to show error states
            refreshNodes();
        },
        [nodeMap, refreshNodes]
    );

    // Calculate selected branches for memory management
    const selectedBranches = useMemo(() => {
        // Use the utility function to properly convert selections to branches
        // This automatically calculates deselected ancestors and descendants
        const branches = convertSelectionToBranches(selectedNodes, nodeMap);

        if (props.debugMode && branches.length > 0) {
            console.debug(
                `TreeView [SELECTION]: Converted ${selectedNodes.size} selected nodes into ${branches.length} branches`
            );
            branches.forEach(branch => {
                console.debug(
                    `  Branch: ${branch.branchSelection}, Deselected ancestors: ${branch.deselectedAncestors.length}, Deselected descendants: ${branch.deselectedDescendants.length}`
                );
            });
        }

        return branches;
    }, [selectedNodes, nodeMap, props.debugMode]);

    // Request total count from datasource if available
    useEffect(() => {
        if (props.datasource && typeof props.datasource.requestTotalCount === "function") {
            props.datasource.requestTotalCount(true);
        }
    }, [props.datasource]);

    // Track total node count for virtual scrolling
    const totalNodeCount = useMemo(() => {
        // Use total count from datasource if available
        if (props.datasource && props.datasource.totalCount !== undefined) {
            return props.datasource.totalCount;
        }
        // Otherwise use the current node count
        return nodes.length;
    }, [props.datasource, nodes.length]);

    // Core tree operations that all views need
    const treeOperations = useMemo(() => {
        const expandPath = async (nodeIds: string[]) => {
            for (const nodeId of nodeIds) {
                if (!expandedNodes.has(nodeId)) {
                    toggleExpandedWithTracking(nodeId);
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            }
        };

        const ensureNodeLoaded = async (nodeId: string) => {
            const node = nodeMap.get(nodeId);
            if (node && node.isSkeleton && isUsingMxData) {
                requestNodeData([nodeId]);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        };

        const navigateToNode = async (nodeId: string) => {
            // Use the external navigation utility
            await navigateToNodeById(
                nodeId,
                nodeMap,
                expandedNodes,
                {
                    itemHeight: props.itemHeight,
                    onNodeNotFound: () => {
                        console.warn(`Node ${nodeId} not found in tree`);
                    },
                    highlightDuration: 2000,
                    scrollBehavior: "smooth"
                },
                {
                    toggleExpanded: toggleExpandedWithTracking,
                    selectNode,
                    setFocusedNodeId,
                    scrollToNode: async (targetNodeId: string) => {
                        // For now, just focus the node - actual scrolling will be handled by view components
                        const targetNode = nodeMap.get(targetNodeId);
                        if (targetNode && containerRef.current) {
                            // View components will handle the actual scrolling through their scroll preservation hooks
                            console.debug(
                                "TreeView [NAVIGATE]: Scrolling to node handled by view component:",
                                targetNodeId
                            );
                        }
                    },
                    loadChildren: async (nodeId: string) => {
                        loadChildren(nodeId);
                    }
                }
            );
        };

        return {
            expandPath,
            ensureNodeLoaded,
            navigateToNode
        };
    }, [
        expandedNodes,
        toggleExpandedWithTracking,
        nodeMap,
        isUsingMxData,
        requestNodeData,
        selectNode,
        setFocusedNodeId,
        containerRef,
        loadChildren,
        props.itemHeight
    ]);

    // Performance metrics
    const renderMetrics = useMemo(() => {
        if (!props.debugMode) {
            return null;
        }

        const totalNodes = nodes.length;
        const expandedCount = expandedNodes.size;
        const selectedCount = selectedNodes.size;
        const visibleCount = Array.from(expandedNodes).filter(id => {
            const node = nodeMap.get(id);
            if (!node) {
                return false;
            }
            const ancestors = getAncestorIds(id);
            return ancestors.every(ancestorId => expandedNodes.has(ancestorId));
        }).length;

        const selectionStats = getSelectionStats();

        return {
            totalNodes,
            expandedCount,
            selectedCount,
            visibleCount,
            hoverMetrics: props.enableHoverServerUpdates !== false ? hoverMetrics : null,
            selectionStats: {
                ...selectionStats,
                mode: branches.length > 0 ? "branch" : "single",
                branchCount: branches.length
            }
        };
    }, [
        props.debugMode,
        props.enableHoverServerUpdates,
        nodes,
        expandedNodes,
        selectedNodes,
        nodeMap,
        getAncestorIds,
        hoverMetrics,
        getSelectionStats,
        branches
    ]);

    // Handle container mouse leave
    const handleContainerMouseLeave = useCallback(() => {
        // Clear visual hover immediately
        setVisualHoveredNodeId(null);

        // Use optimized hover to clear with delay
        if (props.enableHoverServerUpdates) {
            handleOptimizedHover(null);
        }
    }, [props.enableHoverServerUpdates, handleOptimizedHover]);

    // Set up activity tracking for memory management
    useEffect(() => {
        if (!containerRef.current || !recordActivity) {
            return;
        }

        // Mouse movement tracking (debounced)
        let mouseTimeout: number | null = null;
        const handleMouseMove = () => {
            if (mouseTimeout) {
                window.clearTimeout(mouseTimeout);
            }
            mouseTimeout = window.setTimeout(() => {
                recordActivity("mouse");
            }, 100);
        };

        // Scroll tracking
        const handleScroll = () => {
            recordActivity("scroll");
        };

        // Focus tracking
        const handleFocus = () => {
            recordActivity("focus");
        };

        // Keyboard tracking
        const handleKeyDown = (_e: KeyboardEvent) => {
            // Only track if focus is within the tree
            if (containerRef.current?.contains(document.activeElement)) {
                recordActivity("keyboard");
            }
        };

        const container = containerRef.current;
        container.addEventListener("mousemove", handleMouseMove);
        container.addEventListener("scroll", handleScroll, true); // Use capture for nested scrolls
        container.addEventListener("focusin", handleFocus);
        window.addEventListener("keydown", handleKeyDown);

        return () => {
            container.removeEventListener("mousemove", handleMouseMove);
            container.removeEventListener("scroll", handleScroll, true);
            container.removeEventListener("focusin", handleFocus);
            window.removeEventListener("keydown", handleKeyDown);
            if (mouseTimeout) {
                window.clearTimeout(mouseTimeout);
            }
        };
    }, [recordActivity]);

    // Log memory stats in debug mode
    useEffect(() => {
        if (!props.debugMode || !getMemoryStats) {
            return;
        }

        const statsInterval = setInterval(() => {
            const stats = getMemoryStats();
            if (stats) {
                console.debug("TreeView [MEMORY]:", stats);
            }
        }, 10000); // Every 10 seconds

        return () => clearInterval(statsInterval);
    }, [props.debugMode, getMemoryStats]);

    // Handle search result selection
    const handleSearchResultSelect = useCallback(
        (nodeId: string) => {
            // Select the node
            selectNode(nodeId);
            setFocusedNodeId(nodeId);

            // Expand all ancestors to make the node visible
            const ancestors = getAncestorIds(nodeId);
            ancestors.forEach(ancestorId => {
                if (!expandedNodes.has(ancestorId)) {
                    toggleExpandedWithTracking(ancestorId);
                }
            });

            // Close search results
            setShowSearchResults(false);

            // Trigger navigation to the selected node after a short delay
            // This allows the tree to expand first
            setTimeout(() => {
                navigateToNodeById(
                    nodeId,
                    nodeMap,
                    expandedNodes,
                    {
                        itemHeight: props.itemHeight,
                        onNodeNotFound: () => {
                            console.warn(`Search result node ${nodeId} not found in tree`);
                        },
                        highlightDuration: 2000,
                        scrollBehavior: "smooth"
                    },
                    {
                        toggleExpanded: toggleExpandedWithTracking,
                        selectNode,
                        setFocusedNodeId,
                        scrollToNode: async (targetNodeId: string) => {
                            // Scrolling is handled by the view components
                            setFocusedNodeId(targetNodeId);
                            if (props.debugMode) {
                                console.debug(
                                    "TreeView [SEARCH]: Node focused, scroll handled by view component:",
                                    targetNodeId
                                );
                            }
                        },
                        loadChildren: async (nodeId: string) => {
                            loadChildren(nodeId);
                        }
                    }
                );
            }, 100);
        },
        [
            selectNode,
            setFocusedNodeId,
            getAncestorIds,
            expandedNodes,
            toggleExpandedWithTracking,
            nodeMap,
            loadChildren,
            props.itemHeight,
            props.debugMode
        ]
    );

    // Show search results when searching
    useEffect(() => {
        if (props.enableSearch && searchQuery && (searchResultsList.length > 0 || searchResults.length > 0)) {
            setShowSearchResults(true);
        } else {
            setShowSearchResults(false);
        }
    }, [searchQuery, searchResultsList, searchResults, props.enableSearch]);

    // Trigger mx.data search when using new data source
    useEffect(() => {
        if (props.enableSearch && isUsingMxData && searchQuery && props.searchResultsAsOverlay !== false) {
            searchNodes(searchQuery);
        }
    }, [searchQuery, isUsingMxData, searchNodes, props.searchResultsAsOverlay, props.enableSearch]);

    // Update visible nodes for subscription management
    useEffect(() => {
        if (isUsingMxData && updateVisibleNodes) {
            // Calculate visible nodes based on expanded state
            const visibleNodeIds: string[] = [];
            const collectVisibleNodes = (nodeList: TreeNode[]): void => {
                for (const node of nodeList) {
                    visibleNodeIds.push(node.id);
                    if (expandedNodes.has(node.id) && node.children.length > 0) {
                        // Children are already TreeNode objects, not IDs
                        collectVisibleNodes(node.children);
                    }
                }
            };
            collectVisibleNodes(rootNodes);
            updateVisibleNodes(visibleNodeIds);
        }
    }, [isUsingMxData, updateVisibleNodes, rootNodes, expandedNodes, nodeMap]);

    // Update selected nodes for subscription management
    useEffect(() => {
        if (isUsingMxData && updateSelectedNodes && typeof updateSelectedNodes === "function") {
            // Call updateSelectedNodes without arguments as per its definition
            updateSelectedNodes();
        }
    }, [isUsingMxData, updateSelectedNodes, selectedNodes]);

    // Determine CSS class for render mode
    // This allows dynamic switching by changing CSS classes at runtime
    // Developers can override the displayAs property by applying these classes
    const getRenderModeClass = (): string => {
        switch (effectiveDisplayMode) {
            case "floating":
                return "mx-tree-floating";
            case "sliding":
                return "mx-tree-panels";
            case "standard":
            default:
                return "mx-tree-standard";
        }
    };

    // Show offline message when offline
    if (isOfflineStatus) {
        return (
            <div
                className={classNames(
                    "mx-tree",
                    "mx-tree--offline",
                    getRenderModeClass(),
                    breakpointClasses,
                    props.class
                )}
                ref={containerRef}
            >
                <div className="mx-tree__offline-message">
                    <div className="mx-tree__offline-icon">⚠️</div>
                    <div className="mx-tree__offline-text">
                        <h3>No Internet Connection</h3>
                        <p>
                            The tree view is unavailable while offline. Please check your internet connection and try
                            again.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            className={classNames(
                "mx-tree",
                getRenderModeClass(),
                breakpointClasses,
                {
                    "mx-tree--show-lines": props.showLines,
                    "mx-tree--debug-mode": props.debugMode
                },
                props.class
            )}
            ref={containerRef}
            onMouseLeave={handleContainerMouseLeave}
        >
            <TreeRenderMode
                renderingMode={
                    effectiveDisplayMode === "floating"
                        ? "floating"
                        : effectiveDisplayMode === "sliding"
                        ? "sliding"
                        : "standard"
                }
                containerElement={containerRef.current}
                // Tree data
                nodes={nodes}
                rootNodes={rootNodes}
                nodeMap={nodeMap}
                expandedNodes={expandedNodes}
                selectedNodes={selectedNodes}
                visibleNodes={visibleNodes}
                highlightedNodes={highlightedNodes}
                focusedNodeId={focusedNodeId}
                hoveredNodeId={visualHoveredNodeId}
                // TODO REVIEW TOMORROW - isLoading and isUnavailable props may be undefined
                // This could cause the TreeRenderMode component to not render properly
                isLoading={isLoading}
                isUnavailable={isUnavailable}
                // Search
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                clearSearch={clearSearch}
                isSearching={isSearchingLocal}
                totalResultCount={totalResultCount}
                showSearchResults={showSearchResults}
                setShowSearchResults={setShowSearchResults}
                // Progressive search
                isOffline={isOfflineStatus}
                isLoadingServer={isLoadingServer}
                serverTimeout={serverTimeout}
                cachedResultCount={cachedResultCount}
                searchResultsList={searchResultsList}
                currentPage={currentPage}
                resultsPerPage={resultsPerPage}
                setCurrentPage={setCurrentPage}
                // Handlers
                handleNodeClick={handleNodeClick}
                handleNodeHover={handleNodeHover}
                handleContextMenu={handleContextMenu}
                toggleExpanded={toggleExpandedWithTracking}
                toggleVisibility={toggleVisibilityWithBatching}
                handleSearchResultSelect={handleSearchResultSelect}
                handleBreadcrumbClick={handleBreadcrumbClick}
                getBreadcrumbPath={getBreadcrumbPath}
                // Drag & Drop
                draggedNodes={draggedNodes}
                isDraggingOver={draggedOver}
                dropPosition={dropPosition}
                handleDragStart={handleDragStart}
                handleDragOver={handleDragOver}
                handleDragLeave={handleDragLeave}
                handleDrop={handleDrop}
                handleDragEnd={handleDragEnd}
                // UI Configuration
                enableSearch={props.enableSearch}
                enableBreadcrumb={props.enableBreadcrumb}
                enableVisibilityToggle={props.enableVisibilityToggle}
                enableDragDrop={props.enableDragDrop}
                selectionMode={props.selectionMode}
                categoryAttribute={props.categoryAttribute}
                categoryExpression={props.categoryExpression}
                showCategoryItemCount={props.showCategoryItemCount}
                // Actions
                expandAll={expandAll}
                collapseAll={collapseAll}
                expandToLevel={expandToLevel}
                selectAll={selectAll}
                clearSelection={clearSelection}
                // Render configuration
                nodeContent={props.nodeContent}
                nodeLabelType={props.nodeLabelType}
                nodeLabelAttribute={props.nodeLabelAttribute}
                nodeLabelExpression={props.nodeLabelExpression}
                nodeLabelContent={props.nodeLabelContent}
                indentSize={props.indentSize}
                showLines={props.showLines}
                showIcons={props.showIcons}
                stickyHeaderMode={props.stickyHeaderMode}
                stickyHeaderDisplay={props.stickyHeaderDisplay}
                virtualScrolling={props.virtualScrolling}
                itemHeight={props.itemHeight}
                overscan={props.overscan}
                // Icons
                searchIcon={props.searchIcon}
                expandIcon={props.expandIcon}
                collapseIcon={props.collapseIcon}
                visibilityOnIcon={props.visibilityOnIcon}
                visibilityOffIcon={props.visibilityOffIcon}
                unavailableDataIcon={props.unavailableDataIcon}
                // Search configuration
                searchPlaceholder={props.searchPlaceholder?.value}
                // Debug
                debugMode={props.debugMode}
                renderMetrics={renderMetrics}
                // Memory management
                updateViewport={updateViewport}
                // Smart scrolling
                onPreloadRange={isUsingMxData ? preloadRange : undefined}
                // Progressive loading
                totalNodeCount={totalNodeCount}
                enableVariableHeight={false}
                // Callbacks for memory management
                onRequestNodeData={isUsingMxData ? requestNodeData : undefined}
                onNodeDataLoaded={isUsingMxData ? handleNodeDataLoaded : undefined}
                onNodeLoadingError={isUsingMxData ? handleNodeLoadingError : undefined}
                selectedBranches={selectedBranches}
                // Datasource for scroll preservation
                datasource={props.datasource}
                // Pass core tree operations to child components
                treeOperations={treeOperations}
                // Sliding panel specific
                breadcrumbCaption={undefined}
                enableTouchGestures={effectiveDisplayMode === "sliding"}
            />

            {contextMenu && (
                <TreeContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    actions={getContextMenuActions()}
                    onClose={handleCloseContextMenu}
                />
            )}

            {props.enableDragDrop && (
                <TreeDragLayer dragState={dragState} dropIndicator={dropIndicator} className="mx-tree__drag-layer" />
            )}

            {/* Search Results Overlay */}
            {props.enableSearch && props.searchResultsAsOverlay !== false && isUsingMxData && (
                <TreeSearchOverlay
                    searchQuery={searchQuery}
                    searchResults={
                        searchResults.length > 0
                            ? searchResults
                            : (Array.from(searchResultNodes)
                                  .map(nodeId => nodeMap.get(nodeId))
                                  .filter(node => node !== undefined) as TreeNode[])
                    }
                    searchResultsList={searchResultsList}
                    isSearching={isSearching || isSearchingLocal || isLoadingServer}
                    visible={showSearchResults && searchQuery.length > 0}
                    onResultClick={node => {
                        handleSearchResultSelect(node.id);
                        setShowSearchResults(false);
                    }}
                    onClose={() => setShowSearchResults(false)}
                    searchIcon={props.searchIcon}
                    // Progressive search props
                    isOffline={isOfflineStatus}
                    isLoadingServer={isLoadingServer}
                    serverTimeout={serverTimeout}
                    cachedResultCount={cachedResultCount}
                    totalResultCount={totalResultCount}
                />
            )}
        </div>
    );
}

// Custom comparison function to prevent re-renders from Mendix attribute updates
const areEqual = (prevProps: TreeViewContainerProps, nextProps: TreeViewContainerProps): boolean => {
    // Check if data source has actually changed
    if (prevProps.datasource !== nextProps.datasource) {
        // Check if the items have actually changed (not just the status)
        const prevItems = prevProps.datasource?.items;
        const nextItems = nextProps.datasource?.items;

        // If items are different references or different lengths, re-render
        if (prevItems !== nextItems || prevItems?.length !== nextItems?.length) {
            return false;
        }
    }

    // Check structural props that should trigger re-render
    const structuralPropsToCheck = [
        "displayAs",
        "displayAsXS",
        "displayAsSM",
        "displayAsMD",
        "enableSearch",
        "enableDragDrop",
        "enableBreadcrumb",
        "selectionMode",
        "class",
        "style"
    ];

    for (const prop of structuralPropsToCheck) {
        if (prevProps[prop as keyof TreeViewContainerProps] !== nextProps[prop as keyof TreeViewContainerProps]) {
            return false;
        }
    }

    // For Mendix attributes, check if they're the same reference
    // This prevents re-renders when attribute values change but the attribute itself doesn't
    const attributePropsToCheck = [
        "selectedNodeIdAttribute",
        "selectedStructureIdAttribute",
        "focusedNodeIdAttribute",
        "focusedStructureIdAttribute",
        "hoveredNodeIdAttribute",
        "hoveredStructureIdAttribute"
    ];

    for (const prop of attributePropsToCheck) {
        const prevAttr = prevProps[prop as keyof TreeViewContainerProps];
        const nextAttr = nextProps[prop as keyof TreeViewContainerProps];
        // Check reference equality, not value equality
        if (prevAttr !== nextAttr) {
            return false;
        }
    }

    // Props are considered equal - no re-render needed
    return true;
};

// Export memoized component to prevent unnecessary re-renders
export const TreeView = memo(TreeViewComponent, areEqual);
