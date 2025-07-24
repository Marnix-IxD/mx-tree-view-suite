/**
 * Tree Filter Orchestrator
 *
 * Purpose: Orchestrates the use of two different filtering systems:
 * 1. ListValue filters (via listValueFilterBuilder) - for standard filtering
 * 2. mx.data queries (via mxDataQueryBuilder) - for complex queries
 *
 * Responsibilities:
 * - Decides which filtering system to use based on the query complexity
 * - Manages filter state (parent, search, user filters)
 * - Converts mx.data results to ListValue filters using filterBridge
 * - Combines multiple filters intelligently
 */

import { FilterCondition } from "mendix/filters";
import { and, equals, contains, literal, or, attribute } from "mendix/filters/builders";
import { FilterListType } from "../../../typings/TreeViewProps";
import { createEmptyResultFilter } from "./filterHelpers";
import {
    buildChildrenByParentIdFilter,
    buildChildrenByAssociationFilter,
    buildSearchWithAncestorsFilter,
    buildAncestorsBySortOrderFilter,
    buildRootNodesFilter,
    buildRootNodesByStructureIdFilter
} from "./listValueFilterBuilder";
import { buildStructureIDRangeFilter, buildSearchFilter, combineFiltersWithPriority } from "./datasourceFilterBuilder";
import { findAncestors, createAncestorStructureIdPatterns } from "./treeTraversal";
import { ObjectItem, ListAttributeValue, ListReferenceValue } from "mendix";
import { Big } from "big.js";
import { MxDataQueryBuilder, createMxDataQueryBuilder } from "./mxDataQueryBuilder";
import {
    convertSearchResultsToFilter,
    convertChildrenResultsToFilter,
    convertAncestorResultsToFilter
} from "./filterBridge";

export interface ITreeFilterOrchestrator {
    // Tree-specific filters (structural)
    parentFilter?: FilterCondition;
    structureFilter?: FilterCondition;
    searchFilter?: FilterCondition;

    // User-defined filters (from widget configuration)
    userFilters: FilterCondition[];

    // Combined result
    getCombinedFilter(): FilterCondition | undefined;

    // Search configuration
    setSearchConfiguration(minChars: number, scalingDelay: boolean): void;
}

export interface ITreeFilterConfig {
    structureIdAttribute?: ListAttributeValue<string>;
    parentIdAttribute?: ListAttributeValue<string | Big>;
    nodeIdAttribute?: ListAttributeValue<string | Big>;
    parentAssociation?: ListReferenceValue;
    sortOrderAttribute: ListAttributeValue<Big>; // Sort order for efficient tree queries
    depthAttribute: ListAttributeValue<Big>; // Depth level for hierarchy queries
    allItems?: ObjectItem[]; // For ancestor traversal
    entity?: string; // Entity name for mx.data queries
    enableMxDataResolver?: boolean; // Enable advanced context resolution
}

/**
 * Manages all filter types for TreeView:
 * 1. Structural filters (parent/child relationships, structure IDs)
 * 2. Search filters (text search across attributes)
 * 3. User filters (configured filter attributes from XML)
 */
export class TreeFilterOrchestrator implements ITreeFilterOrchestrator {
    parentFilter?: FilterCondition;
    structureFilter?: FilterCondition;
    searchFilter?: FilterCondition;
    userFilters: FilterCondition[] = [];

    // Configuration
    private config: ITreeFilterConfig;
    private searchMinChars = 6;
    private searchScalingDelay = true;

    // State for advanced filtering
    private matchingNodeIds: Set<string> = new Set();
    private ancestorNodeIds: Set<string> = new Set();

    // MxData query builder for complex queries
    private queryBuilder?: MxDataQueryBuilder;

    constructor(config: ITreeFilterConfig) {
        this.config = config;

        // Initialize query builder if enabled
        if (config.enableMxDataResolver && config.entity) {
            this.queryBuilder = createMxDataQueryBuilder(config.entity, {
                nodeId: config.nodeIdAttribute?.id,
                structureId: config.structureIdAttribute?.id,
                parentId: config.parentIdAttribute?.id
            });
        }
    }

    /**
     * Set search configuration
     */
    setSearchConfiguration(minChars: number, scalingDelay: boolean): void {
        this.searchMinChars = Math.max(3, Math.min(10, minChars));
        this.searchScalingDelay = scalingDelay;
    }

    /**
     * Set parent relationship filter (for loading children of specific node)
     */
    setParentFilter(
        nodeId: string,
        parentIdAttribute?: ListAttributeValue<string | Big>,
        parentAssociation?: ListReferenceValue
    ): void {
        if (parentIdAttribute) {
            // Use standard filter for parent ID based trees
            this.parentFilter = buildChildrenByParentIdFilter(parentIdAttribute, nodeId);
        } else if (parentAssociation) {
            // Use standard filter for association based trees
            // The association points from child to parent
            this.parentFilter = buildChildrenByAssociationFilter(parentAssociation, nodeId);
            console.debug(`Set parent filter for association ${parentAssociation.id} = ${nodeId}`);
        }
    }

    /**
     * Set structure ID range filter (for loading nodes within structure ID range)
     */
    setStructureFilter(startStructureId: string, endStructureId: string, structureIdAttribute?: string): void {
        if (structureIdAttribute) {
            this.structureFilter = buildStructureIDRangeFilter(
                structureIdAttribute as any,
                startStructureId,
                endStructureId
            );
        }
    }

    /**
     * Set search filter (for text search across searchable attributes)
     * Respects minimum character requirements
     */
    setSearchFilter(query: string, searchableAttributes?: string[]): void {
        // Check minimum character requirement
        const trimmedQuery = query.trim();
        if (trimmedQuery.length < this.searchMinChars) {
            this.searchFilter = undefined;
            return;
        }

        if (searchableAttributes && searchableAttributes.length > 0) {
            this.searchFilter = buildSearchFilter(trimmedQuery, searchableAttributes as any[]);
        } else {
            this.searchFilter = undefined;
        }
    }

    /**
     * Advanced search with ancestor context resolution
     * Uses mx.data to find matching nodes and their ancestors
     */
    async setAdvancedSearchFilter(query: string, searchableAttributes: string[]): Promise<FilterCondition | undefined> {
        const trimmedQuery = query.trim();
        if (trimmedQuery.length < this.searchMinChars) {
            this.searchFilter = undefined;
            return undefined;
        }

        // If query builder is available, use it for advanced search
        if (this.queryBuilder && searchableAttributes.length > 0) {
            try {
                console.debug("Using mx.data query builder for advanced search");

                // Get search results including ancestors
                const results = await this.queryBuilder.resolveSearchContext(trimmedQuery, searchableAttributes);

                // Update internal state
                this.matchingNodeIds = new Set(results.matchingIds);
                this.ancestorNodeIds = new Set(results.ancestorIds);

                // Convert mx.data results to ListValue filter using bridge
                this.searchFilter = convertSearchResultsToFilter(results, this.config.nodeIdAttribute!);
                return this.searchFilter;
            } catch (error) {
                console.error("Advanced search failed, falling back to basic search:", error);
                // Fall back to basic search
                this.setSearchFilter(query, searchableAttributes);
                return this.searchFilter;
            }
        } else {
            // Use basic search
            this.setSearchFilter(query, searchableAttributes);
            return this.searchFilter;
        }
    }

    /**
     * Get search delay based on query length and scaling configuration
     */
    getSearchDelay(query: string): number {
        const trimmedLength = query.trim().length;

        // Query too short
        if (trimmedLength < this.searchMinChars) {
            return -1; // Indicates search should not execute
        }

        // Base delay
        let delay = 300; // Base debounce

        // Add scaling delay if enabled
        if (this.searchScalingDelay) {
            const charsBelowDefault = Math.max(0, 6 - trimmedLength); // 6 is the default
            const scalingDelay = charsBelowDefault * 200; // 200ms per character
            delay += scalingDelay;
        }

        return delay;
    }

    /**
     * Set user-defined filters from widget configuration
     */
    setUserFilters(filterList: FilterListType[], activeFilters: Map<string, any>): void {
        this.userFilters = [];

        filterList.forEach((filterConfig, index) => {
            const filterValue = activeFilters.get(`filter_${index}`);
            if (filterValue !== undefined && filterValue !== null && filterValue !== "") {
                // Build filter condition based on attribute type and value
                const filterCondition = this.buildUserFilterCondition(filterConfig, filterValue);
                if (filterCondition) {
                    this.userFilters.push(filterCondition);
                }
            }
        });

        // Clear matching node IDs when filters change
        // These will be populated when the datasource returns results
        this.matchingNodeIds.clear();
        this.ancestorNodeIds.clear();
    }

    /**
     * Update matching node IDs after filter execution
     * This enables proper ancestor expansion for subsequent filter operations
     */
    updateMatchingNodes(matchingItems: ObjectItem[]): void {
        this.matchingNodeIds.clear();

        if (!this.config.nodeIdAttribute) {
            return;
        }

        matchingItems.forEach(item => {
            const nodeIdValue = this.config.nodeIdAttribute!.get(item).value;
            if (nodeIdValue) {
                const nodeId = typeof nodeIdValue === "string" ? nodeIdValue : nodeIdValue.toString();
                this.matchingNodeIds.add(nodeId);
            }
        });

        // If we have structure IDs, also store them for pattern generation
        if (this.config.structureIdAttribute) {
            const structureIds: string[] = [];
            matchingItems.forEach(item => {
                const structureId = this.config.structureIdAttribute!.get(item).value;
                if (structureId) {
                    structureIds.push(structureId);
                }
            });

            // Pre-compute ancestor patterns for next filter operation
            if (structureIds.length > 0) {
                const ancestorPatterns = createAncestorStructureIdPatterns(structureIds);
                console.debug(
                    `Pre-computed ${ancestorPatterns.length} ancestor patterns for ${structureIds.length} matching nodes`
                );
            }
        }
    }

    /**
     * Build filter condition for user-defined filter
     * Based on Gallery widget filter building pattern
     */
    private buildUserFilterCondition(filterConfig: FilterListType, value: any): FilterCondition | undefined {
        const filterAttribute = filterConfig.filter;

        if (!filterAttribute || !filterAttribute.id) {
            return undefined;
        }

        try {
            // Build filter based on attribute type - following Gallery widget pattern
            // Handle different attribute types: String, Boolean, DateTime, Decimal, Enum, Integer, Long

            if (typeof value === "string") {
                // For string values, use contains for partial matching (user-friendly)
                return contains(attribute(filterAttribute.id), literal(value));
            } else if (typeof value === "boolean") {
                // For boolean values, use exact equality
                return equals(attribute(filterAttribute.id), literal(value));
            } else if (typeof value === "number") {
                // For numeric values, use exact equality
                return equals(attribute(filterAttribute.id), literal(new Big(value)));
            } else if (value instanceof Date) {
                // Date values use exact equality by default
                // For advanced date filtering (ranges, presets), use advancedFilterBuilder
                return equals(attribute(filterAttribute.id), literal(value));
            } else {
                // For other types (Enum, etc.), use exact equality
                return equals(attribute(filterAttribute.id), literal(value));
            }
        } catch (error) {
            console.warn("Failed to build filter condition:", {
                attributeId: filterAttribute.id,
                value,
                error
            });
            return undefined;
        }
    }

    /**
     * Clear all filters
     */
    clearAll(): void {
        this.parentFilter = undefined;
        this.structureFilter = undefined;
        this.searchFilter = undefined;
        this.userFilters = [];
    }

    /**
     * Clear only structural filters (keep user filters active)
     */
    clearStructuralFilters(): void {
        this.parentFilter = undefined;
        this.structureFilter = undefined;
    }

    /**
     * Load children context for expanded nodes
     * Uses mx.data to efficiently batch-load children
     */
    async loadChildrenContext(
        parentIds: string[]
    ): Promise<{ filter: FilterCondition; childrenByParent: Map<string, string[]> }> {
        if (!this.queryBuilder || parentIds.length === 0) {
            // Return empty result
            return {
                filter: createEmptyResultFilter(),
                childrenByParent: new Map()
            };
        }

        try {
            console.debug(`Loading children context for ${parentIds.length} parent nodes`);
            const results = await this.queryBuilder.resolveChildrenContext(parentIds);

            // Convert mx.data results to ListValue filter using bridge
            const filter = convertChildrenResultsToFilter(results.childrenByParent, this.config.nodeIdAttribute!);

            // Temporarily set as parent filter
            this.parentFilter = filter;

            return {
                ...results,
                filter
            };
        } catch (error) {
            console.error("Failed to load children context:", error);
            return {
                filter: createEmptyResultFilter(),
                childrenByParent: new Map()
            };
        }
    }

    /**
     * Resolve ancestors for a specific node
     * Useful for expanding tree to show a specific node
     */
    async resolveNodeAncestors(nodeId: string): Promise<{
        ancestorIds: string[];
        filter: FilterCondition;
    }> {
        if (!this.queryBuilder) {
            return {
                ancestorIds: [],
                filter: createEmptyResultFilter()
            };
        }

        try {
            const results = await this.queryBuilder.resolveNodeAncestors(nodeId);

            // Update internal state
            this.ancestorNodeIds = new Set(results.ancestorIds);

            // Convert mx.data results to ListValue filter using bridge
            const filter = convertAncestorResultsToFilter(results.ancestorIds, this.config.nodeIdAttribute!);

            return {
                ancestorIds: results.ancestorIds,
                filter
            };
        } catch (error) {
            console.error("Failed to resolve node ancestors:", error);
            return {
                ancestorIds: [],
                filter: createEmptyResultFilter()
            };
        }
    }

    /**
     * Build expanded user filter that includes ancestor context
     * This makes user filters "expand" the tree to show matching nodes in their hierarchical context
     */
    private buildExpandedUserFilter(): FilterCondition | undefined {
        if (this.userFilters.length === 0) {
            return undefined;
        }

        // Combine user filters
        const combinedUserFilter = this.userFilters.length === 1 ? this.userFilters[0] : and(...this.userFilters);

        // If we have items to traverse, find ancestors of matching nodes
        if (this.config.allItems && this.config.allItems.length > 0 && this.matchingNodeIds.size > 0) {
            // Find ancestors of all matching nodes
            const matchingIds = Array.from(this.matchingNodeIds);
            const ancestorIds = findAncestors(matchingIds, this.config.allItems, {
                structureIdAttribute: this.config.structureIdAttribute,
                parentIdAttribute: this.config.parentIdAttribute,
                nodeIdAttribute: this.config.nodeIdAttribute,
                parentAssociation: this.config.parentAssociation
            });

            // Store for later use
            this.ancestorNodeIds = new Set(ancestorIds);

            // Build filter that includes both matching nodes and their ancestors
            if (this.config.structureIdAttribute) {
                // For structure ID trees, use pattern-based expansion
                const ancestorPatterns = createAncestorStructureIdPatterns(matchingIds);
                return buildSearchWithAncestorsFilter(
                    combinedUserFilter,
                    this.config.structureIdAttribute,
                    ancestorPatterns
                );
            }
        }

        if (this.config.structureIdAttribute) {
            // Structure ID based tree - we can build ancestor expansion
            return this.buildStructureIdExpandedFilter(combinedUserFilter);
        } else if (this.config.parentIdAttribute) {
            // Parent ID based tree - build expanded filter
            return this.buildParentIdExpandedFilter(combinedUserFilter);
        } else {
            // No tree structure info available
            return combinedUserFilter;
        }
    }

    /**
     * Build expanded filter for structure ID based trees
     * Includes: matching nodes + all their ancestors for tree context
     */
    private buildStructureIdExpandedFilter(userFilter: FilterCondition): FilterCondition {
        // For structure ID trees, we want to show:
        // 1. Nodes matching the user filter (original matches)
        // 2. All ancestor nodes of matching nodes (for tree context)

        try {
            if (!this.config.structureIdAttribute) {
                return userFilter;
            }

            // Use sort order attribute for efficient ancestor filtering
            if (this.matchingNodeIds.size > 0 && this.config.allItems) {
                const ancestorFilters: FilterCondition[] = [];
                const minSortOrders: number[] = [];

                // Collect min sort orders from matching nodes
                this.config.allItems.forEach(item => {
                    const nodeId = this.config.nodeIdAttribute?.get(item).value;
                    if (nodeId && this.matchingNodeIds.has(String(nodeId))) {
                        const sortOrder = this.config.sortOrderAttribute.get(item).value;
                        if (sortOrder) {
                            minSortOrders.push(Number(sortOrder));
                        }
                    }
                });

                // Build ancestor filter using minimum sort order
                if (minSortOrders.length > 0) {
                    const minSortOrder = Math.min(...minSortOrders);
                    ancestorFilters.push(
                        buildAncestorsBySortOrderFilter(
                            this.config.sortOrderAttribute,
                            minSortOrder,
                            this.config.depthAttribute,
                            Number.MAX_SAFE_INTEGER // We don't know the node depth here, so use max
                        )
                    );

                    // Combine user filter with ancestor filter
                    return or(userFilter, ...ancestorFilters);
                }
            }

            // Fallback to structure ID pattern matching
            if (this.matchingNodeIds.size > 0 && this.config.allItems) {
                const ancestorStructureIds = new Set<string>();

                // Extract structure IDs of matching nodes and their ancestors
                this.config.allItems.forEach(item => {
                    const nodeId = this.config.nodeIdAttribute?.get(item).value;
                    if (nodeId && this.matchingNodeIds.has(String(nodeId))) {
                        const structureId = this.config.structureIdAttribute?.get(item).value;
                        if (structureId) {
                            // Add all ancestor structure IDs
                            const parts = structureId.split(".");
                            for (let i = 1; i < parts.length - 1; i++) {
                                ancestorStructureIds.add(parts.slice(0, i).join(".") + ".");
                            }
                        }
                    }
                });

                if (ancestorStructureIds.size > 0) {
                    return buildSearchWithAncestorsFilter(
                        userFilter,
                        this.config.structureIdAttribute,
                        Array.from(ancestorStructureIds)
                    );
                }
            }

            // Last resort: Show root nodes for context
            // This ensures users can always see the top-level structure
            // Use level attribute if available, otherwise fall back to structure ID
            const rootNodesFilter = this.config.depthAttribute
                ? buildRootNodesFilter(this.config.depthAttribute)
                : buildRootNodesByStructureIdFilter(this.config.structureIdAttribute);
            return or(userFilter, rootNodesFilter);
        } catch (error) {
            console.warn("Failed to build structure ID expanded filter:", error);
            return userFilter;
        }
    }

    /**
     * Build expanded filter for parent ID based trees
     * This is more complex as it requires traversing relationships
     */
    private buildParentIdExpandedFilter(userFilter: FilterCondition): FilterCondition {
        if (!this.config.parentIdAttribute || !this.config.nodeIdAttribute) {
            return userFilter;
        }

        // Use sort order for efficient ancestor filtering
        if (this.matchingNodeIds.size > 0 && this.config.allItems) {
            const minSortOrders: number[] = [];

            // Collect min sort orders from matching nodes
            this.config.allItems.forEach(item => {
                const nodeId = this.config.nodeIdAttribute?.get(item).value;
                if (nodeId && this.matchingNodeIds.has(String(nodeId))) {
                    const sortOrder = this.config.sortOrderAttribute?.get(item).value;
                    if (sortOrder) {
                        minSortOrders.push(Number(sortOrder));
                    }
                }
            });

            // Build ancestor filter using minimum sort order
            if (minSortOrders.length > 0) {
                const minSortOrder = Math.min(...minSortOrders);
                const ancestorFilter = buildAncestorsBySortOrderFilter(
                    this.config.sortOrderAttribute,
                    minSortOrder,
                    this.config.depthAttribute,
                    Number.MAX_SAFE_INTEGER // We don't know the node depth here, so use max
                );

                return or(userFilter, ancestorFilter);
            }
        }

        // Fallback: Use pre-computed ancestor IDs if available
        if (this.ancestorNodeIds.size > 0) {
            // We have pre-computed ancestor IDs, build a filter for them
            const ancestorConditions = Array.from(this.ancestorNodeIds).map(ancestorId =>
                equals(attribute(this.config.nodeIdAttribute!.id), literal(ancestorId))
            );

            const ancestorFilter = ancestorConditions.length === 1 ? ancestorConditions[0] : or(...ancestorConditions);

            return or(userFilter, ancestorFilter);
        }

        // Without sort order or pre-computed ancestors, we can't expand the filter efficiently
        // Consider enabling mxDataResolver for complex parent ID traversal
        console.debug(
            "Parent ID based filtering - enable sort order attribute or mxDataResolver for ancestor expansion"
        );
        return userFilter;
    }

    /**
     * Get combined filter condition for datasource.setFilter()
     * Uses the smart combination utility with proper prioritization
     */
    getCombinedFilter(): FilterCondition | undefined {
        // Prepare structural filters
        const structuralFilters: FilterCondition[] = [];
        if (this.parentFilter) {
            structuralFilters.push(this.parentFilter);
        }
        if (this.structureFilter) {
            structuralFilters.push(this.structureFilter);
        }

        // Handle expanded user filters separately since they need special processing
        const expandedUserFilter = this.userFilters.length > 0 ? this.buildExpandedUserFilter() : undefined;

        // Use the intelligent filter combination utility
        return combineFiltersWithPriority(
            {
                userFilters: expandedUserFilter ? [expandedUserFilter] : undefined,
                searchFilter: this.searchFilter,
                structuralFilters: structuralFilters.length > 0 ? structuralFilters : undefined
            },
            {
                priorityOrder: ["user", "search", "structural"],
                mode: "first-match", // Use first matching priority
                structuralCombineMode: "and" // Combine structural filters with AND
            }
        );
    }

    /**
     * Get debug information about active filters
     */
    getDebugInfo(): object {
        return {
            hasParentFilter: !!this.parentFilter,
            hasStructureFilter: !!this.structureFilter,
            hasSearchFilter: !!this.searchFilter,
            userFilterCount: this.userFilters.length,
            totalFilters: [this.parentFilter, this.structureFilter, this.searchFilter, ...this.userFilters].filter(
                Boolean
            ).length
        };
    }
}
