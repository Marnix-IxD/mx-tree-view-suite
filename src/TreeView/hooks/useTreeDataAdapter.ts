import { useMemo } from "react";
import { TreeViewContainerProps } from "../../../typings/TreeViewProps";
import { useTreeData } from "./useTreeData";
import { useTreeDataSource } from "./useTreeDataSource";

/**
 * Adapter hook that provides tree data using either:
 * 1. Full data loading approach (useTreeData) - for smaller datasets or "all" mode
 * 2. Progressive loading with datasource.setFilter() (useTreeDataSource) - for larger datasets
 */
export function useTreeDataAdapter(props: TreeViewContainerProps) {
    // Check if datasource exists and is available
    const hasValidDatasource = props.datasource && props.datasource.status === "available";

    // Full data loading approach (for "all" mode or smaller datasets)
    const fullDataApproach = useTreeData({
        datasource: props.datasource,
        nodeIdAttribute: props.nodeIdAttribute,
        parentRelationType: props.parentRelationType,
        parentIdAttribute: props.parentIdAttribute,
        parentAssociation: props.parentAssociation,
        structureIdAttribute: props.structureIdAttribute,
        sortOrderAttribute: props.sortOrderAttribute,
        visibilityAttribute: props.visibilityAttribute,
        defaultExpandLevel: props.defaultExpandLevel,
        dataLoadingMode: props.dataLoadingMode,
        levelAttribute: props.levelAttribute,
        initialLoadLimit: props.initialLoadLimit,
        debugMode: props.debugMode
    });

    // Progressive loading approach with datasource.setFilter() (for larger datasets)
    const progressiveDataApproach = useTreeDataSource({
        datasource: props.datasource,
        nodeIdAttribute: props.nodeIdAttribute!,
        nodeLabelAttribute: props.nodeLabelAttribute,
        nodeLabelExpression: props.nodeLabelExpression,
        parentRelationType: props.parentRelationType,
        parentIdAttribute: props.parentIdAttribute,
        parentAssociation: props.parentAssociation,
        structureIdAttribute: props.structureIdAttribute,
        filterList: props.filterList,
        dataLoadingMode: props.dataLoadingMode || "progressive",
        defaultExpandLevel: props.defaultExpandLevel,
        visibilityAttribute: props.visibilityAttribute,
        hasChildrenAttribute: props.hasChildrenAttribute,
        childCountAttribute: props.childCountAttribute,
        levelAttribute: props.levelAttribute,
        sortOrderAttribute: props.sortOrderAttribute,
        // Memory management - enable for large datasets
        enableMemoryManagement: true,
        maxCacheSize: 5000,
        cacheTimeout: props.cacheTimeout || 60,
        itemHeight: props.itemHeight || 32
    });

    // Choose which implementation to use
    const dataImplementation = useMemo(() => {
        // Use progressive loading with datasource.setFilter() when available unless dataLoadingMode is "all"
        if (hasValidDatasource && props.dataLoadingMode !== "all") {
            return {
                nodes: progressiveDataApproach.nodes,
                nodeMap: progressiveDataApproach.nodeMap,
                rootNodes: progressiveDataApproach.rootNodes,
                isLoading: progressiveDataApproach.isLoading,
                isUnavailable: progressiveDataApproach.isUnavailable,
                loadChildren: progressiveDataApproach.loadChildren,
                refreshNodes: () => {
                    // Refresh by triggering datasource reload
                    progressiveDataApproach.setExpandedNodes(new Set());
                    window.setTimeout(() => {
                        // Re-expand previously expanded nodes by triggering a new search
                        if (progressiveDataApproach.searchQuery) {
                            progressiveDataApproach.searchNodes(progressiveDataApproach.searchQuery);
                        }
                    }, 0);
                },
                getDescendantIds: fullDataApproach.getDescendantIds, // Reuse from full data approach
                getAncestorIds: fullDataApproach.getAncestorIds, // Reuse from full data approach
                searchNodes: progressiveDataApproach.searchNodes,
                setUserFilter: progressiveDataApproach.setUserFilter,
                clearUserFilters: progressiveDataApproach.clearUserFilters,
                activeFilters: progressiveDataApproach.activeFilters,
                updateVisibleNodes: (nodeIds: string[]) => {
                    // Convert visible nodes to expanded nodes
                    const expanded = new Set<string>();
                    nodeIds.forEach(id => {
                        const node = progressiveDataApproach.nodeMap.get(id);
                        if (node && node.parentId) {
                            expanded.add(node.parentId);
                        }
                    });
                    // Expand all ancestors of visible nodes
                    const allAncestors = new Set<string>();
                    nodeIds.forEach(id => {
                        let currentId = id;
                        while (currentId) {
                            const node = progressiveDataApproach.nodeMap.get(currentId);
                            if (node && node.parentId) {
                                allAncestors.add(node.parentId);
                                currentId = node.parentId;
                            } else {
                                break;
                            }
                        }
                    });
                    progressiveDataApproach.setExpandedNodes(allAncestors);
                },
                updateSelectedNodes: () => {
                    /* Not needed with progressive loading */
                }, // TODO REVIEW TOMORROW - Empty function
                preloadRange: progressiveDataApproach.preloadRange,
                searchResults: [], // Progressive approach doesn't have searchResults property
                isSearching: progressiveDataApproach.isSearching,
                isUsingMxData: false,
                isUsingDatasource: true,
                // Memory management functions
                recordActivity: progressiveDataApproach.recordActivity,
                updateViewport: progressiveDataApproach.updateViewport,
                getMemoryStats: progressiveDataApproach.getMemoryStats,
                // Internal refs for advanced operations (selection, drag-drop)
                allLoadedItemsRef: progressiveDataApproach.allLoadedItemsRef
            };
        } else {
            // Use full data loading approach (for "all" mode or fallback)
            return {
                ...fullDataApproach,
                // TODO REVIEW TOMORROW - CRITICAL: Accessing datasource.status without null check
                isUnavailable: props.datasource?.status === "unavailable",
                isUsingMxData: false,
                isUsingDatasource: false,
                // Add stub methods for compatibility
                // TODO REVIEW TOMORROW - Multiple empty functions that should be implemented
                // These empty stubs could cause the widget to not function properly
                updateVisibleNodes: () => {
                    /* TODO FIX: Implement for full data mode */
                },
                updateSelectedNodes: () => {
                    /* TODO FIX: Implement for full data mode */
                },
                preloadRange: async () => {
                    /* TODO FIX: Implement for full data mode */
                },
                setUserFilter: () => {
                    /* TODO FIX: Implement for full data mode */
                },
                clearUserFilters: () => {
                    /* TODO FIX: Implement for full data mode */
                },
                activeFilters: new Map(),
                searchResults: [],
                isSearching: false,
                // Memory management stubs for full data mode
                recordActivity: () => {
                    /* Not implemented for full data mode */
                },
                updateViewport: () => {
                    /* Not implemented for full data mode */
                },
                getMemoryStats: (): any => null,
                // Internal refs for advanced operations (selection, drag-drop)
                allLoadedItemsRef: undefined // Not available in full data mode
            };
        }
    }, [hasValidDatasource, props.dataLoadingMode, progressiveDataApproach, fullDataApproach]);

    return dataImplementation;
}
