import { TreeNode } from "../types/TreeTypes";

/**
 * Type of drag selection
 */
export type DragSelectionType = "connected" | "scattered";

/**
 * Analyzed drag selection
 */
export interface DraggedNodeSet {
    type: DragSelectionType;
    rootNode?: TreeNode; // For connected selections only
    nodes: TreeNode[]; // All selected nodes
    structure?: TreeNode[]; // Hierarchical structure for connected
    isSingleBranch: boolean; // True if all nodes belong to same branch
    isCompleteBranch: boolean; // True if selection includes all descendants
}

/**
 * Check if a set of nodes forms a connected subtree
 * A selection is connected if:
 * 1. There's exactly one root node (node without parent in selection)
 * 2. Every non-root node has its parent in the selection
 * 3. The selection forms a complete subtree
 */
export function checkIfConnectedSelection(nodes: TreeNode[]): boolean {
    if (nodes.length === 0) {
        return false;
    }
    if (nodes.length === 1) {
        return true;
    }

    const nodeIds = new Set(nodes.map(n => n.id));
    const nodesByStructureId = new Map(nodes.map(n => [n.structureId || "", n]));

    // Find root nodes (nodes whose parent is not in selection)
    const rootNodes = nodes.filter(node => {
        // If node has no parent, it's a root
        if (!node.parentId) {
            return true;
        }
        // If parent is not in selection, this is a root of the selection
        return !nodeIds.has(node.parentId);
    });

    // Must have exactly one root for connected selection
    if (rootNodes.length !== 1) {
        return false;
    }

    const rootNode = rootNodes[0];
    if (!rootNode.structureId) {
        return false;
    }

    // Check if all nodes are descendants of the root
    for (const node of nodes) {
        if (node.id === rootNode.id) {
            continue;
        }

        // Check using structure IDs for efficiency
        if (node.structureId && !node.structureId.startsWith(rootNode.structureId)) {
            return false;
        }
    }

    // Verify no gaps in the selection (all intermediate nodes are included)
    for (const node of nodes) {
        if (!node.structureId) {
            continue;
        }

        // Check all ancestors up to root are in selection
        let currentStructureId = node.structureId;
        while (currentStructureId !== rootNode.structureId) {
            // Get parent structure ID
            const lastDotIndex = currentStructureId.lastIndexOf(".", currentStructureId.length - 2);
            if (lastDotIndex === -1) {
                break;
            }

            const parentStructureId = currentStructureId.substring(0, lastDotIndex + 1);
            if (parentStructureId === rootNode.structureId) {
                break;
            }

            // Parent must be in selection
            if (!nodesByStructureId.has(parentStructureId)) {
                return false;
            }

            currentStructureId = parentStructureId;
        }
    }

    return true;
}

/**
 * Find the root node of a connected selection
 */
export function findSelectionRoot(nodes: TreeNode[]): TreeNode | undefined {
    const nodeIds = new Set(nodes.map(n => n.id));

    // Find nodes whose parent is not in selection
    const rootNodes = nodes.filter(node => {
        if (!node.parentId) {
            return true;
        }
        return !nodeIds.has(node.parentId);
    });

    return rootNodes.length === 1 ? rootNodes[0] : undefined;
}

/**
 * Build hierarchical structure from flat node list
 * Preserves parent-child relationships for connected selections
 */
export function buildHierarchicalStructure(nodes: TreeNode[], rootNode: TreeNode): TreeNode[] {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const processed = new Set<string>();

    function buildSubtree(node: TreeNode): TreeNode {
        processed.add(node.id);

        // Find children in selection
        const children = node.children
            .filter(child => nodeMap.has(child.id) && !processed.has(child.id))
            .map(child => buildSubtree(nodeMap.get(child.id)!));

        return {
            ...node,
            children
        };
    }

    return [buildSubtree(rootNode)];
}

/**
 * Sort nodes by their position in the tree
 * Uses structure ID for accurate ordering
 */
export function sortNodesByPosition(nodes: TreeNode[]): TreeNode[] {
    return nodes.sort((a, b) => {
        // First sort by structure ID to maintain tree order
        if (a.structureId && b.structureId) {
            return a.structureId.localeCompare(b.structureId);
        }

        // Fallback to sort order if available
        if (a.sortOrder !== undefined && b.sortOrder !== undefined) {
            return a.sortOrder - b.sortOrder;
        }

        // Finally, sort by level and ID
        if (a.level !== b.level) {
            return a.level - b.level;
        }

        return a.id.localeCompare(b.id);
    });
}

/**
 * Check if selection includes all descendants of selected parents
 */
export function isCompleteBranchSelection(nodes: TreeNode[]): boolean {
    const nodeIds = new Set(nodes.map(n => n.id));

    // For each node with children, check if all children are selected
    for (const node of nodes) {
        if (node.children.length > 0) {
            const allChildrenSelected = node.children.every(child => nodeIds.has(child.id));
            if (!allChildrenSelected) {
                return false;
            }
        }
    }

    return true;
}

/**
 * Analyze a set of dragged nodes to determine their relationship
 */
export function analyzeDraggedNodes(selectedNodes: Set<string>, nodeMap: Map<string, TreeNode>): DraggedNodeSet {
    const nodes = Array.from(selectedNodes)
        .map(id => nodeMap.get(id))
        .filter(Boolean) as TreeNode[];

    if (nodes.length === 0) {
        return {
            type: "scattered",
            nodes: [],
            isSingleBranch: false,
            isCompleteBranch: false
        };
    }

    // Single node is always connected
    if (nodes.length === 1) {
        return {
            type: "connected",
            rootNode: nodes[0],
            nodes,
            structure: nodes,
            isSingleBranch: true,
            isCompleteBranch: true
        };
    }

    // Check if selection forms a connected subtree
    const isConnected = checkIfConnectedSelection(nodes);

    if (isConnected) {
        const rootNode = findSelectionRoot(nodes)!;
        const isComplete = isCompleteBranchSelection(nodes);

        return {
            type: "connected",
            rootNode,
            nodes,
            structure: buildHierarchicalStructure(nodes, rootNode),
            isSingleBranch: true,
            isCompleteBranch: isComplete
        };
    }

    // For scattered selection, check if all nodes are from same branch
    const branches = new Set<string>();
    nodes.forEach(node => {
        if (node.structureId) {
            // Get top-level branch (first segment)
            const firstDot = node.structureId.indexOf(".");
            const branch = firstDot > 0 ? node.structureId.substring(0, firstDot + 1) : node.structureId;
            branches.add(branch);
        }
    });

    return {
        type: "scattered",
        nodes: sortNodesByPosition(nodes),
        isSingleBranch: branches.size === 1,
        isCompleteBranch: false
    };
}

/**
 * Create a visual description of the drag selection
 * Used for drag preview and logging
 */
export function describeDragSelection(draggedSet: DraggedNodeSet): string {
    if (draggedSet.nodes.length === 0) {
        return "No nodes selected";
    }

    if (draggedSet.nodes.length === 1) {
        return draggedSet.nodes[0].label || draggedSet.nodes[0].id;
    }

    if (draggedSet.type === "connected") {
        const rootLabel = draggedSet.rootNode?.label || draggedSet.rootNode?.id || "";
        if (draggedSet.isCompleteBranch) {
            return `${rootLabel} (${draggedSet.nodes.length} items)`;
        } else {
            return `${rootLabel} (partial, ${draggedSet.nodes.length} items)`;
        }
    }

    // Scattered selection
    if (draggedSet.isSingleBranch) {
        return `${draggedSet.nodes.length} items (same branch)`;
    } else {
        return `${draggedSet.nodes.length} items (multiple branches)`;
    }
}
