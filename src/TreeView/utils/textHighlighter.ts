import { ReactNode, createElement, Fragment, isValidElement, Children } from "react";

/**
 * Searches for text within React elements and returns whether a match was found
 * This performs a deep search through all text content
 */
export function containsSearchText(element: ReactNode, searchQuery: string): boolean {
    if (!searchQuery || searchQuery.length === 0) {
        return false;
    }

    const lowerQuery = searchQuery.toLowerCase();

    // Helper function to search within a single node
    const searchNode = (node: ReactNode): boolean => {
        if (node === null || node === undefined || typeof node === "boolean") {
            return false;
        }

        // Direct text content
        if (typeof node === "string" || typeof node === "number") {
            return node.toString().toLowerCase().includes(lowerQuery);
        }

        // React element
        if (isValidElement(node)) {
            // Check element's children
            const children = node.props.children;
            if (children) {
                return searchNode(children);
            }
        }

        // Array of nodes
        if (Array.isArray(node)) {
            return node.some(child => searchNode(child));
        }

        return false;
    };

    return searchNode(element);
}

/**
 * Highlights search text within React elements
 * Returns a new element tree with highlighted text wrapped in spans
 */
export function highlightSearchText(
    element: ReactNode,
    searchQuery: string,
    highlightClassName = "mx-tree__search-highlight"
): ReactNode {
    if (!searchQuery || searchQuery.length === 0) {
        return element;
    }

    const lowerQuery = searchQuery.toLowerCase();

    // Helper function to highlight text
    const highlightNode = (node: ReactNode, key?: string | number): ReactNode => {
        if (node === null || node === undefined || typeof node === "boolean") {
            return node;
        }

        // Handle text content
        if (typeof node === "string") {
            const lowerText = node.toLowerCase();
            const index = lowerText.indexOf(lowerQuery);

            if (index === -1) {
                return node;
            }

            // Split the text and wrap the matched part
            const parts: ReactNode[] = [];
            let lastIndex = 0;
            let currentIndex = index;

            while (currentIndex !== -1) {
                // Add text before match
                if (currentIndex > lastIndex) {
                    parts.push(node.substring(lastIndex, currentIndex));
                }

                // Add highlighted match
                const matchEnd = currentIndex + searchQuery.length;
                parts.push(
                    createElement(
                        "span",
                        {
                            key: `highlight-${currentIndex}`,
                            className: highlightClassName
                        },
                        node.substring(currentIndex, matchEnd)
                    )
                );

                lastIndex = matchEnd;
                currentIndex = lowerText.indexOf(lowerQuery, lastIndex);
            }

            // Add remaining text
            if (lastIndex < node.length) {
                parts.push(node.substring(lastIndex));
            }

            return createElement(Fragment, { key }, parts);
        }

        // Handle numbers
        if (typeof node === "number") {
            return highlightNode(node.toString(), key);
        }

        // Handle React elements
        if (isValidElement(node)) {
            const { children, ...props } = node.props;

            if (!children) {
                return node;
            }

            // Process children
            const highlightedChildren = Children.map(children, (child, index) => highlightNode(child, index));

            // Clone element with highlighted children
            return createElement(node.type, { ...props, key: key ?? node.key }, highlightedChildren);
        }

        // Handle arrays
        if (Array.isArray(node)) {
            return node.map((child, index) => highlightNode(child, index));
        }

        return node;
    };

    return highlightNode(element);
}

/**
 * Extract all text content from a React element tree
 * Useful for searching without rendering
 */
export function extractTextContent(element: ReactNode): string {
    const texts: string[] = [];

    const extractNode = (node: ReactNode): void => {
        if (node === null || node === undefined || typeof node === "boolean") {
            return;
        }

        if (typeof node === "string" || typeof node === "number") {
            texts.push(node.toString());
            return;
        }

        if (isValidElement(node) && node.props.children) {
            extractNode(node.props.children);
        }

        if (Array.isArray(node)) {
            node.forEach(child => extractNode(child));
        }
    };

    extractNode(element);
    return texts.join(" ");
}

/**
 * Check if a node's rendered content contains the search query
 * This is useful for determining if a node should be highlighted
 */
export function nodeContainsSearchText(nodeContent: ReactNode, searchQuery: string): boolean {
    if (!searchQuery || searchQuery.length === 0) {
        return false;
    }

    const textContent = extractTextContent(nodeContent);
    const searchText = searchQuery.toLowerCase();
    const content = textContent.toLowerCase();

    return content.includes(searchText);
}
