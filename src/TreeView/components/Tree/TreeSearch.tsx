import { ReactElement, createElement, useRef, useEffect } from "react";
import { DynamicValue, WebIcon } from "mendix";
import { Icon } from "../../icons/Icon";
import "../../ui/TreeSearch.css";

export interface TreeSearchProps {
    value: string;
    onChange: (value: string) => void;
    isSearching: boolean;
    resultCount: number;
    placeholder?: string;
    searchIcon?: DynamicValue<WebIcon>;
}

export function TreeSearch({
    value,
    onChange,
    isSearching,
    resultCount,
    placeholder = "Search...",
    searchIcon
}: TreeSearchProps): ReactElement {
    const inputRef = useRef<HTMLInputElement>(null);

    // Focus on mount
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, []);

    const handleClear = () => {
        onChange("");
        if (inputRef.current) {
            inputRef.current.focus();
        }
    };

    return (
        <div className="tree-search">
            <div className="tree-search-icon">
                <Icon icon={searchIcon} fallback="search" className="tree-search-icon-svg" />
            </div>

            <input
                ref={inputRef}
                type="text"
                className="tree-search-input"
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                aria-label="Search tree"
            />

            {isSearching && (
                <div className="tree-search-loading">
                    <div className="tree-search-spinner" />
                </div>
            )}

            {value && !isSearching && <div className="tree-search-results-count">{resultCount} found</div>}
            {/* TODO ADD: Show "No results" message when resultCount is 0 */}

            {value && (
                <button className="tree-search-clear" onClick={handleClear} aria-label="Clear search">
                    ✕
                </button>
            )}
        </div>
    );
}
