/**
 * Flat Search Results Component
 * Displays search results as a flat list with path headers
 * Optimized for panel display mode
 */

import { ReactElement, useCallback, createElement, useMemo } from "react";
import classNames from "classnames";
import { TreeNode } from "../../types/TreeTypes";
import { SearchResult } from "../../types/TreeTypes";
import { TreeNodeHeader } from "../Tree/TreeNodeHeader";
import { TreeNodeSearchResult } from "../Tree/TreeNodeContent";
import { DisplayAsEnum } from "../../../../typings/TreeViewProps";
import { SearchDisplayStrategyManager } from "../../utils/searchDisplayStrategy";

export interface IFlatSearchResultsProps {
    results: SearchResult[];
    nodeMap: Map<string, TreeNode>;
    searchQuery: string;
    onResultClick: (nodeId: string) => void;
    onClose: () => void;
    className?: string;
    pathSeparator?: string;
    maxResults?: number;
    getNodeLabel: (node: TreeNode) => string;
    displayMode: DisplayAsEnum;
    totalNodeCount: number;
    hasLazyLoading: boolean;
    searchMinChars: number;
}

export function FlatSearchResults({
    results,
    nodeMap,
    searchQuery,
    onResultClick,
    onClose,
    className,
    pathSeparator = " > ",
    maxResults,
    getNodeLabel,
    displayMode,
    totalNodeCount,
    hasLazyLoading,
    searchMinChars
}: IFlatSearchResultsProps): ReactElement {
    // Get search display strategy
    const strategy = useMemo(() => {
        return SearchDisplayStrategyManager.getStrategy(displayMode, totalNodeCount, hasLazyLoading);
    }, [displayMode, totalNodeCount, hasLazyLoading]);

    const handleResultClick = useCallback(
        (nodeId: string) => {
            onResultClick(nodeId);
            onClose();
        },
        [onResultClick, onClose]
    );

    const getNodePath = useCallback(
        (node: TreeNode): string => {
            const pathParts: string[] = [];
            let current = node;

            // Build path from node to root
            while (current.parentId) {
                const parent = nodeMap.get(current.parentId);
                if (parent) {
                    pathParts.unshift(getNodeLabel(parent));
                    current = parent;
                } else {
                    break;
                }
            }

            return pathParts.join(pathSeparator);
        },
        [nodeMap, getNodeLabel, pathSeparator]
    );

    const displayResults = maxResults ? results.slice(0, maxResults) : results;
    const hasMore = maxResults && results.length > maxResults;

    // Show warning if search query is too short
    const showMinCharsWarning = searchQuery.length < searchMinChars;

    return (
        <div
            className={classNames("mx-tree-search-overlay-flat", className, {
                "mx-tree-search-overlay-flat--panel": displayMode === "sliding"
            })}
        >
            <div className="mx-tree-search-overlay-header">
                <span className="mx-tree-search-overlay-title">
                    {showMinCharsWarning
                        ? `Enter ${searchMinChars - searchQuery.length} more characters to search`
                        : `Search Results (${results.length})`}
                </span>
                <button className="mx-tree-search-overlay-close" onClick={onClose} aria-label="Close search results">
                    ×
                </button>
            </div>

            {/* Strategy info for panel mode */}
            {strategy.forceOverlay && displayMode === "sliding" && !showMinCharsWarning && (
                <div className="mx-tree-search-strategy-info">
                    <span className="mx-tree-search-strategy-icon">ℹ</span>
                    Panel view shows results in a flat list for optimal performance
                </div>
            )}

            <div className="mx-tree-search-results-list">
                {displayResults.map((result, _index) => {
                    const node = nodeMap.get(result.nodeId);
                    if (!node) {
                        return null;
                    }

                    const path = getNodePath(node);
                    const label = getNodeLabel(node);

                    return (
                        <div key={result.nodeId} className="mx-tree-search-result-item">
                            {path && (
                                <TreeNodeHeader
                                    displayText={path}
                                    showItemCount={false}
                                    animationDuration={0} // No animation in search results
                                    className="mx-tree-search-result-path"
                                    headerType="path"
                                />
                            )}

                            <TreeNodeSearchResult
                                label={label}
                                searchQuery={searchQuery}
                                className="mx-tree-search-result-button"
                                onClick={() => handleResultClick(result.nodeId)}
                            />
                        </div>
                    );
                })}

                {hasMore && (
                    <div className="mx-tree-search-results-more">
                        <button
                            className="mx-tree-search-show-all"
                            onClick={() => {
                                /* TODO: Implement show all */
                            }}
                        >
                            Show all {results.length} results
                        </button>
                    </div>
                )}

                {results.length === 0 && (
                    <div className="mx-tree-search-no-results">No results found for "{searchQuery}"</div>
                )}
            </div>
        </div>
    );
}
