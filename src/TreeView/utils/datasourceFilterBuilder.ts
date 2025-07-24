import { FilterCondition } from "mendix/filters";
import {
    literal,
    equals,
    contains,
    startsWith,
    and,
    or,
    notEqual,
    attribute,
    association,
    empty
} from "mendix/filters/builders";
import { ListAttributeValue, ListReferenceValue } from "mendix";
import { Big } from "big.js";

/**
 * Filter builder utilities for tree data structures
 * Aligned with Mendix datasource.setFilter() patterns
 */

/**
 * Builds a filter for root nodes (nodes without parent)
 */
export function buildRootNodeFilter(
    parentAttribute?: ListAttributeValue<string | Big>,
    parentAssociation?: ListReferenceValue
): FilterCondition | undefined {
    if (parentAttribute) {
        // Parent ID is empty/null
        return or(equals(attribute(parentAttribute.id), literal("")), equals(attribute(parentAttribute.id), empty()));
    }

    if (parentAssociation) {
        // Parent association is empty
        return equals(association(parentAssociation.id), empty());
    }

    return undefined;
}

/**
 * Builds a filter for root nodes using level attribute
 * This is the most reliable way to find root nodes
 * @param levelAttribute - The attribute containing the node's level/depth
 * @param rootLevel - The level value for root nodes (typically 0 or 1)
 */
export function buildRootNodeFilterByLevel(
    levelAttribute: ListAttributeValue<Big>,
    rootLevel = 1
): FilterCondition | undefined {
    if (!levelAttribute) {
        return undefined;
    }

    // Filter for nodes at the root level
    return equals(attribute(levelAttribute.id), literal(new Big(rootLevel)));
}

/**
 * Builds a comprehensive root node filter that works for all parent relation types
 * This is the production-grade approach that handles all cases
 * @param config - Configuration containing all possible parent relation attributes
 * @returns A filter condition that identifies root nodes
 */
export function buildRootNodeFilterForAnyType(config: {
    parentRelationType: "attribute" | "association" | "structureId";
    parentIdAttribute?: ListAttributeValue<string | Big>;
    parentAssociation?: ListReferenceValue;
    structureIdAttribute?: ListAttributeValue<string>;
    levelAttribute?: ListAttributeValue<Big>;
    rootLevel?: number;
}): FilterCondition | undefined {
    const { parentRelationType, parentIdAttribute, parentAssociation, levelAttribute, rootLevel = 0 } = config;

    console.debug(
        `datasourceFilterBuilder.ts [FILTER]by[${parentRelationType.toUpperCase()}]: Building root node filter (rootLevel: ${rootLevel})`
    );

    // If we have a level attribute, use it regardless of parent relation type
    // This is the most reliable method
    if (levelAttribute) {
        console.debug(
            `datasourceFilterBuilder.ts [FILTER]by[LEVEL]: Using level attribute for root filter (level: ${rootLevel})`
        );
        return buildRootNodeFilterByLevel(levelAttribute, rootLevel);
    }

    // Otherwise, fall back to parent relation type specific filters
    switch (parentRelationType) {
        case "attribute":
            console.debug(`datasourceFilterBuilder.ts [FILTER]by[PARENTID]: Using parent ID attribute for root filter`);
            return buildRootNodeFilter(parentIdAttribute);

        case "association":
            console.debug(
                `datasourceFilterBuilder.ts [FILTER]by[ASSOCIATION]: Using parent association for root filter`
            );
            return buildRootNodeFilter(undefined, parentAssociation);

        case "structureId":
            console.debug(
                `datasourceFilterBuilder.ts [FILTER]by[STRUCTUREID]: Using structure ID pattern matching for root filter`
            );
            // For structure IDs without level attribute, use a pattern-based approach
            if (config.structureIdAttribute) {
                const structureIdAttr = config.structureIdAttribute;
                // Root nodes typically have structure IDs like "1.", "2.", "3."
                // (single number followed by dot, no nested dots)
                // We'll create filters for common root patterns
                console.debug(
                    `datasourceFilterBuilder.ts [FILTER]by[STRUCTUREID]: Creating patterns for root structure IDs (1. to 20.)`
                );
                const rootPatterns = Array.from({ length: 20 }, (_, i) =>
                    equals(attribute(structureIdAttr.id), literal(`${i + 1}.`))
                );

                console.debug(
                    `datasourceFilterBuilder.ts [FILTER]by[STRUCTUREID]: Built ${rootPatterns.length} root patterns`
                );
                return and(
                    // Must have a structure ID
                    notEqual(attribute(structureIdAttr.id), literal("")),
                    notEqual(attribute(structureIdAttr.id), empty()),
                    // Match root patterns (1., 2., 3., etc.)
                    or(...rootPatterns)
                );
            }
            console.warn(`datasourceFilterBuilder.ts [FILTER]by[STRUCTUREID]: No structureIdAttribute provided`);
            return undefined;

        default:
            console.error(
                `datasourceFilterBuilder.ts [FILTER]by[UNKNOWN]: Unknown parent relation type: ${parentRelationType}`
            );
            return undefined;
    }
}

/**
 * Builds a filter for children of a specific parent
 */
export function buildChildrenFilter(
    parentAttribute: ListAttributeValue<string | Big>,
    parentId: string
): FilterCondition | undefined {
    if (!parentAttribute || !parentId) {
        return undefined;
    }

    return equals(attribute(parentAttribute.id), literal(parentId));
}

/**
 * Builds a filter for direct children of a structure ID parent
 * For parent "1.", this will find children "1.1.", "1.2.", etc. (direct children only)
 */
export function buildStructureIDChildrenFilter(
    structureIdAttribute: ListAttributeValue<string>,
    parentStructureId: string
): FilterCondition | undefined {
    if (!structureIdAttribute || !parentStructureId) {
        console.warn(
            `datasourceFilterBuilder.ts [FILTER]by[STRUCTUREID]: Missing required parameters - structureIdAttribute: ${!!structureIdAttribute}, parentStructureId: "${parentStructureId}"`
        );
        return undefined;
    }

    // Remove trailing dot if present for consistent processing
    const cleanParent = parentStructureId.endsWith(".") ? parentStructureId.slice(0, -1) : parentStructureId;

    console.debug(
        `datasourceFilterBuilder.ts [FILTER]by[STRUCTUREID]: Building children filter for parent "${parentStructureId}" (cleaned: "${cleanParent}")`
    );

    // For parent "1", we want to match "1.1.", "1.2.", etc. but not "1.1.1."
    // This means we need structure IDs that start with the parent + "." and have exactly one more segment
    const conditions: FilterCondition[] = [];

    // Generate patterns for likely child structure IDs (1-50 should cover most cases)
    console.debug(
        `datasourceFilterBuilder.ts [FILTER]by[STRUCTUREID]: Generating child patterns for "${cleanParent}" (1-50)`
    );
    for (let i = 1; i <= 50; i++) {
        const childPattern = `${cleanParent}.${i}.`;
        conditions.push(equals(attribute(structureIdAttribute.id), literal(childPattern)));
    }

    console.debug(
        `datasourceFilterBuilder.ts [FILTER]by[STRUCTUREID]: Created ${conditions.length} child patterns (e.g., "${cleanParent}.1.", "${cleanParent}.2.", ...)`
    );

    return conditions.length > 0 ? or(...conditions) : undefined;
}

/**
 * Builds a filter for nodes within a structure ID range
 * e.g., "1.1" to "1.3" would match "1.1", "1.1.1", "1.2", "1.2.1", "1.3", etc.
 */
export function buildStructureIDRangeFilter(
    structureIdAttribute: ListAttributeValue<string>,
    startId: string,
    endId: string
): FilterCondition | undefined {
    if (!structureIdAttribute || !startId || !endId) {
        return undefined;
    }

    // Extract the common prefix
    const startParts = startId.split(".");
    const endParts = endId.split(".");
    const minLength = Math.min(startParts.length, endParts.length);

    let commonPrefix = "";
    for (let i = 0; i < minLength - 1; i++) {
        if (startParts[i] === endParts[i]) {
            commonPrefix += (commonPrefix ? "." : "") + startParts[i];
        } else {
            break;
        }
    }

    if (commonPrefix) {
        // All nodes under the common prefix that fall within range
        const conditions: FilterCondition[] = [];

        // Direct matches
        conditions.push(equals(attribute(structureIdAttribute.id), literal(startId)));
        conditions.push(equals(attribute(structureIdAttribute.id), literal(endId)));

        // Children of start and end nodes
        conditions.push(startsWith(attribute(structureIdAttribute.id), literal(startId + ".")));
        conditions.push(startsWith(attribute(structureIdAttribute.id), literal(endId + ".")));

        // Nodes between start and end at the same level
        const startLastPart = parseInt(startParts[startParts.length - 1]);
        const endLastPart = parseInt(endParts[endParts.length - 1]);

        for (let i = startLastPart + 1; i < endLastPart; i++) {
            const betweenId = commonPrefix + (commonPrefix ? "." : "") + i;
            conditions.push(startsWith(attribute(structureIdAttribute.id), literal(betweenId)));
        }

        return or(...conditions);
    }

    // Fallback to simple range
    return or(
        startsWith(attribute(structureIdAttribute.id), literal(startId)),
        startsWith(attribute(structureIdAttribute.id), literal(endId))
    );
}

/**
 * Builds a filter for nodes with specific structure ID prefixes
 * Used for batch loading multiple branches
 */
export function buildStructureIDPrefixFilter(
    structureIdAttribute: ListAttributeValue<string>,
    prefixes: string[]
): FilterCondition | undefined {
    if (!structureIdAttribute || !prefixes || prefixes.length === 0) {
        return undefined;
    }

    const conditions = prefixes.map(prefix => startsWith(attribute(structureIdAttribute.id), literal(prefix + ".")));

    return conditions.length === 1 ? conditions[0] : or(...conditions);
}

/**
 * Builds a search filter across multiple attributes of different types
 * Supports String, Integer, Long, Decimal, Boolean, DateTime, and Enum types
 */
export function buildSearchFilter(
    searchText: string,
    searchAttributes: Array<ListAttributeValue<string | Big | boolean | Date>>
): FilterCondition | undefined {
    if (!searchText || !searchAttributes || searchAttributes.length === 0) {
        return undefined;
    }

    const conditions: FilterCondition[] = [];

    searchAttributes.forEach(attr => {
        // For string attributes, use contains filter
        // For numeric attributes (Integer, Long, Decimal), try to parse and use equals
        // For boolean, check if search text is "true" or "false"
        // For dates, this would need more complex parsing

        // Since we can't determine the actual type at runtime without the value,
        // we'll use a heuristic approach:

        // Try string contains (works for String and Enum types)
        conditions.push(contains(attribute(attr.id), literal(searchText)));

        // Try numeric equals if search text is a number
        const numericValue = parseFloat(searchText);
        if (!isNaN(numericValue)) {
            conditions.push(equals(attribute(attr.id), literal(new Big(numericValue))));
        }

        // Try boolean equals if search text is "true" or "false"
        if (searchText.toLowerCase() === "true") {
            conditions.push(equals(attribute(attr.id), literal(true)));
        } else if (searchText.toLowerCase() === "false") {
            conditions.push(equals(attribute(attr.id), literal(false)));
        }
    });

    return conditions.length === 1 ? conditions[0] : or(...conditions);
}

/**
 * Builds a filter for visible nodes based on expansion state
 * This helps optimize data loading by only fetching visible nodes
 */
export function buildVisibleNodesFilter(
    structureIdAttribute: ListAttributeValue<string>,
    expandedStructureIds: string[]
): FilterCondition | undefined {
    if (!structureIdAttribute || !expandedStructureIds || expandedStructureIds.length === 0) {
        // If nothing expanded, only show root nodes
        return or(
            notEqual(attribute(structureIdAttribute.id), empty()),
            equals(attribute(structureIdAttribute.id), literal(""))
        );
    }

    const conditions: FilterCondition[] = [];

    // Add root level condition (no dots in structure ID)
    conditions.push(
        and(
            notEqual(attribute(structureIdAttribute.id), empty())
            // TODO: This is tricky - we need a "not contains" filter
            // For now, we'll need to handle this differently
        )
    );

    // Add conditions for children of expanded nodes
    expandedStructureIds.forEach(structureId => {
        conditions.push(startsWith(attribute(structureIdAttribute.id), literal(structureId + ".")));
    });

    return or(...conditions);
}

/**
 * Combines multiple filters with AND logic
 */
export function combineFilters(filters: Array<FilterCondition | undefined>): FilterCondition | undefined {
    const validFilters = filters.filter(f => f !== undefined) as FilterCondition[];

    if (validFilters.length === 0) {
        return undefined;
    }

    if (validFilters.length === 1) {
        return validFilters[0];
    }

    return and(...validFilters);
}

/**
 * Combines multiple filters with OR logic
 * Used for batch loading multiple node branches
 */
export function combineFiltersOr(filters: Array<FilterCondition | undefined>): FilterCondition | undefined {
    const validFilters = filters.filter(f => f !== undefined) as FilterCondition[];

    if (validFilters.length === 0) {
        return undefined;
    }

    if (validFilters.length === 1) {
        return validFilters[0];
    }

    return or(...validFilters);
}

/**
 * Helper to build a filter that excludes already loaded nodes
 * Useful for progressive loading scenarios
 */
export function buildExcludeLoadedFilter(
    nodeIdAttribute: ListAttributeValue<string>,
    loadedNodeIds: string[]
): FilterCondition | undefined {
    if (!nodeIdAttribute || !loadedNodeIds || loadedNodeIds.length === 0) {
        return undefined;
    }

    // Create NOT conditions for each loaded ID
    const conditions = loadedNodeIds.map(id => notEqual(attribute(nodeIdAttribute.id), literal(id)));

    return and(...conditions);
}

/**
 * Filter priority types for smart combination
 */
export type FilterPriority = "user" | "search" | "structural";

/**
 * Options for combining filters with priority
 */
export interface CombineFiltersWithPriorityOptions {
    /**
     * Order of filter precedence (default: ["user", "search", "structural"])
     */
    priorityOrder?: FilterPriority[];

    /**
     * Whether to expand context for user filters (show ancestors)
     */
    expandUserFilterContext?: boolean;

    /**
     * Whether to expand context for search filters
     */
    expandSearchContext?: boolean;

    /**
     * How to combine structural filters (default: "and")
     */
    structuralCombineMode?: "and" | "or";

    /**
     * Whether to return first matching priority or combine all
     */
    mode?: "first-match" | "combine-all";
}

/**
 * Combines filters with intelligent prioritization
 * Smart combination: user filters expand tree context, structural filters maintain current view
 *
 * @param filters Object containing different filter types
 * @param options Configuration for how to combine filters
 * @returns Combined filter condition or undefined
 */
export function combineFiltersWithPriority(
    filters: {
        userFilters?: FilterCondition[];
        searchFilter?: FilterCondition;
        structuralFilters?: FilterCondition[];
    },
    options: CombineFiltersWithPriorityOptions = {}
): FilterCondition | undefined {
    const {
        priorityOrder = ["user", "search", "structural"],
        expandUserFilterContext: _expandUserFilterContext = true,
        expandSearchContext: _expandSearchContext = true,
        structuralCombineMode = "and",
        mode = "first-match"
    } = options;

    const activeFilters: Array<{ type: FilterPriority; filter: FilterCondition }> = [];

    // Build user filter combination
    if (filters.userFilters && filters.userFilters.length > 0) {
        const userFilter = filters.userFilters.length === 1 ? filters.userFilters[0] : and(...filters.userFilters);

        // Note: Context expansion would be handled by the caller
        // This utility focuses on combination logic
        activeFilters.push({ type: "user", filter: userFilter });
    }

    // Add search filter
    if (filters.searchFilter) {
        activeFilters.push({ type: "search", filter: filters.searchFilter });
    }

    // Build structural filter combination
    if (filters.structuralFilters && filters.structuralFilters.length > 0) {
        const structuralFilter =
            filters.structuralFilters.length === 1
                ? filters.structuralFilters[0]
                : structuralCombineMode === "and"
                ? and(...filters.structuralFilters)
                : or(...filters.structuralFilters);

        activeFilters.push({ type: "structural", filter: structuralFilter });
    }

    // No active filters
    if (activeFilters.length === 0) {
        return undefined;
    }

    // Apply priority logic
    if (mode === "first-match") {
        // Return the first filter type that has a value, based on priority order
        for (const priority of priorityOrder) {
            const match = activeFilters.find(f => f.type === priority);
            if (match) {
                return match.filter;
            }
        }
    } else {
        // Combine all active filters
        const allFilters = activeFilters.map(f => f.filter);
        return allFilters.length === 1 ? allFilters[0] : and(...allFilters);
    }

    return undefined;
}

/**
 * Helper to build filter with ancestor context expansion
 * This is useful for showing filtered nodes within their tree hierarchy
 */
export function buildContextExpandedFilter(
    baseFilter: FilterCondition,
    structureIdAttribute?: ListAttributeValue<string>,
    ancestorPatterns?: string[]
): FilterCondition {
    if (!structureIdAttribute || !ancestorPatterns || ancestorPatterns.length === 0) {
        return baseFilter;
    }

    // Build ancestor filters using structure ID patterns
    const ancestorFilters = ancestorPatterns.map(pattern =>
        startsWith(attribute(structureIdAttribute.id), literal(pattern))
    );

    // Combine: (base filter) OR (any ancestor pattern)
    const ancestorFilter = ancestorFilters.length === 1 ? ancestorFilters[0] : or(...ancestorFilters);

    return or(baseFilter, ancestorFilter);
}
