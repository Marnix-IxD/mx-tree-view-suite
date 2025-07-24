/**
 * MxData Query Builder for TreeView
 *
 * Purpose: Execute complex queries using window.mx.data.get API that are
 * beyond the capabilities of the standard ListValue filtering API.
 *
 * When to use:
 * - Finding ancestors of nodes (requires recursive queries)
 * - Complex search with parent context
 * - Association-based queries
 * - Any query that needs XPath or mx.data capabilities
 *
 * Returns: Object IDs that can be converted to ListValue filters using filterBridge
 */

// This resolver uses mx.data.get API which has its own filter format,
// not the FilterCondition types from mendix/filters

// @ts-ignore - mendix namespace is declared in mendixClientApi.d.ts
type MxObject = mendix.lib.MxObject;

export interface IContextResolverConfig {
    entity: string;
    structureIdAttribute?: string;
    parentIdAttribute?: string;
    nodeIdAttribute?: string;
    searchAttributes?: string[];
}

export interface IAncestorContext {
    nodeId: string;
    ancestorIds: string[];
    ancestorStructureIds: string[];
}

/**
 * Resolves complex tree context using mx.data API
 * Results are used to build filters for ListValue
 */
export class MxDataQueryBuilder {
    private config: IContextResolverConfig;
    private activeQueries: Set<Promise<any>> = new Set();

    constructor(config: IContextResolverConfig) {
        this.config = config;
    }

    /**
     * Find all ancestors of nodes matching a search term
     * Returns the data needed to construct a ListValue filter
     */
    async resolveSearchContext(
        searchTerm: string,
        searchAttributes: string[]
    ): Promise<{ matchingIds: string[]; ancestorIds: string[] }> {
        try {
            // Step 1: Find matching nodes
            const matchingNodes = await this.searchNodes(searchTerm, searchAttributes);

            if (matchingNodes.length === 0) {
                return {
                    matchingIds: [],
                    ancestorIds: []
                };
            }

            // Step 2: Extract structure IDs for ancestor lookup
            const structureIds = this.extractStructureIds(matchingNodes);

            // Step 3: Find ancestors
            const ancestors = await this.findAncestorsByStructureId(structureIds);

            // Clean up MxObjects to prevent memory leaks
            this.releaseObjects([...matchingNodes, ...ancestors]);

            return {
                matchingIds: matchingNodes.map(obj => obj.getGuid()),
                ancestorIds: ancestors.map(obj => obj.getGuid())
            };
        } catch (error) {
            console.error("Failed to resolve search context:", error);
            throw error;
        }
    }

    /**
     * Find ancestors of a specific node
     */
    async resolveNodeAncestors(nodeId: string): Promise<{
        ancestorIds: string[];
        ancestorStructureIds: string[];
    }> {
        try {
            // Get the node first
            const node = await this.getNodeById(nodeId);
            if (!node) {
                return {
                    ancestorIds: [],
                    ancestorStructureIds: []
                };
            }

            // Get structure ID
            const structureId = this.config.structureIdAttribute
                ? (node.get(this.config.structureIdAttribute) as string)
                : null;

            if (!structureId) {
                this.releaseObjects([node]);
                return {
                    ancestorIds: [],
                    ancestorStructureIds: []
                };
            }

            // Find ancestors
            const ancestors = await this.findAncestorsByStructureId([structureId]);
            const ancestorIds = ancestors.map(obj => obj.getGuid());
            const ancestorStructureIds = ancestors
                .map(obj => obj.get(this.config.structureIdAttribute!) as string)
                .filter(Boolean);

            // Cleanup
            this.releaseObjects([node, ...ancestors]);

            return {
                ancestorIds,
                ancestorStructureIds
            };
        } catch (error) {
            console.error("Failed to resolve node ancestors:", error);
            throw error;
        }
    }

    /**
     * Resolve children context for multiple parent nodes
     */
    async resolveChildrenContext(parentIds: string[]): Promise<{
        childrenByParent: Map<string, string[]>;
    }> {
        try {
            const childrenByParent = new Map<string, string[]>();
            const allChildIds: string[] = [];

            // Batch load children
            const children = await this.findChildrenByParentIds(parentIds);

            // Group by parent
            children.forEach(child => {
                const parentId = this.config.parentIdAttribute
                    ? (child.get(this.config.parentIdAttribute) as string)
                    : null;

                if (parentId) {
                    if (!childrenByParent.has(parentId)) {
                        childrenByParent.set(parentId, []);
                    }
                    const childId = child.getGuid();
                    childrenByParent.get(parentId)!.push(childId);
                    allChildIds.push(childId);
                }
            });

            // Cleanup
            this.releaseObjects(children);

            return {
                childrenByParent
            };
        } catch (error) {
            console.error("Failed to resolve children context:", error);
            throw error;
        }
    }

    /**
     * Resolve children via association
     * Finds all objects that have an association pointing to the given parent
     */
    async resolveChildrenByAssociation(
        parentId: string,
        associationName: string
    ): Promise<{
        childIds: string[];
    }> {
        try {
            // Build XPath for association-based query
            const xpath = `//${this.config.entity}[${associationName} = '${parentId}']`;

            const children = await this.executeQuery({
                xpath,
                filter: {
                    attributes: [
                        this.config.nodeIdAttribute || "id",
                        this.config.structureIdAttribute,
                        this.config.parentIdAttribute
                    ].filter(Boolean) as string[]
                }
            });

            const childIds = children.map(obj => obj.getGuid());

            // Cleanup
            this.releaseObjects(children);

            return {
                childIds
            };
        } catch (error) {
            console.error("Failed to resolve children by association:", error);
            throw error;
        }
    }

    /**
     * Search for nodes matching a search term
     */
    private searchNodes(searchTerm: string, attributes: string[]): Promise<MxObject[]> {
        return this.executeQuery({
            xpath: this.buildSearchXPath(searchTerm, attributes),
            filter: {
                attributes: [
                    this.config.nodeIdAttribute || "id",
                    this.config.structureIdAttribute,
                    this.config.parentIdAttribute,
                    ...attributes
                ].filter(Boolean) as string[]
            }
        });
    }

    /**
     * Find ancestors based on structure IDs
     */
    private async findAncestorsByStructureId(structureIds: string[]): Promise<MxObject[]> {
        if (!this.config.structureIdAttribute || structureIds.length === 0) {
            return [];
        }

        // Build XPath for ancestors
        const ancestorPatterns = this.extractAncestorPatterns(structureIds);
        if (ancestorPatterns.length === 0) {
            return [];
        }

        const conditions = ancestorPatterns
            .map(pattern => `${this.config.structureIdAttribute} = '${pattern}'`)
            .join(" or ");

        return this.executeQuery({
            xpath: `//${this.config.entity}[${conditions}]`,
            filter: {
                attributes: [this.config.nodeIdAttribute || "id", this.config.structureIdAttribute].filter(
                    Boolean
                ) as string[]
            }
        });
    }

    /**
     * Find children by parent IDs
     */
    private async findChildrenByParentIds(parentIds: string[]): Promise<MxObject[]> {
        if (!this.config.parentIdAttribute || parentIds.length === 0) {
            return [];
        }

        // Batch query for efficiency
        const batchSize = 50;
        const results: MxObject[] = [];

        for (let i = 0; i < parentIds.length; i += batchSize) {
            const batch = parentIds.slice(i, i + batchSize);
            const conditions = batch.map(id => `${this.config.parentIdAttribute} = '${id}'`).join(" or ");

            const children = await this.executeQuery({
                xpath: `//${this.config.entity}[${conditions}]`,
                filter: {
                    attributes: [this.config.nodeIdAttribute || "id", this.config.parentIdAttribute].filter(
                        Boolean
                    ) as string[]
                }
            });

            results.push(...children);
        }

        return results;
    }

    /**
     * Get a single node by ID
     */
    private getNodeById(nodeId: string): Promise<MxObject | null> {
        return this.executeQuery({
            xpath: `//${this.config.entity}[id = '${nodeId}']`,
            filter: {
                amount: 1
            }
        }).then(results => results[0] || null);
    }

    /**
     * Execute mx.data.get query with promise wrapper
     *
     * @param args - All parameters expected by window.mx.data.get except 'callback' and 'error'
     *               which are internally handled by the Promise wrapper
     *
     * The Omit<Parameters<typeof window.mx.data.get>[0], 'callback' | 'error'> type means:
     * - Parameters<typeof window.mx.data.get>[0] gets the first parameter type of mx.data.get
     * - Omit<..., 'callback' | 'error'> removes the callback and error properties from that type
     * - This allows callers to pass all mx.data.get options except callback/error which we handle internally
     */
    private executeQuery(
        args: Omit<Parameters<typeof window.mx.data.get>[0], "callback" | "error">
    ): Promise<MxObject[]> {
        const promise = new Promise<MxObject[]>((resolve, reject) => {
            window.mx.data.get({
                ...args,
                callback: objs => {
                    this.activeQueries.delete(promise);
                    resolve(objs);
                },
                error: error => {
                    this.activeQueries.delete(promise);
                    reject(error);
                }
            });
        });

        this.activeQueries.add(promise);
        return promise;
    }

    /**
     * Build search XPath
     */
    private buildSearchXPath(searchTerm: string, attributes: string[]): string {
        const escapedTerm = searchTerm.replace(/'/g, "''");
        const conditions = attributes.map(attr => `contains(${attr}, '${escapedTerm}')`).join(" or ");

        return `//${this.config.entity}[${conditions}]`;
    }

    /**
     * Extract structure IDs from MxObjects
     */
    private extractStructureIds(objects: MxObject[]): string[] {
        if (!this.config.structureIdAttribute) {
            return [];
        }

        return objects.map(obj => obj.get(this.config.structureIdAttribute!) as string).filter(Boolean);
    }

    /**
     * Extract ancestor patterns from structure IDs
     * e.g., "1.2.3" -> ["1.", "1.2."]
     */
    private extractAncestorPatterns(structureIds: string[]): string[] {
        const patterns = new Set<string>();

        structureIds.forEach(id => {
            const parts = id.split(".");
            // Skip the last part (the node itself)
            for (let i = 1; i < parts.length - 1; i++) {
                patterns.add(parts.slice(0, i).join(".") + ".");
            }
        });

        return Array.from(patterns);
    }

    /**
     * Release MxObjects to prevent memory leaks
     */
    private releaseObjects(objects: MxObject[]): void {
        if (objects.length > 0) {
            window.mx.data.release(objects);
        }
    }

    /**
     * Clean up any pending queries
     */
    async cleanup(): Promise<void> {
        // Wait for active queries to complete
        await Promise.allSettled(Array.from(this.activeQueries));
        this.activeQueries.clear();
    }
}

/**
 * Factory function to create context resolver
 */
export function createMxDataQueryBuilder(
    entity: string,
    attributes: {
        nodeId?: string;
        structureId?: string;
        parentId?: string;
        searchAttributes?: string[];
    }
): MxDataQueryBuilder {
    return new MxDataQueryBuilder({
        entity,
        nodeIdAttribute: attributes.nodeId,
        structureIdAttribute: attributes.structureId,
        parentIdAttribute: attributes.parentId,
        searchAttributes: attributes.searchAttributes
    });
}
