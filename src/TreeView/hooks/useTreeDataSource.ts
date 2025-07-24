import React, { useCallback, useEffect, useRef, useState } from "react";
import { ObjectItem, ListValue, ListAttributeValue, ListExpressionValue, ListReferenceValue } from "mendix";
import { Big } from "big.js";
import { FilterCondition } from "mendix/filters";
import { isDatasourceAvailable, isDatasourceLoading, isDatasourceUnavailable } from "../utils/mendixHelpers";
import { TreeNode } from "../types/TreeTypes";
import { FilterListType } from "../../../typings/TreeViewProps";
import { TreeFilterOrchestrator } from "../utils/treeFilterOrchestrator";
import { setTimer, clearTimer, TimerId } from "../utils/timers";
import {
    buildRootNodeFilterForAnyType,
    buildChildrenFilter,
    buildStructureIDChildrenFilter,
    buildStructureIDRangeFilter,
    combineFilters,
    combineFiltersOr
} from "../utils/datasourceFilterBuilder";
import { TreeMemoryManager, SkeletonNode } from "../utils/treeMemoryManager";

/**
 * Configuration for useTreeDataSource hook
 */
interface ITreeDataSourceConfig {
    // Datasource
    datasource: ListValue;

    // Tree structure attributes
    nodeIdAttribute: ListAttributeValue<string | Big>;
    nodeLabelAttribute?: ListAttributeValue<string>;
    nodeLabelExpression?: ListExpressionValue<string>;
    parentRelationType: "attribute" | "association" | "structureId";
    parentIdAttribute?: ListAttributeValue<string | Big>;
    parentAssociation?: ListReferenceValue;
    structureIdAttribute?: ListAttributeValue<string>;

    // Filter configuration
    filterList?: FilterListType[];
    activeFilters?: Map<string, any>;

    // Loading configuration
    dataLoadingMode: "all" | "progressive" | "onDemand";
    defaultExpandLevel?: number;

    // Memory management configuration
    enableMemoryManagement?: boolean;
    maxCacheSize?: number;
    cacheTimeout?: number;
    itemHeight?: number;

    // Additional attributes
    visibilityAttribute?: ListAttributeValue<boolean>;
    expandedAttribute?: ListAttributeValue<boolean>;
    hasChildrenAttribute?: ListAttributeValue<boolean>;
    childCountAttribute?: ListAttributeValue<Big>;
    levelAttribute: ListAttributeValue<Big>;
    sortOrderAttribute: ListAttributeValue<Big>;
}

/**
 * Hook for managing tree data using datasource.setFilter()
 * Aligns with Mendix best practices from DataGrid and Gallery widgets
 */
export function useTreeDataSource(config: ITreeDataSourceConfig): {
    nodes: TreeNode[];
    nodeMap: Map<string, TreeNode>;
    rootNodes: TreeNode[];
    isLoading: boolean;
    isUnavailable: boolean;
    loadChildren: (nodeId: string) => void;
    preloadRange: (startStructureId: string, endStructureId: string) => void;
    searchNodes: (query: string) => void;
    setExpandedNodes: React.Dispatch<React.SetStateAction<Set<string>>>;
    setUserFilter: (filterIndex: number, value: any) => void;
    clearUserFilters: () => void;
    activeFilters: Map<string, any>;
    searchQuery: string;
    isSearching: boolean;
    totalCount?: number;
    hasMore?: boolean;
    datasource: ListValue;
    // Memory management
    recordActivity: (type: "mouse" | "keyboard" | "scroll" | "focus" | "expand") => void;
    updateViewport: (visibleNodeIds: string[]) => void;
    getMemoryStats: () => any;
    // Internal refs for advanced operations (selection, drag-drop)
    allLoadedItemsRef?: React.MutableRefObject<Map<string, ObjectItem>>;
} {
    const {
        datasource,
        nodeLabelAttribute,
        nodeLabelExpression,
        parentRelationType,
        parentIdAttribute,
        parentAssociation,
        structureIdAttribute,
        dataLoadingMode,
        levelAttribute,
        sortOrderAttribute
    } = config;

    // State
    const [nodes, setNodes] = useState<TreeNode[]>([]);
    const [nodeMap, setNodeMap] = useState<Map<string, TreeNode>>(new Map());
    const [rootNodes, setRootNodes] = useState<TreeNode[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isUnavailable, setIsUnavailable] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
    const [activeFilters, setActiveFilters] = useState<Map<string, any>>(new Map());

    // Refs for tracking state
    const currentFilterRef = useRef<FilterCondition | undefined>();
    const loadedNodesRef = useRef<Set<string>>(new Set());
    const childrenLoadedRef = useRef<Set<string>>(new Set()); // Track nodes whose children have been loaded
    const pendingLoadRef = useRef<Set<string>>(new Set());
    const allLoadedItemsRef = useRef<Map<string, ObjectItem>>(new Map()); // Track all items ever loaded
    const isLoadingChildrenRef = useRef<boolean>(false); // Track if we're currently loading children
    const filterManagerRef = useRef<TreeFilterOrchestrator>(
        new TreeFilterOrchestrator({
            structureIdAttribute,
            parentIdAttribute,
            parentAssociation,
            sortOrderAttribute,
            depthAttribute: levelAttribute
        })
    );
    const batchLoadTimeoutRef = useRef<TimerId | null>(null);
    const batchLoadQueueRef = useRef<Set<string>>(new Set());
    const pendingDefaultExpandRef = useRef<number | null>(null);

    // Initialize memory manager if enabled
    const memoryManagerRef = useRef<TreeMemoryManager | null>(null);
    if (config.enableMemoryManagement && !memoryManagerRef.current) {
        memoryManagerRef.current = new TreeMemoryManager(
            config.maxCacheSize || 5000,
            config.cacheTimeout || 60,
            30 // inactivity timeout in seconds
        );
    }

    /**
     * Convert ObjectItem to TreeNode (with optional memory management)
     */
    const convertToTreeNode = useCallback(
        (item: ObjectItem, useMemoryManager = false): TreeNode => {
            const id = item.id;
            const label = nodeLabelExpression
                ? nodeLabelExpression.get(item).value || ""
                : nodeLabelAttribute
                ? nodeLabelAttribute.get(item).value || ""
                : id;

            let parentId: string | null = null;
            let structureId: string | undefined;
            let path: string[] = [];

            if (parentRelationType === "attribute" && parentIdAttribute) {
                const parentIdValue = parentIdAttribute.get(item).value;
                // Convert Big to string if needed
                parentId = parentIdValue ? String(parentIdValue) : null;
            } else if (parentRelationType === "structureId" && structureIdAttribute) {
                const structureIdValue = structureIdAttribute.get(item).value;
                structureId = structureIdValue || "";
                // Don't set parentId here - let buildTreeStructure handle the relationships
                // based on structure IDs. This allows developers to have both parent ID
                // and structure ID attributes configured without conflicts.
                parentId = null;

                // Path is the structure ID parts (without trailing empty parts)
                path = structureId.split(".").filter(part => part.length > 0);
            }

            // Determine if node has children
            const hasChildren = config.hasChildrenAttribute
                ? config.hasChildrenAttribute.get(item).value === true
                : true; // Assume it might have children unless told otherwise

            const level = config.levelAttribute
                ? Number(config.levelAttribute.get(item).value || 0)
                : structureId
                ? structureId.split(".").length - 1
                : 0;

            // If memory manager is enabled and requested, create managed node
            if (useMemoryManager && memoryManagerRef.current) {
                const managedNode = memoryManagerRef.current.createManagedNode(
                    item,
                    {
                        id,
                        parentId,
                        childIds: [], // Will be populated later
                        level,
                        hasChildren,
                        childCount: 0 // Will be updated later
                    },
                    config.itemHeight || 32
                );

                // Convert managed node to TreeNode format
                if ((managedNode as SkeletonNode).isSkeleton) {
                    return managedNode as TreeNode;
                }

                // Full node
                return {
                    id,
                    label,
                    parentId,
                    structureId,
                    level,
                    path,
                    children: [],
                    isLeaf: !hasChildren,
                    isExpanded: false,
                    isVisible: true,
                    objectItem: item,
                    isSkeleton: false
                } as TreeNode;
            }

            // Standard node creation without memory management
            return {
                id,
                label,
                parentId,
                structureId,
                level,
                path,
                children: [], // Will be populated later with TreeNode objects
                isLeaf: !hasChildren,
                isExpanded: false,
                isVisible: true,
                objectItem: item
            };
        },
        [
            nodeLabelExpression,
            nodeLabelAttribute,
            parentRelationType,
            parentIdAttribute,
            structureIdAttribute,
            config,
            memoryManagerRef
        ]
    );

    /**
     * Build tree structure from flat list
     */
    const buildTreeStructure = useCallback(
        (
            items: ObjectItem[]
        ): {
            nodes: TreeNode[];
            nodeMap: Map<string, TreeNode>;
            rootNodes: TreeNode[];
        } => {
            const newNodes: TreeNode[] = [];
            const newNodeMap = new Map<string, TreeNode>();
            const newRootNodes: TreeNode[] = [];

            // First pass: create all nodes
            const useMemoryManager = config.enableMemoryManagement && items.length > 1000; // Enable for large datasets
            items.forEach(item => {
                const node = convertToTreeNode(item, useMemoryManager);
                newNodes.push(node);
                newNodeMap.set(node.id, node);
            });

            // If using structure IDs, build parent-child relationships based on structure IDs
            if (parentRelationType === "structureId") {
                // Create a map of structure IDs to nodes for quick lookup
                const structureIdMap = new Map<string, TreeNode>();
                newNodes.forEach(node => {
                    if (node.structureId) {
                        structureIdMap.set(node.structureId, node);
                    }
                });

                // Build relationships based on structure IDs
                newNodes.forEach(node => {
                    if (node.structureId) {
                        // Parse structure ID handling trailing dots
                        const parts = node.structureId.split(".").filter(part => part.length > 0);

                        if (parts.length > 1) {
                            // Find parent by structure ID
                            const parentParts = parts.slice(0, -1);
                            const parentStructureId = parentParts.join(".") + ".";
                            const parent = structureIdMap.get(parentStructureId);

                            if (parent) {
                                parent.children.push(node);
                                parent.isLeaf = false;
                                node.parentId = parent.id;
                            } else {
                                // No parent found - this is a root node
                                newRootNodes.push(node);
                            }
                        } else {
                            // Single part structure ID (e.g., "1.") - this is a root node
                            newRootNodes.push(node);
                        }
                    }
                });
            } else {
                // Use standard parent ID relationships
                newNodes.forEach(node => {
                    if (node.parentId && newNodeMap.has(node.parentId)) {
                        const parent = newNodeMap.get(node.parentId)!;
                        parent.children.push(node);
                        parent.isLeaf = false;
                    } else if (!node.parentId) {
                        newRootNodes.push(node);
                    }
                });
            }

            return { nodes: newNodes, nodeMap: newNodeMap, rootNodes: newRootNodes };
        },
        [convertToTreeNode, parentRelationType]
    );

    /**
     * Update combined filter and trigger datasource reload
     */
    const updateFilter = useCallback(() => {
        const combinedFilter = filterManagerRef.current.getCombinedFilter();
        currentFilterRef.current = combinedFilter;
        datasource.setFilter(combinedFilter);
    }, [datasource]);

    /**
     * Load root nodes only - start with level 0, then expand based on default level
     */
    const loadRootNodes = useCallback(() => {
        console.debug(
            `useTreeDataSource.ts [DATALOAD]by[${parentRelationType.toUpperCase()}]: Starting root node load`
        );

        // Clear all previous data when starting a fresh root load (only for progressive/onDemand modes)
        if (dataLoadingMode !== "all") {
            allLoadedItemsRef.current.clear();
            loadedNodesRef.current.clear();
            childrenLoadedRef.current.clear();
            pendingLoadRef.current.clear();
            isLoadingChildrenRef.current = false;
            console.debug(
                `useTreeDataSource.ts [DATALOAD]: Cleared all previous data for fresh root load (${dataLoadingMode} mode)`
            );
        }

        // Request total count for better UI feedback
        datasource.requestTotalCount(true);

        if (dataLoadingMode === "all") {
            console.debug(`useTreeDataSource.ts [DATALOAD]by[ALL]: Loading all data at once`);
            updateFilter();
        } else {
            // Phase 1: Always start by loading level 0 nodes
            console.debug(
                `useTreeDataSource.ts [DATALOAD]by[${parentRelationType.toUpperCase()}]: Building level 0 root filter`
            );

            const level0Filter = buildRootNodeFilterForAnyType({
                parentRelationType,
                parentIdAttribute,
                parentAssociation,
                structureIdAttribute,
                levelAttribute,
                rootLevel: 0
            });

            if (level0Filter) {
                console.debug(
                    `useTreeDataSource.ts [DATALOAD]by[${parentRelationType.toUpperCase()}]: Level 0 filter created successfully, applying to datasource`
                );
                filterManagerRef.current.structureFilter = level0Filter;
                updateFilter();

                // Phase 2: Load additional levels based on defaultExpandLevel
                if (config.defaultExpandLevel && config.defaultExpandLevel > 0) {
                    console.debug(
                        `useTreeDataSource.ts [DATALOAD]: Scheduling load of levels up to ${config.defaultExpandLevel}`
                    );
                    // We'll load these levels after root nodes are loaded
                    // Store this for the datasource change effect to handle
                    pendingDefaultExpandRef.current = config.defaultExpandLevel;
                }
            } else {
                console.warn(
                    `useTreeDataSource.ts [DATALOAD]by[${parentRelationType.toUpperCase()}]: Could not build root node filter, loading all data instead`
                );
                filterManagerRef.current.structureFilter = undefined;
                updateFilter();
            }
        }
    }, [
        dataLoadingMode,
        parentRelationType,
        parentIdAttribute,
        parentAssociation,
        structureIdAttribute,
        levelAttribute,
        updateFilter,
        datasource
    ]);

    /**
     * Process batch load queue
     */
    const processBatchLoadQueue = useCallback(() => {
        if (batchLoadQueueRef.current.size === 0) {
            console.debug(`useTreeDataSource.ts [DATALOAD]by[BATCH]: No nodes in batch queue, skipping`);
            return;
        }

        const nodeIds = Array.from(batchLoadQueueRef.current);
        console.debug(
            `useTreeDataSource.ts [DATALOAD]by[BATCH]: Processing ${
                nodeIds.length
            } nodes from batch queue: [${nodeIds.join(", ")}]`
        );
        batchLoadQueueRef.current.clear();

        // Create filters for all queued nodes
        const filters: FilterCondition[] = [];

        nodeIds.forEach(nodeId => {
            const node = nodeMap.get(nodeId);
            if (!node) {
                console.warn(`useTreeDataSource.ts [DATALOAD]by[BATCH]: Node ${nodeId} not found in nodeMap`);
                return;
            }
            if (pendingLoadRef.current.has(nodeId)) {
                console.debug(`useTreeDataSource.ts [DATALOAD]by[BATCH]: Node ${nodeId} already pending, skipping`);
                return;
            }

            pendingLoadRef.current.add(nodeId);

            if (parentRelationType === "structureId" && node.structureId) {
                console.debug(
                    `useTreeDataSource.ts [DATALOAD]by[STRUCTUREID]: Building children filter for parent ${nodeId} with structureId "${node.structureId}"`
                );
                const structureFilter = buildStructureIDChildrenFilter(structureIdAttribute!, node.structureId);
                if (structureFilter) {
                    console.debug(
                        `useTreeDataSource.ts [DATALOAD]by[STRUCTUREID]: Filter created for structureId "${node.structureId}", added to batch`
                    );
                    filters.push(structureFilter);
                } else {
                    console.warn(
                        `useTreeDataSource.ts [DATALOAD]by[STRUCTUREID]: Failed to create filter for structureId "${node.structureId}"`
                    );
                }
            } else if (parentIdAttribute) {
                console.debug(
                    `useTreeDataSource.ts [DATALOAD]by[PARENTID]: Building children filter for parent ${nodeId}`
                );
                const filter = buildChildrenFilter(parentIdAttribute, nodeId);
                if (filter) {
                    console.debug(
                        `useTreeDataSource.ts [DATALOAD]by[PARENTID]: Filter created for parentId "${nodeId}", added to batch`
                    );
                    filters.push(filter);
                } else {
                    console.warn(
                        `useTreeDataSource.ts [DATALOAD]by[PARENTID]: Failed to create filter for parentId "${nodeId}"`
                    );
                }
            } else {
                console.warn(
                    `useTreeDataSource.ts [DATALOAD]by[UNKNOWN]: No valid parent relation method available for node ${nodeId}`
                );
            }
        });

        if (filters.length > 0) {
            console.debug(
                `useTreeDataSource.ts [DATALOAD]by[BATCH]: Combining ${filters.length} filters with OR logic and applying to datasource`
            );
            // Mark that we're loading children
            isLoadingChildrenRef.current = true;
            // Combine all filters with OR logic for batch loading
            const batchFilter = combineFiltersOr(filters);
            if (batchFilter) {
                filterManagerRef.current.structureFilter = batchFilter;
            }
            updateFilter();
        } else {
            console.warn(
                `useTreeDataSource.ts [DATALOAD]by[BATCH]: No valid filters created from ${nodeIds.length} nodes`
            );
        }
    }, [nodeMap, parentRelationType, structureIdAttribute, parentIdAttribute, updateFilter]);

    /**
     * Load children of a specific node (with batching)
     * TODO ENHANCE: Add loading state tracking per node
     * TODO FIX: Show skeleton nodes while loading
     * TODO ENHANCE: Add failure handling and retry logic
     * TODO FIX: Implement request cancellation for collapsed nodes
     */
    const loadChildren = useCallback(
        (nodeId: string, immediate = false) => {
            const node = nodeMap.get(nodeId);

            if (!node) {
                console.warn(
                    `useTreeDataSource.ts [DATALOAD]: Node ${nodeId} not found in nodeMap, cannot load children`
                );
                return;
            }
            if (pendingLoadRef.current.has(nodeId)) {
                console.debug(`useTreeDataSource.ts [DATALOAD]: Node ${nodeId} already pending load, skipping`);
                return;
            }
            if (childrenLoadedRef.current.has(nodeId)) {
                console.debug(`useTreeDataSource.ts [DATALOAD]: Children of node ${nodeId} already loaded, skipping`);
                return;
            }

            const loadMode = immediate ? "IMMEDIATE" : "BATCH";
            console.debug(
                `useTreeDataSource.ts [DATALOAD]by[${loadMode}]: Starting child load for node ${nodeId} (structureId: "${
                    node.structureId || "none"
                }")`
            );

            if (immediate) {
                // Load immediately without batching
                pendingLoadRef.current.add(nodeId);
                isLoadingChildrenRef.current = true; // Mark that we're loading children

                if (parentRelationType === "structureId" && node.structureId) {
                    console.debug(
                        `useTreeDataSource.ts [DATALOAD]by[STRUCTUREID]: Building immediate children filter for structureId "${node.structureId}"`
                    );
                    const childFilter = buildStructureIDChildrenFilter(structureIdAttribute!, node.structureId);
                    if (childFilter) {
                        console.debug(
                            `useTreeDataSource.ts [DATALOAD]by[STRUCTUREID]: Filter created, applying to datasource immediately`
                        );
                        filterManagerRef.current.structureFilter = childFilter;
                    } else {
                        console.error(
                            `useTreeDataSource.ts [DATALOAD]by[STRUCTUREID]: Failed to create children filter for structureId "${node.structureId}"`
                        );
                    }
                    updateFilter();
                } else {
                    console.debug(
                        `useTreeDataSource.ts [DATALOAD]by[PARENTID]: Building immediate children filter for parentId "${nodeId}"`
                    );
                    const childFilter = buildChildrenFilter(parentIdAttribute!, nodeId);
                    if (childFilter) {
                        console.debug(
                            `useTreeDataSource.ts [DATALOAD]by[PARENTID]: Filter created, applying to datasource immediately`
                        );
                        filterManagerRef.current.structureFilter = childFilter;
                    } else {
                        console.error(
                            `useTreeDataSource.ts [DATALOAD]by[PARENTID]: Failed to create children filter for parentId "${nodeId}"`
                        );
                    }
                    updateFilter();
                }
            } else {
                // Add to batch queue
                console.debug(
                    `useTreeDataSource.ts [DATALOAD]by[BATCH]: Adding node ${nodeId} to batch queue (current queue size: ${batchLoadQueueRef.current.size})`
                );
                batchLoadQueueRef.current.add(nodeId);

                // Clear existing timeout
                clearTimer(batchLoadTimeoutRef.current);

                // Set new timeout for batch processing (50ms delay)
                console.debug(`useTreeDataSource.ts [DATALOAD]by[BATCH]: Setting 50ms timeout for batch processing`);
                batchLoadTimeoutRef.current = setTimer(() => {
                    processBatchLoadQueue();
                    batchLoadTimeoutRef.current = null;
                }, 50);
            }
        },
        [nodeMap, parentRelationType, structureIdAttribute, parentIdAttribute, updateFilter, processBatchLoadQueue]
    );

    /**
     * Preload nodes in a range (for smart scrolling)
     */
    const preloadRange = useCallback(
        (startStructureId: string, endStructureId: string) => {
            if (!structureIdAttribute) {
                return;
            }

            const rangeFilter = buildStructureIDRangeFilter(structureIdAttribute, startStructureId, endStructureId);

            // Combine with existing filter
            const combinedFilter = combineFilters([currentFilterRef.current, rangeFilter]);
            if (combinedFilter) {
                filterManagerRef.current.structureFilter = combinedFilter;
            }
            updateFilter();
        },
        [structureIdAttribute, updateFilter]
    );

    /**
     * Search nodes
     */
    const searchNodes = useCallback(
        (query: string) => {
            setSearchQuery(query);

            if (!query) {
                // Clear search - restore previous filter
                loadRootNodes();
                return;
            }

            // TODO: Implement filter-based search when search is needed in data source
            // For now, just clear the search
            console.warn("Search in useTreeDataSource needs to be updated for filter-based approach");
            const searchFilter = undefined;

            if (searchFilter) {
                filterManagerRef.current.searchFilter = searchFilter;
            } else {
                filterManagerRef.current.searchFilter = undefined;
            }
            updateFilter();
        },
        [loadRootNodes, updateFilter]
    );

    /**
     * Set user-defined filter from widget configuration
     */
    const setUserFilter = useCallback((filterIndex: number, value: any) => {
        setActiveFilters(prev => {
            const newFilters = new Map(prev);
            if (value === undefined || value === null || value === "") {
                newFilters.delete(`filter_${filterIndex}`);
            } else {
                newFilters.set(`filter_${filterIndex}`, value);
            }
            return newFilters;
        });
    }, []);

    /**
     * Update user filters in filter manager and reload data
     */
    useEffect(() => {
        if (config.filterList && config.filterList.length > 0) {
            filterManagerRef.current.setUserFilters(config.filterList, activeFilters);
            updateFilter();
        }
    }, [activeFilters, config.filterList, datasource, updateFilter]);

    /**
     * Clear all user filters
     */
    const clearUserFilters = useCallback(() => {
        setActiveFilters(new Map());
    }, []);

    /**
     * Handle datasource status changes
     */
    useEffect(() => {
        const items = datasource.items || [];
        const datasourceStatus = datasource.status;

        console.debug(
            `useTreeDataSource.ts [DATASOURCE]: Status change - status: ${datasourceStatus}, items: ${items.length}`
        );

        setIsLoading(isDatasourceLoading(datasource));
        setIsUnavailable(isDatasourceUnavailable(datasource));

        if (isDatasourceAvailable(datasource) && items.length > 0) {
            console.debug(`useTreeDataSource.ts [DATASOURCE]: Processing ${items.length} items from datasource`);

            // Process new items
            const { nodes: newNodes, nodeMap: newNodeMap, rootNodes: newRootNodes } = buildTreeStructure(items);

            console.debug(
                `useTreeDataSource.ts [DATASOURCE]: Built tree structure - nodes: ${newNodes.length}, rootNodes: ${newRootNodes.length}`
            );

            // Log some details about the loaded nodes
            if (newNodes.length > 0) {
                const sampleNodes = newNodes
                    .slice(0, 3)
                    .map(node => `${node.id} (level: ${node.level}, structureId: "${node.structureId || "none"}")`)
                    .join(", ");
                console.debug(
                    `useTreeDataSource.ts [DATASOURCE]: Sample nodes: ${sampleNodes}${newNodes.length > 3 ? "..." : ""}`
                );
            }

            if (newRootNodes.length > 0) {
                const rootNodeIds = newRootNodes.map(node => `${node.id} ("${node.structureId || "none"}")`).join(", ");
                console.debug(`useTreeDataSource.ts [DATASOURCE]: Root nodes found: ${rootNodeIds}`);
            } else {
                console.warn(
                    `useTreeDataSource.ts [DATASOURCE]: No root nodes found in ${newNodes.length} processed items`
                );
            }

            // Add new items to our complete collection
            items.forEach(item => {
                allLoadedItemsRef.current.set(item.id, item);
                loadedNodesRef.current.add(item.id);
            });
            console.debug(
                `useTreeDataSource.ts [DATASOURCE]: Added ${items.length} items to collection, total: ${allLoadedItemsRef.current.size}`
            );

            // Check if we're loading children (have pending loads or have previously loaded items)
            // For structure ID mode, we ALWAYS need to rebuild from all items when we have more than just the initial load
            // Skip this logic for "all" mode since everything is loaded at once
            const isLoadingChildren =
                dataLoadingMode !== "all" &&
                (isLoadingChildrenRef.current ||
                    pendingLoadRef.current.size > 0 ||
                    (parentRelationType === "structureId" && allLoadedItemsRef.current.size > items.length));

            if (isLoadingChildren) {
                // When loading children, rebuild tree from ALL loaded items
                console.debug(
                    `useTreeDataSource.ts [DATASOURCE]: Loading children - rebuilding tree from all ${allLoadedItemsRef.current.size} loaded items`
                );

                // Get all items we've ever loaded
                const allItems = Array.from(allLoadedItemsRef.current.values());

                // Rebuild the entire tree with all items
                const rebuiltTree = buildTreeStructure(allItems);

                // Update all state at once with the rebuilt tree
                setNodes(rebuiltTree.nodes);
                setNodeMap(rebuiltTree.nodeMap);
                setRootNodes(rebuiltTree.rootNodes);

                console.debug(
                    `useTreeDataSource.ts [DATASOURCE]: Tree rebuilt - total nodes: ${rebuiltTree.nodes.length}, roots: ${rebuiltTree.rootNodes.length}`
                );

                // Log parent-child relationships for debugging
                const pendingNodeIds = Array.from(pendingLoadRef.current);
                pendingNodeIds.forEach(parentId => {
                    const parentNode = rebuiltTree.nodeMap.get(parentId);
                    if (parentNode) {
                        console.debug(
                            `useTreeDataSource.ts [DATASOURCE]: Parent ${parentId} now has ${parentNode.children.length} children`
                        );
                    }
                });
            } else {
                // For initial loads, clear our collection and start fresh
                allLoadedItemsRef.current.clear();
                items.forEach(item => allLoadedItemsRef.current.set(item.id, item));

                // Just set the new data
                setNodes(newNodes);
                setNodeMap(newNodeMap);
                setRootNodes(newRootNodes);

                console.debug(
                    `useTreeDataSource.ts [DATASOURCE]: Initial load - nodes: ${newNodes.length}, roots: ${newRootNodes.length}`
                );
            }

            // Track which parent nodes had their children loaded
            const pendingNodeIds = Array.from(pendingLoadRef.current);
            if (pendingNodeIds.length > 0) {
                // For each pending node, check if we found any children
                pendingNodeIds.forEach(parentId => {
                    const hasLoadedChildren = newNodes.some(node => {
                        if (parentRelationType === "structureId") {
                            // For structure ID, check if this node's structure ID indicates it's a child
                            const parentNode = nodeMap.get(parentId);
                            return (
                                parentNode?.structureId && node.structureId?.startsWith(parentNode.structureId + ".")
                            );
                        } else {
                            // For parent ID/association, check direct parent relationship
                            return node.parentId === parentId;
                        }
                    });

                    if (hasLoadedChildren || dataLoadingMode !== "all") {
                        // Mark this parent as having its children loaded
                        // (even if no children found, we tried to load them)
                        childrenLoadedRef.current.add(parentId);
                        console.debug(
                            `useTreeDataSource.ts [DATASOURCE]: Marked node ${parentId} as having children loaded`
                        );
                    }
                });
            }

            // Clear pending loads
            const pendingCount = pendingLoadRef.current.size;
            pendingLoadRef.current.clear();
            isLoadingChildrenRef.current = false; // Clear the loading children flag
            if (pendingCount > 0) {
                console.debug(`useTreeDataSource.ts [DATASOURCE]: Cleared ${pendingCount} pending loads`);
            }

            // Handle pending default expand level
            if (pendingDefaultExpandRef.current !== null && !isLoadingChildren) {
                const expandLevel = pendingDefaultExpandRef.current;
                pendingDefaultExpandRef.current = null; // Clear it so we only do this once

                console.debug(`useTreeDataSource.ts [DATASOURCE]: Processing default expand level ${expandLevel}`);

                // Find all nodes that should be expanded based on level
                const nodesToExpand: string[] = [];
                const nodesToLoadChildren: string[] = [];

                // Function to recursively find nodes to expand
                const findNodesToExpand = (nodes: TreeNode[], currentLevel: number) => {
                    if (currentLevel >= expandLevel) {
                        return;
                    }

                    nodes.forEach(node => {
                        // Mark for expansion
                        nodesToExpand.push(node.id);

                        // If children not loaded yet, mark for loading
                        if (node.children.length === 0 && !node.isLeaf && !childrenLoadedRef.current.has(node.id)) {
                            nodesToLoadChildren.push(node.id);
                        } else if (node.children.length > 0) {
                            // Recursively check children
                            findNodesToExpand(node.children, currentLevel + 1);
                        }
                    });
                };

                // Start from root nodes
                findNodesToExpand(newRootNodes, 0);

                console.debug(
                    `useTreeDataSource.ts [DATASOURCE]: Found ${nodesToExpand.length} nodes to expand, ${nodesToLoadChildren.length} need children loaded`
                );

                // Update expanded nodes
                if (nodesToExpand.length > 0) {
                    setExpandedNodes(prev => {
                        const newExpanded = new Set(prev);
                        nodesToExpand.forEach(id => newExpanded.add(id));
                        return newExpanded;
                    });
                }

                // Load children for nodes that need them
                if (nodesToLoadChildren.length > 0) {
                    // Batch load all children at once
                    nodesToLoadChildren.forEach(nodeId => {
                        loadChildren(nodeId);
                    });
                }
            }
        } else if (items.length === 0 && isDatasourceAvailable(datasource)) {
            console.warn(`useTreeDataSource.ts [DATASOURCE]: Datasource available but returned 0 items`);
        }
    }, [datasource.items, datasource.status, buildTreeStructure, parentRelationType, dataLoadingMode, loadChildren]);

    /**
     * Initial load
     */
    useEffect(() => {
        loadRootNodes();
    }, [loadRootNodes]);

    /**
     * Clean up when key props change or component unmounts
     */
    useEffect(() => {
        return () => {
            // Clear all collections on unmount
            allLoadedItemsRef.current.clear();
            loadedNodesRef.current.clear();
            childrenLoadedRef.current.clear();
            pendingLoadRef.current.clear();
            batchLoadQueueRef.current.clear();
            if (batchLoadTimeoutRef.current) {
                clearTimer(batchLoadTimeoutRef.current);
            }
        };
    }, [datasource, parentRelationType, dataLoadingMode]); // Re-run cleanup if datasource, parent relation type, or loading mode changes

    /**
     * Handle expanded nodes changes
     */
    useEffect(() => {
        if (dataLoadingMode === "progressive") {
            // Load children for newly expanded nodes (using batching)
            expandedNodes.forEach(nodeId => {
                if (!childrenLoadedRef.current.has(nodeId)) {
                    loadChildren(nodeId); // Uses batching by default
                }
            });
        }
    }, [expandedNodes, dataLoadingMode, loadChildren]);

    /**
     * Memory management functions
     */
    const recordActivity = useCallback((type: "mouse" | "keyboard" | "scroll" | "focus" | "expand") => {
        if (memoryManagerRef.current) {
            memoryManagerRef.current.recordActivity(type);
        }
    }, []);

    const updateViewport = useCallback((visibleNodeIds: string[]) => {
        if (memoryManagerRef.current) {
            memoryManagerRef.current.updateViewport(visibleNodeIds);
        }
    }, []);

    const getMemoryStats = useCallback(() => {
        if (memoryManagerRef.current) {
            return memoryManagerRef.current.getStats();
        }
        return null;
    }, []);

    /**
     * Cleanup on unmount
     */
    useEffect(() => {
        return () => {
            clearTimer(batchLoadTimeoutRef.current);
            if (memoryManagerRef.current) {
                memoryManagerRef.current.destroy();
            }
        };
    }, []);

    return {
        // Data
        nodes,
        nodeMap,
        rootNodes,
        isLoading,
        isUnavailable,

        // Actions
        loadChildren,
        preloadRange,
        searchNodes,
        setExpandedNodes,

        // Filter actions (following Gallery widget pattern)
        setUserFilter,
        clearUserFilters,
        activeFilters,

        // Search state
        searchQuery,
        isSearching: searchQuery.length > 0,

        // Metadata
        totalCount: datasource.totalCount,
        hasMore: datasource.hasMoreItems,

        // Direct datasource access for advanced use cases
        datasource,

        // Memory management
        recordActivity,
        updateViewport,
        getMemoryStats,

        // Internal refs for advanced operations (selection, drag-drop)
        allLoadedItemsRef
    };
}
