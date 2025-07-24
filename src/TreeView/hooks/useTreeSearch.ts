import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { TreeSearchHookProps, SearchResult, SearchMatch, TreeNode } from "../types/TreeTypes";
import { ISearchFilter, SearchOperator, ISearchRequest } from "../types/SearchTypes";
// Removed unused debounce import - using SearchDelayManager instead
import { WorkerManager } from "../utils/workerManager";
import { SearchRequestManager } from "../utils/searchRequestManager";
import { MendixSessionSearch } from "../utils/mendixSessionSearch";
import { useOfflineStatus, isOffline as checkIsOffline } from "../utils/offlineUtils";
import { getSearchCache } from "../utils/searchCache";
import { SearchDelayManager, createManagedSearchFunction } from "../utils/searchDelayManager";
import { findMultipleNodeAncestors } from "../utils/treeNodeHelpers";
import { Big } from "big.js";

export interface UseTreeSearchReturn {
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    searchResults: Set<string>;
    highlightedNodes: Set<string>;
    isSearching: boolean;
    clearSearch: () => void;
    searchResultsList: SearchResult[];
    totalResultCount: number;
    currentPage: number;
    setCurrentPage: (page: number) => void;
    resultsPerPage: number;
    // New fields for progressive search
    isOffline: boolean;
    isLoadingServer: boolean;
    serverTimeout: boolean;
    cachedResultCount: number;
    // New search requirement fields
    searchRequirementMessage: string | null;
    canSearch: boolean;
    searchDelay: number;
    // Filter-based search
    performFilterSearch: (filters: ISearchFilter[], logic?: "AND" | "OR") => void;
    // Error state
    searchError: string | null;
    isErrorState: boolean;
}

export function useTreeSearch(
    props: TreeSearchHookProps & {
        nodeIdAttribute: any;
        searchFilters?: ISearchFilter[]; // New filter-based approach
        searchNodes?: (query: string, page?: number, limit?: number) => Promise<{ items: any[]; total: number }>;
        sendSearch?: (request: ISearchRequest) => Promise<any>; // For server-side filter search
        datasource?: any; // For entity type detection
        searchMinCharacters?: number;
        searchScalingDelay?: boolean;
        enabled?: boolean; // Add enabled flag
    }
): UseTreeSearchReturn {
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<Set<string>>(new Set());
    const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(new Set());
    const [isSearching, setIsSearching] = useState(false);
    const [searchResultsList, setSearchResultsList] = useState<SearchResult[]>([]);
    const [totalResultCount, setTotalResultCount] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const resultsPerPage = 20; // Default results per page

    // Error state management
    const [searchError, setSearchError] = useState<string | null>(null);
    const [isErrorState, setIsErrorState] = useState(false);

    /**
     * Evaluate a single filter against a node's attribute value
     */
    const evaluateFilter = useCallback((filter: ISearchFilter, node: TreeNode): boolean => {
        try {
            const value = filter.attribute.get(node.objectItem).value;

            // Handle null/undefined values
            if (value === null || value === undefined) {
                return filter.operator === "notEquals";
            }

            // Type-specific evaluation
            switch (filter.attributeType) {
                case "String": {
                    const stringValue = value.toString().toLowerCase();
                    const searchValue = (filter.value?.toString() || "").toLowerCase();

                    switch (filter.operator) {
                        case "contains":
                            return stringValue.includes(searchValue);
                        case "startsWith":
                            return stringValue.startsWith(searchValue);
                        case "endsWith":
                            return stringValue.endsWith(searchValue);
                        case "equals":
                            return stringValue === searchValue;
                        case "notEquals":
                            return stringValue !== searchValue;
                        default:
                            return false;
                    }
                }

                case "Integer":
                case "Long":
                case "Decimal": {
                    const numValue = value instanceof Big ? value : new Big(value.toString());
                    const compareValue = filter.value ? new Big(filter.value.toString()) : new Big(0);

                    switch (filter.operator) {
                        case "equals":
                            return numValue.eq(compareValue);
                        case "notEquals":
                            return !numValue.eq(compareValue);
                        case "greater":
                            return numValue.gt(compareValue);
                        case "greaterOrEqual":
                            return numValue.gte(compareValue);
                        case "less":
                            return numValue.lt(compareValue);
                        case "lessOrEqual":
                            return numValue.lte(compareValue);
                        case "between":
                            if (filter.value2) {
                                const compareValue2 = new Big(filter.value2);
                                return numValue.gte(compareValue) && numValue.lte(compareValue2);
                            }
                            return false;
                        default:
                            return false;
                    }
                }

                case "Boolean": {
                    const boolValue = Boolean(value);
                    const compareValue = Boolean(filter.value);
                    return filter.operator === "equals" ? boolValue === compareValue : boolValue !== compareValue;
                }

                case "DateTime": {
                    const dateValue = value instanceof Date ? value : new Date(value.toString());
                    const compareValue =
                        filter.value instanceof Date ? filter.value : new Date(filter.value.toString());

                    switch (filter.operator) {
                        case "equals":
                            return dateValue.getTime() === compareValue.getTime();
                        case "notEquals":
                            return dateValue.getTime() !== compareValue.getTime();
                        case "greater":
                            return dateValue > compareValue;
                        case "greaterOrEqual":
                            return dateValue >= compareValue;
                        case "less":
                            return dateValue < compareValue;
                        case "lessOrEqual":
                            return dateValue <= compareValue;
                        case "between":
                            if (filter.value2) {
                                const compareValue2 =
                                    filter.value2 instanceof Date ? filter.value2 : new Date(filter.value2);
                                return dateValue >= compareValue && dateValue <= compareValue2;
                            }
                            return false;
                        default:
                            return false;
                    }
                }

                case "Enum": {
                    const enumValue = value.toString();
                    const compareValue = filter.value?.toString() || "";

                    switch (filter.operator) {
                        case "equals":
                            return enumValue === compareValue;
                        case "notEquals":
                            return enumValue !== compareValue;
                        default:
                            return false;
                    }
                }

                default:
                    return false;
            }
        } catch (error) {
            console.warn("Error evaluating filter:", error);
            return false;
        }
    }, []);

    /**
     * Evaluate all filters against a node
     */
    const evaluateFilters = useCallback(
        (node: TreeNode, filters: ISearchFilter[], logic: "AND" | "OR" = "AND"): boolean => {
            if (!filters || filters.length === 0) {
                return true;
            }

            if (logic === "AND") {
                return filters.every(filter => evaluateFilter(filter, node));
            } else {
                return filters.some(filter => evaluateFilter(filter, node));
            }
        },
        [evaluateFilter]
    );

    // Progressive search state
    const [cachedResults, setCachedResults] = useState<SearchResult[]>([]);
    // Removed unused serverResults state
    const [isLoadingServer, setIsLoadingServer] = useState(false);
    const [serverTimeout, setServerTimeout] = useState(false);
    const [cachedResultCount, setCachedResultCount] = useState(0);

    // Offline detection
    const isOffline = useOfflineStatus();

    // Utility instances
    const workerManagerRef = useRef<WorkerManager | null>(null);
    const requestManagerRef = useRef<SearchRequestManager | null>(null);
    const mendixSearchRef = useRef<MendixSessionSearch | null>(null);
    const searchCacheRef = useRef(getSearchCache());
    // Removed offlineDetectorRef - no longer needed
    const searchDelayManagerRef = useRef<SearchDelayManager | null>(null);
    const performSearchRef = useRef<((query: string, page?: number) => Promise<void>) | null>(null);

    // Initialize utilities
    useEffect(() => {
        workerManagerRef.current = WorkerManager.getInstance();
        requestManagerRef.current = new SearchRequestManager(props.debugMode || false);
        mendixSearchRef.current = new MendixSessionSearch();
        searchDelayManagerRef.current = new SearchDelayManager({
            minCharacters: props.searchMinCharacters || 6,
            enableScalingDelay: props.searchScalingDelay ?? true,
            baseDebounce: props.searchDebounce || 300
        });

        return () => {
            // Cleanup request manager
            requestManagerRef.current?.cancelAll();
        };
    }, [props.searchMinCharacters, props.searchScalingDelay, props.searchDebounce]);

    // Helper to update UI with results
    const updateUIWithResults = useCallback(
        (results: SearchResult[]) => {
            const nodeIds = new Set<string>();
            const resultNodeIds = results.map(result => result.nodeId);

            results.forEach(result => {
                nodeIds.add(result.nodeId);
            });

            // Find all ancestors that need to be expanded using DRY utility
            const ancestorsToExpand = findMultipleNodeAncestors(resultNodeIds, props.nodeMap);

            // Expand nodes to show search results
            ancestorsToExpand.forEach(nodeId => {
                if (!props.expandedNodes.has(nodeId)) {
                    props.toggleExpanded(nodeId);
                }
            });

            setSearchResults(nodeIds);
            setHighlightedNodes(nodeIds);
            setSearchResultsList(results);
        },
        [props]
    );

    // Helper to merge search results
    const mergeSearchResults = useCallback(
        (cached: SearchResult[], newResults: SearchResult[], serverWins = false): SearchResult[] => {
            const resultMap = new Map<string, SearchResult>();

            // Add cached first (if not server wins)
            if (!serverWins) {
                cached.forEach(r => resultMap.set(r.nodeId, r));
            }

            // Add/override with new results
            newResults.forEach(r => resultMap.set(r.nodeId, r));

            // If server wins, add any cached that weren't in server
            if (serverWins) {
                cached.forEach(r => {
                    if (!resultMap.has(r.nodeId)) {
                        resultMap.set(r.nodeId, r);
                    }
                });
            }

            return Array.from(resultMap.values());
        },
        []
    );

    // Managed search function with delay logic
    const managedSearch = useMemo(() => {
        if (!searchDelayManagerRef.current) {
            return () => {};
        }

        return createManagedSearchFunction(
            (query: string) => performSearchRef.current?.(query),
            searchDelayManagerRef.current
        );
    }, []);

    // Progressive search implementation
    const performSearch = useCallback(
        async (query: string, page = 1) => {
            // If search is disabled, do nothing
            if (props.enabled === false) {
                if (props.debugMode) {
                    console.debug("useTreeSearch.ts [SEARCH][DISABLED]: Search is disabled, ignoring search request");
                }
                return;
            }

            if (!query || query.length < (props.searchMinCharacters || 2)) {
                if (props.debugMode) {
                    console.debug(
                        `useTreeSearch.ts [SEARCH][CLEAR]: Query too short (${query?.length || 0} chars, min: ${
                            props.searchMinCharacters || 2
                        }), clearing results`
                    );
                }
                // Clear all results and error state
                setSearchResults(new Set());
                setHighlightedNodes(new Set());
                setSearchResultsList([]);
                setTotalResultCount(0);
                setCachedResults([]);
                // Server results cleared
                setCachedResultCount(0);
                setServerTimeout(false);
                // Clear error state
                setSearchError(null);
                setIsErrorState(false);
                return;
            }

            if (props.debugMode) {
                console.debug(`useTreeSearch.ts [SEARCH][START]: Starting search for "${query}" (page: ${page})`);
            }

            // Clear error state when starting new search
            setSearchError(null);
            setIsErrorState(false);

            // Force server-only search for large datasets
            const nodeCount = props.nodes.length;
            const forceServerSearch = nodeCount > 5000;

            console.debug(
                `useTreeSearch.ts [SEARCH][CHECK]: Node count: ${nodeCount}, Force server search: ${forceServerSearch}`
            );

            if (forceServerSearch) {
                // Check if server search is configured
                if (!props.sendSearch || !props.datasource) {
                    const errorMsg = `Dataset has ${nodeCount} nodes. Server search is required for large datasets. Please configure searchEndpoint in widget properties.`;
                    console.error(`useTreeSearch.ts [SEARCH][ERROR]: ${errorMsg}`);

                    // Set error state
                    setSearchError(errorMsg);
                    setIsErrorState(true);

                    // Clear results
                    setSearchResults(new Set());
                    setSearchResultsList([]);
                    setTotalResultCount(0);
                    setIsSearching(false);
                    return;
                }

                console.debug(
                    `useTreeSearch.ts [SEARCH][SERVER-ONLY]: Dataset has ${nodeCount} nodes, using server-only search`
                );
                // Skip cache and client search, go straight to server
                setIsSearching(true);
                setIsLoadingServer(true);

                // Build filters from search query
                if (props.searchFilters && props.searchFilters.length > 0) {
                    if (props.debugMode) {
                        console.debug(
                            `useTreeSearch.ts [SEARCH][FILTERS]: Building ${props.searchFilters.length} filters for query "${query}"`
                        );
                    }
                    const searchFilters = props.searchFilters.map(
                        filter =>
                            ({
                                ...filter,
                                value: query,
                                operator: filter.attributeType === "String" ? "contains" : "equals"
                            } as ISearchFilter)
                    );

                    await performFilterSearch(searchFilters, "OR");
                } else {
                    console.warn("useTreeSearch.ts [SEARCH][WARNING]: No search filters configured for server search");
                }
                return;
            }

            setCurrentPage(page);
            setServerTimeout(false);

            // Step 1: Instant - Check our cache
            console.debug("useTreeSearch.ts [SEARCH][Step 1]: Checking cache");
            const cached = searchCacheRef.current.get(query);
            if (cached && cached.length > 0) {
                console.debug(`useTreeSearch.ts [SEARCH][Step 1]: Cache hit! Found ${cached.length} cached results`);
                setCachedResults(cached);
                setCachedResultCount(cached.length);
                updateUIWithResults(cached);
            } else {
                if (props.debugMode) {
                    console.debug("useTreeSearch.ts [SEARCH][Step 1]: Cache miss");
                }
            }

            // Step 2: Instant - Search Mendix session cache using filters
            if (!cached || (cached.length === 0 && props.searchFilters && props.searchFilters.length > 0)) {
                if (props.debugMode) {
                    console.debug("useTreeSearch.ts [SEARCH][Step 2]: Searching Mendix session cache");
                }
                const entityType = mendixSearchRef.current?.getEntityType(props.datasource) || "";

                if (entityType) {
                    if (props.debugMode) {
                        console.debug(`useTreeSearch.ts [SEARCH][Step 2]: Entity type: ${entityType}`);
                    }
                    // Convert query to filters for session search
                    const sessionFilters =
                        props.searchFilters?.map(
                            filter =>
                                ({
                                    ...filter,
                                    value: query,
                                    operator: filter.attributeType === "String" ? "contains" : "equals"
                                } as ISearchFilter)
                        ) || [];

                    const sessionResults =
                        sessionFilters.length > 0
                            ? mendixSearchRef.current?.searchSessionObjectsWithFilters(
                                  sessionFilters,
                                  "OR",
                                  entityType
                              ) || []
                            : [];

                    console.debug(
                        `useTreeSearch.ts [SEARCH][Step 2]: Session search found ${sessionResults.length} results`
                    );

                    // Convert to SearchResult format
                    const convertedResults: SearchResult[] = sessionResults.map(item => {
                        const nodeId = props.nodeIdAttribute.get(item).value?.toString() || "";
                        const matches: SearchMatch[] = [];

                        // Check which filters matched
                        props.searchFilters?.forEach(filter => {
                            try {
                                const value = filter.attribute.get(item).value;
                                if (value && value.toString().toLowerCase().includes(query.toLowerCase())) {
                                    matches.push({
                                        attribute: filter.attributeName,
                                        value: value.toString(),
                                        matchedText: query,
                                        startIndex: 0,
                                        endIndex: query.length
                                    });
                                }
                            } catch (error) {
                                // Skip if attribute doesn't exist
                            }
                        });

                        return {
                            nodeId,
                            matches:
                                matches.length > 0
                                    ? matches
                                    : [
                                          {
                                              attribute: props.searchFilters?.[0]?.attributeName || "unknown",
                                              value: "",
                                              matchedText: query,
                                              startIndex: 0,
                                              endIndex: query.length
                                          }
                                      ]
                        };
                    });

                    if (convertedResults.length > 0) {
                        setCachedResults(convertedResults);
                        setCachedResultCount(convertedResults.length);
                        updateUIWithResults(convertedResults);

                        // Cache for next time
                        searchCacheRef.current.set(query, convertedResults);
                    }
                }
            }

            // Step 3: Also search using Web Workers in loaded nodes
            console.debug("useTreeSearch.ts [SEARCH][Step 3]: Starting client-side search");
            setIsSearching(true);
            try {
                // Convert query to filters for client search
                if (props.searchFilters && props.searchFilters.length > 0) {
                    console.debug(
                        `useTreeSearch.ts [SEARCH][Step 3]: Building filters for ${props.nodes.length} loaded nodes`
                    );
                    const clientFilters = props.searchFilters.map(
                        filter =>
                            ({
                                ...filter,
                                value: query,
                                operator: filter.attributeType === "String" ? "contains" : "equals"
                            } as ISearchFilter)
                    );

                    const clientResults = await performClientSearch(clientFilters, "OR");
                    console.debug(
                        `useTreeSearch.ts [SEARCH][Step 3]: Client search found ${clientResults.length} results`
                    );

                    if (clientResults.length > 0) {
                        // Merge with cached results
                        const merged = mergeSearchResults(cachedResults, clientResults);
                        console.debug(`useTreeSearch.ts [SEARCH][Step 3]: Merged results: ${merged.length} total`);
                        setCachedResults(merged);
                        setCachedResultCount(merged.length);
                        updateUIWithResults(merged);
                    }
                } else {
                    console.warn("useTreeSearch.ts [SEARCH][Step 3]: No search filters configured for client search");
                }
            } catch (error) {
                console.error("useTreeSearch.ts [SEARCH][Step 3]: Client search error:", error);
            } finally {
                setIsSearching(false);
            }

            // Step 4: Async - Fetch from server (if not offline)
            if (!isOffline && props.searchNodes && props.searchMode !== "client") {
                console.debug("useTreeSearch.ts [SEARCH][Step 4]: Starting server search");
                setIsLoadingServer(true);

                try {
                    const serverData = await requestManagerRef.current!.performSearch(
                        query,
                        async signal => {
                            console.debug("useTreeSearch.ts [SEARCH][Step 4]: Calling server search API");
                            // Pass abort signal to server search
                            const response = await props.searchNodes!(query, page, resultsPerPage);

                            // Check if aborted
                            if (signal.aborted) {
                                console.debug("useTreeSearch.ts [SEARCH][Step 4]: Search cancelled by user");
                                throw new Error("Search cancelled");
                            }

                            return response;
                        },
                        {
                            timeout: 5000, // TODO ADD: Make server search timeout configurable
                            onTimeout: () => {
                                setServerTimeout(true);
                                console.warn(
                                    `useTreeSearch.ts [SEARCH][Step 4]: Server search timed out after 5s for query: ${query}`
                                );
                            }
                        }
                    );

                    // Convert server response to SearchResult format
                    const serverSearchResults: SearchResult[] = serverData.items.map(item => {
                        const nodeId = props.nodeIdAttribute.get(item).value?.toString() || "";
                        const matches: SearchMatch[] = [];

                        // Try to extract matches from filters if available
                        if (props.searchFilters && props.searchFilters.length > 0) {
                            props.searchFilters.forEach(filter => {
                                try {
                                    const value = filter.attribute.get(item).value;
                                    if (value) {
                                        matches.push({
                                            attribute: filter.attributeName,
                                            value: value.toString(),
                                            matchedText: query,
                                            startIndex: 0,
                                            endIndex: query.length
                                        });
                                    }
                                } catch (error) {
                                    // Skip if attribute doesn't exist
                                }
                            });
                        }

                        return {
                            nodeId,
                            matches:
                                matches.length > 0
                                    ? matches
                                    : [
                                          {
                                              attribute: "unknown",
                                              value: "",
                                              matchedText: query,
                                              startIndex: 0,
                                              endIndex: query.length
                                          }
                                      ]
                        };
                    });

                    // Server results processed and merged
                    setTotalResultCount(serverData.total);

                    // Update cache with fresh server data
                    searchCacheRef.current.set(query, serverSearchResults);

                    // Merge all results (server wins)
                    const finalResults = mergeSearchResults(cachedResults, serverSearchResults, true);
                    updateUIWithResults(finalResults);
                } catch (error: any) {
                    if (error.message !== "Search cancelled") {
                        console.error("Server search error:", error);
                        // Check if we went offline during the error
                        if (checkIsOffline()) {
                            console.warn("Search failed due to offline status");
                        }
                    }
                } finally {
                    setIsLoadingServer(false);
                }
            }
        },
        [props, resultsPerPage, isOffline, cachedResults, updateUIWithResults, mergeSearchResults]
    );

    // Update ref whenever performSearch changes
    useEffect(() => {
        performSearchRef.current = performSearch;
    }, [performSearch]);

    // Client-side search implementation with filter support
    const performClientSearch = useCallback(
        async (filters: ISearchFilter[], logic: "AND" | "OR" = "AND"): Promise<SearchResult[]> => {
            if (!filters || filters.length === 0) {
                return [];
            }

            // TODO: Update Web Worker to support filter-based search
            // const workerManager = workerManagerRef.current;
            const results: SearchResult[] = [];

            // For now, perform search on main thread
            // TODO: Update Web Worker to support filter-based search
            props.nodes.forEach(node => {
                // Evaluate filters against this node
                if (evaluateFilters(node, filters, logic)) {
                    const matches: SearchMatch[] = [];

                    // Collect match information for each matching filter
                    filters.forEach(filter => {
                        if (evaluateFilter(filter, node)) {
                            try {
                                const value = filter.attribute.get(node.objectItem).value;
                                if (value !== null && value !== undefined) {
                                    const stringValue = value.toString();

                                    // For string filters with text search operators, find match positions
                                    if (
                                        filter.attributeType === "String" &&
                                        filter.value &&
                                        ["contains", "startsWith", "endsWith"].includes(filter.operator)
                                    ) {
                                        const searchValue = filter.value.toString();
                                        const valueLower = stringValue.toLowerCase();
                                        const searchLower = searchValue.toLowerCase();
                                        const index = valueLower.indexOf(searchLower);

                                        if (index !== -1) {
                                            matches.push({
                                                attribute: filter.attributeName,
                                                value: stringValue,
                                                matchedText: stringValue.substring(index, index + searchValue.length),
                                                startIndex: index,
                                                endIndex: index + searchValue.length
                                            });
                                        }
                                    } else {
                                        // For other types of filters, just record the match
                                        matches.push({
                                            attribute: filter.attributeName,
                                            value: stringValue,
                                            matchedText: stringValue,
                                            startIndex: 0,
                                            endIndex: stringValue.length
                                        });
                                    }
                                }
                            } catch (error) {
                                console.warn(`Error extracting match for filter ${filter.attributeName}:`, error);
                            }
                        }
                    });

                    if (matches.length > 0) {
                        results.push({
                            nodeId: node.id,
                            matches
                        });
                    }
                }
            });

            return results;
        },
        [props.nodes, evaluateFilters, evaluateFilter]
    );

    // Clear search
    const clearSearch = useCallback(() => {
        setSearchQuery("");
        setSearchResults(new Set());
        setHighlightedNodes(new Set());
        setSearchResultsList([]);
        setTotalResultCount(0);
        setCurrentPage(1);
        // Clear progressive search state
        setCachedResults([]);
        // Server results cleared
        setIsLoadingServer(false);
        setServerTimeout(false);
        setCachedResultCount(0);
        // Clear error state
        setSearchError(null);
        setIsErrorState(false);
        // Cancel any pending requests
        requestManagerRef.current?.cancelAll();
    }, []);

    // Handle search query change
    useEffect(() => {
        if (searchQuery) {
            managedSearch(searchQuery);
        } else {
            clearSearch();
        }
    }, [searchQuery, managedSearch, clearSearch]);

    // Handle page change
    useEffect(() => {
        if (searchQuery && currentPage > 1) {
            performSearch(searchQuery, currentPage);
        }
    }, [currentPage]);

    // Calculate search requirement info
    const searchRequirementMessage = useMemo(() => {
        if (!searchDelayManagerRef.current) {
            return null;
        }
        return searchDelayManagerRef.current.getSearchRequirementMessage(searchQuery.length);
    }, [searchQuery]);

    const canSearch = useMemo(() => {
        if (!searchDelayManagerRef.current) {
            return false;
        }
        return searchDelayManagerRef.current.isQueryValid(searchQuery);
    }, [searchQuery]);

    const searchDelay = useMemo(() => {
        if (!searchDelayManagerRef.current) {
            return 0;
        }
        return searchDelayManagerRef.current.getSearchDelay(searchQuery);
    }, [searchQuery]);

    // Wrap setSearchQuery to handle disabled state
    const wrappedSetSearchQuery = useCallback(
        (query: string) => {
            if (props.enabled !== false) {
                setSearchQuery(query);
            }
        },
        [props.enabled]
    );

    // Wrap clearSearch to handle disabled state
    const wrappedClearSearch = useCallback(() => {
        if (props.enabled !== false) {
            clearSearch();
        }
    }, [props.enabled, clearSearch]);

    /**
     * Perform a filter-based search
     */
    const performFilterSearch = useCallback(
        async (filters: ISearchFilter[], logic: "AND" | "OR" = "AND") => {
            console.debug(
                `useTreeSearch.ts [FILTER-SEARCH][START]: Starting filter search with ${
                    filters?.length || 0
                } filters, logic: ${logic}`
            );

            if (props.enabled === false || !filters || filters.length === 0) {
                console.debug("useTreeSearch.ts [FILTER-SEARCH][SKIP]: Search disabled or no filters provided");
                clearSearch();
                return;
            }

            setIsSearching(true);
            setServerTimeout(false);
            setCachedResultCount(0);

            try {
                // For client-side search mode
                if (props.searchMode === "client") {
                    console.debug("useTreeSearch.ts [FILTER-SEARCH][CLIENT]: Using client-side filter search");
                    const results = await performClientSearch(filters, logic);
                    console.debug(`useTreeSearch.ts [FILTER-SEARCH][CLIENT]: Found ${results.length} results`);
                    updateUIWithResults(results);
                    setTotalResultCount(results.length);
                }
                // For server-side search mode
                else if (props.searchMode === "server") {
                    console.debug("useTreeSearch.ts [FILTER-SEARCH][SERVER]: Using server-side filter search");
                    if (!props.sendSearch) {
                        console.error(
                            "useTreeSearch.ts [FILTER-SEARCH][ERROR]: Server search enabled but REST API endpoint not configured. Please set searchEndpoint in widget properties."
                        );
                        setSearchError(
                            "Server search endpoint not configured. Please set searchEndpoint in widget properties."
                        );
                        setIsErrorState(true);
                        return;
                    }

                    // Build the search request according to our API spec
                    const searchRequest: ISearchRequest = {
                        entity: props.datasource?.entity || "UnknownEntity",
                        filters: filters.map(filter => ({
                            attributeName: filter.attributeName,
                            attributeType: filter.attributeType,
                            operator: filter.operator as SearchOperator,
                            value: filter.value,
                            value2: filter.value2
                        })),
                        logic,
                        includeAncestors: true,
                        expandResults: true,
                        limit: resultsPerPage,
                        offset: (currentPage - 1) * resultsPerPage
                    };

                    try {
                        setIsLoadingServer(true);
                        console.debug(
                            "useTreeSearch.ts [FILTER-SEARCH][SERVER]: Sending REST API request:",
                            searchRequest
                        );

                        // Send the search request to the server
                        const response = await props.sendSearch(searchRequest);

                        // Check if response is valid
                        if (!response || !response.results) {
                            throw new Error("Invalid response from server - expected 'results' array");
                        }

                        console.debug(
                            `useTreeSearch.ts [FILTER-SEARCH][SERVER]: REST API returned ${response.results.length} results`
                        );

                        // Convert server response to our internal format
                        const searchResults: SearchResult[] = response.results.map((result: any) => ({
                            nodeId: result.nodeId,
                            matches: result.matches.map((match: any) => ({
                                attribute: match.attribute,
                                value: match.matchedValue,
                                matchedText: match.matchedValue,
                                startIndex: match.highlights?.[0]?.start || 0,
                                endIndex: match.highlights?.[0]?.end || match.matchedValue.length
                            }))
                        }));

                        // Update UI with results
                        updateUIWithResults(searchResults);
                        setTotalResultCount(response.total || 0);

                        // Expand ancestors if provided
                        if (response.ancestors && response.ancestors.length > 0) {
                            response.ancestors.forEach((ancestor: any) => {
                                if (!props.expandedNodes.has(ancestor.nodeId)) {
                                    props.toggleExpanded(ancestor.nodeId);
                                }
                            });
                        }
                    } catch (serverError: any) {
                        console.error("Server search failed:", serverError);

                        // Set error state
                        setSearchError(serverError.message || "Server search failed. Please try again.");
                        setIsErrorState(true);

                        // Clear results
                        setSearchResultsList([]);
                        setTotalResultCount(0);

                        // Fall back to client search if available
                        if (props.nodes.length < 5000) {
                            console.debug("Falling back to client-side search");
                            try {
                                const clientResults = await performClientSearch(filters, logic);
                                updateUIWithResults(clientResults);
                                setTotalResultCount(clientResults.length);
                                // Clear error state since fallback worked
                                setSearchError(null);
                                setIsErrorState(false);
                            } catch (clientError) {
                                console.error("Client search also failed:", clientError);
                                // Keep the original server error
                            }
                        }
                    } finally {
                        setIsLoadingServer(false);
                    }
                }
            } catch (error) {
                console.error("Filter search error:", error);
            } finally {
                setIsSearching(false);
            }
        },
        [props.enabled, props.searchMode, performClientSearch, updateUIWithResults, clearSearch]
    );

    return {
        searchQuery,
        setSearchQuery: wrappedSetSearchQuery,
        searchResults,
        highlightedNodes,
        isSearching,
        clearSearch: wrappedClearSearch,
        searchResultsList,
        totalResultCount,
        currentPage,
        setCurrentPage,
        resultsPerPage,
        // Progressive search additions
        isOffline,
        isLoadingServer,
        serverTimeout,
        cachedResultCount,
        // Search requirement fields
        searchRequirementMessage,
        canSearch,
        searchDelay,
        // Filter-based search
        performFilterSearch,
        // Error state
        searchError,
        isErrorState
    };
}
