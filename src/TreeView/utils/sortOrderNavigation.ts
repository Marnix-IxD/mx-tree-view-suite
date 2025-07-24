/**
 * Sort order navigation utilities for efficient navigation in partially loaded trees
 *
 * This module provides strategies for navigating between selected nodes by their
 * sortOrder (absolute position) even when not all nodes are loaded in memory.
 */

import { TreeNode } from "../types/TreeTypes";
import { ListAttributeValue } from "mendix";
import { Big } from "big.js";
import "../types/mendixClientApi";

/**
 * Navigation strategy for trees with partial visibility
 */
export interface ISortOrderNavigationStrategy {
    /**
     * Find the next selected node by sort order
     * @param currentSortOrder Current node's sort order
     * @param selectedSortOrders Array of all selected nodes' sort orders
     * @param direction Navigation direction
     * @returns Sort order of the target node, or undefined if not found
     */
    findNextSelectedSortOrder(
        currentSortOrder: number,
        selectedSortOrders: number[],
        direction: "next" | "previous"
    ): number | undefined | Promise<number | undefined>;

    /**
     * Load node by sort order (may require server call)
     * @param sortOrder The sort order to find
     * @returns Promise resolving to node ID, or undefined if not found
     */
    loadNodeBySortOrder(sortOrder: number): Promise<string | undefined>;
}

/**
 * Memory-efficient sort order navigation for large trees
 *
 * This implementation works with partial node visibility by:
 * 1. Maintaining a sorted list of selected nodes' sortOrders
 * 2. Loading nodes on-demand when navigating to off-screen selections
 * 3. Using server-side sortOrder attributes for efficient lookups
 */
export class PartialVisibilitySortOrderNavigation implements ISortOrderNavigationStrategy {
    constructor(
        private nodeMap: Map<string, TreeNode>,
        private sortOrderAttribute: ListAttributeValue<Big>,
        private loadNodeCallback?: (sortOrder: number) => Promise<TreeNode | undefined>
    ) {}

    /**
     * Get sort orders for all selected nodes (only for visible nodes)
     * For large selections, this should be managed server-side
     */
    getSelectedSortOrders(selectedNodeIds: Set<string>): number[] {
        const sortOrders: number[] = [];

        selectedNodeIds.forEach(nodeId => {
            const node = this.nodeMap.get(nodeId);
            if (node) {
                const sortOrder = this.getNodeSortOrder(node);
                if (sortOrder !== undefined) {
                    sortOrders.push(sortOrder);
                }
            }
        });

        return sortOrders.sort((a, b) => a - b);
    }

    /**
     * Get sort order from node (cached or from attribute)
     */
    private getNodeSortOrder(node: TreeNode): number | undefined {
        // Check cache first
        if (node.sortOrder !== undefined) {
            return node.sortOrder;
        }

        // Check Mendix attribute
        const value = this.sortOrderAttribute.get(node.objectItem).value;
        if (value) {
            const sortOrder = Number(value.toString());
            node.sortOrder = sortOrder; // Cache it
            return sortOrder;
        }

        return undefined;
    }

    findNextSelectedSortOrder(
        currentSortOrder: number,
        selectedSortOrders: number[],
        direction: "next" | "previous"
    ): number | undefined {
        if (selectedSortOrders.length === 0) {
            return undefined;
        }

        if (direction === "next") {
            // Find first sort order greater than current
            for (const sortOrder of selectedSortOrders) {
                if (sortOrder > currentSortOrder) {
                    return sortOrder;
                }
            }
            // Wrap around to first
            return selectedSortOrders[0];
        } else {
            // Find last sort order less than current
            for (let i = selectedSortOrders.length - 1; i >= 0; i--) {
                if (selectedSortOrders[i] < currentSortOrder) {
                    return selectedSortOrders[i];
                }
            }
            // Wrap around to last
            return selectedSortOrders[selectedSortOrders.length - 1];
        }
    }

    async loadNodeBySortOrder(sortOrder: number): Promise<string | undefined> {
        // First check if node is already loaded
        for (const [nodeId, node] of this.nodeMap.entries()) {
            if (this.getNodeSortOrder(node) === sortOrder) {
                return nodeId;
            }
        }

        // If not loaded and we have a callback, try to load it
        if (this.loadNodeCallback) {
            const node = await this.loadNodeCallback(sortOrder);
            if (node) {
                return node.id;
            }
        }

        return undefined;
    }
}

/**
 * Server-assisted navigation strategy for very large trees
 *
 * This approach delegates sort order navigation to the server,
 * which can efficiently query the next/previous selected node
 * without loading all nodes into memory.
 */
export class ServerAssistedSortOrderNavigation implements ISortOrderNavigationStrategy {
    constructor(
        private apiEndpoint: string,
        private selectionId: string // Server-side selection identifier
    ) {}

    async findNextSelectedSortOrder(
        currentSortOrder: number,
        _selectedSortOrders: number[], // Ignored - server knows the selection
        direction: "next" | "previous"
    ): Promise<number | undefined> {
        try {
            const response = await fetch(`${this.apiEndpoint}/navigate-selection`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Csrf-Token": window.mx.session.sessionData?.csrftoken || ""
                },
                body: JSON.stringify({
                    selectionId: this.selectionId,
                    currentSortOrder,
                    direction
                })
            });

            if (response.ok) {
                const data = await response.json();
                return data.nextSortOrder;
            }
        } catch (error) {
            console.error("Failed to navigate selection:", error);
        }

        return undefined;
    }

    async loadNodeBySortOrder(sortOrder: number): Promise<string | undefined> {
        try {
            const response = await fetch(`${this.apiEndpoint}/load-by-sort-order`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Csrf-Token": window.mx.session.sessionData?.csrftoken || ""
                },
                body: JSON.stringify({
                    sortOrder,
                    includeAncestors: true // Load path to root for expansion
                })
            });

            if (response.ok) {
                const data = await response.json();
                return data.nodeId;
            }
        } catch (error) {
            console.error("Failed to load node by sort order:", error);
        }

        return undefined;
    }
}

/**
 * Recommendations for different tree sizes:
 *
 * 1. Small trees (<1,000 nodes):
 *    - Use PartialVisibilitySortOrderNavigation with client-side calculation
 *    - All nodes can be loaded, so navigation is straightforward
 *
 * 2. Medium trees (1,000-10,000 nodes):
 *    - Use PartialVisibilitySortOrderNavigation with server-side sortOrder attributes
 *    - Implement loadNodeCallback to fetch off-screen nodes on demand
 *
 * 3. Large trees (>10,000 nodes):
 *    - Use ServerAssistedSortOrderNavigation
 *    - Let server handle navigation logic and node loading
 *    - Minimizes client memory usage
 *
 * 4. Selection size considerations:
 *    - <100 selected: Client-side navigation is fine
 *    - 100-1,000 selected: Consider hybrid approach
 *    - >1,000 selected: Server-side navigation recommended
 */
