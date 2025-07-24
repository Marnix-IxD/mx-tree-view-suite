import { useCallback, useRef, useState, useEffect } from "react";
import { TreeNode } from "../types/TreeTypes";
import { isDescendantOf } from "../utils/structureIdGenerator";
import { calculateDragDropStructureUpdates } from "../utils/dragDropStructureUpdates";
// Note: We use our custom dragDropStructureUpdates utility instead of updateStructureIdsAfterMove because:
// 1. It works directly with TreeNode objects
// 2. It supports both useTreeData (client-side) and useTreeDataSource (server-side) approaches
// 3. It tracks detailed changes needed for API calls
import { WorkerManager, ISerializedNode } from "../utils/workerManager";
import { analyzeDraggedNodes, DraggedNodeSet, describeDragSelection } from "../utils/dragDropSelectionAnalyzer";
import { getAllDescendantIds } from "../utils/selectionHelpers";

/**
 * Drag constraint patterns for efficient rule-based validation
 */
export type DragConstraintPattern =
    // Movement scope constraints
    | "same-parent" // Can only reorder within same parent
    | "same-level" // Can only move to nodes at same depth
    | "same-branch" // Stay within same top-level branch
    | "adjacent-only" // Can only move to adjacent positions

    // Node type constraints
    | "leaf-only" // Only leaf nodes can be moved
    | "parent-only" // Only parent nodes can be moved
    | "no-root-move" // Root nodes cannot be moved

    // Hierarchy constraints
    | "max-children" // Limit number of children (uses maxChildren value)
    | "max-depth" // Limit tree depth (uses maxDepth value)
    | "maintain-balance" // Keep branches balanced in depth

    // Order constraints
    | "preserve-order" // Maintain sort order
    | "no-gaps" // Keep items sequentially numbered

    // Direction constraints
    | "up-only" // Can only move to lower depth (ascending)
    | "down-only" // Can only move to higher depth (descending)
    | "forward-only" // Can only move forward in sequence
    | "backward-only"; // Can only move backward in sequence

/**
 * Simple constraint configuration
 */
interface DragConstraints {
    maxChildren?: number; // Maximum children per parent node
    maxDepth?: number; // Maximum tree depth
    minDepth?: number; // Minimum tree depth
    allowedParents?: string[]; // List of node IDs that can be parents
    blockedParents?: string[]; // List of node IDs that cannot be parents
    branchDepth?: number; // For 'same-branch' - how many levels define a branch
}

/**
 * Drag & drop configuration
 */
interface DragDropConfig {
    enabled?: boolean;
    allowReorder?: boolean;
    allowReparent?: boolean;
    autoExpandDelay?: number;
    scrollSpeed?: number;
    scrollThreshold?: number;

    // Simple constraint configuration
    patterns?: DragConstraintPattern[];
    constraints?: DragConstraints;

    // Custom validation (runs after pattern validation)
    validateDrop?: (source: TreeNode[], target: TreeNode, position: DropPosition) => boolean;

    // API endpoint for drag drop operations
    dragDropEndpoint?: string;

    // Callback when drop is complete (for updating UI)
    onDropComplete?: (changes: StructureChange[], requestId: string) => void;
}

/**
 * Drop position relative to target
 */
export type DropPosition = "before" | "inside" | "after";

/**
 * Structure change for API
 */
export interface StructureChange {
    nodeId: string;
    oldStructureId: string;
    newStructureId: string;
    oldParentId: string | null;
    newParentId: string | null;
    oldIndex: number;
    newIndex: number;
}

/**
 * Rollback data for error recovery
 */
export interface RollbackData {
    // Top-level nodes being moved
    movedBranches: Array<{
        nodeId: string;
        oldStructureId: string;
        newStructureId: string;
    }>;

    // Orphaned descendants (excluded from selection)
    orphanedNodes: Array<{
        nodeId: string;
        oldStructureId: string;
        oldParentId: string;
        newStructureId: string;
        newParentId: string;
    }>;

    // Unloaded descendants (never expanded but exist)
    unloadedDescendants: Array<{
        parentId: string;
        hasUnloadedChildren: boolean;
    }>;
}

/**
 * Drag drop operation data
 */
export interface DragDropOperation {
    requestId: string;
    changes: StructureChange[];
    rollbackData: RollbackData;
    topLevelNodes: string[]; // IDs of top-level nodes for loading indicators
    totalItemCount: number;
}

/**
 * Drag & drop state
 */
interface DragDropState {
    draggedNodes: TreeNode[];
    draggedNodeSet: DraggedNodeSet | null;
    draggedOver: string | null;
    dropPosition: DropPosition | null;
    autoExpandTimer: number | null;
    scrollTimer: number | null;
    pendingOperation: DragDropOperation | null;
}

/**
 * Create a custom drag preview element for multi-select
 */
function createDragPreview(nodes: TreeNode[], description?: string): HTMLElement {
    const preview = document.createElement("div");
    preview.className = "tree-drag-preview tree-drag-preview--native";
    preview.style.position = "absolute";
    preview.style.top = "-1000px";
    preview.style.left = "-1000px";
    preview.style.zIndex = "-1";

    // Create stacked effect
    const stack = document.createElement("div");
    stack.className = "tree-drag-stack";

    // Show up to 3 items in preview
    const maxItems = Math.min(nodes.length, 3);
    for (let i = 0; i < maxItems; i++) {
        const item = document.createElement("div");
        item.className = "tree-drag-preview-item";
        item.textContent = nodes[i].label || nodes[i].id;
        item.style.transform = `rotate(${(i - 1) * 5}deg) translate(${i * 2}px, ${i * 2}px)`;
        stack.appendChild(item);
    }

    // Add count badge if more than 1
    if (nodes.length > 1) {
        const badge = document.createElement("div");
        badge.className = "tree-drag-preview-badge";
        badge.textContent = String(nodes.length);
        stack.appendChild(badge);
    }

    preview.appendChild(stack);

    // Add description if provided
    if (description) {
        const desc = document.createElement("div");
        desc.className = "tree-drag-preview-description";
        desc.style.marginTop = "4px";
        desc.style.fontSize = "11px";
        desc.style.color = "#666";
        desc.style.textAlign = "center";
        desc.textContent = description;
        preview.appendChild(desc);
    }
    document.body.appendChild(preview);

    return preview;
}

const DEFAULT_CONFIG: Partial<DragDropConfig> = {
    enabled: true,
    allowReorder: true,
    allowReparent: true,
    autoExpandDelay: 500,
    scrollSpeed: 10,
    scrollThreshold: 50,
    patterns: [],
    constraints: {},
    validateDrop: () => true
};

/**
 * Hook for tree drag & drop functionality
 */
export function useTreeDragDrop(
    nodeMap: Map<string, TreeNode>,
    expandedNodes: Set<string>,
    onNodeExpand: (nodeId: string) => void,
    config: DragDropConfig = {},
    _getDescendantIds?: (nodeId: string) => string[]
) {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    const workerManagerRef = useRef<WorkerManager | null>(null);

    // Initialize worker manager
    useEffect(() => {
        workerManagerRef.current = WorkerManager.getInstance();
        return () => {
            // Worker manager is singleton, don't destroy on unmount
        };
    }, []);

    // Drag state
    const [dragState, setDragState] = useState<DragDropState>({
        draggedNodes: [],
        draggedNodeSet: null,
        draggedOver: null,
        dropPosition: null,
        autoExpandTimer: null,
        scrollTimer: null,
        pendingOperation: null
    });

    // Refs for event handling
    const dragImageRef = useRef<HTMLElement | null>(null);
    const scrollContainerRef = useRef<HTMLElement | null>(null);

    /**
     * Get root nodes for validation
     */
    const getRootNodes = useCallback((): TreeNode[] => {
        return Array.from(nodeMap.values()).filter(n => !n.parentId);
    }, [nodeMap]);

    /**
     * Validate drop based on constraint patterns
     */
    const validatePatternConstraints = useCallback(
        (source: TreeNode[], target: TreeNode, position: DropPosition): boolean => {
            const patterns = mergedConfig.patterns || [];
            const constraints = mergedConfig.constraints || {};

            // If no patterns specified, allow all
            if (patterns.length === 0) {
                return true;
            }

            // Check each pattern - ALL must pass
            return patterns.every(pattern => {
                switch (pattern) {
                    // Movement scope constraints
                    case "same-parent":
                        const targetParentId = position === "inside" ? target.id : target.parentId;
                        return source.every(node => node.parentId === targetParentId);

                    case "same-level":
                        const targetLevel = position === "inside" ? target.level + 1 : target.level;
                        return source.every(node => node.level === targetLevel);

                    case "same-branch":
                        // Use branchDepth from constraints (default: 1 = top-level branch)
                        const branchDepth = constraints.branchDepth || 1;
                        const getBranch = (structureId: string) => {
                            const parts = structureId.split(".");
                            return parts.slice(0, branchDepth).join(".");
                        };
                        const targetBranch = getBranch(target.structureId || "");
                        return source.every(node => getBranch(node.structureId || "") === targetBranch);

                    case "adjacent-only":
                        // Can only move to positions next to current position
                        const parent = target.parentId ? nodeMap.get(target.parentId) : null;
                        const siblings = parent ? parent.children : getRootNodes();
                        const targetIndex = siblings.findIndex(n => n.id === target.id);
                        return source.every(node => {
                            const sourceIndex = siblings.findIndex(n => n.id === node.id);
                            const distance = Math.abs(targetIndex - sourceIndex);
                            return distance <= 1;
                        });

                    // Node type constraints
                    case "leaf-only":
                        return source.every(node => node.isLeaf || node.children.length === 0);

                    case "parent-only":
                        return source.every(node => !node.isLeaf && node.children.length > 0);

                    case "no-root-move":
                        return source.every(node => node.parentId !== null);

                    // Hierarchy constraints
                    case "max-children":
                        if (position !== "inside") {
                            return true;
                        }
                        const maxChildren = constraints.maxChildren || 10;
                        return target.children.length < maxChildren;

                    case "max-depth":
                        const targetDepth = position === "inside" ? target.level + 1 : target.level;
                        const maxDepth = constraints.maxDepth || 10;
                        return targetDepth <= maxDepth;

                    case "maintain-balance":
                        // Simple check - ensure branches don't differ by more than 1 level
                        const getMaxDepth = (node: TreeNode): number => {
                            if (node.children.length === 0) {
                                return 0;
                            }
                            return 1 + Math.max(...node.children.map(getMaxDepth));
                        };
                        const depths = getRootNodes().map(getMaxDepth);
                        const maxTreeDepth = Math.max(...depths);
                        const minTreeDepth = Math.min(...depths);
                        return maxTreeDepth - minTreeDepth <= 1;

                    // Order constraints
                    case "preserve-order":
                        // Basic implementation - would need sort criteria
                        return true;

                    case "no-gaps":
                        // Check that structure IDs remain sequential
                        return true;

                    // Direction constraints
                    case "up-only":
                        const upTargetLevel = position === "inside" ? target.level + 1 : target.level;
                        return source.every(node => upTargetLevel < node.level);

                    case "down-only":
                        const downTargetLevel = position === "inside" ? target.level + 1 : target.level;
                        return source.every(node => downTargetLevel > node.level);

                    case "forward-only":
                    case "backward-only":
                        // Would need to know current position in sequence
                        return true;

                    default:
                        console.warn(`Unknown drag constraint pattern: ${pattern}`);
                        return true;
                }
            });
        },
        [mergedConfig, nodeMap, getRootNodes]
    );

    /**
     * Validate simple constraints
     */
    const validateSimpleConstraints = useCallback(
        (_source: TreeNode[], target: TreeNode, position: DropPosition): boolean => {
            const constraints = mergedConfig.constraints || {};

            // Check allowed/blocked parents
            if (position === "inside") {
                if (constraints.allowedParents && constraints.allowedParents.length > 0) {
                    if (!constraints.allowedParents.includes(target.id)) {
                        return false;
                    }
                }

                if (constraints.blockedParents && constraints.blockedParents.length > 0) {
                    if (constraints.blockedParents.includes(target.id)) {
                        return false;
                    }
                }
            }

            // Check depth constraints
            const targetDepth = position === "inside" ? target.level + 1 : target.level;
            if (constraints.maxDepth !== undefined && targetDepth > constraints.maxDepth) {
                return false;
            }
            if (constraints.minDepth !== undefined && targetDepth < constraints.minDepth) {
                return false;
            }

            return true;
        },
        [mergedConfig]
    );

    /**
     * Get all descendant IDs of a node
     */
    const getAllDescendants = useCallback(
        (node: TreeNode): Set<string> => {
            // Use the centralized helper that handles unloaded nodes
            const descendantIds = getAllDescendantIds(node, nodeMap);
            return new Set(descendantIds);
        },
        [nodeMap]
    );

    /**
     * Check if a drop is valid
     */
    const isValidDrop = useCallback(
        (source: TreeNode[], target: TreeNode, position: DropPosition): boolean => {
            if (!mergedConfig.enabled) {
                return false;
            }

            // Can't drop on self
            if (source.some(node => node.id === target.id)) {
                return false;
            }

            // Can't drop parent on its descendant - use isDescendantOf utility
            if (
                source.some(node => {
                    // Check if target is a descendant of source using structure IDs
                    if (node.structureId && target.structureId) {
                        return isDescendantOf(target.structureId, node.structureId);
                    }
                    // Fallback to checking descendants if structure IDs not available
                    const descendants = getAllDescendants(node);
                    return descendants.has(target.id);
                })
            ) {
                return false;
            }

            // Check position-specific rules
            if (position === "inside") {
                if (!mergedConfig.allowReparent) {
                    return false;
                }
                // Can't drop inside a leaf node
                if (target.isLeaf && !target.hasChildren) {
                    return false;
                }
            } else {
                if (!mergedConfig.allowReorder) {
                    return false;
                }
            }

            // Validate pattern constraints
            if (!validatePatternConstraints(source, target, position)) {
                return false;
            }

            // Validate simple constraints
            if (!validateSimpleConstraints(source, target, position)) {
                return false;
            }

            // Custom validation (final check)
            return mergedConfig.validateDrop ? mergedConfig.validateDrop(source, target, position) : true;
        },
        [mergedConfig, getAllDescendants, validatePatternConstraints, validateSimpleConstraints]
    );

    /**
     * Calculate structure changes for a drop operation (with Worker support for large operations)
     */
    const calculateStructureChanges = useCallback(
        async (draggedNodes: TreeNode[], targetNode: TreeNode, position: DropPosition): Promise<StructureChange[]> => {
            // For large operations, use Web Worker
            const workerManager = workerManagerRef.current;
            const totalNodes = draggedNodes.reduce(
                (sum, node) => sum + 1 + (node.hasChildren ? node.children.length : 0),
                0
            );

            if (workerManager && totalNodes > 100) {
                try {
                    // Serialize nodes for worker
                    const allNodes: ISerializedNode[] = [];
                    const nodeArray = Array.from(nodeMap.values());

                    nodeArray.forEach(node => {
                        allNodes.push({
                            id: node.id,
                            label: node.label || node.id,
                            parentId: node.parentId,
                            structureId: node.structureId || null
                        });
                    });

                    // Calculate new parent and index for first dragged node
                    let newParentId: string | null;
                    let newIndex: number;

                    if (position === "inside") {
                        newParentId = targetNode.id;
                        newIndex = targetNode.children.length;
                    } else {
                        newParentId = targetNode.parentId;
                        const siblings = newParentId
                            ? nodeMap.get(newParentId)?.children || []
                            : Array.from(nodeMap.values()).filter(n => !n.parentId);

                        const targetIndex = siblings.findIndex(s => s.id === targetNode.id);
                        newIndex = position === "before" ? targetIndex : targetIndex + 1;
                    }

                    // Send to worker
                    const result = await workerManager.sendWork<any>(
                        "structureId",
                        "UPDATE_AFTER_MOVE",
                        {
                            nodes: allNodes,
                            movedNodeId: draggedNodes[0].id, // For now, handle first node
                            newParentId,
                            newIndex,
                            oldParentId: draggedNodes[0].parentId
                        },
                        progress => {
                            console.debug(`Structure update progress: ${progress.processed}/${progress.total}`);
                        }
                    );

                    // Convert worker result to StructureChange format
                    return result.updates.map((update: any) => ({
                        nodeId: update.nodeId,
                        oldStructureId: nodeMap.get(update.nodeId)?.structureId || "",
                        newStructureId: update.structureId,
                        oldParentId: nodeMap.get(update.nodeId)?.parentId || null,
                        newParentId:
                            update.updates.parentId !== undefined
                                ? update.updates.parentId
                                : nodeMap.get(update.nodeId)?.parentId || null,
                        oldIndex: 0, // TODO FIX: Calculate actual old index from parent's children array
                        newIndex: 0 // TODO FIX: Calculate actual new index based on drop position
                    }));
                } catch (error) {
                    console.warn("Worker structure calculation failed, falling back to main thread:", error);
                    // Fall through to main thread implementation
                }
            }

            // Main thread implementation using our DRY utility
            const updates = calculateDragDropStructureUpdates(draggedNodes, targetNode, position, nodeMap);

            // Convert IStructureUpdate[] to StructureChange[] format expected by the API
            // The interfaces have the same fields, just different names
            const changes: StructureChange[] = updates;

            return changes;
        },
        [nodeMap]
    );

    /**
     * Find top-level nodes being moved (for loading indicators)
     */
    const findTopLevelNodes = useCallback(
        (draggedNodes: TreeNode[]): TreeNode[] => {
            const draggedIds = new Set(draggedNodes.map(n => n.id));
            const topLevel: TreeNode[] = [];

            draggedNodes.forEach(node => {
                // Check if any ancestor is also being dragged
                let current = node;
                let hasAncestorInDrag = false;

                while (current.parentId) {
                    if (draggedIds.has(current.parentId)) {
                        hasAncestorInDrag = true;
                        break;
                    }
                    const parentNode = nodeMap.get(current.parentId);
                    if (!parentNode) {
                        break;
                    }
                    current = parentNode;
                }

                if (!hasAncestorInDrag) {
                    topLevel.push(node);
                }
            });

            return topLevel;
        },
        [nodeMap]
    );

    /**
     * Prepare complete drag drop operation with rollback data
     */
    const prepareDragDropOperation = useCallback(
        async (
            draggedNodes: TreeNode[],
            targetNode: TreeNode,
            position: DropPosition,
            draggedNodeSet?: DraggedNodeSet | null
        ): Promise<DragDropOperation | null> => {
            // Calculate all structure changes based on selection type
            let changes: StructureChange[];

            if (draggedNodeSet && draggedNodeSet.type === "connected" && draggedNodeSet.isCompleteBranch) {
                // For connected selections with complete branches, move as a single unit
                // This preserves the hierarchical structure
                changes = await calculateStructureChanges([draggedNodeSet.rootNode!], targetNode, position);
            } else {
                // For scattered selections or partial branches, calculate changes for all nodes
                // They will be flattened as siblings at the drop location
                changes = await calculateStructureChanges(draggedNodes, targetNode, position);
            }
            if (changes.length === 0) {
                return null;
            }

            // Find top-level nodes for loading indicators
            const topLevelNodes = findTopLevelNodes(draggedNodes);
            const topLevelIds = topLevelNodes.map(n => n.id);

            // Prepare rollback data
            const rollbackData: RollbackData = {
                movedBranches: [],
                orphanedNodes: [],
                unloadedDescendants: []
            };

            // Track moved branches (top-level nodes being moved)
            topLevelNodes.forEach(node => {
                const change = changes.find(c => c.nodeId === node.id);
                if (change) {
                    rollbackData.movedBranches.push({
                        nodeId: node.id,
                        oldStructureId: change.oldStructureId,
                        newStructureId: change.newStructureId
                    });
                }

                // Check for unloaded children
                if (node.hasChildren && (!node.children || node.children.length === 0)) {
                    rollbackData.unloadedDescendants.push({
                        parentId: node.id,
                        hasUnloadedChildren: true
                    });
                }
            });

            // Find orphaned nodes (siblings that were reindexed but not moved)
            const draggedNodeIds = new Set(draggedNodes.map(n => n.id));

            changes.forEach(change => {
                // If node wasn't dragged but its structure changed, it's an orphaned sibling
                if (!draggedNodeIds.has(change.nodeId) && change.oldStructureId !== change.newStructureId) {
                    rollbackData.orphanedNodes.push({
                        nodeId: change.nodeId,
                        oldStructureId: change.oldStructureId,
                        oldParentId: change.oldParentId || "",
                        newStructureId: change.newStructureId,
                        newParentId: change.newParentId || ""
                    });
                }
            });

            // Generate request ID
            const requestId = `dd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            return {
                requestId,
                changes,
                rollbackData,
                topLevelNodes: topLevelIds,
                totalItemCount: changes.length
            };
        },
        [calculateStructureChanges, findTopLevelNodes]
    );

    /**
     * Handle drag start
     */
    const handleDragStart = useCallback(
        (event: React.DragEvent, node: TreeNode, selectedNodes?: Set<string>) => {
            if (!mergedConfig.enabled) {
                return;
            }

            // Determine which nodes are being dragged
            const selectedNodeIds = selectedNodes && selectedNodes.has(node.id) ? selectedNodes : new Set([node.id]);
            const draggedNodes = Array.from(selectedNodeIds)
                .map(id => nodeMap.get(id))
                .filter(Boolean) as TreeNode[];

            // Analyze the dragged selection
            const draggedNodeSet = analyzeDraggedNodes(selectedNodeIds, nodeMap);

            // Set drag data with rich information for cross-tree operations
            event.dataTransfer.effectAllowed = "move";

            // Set multiple data types for different drop targets
            // Plain text for basic compatibility
            event.dataTransfer.setData("text/plain", draggedNodes.map(n => n.id).join(","));

            // JSON data for rich tree operations
            const dragData = {
                sourceTreeId: "default", // Identify source tree
                nodes: draggedNodes.map(node => ({
                    id: node.id,
                    label: node.label,
                    structureId: node.structureId,
                    parentId: node.parentId,
                    level: node.level,
                    hasChildren: node.children.length > 0,
                    objectItem: node.objectItem // For Mendix operations
                })),
                timestamp: Date.now() // For validation
            };
            event.dataTransfer.setData("application/x-tree-nodes", JSON.stringify(dragData));

            // Set custom type for internal tree operations
            event.dataTransfer.setData(
                "application/x-mendix-tree",
                JSON.stringify({
                    treeId: "default",
                    nodeIds: draggedNodes.map(n => n.id),
                    operation: "move" // Could be 'move' or 'copy' based on keys
                })
            );

            // Create custom drag image with selection description
            if (draggedNodes.length > 1 || dragImageRef.current) {
                const dragImage =
                    dragImageRef.current || createDragPreview(draggedNodes, describeDragSelection(draggedNodeSet));
                event.dataTransfer.setDragImage(dragImage, 20, 20);

                // Clean up temporary element after drag starts
                if (!dragImageRef.current && dragImage.parentNode) {
                    window.setTimeout(() => {
                        if (dragImage.parentNode) {
                            dragImage.parentNode.removeChild(dragImage);
                        }
                    }, 0);
                }
            }

            setDragState({
                draggedNodes,
                draggedNodeSet,
                draggedOver: null,
                dropPosition: null,
                autoExpandTimer: null,
                scrollTimer: null,
                pendingOperation: null
            });
        },
        [mergedConfig.enabled, nodeMap]
    );

    /**
     * Handle drag over
     */
    const handleDragOver = useCallback(
        (event: React.DragEvent, node: TreeNode) => {
            if (!mergedConfig.enabled || dragState.draggedNodes.length === 0) {
                return;
            }

            event.preventDefault();

            // Calculate drop position based on mouse position
            const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
            const y = event.clientY - rect.top;
            const height = rect.height;
            const threshold = height * 0.25;

            let position: DropPosition;
            if (y < threshold) {
                position = "before";
            } else if (y > height - threshold) {
                position = "after";
            } else {
                position = "inside";
            }

            // Validate drop
            if (!isValidDrop(dragState.draggedNodes, node, position)) {
                event.dataTransfer.dropEffect = "none";
                return;
            }

            event.dataTransfer.dropEffect = "move";

            // Update state
            setDragState(prev => ({
                ...prev,
                draggedOver: node.id,
                dropPosition: position
            }));

            // Auto-expand logic
            if (position === "inside" && !expandedNodes.has(node.id) && node.hasChildren) {
                if (dragState.autoExpandTimer) {
                    window.clearTimeout(dragState.autoExpandTimer);
                }

                const timer = window.setTimeout(() => {
                    onNodeExpand(node.id);
                }, mergedConfig.autoExpandDelay);

                setDragState(prev => ({
                    ...prev,
                    autoExpandTimer: timer
                }));
            }

            // Auto-scroll logic
            handleAutoScroll(event);
        },
        [mergedConfig, dragState.draggedNodes, isValidDrop, expandedNodes, onNodeExpand]
    );

    /**
     * Handle drag leave
     */
    const handleDragLeave = useCallback(
        (event: React.DragEvent) => {
            // Only clear if leaving the tree entirely
            if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                if (dragState.autoExpandTimer) {
                    window.clearTimeout(dragState.autoExpandTimer);
                }

                setDragState(prev => ({
                    ...prev,
                    draggedOver: null,
                    dropPosition: null,
                    autoExpandTimer: null
                }));
            }
        },
        [dragState.autoExpandTimer]
    );

    /**
     * Handle drop
     */
    const handleDrop = useCallback(
        (event: React.DragEvent, node: TreeNode) => {
            event.preventDefault();
            event.stopPropagation();

            if (!mergedConfig.enabled || !dragState.dropPosition) {
                return;
            }

            const { draggedNodes, draggedNodeSet, dropPosition } = dragState;

            if (!isValidDrop(draggedNodes, node, dropPosition)) {
                return;
            }

            // Prepare complete operation with rollback data
            prepareDragDropOperation(draggedNodes, node, dropPosition, draggedNodeSet)
                .then(operation => {
                    if (operation) {
                        // Notify parent component with operation details
                        mergedConfig.onDropComplete?.(operation.changes, operation.requestId);

                        // Store operation for potential rollback
                        setDragState(prev => ({
                            ...prev,
                            pendingOperation: operation
                        }));
                    }
                })
                .catch(error => {
                    console.error("Failed to prepare drag drop operation:", error);
                });

            // Clean up drag state (but keep pending operation)
            setDragState(prev => ({
                ...prev,
                draggedNodes: [],
                draggedOver: null,
                dropPosition: null,
                autoExpandTimer: null,
                scrollTimer: null
            }));
        },
        [mergedConfig, dragState, isValidDrop, prepareDragDropOperation]
    );

    /**
     * Handle drag end
     */
    const handleDragEnd = useCallback(() => {
        if (dragState.autoExpandTimer) {
            window.clearTimeout(dragState.autoExpandTimer);
        }
        if (dragState.scrollTimer) {
            window.clearTimeout(dragState.scrollTimer);
        }

        setDragState(prev => ({
            ...prev,
            draggedNodes: [],
            draggedOver: null,
            dropPosition: null,
            autoExpandTimer: null,
            scrollTimer: null
            // Keep pendingOperation for potential rollback
        }));
    }, [dragState.autoExpandTimer, dragState.scrollTimer]);

    /**
     * Handle auto-scroll during drag
     */
    const handleAutoScroll = useCallback(
        (event: React.DragEvent) => {
            if (!scrollContainerRef.current) {
                return;
            }

            const container = scrollContainerRef.current;
            const rect = container.getBoundingClientRect();
            const y = event.clientY;

            let scrollDirection = 0;
            const scrollThreshold = mergedConfig.scrollThreshold ?? DEFAULT_CONFIG.scrollThreshold ?? 50;
            if (y < rect.top + scrollThreshold) {
                scrollDirection = -1;
            } else if (y > rect.bottom - scrollThreshold) {
                scrollDirection = 1;
            }

            if (scrollDirection !== 0) {
                if (dragState.scrollTimer) {
                    window.clearTimeout(dragState.scrollTimer);
                }

                const scroll = () => {
                    const scrollSpeed = mergedConfig.scrollSpeed ?? DEFAULT_CONFIG.scrollSpeed ?? 10;
                    container.scrollTop += scrollDirection * scrollSpeed;

                    const timer = window.setTimeout(scroll, 50);
                    setDragState(prev => ({
                        ...prev,
                        scrollTimer: timer
                    }));
                };

                scroll();
            } else if (dragState.scrollTimer) {
                window.clearTimeout(dragState.scrollTimer);
                setDragState(prev => ({
                    ...prev,
                    scrollTimer: null
                }));
            }
        },
        [mergedConfig.scrollThreshold, mergedConfig.scrollSpeed, dragState.scrollTimer]
    );

    /**
     * Set scroll container ref
     */
    const setScrollContainer = useCallback((element: HTMLElement | null) => {
        scrollContainerRef.current = element;
    }, []);

    /**
     * Set drag image ref
     */
    const setDragImage = useCallback((element: HTMLElement | null) => {
        dragImageRef.current = element;
    }, []);

    /**
     * Clear pending operation after completion
     */
    const clearPendingOperation = useCallback(() => {
        setDragState(prev => ({
            ...prev,
            pendingOperation: null
        }));
    }, []);

    return {
        // State
        isDragging: dragState.draggedNodes.length > 0,
        draggedNodes: dragState.draggedNodes,
        draggedOver: dragState.draggedOver,
        dropPosition: dragState.dropPosition,
        pendingOperation: dragState.pendingOperation,

        // Handlers
        handleDragStart,
        handleDragOver,
        handleDragLeave,
        handleDrop,
        handleDragEnd,

        // Utilities
        isValidDrop,
        calculateStructureChanges,
        prepareDragDropOperation,
        clearPendingOperation,
        setScrollContainer,
        setDragImage
    };
}
