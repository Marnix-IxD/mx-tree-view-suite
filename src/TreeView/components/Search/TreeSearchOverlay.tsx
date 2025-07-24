import { ReactElement, createElement, useCallback, useEffect, useRef, useState, memo } from "react";
import classNames from "classnames";
import { DynamicValue, WebIcon } from "mendix";
import { TreeNode, SearchResult } from "../../types/TreeTypes";
import { Icon } from "../../icons/Icon";
import { TreeSearchStatus } from "../TreeSearchStatus";

interface ITreeSearchOverlayProps {
    searchQuery: string;
    searchResults: TreeNode[];
    searchResultsList: SearchResult[];
    isSearching: boolean;
    visible: boolean;
    onResultClick: (node: TreeNode) => void;
    onClose: () => void;
    searchIcon?: DynamicValue<WebIcon>;
    // Progressive search props
    isOffline?: boolean;
    isLoadingServer?: boolean;
    serverTimeout?: boolean;
    cachedResultCount?: number;
    totalResultCount?: number;
}

/**
 * Search Results Overlay Component
 * Displays search results in a linear list with highlighting
 */
export function TreeSearchOverlay({
    searchQuery,
    searchResults,
    searchResultsList,
    isSearching,
    visible,
    onResultClick,
    onClose,
    searchIcon,
    isOffline = false,
    isLoadingServer = false,
    serverTimeout = false,
    cachedResultCount = 0,
    totalResultCount = 0
}: ITreeSearchOverlayProps): ReactElement {
    const overlayRef = useRef<HTMLDivElement>(null);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);

    /**
     * Handle keyboard navigation
     */
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (!visible || searchResults.length === 0) {
                return;
            }

            switch (e.key) {
                case "ArrowDown":
                    e.preventDefault();
                    setHighlightedIndex(prev => (prev < searchResults.length - 1 ? prev + 1 : 0));
                    break;
                case "ArrowUp":
                    e.preventDefault();
                    setHighlightedIndex(prev => (prev > 0 ? prev - 1 : searchResults.length - 1));
                    break;
                case "Enter":
                    e.preventDefault();
                    if (highlightedIndex >= 0 && highlightedIndex < searchResults.length) {
                        onResultClick(searchResults[highlightedIndex]);
                    }
                    break;
                case "Escape":
                    e.preventDefault();
                    onClose();
                    break;
            }
        },
        [visible, searchResults, highlightedIndex, onResultClick, onClose]
    );

    /**
     * Highlight search text in result
     */
    const highlightText = useCallback((text: string, query: string): ReactElement => {
        if (!query) {
            return <span>{text}</span>;
        }

        const parts = text.split(new RegExp(`(${query})`, "gi"));
        return (
            <span>
                {parts.map((part, index) =>
                    part.toLowerCase() === query.toLowerCase() ? (
                        <mark key={index} className="tree-search-highlight">
                            {part}
                        </mark>
                    ) : (
                        <span key={index}>{part}</span>
                    )
                )}
            </span>
        );
    }, []);

    /**
     * Handle click outside
     */
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (overlayRef.current && !overlayRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        if (visible) {
            document.addEventListener("mousedown", handleClickOutside);
        }

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [visible, onClose]);

    /**
     * Handle keyboard events
     */
    useEffect(() => {
        if (visible) {
            document.addEventListener("keydown", handleKeyDown);
        }

        return () => {
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [visible, handleKeyDown]);

    /**
     * Reset highlight when results change
     */
    useEffect(() => {
        setHighlightedIndex(-1);
    }, [searchResults]);

    /**
     * Scroll highlighted item into view
     */
    useEffect(() => {
        if (highlightedIndex >= 0 && overlayRef.current) {
            const items = overlayRef.current.querySelectorAll(".tree-search-result-item");
            const highlightedItem = items[highlightedIndex] as HTMLElement;

            if (highlightedItem) {
                highlightedItem.scrollIntoView({
                    behavior: "smooth",
                    block: "nearest"
                });
            }
        }
    }, [highlightedIndex]);

    if (!visible) {
        return <div />;
    }

    return (
        <div
            ref={overlayRef}
            className={classNames("tree-search-overlay", {
                "tree-search-overlay--visible": visible
            })}
        >
            <div className="tree-search-overlay-header">
                <div className="tree-search-overlay-title">
                    <Icon icon={searchIcon} fallback="search" className="tree-search-icon" />
                    <span>Search Results</span>
                    {searchQuery && <span className="tree-search-query">for "{searchQuery}"</span>}
                </div>
                <button className="tree-search-overlay-close" onClick={onClose} aria-label="Close search results">
                    ×
                </button>
            </div>

            <div className="tree-search-overlay-content">
                {/* Progressive search status indicators */}
                <TreeSearchStatus
                    isOffline={isOffline}
                    isLoadingServer={isLoadingServer}
                    serverTimeout={serverTimeout}
                    resultCount={searchResults.length}
                    cachedResultCount={cachedResultCount}
                    searchQuery={searchQuery}
                />

                {isSearching && searchResults.length === 0 ? (
                    <div className="tree-search-loading">
                        <div className="tree-search-spinner" />
                        <span>Searching...</span>
                    </div>
                ) : searchResults.length === 0 && !isLoadingServer ? (
                    <div className="tree-search-empty">
                        <span className="tree-search-empty-icon">🔍</span>
                        <p>No results found for "{searchQuery}"</p>
                        <p className="tree-search-empty-hint">Try different keywords or check your spelling</p>
                    </div>
                ) : (
                    <div className="tree-search-results">
                        <div className="tree-search-results-count">
                            Found {searchResults.length} result{searchResults.length !== 1 ? "s" : ""}
                            {totalResultCount > searchResults.length && (
                                <span className="tree-search-total-count"> of {totalResultCount} total</span>
                            )}
                        </div>
                        <ul className="tree-search-results-list">
                            {searchResults.map((node, index) => {
                                // Find matching search result details
                                const searchResult = searchResultsList?.find(sr => sr.nodeId === node.id);
                                const primaryMatch = searchResult?.matches?.[0];

                                return (
                                    <li
                                        key={node.id}
                                        className={classNames("tree-search-result-item", {
                                            "tree-search-result-item--highlighted": index === highlightedIndex
                                        })}
                                        onClick={() => onResultClick(node)}
                                        onMouseEnter={() => setHighlightedIndex(index)}
                                    >
                                        <div className="tree-search-result-content">
                                            <div className="tree-search-result-label">
                                                {highlightText(node.label || node.id, searchQuery)}
                                            </div>
                                            {primaryMatch && primaryMatch.value && (
                                                <div className="tree-search-result-match">
                                                    {highlightText(primaryMatch.value, searchQuery)}
                                                </div>
                                            )}
                                            {node.structureId && (
                                                <div className="tree-search-result-path">{node.structureId}</div>
                                            )}
                                            {node.label && node.label !== node.id && (
                                                <div className="tree-search-result-category">{node.label}</div>
                                            )}
                                        </div>
                                        <div className="tree-search-result-arrow">→</div>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}
            </div>

            {!isSearching && searchResults.length > 0 && (
                <div className="tree-search-overlay-footer">
                    <div className="tree-search-hint">
                        <kbd>↑</kbd>
                        <kbd>↓</kbd> to navigate, <kbd>Enter</kbd> to select, <kbd>Esc</kbd> to close
                    </div>
                </div>
            )}
        </div>
    );
}

export default memo(TreeSearchOverlay);
