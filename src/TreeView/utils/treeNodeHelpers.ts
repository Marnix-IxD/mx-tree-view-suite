/**
 * TreeNode-specific helper utilities
 * These work with TreeNode objects and nodeMap, complementing the ObjectItem-based utilities in treeTraversal.ts
 */

import { TreeNode } from "../types/TreeTypes";

/**
 * Find all ancestor node IDs for a given node
 * @param nodeId - The node to find ancestors for
 * @param nodeMap - Map of all tree nodes
 * @returns Array of ancestor node IDs from immediate parent to root
 */
export function findNodeAncestors(nodeId: string, nodeMap: Map<string, TreeNode>): string[] {
    const ancestors: string[] = [];
    let current = nodeMap.get(nodeId);

    while (current?.parentId) {
        ancestors.push(current.parentId);
        current = nodeMap.get(current.parentId);
    }

    return ancestors;
}

/**
 * Find all ancestor node IDs for multiple nodes
 * @param nodeIds - Array of node IDs to find ancestors for
 * @param nodeMap - Map of all tree nodes
 * @returns Array of unique ancestor node IDs
 */
export function findMultipleNodeAncestors(nodeIds: string[], nodeMap: Map<string, TreeNode>): string[] {
    const allAncestors = new Set<string>();

    nodeIds.forEach(nodeId => {
        const ancestors = findNodeAncestors(nodeId, nodeMap);
        ancestors.forEach(ancestorId => allAncestors.add(ancestorId));
    });

    return Array.from(allAncestors);
}

/**
 * Get the path from a node to the root (including the node itself)
 * @param nodeId - The node to get path for
 * @param nodeMap - Map of all tree nodes
 * @returns Array of node IDs from the node to root
 */
export function getNodePath(nodeId: string, nodeMap: Map<string, TreeNode>): string[] {
    const path: string[] = [];
    let current = nodeMap.get(nodeId);

    while (current) {
        path.unshift(current.id);
        if (!current.parentId) {
            break;
        }
        current = nodeMap.get(current.parentId);
    }

    return path;
}

/**
 * Get the path labels from a node to the root
 * @param nodeId - The node to get path for
 * @param nodeMap - Map of all tree nodes
 * @returns Array of node labels from the node to root
 */
export function getNodePathLabels(nodeId: string, nodeMap: Map<string, TreeNode>): string[] {
    const path: string[] = [];
    let current = nodeMap.get(nodeId);

    while (current) {
        path.unshift(current.label || current.id);
        if (!current.parentId) {
            break;
        }
        current = nodeMap.get(current.parentId);
    }

    return path;
}

/**
 * Check if a node is an ancestor of another node
 * @param potentialAncestorId - The potential ancestor node ID
 * @param nodeId - The node to check
 * @param nodeMap - Map of all tree nodes
 * @returns True if potentialAncestorId is an ancestor of nodeId
 */
export function isNodeAncestor(potentialAncestorId: string, nodeId: string, nodeMap: Map<string, TreeNode>): boolean {
    const ancestors = findNodeAncestors(nodeId, nodeMap);
    return ancestors.includes(potentialAncestorId);
}

/**
 * Find common ancestors of multiple nodes
 * @param nodeIds - Array of node IDs
 * @param nodeMap - Map of all tree nodes
 * @returns Array of common ancestor node IDs
 */
export function findCommonAncestors(nodeIds: string[], nodeMap: Map<string, TreeNode>): string[] {
    if (nodeIds.length === 0) {
        return [];
    }
    if (nodeIds.length === 1) {
        return findNodeAncestors(nodeIds[0], nodeMap);
    }

    // Get ancestors for first node
    const firstNodeAncestors = new Set(findNodeAncestors(nodeIds[0], nodeMap));

    // Find intersection with other nodes' ancestors
    for (let i = 1; i < nodeIds.length; i++) {
        const currentAncestors = new Set(findNodeAncestors(nodeIds[i], nodeMap));

        // Keep only ancestors that exist in both sets
        for (const ancestor of firstNodeAncestors) {
            if (!currentAncestors.has(ancestor)) {
                firstNodeAncestors.delete(ancestor);
            }
        }
    }

    return Array.from(firstNodeAncestors);
}

/**
 * Find all descendants of a node (children, grandchildren, etc.)
 * @param nodeId - The node to find descendants for
 * @param nodeMap - Map of all tree nodes
 * @returns Array of descendant node IDs
 */
export function findNodeDescendants(nodeId: string, nodeMap: Map<string, TreeNode>): string[] {
    const descendants: string[] = [];
    const queue: string[] = [nodeId];

    while (queue.length > 0) {
        const currentId = queue.shift()!;
        const current = nodeMap.get(currentId);

        if (current?.children) {
            current.children.forEach(child => {
                descendants.push(child.id);
                queue.push(child.id);
            });
        }
    }

    return descendants;
}

/**
 * Check if a node is a descendant of another node
 * @param potentialDescendantId - The potential descendant node ID
 * @param nodeId - The node to check
 * @param nodeMap - Map of all tree nodes
 * @returns True if potentialDescendantId is a descendant of nodeId
 */
export function isNodeDescendant(
    potentialDescendantId: string,
    nodeId: string,
    nodeMap: Map<string, TreeNode>
): boolean {
    const descendants = findNodeDescendants(nodeId, nodeMap);
    return descendants.includes(potentialDescendantId);
}
