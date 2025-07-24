import { ObjectItem, ListValue, ListAttributeValue } from "mendix";
import { Big } from "big.js";
import { TreeNode } from "./TreeTypes";

/**
 * Search modes available in the unified search system
 */
export type SearchMode = "cache" | "session" | "client" | "datasource" | "server" | "xpath";

/**
 * Features that a search adapter might support
 */
export enum SearchFeature {
    TypeAwareFiltering = "typeAwareFiltering",
    Highlighting = "highlighting",
    AncestorExpansion = "ancestorExpansion",
    Pagination = "pagination",
    Cancellation = "cancellation",
    OfflineSupport = "offlineSupport",
    RealTimeUpdates = "realTimeUpdates",
    FuzzySearch = "fuzzySearch",
    PartialMatching = "partialMatching"
}

/**
 * Unified search result format
 */
export interface IUnifiedSearchResult {
    nodeId: string;
    node?: TreeNode;
    objectItem?: ObjectItem;
    matches: ISearchMatch[];
    ancestors?: string[];
    score?: number;
    source: SearchMode;
    structureId?: string;
    level?: number;
}

/**
 * Search match details
 */
export interface ISearchMatch {
    attribute: string;
    attributeLabel?: string;
    value: string;
    matchedText: string;
    highlights?: IHighlight[];
}

/**
 * Text highlight positions
 */
export interface IHighlight {
    start: number;
    end: number;
}

/**
 * Search options passed to adapters
 */
export interface ISearchOptions {
    query: string;
    page?: number;
    pageSize?: number;
    searchAttributes?: string[];
    filters?: ISearchFilter[];
    logic?: "AND" | "OR";
    includeAncestors?: boolean;
    expandResults?: boolean;
    fuzzySearch?: boolean;
    signal?: AbortSignal;
}

/**
 * Search filter for advanced filtering
 */
export interface ISearchFilter {
    attributeName: string;
    attributeType: "String" | "Integer" | "Long" | "Decimal" | "Boolean" | "DateTime" | "Enum";
    operator: string;
    value: any;
    value2?: any; // For between operator
}

/**
 * Search response from adapters
 */
export interface ISearchResponse {
    results: IUnifiedSearchResult[];
    total: number;
    hasMore: boolean;
    executionTime?: number;
    cached?: boolean;
    nextOffset?: number;
    errors?: ISearchError[];
}

/**
 * Search error information
 */
export interface ISearchError {
    adapter: SearchMode;
    message: string;
    code?: string;
    recoverable?: boolean;
}

/**
 * Search adapter interface
 */
export interface ISearchAdapter {
    /**
     * Unique identifier for the adapter
     */
    readonly mode: SearchMode;

    /**
     * Human-readable name
     */
    readonly name: string;

    /**
     * Priority for auto-selection (higher = preferred)
     */
    readonly priority: number;

    /**
     * Check if adapter is available/configured
     */
    isAvailable(): boolean;

    /**
     * Check if adapter supports a specific feature
     */
    supports(feature: SearchFeature): boolean;

    /**
     * Estimate performance for given query
     */
    estimatePerformance(options: ISearchOptions): IPerformanceEstimate;

    /**
     * Perform the search
     */
    search(options: ISearchOptions): Promise<ISearchResponse>;

    /**
     * Cancel any ongoing search
     */
    cancel(): void;

    /**
     * Clear any cached data
     */
    clearCache?(): void;

    /**
     * Get adapter statistics
     */
    getStats?(): IAdapterStats;
}

/**
 * Performance estimate for search operations
 */
export interface IPerformanceEstimate {
    estimatedTime: number; // milliseconds
    confidence: number; // 0-1
    factors: string[]; // Factors affecting performance
}

/**
 * Adapter usage statistics
 */
export interface IAdapterStats {
    totalSearches: number;
    averageTime: number;
    hitRate?: number;
    lastUsed?: Date;
    errors: number;
}

/**
 * Configuration for unified search
 */
export interface IUnifiedSearchConfig {
    // Widget identification
    widgetId?: string; // Unique identifier for the widget instance

    // Data source configuration
    datasource: ListValue;
    nodeIdAttribute: ListAttributeValue<string | Big>;
    nodeLabelAttribute?: ListAttributeValue<string>;
    searchAttributes?: Array<ListAttributeValue<string | Big | boolean | Date>>;

    // Tree structure configuration
    parentIdAttribute?: ListAttributeValue<string | Big>;
    structureIdAttribute?: ListAttributeValue<string>;
    levelAttribute?: ListAttributeValue<Big>;

    // Search modes
    mode?: SearchMode | "auto";
    enabledModes?: SearchMode[];
    fallbackChain?: SearchMode[];

    // Feature flags
    enableCache?: boolean;
    enableWebWorker?: boolean;
    enableServerSearch?: boolean;
    enableOfflineMode?: boolean;

    // Performance tuning
    webWorkerThreshold?: number;
    cacheSize?: number;
    cacheTTL?: number;
    searchDebounce?: number;
    minSearchLength?: number;
    maxResultsPerAdapter?: number;

    // Server configuration
    serverEndpoint?: string;
    serverTimeout?: number;

    // UI configuration
    showSearchSource?: boolean;
    highlightMatches?: boolean;
    expandAncestors?: boolean;

    // Callbacks
    onSearchStart?: (mode: SearchMode) => void;
    onSearchComplete?: (mode: SearchMode, results: ISearchResponse) => void;
    onSearchError?: (error: ISearchError) => void;
    onModeSwitch?: (from: SearchMode, to: SearchMode, reason: string) => void;
}

/**
 * Hook return type
 */
export interface IUseUnifiedTreeSearchReturn {
    // Search actions
    search: (query: string, options?: Partial<ISearchOptions>) => void;
    cancelSearch: () => void;
    clearCache: () => void;

    // Search state
    searchQuery: string;
    isSearching: boolean;
    searchResults: IUnifiedSearchResult[];
    totalResults: number;
    hasMore: boolean;

    // Mode information
    currentMode: SearchMode | null;
    availableModes: SearchMode[];
    modeStats: Map<SearchMode, IAdapterStats>;

    // Error handling
    errors: ISearchError[];
    lastError: ISearchError | null;

    // Pagination
    currentPage: number;
    setPage: (page: number) => void;
    pageSize: number;

    // Performance
    lastSearchTime: number;
    isOffline: boolean;

    // Advanced
    forceMode: (mode: SearchMode) => void;
    getAdapterInfo: (mode: SearchMode) => ISearchAdapter | null;
}

/**
 * Search context for sharing state
 */
export interface ISearchContext {
    nodes: Map<string, TreeNode>;
    objectItems: Map<string, ObjectItem>;
    expandedNodes: Set<string>;
    loadedNodes: Set<string>;
    isOffline: boolean;
    entityType?: string;
}

/**
 * Mode detection result
 */
export interface IModeDetectionResult {
    recommendedMode: SearchMode;
    reasons: string[];
    alternativeModes: SearchMode[];
    performance: IPerformanceEstimate;
}
