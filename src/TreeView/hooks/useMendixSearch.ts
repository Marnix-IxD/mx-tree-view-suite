import { useCallback, useState } from "react";
import { ObjectItem } from "mendix";

interface MendixSearchProps {
    entityName: string;
    searchAttributes: string[];
    searchDebounce: number;
}

interface SearchOptions {
    limit?: number;
    offset?: number;
    sort?: Array<[string, "asc" | "desc"]>;
}

export function useMendixSearch(props: MendixSearchProps) {
    const [isSearching, setIsSearching] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);

    // Build XPath constraint for search query
    const buildSearchConstraint = useCallback((searchQuery: string, attributes: string[]): string => {
        if (!searchQuery || attributes.length === 0) {
            return "";
        }

        // Escape special characters in search query
        const escapedQuery = searchQuery.replace(/'/g, "''");

        // Build OR conditions for each searchable attribute
        const conditions = attributes.map(attr => {
            // Use contains() for string attributes
            // TODO ADD: Support different search operators (starts-with, ends-with, exact match)
            // TODO ADD: Handle numeric and date attributes with appropriate operators
            return `contains(${attr}, '${escapedQuery}')`;
        });

        // Combine with OR
        return conditions.length > 1 ? `[${conditions.join(" or ")}]` : `[${conditions[0]}]`;
    }, []);

    // Perform search using Mendix Client API
    const searchByXPath = useCallback(
        async (searchQuery: string, options: SearchOptions = {}): Promise<ObjectItem[]> => {
            if (!searchQuery.trim()) {
                return [];
            }

            setIsSearching(true);
            setSearchError(null);

            try {
                const constraint = buildSearchConstraint(searchQuery, props.searchAttributes);
                const xpath = `//${props.entityName}${constraint}`;

                // @ts-ignore - mx is a global Mendix object
                // TODO REFACTOR: Create a typed wrapper for Mendix Client API calls
                const result = await new Promise<ObjectItem[]>((resolve, reject) => {
                    (window as any).mx.data.retrieveByXPath({
                        xpath,
                        filter: {
                            limit: options.limit || 100,
                            offset: options.offset || 0,
                            sort: options.sort?.map(([attr, order]) => [attr, order])
                        },
                        callback: (objects: any) => resolve(objects),
                        error: (error: any) => reject(error)
                    });
                });

                return result;
            } catch (error: any) {
                console.error("Search error:", error);
                setSearchError(error.message || "Search failed");
                return [];
            } finally {
                setIsSearching(false);
            }
        },
        [props.entityName, props.searchAttributes, buildSearchConstraint]
    );

    // Advanced search with filters
    const searchWithFilters = useCallback(
        async (
            searchQuery: string,
            additionalConstraints?: string[],
            options: SearchOptions = {}
        ): Promise<ObjectItem[]> => {
            if (!searchQuery.trim() && (!additionalConstraints || additionalConstraints.length === 0)) {
                return [];
            }

            setIsSearching(true);
            setSearchError(null);

            try {
                const searchConstraint = searchQuery ? buildSearchConstraint(searchQuery, props.searchAttributes) : "";
                const allConstraints = [searchConstraint, ...(additionalConstraints || [])].filter(Boolean);

                const xpath = `//${props.entityName}${allConstraints.join("")}`;

                // @ts-ignore - mx is a global Mendix object
                const result = await new Promise<ObjectItem[]>((resolve, reject) => {
                    (window as any).mx.data.retrieveByXPath({
                        xpath,
                        filter: {
                            limit: options.limit || 100,
                            offset: options.offset || 0,
                            sort: options.sort?.map(([attr, order]) => [attr, order])
                        },
                        callback: (objects: any) => resolve(objects),
                        error: (error: any) => reject(error)
                    });
                });

                return result;
            } catch (error: any) {
                console.error("Search error:", error);
                setSearchError(error.message || "Search failed");
                return [];
            } finally {
                setIsSearching(false);
            }
        },
        [props.entityName, props.searchAttributes, buildSearchConstraint]
    );

    // Search with association filter
    const searchByAssociation = useCallback(
        async (
            searchQuery: string,
            associationPath: string,
            associatedObjectId: string,
            options: SearchOptions = {}
        ): Promise<ObjectItem[]> => {
            const associationConstraint = `[${associationPath} = '${associatedObjectId}']`;
            return searchWithFilters(searchQuery, [associationConstraint], options);
        },
        [searchWithFilters]
    );

    // Search within date range
    const searchByDateRange = useCallback(
        async (
            searchQuery: string,
            dateAttribute: string,
            startDate: Date,
            endDate: Date,
            options: SearchOptions = {}
        ): Promise<ObjectItem[]> => {
            const startTimestamp = startDate.getTime();
            const endTimestamp = endDate.getTime();
            const dateConstraint = `[${dateAttribute} >= ${startTimestamp} and ${dateAttribute} <= ${endTimestamp}]`;

            return searchWithFilters(searchQuery, [dateConstraint], options);
        },
        [searchWithFilters]
    );

    // Search with custom XPath
    const searchByCustomXPath = useCallback(
        async (xpath: string, options: SearchOptions = {}): Promise<ObjectItem[]> => {
            setIsSearching(true);
            setSearchError(null);

            try {
                // @ts-ignore - mx is a global Mendix object
                const result = await new Promise<ObjectItem[]>((resolve, reject) => {
                    (window as any).mx.data.retrieveByXPath({
                        xpath,
                        filter: {
                            limit: options.limit || 100,
                            offset: options.offset || 0,
                            sort: options.sort?.map(([attr, order]) => [attr, order])
                        },
                        callback: (objects: any) => resolve(objects),
                        error: (error: any) => reject(error)
                    });
                });

                return result;
            } catch (error: any) {
                console.error("Search error:", error);
                setSearchError(error.message || "Search failed");
                return [];
            } finally {
                setIsSearching(false);
            }
        },
        []
    );

    return {
        searchByXPath,
        searchWithFilters,
        searchByAssociation,
        searchByDateRange,
        searchByCustomXPath,
        isSearching,
        searchError
    };
}
