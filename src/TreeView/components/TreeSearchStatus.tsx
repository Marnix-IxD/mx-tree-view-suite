import { ReactElement, createElement } from "react";

interface ITreeSearchStatusProps {
    isOffline: boolean;
    isLoadingServer: boolean;
    serverTimeout?: boolean;
    resultCount: number;
    cachedResultCount: number;
    searchQuery: string;
}

/**
 * Search status indicators including offline notification
 */
export function TreeSearchStatus({
    isOffline,
    isLoadingServer,
    serverTimeout,
    resultCount,
    cachedResultCount,
    searchQuery
}: ITreeSearchStatusProps): ReactElement | null {
    if (!searchQuery) {
        return null;
    }

    return (
        <div className="mx-tree__search-status">
            {/* Offline notification bar */}
            {isOffline && (
                <div className="mx-tree__search-offline-notice">
                    <svg
                        className="mx-tree__search-offline-icon"
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                    >
                        <path d="M8 1.5c2.837 0 5.5 1.68 5.5 4.5 0 1.538-.79 2.859-2.033 3.779l1.387 1.386a.5.5 0 01-.708.708l-1.386-1.387C9.84 11.71 8.463 12.5 6.925 12.5c-.838 0-1.634-.235-2.345-.651l-1.434 1.434a.5.5 0 01-.708-.708l1.435-1.434C2.734 10.366 2 9.256 2 8c0-2.82 2.663-4.5 5.5-4.5zM8 2.5C5.663 2.5 3 3.68 3 6.5c0 .945.298 1.772.825 2.448l5.623-5.623C8.772 2.798 7.945 2.5 7 2.5zm4.675 3.552l-5.623 5.623c.676.527 1.503.825 2.448.825 2.337 0 5-1.18 5-4 0-.945-.298-1.772-.825-2.448z" />
                    </svg>
                    <span>No connection to server, search results are limited</span>
                </div>
            )}

            {/* Server loading indicator */}
            {isLoadingServer && !serverTimeout && (
                <div className="mx-tree__search-server-loading">
                    <div className="mx-tree__search-loading-spinner">
                        <span className="mx-tree__search-loading-dot" />
                        <span className="mx-tree__search-loading-dot" />
                        <span className="mx-tree__search-loading-dot" />
                    </div>
                    <span>Searching server...</span>
                </div>
            )}

            {/* Server timeout message */}
            {serverTimeout && (
                <div className="mx-tree__search-timeout-notice">
                    <svg
                        className="mx-tree__search-timeout-icon"
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                    >
                        <path d="M8 1a7 7 0 100 14A7 7 0 008 1zM8 2a6 6 0 110 12A6 6 0 018 2zm0 2a.5.5 0 01.5.5v3.793l2.354 2.353a.5.5 0 01-.708.708l-2.5-2.5A.5.5 0 017.5 8.5v-4A.5.5 0 018 4z" />
                    </svg>
                    <span>Server search timed out, showing local results only</span>
                </div>
            )}

            {/* Result count info */}
            {!isLoadingServer && resultCount > 0 && (
                <div className="mx-tree__search-result-info">
                    {cachedResultCount > 0 && cachedResultCount !== resultCount && (
                        <span className="mx-tree__search-result-source">
                            Showing {resultCount} results ({cachedResultCount} from cache)
                        </span>
                    )}
                </div>
            )}

            {/* TODO ADD: Add retry button when server timeout occurs */}
            {/* TODO ADD: Show estimated time remaining for server search */}
            {/* TODO ADD: Add option to cancel ongoing server search */}
        </div>
    );
}

/**
 * Inline search status for search input area
 */
export function TreeSearchInlineStatus({
    isSearching,
    isOffline
}: {
    isSearching: boolean;
    isOffline: boolean;
}): ReactElement | null {
    if (!isSearching && !isOffline) {
        return null;
    }

    return (
        <div className="mx-tree__search-inline-status">
            {isSearching && (
                <div className="mx-tree__search-inline-spinner" title="Searching...">
                    <svg className="mx-tree__search-spinning" width="16" height="16" viewBox="0 0 16 16">
                        <circle
                            cx="8"
                            cy="8"
                            r="6"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeDasharray="25 75"
                        />
                    </svg>
                </div>
            )}

            {isOffline && !isSearching && (
                <div className="mx-tree__search-inline-offline" title="Offline - search limited to local data">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 1c3.9 0 7 3.1 7 7s-3.1 7-7 7-7-3.1-7-7 3.1-7 7-7zm0 1c-3.3 0-6 2.7-6 6s2.7 6 6 6 6-2.7 6-6-2.7-6-6-6zm2.8 2.2l.7.7L5.2 11.1l-.7-.7 6.3-6.2z" />
                    </svg>
                </div>
            )}
        </div>
    );
}
