import { ListAttributeValue } from "mendix";
import { TreeNode } from "../types/TreeTypes";

/**
 * Search node attributes for matches
 */
export function searchNodeAttributes(
    node: TreeNode,
    searchQuery: string,
    searchAttributes: Array<ListAttributeValue<any>>
): boolean {
    const query = searchQuery.toLowerCase();

    for (const attribute of searchAttributes) {
        const value = attribute.get(node.objectItem).value;

        if (value !== null && value !== undefined) {
            const stringValue = value.toString().toLowerCase();
            if (stringValue.includes(query)) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Highlight search text in string
 */
export function highlightSearchText(text: string, searchQuery: string): Array<{ text: string; highlighted: boolean }> {
    if (!searchQuery) {
        return [{ text, highlighted: false }];
    }

    const parts: Array<{ text: string; highlighted: boolean }> = [];
    const lowerText = text.toLowerCase();
    const lowerQuery = searchQuery.toLowerCase();
    let lastIndex = 0;

    let index = lowerText.indexOf(lowerQuery);
    while (index !== -1) {
        // Add non-highlighted part
        if (index > lastIndex) {
            parts.push({
                text: text.substring(lastIndex, index),
                highlighted: false
            });
        }

        // Add highlighted part
        parts.push({
            text: text.substring(index, index + searchQuery.length),
            highlighted: true
        });

        lastIndex = index + searchQuery.length;
        index = lowerText.indexOf(lowerQuery, lastIndex);
    }

    // Add remaining text
    if (lastIndex < text.length) {
        parts.push({
            text: text.substring(lastIndex),
            highlighted: false
        });
    }

    return parts;
}

/**
 * Filter nodes by search query
 */
export function filterNodesBySearch(
    nodes: TreeNode[],
    searchQuery: string,
    searchAttributes: Array<ListAttributeValue<any>>
): TreeNode[] {
    if (!searchQuery) {
        return nodes;
    }

    // TODO: Implement filtered nodes logic
    // const filteredNodes: TreeNode[] = [];

    const filterRecursive = (nodeList: TreeNode[]): TreeNode[] => {
        return nodeList.filter(node => {
            const matchesSelf = searchNodeAttributes(node, searchQuery, searchAttributes);
            const filteredChildren = filterRecursive(node.children);

            // Include node if it matches or has matching children
            if (matchesSelf || filteredChildren.length > 0) {
                // Create a copy with filtered children
                // TODO: Use filteredNode variable properly
                // For now, just return true since we want to include this node
                return true;
            }

            return false;
        });
    };

    return filterRecursive(nodes);
}

/**
 * Get path to node
 */
export function getPathToNode(nodes: TreeNode[], targetId: string): string[] | null {
    for (const node of nodes) {
        if (node.id === targetId) {
            return [node.id];
        }

        const childPath = getPathToNode(node.children, targetId);
        if (childPath) {
            return [node.id, ...childPath];
        }
    }

    return null;
}

/**
 * Fuzzy search scoring
 */
export function fuzzyScore(str: string, query: string): number {
    const strLower = str.toLowerCase();
    const queryLower = query.toLowerCase();
    let score = 0;
    let strIndex = 0;

    for (const char of queryLower) {
        const foundIndex = strLower.indexOf(char, strIndex);

        if (foundIndex === -1) {
            return 0; // Character not found
        }

        // Higher score for consecutive matches
        if (foundIndex === strIndex) {
            score += 2;
        } else {
            score += 1;
        }

        // Bonus for matching at word boundaries
        if (foundIndex === 0 || str[foundIndex - 1] === " ") {
            score += 1;
        }

        strIndex = foundIndex + 1;
    }

    // Normalize by string length
    return score / str.length;
}
