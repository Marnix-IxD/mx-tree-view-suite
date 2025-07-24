import { TreeNode } from "../types/TreeTypes";
import { DragDropOperation } from "../hooks/useTreeDragDrop";

/**
 * Apply rollback to restore tree to previous state
 */
export function rollbackTreeChanges(
    nodeMap: Map<string, TreeNode>,
    operation: DragDropOperation
): Map<string, TreeNode> {
    const rollbackMap = new Map(nodeMap);
    const { rollbackData, changes } = operation;

    // Create a map of all changes by nodeId for quick lookup
    const changesByNode = new Map<string, (typeof changes)[0]>();
    changes.forEach(change => {
        changesByNode.set(change.nodeId, change);
    });

    // 1. Restore moved branches to their original positions
    rollbackData.movedBranches.forEach(branch => {
        const node = rollbackMap.get(branch.nodeId);
        if (node) {
            // Find the change record
            const change = changesByNode.get(branch.nodeId);
            if (change) {
                // Restore original parent
                node.parentId = change.oldParentId;
                node.structureId = change.oldStructureId;

                // Remove from new parent's children
                if (change.newParentId) {
                    const newParent = rollbackMap.get(change.newParentId);
                    if (newParent) {
                        newParent.children = newParent.children.filter(c => c.id !== node.id);
                    }
                }

                // Add back to old parent's children
                if (change.oldParentId) {
                    const oldParent = rollbackMap.get(change.oldParentId);
                    if (oldParent) {
                        // Insert at original position
                        oldParent.children.splice(change.oldIndex, 0, node);
                    }
                }
            }
        }
    });

    // 2. Restore orphaned nodes (siblings that were reindexed)
    rollbackData.orphanedNodes.forEach(orphan => {
        const node = rollbackMap.get(orphan.nodeId);
        if (node) {
            // Restore original structure ID
            node.structureId = orphan.oldStructureId;

            // If parent changed (shouldn't happen for siblings, but just in case)
            if (orphan.oldParentId !== orphan.newParentId) {
                node.parentId = orphan.oldParentId || null;
            }
        }
    });

    // 3. Restore all descendants of moved/orphaned nodes
    changes.forEach(change => {
        // Skip if already handled as moved branch or orphaned node
        if (
            rollbackData.movedBranches.some(b => b.nodeId === change.nodeId) ||
            rollbackData.orphanedNodes.some(o => o.nodeId === change.nodeId)
        ) {
            return;
        }

        const node = rollbackMap.get(change.nodeId);
        if (node) {
            // Restore structure ID for descendants
            node.structureId = change.oldStructureId;
        }
    });

    // 4. Re-sort children arrays based on structure IDs
    rollbackMap.forEach(node => {
        if (node.children && node.children.length > 0) {
            node.children.sort((a, b) => {
                const aId = a.structureId || "";
                const bId = b.structureId || "";
                return compareStructureIds(aId, bId);
            });
        }
    });

    return rollbackMap;
}

/**
 * Compare structure IDs for sorting
 */
function compareStructureIds(a: string, b: string): number {
    // Remove trailing dots for comparison
    const aParts = a
        .replace(/\.$/, "")
        .split(".")
        .map(p => parseInt(p, 10));
    const bParts = b
        .replace(/\.$/, "")
        .split(".")
        .map(p => parseInt(p, 10));

    const minLength = Math.min(aParts.length, bParts.length);

    for (let i = 0; i < minLength; i++) {
        if (aParts[i] < bParts[i]) {
            return -1;
        }
        if (aParts[i] > bParts[i]) {
            return 1;
        }
    }

    // If all parts are equal, shorter ID comes first
    return aParts.length - bParts.length;
}

/**
 * Validate that all nodes in the operation can be moved
 */
export function validateDragDropOperation(
    operation: DragDropOperation,
    nodeMap: Map<string, TreeNode>,
    validateNode: (node: TreeNode) => { valid: boolean; reason?: string }
): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Get all unique node IDs from changes
    const nodeIds = new Set(operation.changes.map(c => c.nodeId));

    // Validate each node
    nodeIds.forEach(nodeId => {
        const node = nodeMap.get(nodeId);
        if (!node) {
            errors.push(`Node ${nodeId} not found`);
            return;
        }

        const validation = validateNode(node);
        if (!validation.valid) {
            errors.push(validation.reason || `Node ${nodeId} failed validation`);
        }
    });

    // If any node fails, the entire operation fails
    return {
        valid: errors.length === 0,
        errors
    };
}
