import { ObjectItem } from "mendix";
import { TreeNode } from "../types/TreeTypes";

/**
 * Three-tier node system for efficient memory management
 */

// Tier 1: Minimal structural data (always kept in memory)
export interface StructuralNode {
    id: string;
    parentId: string | null;
    childIds: string[];
    level: number;
    hasChildren: boolean;
    childCount: number;
    height: number; // For scroll position calculation
}

// Tier 2: Skeleton node (placeholder for offloaded data)
export interface SkeletonNode extends TreeNode {
    isSkeleton: true;
    structuralData: StructuralNode;
    lastAccessTime?: number;
}

// Tier 3: Full node with all data
export interface FullNode extends TreeNode {
    isSkeleton: false;
    objectItem: ObjectItem;
    lastAccessTime: number;
}

export type ManagedNode = SkeletonNode | FullNode;

/**
 * LRU Cache implementation for node data
 */
export class NodeLRUCache {
    private cache: Map<string, { data: ObjectItem; lastAccess: number }> = new Map();
    private readonly maxSize: number;
    private readonly maxAge: number; // milliseconds

    constructor(maxSize = 5000, maxAgeSeconds = 60) {
        this.maxSize = maxSize;
        this.maxAge = maxAgeSeconds * 1000;
    }

    set(id: string, data: ObjectItem): void {
        // Remove oldest if at capacity
        if (this.cache.size >= this.maxSize && !this.cache.has(id)) {
            const oldest = this.findOldest();
            if (oldest) {
                this.cache.delete(oldest);
            }
        }

        this.cache.set(id, {
            data,
            lastAccess: Date.now()
        });
    }

    get(id: string): ObjectItem | null {
        const entry = this.cache.get(id);
        if (!entry) {
            return null;
        }

        // Check if expired
        if (Date.now() - entry.lastAccess > this.maxAge) {
            this.cache.delete(id);
            return null;
        }

        // Update access time
        entry.lastAccess = Date.now();
        return entry.data;
    }

    has(id: string): boolean {
        const entry = this.cache.get(id);
        if (!entry) {
            return false;
        }

        // Check expiration
        if (Date.now() - entry.lastAccess > this.maxAge) {
            this.cache.delete(id);
            return false;
        }

        return true;
    }

    private findOldest(): string | null {
        let oldestId: string | null = null;
        let oldestTime = Date.now();

        for (const [id, entry] of this.cache.entries()) {
            if (entry.lastAccess < oldestTime) {
                oldestTime = entry.lastAccess;
                oldestId = id;
            }
        }

        return oldestId;
    }

    clear(): void {
        this.cache.clear();
    }

    // Get cache statistics
    getStats(): { size: number; maxSize: number; hitRate: number } {
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            hitRate: 0 // TODO: Track hits/misses for hit rate calculation
        };
    }
}

/**
 * Activity tracker to determine if tree is being actively used
 */
export class TreeActivityTracker {
    private lastActivityTime = Date.now();
    private activityListeners: Set<() => void> = new Set();
    private inactivityTimer: number | null = null;
    private readonly inactivityThreshold: number;
    private isActive = true;

    constructor(inactivityThresholdSeconds = 30) {
        this.inactivityThreshold = inactivityThresholdSeconds * 1000;
        this.startInactivityTimer();
    }

    recordActivity(_type: "mouse" | "keyboard" | "scroll" | "focus" | "expand"): void {
        this.lastActivityTime = Date.now();

        if (!this.isActive) {
            this.isActive = true;
            this.notifyListeners();
        }

        this.resetInactivityTimer();
    }

    onActivityChange(listener: () => void): () => void {
        this.activityListeners.add(listener);
        return () => this.activityListeners.delete(listener);
    }

    getIsActive(): boolean {
        return this.isActive;
    }

    getTimeSinceLastActivity(): number {
        return Date.now() - this.lastActivityTime;
    }

    private startInactivityTimer(): void {
        this.inactivityTimer = window.setTimeout(() => {
            if (this.isActive && this.getTimeSinceLastActivity() >= this.inactivityThreshold) {
                this.isActive = false;
                this.notifyListeners();
            }
            this.startInactivityTimer(); // Restart timer
        }, this.inactivityThreshold);
    }

    private resetInactivityTimer(): void {
        if (this.inactivityTimer !== null) {
            window.clearTimeout(this.inactivityTimer);
        }
        this.startInactivityTimer();
    }

    private notifyListeners(): void {
        this.activityListeners.forEach(listener => listener());
    }

    destroy(): void {
        if (this.inactivityTimer !== null) {
            window.clearTimeout(this.inactivityTimer);
        }
        this.activityListeners.clear();
    }
}

/**
 * Memory protection configuration
 */
export interface IMemoryProtectionConfig {
    expandedNodes?: Set<string>;
    branches?: Array<{
        branchSelection: string;
        deselectedAncestors: string[];
        deselectedDescendants: string[];
    }>;
}

/**
 * Memory manager for large tree datasets
 */
export class TreeMemoryManager {
    private structuralData: Map<string, StructuralNode> = new Map();
    private nodeCache: NodeLRUCache;
    private activityTracker: TreeActivityTracker;
    private viewportNodes: Set<string> = new Set();
    private prefetchRadius = 50; // Number of nodes to prefetch around viewport
    private memoryProtection: IMemoryProtectionConfig = {};

    constructor(maxCacheSize = 5000, cacheMaxAgeSeconds = 60, inactivityThresholdSeconds = 30) {
        this.nodeCache = new NodeLRUCache(maxCacheSize, cacheMaxAgeSeconds);
        this.activityTracker = new TreeActivityTracker(inactivityThresholdSeconds);

        // Start offloading when inactive
        this.activityTracker.onActivityChange(() => {
            if (!this.activityTracker.getIsActive()) {
                this.performOffloading();
            }
        });
    }

    /**
     * Convert ObjectItem to managed node (full or skeleton)
     */
    createManagedNode(
        item: ObjectItem,
        structuralInfo: Omit<StructuralNode, "height">,
        itemHeight: number
    ): ManagedNode {
        const structural: StructuralNode = {
            ...structuralInfo,
            height: itemHeight
        };

        // Store structural data
        this.structuralData.set(item.id, structural);

        // Store in cache
        this.nodeCache.set(item.id, item);

        // Create full node
        const fullNode: FullNode = {
            id: item.id,
            parentId: structural.parentId,
            objectItem: item,
            children: [],
            level: structural.level,
            path: [],
            isLeaf: !structural.hasChildren,
            isVisible: true,
            isExpanded: false,
            isSkeleton: false,
            lastAccessTime: Date.now(),
            hasChildren: structural.hasChildren
        };

        return fullNode;
    }

    /**
     * Get node (full or skeleton)
     */
    getNode(id: string, itemsMap?: Map<string, ObjectItem>): ManagedNode | null {
        const structural = this.structuralData.get(id);
        if (!structural) {
            return null;
        }

        // Check if we have the full data in cache
        let objectItem = this.nodeCache.get(id);

        // If not in cache but available in items map, restore it
        if (!objectItem && itemsMap && itemsMap.has(id)) {
            objectItem = itemsMap.get(id)!;
            // Re-add to cache since it was requested
            this.nodeCache.set(id, objectItem);
            console.debug(`TreeMemoryManager: Restored node ${id} from items map to cache`);
        }

        if (objectItem) {
            // Return full node
            const fullNode: FullNode = {
                id,
                parentId: structural.parentId,
                objectItem,
                children: [],
                level: structural.level,
                path: [],
                isLeaf: !structural.hasChildren,
                isVisible: true,
                isExpanded: false,
                isSkeleton: false,
                lastAccessTime: Date.now(),
                hasChildren: structural.hasChildren
            };
            return fullNode;
        }

        // Return skeleton node
        const skeletonNode: SkeletonNode = {
            id,
            parentId: structural.parentId,
            objectItem: {} as ObjectItem, // Placeholder
            children: [],
            level: structural.level,
            path: [],
            isLeaf: !structural.hasChildren,
            isVisible: true,
            isExpanded: false,
            isSkeleton: true,
            structuralData: structural,
            hasChildren: structural.hasChildren,
            lastAccessTime: Date.now()
        };

        return skeletonNode;
    }

    /**
     * Update viewport for smart prefetching
     */
    updateViewport(visibleNodeIds: string[]): void {
        this.viewportNodes = new Set(visibleNodeIds);
        this.prefetchAroundViewport(visibleNodeIds);
    }

    /**
     * Update memory protection configuration
     */
    updateMemoryProtection(config: IMemoryProtectionConfig): void {
        this.memoryProtection = config;
    }

    /**
     * Check if a node is selected based on branch selection model
     */
    private isNodeSelectedByBranches(nodeId: string): boolean {
        if (!this.memoryProtection.branches || this.memoryProtection.branches.length === 0) {
            return false;
        }

        const structural = this.structuralData.get(nodeId);
        if (!structural) {
            return false;
        }

        // We need structure ID for branch-based selection
        // For now, we'll check if the node or any of its ancestors are branch roots
        for (const branch of this.memoryProtection.branches) {
            // Check if this node is a branch root
            if (branch.branchSelection === nodeId) {
                return true;
            }

            // Check if this node is a descendant of a selected branch
            // We'll need to walk up the tree to check
            let currentId: string | null = nodeId;
            while (currentId) {
                if (branch.branchSelection === currentId && !branch.deselectedDescendants.includes(nodeId)) {
                    return true;
                }
                const current = this.structuralData.get(currentId);
                currentId = current?.parentId || null;
            }
        }

        return false;
    }

    /**
     * Prefetch nodes around viewport
     */
    private prefetchAroundViewport(visibleNodeIds: string[]): void {
        if (visibleNodeIds.length === 0) {
            return;
        }

        const nodesToPrefetch = new Set<string>();

        // For each visible node, prefetch nodes around it
        visibleNodeIds.forEach(nodeId => {
            const structural = this.structuralData.get(nodeId);
            if (!structural) {
                return;
            }

            // Prefetch siblings (nodes at same level with same parent)
            if (structural.parentId) {
                const parentStructural = this.structuralData.get(structural.parentId);
                if (parentStructural) {
                    // Add all siblings to prefetch list
                    parentStructural.childIds.forEach(siblingId => {
                        nodesToPrefetch.add(siblingId);
                    });
                }
            }

            // Prefetch immediate children if node has children
            if (structural.hasChildren) {
                structural.childIds.forEach(childId => {
                    nodesToPrefetch.add(childId);
                });
            }

            // Prefetch parent
            if (structural.parentId) {
                nodesToPrefetch.add(structural.parentId);
            }
        });

        // Also prefetch nodes above and below the viewport
        // This requires calculating which nodes are just outside the viewport
        const sortedVisibleIds = this.getSortedNodeIds(visibleNodeIds);
        if (sortedVisibleIds.length > 0) {
            // Get nodes before first visible
            const firstId = sortedVisibleIds[0];
            const beforeNodes = this.getNodesBefore(firstId, this.prefetchRadius);
            beforeNodes.forEach(id => nodesToPrefetch.add(id));

            // Get nodes after last visible
            const lastId = sortedVisibleIds[sortedVisibleIds.length - 1];
            const afterNodes = this.getNodesAfter(lastId, this.prefetchRadius);
            afterNodes.forEach(id => nodesToPrefetch.add(id));
        }

        // Remove already cached nodes from prefetch list
        const actualNodesToPrefetch = Array.from(nodesToPrefetch).filter(
            id => !this.nodeCache.has(id) && this.structuralData.has(id)
        );

        // Trigger prefetch for these nodes
        if (actualNodesToPrefetch.length > 0) {
            console.debug(`TreeMemoryManager: Prefetching ${actualNodesToPrefetch.length} nodes around viewport`);
            // The actual loading will be handled by the data source
            // We just mark these as needed
            actualNodesToPrefetch.forEach(id => {
                // Touch the cache to indicate we want this node
                // This prevents it from being offloaded
                const structural = this.structuralData.get(id);
                if (structural) {
                    // Mark as recently accessed
                    this.nodeCache.get(id); // This updates access time if exists
                }
            });
        }
    }

    /**
     * Get sorted node IDs based on tree structure
     */
    private getSortedNodeIds(nodeIds: string[]): string[] {
        // Sort by level and structure ID to maintain tree order
        return nodeIds.sort((a, b) => {
            const structA = this.structuralData.get(a);
            const structB = this.structuralData.get(b);
            if (!structA || !structB) {
                return 0;
            }

            // First sort by level
            if (structA.level !== structB.level) {
                return structA.level - structB.level;
            }

            // Then by parent
            if (structA.parentId !== structB.parentId) {
                return (structA.parentId || "").localeCompare(structB.parentId || "");
            }

            // Finally by ID (which should maintain sibling order)
            return a.localeCompare(b);
        });
    }

    /**
     * Get nodes before a given node in tree order
     */
    private getNodesBefore(nodeId: string, count: number): string[] {
        const result: string[] = [];
        const visited = new Set<string>();

        // Walk up the tree structure
        let currentId: string | null = nodeId;
        while (result.length < count && currentId) {
            const structural = this.structuralData.get(currentId);
            if (!structural || visited.has(currentId)) {
                break;
            }
            visited.add(currentId);

            // Add previous siblings
            if (structural.parentId) {
                const parent = this.structuralData.get(structural.parentId);
                if (parent) {
                    const currentIndex = parent.childIds.indexOf(currentId);
                    for (let i = currentIndex - 1; i >= 0 && result.length < count; i--) {
                        result.push(parent.childIds[i]);
                    }
                }
            }

            // Move to parent
            currentId = structural.parentId;
        }

        return result;
    }

    /**
     * Get nodes after a given node in tree order
     */
    private getNodesAfter(nodeId: string, count: number): string[] {
        const result: string[] = [];
        const visited = new Set<string>();
        const queue: string[] = [nodeId];

        while (queue.length > 0 && result.length < count) {
            const currentId = queue.shift()!;
            if (visited.has(currentId)) {
                continue;
            }
            visited.add(currentId);

            const structural = this.structuralData.get(currentId);
            if (!structural) {
                continue;
            }

            // Add children first (depth-first)
            if (structural.hasChildren) {
                structural.childIds.forEach(childId => {
                    if (result.length < count) {
                        result.push(childId);
                        queue.push(childId);
                    }
                });
            }

            // Add next siblings
            if (structural.parentId) {
                const parent = this.structuralData.get(structural.parentId);
                if (parent) {
                    const currentIndex = parent.childIds.indexOf(currentId);
                    for (let i = currentIndex + 1; i < parent.childIds.length && result.length < count; i++) {
                        result.push(parent.childIds[i]);
                    }
                }
            }
        }

        return result;
    }

    /**
     * Perform memory offloading
     * TODO FIX: This method is called on inactivity but not during active scrolling
     * TODO ENHANCE: Add distance-based offloading (> 1000 items from viewport)
     * TODO FIX: Connect to tree rendering to actually replace nodes with skeletons
     */
    private performOffloading(): void {
        console.debug(`TreeMemoryManager: Starting offload process, cache size: ${this.nodeCache.getStats().size}`);

        // Keep viewport nodes and their immediate neighbors
        const protectedNodes = new Set<string>();
        this.viewportNodes.forEach(id => {
            protectedNodes.add(id);

            // Protect parent
            const structural = this.structuralData.get(id);
            if (structural?.parentId) {
                protectedNodes.add(structural.parentId);
            }

            // Protect immediate children
            structural?.childIds.forEach(childId => protectedNodes.add(childId));
        });

        // 2. Protect all expanded parent nodes and their ancestors
        if (this.memoryProtection.expandedNodes) {
            this.memoryProtection.expandedNodes.forEach(nodeId => {
                protectedNodes.add(nodeId);

                // Also protect all ancestors of expanded nodes
                let currentId: string | null = nodeId;
                while (currentId) {
                    protectedNodes.add(currentId);
                    const structural = this.structuralData.get(currentId);
                    currentId = structural?.parentId || null;
                }
            });
        }

        // 3. Protect selected nodes based on branch selection model
        if (this.memoryProtection.branches && this.memoryProtection.branches.length > 0) {
            // For efficiency with large selections, we protect:
            // - All branch root nodes
            // - Ancestors of branch roots (to maintain tree structure)
            // - Nodes near the viewport that are selected

            for (const branch of this.memoryProtection.branches) {
                // Protect the branch root
                protectedNodes.add(branch.branchSelection);

                // Protect ancestors of branch root
                let currentId: string | null = branch.branchSelection;
                while (currentId) {
                    protectedNodes.add(currentId);
                    const structural = this.structuralData.get(currentId);
                    currentId = structural?.parentId || null;
                }

                // For nodes near viewport, check if they're selected and protect them
                const nearViewport = new Set<string>();
                this.viewportNodes.forEach(id => {
                    // Check nodes within 100 items of viewport
                    const structural = this.structuralData.get(id);
                    if (structural) {
                        // Add siblings
                        if (structural.parentId) {
                            const parent = this.structuralData.get(structural.parentId);
                            parent?.childIds.forEach(siblingId => nearViewport.add(siblingId));
                        }
                        // Add children
                        structural.childIds.forEach(childId => nearViewport.add(childId));
                    }
                });

                // Check which near-viewport nodes are selected
                nearViewport.forEach(nodeId => {
                    if (this.isNodeSelectedByBranches(nodeId)) {
                        protectedNodes.add(nodeId);
                    }
                });
            }
        }

        // Clear non-protected nodes from cache
        let offloadedCount = 0;
        let protectedCount = 0;

        for (const id of this.structuralData.keys()) {
            if (!protectedNodes.has(id) && this.nodeCache.has(id)) {
                // The LRU cache will handle removal based on age
                offloadedCount++;
            } else if (protectedNodes.has(id)) {
                protectedCount++;
            }
        }

        console.debug(
            `TreeMemoryManager: Offloading complete. Protected: ${protectedCount} nodes, ` +
                `Candidates for offload: ${offloadedCount} nodes`
        );
    }

    /**
     * Record user activity
     */
    recordActivity(_type: "mouse" | "keyboard" | "scroll" | "focus" | "expand"): void {
        this.activityTracker.recordActivity(_type);
    }

    /**
     * Get memory statistics
     */
    getStats() {
        return {
            structuralNodes: this.structuralData.size,
            cachedNodes: this.nodeCache.getStats(),
            isActive: this.activityTracker.getIsActive(),
            timeSinceActivity: this.activityTracker.getTimeSinceLastActivity()
        };
    }

    /**
     * Cleanup
     */
    destroy(): void {
        this.activityTracker.destroy();
        this.nodeCache.clear();
        this.structuralData.clear();
    }
}
