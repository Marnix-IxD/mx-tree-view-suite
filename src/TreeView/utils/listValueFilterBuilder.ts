/**
 * Filter Builder for TreeView
 * Creates standard Mendix filters for tree operations
 * Optimized for required sortOrder and level attributes
 */

import { FilterCondition } from "mendix/filters";
import {
    and,
    or,
    equals,
    startsWith,
    attribute,
    association,
    literal,
    greaterThan,
    lessThan,
    greaterThanOrEqual,
    lessThanOrEqual
} from "mendix/filters/builders";
import { ListAttributeValue, ListReferenceValue } from "mendix";
import { Big } from "big.js";
import { createEmptyResultFilter } from "./filterHelpers";

/**
 * Build filter to find children of a node using parent ID attribute
 */
export function buildChildrenByParentIdFilter(
    parentIdAttribute: ListAttributeValue<string | Big>,
    parentNodeId: string
): FilterCondition {
    return equals(attribute(parentIdAttribute.id), literal(parentNodeId));
}

/**
 * Build filter to find a parent node by ID
 */
export function buildParentByIdFilter(
    nodeIdAttribute: ListAttributeValue<string | Big>,
    parentId: string
): FilterCondition {
    return equals(attribute(nodeIdAttribute.id), literal(parentId));
}

/**
 * Build filter to find children using association
 * Note: This assumes the association points from child to parent
 * @param parentAssociation - The association reference value from Mendix
 * @param parentNodeId - The GUID of the parent node
 */
export function buildChildrenByAssociationFilter(
    parentAssociation: ListReferenceValue,
    parentNodeId: string
): FilterCondition {
    // For associations, we use the association builder with the id property
    // This creates a filter like: [TreeNode_Parent = 'parentGuid']
    // Following the official Mendix pattern
    return equals(association(parentAssociation.id), literal(parentNodeId));
}

/**
 * Build filter to find ancestors using structure IDs
 * E.g., for node "1.2.3", find "1." and "1.2."
 */
export function buildAncestorsByStructureIdFilter(
    structureIdAttribute: ListAttributeValue<string>,
    nodeStructureId: string
): FilterCondition | undefined {
    const ancestorIds = extractAncestorStructureIds(nodeStructureId);

    if (ancestorIds.length === 0) {
        return undefined;
    }

    if (ancestorIds.length === 1) {
        return equals(attribute(structureIdAttribute.id), literal(ancestorIds[0]));
    }

    // Build OR condition for all ancestor IDs
    return or(...ancestorIds.map(id => equals(attribute(structureIdAttribute.id), literal(id))));
}

/**
 * Build filter to find all descendants using structure ID prefix
 * E.g., for node "1.2.", find all nodes starting with "1.2."
 */
export function buildDescendantsByStructureIdFilter(
    structureIdAttribute: ListAttributeValue<string>,
    nodeStructureId: string
): FilterCondition {
    // Ensure the structure ID ends with a dot for prefix matching
    const prefix = nodeStructureId.endsWith(".") ? nodeStructureId : nodeStructureId + ".";
    return startsWith(attribute(structureIdAttribute.id), literal(prefix));
}

/**
 * Build filter for nodes at a specific depth using the level attribute
 * Much more efficient than parsing structure IDs
 */
export function buildDepthFilter(
    levelAttribute: ListAttributeValue<Big>,
    minDepth: number,
    maxDepth?: number
): FilterCondition {
    if (maxDepth === undefined || minDepth === maxDepth) {
        // Single depth
        return equals(attribute(levelAttribute.id), literal(new Big(minDepth)));
    }

    // Range of depths
    return and(
        greaterThanOrEqual(attribute(levelAttribute.id), literal(new Big(minDepth))),
        lessThanOrEqual(attribute(levelAttribute.id), literal(new Big(maxDepth)))
    );
}

/**
 * Build filter for root nodes only using level attribute
 * Root nodes have level = 1
 */
export function buildRootNodesFilter(levelAttribute: ListAttributeValue<Big>): FilterCondition {
    return equals(attribute(levelAttribute.id), literal(new Big(1)));
}

/**
 * Build filter for root nodes with structure ID fallback
 * Use when you need structure ID based root filtering
 */
export function buildRootNodesByStructureIdFilter(
    structureIdAttribute: ListAttributeValue<string>,
    maxRootId = 20
): FilterCondition {
    // Generate root patterns up to maxRootId
    const rootPatterns: string[] = [];
    for (let i = 1; i <= maxRootId; i++) {
        rootPatterns.push(`${i}.`);
    }

    return or(...rootPatterns.map(pattern => equals(attribute(structureIdAttribute.id), literal(pattern))));
}

/**
 * Validate if a structure ID follows our convention
 * Valid structure IDs must end with a dot and contain only numbers and dots
 */
export function isValidStructureId(structureId: string): boolean {
    // Must end with a dot
    if (!structureId.endsWith(".")) {
        return false;
    }

    // Must match pattern: numbers separated by dots, ending with a dot
    // Examples: "1.", "1.2.", "1.2.3."
    const pattern = /^\d+(\.\d+)*\.$/;
    return pattern.test(structureId);
}

/**
 * Build filter for search with ancestor expansion
 * Includes both matching nodes and their ancestors
 */
export function buildSearchWithAncestorsFilter(
    searchFilter: FilterCondition,
    structureIdAttribute: ListAttributeValue<string>,
    commonAncestorPatterns: string[]
): FilterCondition {
    // Build ancestor conditions
    const ancestorConditions = commonAncestorPatterns.map(pattern =>
        equals(attribute(structureIdAttribute.id), literal(pattern))
    );

    // Combine: (search matches) OR (is ancestor)
    if (ancestorConditions.length === 0) {
        return searchFilter;
    }

    return or(searchFilter, ...ancestorConditions);
}

/**
 * Extract ancestor structure IDs from a node's structure ID
 * E.g., "1.2.3" -> ["1.", "1.2."]
 */
function extractAncestorStructureIds(structureId: string): string[] {
    const parts = structureId.split(".");
    const ancestors: string[] = [];

    // Build each ancestor level
    for (let i = 1; i < parts.length - 1; i++) {
        ancestors.push(parts.slice(0, i).join(".") + ".");
    }

    return ancestors;
}

/**
 * Build filter for multiple node IDs
 */
export function buildMultipleIdsFilter(
    nodeIdAttribute: ListAttributeValue<string | Big>,
    nodeIds: string[]
): FilterCondition {
    if (nodeIds.length === 0) {
        return createEmptyResultFilter();
    }

    if (nodeIds.length === 1) {
        return equals(attribute(nodeIdAttribute.id), literal(nodeIds[0]));
    }

    return or(...nodeIds.map(id => equals(attribute(nodeIdAttribute.id), literal(id))));
}

/**
 * Build filter to find nodes within a sort order range
 * This is useful for finding all descendants of a node
 */
export function buildSortOrderRangeFilter(
    sortOrderAttribute: ListAttributeValue<Big>,
    minSortOrder: number,
    maxSortOrder: number
): FilterCondition {
    return and(
        greaterThanOrEqual(attribute(sortOrderAttribute.id), literal(new Big(minSortOrder))),
        lessThanOrEqual(attribute(sortOrderAttribute.id), literal(new Big(maxSortOrder)))
    );
}

/**
 * Build filter to find ancestors using sort order and level
 * Ancestors have lower sort order values and lower level than the node
 */
export function buildAncestorsBySortOrderFilter(
    sortOrderAttribute: ListAttributeValue<Big>,
    nodeSortOrder: number,
    levelAttribute: ListAttributeValue<Big>,
    nodeLevel: number
): FilterCondition {
    return and(
        lessThan(attribute(sortOrderAttribute.id), literal(new Big(nodeSortOrder))),
        lessThan(attribute(levelAttribute.id), literal(new Big(nodeLevel)))
    );
}

/**
 * Build filter to find the immediate parent using sort order and level
 * The parent is the node with the highest sort order that has level = child level - 1
 */
export function buildParentBySortOrderFilter(
    sortOrderAttribute: ListAttributeValue<Big>,
    childSortOrder: number,
    levelAttribute: ListAttributeValue<Big>,
    childLevel: number
): FilterCondition {
    if (childLevel <= 1) {
        // Root nodes have no parent
        return createEmptyResultFilter();
    }

    return and(
        lessThan(attribute(sortOrderAttribute.id), literal(new Big(childSortOrder))),
        equals(attribute(levelAttribute.id), literal(new Big(childLevel - 1)))
    );
}

/**
 * Build filter to find immediate children using sort order and level
 * Children have level = parent level + 1 and sort order > parent
 */
export function buildChildrenBySortOrderFilter(
    sortOrderAttribute: ListAttributeValue<Big>,
    parentSortOrder: number,
    levelAttribute: ListAttributeValue<Big>,
    parentLevel: number,
    nextSiblingSortOrder?: number
): FilterCondition {
    const conditions: FilterCondition[] = [
        greaterThan(attribute(sortOrderAttribute.id), literal(new Big(parentSortOrder))),
        equals(attribute(levelAttribute.id), literal(new Big(parentLevel + 1)))
    ];

    // If we know the next sibling's sort order, children must be before it
    if (nextSiblingSortOrder !== undefined) {
        conditions.push(lessThan(attribute(sortOrderAttribute.id), literal(new Big(nextSiblingSortOrder))));
    }

    return and(...conditions);
}

/**
 * Build filter for subtree using sort order
 * Gets all descendants within a sort order range
 */
export function buildSubtreeBySortOrderFilter(
    sortOrderAttribute: ListAttributeValue<Big>,
    rootSortOrder: number,
    subtreeEndSortOrder: number
): FilterCondition {
    return and(
        greaterThan(attribute(sortOrderAttribute.id), literal(new Big(rootSortOrder))),
        lessThan(attribute(sortOrderAttribute.id), literal(new Big(subtreeEndSortOrder)))
    );
}

/**
 * Build filter to find nodes at specific level with sort order constraints
 * Useful for finding siblings or nodes at the same level within a range
 */
export function buildLevelWithSortOrderFilter(
    levelAttribute: ListAttributeValue<Big>,
    targetLevel: number,
    sortOrderAttribute: ListAttributeValue<Big>,
    minSortOrder?: number,
    maxSortOrder?: number
): FilterCondition {
    const conditions: FilterCondition[] = [equals(attribute(levelAttribute.id), literal(new Big(targetLevel)))];

    if (minSortOrder !== undefined) {
        conditions.push(greaterThanOrEqual(attribute(sortOrderAttribute.id), literal(new Big(minSortOrder))));
    }

    if (maxSortOrder !== undefined) {
        conditions.push(lessThanOrEqual(attribute(sortOrderAttribute.id), literal(new Big(maxSortOrder))));
    }

    return and(...conditions);
}

/**
 * Build filter to find siblings of a node
 * Siblings have the same level and are within the parent's subtree
 */
export function buildSiblingsFilter(
    levelAttribute: ListAttributeValue<Big>,
    nodeLevel: number,
    sortOrderAttribute: ListAttributeValue<Big>,
    parentSortOrder: number,
    parentNextSiblingSortOrder?: number
): FilterCondition {
    const conditions: FilterCondition[] = [
        equals(attribute(levelAttribute.id), literal(new Big(nodeLevel))),
        greaterThan(attribute(sortOrderAttribute.id), literal(new Big(parentSortOrder)))
    ];

    if (parentNextSiblingSortOrder !== undefined) {
        conditions.push(lessThan(attribute(sortOrderAttribute.id), literal(new Big(parentNextSiblingSortOrder))));
    }

    return and(...conditions);
}

/**
 * Build filter to find the next sibling of a node
 * Next sibling has the same level and the next higher sort order
 */
export function buildNextSiblingFilter(
    levelAttribute: ListAttributeValue<Big>,
    nodeLevel: number,
    sortOrderAttribute: ListAttributeValue<Big>,
    nodeSortOrder: number,
    parentNextSiblingSortOrder?: number
): FilterCondition {
    const conditions: FilterCondition[] = [
        equals(attribute(levelAttribute.id), literal(new Big(nodeLevel))),
        greaterThan(attribute(sortOrderAttribute.id), literal(new Big(nodeSortOrder)))
    ];

    if (parentNextSiblingSortOrder !== undefined) {
        conditions.push(lessThan(attribute(sortOrderAttribute.id), literal(new Big(parentNextSiblingSortOrder))));
    }

    return and(...conditions);
}

/**
 * Build filter to find the previous sibling of a node
 * Previous sibling has the same level and the next lower sort order
 */
export function buildPreviousSiblingFilter(
    levelAttribute: ListAttributeValue<Big>,
    nodeLevel: number,
    sortOrderAttribute: ListAttributeValue<Big>,
    nodeSortOrder: number,
    parentSortOrder: number
): FilterCondition {
    return and(
        equals(attribute(levelAttribute.id), literal(new Big(nodeLevel))),
        lessThan(attribute(sortOrderAttribute.id), literal(new Big(nodeSortOrder))),
        greaterThan(attribute(sortOrderAttribute.id), literal(new Big(parentSortOrder)))
    );
}

/**
 * Build filter for visible nodes in a virtualized tree
 * Gets nodes within a sort order range that should be visible
 */
export function buildVisibleNodesFilter(
    sortOrderAttribute: ListAttributeValue<Big>,
    startSortOrder: number,
    endSortOrder: number,
    expandedNodeSortOrders?: number[]
): FilterCondition {
    const baseFilter = buildSortOrderRangeFilter(sortOrderAttribute, startSortOrder, endSortOrder);

    if (!expandedNodeSortOrders || expandedNodeSortOrders.length === 0) {
        return baseFilter;
    }

    // For more complex visibility logic, you might need to combine with level checks
    // or use the expanded state to determine which nodes should be visible
    return baseFilter;
}

/**
 * Build filter for progressive loading
 * Loads nodes up to a certain level initially, then loads deeper levels on demand
 */
export function buildProgressiveLoadFilter(
    levelAttribute: ListAttributeValue<Big>,
    maxInitialLevel: number,
    expandedNodeLevels?: Map<string, number>
): FilterCondition {
    if (!expandedNodeLevels || expandedNodeLevels.size === 0) {
        // Initial load: only nodes up to maxInitialLevel
        return lessThanOrEqual(attribute(levelAttribute.id), literal(new Big(maxInitialLevel)));
    }

    // Load deeper levels for expanded nodes
    const conditions: FilterCondition[] = [
        lessThanOrEqual(attribute(levelAttribute.id), literal(new Big(maxInitialLevel)))
    ];

    // Add conditions for expanded nodes
    expandedNodeLevels.forEach((maxLevel, _nodeId) => {
        if (maxLevel > maxInitialLevel) {
            conditions.push(lessThanOrEqual(attribute(levelAttribute.id), literal(new Big(maxLevel))));
        }
    });

    return or(...conditions);
}

/**
 * Build filter to find nodes that need their sort order updated
 * Used after drag-drop operations
 */
export function buildSortOrderUpdateFilter(
    sortOrderAttribute: ListAttributeValue<Big>,
    affectedRangeStart: number,
    affectedRangeEnd: number
): FilterCondition {
    return buildSortOrderRangeFilter(sortOrderAttribute, affectedRangeStart, affectedRangeEnd);
}
