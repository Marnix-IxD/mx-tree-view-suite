import { useCallback, useEffect, useState, useRef } from "react";
import { ObjectItem, ListValue } from "mendix";

interface SmartDataLoaderProps {
    datasource: ListValue;
    dataLoadingMode: "all" | "progressive" | "onDemand";
    levelAttribute: any; // ListAttributeValue<number>
    initialLoadLimit: number;
    parentIdAttribute?: any;
    nodeIdAttribute: any;
    entityName?: string;
}

interface LoadChildrenOptions {
    parentId?: string;
    parentLevel?: number;
    level?: number;
}

export function useSmartDataLoader(props: SmartDataLoaderProps) {
    const [loadedItems, setLoadedItems] = useState<Map<string, ObjectItem>>(new Map());
    const [isLoading, setIsLoading] = useState(false);
    const [loadingNodes, setLoadingNodes] = useState<Set<string>>(new Set());
    const entityTypeRef = useRef<string | null>(null);

    // Detect entity type from datasource
    useEffect(() => {
        if (props.datasource.items && props.datasource.items.length > 0) {
            const firstItem = props.datasource.items[0];
            // @ts-ignore - accessing Mendix internals
            const entity = firstItem?.getEntity?.() || firstItem?._entity;
            if (entity) {
                entityTypeRef.current = entity;
                // Entity type detected for XPath queries
            }
        }
    }, [props.datasource.items]);

    // Initialize with datasource items
    useEffect(() => {
        const items = props.datasource.items || [];

        if (props.dataLoadingMode === "progressive" && items.length > props.initialLoadLimit) {
            const LARGE_DATASET_THRESHOLD = 1000; // Configurable threshold
            if (items.length > LARGE_DATASET_THRESHOLD) {
                console.warn(
                    `Large dataset detected (${items.length} items). ` +
                        `Consider using level-based loading for better performance.`
                );
            }
        }

        // Load initial items
        const newLoadedItems = new Map<string, ObjectItem>();
        items.forEach(item => {
            const id = props.nodeIdAttribute.get(item).value;
            if (id) {
                const idStr = typeof id === "string" ? id : id.toString();
                newLoadedItems.set(idStr, item);
            }
        });

        setLoadedItems(newLoadedItems);
    }, [props.datasource.items, props.dataLoadingMode, props.initialLoadLimit, props.nodeIdAttribute]);

    // Load children for a specific node
    const loadChildren = useCallback(
        async (options: LoadChildrenOptions): Promise<ObjectItem[]> => {
            const { parentId = "", parentLevel = 0, level } = options;

            // Check if already loading this node
            if (parentId && loadingNodes.has(parentId)) {
                return [];
            }

            // For "all" mode, children should already be loaded
            if (props.dataLoadingMode === "all") {
                return [];
            }

            if (parentId) {
                setLoadingNodes(prev => new Set([...prev, parentId]));
            }
            setIsLoading(true);

            try {
                const entityType = entityTypeRef.current || props.entityName;
                if (!entityType) {
                    console.error("Cannot determine entity type for XPath query");
                    return [];
                }

                // Build XPath constraint for children
                let xpath = `//${entityType}`;
                const constraints: string[] = [];

                // Add parent constraint
                if (props.parentIdAttribute && parentId) {
                    constraints.push(`[${props.parentIdAttribute.id} = '${parentId}']`);
                }

                // Add level constraint for level-based loading
                if (props.dataLoadingMode === "onDemand") {
                    const childLevel = level !== undefined ? level : parentLevel + 1;
                    constraints.push(`[${props.levelAttribute.id} = ${childLevel}]`);
                }

                xpath += constraints.join("");

                // @ts-ignore - mx is a global Mendix object
                const children = await new Promise<ObjectItem[]>((resolve, reject) => {
                    (window as any).mx.data.retrieveByXPath({
                        xpath,
                        callback: (objects: any) => {
                            // Add loaded children to our map
                            const newItems = new Map(loadedItems);
                            objects.forEach((obj: any) => {
                                const id = props.nodeIdAttribute.get(obj).value;
                                if (id) {
                                    const idStr = typeof id === "string" ? id : id.toString();
                                    newItems.set(idStr, obj);
                                }
                            });
                            setLoadedItems(newItems);
                            resolve(objects);
                        },
                        error: (error: any) => {
                            console.error("Error loading children:", error);
                            reject(error);
                        }
                    });
                });

                return children;
            } catch (error) {
                console.error("Failed to load children:", error);
                return [];
            } finally {
                if (parentId) {
                    setLoadingNodes(prev => {
                        const next = new Set(prev);
                        next.delete(parentId);
                        return next;
                    });
                }
                setIsLoading(false);
            }
        },
        [props, loadedItems, loadingNodes]
    );

    // Search with pagination
    const searchWithPagination = useCallback(
        async (
            query: string,
            searchAttributes: string[],
            page = 0,
            pageSize = 50
        ): Promise<{ items: ObjectItem[]; hasMore: boolean; total: number }> => {
            const entityType = entityTypeRef.current || props.entityName;
            if (!entityType || !query) {
                return { items: [], hasMore: false, total: 0 };
            }

            setIsLoading(true);

            try {
                // Build search constraint
                const searchConditions = searchAttributes.map(
                    attr => `contains(${attr}, '${query.replace(/'/g, "''")}')`
                );

                let xpath = `//${entityType}`;
                if (searchConditions.length > 0) {
                    xpath += `[${searchConditions.join(" or ")}]`;
                }

                // No depth constraints on search - users should be able to search the entire tree
                // Pagination will handle large result sets if needed

                // First, get total count
                // @ts-ignore - mx is a global Mendix object
                // TODO REFACTOR: Create a typed wrapper for Mendix Client API calls
                // TODO ADD: Add request cancellation support for abandoned searches
                const totalCount = await new Promise<number>(resolve => {
                    (window as any).mx.data.retrieveByXPath({
                        xpath,
                        count: true,
                        callback: (count: any) => resolve(count),
                        error: () => resolve(0)
                    });
                });

                // Then get paginated results
                // @ts-ignore - mx is a global Mendix object
                const results = await new Promise<ObjectItem[]>((resolve, reject) => {
                    (window as any).mx.data.retrieveByXPath({
                        xpath,
                        filter: {
                            offset: page * pageSize,
                            limit: pageSize,
                            sort: [[props.nodeIdAttribute.id, "asc"]]
                        },
                        callback: (objects: any) => resolve(objects),
                        error: (error: any) => reject(error)
                    });
                });

                return {
                    items: results,
                    hasMore: (page + 1) * pageSize < totalCount,
                    total: totalCount
                };
            } catch (error) {
                console.error("Search failed:", error);
                // TODO ADD: Implement retry logic for transient failures
                return { items: [], hasMore: false, total: 0 };
            } finally {
                setIsLoading(false);
            }
        },
        [props]
    );

    // Get loading strategy info
    const getLoadingInfo = useCallback(() => {
        const totalItems = props.datasource.items?.length || 0;
        const loadedCount = loadedItems.size;
        const isLargeDataset = totalItems > props.initialLoadLimit;

        return {
            mode: props.dataLoadingMode,
            totalInDatasource: totalItems,
            loadedCount,
            isLargeDataset,
            recommendation:
                isLargeDataset && props.dataLoadingMode !== "onDemand"
                    ? "Consider using level-based loading for this large dataset"
                    : null
        };
    }, [props.datasource.items, props.dataLoadingMode, props.initialLoadLimit, loadedItems.size]);

    // Search nodes wrapper for compatibility
    const searchNodes = useCallback(
        async (query: string, page = 1, limit = 20): Promise<{ items: any[]; total: number }> => {
            const result = await searchWithPagination(query, [], page - 1, limit);
            return {
                items: result.items,
                total: result.total
            };
        },
        [searchWithPagination]
    );

    // Get total count
    const getTotalCount = useCallback(() => {
        return props.datasource.items?.length || 0;
    }, [props.datasource.items]);

    // Clear cache
    const clearCache = useCallback(() => {
        setLoadedItems(new Map());
    }, []);

    return {
        loadedItems,
        isLoading,
        loadingNodes,
        loadChildren,
        searchWithPagination,
        getLoadingInfo,
        entityType: entityTypeRef.current,
        searchNodes,
        getTotalCount,
        clearCache
    };
}
