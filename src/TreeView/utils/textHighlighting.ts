/**
 * Text highlighting utilities for search matches and external navigation
 */

import { ReactElement, Fragment, createElement } from "react";

// Constants for highlighting
const SEARCH_HIGHLIGHT_CLASS = "mx-tree-search-highlight";
const NAVIGATION_HIGHLIGHT_CLASS = "mx-tree-navigation-highlight";
const MAX_HIGHLIGHT_LENGTH = 1000; // Prevent performance issues with very long text

export interface IHighlightConfig {
    searchQuery?: string;
    isNavigationTarget?: boolean;
    caseSensitive?: boolean;
    highlightClassName?: string;
    navigationClassName?: string;
}

/**
 * Highlight search terms and navigation targets in text
 */
export function highlightText(text: string, config: IHighlightConfig = {}): ReactElement {
    if (!text || text.length > MAX_HIGHLIGHT_LENGTH) {
        return createElement(Fragment, null, text);
    }

    const {
        searchQuery,
        isNavigationTarget = false,
        caseSensitive = false,
        highlightClassName = SEARCH_HIGHLIGHT_CLASS,
        navigationClassName = NAVIGATION_HIGHLIGHT_CLASS
    } = config;

    // If no search query and not a navigation target, return plain text
    if (!searchQuery && !isNavigationTarget) {
        return createElement(Fragment, null, text);
    }

    // If navigation target but no search, just wrap in navigation highlight
    if (isNavigationTarget && !searchQuery) {
        return createElement("span", { className: navigationClassName }, text);
    }

    // If search query exists, highlight search matches
    if (searchQuery) {
        const parts = highlightSearchMatches(text, searchQuery, caseSensitive);

        return createElement(
            Fragment,
            null,
            parts.map((part, index) => {
                if (part.isMatch) {
                    const className = isNavigationTarget
                        ? `${highlightClassName} ${navigationClassName}`
                        : highlightClassName;

                    return createElement("span", { key: index, className }, part.text);
                } else {
                    const className = isNavigationTarget ? navigationClassName : undefined;

                    return className
                        ? createElement("span", { key: index, className }, part.text)
                        : createElement(Fragment, { key: index }, part.text);
                }
            })
        );
    }

    return createElement(Fragment, null, text);
}

/**
 * Split text into parts, marking which parts match the search query
 */
function highlightSearchMatches(
    text: string,
    searchQuery: string,
    caseSensitive: boolean
): Array<{ text: string; isMatch: boolean }> {
    if (!searchQuery.trim()) {
        return [{ text, isMatch: false }];
    }

    const query = caseSensitive ? searchQuery : searchQuery.toLowerCase();
    const searchText = caseSensitive ? text : text.toLowerCase();

    const parts: Array<{ text: string; isMatch: boolean }> = [];
    let lastIndex = 0;
    let index = searchText.indexOf(query);

    while (index !== -1) {
        // Add non-matching part before the match
        if (index > lastIndex) {
            parts.push({
                text: text.substring(lastIndex, index),
                isMatch: false
            });
        }

        // Add matching part
        parts.push({
            text: text.substring(index, index + query.length),
            isMatch: true
        });

        lastIndex = index + query.length;
        index = searchText.indexOf(query, lastIndex);
    }

    // Add remaining non-matching part
    if (lastIndex < text.length) {
        parts.push({
            text: text.substring(lastIndex),
            isMatch: false
        });
    }

    return parts;
}

/**
 * Create highlight configuration for a tree node
 */
export function createNodeHighlightConfig(
    searchQuery: string | undefined,
    isSearchMatch: boolean,
    isNavigationTarget: boolean
): IHighlightConfig {
    return {
        searchQuery: isSearchMatch ? searchQuery : undefined,
        isNavigationTarget,
        caseSensitive: false
    };
}

/**
 * Check if text contains search query (case-insensitive)
 */
export function textContainsQuery(text: string, query: string): boolean {
    if (!text || !query) {
        return false;
    }

    return text.toLowerCase().includes(query.toLowerCase());
}

/**
 * Get CSS class names for highlighting states
 */
export function getHighlightClassNames(
    isSearchMatch: boolean,
    isNavigationTarget: boolean,
    customClasses?: {
        search?: string;
        navigation?: string;
        combined?: string;
    }
): string {
    const classes: string[] = [];

    if (isSearchMatch && isNavigationTarget) {
        classes.push(customClasses?.combined || `${SEARCH_HIGHLIGHT_CLASS} ${NAVIGATION_HIGHLIGHT_CLASS}`);
    } else if (isSearchMatch) {
        classes.push(customClasses?.search || SEARCH_HIGHLIGHT_CLASS);
    } else if (isNavigationTarget) {
        classes.push(customClasses?.navigation || NAVIGATION_HIGHLIGHT_CLASS);
    }

    return classes.join(" ");
}

/**
 * Highlight multiple search terms with different colors/styles
 */
export function highlightMultipleTerms(
    text: string,
    terms: Array<{ term: string; className: string }>,
    caseSensitive = false
): ReactElement {
    if (!text || terms.length === 0) {
        return createElement(Fragment, null, text);
    }

    // Sort terms by length (longest first) to handle overlapping matches better
    const sortedTerms = [...terms].sort((a, b) => b.term.length - a.term.length);

    let parts: Array<{ text: string; className?: string }> = [{ text }];

    // Apply each term highlighting
    sortedTerms.forEach(({ term, className }) => {
        const newParts: Array<{ text: string; className?: string }> = [];

        parts.forEach(part => {
            if (part.className) {
                // Already highlighted part, don't modify
                newParts.push(part);
                return;
            }

            const searchText = caseSensitive ? part.text : part.text.toLowerCase();
            const searchTerm = caseSensitive ? term : term.toLowerCase();

            let lastIndex = 0;
            let index = searchText.indexOf(searchTerm);

            while (index !== -1) {
                // Add non-matching part
                if (index > lastIndex) {
                    newParts.push({
                        text: part.text.substring(lastIndex, index)
                    });
                }

                // Add matching part
                newParts.push({
                    text: part.text.substring(index, index + term.length),
                    className
                });

                lastIndex = index + term.length;
                index = searchText.indexOf(searchTerm, lastIndex);
            }

            // Add remaining text
            if (lastIndex < part.text.length) {
                newParts.push({
                    text: part.text.substring(lastIndex)
                });
            }
        });

        parts = newParts;
    });

    return createElement(
        Fragment,
        null,
        parts.map((part, index) =>
            part.className
                ? createElement("span", { key: index, className: part.className }, part.text)
                : createElement(Fragment, { key: index }, part.text)
        )
    );
}
