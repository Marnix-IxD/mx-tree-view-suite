import { ReactElement, createElement, useCallback, useRef, useEffect, memo } from "react";
import classNames from "classnames";
import { DynamicValue, WebIcon } from "mendix";
import { TreeSearchInlineStatus } from "../TreeSearchStatus";
import { Icon } from "../../icons/Icon";

interface ITreeSearchBarProps {
    searchQuery: string;
    onSearchChange: (query: string) => void;
    isSearching: boolean;
    resultCount: number;
    searchIcon?: DynamicValue<WebIcon>;
    searchPlaceholder?: string;
    // Progressive search props
    isOffline?: boolean;
    isLoadingServer?: boolean;
}

/**
 * TreeSearchBar - Search input component for tree view
 * Provides search functionality with loading states and result count
 */
export function TreeSearchBar(props: ITreeSearchBarProps): ReactElement {
    const {
        searchQuery,
        onSearchChange,
        isSearching,
        resultCount,
        searchIcon,
        isOffline = false,
        isLoadingServer = false
    } = props;

    const inputRef = useRef<HTMLInputElement>(null);

    // Handle input change
    const handleChange = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            onSearchChange(event.target.value);
        },
        [onSearchChange]
    );

    // Handle clear search
    const handleClear = useCallback(() => {
        onSearchChange("");
        // Focus back on input after clearing
        inputRef.current?.focus();
    }, [onSearchChange]);

    // Handle keyboard shortcuts
    const handleKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Escape") {
                event.preventDefault();
                handleClear();
            }
        },
        [handleClear]
    );

    // Auto-focus on mount if empty
    useEffect(() => {
        if (!searchQuery && inputRef.current) {
            inputRef.current.focus();
        }
    }, [searchQuery]);

    // Render search icon
    const renderSearchIcon = () => {
        return <Icon icon={searchIcon} fallback="search" className="mx-tree__search-icon-svg" />;
    };

    return (
        <div
            className={classNames("mx-tree__search-bar", {
                "mx-tree__search-bar--searching": isSearching,
                "mx-tree__search-bar--has-results": resultCount > 0 && searchQuery
            })}
        >
            <div className="mx-tree__search-input-wrapper">
                <span className="mx-tree__search-icon" aria-hidden="true">
                    {renderSearchIcon()}
                </span>

                <input
                    ref={inputRef}
                    type="text"
                    className="mx-tree__search-input"
                    placeholder={props.searchPlaceholder || "Search nodes..."}
                    value={searchQuery}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    aria-label="Search tree nodes"
                    aria-describedby={resultCount > 0 ? "tree-search-results" : undefined}
                />

                {/* Clear button */}
                {searchQuery && (
                    <button
                        className="mx-tree__search-clear"
                        onClick={handleClear}
                        title="Clear search"
                        aria-label="Clear search"
                        type="button"
                    >
                        <span className="mx-tree__search-clear-icon">✕</span>
                    </button>
                )}

                {/* Progressive search status indicator */}
                <TreeSearchInlineStatus isSearching={isLoadingServer || isSearching} isOffline={isOffline} />
            </div>

            {/* Result count */}
            {searchQuery && !isSearching && (
                <div id="tree-search-results" className="mx-tree__search-results" role="status" aria-live="polite">
                    {resultCount > 0 ? (
                        <span className="mx-tree__search-result-count">
                            {resultCount} {resultCount === 1 ? "result" : "results"} found
                        </span>
                    ) : (
                        <span className="mx-tree__search-no-results">No results found</span>
                    )}
                </div>
            )}
        </div>
    );
}

// Memoize for performance
export default memo(TreeSearchBar);
