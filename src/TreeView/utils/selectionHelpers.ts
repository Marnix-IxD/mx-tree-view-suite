import { TreeNode } from "../types/TreeTypes";
import { isDescendantOf } from "./structureIdGenerator";

/**
 * Get all descendant node IDs for a given node
 * Works with both loaded nodes and structure IDs
 *
 * @param node The parent node
 * @param nodeMap Map of all loaded nodes
 * @param allLoadedItemsRef Optional reference to all items ever loaded (for progressive loading)
 * @param useStructureId If true, uses structure ID matching for unloaded nodes
 * @returns Array of descendant node IDs
 */
export function getAllDescendantIds(
    node: TreeNode,
    nodeMap: Map<string, TreeNode>,
    allLoadedItemsRef?: React.MutableRefObject<Map<string, any>>,
    useStructureId = true
): string[] {
    const descendants: string[] = [];

    // First, traverse loaded children recursively
    function traverseLoaded(n: TreeNode) {
        n.children.forEach(child => {
            descendants.push(child.id);
            traverseLoaded(child);
        });
    }

    traverseLoaded(node);

    // If we have a structure ID and should check for unloaded descendants
    if (useStructureId && node.structureId) {
        // Check all loaded items for potential descendants not in current tree
        const checkMap = allLoadedItemsRef?.current || nodeMap;

        checkMap.forEach((item, itemId) => {
            // Skip if already included
            if (descendants.includes(itemId) || itemId === node.id) {
                return;
            }

            // Get the item's structure ID
            const itemStructureId = item.structureId || (item as TreeNode).structureId;

            if (itemStructureId && node.structureId && isDescendantOf(itemStructureId, node.structureId)) {
                descendants.push(itemId);
            }
        });
    }

    return descendants;
}

/**
 * Get all ancestor node IDs for a given node
 * Works even if some ancestors are not loaded
 *
 * @param node The child node
 * @param nodeMap Map of all loaded nodes
 * @param allLoadedItemsRef Optional reference to all items ever loaded
 * @param includeNode If true, includes the node itself in the result
 * @returns Array of ancestor node IDs (from root to immediate parent)
 */
export function getAllAncestorIds(
    node: TreeNode,
    nodeMap: Map<string, TreeNode>,
    allLoadedItemsRef?: React.MutableRefObject<Map<string, any>>,
    includeNode = false
): string[] {
    const ancestors: string[] = [];

    // First try the traditional parent traversal
    let currentId = node.parentId;
    while (currentId) {
        ancestors.unshift(currentId);
        const parent = nodeMap.get(currentId);
        currentId = parent?.parentId || null;
    }

    // If we have structure ID, we can find missing ancestors
    if (node.structureId) {
        const structureParts = node.structureId.split(".");
        // Remove empty string at end and the node's own part
        structureParts.pop(); // Remove empty string
        if (structureParts.length > 0) {
            structureParts.pop(); // Remove node's own number
        }

        // Build ancestor structure IDs
        const ancestorStructureIds: string[] = [];
        for (let i = 0; i < structureParts.length; i++) {
            const ancestorStructureId = structureParts.slice(0, i + 1).join(".") + ".";
            ancestorStructureIds.push(ancestorStructureId);
        }

        // Find nodes with these structure IDs
        const checkMap = allLoadedItemsRef?.current || nodeMap;
        const foundAncestors = new Map<string, string>(); // structureId -> nodeId

        checkMap.forEach((item, itemId) => {
            const itemStructureId = item.structureId || (item as TreeNode).structureId;
            if (itemStructureId && ancestorStructureIds.includes(itemStructureId)) {
                foundAncestors.set(itemStructureId, itemId);
            }
        });

        // Build final ancestor list in order
        const orderedAncestors: string[] = [];
        ancestorStructureIds.forEach(structureId => {
            const nodeId = foundAncestors.get(structureId);
            if (nodeId) {
                orderedAncestors.push(nodeId);
            }
        });

        // Use structure-based ancestors if we found more
        if (orderedAncestors.length > ancestors.length) {
            ancestors.length = 0;
            ancestors.push(...orderedAncestors);
        }
    }

    if (includeNode) {
        ancestors.push(node.id);
    }

    return ancestors;
}

/**
 * Check if all descendants of a node are selected
 * Works with partial loading by checking structure IDs
 */
export function areAllDescendantsSelected(
    node: TreeNode,
    selectedStructureIds: Set<string>,
    nodeMap: Map<string, TreeNode>
): boolean {
    if (!node.structureId) {
        return true;
    }

    // Check immediate children first
    for (const child of node.children) {
        if (!child.structureId || !selectedStructureIds.has(child.structureId)) {
            return false;
        }
        // Recursively check child's descendants
        if (!areAllDescendantsSelected(child, selectedStructureIds, nodeMap)) {
            return false;
        }
    }

    // For nodes that might have unloaded children, we trust hasChildren
    // If hasChildren is true but children array is empty, we can't verify all descendants
    if (node.hasChildren && node.children.length === 0) {
        // We have to assume not all descendants are selected since we can't verify
        return false;
    }

    return true;
}

/**
 * Get structure IDs of all potential descendants
 * This is useful for branch selection when nodes might not be loaded
 */
export function getDescendantStructureIdPattern(structureId: string): RegExp {
    // Escape special regex characters in structure ID
    const escaped = structureId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Match any structure ID that starts with this one
    return new RegExp(`^${escaped}`);
}

/**
 * Smart branch selection that handles unloaded nodes
 * Returns structure IDs to select/deselect
 */
export function getSmartBranchSelection(
    node: TreeNode,
    currentlySelectedStructureIds: Set<string>,
    allKnownStructureIds: Set<string>
): {
    toSelect: string[];
    toDeselect: string[];
} {
    if (!node.structureId) {
        return { toSelect: [], toDeselect: [] };
    }

    const pattern = getDescendantStructureIdPattern(node.structureId);
    const toSelect: string[] = [];
    const toDeselect: string[] = [];

    // Always include/exclude the node itself
    if (currentlySelectedStructureIds.has(node.structureId)) {
        toDeselect.push(node.structureId);
    } else {
        toSelect.push(node.structureId);
    }

    // Find all descendants by structure ID pattern
    allKnownStructureIds.forEach(structureId => {
        if (structureId !== node.structureId && pattern.test(structureId)) {
            if (currentlySelectedStructureIds.has(structureId)) {
                toDeselect.push(structureId);
            } else {
                toSelect.push(structureId);
            }
        }
    });

    return { toSelect, toDeselect };
}
