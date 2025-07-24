/**
 * Type-ahead search hook for tree navigation
 * Allows users to type characters to quickly jump to matching nodes
 */

import { useCallback, useRef, useState, useEffect } from "react";
import { ListAttributeValue, ListExpressionValue, ListWidgetValue, ObjectItem } from "mendix";
import { getTextExtractionCache, extractTextContentWithAlt } from "../utils/textExtractionCache";

interface TypeAheadSearchProps {
    // nodes prop removed - we use nodeMap instead
    nodeMap: Map<string, { label?: string; parentId?: string | null; objectItem?: ObjectItem }>;
    focusedNodeId: string | null;
    setFocusedNodeId: (nodeId: string) => void;
    getVisibleNodes: () => string[];
    scrollNodeIntoView?: (nodeId: string) => void;
    enabled?: boolean;
    // Node label configuration
    nodeLabelType?: "attribute" | "expression" | "widget";
    nodeLabelAttribute?: ListAttributeValue<string>;
    nodeLabelExpression?: ListExpressionValue<string>;
    nodeLabelContent?: ListWidgetValue;
}

// Constants
const TYPE_AHEAD_TIMEOUT = 1000; // Clear search after 1 second of inactivity
const MIN_SEARCH_LENGTH = 2; // Minimum characters before search is triggered (prevents too many matches on single characters)

export function useTypeAheadSearch({
    nodeMap,
    focusedNodeId,
    setFocusedNodeId,
    getVisibleNodes,
    scrollNodeIntoView,
    enabled = true,
    nodeLabelType = "attribute",
    nodeLabelAttribute,
    nodeLabelExpression,
    nodeLabelContent
}: TypeAheadSearchProps) {
    const [searchBuffer, setSearchBuffer] = useState("");
    const clearTimerRef = useRef<number | null>(null);
    const lastMatchIndexRef = useRef<number>(0);

    // Clear search buffer after timeout
    useEffect(() => {
        if (searchBuffer && enabled) {
            if (clearTimerRef.current) {
                window.clearTimeout(clearTimerRef.current);
            }

            clearTimerRef.current = window.setTimeout(() => {
                setSearchBuffer("");
                lastMatchIndexRef.current = 0;
            }, TYPE_AHEAD_TIMEOUT);

            return () => {
                if (clearTimerRef.current) {
                    window.clearTimeout(clearTimerRef.current);
                }
            };
        }
    }, [searchBuffer, enabled]);

    // Clear cache when label configuration changes
    useEffect(() => {
        textCache.current.clear();
    }, [nodeLabelType, nodeLabelAttribute, nodeLabelExpression, nodeLabelContent]);

    // Get text extraction cache
    const textCache = useRef(getTextExtractionCache());

    // Get node label based on type
    const getNodeLabel = useCallback(
        (nodeId: string): string => {
            const node = nodeMap.get(nodeId);
            if (!node) {
                return "";
            }

            // First check if we have a simple label
            if (node.label) {
                return node.label;
            }

            // If no object item, fallback to ID
            if (!node.objectItem) {
                return nodeId;
            }

            // Check cache first
            const cachedText = textCache.current.get(nodeId);
            if (cachedText !== null) {
                return cachedText;
            }

            let extractedText = "";

            try {
                switch (nodeLabelType) {
                    case "attribute":
                        if (nodeLabelAttribute) {
                            const value = nodeLabelAttribute.get(node.objectItem).value;
                            extractedText = value || "";
                        }
                        break;

                    case "expression":
                        if (nodeLabelExpression) {
                            const value = nodeLabelExpression.get(node.objectItem).value;
                            extractedText = value || "";
                        }
                        break;

                    case "widget":
                        if (nodeLabelContent) {
                            const widgetContent = nodeLabelContent.get(node.objectItem);
                            // Use enhanced extraction that includes alt text
                            extractedText = extractTextContentWithAlt(widgetContent);
                        }
                        break;
                }
            } catch (error) {
                console.debug("Error extracting node text:", error);
                // Keep extractedText as empty string on error
            }

            // Cache the extracted text (even if empty, to avoid re-extraction)
            textCache.current.set(nodeId, extractedText);

            return extractedText;
        },
        [nodeMap, nodeLabelType, nodeLabelAttribute, nodeLabelExpression, nodeLabelContent]
    );

    // Find next matching node
    const findNextMatch = useCallback(
        (searchTerm: string, startFromNext = false): string | null => {
            // Don't search if search term is too short
            if (!searchTerm || searchTerm.length < MIN_SEARCH_LENGTH) {
                return null;
            }

            const visibleNodes = getVisibleNodes();
            if (visibleNodes.length === 0) {
                return null;
            }

            const normalizedSearch = searchTerm.toLowerCase();
            const currentIndex = focusedNodeId ? visibleNodes.indexOf(focusedNodeId) : -1;

            // Determine starting index
            let startIndex = startFromNext && currentIndex >= 0 ? currentIndex + 1 : 0;

            // If we're continuing a search and already found matches, start from last match
            if (searchBuffer === searchTerm && lastMatchIndexRef.current > 0) {
                startIndex = (lastMatchIndexRef.current + 1) % visibleNodes.length;
            }

            // Search from start index to end, then wrap around
            for (let i = 0; i < visibleNodes.length; i++) {
                const index = (startIndex + i) % visibleNodes.length;
                const nodeId = visibleNodes[index];
                const label = getNodeLabel(nodeId);

                // Skip nodes with no text content
                if (!label) {
                    continue;
                }

                const lowerLabel = label.toLowerCase();
                if (lowerLabel.startsWith(normalizedSearch)) {
                    lastMatchIndexRef.current = index;
                    return nodeId;
                }
            }

            // If no match found with startsWith, try contains as fallback
            for (let i = 0; i < visibleNodes.length; i++) {
                const index = (startIndex + i) % visibleNodes.length;
                const nodeId = visibleNodes[index];
                const label = getNodeLabel(nodeId);

                // Skip nodes with no text content
                if (!label) {
                    continue;
                }

                const lowerLabel = label.toLowerCase();
                if (lowerLabel.includes(normalizedSearch)) {
                    lastMatchIndexRef.current = index;
                    return nodeId;
                }
            }

            return null;
        },
        [focusedNodeId, getVisibleNodes, getNodeLabel, searchBuffer]
    );

    // Handle character input
    const handleCharacter = useCallback(
        (char: string): boolean => {
            if (!enabled) {
                return false;
            }

            // Only handle printable characters
            if (char.length !== 1 || char === " ") {
                return false;
            }

            const newSearchBuffer = searchBuffer + char;
            setSearchBuffer(newSearchBuffer);

            // Find and focus matching node
            const matchingNodeId = findNextMatch(newSearchBuffer);
            if (matchingNodeId) {
                setFocusedNodeId(matchingNodeId);
                scrollNodeIntoView?.(matchingNodeId);
                return true;
            }

            // If no match with new character, try just the new character
            if (newSearchBuffer.length > 1) {
                setSearchBuffer(char);
                const matchingNodeId = findNextMatch(char);
                if (matchingNodeId) {
                    setFocusedNodeId(matchingNodeId);
                    scrollNodeIntoView?.(matchingNodeId);
                    return true;
                }
            }

            return false;
        },
        [enabled, searchBuffer, findNextMatch, setFocusedNodeId, scrollNodeIntoView]
    );

    // Clear search buffer
    const clearSearch = useCallback(() => {
        setSearchBuffer("");
        lastMatchIndexRef.current = 0;
        if (clearTimerRef.current) {
            window.clearTimeout(clearTimerRef.current);
            clearTimerRef.current = null;
        }
    }, []);

    // Get current search term
    const getSearchTerm = useCallback(() => searchBuffer, [searchBuffer]);

    return {
        handleCharacter,
        clearSearch,
        searchTerm: searchBuffer,
        getSearchTerm,
        isSearching: searchBuffer.length > 0
    };
}

/**
 * Helper to determine if a key event should trigger type-ahead search
 */
export function isTypeAheadKey(event: KeyboardEvent): boolean {
    // Ignore if any modifier keys are pressed
    if (event.ctrlKey || event.metaKey || event.altKey) {
        return false;
    }

    // Only handle single character keys
    if (event.key.length !== 1) {
        return false;
    }

    // Ignore space (used for selection)
    if (event.key === " ") {
        return false;
    }

    // Check if it's a printable character
    const charCode = event.key.charCodeAt(0);
    return charCode >= 32 && charCode <= 126;
}
