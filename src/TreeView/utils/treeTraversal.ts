import { TreeNode } from "../types/TreeTypes";
import { ObjectItem, ListAttributeValue, ListReferenceValue } from "mendix";
import { Big } from "big.js";

/**
 * Tree traversal utilities optimized for performance
 * These functions provide efficient ways to traverse and collect data from tree structures
 */

/**
 * Get descendant IDs using an efficient iterative approach with pre-allocated array
 * This version is optimized for large trees and avoids the overhead of recursive calls
 *
 * @param node - The node whose descendants to collect
 * @param includeNode - Whether to include the node itself in the result (default: false)
 * @returns Array of descendant IDs
 */
export function getDescendantIds(node: TreeNode, includeNode = false): string[] {
    // Pre-allocate array with estimated size to avoid resizing
    const estimatedSize = node.hasChildren ? 100 : 10;
    const ids: string[] = new Array(estimatedSize);
    ids.length = 0; // Reset length to 0 while keeping the allocated memory

    // Use iterative approach with stack for better performance
    const stack: TreeNode[] = includeNode ? [node] : [...node.children];

    while (stack.length > 0) {
        const current = stack.pop()!;
        ids.push(current.id);

        // Add children to stack in reverse order to maintain traversal order
        if (current.children.length > 0) {
            for (let i = current.children.length - 1; i >= 0; i--) {
                stack.push(current.children[i]);
            }
        }
    }

    return ids;
}

/**
 * Get descendant IDs with a callback function for filtering
 * This allows efficient collection of only the IDs that match certain criteria
 *
 * @param node - The node whose descendants to collect
 * @param predicate - Optional filter function
 * @param includeNode - Whether to include the node itself
 * @returns Filtered array of descendant IDs
 */
export function getFilteredDescendantIds(
    node: TreeNode,
    predicate?: (node: TreeNode) => boolean,
    includeNode = false
): string[] {
    const ids: string[] = [];
    const stack: TreeNode[] = includeNode ? [node] : [...node.children];

    while (stack.length > 0) {
        const current = stack.pop()!;

        if (!predicate || predicate(current)) {
            ids.push(current.id);
        }

        if (current.children.length > 0) {
            for (let i = current.children.length - 1; i >= 0; i--) {
                stack.push(current.children[i]);
            }
        }
    }

    return ids;
}

/**
 * Create a function that efficiently gets descendant IDs using a pre-built Map
 * This is the most efficient approach for repeated lookups
 *
 * @param nodeMap - Map of all nodes by ID
 * @param childrenMap - Pre-computed map of parent ID to child IDs
 * @returns Function to get descendant IDs
 */
export function createGetDescendantIds(
    _nodeMap: Map<string, TreeNode>,
    childrenMap: Map<string, string[]>
): (nodeId: string, includeNode?: boolean) => string[] {
    // Cache for memoization
    const cache = new Map<string, string[]>();

    return (nodeId: string, includeNode = false): string[] => {
        // Check cache first
        const cacheKey = `${nodeId}_${includeNode}`;
        const cached = cache.get(cacheKey);
        if (cached) {
            return cached;
        }

        const ids: string[] = [];
        const stack: string[] = includeNode ? [nodeId] : [];

        // Add direct children
        const directChildren = childrenMap.get(nodeId);
        if (directChildren) {
            stack.push(...directChildren);
        }

        // Process stack
        while (stack.length > 0) {
            const currentId = stack.pop()!;
            ids.push(currentId);

            const children = childrenMap.get(currentId);
            if (children && children.length > 0) {
                stack.push(...children);
            }
        }

        // Cache result
        cache.set(cacheKey, ids);
        return ids;
    };
}

/**
 * Build a children map for efficient traversal
 * This should be called once when the tree structure changes
 *
 * @param nodes - All nodes in the tree
 * @returns Map of parent ID to array of child IDs
 */
export function buildChildrenMap(nodes: TreeNode[]): Map<string, string[]> {
    const childrenMap = new Map<string, string[]>();

    const processNode = (node: TreeNode) => {
        if (node.children.length > 0) {
            childrenMap.set(
                node.id,
                node.children.map(child => child.id)
            );
            node.children.forEach(processNode);
        }
    };

    nodes.forEach(processNode);
    return childrenMap;
}

/**
 * Get all ancestors of a node
 *
 * @param nodeId - The node whose ancestors to find
 * @param nodeMap - Map of all nodes
 * @param includeNode - Whether to include the node itself
 * @returns Array of ancestor IDs from closest to root
 */
export function getAncestorIds(nodeId: string, nodeMap: Map<string, TreeNode>, includeNode = false): string[] {
    const ancestors: string[] = [];
    let currentId: string | null = includeNode ? nodeId : null;
    const node = nodeMap.get(nodeId);

    if (!node) {
        return ancestors;
    }

    // Start from parent if not including node
    currentId = includeNode ? nodeId : node.parentId;

    while (currentId) {
        const current = nodeMap.get(currentId);
        if (!current) {
            break;
        }

        ancestors.push(currentId);
        currentId = current.parentId;
    }

    return ancestors;
}

/**
 * Get all sibling IDs of a node
 *
 * @param nodeId - The node whose siblings to find
 * @param nodeMap - Map of all nodes
 * @param includeNode - Whether to include the node itself
 * @returns Array of sibling IDs
 */
export function getSiblingIds(nodeId: string, nodeMap: Map<string, TreeNode>, includeNode = false): string[] {
    const node = nodeMap.get(nodeId);
    if (!node || !node.parentId) {
        return includeNode && node ? [nodeId] : [];
    }

    const parent = nodeMap.get(node.parentId);
    if (!parent) {
        return includeNode ? [nodeId] : [];
    }

    return parent.children.map(child => child.id).filter(id => includeNode || id !== nodeId);
}

/**
 * Count total descendants efficiently
 *
 * @param node - The node whose descendants to count
 * @param includeNode - Whether to include the node itself in the count
 * @returns Total number of descendants
 */
export function countDescendants(node: TreeNode, includeNode = false): number {
    let count = includeNode ? 1 : 0;
    const stack = [...node.children];

    while (stack.length > 0) {
        const current = stack.pop()!;
        count++;

        if (current.children.length > 0) {
            stack.push(...current.children);
        }
    }

    return count;
}

/**
 * Check if a node has any descendants matching a predicate
 * This is more efficient than getting all descendants when you only need to check existence
 *
 * @param node - The node to check
 * @param predicate - Function to test descendants
 * @returns True if any descendant matches
 */
export function hasDescendantMatching(node: TreeNode, predicate: (node: TreeNode) => boolean): boolean {
    const stack = [...node.children];

    while (stack.length > 0) {
        const current = stack.pop()!;

        if (predicate(current)) {
            return true;
        }

        if (current.children.length > 0) {
            stack.push(...current.children);
        }
    }

    return false;
}

/**
 * Find ancestor IDs for a list of node IDs by traversing ObjectItems
 * This is used by the filter orchestrator to expand filters to include ancestors
 *
 * @param nodeIds - Array of node IDs to find ancestors for
 * @param items - All available object items
 * @param config - Configuration for tree structure
 * @returns Array of unique ancestor IDs
 */
export function findAncestors(
    nodeIds: string[],
    items: ObjectItem[],
    config: {
        structureIdAttribute?: ListAttributeValue<string>;
        parentIdAttribute?: ListAttributeValue<string | Big>;
        nodeIdAttribute?: ListAttributeValue<string | Big>;
        parentAssociation?: ListReferenceValue;
    }
): string[] {
    const ancestorIds = new Set<string>();
    const nodeIdSet = new Set(nodeIds);

    if (!config.nodeIdAttribute) {
        return [];
    }

    // Build a map for efficient lookups
    const itemsByNodeId = new Map<string, ObjectItem>();
    const parentIdMap = new Map<string, string>();

    // First pass: build lookup maps
    items.forEach(item => {
        const nodeIdValue = config.nodeIdAttribute!.get(item).value;
        if (nodeIdValue) {
            const nodeId = typeof nodeIdValue === "string" ? nodeIdValue : nodeIdValue.toString();
            itemsByNodeId.set(nodeId, item);

            // Store parent relationship
            if (config.parentIdAttribute) {
                const parentIdValue = config.parentIdAttribute.get(item).value;
                if (parentIdValue) {
                    const parentId = typeof parentIdValue === "string" ? parentIdValue : parentIdValue.toString();
                    parentIdMap.set(nodeId, parentId);
                }
            } else if (config.parentAssociation) {
                const parentRef = config.parentAssociation.get(item);
                const parentValue = parentRef.value;
                const parentItem = Array.isArray(parentValue) ? parentValue[0] : parentValue;

                if (parentItem) {
                    // Find parent ID from parent item
                    const parentNodeIdValue = config.nodeIdAttribute!.get(parentItem).value;
                    if (parentNodeIdValue) {
                        const parentId =
                            typeof parentNodeIdValue === "string" ? parentNodeIdValue : parentNodeIdValue.toString();
                        parentIdMap.set(nodeId, parentId);
                    }
                }
            }
        }
    });

    // Second pass: find ancestors for each node
    nodeIds.forEach(nodeId => {
        let currentId: string | undefined = nodeId;

        // Traverse up the tree
        while (currentId && parentIdMap.has(currentId)) {
            const parentId: string = parentIdMap.get(currentId)!;
            if (!nodeIdSet.has(parentId)) {
                ancestorIds.add(parentId);
            }
            currentId = parentId;
        }

        // Alternative: Use structure IDs if available
        if (config.structureIdAttribute && itemsByNodeId.has(nodeId)) {
            const item = itemsByNodeId.get(nodeId)!;
            const structureId = config.structureIdAttribute.get(item).value;

            if (structureId) {
                // Extract ancestor structure IDs
                const parts = structureId.split(".");
                for (let i = 1; i < parts.length; i++) {
                    const ancestorStructureId = parts.slice(0, i).join(".");

                    // Find node with this structure ID
                    for (const [ancestorNodeId, ancestorItem] of itemsByNodeId) {
                        const ancestorStructId = config.structureIdAttribute.get(ancestorItem).value;
                        if (ancestorStructId === ancestorStructureId && !nodeIdSet.has(ancestorNodeId)) {
                            ancestorIds.add(ancestorNodeId);
                        }
                    }
                }
            }
        }
    });

    return Array.from(ancestorIds);
}

/**
 * Create ancestor structure ID patterns for efficient filtering
 * For a structure ID like "1.2.3", this creates patterns ["1", "1.2"]
 *
 * @param structureIds - Array of structure IDs
 * @returns Array of unique ancestor patterns
 */
export function createAncestorStructureIdPatterns(structureIds: string[]): string[] {
    const patterns = new Set<string>();

    structureIds.forEach(structureId => {
        if (!structureId) {
            return;
        }

        const parts = structureId.split(".");

        // Create patterns for all ancestor levels
        for (let i = 1; i < parts.length; i++) {
            patterns.add(parts.slice(0, i).join("."));
        }
    });

    return Array.from(patterns);
}
