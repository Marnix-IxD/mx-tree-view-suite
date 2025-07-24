/**
 * Tree Search Manager Component
 * Orchestrates search behavior based on display mode and tree size
 */

import { ReactElement, createElement, useCallback, useMemo, useEffect, useState, useRef } from "react";
import { DisplayAsEnum } from "../../../../typings/TreeViewProps";
import { TreeNode, SearchResult } from "../../types/TreeTypes";
import { SearchDisplayStrategyManager } from "../../utils/searchDisplayStrategy";
import { FlatSearchResults } from "../SearchOverlay/FlatSearchResults";
import { TreeSearchBar } from "./TreeSearchBar";
import { SearchDelayManager } from "../../utils/searchDelayManager";
import { setTimer, clearTimer, TimerId } from "../../utils/timers";
import classNames from "classnames";

export interface ITreeSearchManagerProps {
    // Display configuration
    displayMode: DisplayAsEnum;
    totalNodeCount: number;
    visibleNodeCount: number;
    hasLazyLoading: boolean;

    // Search configuration
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    searchResults: SearchResult[];
    isSearching: boolean;
    searchMinCharacters: number;
    searchScalingDelay: boolean;
    searchDebounce: number;
    canSearch: boolean;
    searchRequirementMessage: string | null;
    searchPlaceholder?: string;

    // Tree data
    nodeMap: Map<string, TreeNode>;
    expandedNodes: Set<string>;

    // Actions
    onResultClick: (nodeId: string) => void;
    onExpandForSearch: (nodeIds: string[]) => void;
    getNodeLabel: (node: TreeNode) => string;

    // UI state
    showSearchOverlay: boolean;
    setShowSearchOverlay: (show: boolean) => void;
    className?: string;
}

export function TreeSearchManager({
    displayMode,
    totalNodeCount,
    visibleNodeCount, // Used to determine search strategy based on tree expansion state
    hasLazyLoading,
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    searchMinCharacters,
    searchScalingDelay,
    searchDebounce,
    canSearch,
    searchRequirementMessage,
    searchPlaceholder,
    nodeMap,
    expandedNodes,
    onResultClick,
    onExpandForSearch,
    getNodeLabel,
    showSearchOverlay,
    setShowSearchOverlay,
    className
}: ITreeSearchManagerProps): ReactElement {
    // Initialize search delay manager
    const searchDelayManager = useMemo(() => {
        return new SearchDelayManager({
            minCharacters: searchMinCharacters,
            enableScalingDelay: searchScalingDelay,
            baseDebounce: searchDebounce
        });
    }, [searchMinCharacters, searchScalingDelay, searchDebounce]);

    // Store timeout ref for debouncing
    const searchTimeoutRef = useRef<TimerId | null>(null);
    const [pendingQuery, setPendingQuery] = useState("");
    const [isDelayedSearch, setIsDelayedSearch] = useState(false);

    // Handle search with delay management
    const handleSearchChange = useCallback(
        (query: string) => {
            // Clear any existing timeout
            if (searchTimeoutRef.current) {
                clearTimer(searchTimeoutRef.current);
                searchTimeoutRef.current = null;
            }

            // Update pending query for UI feedback
            setPendingQuery(query);

            // Check if search is allowed based on character count
            if (!searchDelayManager.isQueryValid(query)) {
                // Clear search if below minimum characters
                setSearchQuery("");
                setIsDelayedSearch(false);
                return;
            }

            // Get the appropriate delay
            const delay = searchDelayManager.getSearchDelay(query);

            if (delay === -1) {
                // Query is too short, don't search
                setSearchQuery("");
                setIsDelayedSearch(false);
                return;
            }

            // If there's a delay, show delayed search indicator
            if (delay > 0) {
                setIsDelayedSearch(true);
            }

            // Apply the search with calculated delay
            searchTimeoutRef.current = setTimer(() => {
                setSearchQuery(query);
                setIsDelayedSearch(false);
                searchTimeoutRef.current = null;
            }, delay);
        },
        [searchDelayManager, setSearchQuery]
    );

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (searchTimeoutRef.current) {
                clearTimer(searchTimeoutRef.current);
            }
        };
    }, []);

    // Get search display strategy
    const strategy = useMemo(() => {
        return SearchDisplayStrategyManager.getStrategy(displayMode, totalNodeCount, hasLazyLoading, visibleNodeCount);
    }, [displayMode, totalNodeCount, hasLazyLoading, visibleNodeCount]);

    // Track if we should show inline results vs overlay
    const [useOverlay, setUseOverlay] = useState(strategy.forceOverlay);

    // Update overlay decision when strategy changes
    useEffect(() => {
        if (strategy.forceOverlay) {
            setUseOverlay(true);
        } else if (searchResults.length > strategy.maxInlineResults) {
            setUseOverlay(true);
        } else {
            setUseOverlay(false);
        }
    }, [strategy, searchResults.length]);

    // Handle search result click
    const handleResultClick = useCallback(
        (nodeId: string) => {
            if (useOverlay) {
                // In overlay mode, close overlay and navigate
                setShowSearchOverlay(false);
                onResultClick(nodeId);
            } else {
                // In inline mode, expand tree to show result
                const node = nodeMap.get(nodeId);
                if (node) {
                    const nodesToExpand: string[] = [];
                    let current = node;

                    // Collect all ancestors that need expanding
                    while (current.parentId && !expandedNodes.has(current.parentId)) {
                        nodesToExpand.push(current.parentId);
                        current = nodeMap.get(current.parentId) || current;
                    }

                    // Expand ancestors and navigate
                    if (nodesToExpand.length > 0) {
                        onExpandForSearch(nodesToExpand);
                    }
                    onResultClick(nodeId);
                }
            }
        },
        [useOverlay, setShowSearchOverlay, onResultClick, nodeMap, expandedNodes, onExpandForSearch]
    );

    // Show loading indicator for progressive search
    const showLoader = strategy.showLoader && isSearching && !useOverlay;

    return (
        <div className={classNames("mx-tree-search-manager", className)}>
            {/* Search input with strategy-aware behavior */}
            <TreeSearchBar
                searchQuery={pendingQuery || searchQuery}
                onSearchChange={handleSearchChange}
                isSearching={isSearching || isDelayedSearch}
                resultCount={searchResults.length}
                searchPlaceholder={searchPlaceholder || `Search (min ${searchMinCharacters} chars)...`}
            />

            {/* Search requirement message or delay feedback */}
            {pendingQuery && !searchDelayManager.isQueryValid(pendingQuery) && (
                <div className="mx-tree-search-requirement-message">
                    {searchDelayManager.getSearchRequirementMessage(pendingQuery.length)}
                </div>
            )}
            {isDelayedSearch && (
                <div className="mx-tree-search-delay-message">
                    Searching in {Math.round((searchDelayManager.getEstimatedWaitTime(pendingQuery) / 1000) * 10) / 10}
                    s...
                </div>
            )}
            {searchRequirementMessage && !pendingQuery && (
                <div className="mx-tree-search-requirement-message">{searchRequirementMessage}</div>
            )}

            {/* Search progress for inline expansion */}
            {showLoader && (
                <div className="mx-tree-search-progress">
                    <div className="mx-tree-search-progress-bar" />
                    <span className="mx-tree-search-progress-text">Searching and expanding tree...</span>
                </div>
            )}

            {/* Overlay results for panel mode or large result sets */}
            {useOverlay && showSearchOverlay && canSearch && (
                <FlatSearchResults
                    results={searchResults}
                    nodeMap={nodeMap}
                    searchQuery={searchQuery}
                    onResultClick={handleResultClick}
                    onClose={() => setShowSearchOverlay(false)}
                    getNodeLabel={getNodeLabel}
                    displayMode={displayMode}
                    totalNodeCount={totalNodeCount}
                    hasLazyLoading={hasLazyLoading}
                    searchMinChars={searchMinCharacters}
                    maxResults={strategy.displayType === "flat-overlay" ? undefined : 50}
                    className="mx-tree-search-overlay"
                />
            )}

            {/* Inline results info (when not using overlay) */}
            {!useOverlay && searchResults.length > 0 && canSearch && (
                <div className="mx-tree-search-inline-info">
                    <span>{searchResults.length} results found</span>
                    {searchResults.length > strategy.maxInlineResults && (
                        <button onClick={() => setShowSearchOverlay(true)} className="mx-tree-search-show-all-link">
                            Show all in overlay
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
