import { ListValue } from "mendix";

/**
 * Scroll anchor represents a reference point for maintaining scroll position
 */
export interface ScrollAnchor {
    nodeId: string;
    structureId?: string;
    relativePosition: "top" | "center" | "bottom";
    offsetFromViewport: number; // Pixels from viewport edge
    timestamp: number;
    nodeRect?: DOMRect; // Store original position
}

/**
 * Height information for virtual scrolling
 */
interface HeightInfo {
    estimated: number;
    actual?: number;
    lastUpdated: number;
    childCount?: number;
}

/**
 * Configuration for scroll position manager
 */
interface ScrollPositionManagerConfig {
    defaultNodeHeight: number;
    categoryHeaderHeight: number;
    containerRef: React.RefObject<HTMLElement>;
    debugMode: boolean;
    datasource?: ListValue;
}

/**
 * Manages scroll position preservation during dynamic content loading
 */
export class ScrollPositionManager {
    private anchors: ScrollAnchor[] = [];
    private heightCache = new Map<string, HeightInfo>();
    private totalCountCache = new Map<string, number>();
    private config: ScrollPositionManagerConfig;
    private lastKnownScrollTop = 0;
    private isRestoring = false;

    constructor(config: ScrollPositionManagerConfig) {
        this.config = config;
    }

    /**
     * Capture current scroll state with multi-anchor approach
     */
    captureScrollState(): ScrollAnchor[] {
        const container = this.config.containerRef.current;
        if (!container) {
            return [];
        }

        const scrollTop = container.scrollTop;
        this.lastKnownScrollTop = scrollTop;

        // Find all visible nodes
        const visibleNodes = this.getVisibleNodesInViewport();
        if (visibleNodes.length === 0) {
            return [];
        }

        // Create anchors at strategic positions
        const anchors: ScrollAnchor[] = [];

        // Top anchor - first fully visible node
        const topNode = visibleNodes.find(n => n.rect.top >= container.getBoundingClientRect().top);
        if (topNode) {
            anchors.push(this.createAnchor(topNode.element, topNode.rect, "top"));
        }

        // Center anchor - most stable reference
        const centerIndex = Math.floor(visibleNodes.length / 2);
        const centerNode = visibleNodes[centerIndex];
        if (centerNode) {
            anchors.push(this.createAnchor(centerNode.element, centerNode.rect, "center"));
        }

        // Bottom anchor - last visible node
        const bottomNode = visibleNodes[visibleNodes.length - 1];
        if (bottomNode && bottomNode !== centerNode) {
            anchors.push(this.createAnchor(bottomNode.element, bottomNode.rect, "bottom"));
        }

        this.anchors = anchors;

        if (this.config.debugMode) {
            console.debug(
                `scrollPositionManager.ts [SCROLL][CAPTURE]: Captured ${anchors.length} anchors at scroll position ${scrollTop}`
            );
        }

        return anchors;
    }

    /**
     * Restore scroll position using captured anchors
     */
    async restoreScrollState(options?: { behavior?: ScrollBehavior; delay?: number }): Promise<void> {
        if (this.isRestoring || this.anchors.length === 0) {
            return;
        }

        this.isRestoring = true;
        const container = this.config.containerRef.current;
        if (!container) {
            this.isRestoring = false;
            return;
        }

        // Wait for DOM updates if requested
        if (options?.delay) {
            await new Promise(resolve => setTimeout(resolve, options.delay));
        }

        // Try each anchor in order of reliability (center → top → bottom)
        const orderedAnchors = [...this.anchors].sort((a, b) => {
            const priority = { center: 0, top: 1, bottom: 2 };
            return priority[a.relativePosition] - priority[b.relativePosition];
        });

        for (const anchor of orderedAnchors) {
            const element = document.querySelector(`[data-node-id="${anchor.nodeId}"]`) as HTMLElement;
            if (!element) {
                continue;
            }

            const currentRect = element.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();

            // Calculate where this element should be positioned
            let targetScrollTop: number;

            switch (anchor.relativePosition) {
                case "top":
                    targetScrollTop =
                        container.scrollTop + (currentRect.top - containerRect.top) - anchor.offsetFromViewport;
                    break;
                case "center":
                    const currentCenter = currentRect.top + currentRect.height / 2;
                    const targetCenter = containerRect.top + containerRect.height / 2;
                    targetScrollTop = container.scrollTop + (currentCenter - targetCenter);
                    break;
                case "bottom":
                    targetScrollTop =
                        container.scrollTop + (currentRect.bottom - containerRect.bottom) + anchor.offsetFromViewport;
                    break;
            }

            if (this.config.debugMode) {
                console.debug(
                    `scrollPositionManager.ts [SCROLL][RESTORE]: Restoring to anchor ${anchor.nodeId} at position ${targetScrollTop}`
                );
            }

            // Perform the scroll
            if (options?.behavior === "smooth") {
                container.scrollTo({ top: targetScrollTop, behavior: "smooth" });
            } else {
                container.scrollTop = targetScrollTop;
            }

            this.isRestoring = false;
            return; // Successfully restored
        }

        // Fallback: restore to last known position
        if (this.config.debugMode) {
            console.debug(
                `scrollPositionManager.ts [SCROLL][RESTORE]: No valid anchors, restoring to last position ${this.lastKnownScrollTop}`
            );
        }
        container.scrollTop = this.lastKnownScrollTop;
        this.isRestoring = false;
    }

    /**
     * Navigate to a specific node with intelligent loading
     */
    async navigateToNode(
        nodeId: string,
        options: {
            behavior?: ScrollBehavior;
            block?: ScrollLogicalPosition;
            highlight?: boolean;
            ensureLoaded?: (nodeId: string) => Promise<void>;
            expandPath?: (path: string[]) => Promise<void>;
            getNodePath?: (nodeId: string) => string[];
        } = {}
    ): Promise<void> {
        const container = this.config.containerRef.current;
        if (!container) {
            return;
        }

        // Phase 1: Check if node is already visible
        let element = document.querySelector(`[data-node-id="${nodeId}"]`) as HTMLElement;

        if (!element || element.classList.contains("mx-tree__node--skeleton")) {
            // Phase 2: Estimate position and scroll there first
            const estimatedPosition = this.estimateNodePosition(nodeId);
            if (estimatedPosition !== null) {
                if (this.config.debugMode) {
                    console.debug(
                        `scrollPositionManager.ts [SCROLL][NAVIGATE]: Scrolling to estimated position ${estimatedPosition} for node ${nodeId}`
                    );
                }
                container.scrollTop = estimatedPosition;

                // Wait for potential virtualization update
                await new Promise(resolve => requestAnimationFrame(resolve));
            }

            // Phase 3: Ensure node and its path are loaded
            if (options.ensureLoaded) {
                await options.ensureLoaded(nodeId);
            }

            // Phase 4: Expand path to node
            if (options.expandPath && options.getNodePath) {
                const path = options.getNodePath(nodeId);
                await options.expandPath(path.slice(0, -1)); // Expand all parents
            }

            // Wait for DOM updates
            await new Promise(resolve => requestAnimationFrame(resolve));

            // Try to find element again
            element = document.querySelector(`[data-node-id="${nodeId}"]`) as HTMLElement;
        }

        if (!element) {
            console.warn(`scrollPositionManager.ts [SCROLL][NAVIGATE]: Could not find node ${nodeId} after loading`);
            return;
        }

        // Phase 5: Precise scroll to element
        const elementRect = element.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        let targetScrollTop: number;
        const block = options.block || "center";

        switch (block) {
            case "start":
                targetScrollTop = container.scrollTop + (elementRect.top - containerRect.top) - 20; // 20px padding
                break;
            case "center":
                targetScrollTop =
                    container.scrollTop +
                    (elementRect.top - containerRect.top) -
                    containerRect.height / 2 +
                    elementRect.height / 2;
                break;
            case "end":
                targetScrollTop = container.scrollTop + (elementRect.bottom - containerRect.bottom) + 20;
                break;
            case "nearest":
                // Only scroll if necessary
                if (elementRect.top < containerRect.top) {
                    targetScrollTop = container.scrollTop + (elementRect.top - containerRect.top) - 20;
                } else if (elementRect.bottom > containerRect.bottom) {
                    targetScrollTop = container.scrollTop + (elementRect.bottom - containerRect.bottom) + 20;
                } else {
                    return; // Already visible
                }
                break;
        }

        // Perform scroll
        if (options.behavior === "smooth") {
            container.scrollTo({ top: targetScrollTop, behavior: "smooth" });
        } else {
            container.scrollTop = targetScrollTop;
        }

        // Phase 6: Highlight if requested
        if (options.highlight) {
            this.highlightNode(element);
        }
    }

    /**
     * Handle progressive loading - adjust scroll when nodes load above viewport
     */
    handleProgressiveLoad(loadedNodeIds: string[], previousSkeletonHeights?: Map<string, number>): void {
        const container = this.config.containerRef.current;
        if (!container || this.isRestoring) {
            return;
        }

        const currentScrollTop = container.scrollTop;
        let heightDelta = 0;

        // TODO: Use Mendix datasource API to get accurate positions
        // For now, calculate based on DOM measurements
        loadedNodeIds.forEach(nodeId => {
            const element = document.querySelector(`[data-node-id="${nodeId}"]`) as HTMLElement;
            if (!element) {
                return;
            }

            const rect = element.getBoundingClientRect();
            const actualHeight = rect.height;

            // Get previous height (skeleton or estimate)
            const previousHeight = previousSkeletonHeights?.get(nodeId) || this.config.defaultNodeHeight;

            // Update cache
            this.heightCache.set(nodeId, {
                estimated: previousHeight,
                actual: actualHeight,
                lastUpdated: Date.now()
            });

            // If node is above viewport, accumulate height difference
            if (rect.bottom < container.getBoundingClientRect().top) {
                heightDelta += actualHeight - previousHeight;
            }
        });

        // Adjust scroll position if needed
        if (Math.abs(heightDelta) > 1) {
            if (this.config.debugMode) {
                console.debug(
                    `scrollPositionManager.ts [SCROLL][PROGRESSIVE]: Adjusting scroll by ${heightDelta}px for ${loadedNodeIds.length} loaded nodes`
                );
            }
            container.scrollTop = currentScrollTop + heightDelta;
        }
    }

    /**
     * Update total count cache when datasource changes
     * TODO: Verify this works with Mendix datasource.requestTotalCount()
     */
    async updateTotalCount(levelKey: string, datasource?: ListValue): Promise<number | null> {
        if (!datasource) {
            return null;
        }

        try {
            // Request total count - this populates datasource.totalCount
            await datasource.requestTotalCount(true);

            // Get the total count from the datasource property
            const totalCount = datasource.totalCount || 0;
            this.totalCountCache.set(levelKey, totalCount);

            if (this.config.debugMode) {
                console.debug(`scrollPositionManager.ts [SCROLL][COUNT]: Total count for ${levelKey}: ${totalCount}`);
            }

            return totalCount;
        } catch (error) {
            console.warn(`scrollPositionManager.ts [SCROLL][COUNT]: Failed to get total count`, error);
            return null;
        }
    }

    /**
     * Estimate node position based on structure ID and known information
     */
    private estimateNodePosition(_nodeId: string): number | null {
        // TODO: Implement smart estimation based on:
        // 1. Structure ID parsing (e.g., "1.2.3" = level 3, approximate position)
        // 2. Known sibling positions
        // 3. Parent positions
        // 4. Total count information from datasource

        // For now, return null to indicate unknown
        return null;
    }

    /**
     * Get all nodes currently visible in viewport
     */
    private getVisibleNodesInViewport(): Array<{ element: HTMLElement; rect: DOMRect }> {
        const container = this.config.containerRef.current;
        if (!container) {
            return [];
        }

        const containerRect = container.getBoundingClientRect();
        const nodes = container.querySelectorAll("[data-node-id]");
        const visible: Array<{ element: HTMLElement; rect: DOMRect }> = [];

        nodes.forEach(node => {
            const element = node as HTMLElement;
            const rect = element.getBoundingClientRect();

            // Check if node is at least partially visible
            if (rect.bottom >= containerRect.top && rect.top <= containerRect.bottom) {
                visible.push({ element, rect });
            }
        });

        return visible;
    }

    /**
     * Create an anchor from a node element
     */
    private createAnchor(element: HTMLElement, rect: DOMRect, position: "top" | "center" | "bottom"): ScrollAnchor {
        const container = this.config.containerRef.current!;
        const containerRect = container.getBoundingClientRect();
        const nodeId = element.getAttribute("data-node-id") || "";

        let offset: number;
        switch (position) {
            case "top":
                offset = rect.top - containerRect.top;
                break;
            case "center":
                offset = rect.top + rect.height / 2 - (containerRect.top + containerRect.height / 2);
                break;
            case "bottom":
                offset = containerRect.bottom - rect.bottom;
                break;
        }

        return {
            nodeId,
            structureId: element.getAttribute("data-structure-id") || undefined,
            relativePosition: position,
            offsetFromViewport: offset,
            timestamp: Date.now(),
            nodeRect: rect
        };
    }

    /**
     * Highlight a node temporarily for user feedback
     */
    private highlightNode(element: HTMLElement): void {
        element.classList.add("mx-tree__node--highlighted");
        element.scrollIntoView({ behavior: "smooth", block: "center" });

        // Remove highlight after animation
        setTimeout(() => {
            element.classList.remove("mx-tree__node--highlighted");
        }, 2000);
    }

    /**
     * Clear all cached data
     */
    clear(): void {
        this.anchors = [];
        this.heightCache.clear();
        this.totalCountCache.clear();
        this.lastKnownScrollTop = 0;
    }
}
