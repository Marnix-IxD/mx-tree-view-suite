/**
 * External navigation utilities for TreeView
 * Enables programmatic navigation to deep nodes from outside the widget
 */

import { TreeNode } from "../types/TreeTypes";

export interface INavigationOptions {
    /**
     * Whether to select the node after navigation
     */
    selectNode?: boolean;

    /**
     * Whether to expand all ancestors to make the node visible
     */
    expandAncestors?: boolean;

    /**
     * Whether to scroll the node into view
     */
    scrollIntoView?: boolean;

    /**
     * Animation duration for scroll (ms)
     */
    scrollDuration?: number;

    /**
     * Whether to highlight the node temporarily
     */
    highlightNode?: boolean;

    /**
     * Duration to highlight the node (ms)
     */
    highlightDuration?: number;

    /**
     * Height of each tree item (used for virtual scrolling calculations)
     */
    itemHeight?: number;

    /**
     * Scroll behavior type
     */
    scrollBehavior?: ScrollBehavior;

    /**
     * Callback when node is not found
     */
    onNodeNotFound?: () => void;
}

export interface INavigationResult {
    success: boolean;
    nodeFound: boolean;
    ancestorsExpanded: string[];
    error?: string;
}

/**
 * Navigate to a node by ID, expanding ancestors as needed
 */
export async function navigateToNodeById(
    nodeId: string,
    nodeMap: Map<string, TreeNode>,
    expandedNodes: Set<string>,
    options: INavigationOptions,
    callbacks: {
        toggleExpanded: (nodeId: string) => void;
        selectNode?: (nodeId: string) => void;
        setFocusedNodeId?: (nodeId: string) => void;
        scrollToNode?: (nodeId: string) => void;
        loadChildren?: (nodeId: string) => Promise<void>;
    }
): Promise<INavigationResult> {
    const result: INavigationResult = {
        success: false,
        nodeFound: false,
        ancestorsExpanded: []
    };

    try {
        // Find the target node
        const targetNode = nodeMap.get(nodeId);
        if (!targetNode) {
            result.error = `Node with ID '${nodeId}' not found`;
            // Call the onNodeNotFound callback if provided
            if (options.onNodeNotFound) {
                options.onNodeNotFound();
            }
            return result;
        }

        result.nodeFound = true;

        // Expand ancestors if requested
        if (options.expandAncestors !== false) {
            const ancestors = getAncestorIds(targetNode, nodeMap);

            for (const ancestorId of ancestors) {
                if (!expandedNodes.has(ancestorId)) {
                    // Check if ancestor needs children loaded
                    const ancestor = nodeMap.get(ancestorId);
                    if (ancestor && ancestor.hasChildren && ancestor.children.length === 0 && callbacks.loadChildren) {
                        await callbacks.loadChildren(ancestorId);
                    }

                    callbacks.toggleExpanded(ancestorId);
                    result.ancestorsExpanded.push(ancestorId);
                }
            }
        }

        // Select the node if requested
        if (options.selectNode && callbacks.selectNode) {
            callbacks.selectNode(nodeId);
        }

        // Set focus to the node
        if (callbacks.setFocusedNodeId) {
            callbacks.setFocusedNodeId(nodeId);
        }

        // Scroll to the node if requested
        if (options.scrollIntoView !== false && callbacks.scrollToNode) {
            // Capture the callback reference for type safety
            const scrollFn = callbacks.scrollToNode;
            // Small delay to ensure DOM updates after expansion
            window.setTimeout(() => {
                scrollFn(nodeId);
            }, 100);
        }

        result.success = true;
        return result;
    } catch (error) {
        result.error = error instanceof Error ? error.message : String(error);
        return result;
    }
}

/**
 * Navigate to a node by structure ID
 */
export async function navigateToNodeByStructureId(
    structureId: string,
    nodeMap: Map<string, TreeNode>,
    expandedNodes: Set<string>,
    options: INavigationOptions,
    callbacks: {
        toggleExpanded: (nodeId: string) => void;
        selectNode?: (nodeId: string) => void;
        setFocusedNodeId?: (nodeId: string) => void;
        scrollToNode?: (nodeId: string) => void;
        loadChildren?: (nodeId: string) => Promise<void>;
    }
): Promise<INavigationResult> {
    // Find node by structure ID
    let targetNodeId: string | null = null;

    for (const [nodeId, node] of nodeMap.entries()) {
        if (node.structureId === structureId) {
            targetNodeId = nodeId;
            break;
        }
    }

    if (!targetNodeId) {
        return {
            success: false,
            nodeFound: false,
            ancestorsExpanded: [],
            error: `Node with structure ID '${structureId}' not found`
        };
    }

    return navigateToNodeById(targetNodeId, nodeMap, expandedNodes, options, callbacks);
}

/**
 * Navigate to multiple nodes (useful for restoring complex selections)
 */
export async function navigateToMultipleNodes(
    nodeIds: string[],
    nodeMap: Map<string, TreeNode>,
    expandedNodes: Set<string>,
    options: INavigationOptions,
    callbacks: {
        toggleExpanded: (nodeId: string) => void;
        selectNode?: (nodeId: string) => void;
        setFocusedNodeId?: (nodeId: string) => void;
        scrollToNode?: (nodeId: string) => void;
        loadChildren?: (nodeId: string) => Promise<void>;
    }
): Promise<INavigationResult[]> {
    const results: INavigationResult[] = [];

    // Process nodes sequentially to avoid race conditions
    for (const nodeId of nodeIds) {
        const result = await navigateToNodeById(
            nodeId,
            nodeMap,
            expandedNodes,
            {
                ...options,
                // Only scroll to the first node
                scrollIntoView: results.length === 0 ? options.scrollIntoView : false
            },
            callbacks
        );
        results.push(result);
    }

    return results;
}

/**
 * Get all ancestor IDs for a node
 */
function getAncestorIds(node: TreeNode, nodeMap: Map<string, TreeNode>): string[] {
    const ancestors: string[] = [];
    let current = node;

    while (current.parentId) {
        ancestors.unshift(current.parentId); // Add to beginning to maintain order
        const parent = nodeMap.get(current.parentId);
        if (!parent) {
            break;
        }
        current = parent;
    }

    return ancestors;
}

/**
 * Scroll a node into view with smooth animation
 */
export function scrollNodeIntoView(
    nodeId: string,
    containerElement: HTMLElement | null,
    options?: {
        behavior?: ScrollBehavior;
        block?: ScrollLogicalPosition;
        inline?: ScrollLogicalPosition;
        itemHeight?: number; // For virtual scrolling calculations
    }
): void {
    if (!containerElement) {
        return;
    }

    const nodeElement = containerElement.querySelector(`[data-node-id="${nodeId}"]`);
    if (nodeElement) {
        nodeElement.scrollIntoView({
            behavior: options?.behavior || "smooth",
            block: options?.block || "nearest",
            inline: options?.inline || "nearest"
        });
    }
}

/**
 * Highlight a node temporarily (visual feedback)
 */
export function highlightNodeTemporarily(nodeId: string, containerElement: HTMLElement | null, duration = 2000): void {
    if (!containerElement) {
        return;
    }

    const nodeElement = containerElement.querySelector(`[data-node-id="${nodeId}"]`);
    if (nodeElement) {
        nodeElement.classList.add("tree-node-highlighted");

        window.setTimeout(() => {
            nodeElement.classList.remove("tree-node-highlighted");
        }, duration);
    }
}

/**
 * Deep link to a node using URL parameters
 * Example: ?treeNode=123&expand=true&select=true
 */
export function getDeepLinkParameters(): {
    nodeId?: string;
    structureId?: string;
    expand?: boolean;
    select?: boolean;
    highlight?: boolean;
} {
    const params = new URLSearchParams(window.location.search);

    return {
        nodeId: params.get("treeNode") || undefined,
        structureId: params.get("treeStructure") || undefined,
        expand: params.get("expand") === "true",
        select: params.get("select") === "true",
        highlight: params.get("highlight") === "true"
    };
}

/**
 * Create a deep link URL for a specific node
 */
export function createDeepLinkUrl(
    nodeId: string,
    options?: {
        structureId?: string;
        expand?: boolean;
        select?: boolean;
        highlight?: boolean;
    }
): string {
    const url = new URL(window.location.href);

    url.searchParams.set("treeNode", nodeId);

    if (options?.structureId) {
        url.searchParams.set("treeStructure", options.structureId);
    }
    if (options?.expand !== undefined) {
        url.searchParams.set("expand", String(options.expand));
    }
    if (options?.select !== undefined) {
        url.searchParams.set("select", String(options.select));
    }
    if (options?.highlight !== undefined) {
        url.searchParams.set("highlight", String(options.highlight));
    }

    return url.toString();
}
