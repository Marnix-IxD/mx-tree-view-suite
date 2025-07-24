import { TreeNode } from "../types/TreeTypes";
import { generateStructureId } from "./structureIdGenerator";

/**
 * Utility for calculating structure ID changes during drag & drop operations.
 *
 * This is separate from updateStructureIdsAfterMove because:
 * 1. Works directly with TreeNode objects instead of Map<string, string[]>
 * 2. Supports both client-generated and server-persisted structure IDs
 * 3. Calculates detailed change records for API calls
 * 4. Handles both useTreeData and useTreeDataSource patterns
 */

export interface IStructureUpdate {
    nodeId: string;
    oldStructureId: string;
    newStructureId: string;
    oldParentId: string | null;
    newParentId: string | null;
    oldIndex: number;
    newIndex: number;
}

/**
 * Calculate new structure ID for a node after move
 */
export function calculateNewStructureId(
    nodeId: string,
    newParentId: string | null,
    newIndex: number,
    nodeMap: Map<string, TreeNode>
): string {
    const parentStructureId = newParentId ? nodeMap.get(newParentId)?.structureId || "" : "";
    return generateStructureId(nodeId, parentStructureId, newIndex);
}

/**
 * Get all descendants of a node (including the node itself)
 */
export function getAllDescendantIds(node: TreeNode): Set<string> {
    const descendants = new Set<string>();
    descendants.add(node.id);

    const collectDescendants = (parent: TreeNode): void => {
        parent.children.forEach(child => {
            descendants.add(child.id);
            collectDescendants(child);
        });
    };

    collectDescendants(node);
    return descendants;
}

/**
 * Calculate all structure updates needed for a drag & drop operation
 * This includes updates for:
 * 1. Moved nodes and their descendants
 * 2. Siblings in the source location (reindexing)
 * 3. Siblings in the target location (reindexing)
 */
export function calculateDragDropStructureUpdates(
    movedNodes: TreeNode[],
    targetNode: TreeNode,
    position: "before" | "inside" | "after",
    nodeMap: Map<string, TreeNode>
): IStructureUpdate[] {
    const updates: IStructureUpdate[] = [];
    const affectedParents = new Set<string | null>();
    const movedNodeIds = new Set(movedNodes.map(n => n.id));

    // Determine target parent and index
    let targetParentId: string | null;
    let targetIndex: number;

    if (position === "inside") {
        targetParentId = targetNode.id;
        targetIndex = targetNode.children.length;
    } else {
        targetParentId = targetNode.parentId;
        const siblings = targetParentId
            ? nodeMap.get(targetParentId)?.children || []
            : Array.from(nodeMap.values()).filter(n => !n.parentId);
        const currentTargetIndex = siblings.findIndex(s => s.id === targetNode.id);
        targetIndex = position === "before" ? currentTargetIndex : currentTargetIndex + 1;
    }

    // Process each moved node
    movedNodes.forEach((node, moveIndex) => {
        const oldParentId = node.parentId;
        affectedParents.add(oldParentId);
        affectedParents.add(targetParentId);

        // Calculate old index
        const oldSiblings = oldParentId
            ? nodeMap.get(oldParentId)?.children || []
            : Array.from(nodeMap.values()).filter(n => !n.parentId);
        const oldIndex = oldSiblings.findIndex(s => s.id === node.id);

        // Calculate new structure ID
        const newIndex = targetIndex + moveIndex;
        const newStructureId = calculateNewStructureId(node.id, targetParentId, newIndex, nodeMap);

        // Add update for the moved node
        updates.push({
            nodeId: node.id,
            oldStructureId: node.structureId || "",
            newStructureId,
            oldParentId,
            newParentId: targetParentId,
            oldIndex,
            newIndex
        });

        // Update all descendants
        updateDescendantStructureIds(node, newStructureId, updates);
    });

    // Reindex siblings in affected parents
    affectedParents.forEach(parentId => {
        reindexSiblings(parentId, movedNodeIds, nodeMap, updates);
    });

    return updates;
}

/**
 * Update structure IDs for all descendants of a moved node
 */
function updateDescendantStructureIds(
    parentNode: TreeNode,
    parentNewStructureId: string,
    updates: IStructureUpdate[]
): void {
    parentNode.children.forEach((child, index) => {
        const childNewStructureId = generateStructureId(child.id, parentNewStructureId, index);

        updates.push({
            nodeId: child.id,
            oldStructureId: child.structureId || "",
            newStructureId: childNewStructureId,
            oldParentId: child.parentId,
            newParentId: child.parentId, // Parent doesn't change for descendants
            oldIndex: index,
            newIndex: index // Index doesn't change for descendants
        });

        // Recursively update child's descendants
        updateDescendantStructureIds(child, childNewStructureId, updates);
    });
}

/**
 * Reindex siblings after nodes are moved
 */
function reindexSiblings(
    parentId: string | null,
    movedNodeIds: Set<string>,
    nodeMap: Map<string, TreeNode>,
    updates: IStructureUpdate[]
): void {
    const siblings = parentId
        ? nodeMap.get(parentId)?.children || []
        : Array.from(nodeMap.values()).filter(n => !n.parentId);

    const parentStructureId = parentId ? nodeMap.get(parentId)?.structureId || "" : "";

    // Get remaining siblings (not being moved)
    const remainingSiblings = siblings.filter(s => !movedNodeIds.has(s.id));

    // Reindex remaining siblings
    remainingSiblings.forEach((sibling, newIndex) => {
        const oldStructureId = sibling.structureId || "";
        const newStructureId = generateStructureId(sibling.id, parentStructureId, newIndex);

        // Only add update if structure ID changes
        if (oldStructureId !== newStructureId) {
            const oldIndex = siblings.findIndex(s => s.id === sibling.id);

            updates.push({
                nodeId: sibling.id,
                oldStructureId,
                newStructureId,
                oldParentId: parentId,
                newParentId: parentId,
                oldIndex,
                newIndex
            });

            // Update all descendants of reindexed siblings
            updateDescendantStructureIds(sibling, newStructureId, updates);
        }
    });
}

/**
 * Filter updates to only include those that need to be sent to server
 * (excludes client-generated structure IDs)
 */
export function filterServerUpdates(updates: IStructureUpdate[], nodeMap: Map<string, TreeNode>): IStructureUpdate[] {
    return updates.filter(update => {
        const node = nodeMap.get(update.nodeId);
        // Only include updates for nodes with server-persisted structure IDs
        return node && !node._generatedStructureId;
    });
}
