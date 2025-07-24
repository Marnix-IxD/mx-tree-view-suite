/**
 * Lazy Structure ID Generator
 *
 * Generates structure IDs on-demand for client-side use only.
 * These IDs are NOT persisted to the server and are used purely for:
 * - Selection logic (descendant checks)
 * - UI display
 * - Internal tree operations
 *
 * IMPORTANT: When using client-side generation, structure ID attributes
 * (focusedStructureIdAttribute, hoveredStructureIdAttribute, etc.)
 * cannot be used as the server doesn't know about these IDs.
 */

import { TreeNode } from "../types/TreeTypes";

// Constants
const STRUCTURE_ID_SEPARATOR = ".";
const CACHE_KEY = "structureId";

/**
 * Cache entry for lazy structure IDs
 */
interface IStructureIdCacheEntry {
    structureId: string;
    parentId: string | null;
    siblingIndex: number;
}

/**
 * Lazy structure ID generator
 * Generates IDs on-demand as nodes become visible/loaded
 */
export class LazyStructureIdGenerator {
    private cache: Map<string, IStructureIdCacheEntry> = new Map();
    private siblingCounters: Map<string, number> = new Map();

    /**
     * Get or generate structure ID for a node
     * Uses cached value if available, otherwise generates on-demand
     */
    getStructureId(node: TreeNode, parentNode?: TreeNode): string {
        // Check if already cached
        const cached = this.cache.get(node.id);
        if (cached) {
            return cached.structureId;
        }

        // Generate new structure ID
        return this.generateStructureId(node, parentNode);
    }

    /**
     * Generate structure ID for a single node
     */
    private generateStructureId(node: TreeNode, parentNode?: TreeNode): string {
        let structureId: string;
        let parentId: string | null = null;
        let siblingIndex: number;

        if (!parentNode || parentNode.level === 0) {
            // Root node
            siblingIndex = this.getNextSiblingIndex(null);
            structureId = `${siblingIndex}${STRUCTURE_ID_SEPARATOR}`;
        } else {
            // Child node - need parent's structure ID
            parentId = parentNode.id;
            const parentStructureId = this.getStructureId(parentNode);
            siblingIndex = this.getNextSiblingIndex(parentId);
            structureId = `${parentStructureId}${siblingIndex}${STRUCTURE_ID_SEPARATOR}`;
        }

        // Cache the result
        this.cache.set(node.id, {
            structureId,
            parentId,
            siblingIndex
        });

        // Store on node for quick access
        (node as any)[CACHE_KEY] = structureId;

        console.debug(`[LazyStructureIdGenerator][Generate] Generated structure ID ${structureId} for node ${node.id}`);

        return structureId;
    }

    /**
     * Get next sibling index for a parent
     */
    private getNextSiblingIndex(parentId: string | null): number {
        const key = parentId || "ROOT";
        const current = this.siblingCounters.get(key) || 0;
        const next = current + 1;
        this.siblingCounters.set(key, next);
        return next;
    }

    /**
     * Generate structure IDs for a batch of nodes
     * Optimized for when multiple siblings are loaded at once
     */
    generateBatch(nodes: TreeNode[], parentNodeMap: Map<string, TreeNode>): Map<string, string> {
        const results = new Map<string, string>();

        // Group nodes by parent for efficient sibling numbering
        const nodesByParent = new Map<string | null, TreeNode[]>();

        for (const node of nodes) {
            const parentId = node.parentId;
            const group = nodesByParent.get(parentId) || [];
            group.push(node);
            nodesByParent.set(parentId, group);
        }

        // Process each parent group
        for (const [parentId, siblings] of nodesByParent) {
            // Sort siblings by their sort order
            siblings.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

            const parentNode = parentId ? parentNodeMap.get(parentId) : undefined;

            // Generate IDs for each sibling
            for (const node of siblings) {
                const structureId = this.getStructureId(node, parentNode);
                results.set(node.id, structureId);
            }
        }

        return results;
    }

    /**
     * Clear cache for specific nodes or all nodes
     * Used when nodes are moved, deleted, or tree is reset
     */
    clearCache(nodeIds?: string[]): void {
        if (nodeIds) {
            for (const nodeId of nodeIds) {
                const cached = this.cache.get(nodeId);
                if (cached) {
                    // Also clear sibling counter for parent if this was the last child
                    const parentKey = cached.parentId || "ROOT";
                    const siblings = Array.from(this.cache.values()).filter(
                        entry => entry.parentId === cached.parentId
                    );
                    if (siblings.length <= 1) {
                        this.siblingCounters.delete(parentKey);
                    }
                }
                this.cache.delete(nodeId);
            }
        } else {
            this.cache.clear();
            this.siblingCounters.clear();
        }
    }

    /**
     * Check if a node has a cached structure ID
     */
    hasCachedId(nodeId: string): boolean {
        return this.cache.has(nodeId);
    }

    /**
     * Get all cached structure IDs
     * Useful for debugging
     */
    getAllCached(): Map<string, string> {
        const result = new Map<string, string>();
        for (const [nodeId, entry] of this.cache) {
            result.set(nodeId, entry.structureId);
        }
        return result;
    }

    /**
     * Update structure IDs after node move
     * Only clears affected nodes, letting them regenerate lazily
     */
    handleNodeMove(
        movedNodeId: string,
        oldParentId: string | null,
        newParentId: string | null,
        affectedSiblingIds: string[]
    ): void {
        // Clear moved node and its descendants
        const descendantIds = this.getDescendantIds(movedNodeId);
        this.clearCache([movedNodeId, ...descendantIds]);

        // Clear affected siblings in both old and new locations
        this.clearCache(affectedSiblingIds);

        // Reset sibling counters for affected parents
        if (oldParentId) {
            this.siblingCounters.delete(oldParentId);
        }
        if (newParentId) {
            this.siblingCounters.delete(newParentId);
        }

        console.debug(
            `[LazyStructureIdGenerator][HandleNodeMove] Cleared cache for moved node and ${descendantIds.length} descendants`
        );
    }

    /**
     * Get all descendant IDs for a node
     * Used when clearing cache after moves
     */
    private getDescendantIds(nodeId: string): string[] {
        const descendants: string[] = [];
        const nodeStructureId = this.cache.get(nodeId)?.structureId;

        if (!nodeStructureId) {
            return descendants;
        }

        // Find all nodes whose structure ID starts with this node's ID
        for (const [id, entry] of this.cache) {
            if (id !== nodeId && entry.structureId.startsWith(nodeStructureId)) {
                descendants.push(id);
            }
        }

        return descendants;
    }

    /**
     * Get cache statistics
     */
    getStats(): {
        totalCached: number;
        totalParents: number;
        cacheHitRate: number;
    } {
        return {
            totalCached: this.cache.size,
            totalParents: this.siblingCounters.size,
            cacheHitRate: 0 // Could track hits/misses for real hit rate
        };
    }
}

/**
 * Singleton instance for the application
 */
let instance: LazyStructureIdGenerator | null = null;

/**
 * Get or create the lazy structure ID generator instance
 */
export function getLazyStructureIdGenerator(): LazyStructureIdGenerator {
    if (!instance) {
        instance = new LazyStructureIdGenerator();
    }
    return instance;
}

/**
 * Clear the singleton instance
 * Useful for testing or when switching trees
 */
export function clearLazyStructureIdGenerator(): void {
    if (instance) {
        instance.clearCache();
        instance = null;
    }
}

/**
 * Quick helper to get structure ID for a node
 */
export function getNodeStructureId(node: TreeNode, parentNode?: TreeNode): string {
    // First check if it's already on the node
    if ((node as any)[CACHE_KEY]) {
        return (node as any)[CACHE_KEY];
    }

    // Otherwise use the generator
    const generator = getLazyStructureIdGenerator();
    return generator.getStructureId(node, parentNode);
}

/**
 * Check if one structure ID is a descendant of another
 * This is the main reason we use structure IDs!
 */
export function isDescendantStructureId(descendantId: string | undefined, ancestorId: string | undefined): boolean {
    if (!descendantId || !ancestorId) {
        return false;
    }

    // A node is a descendant if its ID starts with the ancestor's ID
    // and is longer (to avoid "1.1." matching "1.10.")
    return descendantId.startsWith(ancestorId) && descendantId.length > ancestorId.length;
}
