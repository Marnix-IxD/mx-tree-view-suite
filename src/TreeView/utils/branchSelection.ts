import { TreeNode, ITreeBranch, BranchSelectionState } from "../types/TreeTypes";

/**
 * Branch-based selection utilities
 * Implements efficient selection storage using structure IDs and prefix matching
 */

/**
 * Check if a node is selected using branch-based selection model
 * Uses structure ID prefix matching for O(1) performance
 */
export function isNodeSelectedInBranch(nodeStructureId: string | undefined, branches: ITreeBranch[]): boolean {
    if (!nodeStructureId || branches.length === 0) {
        return false;
    }

    // Check each branch
    for (const branch of branches) {
        // First check if node is within the branch
        if (nodeStructureId.startsWith(branch.branchSelection)) {
            // Node is within branch, now check exceptions

            // Check if any ancestor is deselected
            const isAncestorDeselected = branch.deselectedAncestors.some(
                ancestorId => nodeStructureId.startsWith(ancestorId) && ancestorId !== nodeStructureId
            );

            if (isAncestorDeselected) {
                continue; // Skip this branch, check next
            }

            // Check if this specific node is deselected
            const isNodeDeselected = branch.deselectedDescendants.includes(nodeStructureId);

            if (!isNodeDeselected) {
                return true; // Node is selected in this branch
            }
        }

        // Also check if node is an ancestor of the branch (parent selected without children)
        if (branch.branchSelection.startsWith(nodeStructureId)) {
            // Check if this ancestor is explicitly deselected
            const isDeselected = branch.deselectedAncestors.includes(nodeStructureId);
            if (!isDeselected) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Convert Set<string> selection to optimized branch-based selection
 * Groups consecutive selections into branches for efficiency
 * Automatically calculates deselected ancestors and descendants
 */
export function convertSelectionToBranches(selectedIds: Set<string>, nodeMap: Map<string, TreeNode>): ITreeBranch[] {
    if (selectedIds.size === 0) {
        return [];
    }

    const branches: ITreeBranch[] = [];
    const processedIds = new Set<string>();

    // Sort selected IDs by structure ID to group branches
    const selectedNodes = Array.from(selectedIds)
        .map(id => nodeMap.get(id))
        .filter((node): node is TreeNode => node !== undefined && node.structureId !== undefined)
        .sort((a, b) => (a.structureId || "").localeCompare(b.structureId || ""));

    for (const node of selectedNodes) {
        if (processedIds.has(node.id) || !node.structureId) {
            continue;
        }

        // Check if all descendants are selected - if so, create a branch
        const allDescendantsSelected = areAllDescendantsSelected(node, selectedIds, nodeMap);

        if (allDescendantsSelected) {
            // Create branch for this subtree
            const branch: ITreeBranch = {
                branchSelection: node.structureId,
                deselectedAncestors: [],
                deselectedDescendants: []
            };

            // Mark all descendants as processed
            markDescendantsProcessed(node, processedIds);

            // Check if any ancestors should be marked as deselected
            const ancestors = getAncestorStructureIds(node, nodeMap);
            const deselectedAncestors = ancestors.filter(ancestorId => {
                const ancestorNode = findNodeByStructureId(ancestorId, nodeMap);
                return ancestorNode && !selectedIds.has(ancestorNode.id);
            });
            branch.deselectedAncestors = deselectedAncestors;

            branches.push(branch);
        } else {
            // Individual selection or partial branch
            // Try to find the highest ancestor that forms a branch
            const branchRoot = findHighestBranchRoot(node, selectedIds, nodeMap);

            if (branchRoot && branchRoot.structureId) {
                // Check if we already have a branch for this root
                let existingBranch = branches.find(b => b.branchSelection === branchRoot.structureId);

                if (!existingBranch) {
                    existingBranch = {
                        branchSelection: branchRoot.structureId,
                        deselectedAncestors: [],
                        deselectedDescendants: []
                    };
                    branches.push(existingBranch);
                }

                // Add deselected descendants
                const deselectedInBranch = findDeselectedDescendants(branchRoot, selectedIds, nodeMap);
                existingBranch.deselectedDescendants = [
                    ...new Set([...existingBranch.deselectedDescendants, ...deselectedInBranch])
                ];

                // Mark branch nodes as processed
                markDescendantsProcessed(branchRoot, processedIds);
            } else {
                // Single node selection, create minimal branch
                const branch: ITreeBranch = {
                    branchSelection: node.structureId,
                    deselectedAncestors: [],
                    deselectedDescendants: []
                };

                // If node has children, mark them as deselected
                if (node.children.length > 0) {
                    branch.deselectedDescendants = node.children
                        .map(child => child.structureId)
                        .filter((id): id is string => id !== undefined);
                }

                branches.push(branch);
                processedIds.add(node.id);
            }
        }
    }

    // Optimize branches by merging where possible
    return optimizeBranches(branches);
}

/**
 * Convert branch-based selection back to Set<string> for compatibility
 */
export function convertBranchesToSelection(branches: ITreeBranch[], nodeMap: Map<string, TreeNode>): Set<string> {
    const selectedIds = new Set<string>();

    for (const branch of branches) {
        // Find all nodes in the branch
        const branchNodes = findNodesInBranch(branch.branchSelection, nodeMap);

        for (const node of branchNodes) {
            if (node.structureId && isNodeSelectedInBranch(node.structureId, [branch])) {
                selectedIds.add(node.id);
            }
        }
    }

    return selectedIds;
}

/**
 * Add a node to branch-based selection
 */
export function addNodeToBranchSelection(
    node: TreeNode,
    currentBranches: ITreeBranch[],
    allowDeselectingAncestors: boolean,
    allowDeselectingDescendants: boolean
): ITreeBranch[] {
    if (!node.structureId) {
        return currentBranches;
    }

    // Check if node is already selected
    if (isNodeSelectedInBranch(node.structureId, currentBranches)) {
        return currentBranches;
    }

    const newBranches = [...currentBranches];

    // Find if node belongs to an existing branch
    let handled = false;

    for (let i = 0; i < newBranches.length; i++) {
        const branch = newBranches[i];

        // Case 1: Node is a deselected descendant in this branch
        if (node.structureId.startsWith(branch.branchSelection)) {
            const index = branch.deselectedDescendants.indexOf(node.structureId);
            if (index !== -1) {
                // Remove from deselected list
                branch.deselectedDescendants.splice(index, 1);
                handled = true;
                break;
            }
        }

        // Case 2: Node is a deselected ancestor
        if (branch.branchSelection.startsWith(node.structureId)) {
            const index = branch.deselectedAncestors.indexOf(node.structureId);
            if (index !== -1 && allowDeselectingAncestors) {
                // Remove from deselected ancestors
                branch.deselectedAncestors.splice(index, 1);
                handled = true;
            }
        }
    }

    if (!handled) {
        // Create new branch for this selection
        const newBranch: ITreeBranch = {
            branchSelection: node.structureId,
            deselectedAncestors: [],
            deselectedDescendants: []
        };

        // If not allowing descendant deselection, include all descendants
        if (!allowDeselectingDescendants && node.children.length > 0) {
            // Branch includes all descendants by default
        } else if (node.children.length > 0) {
            // Mark immediate children as deselected initially
            newBranch.deselectedDescendants = node.children
                .map(child => child.structureId)
                .filter((id): id is string => id !== undefined);
        }

        newBranches.push(newBranch);
    }

    return optimizeBranches(newBranches);
}

/**
 * Remove a node from branch-based selection
 */
export function removeNodeFromBranchSelection(
    node: TreeNode,
    currentBranches: ITreeBranch[],
    allowDeselectingAncestors: boolean,
    allowDeselectingDescendants: boolean
): ITreeBranch[] {
    if (!node.structureId) {
        return currentBranches;
    }

    // Check if node is currently selected
    if (!isNodeSelectedInBranch(node.structureId, currentBranches)) {
        return currentBranches;
    }

    const newBranches: ITreeBranch[] = [];

    for (const branch of currentBranches) {
        // Case 1: Node is the branch root
        if (branch.branchSelection === node.structureId) {
            // Remove entire branch
            continue;
        }

        // Case 2: Node is within the branch
        if (node.structureId.startsWith(branch.branchSelection)) {
            if (allowDeselectingDescendants) {
                // Add to deselected descendants
                const updatedBranch = { ...branch };
                updatedBranch.deselectedDescendants = [...new Set([...branch.deselectedDescendants, node.structureId])];
                newBranches.push(updatedBranch);
            } else {
                // Split the branch
                const splitBranches = splitBranchAtNode(branch, node, currentBranches[0]);
                newBranches.push(...splitBranches);
            }
        }
        // Case 3: Node is an ancestor of the branch
        else if (branch.branchSelection.startsWith(node.structureId)) {
            if (allowDeselectingAncestors) {
                // Add to deselected ancestors
                const updatedBranch = { ...branch };
                updatedBranch.deselectedAncestors = [...new Set([...branch.deselectedAncestors, node.structureId])];
                newBranches.push(updatedBranch);
            } else {
                // Keep the branch as is
                newBranches.push(branch);
            }
        } else {
            // Branch not affected
            newBranches.push(branch);
        }
    }

    return optimizeBranches(newBranches);
}

/**
 * Helper function to check if all descendants are selected
 */
function areAllDescendantsSelected(node: TreeNode, selectedIds: Set<string>, nodeMap: Map<string, TreeNode>): boolean {
    if (node.children.length === 0) {
        return true;
    }

    for (const child of node.children) {
        if (!selectedIds.has(child.id)) {
            return false;
        }
        if (!areAllDescendantsSelected(child, selectedIds, nodeMap)) {
            return false;
        }
    }

    return true;
}

/**
 * Mark all descendants as processed
 */
function markDescendantsProcessed(node: TreeNode, processedIds: Set<string>): void {
    processedIds.add(node.id);
    for (const child of node.children) {
        markDescendantsProcessed(child, processedIds);
    }
}

/**
 * Get all ancestor structure IDs
 */
function getAncestorStructureIds(node: TreeNode, nodeMap: Map<string, TreeNode>): string[] {
    const ancestors: string[] = [];
    let current = node;

    while (current.parentId) {
        const parent = nodeMap.get(current.parentId);
        if (parent && parent.structureId) {
            ancestors.push(parent.structureId);
            current = parent;
        } else {
            break;
        }
    }

    return ancestors;
}

/**
 * Find node by structure ID
 */
function findNodeByStructureId(structureId: string, nodeMap: Map<string, TreeNode>): TreeNode | undefined {
    for (const node of nodeMap.values()) {
        if (node.structureId === structureId) {
            return node;
        }
    }
    return undefined;
}

/**
 * Find the highest ancestor that forms a complete branch
 */
function findHighestBranchRoot(
    node: TreeNode,
    selectedIds: Set<string>,
    nodeMap: Map<string, TreeNode>
): TreeNode | null {
    let current = node;
    let highestBranch = null;

    while (current) {
        if (selectedIds.has(current.id) && areAllDescendantsSelected(current, selectedIds, nodeMap)) {
            highestBranch = current;
        }

        if (current.parentId) {
            const parent = nodeMap.get(current.parentId);
            if (parent && selectedIds.has(parent.id)) {
                current = parent;
            } else {
                break;
            }
        } else {
            break;
        }
    }

    return highestBranch || node;
}

/**
 * Find deselected descendants within a branch
 */
function findDeselectedDescendants(
    branchRoot: TreeNode,
    selectedIds: Set<string>,
    _nodeMap: Map<string, TreeNode>
): string[] {
    const deselected: string[] = [];

    function traverse(node: TreeNode): void {
        for (const child of node.children) {
            if (!selectedIds.has(child.id) && child.structureId) {
                deselected.push(child.structureId);
                // Don't traverse into deselected nodes
            } else {
                traverse(child);
            }
        }
    }

    traverse(branchRoot);
    return deselected;
}

/**
 * Find all nodes within a branch
 */
function findNodesInBranch(branchStructureId: string, nodeMap: Map<string, TreeNode>): TreeNode[] {
    const nodes: TreeNode[] = [];

    for (const node of nodeMap.values()) {
        if (node.structureId && node.structureId.startsWith(branchStructureId)) {
            nodes.push(node);
        }
    }

    return nodes;
}

/**
 * Split a branch when a node in the middle is deselected
 */
function splitBranchAtNode(branch: ITreeBranch, nodeToRemove: TreeNode, _template: ITreeBranch): ITreeBranch[] {
    const result: ITreeBranch[] = [];

    // Early return if nodeToRemove has no structureId
    if (!nodeToRemove.structureId) {
        return result;
    }

    // Keep the part above the removed node
    if (nodeToRemove.structureId !== branch.branchSelection) {
        const upperBranch: ITreeBranch = {
            ...branch,
            deselectedDescendants: [...branch.deselectedDescendants, nodeToRemove.structureId]
        };
        result.push(upperBranch);
    }

    // Create branches for selected children of the removed node
    for (const child of nodeToRemove.children) {
        if (child.structureId && !branch.deselectedDescendants.includes(child.structureId)) {
            const childStructureId = child.structureId; // Capture in const for type narrowing
            const childBranch: ITreeBranch = {
                branchSelection: childStructureId,
                deselectedAncestors: [nodeToRemove.structureId],
                deselectedDescendants: branch.deselectedDescendants.filter(id => id.startsWith(childStructureId))
            };
            result.push(childBranch);
        }
    }

    return result;
}

/**
 * Optimize branches by merging adjacent selections
 */
function optimizeBranches(branches: ITreeBranch[]): ITreeBranch[] {
    if (branches.length <= 1) {
        return branches;
    }

    // Sort branches by structure ID
    const sorted = [...branches].sort((a, b) => a.branchSelection.localeCompare(b.branchSelection));

    const optimized: ITreeBranch[] = [];

    for (const branch of sorted) {
        // Check if this branch can be merged with an existing one
        let merged = false;

        for (let i = 0; i < optimized.length; i++) {
            const existing = optimized[i];

            // Check if branches are adjacent or overlapping
            if (canMergeBranches(existing, branch)) {
                optimized[i] = mergeBranches(existing, branch);
                merged = true;
                break;
            }
        }

        if (!merged) {
            optimized.push(branch);
        }
    }

    return optimized;
}

/**
 * Check if two branches can be merged
 */
function canMergeBranches(branch1: ITreeBranch, branch2: ITreeBranch): boolean {
    // Check if one branch contains the other
    return (
        branch1.branchSelection.startsWith(branch2.branchSelection) ||
        branch2.branchSelection.startsWith(branch1.branchSelection)
    );
}

/**
 * Merge two branches into one
 */
function mergeBranches(branch1: ITreeBranch, branch2: ITreeBranch): ITreeBranch {
    // Determine which branch is the parent
    const isFirstParent = branch2.branchSelection.startsWith(branch1.branchSelection);
    const parent = isFirstParent ? branch1 : branch2;
    const child = isFirstParent ? branch2 : branch1;

    // Merge deselected lists
    const mergedDeselectedAncestors = [...new Set([...parent.deselectedAncestors, ...child.deselectedAncestors])];

    const mergedDeselectedDescendants = [
        ...new Set([...parent.deselectedDescendants, ...child.deselectedDescendants])
    ].filter(id => !id.startsWith(child.branchSelection)); // Remove redundant deselections

    return {
        branchSelection: parent.branchSelection,
        deselectedAncestors: mergedDeselectedAncestors,
        deselectedDescendants: mergedDeselectedDescendants
    };
}

/**
 * Serialize branch selection to string for storage in Mendix attribute
 */
export function serializeBranchSelection(branches: ITreeBranch[]): string {
    if (branches.length === 0) {
        return "";
    }

    return JSON.stringify(branches);
}

/**
 * Deserialize branch selection from string
 */
export function deserializeBranchSelection(serialized: string): ITreeBranch[] {
    if (!serialized || serialized.trim() === "") {
        return [];
    }

    try {
        const parsed = JSON.parse(serialized);
        if (Array.isArray(parsed)) {
            return parsed.filter(isValidBranch);
        }
    } catch (error) {
        console.error("Failed to deserialize branch selection:", error);
    }

    return [];
}

/**
 * Validate branch object structure
 */
function isValidBranch(obj: any): obj is ITreeBranch {
    return (
        obj &&
        typeof obj.branchSelection === "string" &&
        Array.isArray(obj.deselectedAncestors) &&
        Array.isArray(obj.deselectedDescendants) &&
        obj.deselectedAncestors.every((id: any) => typeof id === "string") &&
        obj.deselectedDescendants.every((id: any) => typeof id === "string")
    );
}

/**
 * Get selection statistics for performance monitoring
 */
export function getBranchSelectionStats(state: BranchSelectionState): {
    totalBranches: number;
    totalDeselectedAncestors: number;
    totalDeselectedDescendants: number;
    estimatedMemoryBytes: number;
} {
    if (state.mode === "legacy" && state.selectedIds) {
        // Legacy mode stats
        const idCount = state.selectedIds.size;
        const avgIdLength = 10; // Estimated average ID length
        const estimatedMemory = idCount * (avgIdLength * 2 + 8); // Unicode + Set overhead

        return {
            totalBranches: 0,
            totalDeselectedAncestors: 0,
            totalDeselectedDescendants: 0,
            estimatedMemoryBytes: estimatedMemory
        };
    }

    if (state.mode === "branch" && state.branches) {
        let totalDeselectedAncestors = 0;
        let totalDeselectedDescendants = 0;
        let estimatedMemory = 0;

        for (const branch of state.branches) {
            totalDeselectedAncestors += branch.deselectedAncestors.length;
            totalDeselectedDescendants += branch.deselectedDescendants.length;

            // Estimate memory usage
            estimatedMemory += branch.branchSelection.length * 2; // Unicode
            estimatedMemory += branch.deselectedAncestors.reduce((sum, id) => sum + id.length * 2, 0);
            estimatedMemory += branch.deselectedDescendants.reduce((sum, id) => sum + id.length * 2, 0);
            estimatedMemory += 200; // Object overhead
        }

        return {
            totalBranches: state.branches.length,
            totalDeselectedAncestors,
            totalDeselectedDescendants,
            estimatedMemoryBytes: estimatedMemory
        };
    }

    return {
        totalBranches: 0,
        totalDeselectedAncestors: 0,
        totalDeselectedDescendants: 0,
        estimatedMemoryBytes: 0
    };
}
