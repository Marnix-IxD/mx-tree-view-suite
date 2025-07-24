import { ReactElement, createElement, useCallback, useEffect, useRef, memo } from "react";
import classNames from "classnames";
import { TreeNode } from "../../types/TreeTypes";

interface ISearchResult {
    nodeId: string;
    matchedText: string;
    path: string[];
}

interface ISearchResultsDropdownProps {
    results: ISearchResult[];
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    onResultSelect: (nodeId: string) => void;
    onClose: () => void;
    nodeMap: Map<string, TreeNode>;
    style?: React.CSSProperties;
}

/**
 * SearchResultsDropdown - Dropdown showing paginated search results
 * Displays search matches with path context and navigation
 */
export function SearchResultsDropdown(props: ISearchResultsDropdownProps): ReactElement {
    const { results, currentPage, totalPages, onPageChange, onResultSelect, onClose, nodeMap, style } = props;

    const dropdownRef = useRef<HTMLDivElement>(null);
    const firstResultRef = useRef<HTMLButtonElement>(null);

    // Focus first result on mount
    useEffect(() => {
        firstResultRef.current?.focus();
    }, [currentPage]);

    // Handle click outside to close
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [onClose]);

    // TODO ADD: Implement floating positioning using @floating-ui/react to prevent viewport clipping
    // TODO FIX: Add loading state when results are being fetched
    // TODO ADD: Highlight search term within the matched text

    // Handle keyboard navigation
    const handleKeyDown = useCallback(
        (event: React.KeyboardEvent) => {
            switch (event.key) {
                case "Escape":
                    event.preventDefault();
                    onClose();
                    break;
                case "ArrowDown":
                    event.preventDefault();
                    focusNextResult(event.currentTarget as HTMLElement);
                    break;
                case "ArrowUp":
                    event.preventDefault();
                    focusPreviousResult(event.currentTarget as HTMLElement);
                    break;
                case "PageDown":
                    event.preventDefault();
                    if (currentPage < totalPages - 1) {
                        onPageChange(currentPage + 1);
                    }
                    break;
                case "PageUp":
                    event.preventDefault();
                    if (currentPage > 0) {
                        onPageChange(currentPage - 1);
                    }
                    break;
            }
        },
        [currentPage, totalPages, onPageChange, onClose]
    );

    // Focus navigation helpers
    const focusNextResult = (current: HTMLElement) => {
        const results = dropdownRef.current?.querySelectorAll(".search-result-item");
        if (!results) {
            return;
        }

        const currentIndex = Array.from(results).indexOf(current);
        const nextIndex = (currentIndex + 1) % results.length;
        (results[nextIndex] as HTMLElement)?.focus();
    };

    const focusPreviousResult = (current: HTMLElement) => {
        const results = dropdownRef.current?.querySelectorAll(".search-result-item");
        if (!results) {
            return;
        }

        const currentIndex = Array.from(results).indexOf(current);
        const prevIndex = currentIndex === 0 ? results.length - 1 : currentIndex - 1;
        (results[prevIndex] as HTMLElement)?.focus();
    };

    // Render result path
    const renderPath = (path: string[]) => {
        return path.map((segment, index) => (
            <span key={index} className="search-result-path-segment">
                {index > 0 && <span className="search-result-path-separator">/</span>}
                {segment}
            </span>
        ));
    };

    // Handle result selection
    const handleResultClick = useCallback(
        (nodeId: string) => {
            onResultSelect(nodeId);
            onClose();
        },
        [onResultSelect, onClose]
    );

    return (
        <div
            ref={dropdownRef}
            className="search-results-dropdown"
            style={style}
            role="listbox"
            aria-label="Search results"
        >
            <div className="search-results-header">
                <span className="search-results-title">Search Results ({results.length} items)</span>
                <button
                    className="search-results-close"
                    onClick={onClose}
                    aria-label="Close search results"
                    type="button"
                >
                    ✕
                </button>
            </div>

            <div className="search-results-list">
                {results.map((result, index) => {
                    const node = nodeMap.get(result.nodeId);
                    if (!node) {
                        return null;
                    }

                    return (
                        <button
                            key={result.nodeId}
                            ref={index === 0 ? firstResultRef : undefined}
                            className="search-result-item"
                            onClick={() => handleResultClick(result.nodeId)}
                            onKeyDown={handleKeyDown}
                            role="option"
                            aria-selected={false}
                            type="button"
                        >
                            <div className="search-result-content">
                                <span className="search-result-text">{result.matchedText}</span>
                                <div className="search-result-path">{renderPath(result.path)}</div>
                            </div>
                            <span className="search-result-arrow">→</span>
                        </button>
                    );
                })}
            </div>

            {totalPages > 1 && (
                <div className="search-results-pagination">
                    <button
                        className={classNames("search-results-page-button", {
                            "search-results-page-button--disabled": currentPage === 0
                        })}
                        onClick={() => onPageChange(currentPage - 1)}
                        disabled={currentPage === 0}
                        aria-label="Previous page"
                        type="button"
                    >
                        ←
                    </button>
                    <span className="search-results-page-info">
                        Page {currentPage + 1} of {totalPages}
                    </span>
                    <button
                        className={classNames("search-results-page-button", {
                            "search-results-page-button--disabled": currentPage === totalPages - 1
                        })}
                        onClick={() => onPageChange(currentPage + 1)}
                        disabled={currentPage === totalPages - 1}
                        aria-label="Next page"
                        type="button"
                    >
                        →
                    </button>
                </div>
            )}
        </div>
    );
}

// Memoize for performance
export default memo(SearchResultsDropdown);
