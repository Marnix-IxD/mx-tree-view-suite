/**
 * Generic hook for managing sticky headers in TreeView
 * Supports both category headers and parent node headers
 */

import { useRef, useCallback, useEffect, useState, useMemo } from "react";
import { TreeNode } from "../types/TreeTypes";
import { ListAttributeValue, ListExpressionValue } from "mendix";

export type StickyHeaderMode = "none" | "parent" | "category";
export type StickyHeaderDisplay = "auto" | "path" | "closest";

/**
 * Sticky header configuration
 */
export interface IStickyHeaderConfig {
    mode: StickyHeaderMode;
    display: StickyHeaderDisplay;
    // Category-specific
    categoryAttribute?: ListAttributeValue<string>;
    categoryExpression?: ListExpressionValue<string>;
    // Common options
    showItemCount: boolean;
    animationDuration?: number;
    maxLevels?: number;
    narrowScreenThreshold?: number;
}

/**
 * Active sticky header state
 */
export interface IActiveStickyHeader {
    type: "parent" | "category";
    displayText: string;
    fullPath: string[];
    itemCount?: number;
    nodeId?: string; // For parent headers
    startIndex: number;
    endIndex: number;
}

/**
 * Validation result
 */
interface IHeaderValidation {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

// Default configuration
const DEFAULT_CONFIG: Partial<IStickyHeaderConfig> = {
    animationDuration: 150,
    maxLevels: 4,
    narrowScreenThreshold: 600,
    showItemCount: true
};

/**
 * Hook for managing sticky headers with both category and parent modes
 */
export function useTreeNodeHeaders(
    nodes: TreeNode[],
    visibleNodes: TreeNode[],
    nodeMap: Map<string, TreeNode>,
    containerWidth: number,
    config: IStickyHeaderConfig
) {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };

    // State
    const [activeStickyHeader, setActiveStickyHeader] = useState<IActiveStickyHeader | null>(null);
    const [validation, setValidation] = useState<IHeaderValidation>({
        isValid: true,
        errors: [],
        warnings: []
    });

    // Refs for performance
    const categoryMapRef = useRef<Map<string, string[]>>(new Map());
    const observerRef = useRef<IntersectionObserver | null>(null);
    const lastScrollTopRef = useRef(0);
    const scrollVelocityRef = useRef(0);
    const observedElementsRef = useRef<Map<string, Element>>(new Map());
    const visibleHeadersRef = useRef<Map<string, { element: Element; top: number }>>(new Map());

    // Clear category cache when nodes change significantly
    useEffect(() => {
        categoryMapRef.current.clear();
    }, [nodes.length, mergedConfig.categoryAttribute, mergedConfig.categoryExpression]);

    /**
     * Determine display mode based on configuration and container width
     */
    const effectiveDisplayMode = useMemo(() => {
        if (mergedConfig.display === "auto") {
            return containerWidth <= mergedConfig.narrowScreenThreshold! ? "closest" : "path";
        }
        return mergedConfig.display;
    }, [mergedConfig.display, containerWidth, mergedConfig.narrowScreenThreshold]);

    /**
     * Parse category string into array
     */
    const parseCategories = useCallback((categoryString: string | null | undefined): string[] => {
        if (!categoryString) {
            return [];
        }

        const separator = categoryString.includes(";") ? ";" : ",";
        return categoryString
            .split(separator)
            .map(cat => cat.trim())
            .filter(cat => cat.length > 0);
    }, []);

    /**
     * Get cached parsed categories for better performance
     */
    const getCachedCategories = useCallback(
        (categoryString: string | null | undefined): string[] => {
            if (!categoryString) {
                return [];
            }

            const cached = categoryMapRef.current.get(categoryString);
            if (cached) {
                return cached;
            }

            const parsed = parseCategories(categoryString);
            categoryMapRef.current.set(categoryString, parsed);
            return parsed;
        },
        [parseCategories]
    );

    /**
     * Get category value for a node
     */
    const getNodeCategory = useCallback(
        (node: TreeNode): string | null => {
            if (mergedConfig.categoryAttribute && node.objectItem) {
                return mergedConfig.categoryAttribute.get(node.objectItem).value || null;
            }

            if (mergedConfig.categoryExpression && node.objectItem) {
                return mergedConfig.categoryExpression.get(node.objectItem).value || null;
            }

            return null;
        },
        [mergedConfig.categoryAttribute, mergedConfig.categoryExpression]
    );

    /**
     * Get parent path for a node
     */
    const getNodeParentPath = useCallback(
        (node: TreeNode): string[] => {
            const path: string[] = [];
            let current: TreeNode | undefined = node;

            while (current?.parentId) {
                const parent = nodeMap.get(current.parentId);
                if (parent) {
                    path.unshift(parent.label || `Node ${parent.id}`);
                    current = parent;
                } else {
                    break;
                }
            }

            return path;
        },
        [nodeMap]
    );

    /**
     * Format path for display based on mode and screen size
     */
    const formatPath = useCallback((path: string[], mode: StickyHeaderDisplay): string => {
        if (path.length === 0) {
            return "";
        }

        const separator = " > ";

        // Closest mode - only show immediate parent
        if (mode === "closest") {
            return path[path.length - 1];
        }

        // Path mode - smart truncation
        if (path.length <= 2) {
            return path.join(separator);
        }

        if (path.length === 3) {
            return path.join(separator);
        }

        // 4+ levels: First > ... > Second-to-last > Last
        const first = path[0];
        const secondToLast = path[path.length - 2];
        const last = path[path.length - 1];

        return `${first}${separator}...${separator}${secondToLast}${separator}${last}`;
    }, []);

    /**
     * Validate configuration based on mode
     */
    const validateConfiguration = useCallback(() => {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (mergedConfig.mode === "category") {
            // Validate all nodes have categories
            let hasUncategorized = false;
            const categoryGroups = new Map<string, number>();

            nodes.forEach(node => {
                const category = getNodeCategory(node);
                if (!category) {
                    hasUncategorized = true;
                    errors.push(`Node "${node.label}" has no category`);
                } else {
                    const categories = getCachedCategories(category);
                    const key = categories.join("|");
                    categoryGroups.set(key, (categoryGroups.get(key) || 0) + 1);
                }
            });

            if (hasUncategorized) {
                errors.unshift("Category headers require all nodes to have categories");
            }

            // Check for non-contiguous groups
            let lastCategory: string | null = null;
            const seenCategories = new Set<string>();

            visibleNodes.forEach(node => {
                const category = getNodeCategory(node);
                if (category) {
                    const key = getCachedCategories(category).join("|");
                    if (seenCategories.has(key) && lastCategory !== key) {
                        warnings.push(`Category "${category}" appears in multiple non-contiguous locations`);
                    }
                    seenCategories.add(key);
                    lastCategory = key;
                }
            });
        }

        return { isValid: errors.length === 0, errors, warnings };
    }, [mergedConfig.mode, nodes, visibleNodes, getNodeCategory, parseCategories]);

    // Update validation when configuration changes
    useEffect(() => {
        if (mergedConfig.mode === "none") {
            setValidation({ isValid: true, errors: [], warnings: [] });
            return;
        }

        const result = validateConfiguration();
        setValidation(result);

        if (result.errors.length > 0) {
            console.error("[TreeNodeHeaders] Validation failed:", result.errors);
        }
        if (result.warnings.length > 0) {
            console.warn("[TreeNodeHeaders] Warnings:", result.warnings);
        }
    }, [validateConfiguration, mergedConfig.mode]);

    /**
     * Calculate which header should be sticky based on scroll position
     */
    const calculateActiveStickyHeader = useCallback(
        (scrollTop: number, itemHeight = 40): IActiveStickyHeader | null => {
            if (mergedConfig.mode === "none" || !validation.isValid || visibleNodes.length === 0) {
                return null;
            }

            // Find the first visible node index
            const firstVisibleIndex = Math.floor(scrollTop / itemHeight);

            if (mergedConfig.mode === "parent") {
                // Parent mode - find the parent of the first visible node
                for (let i = firstVisibleIndex; i < visibleNodes.length; i++) {
                    const node = visibleNodes[i];
                    const parentPath = getNodeParentPath(node);

                    if (parentPath.length > 0) {
                        // Count children of this parent
                        const parentId = node.parentId;
                        let itemCount = 0;
                        let startIndex = i;
                        let endIndex = i;

                        // Find all siblings
                        for (let j = 0; j < visibleNodes.length; j++) {
                            if (visibleNodes[j].parentId === parentId) {
                                itemCount++;
                                startIndex = Math.min(startIndex, j);
                                endIndex = Math.max(endIndex, j);
                            }
                        }

                        return {
                            type: "parent",
                            displayText: formatPath(parentPath, effectiveDisplayMode),
                            fullPath: parentPath,
                            itemCount: mergedConfig.showItemCount ? itemCount : undefined,
                            nodeId: parentId || undefined,
                            startIndex,
                            endIndex
                        };
                    }
                }
            } else if (mergedConfig.mode === "category") {
                // Category mode - find the category of the first visible node
                for (let i = firstVisibleIndex; i < visibleNodes.length; i++) {
                    const node = visibleNodes[i];
                    const category = getNodeCategory(node);

                    if (category) {
                        const categories = getCachedCategories(category);

                        // Count items in this category
                        let itemCount = 0;
                        let startIndex = i;
                        let endIndex = i;

                        // Find all nodes in same category
                        for (let j = 0; j < visibleNodes.length; j++) {
                            const nodeCategory = getNodeCategory(visibleNodes[j]);
                            if (nodeCategory === category) {
                                itemCount++;
                                startIndex = Math.min(startIndex, j);
                                endIndex = Math.max(endIndex, j);
                            }
                        }

                        return {
                            type: "category",
                            displayText: formatPath(categories, effectiveDisplayMode),
                            fullPath: categories,
                            itemCount: mergedConfig.showItemCount ? itemCount : undefined,
                            startIndex,
                            endIndex
                        };
                    }
                }
            }

            return null;
        },
        [
            mergedConfig.mode,
            mergedConfig.showItemCount,
            validation.isValid,
            visibleNodes,
            getNodeParentPath,
            getNodeCategory,
            getCachedCategories,
            formatPath,
            effectiveDisplayMode
        ]
    );

    /**
     * Handle scroll events to update sticky header
     */
    const handleScroll = useCallback(
        (scrollContainer: HTMLElement, itemHeight = 40) => {
            if (mergedConfig.mode === "none" || !validation.isValid) {
                return;
            }

            const scrollTop = scrollContainer.scrollTop;

            // Calculate scroll velocity for animation timing
            const currentTime = Date.now();
            const timeDelta =
                currentTime -
                (scrollContainer.dataset.lastScrollTime
                    ? parseInt(scrollContainer.dataset.lastScrollTime)
                    : currentTime);
            const scrollDelta = Math.abs(scrollTop - lastScrollTopRef.current);
            scrollVelocityRef.current = timeDelta > 0 ? scrollDelta / timeDelta : 0;

            // Update last scroll values
            lastScrollTopRef.current = scrollTop;
            scrollContainer.dataset.lastScrollTime = currentTime.toString();

            // Calculate new header
            const newActiveHeader = calculateActiveStickyHeader(scrollTop, itemHeight);

            setActiveStickyHeader(prevHeader => {
                if (!prevHeader && !newActiveHeader) {
                    return null;
                }
                if (!prevHeader || !newActiveHeader) {
                    return newActiveHeader;
                }
                if (prevHeader.displayText !== newActiveHeader.displayText) {
                    return newActiveHeader;
                }
                return prevHeader;
            });
        },
        [mergedConfig.mode, validation.isValid, calculateActiveStickyHeader]
    );

    /**
     * Setup IntersectionObserver for precise header detection
     */
    const setupIntersectionObserver = useCallback(
        (scrollContainer: HTMLElement | null) => {
            if (!scrollContainer || mergedConfig.mode === "none") {
                return;
            }

            // Clean up previous observer
            if (observerRef.current) {
                observerRef.current.disconnect();
            }

            // Create new observer
            observerRef.current = new IntersectionObserver(
                entries => {
                    entries.forEach(entry => {
                        const headerId = entry.target.getAttribute("data-header-id");
                        if (!headerId) {
                            return;
                        }

                        if (entry.isIntersecting) {
                            // Store element with its position for sorting
                            const rect = entry.target.getBoundingClientRect();
                            visibleHeadersRef.current.set(headerId, {
                                element: entry.target,
                                top: rect.top + scrollContainer.scrollTop
                            });
                        } else {
                            visibleHeadersRef.current.delete(headerId);
                        }
                    });

                    // Find the topmost visible header by position
                    const visibleHeaders = Array.from(visibleHeadersRef.current.entries());
                    if (visibleHeaders.length > 0) {
                        // Sort by vertical position (topmost first)
                        visibleHeaders.sort(([, a], [, b]) => a.top - b.top);
                        const [topmostHeaderId] = visibleHeaders[0];

                        // Parse header info and update sticky header
                        const [nodeId, headerType] = topmostHeaderId.split("|");
                        if (headerType === "parent" || headerType === "category") {
                            const node = nodeMap.get(nodeId);
                            if (node) {
                                updateStickyHeaderFromObserver(node, headerType as "parent" | "category");
                            }
                        }
                    } else {
                        // No visible headers - clear sticky header
                        setActiveStickyHeader(null);
                    }
                },
                {
                    root: scrollContainer,
                    rootMargin: "-10% 0px -80% 0px", // Detect headers near the top
                    threshold: [0, 0.5, 1]
                }
            );

            return () => {
                if (observerRef.current) {
                    observerRef.current.disconnect();
                    observerRef.current = null;
                }
                observedElementsRef.current.clear();
                visibleHeadersRef.current.clear();
            };
        },
        [mergedConfig.mode]
    );

    /**
     * Observe a header element
     */
    const observeHeaderElement = useCallback((element: Element, headerId: string) => {
        if (!observerRef.current || observedElementsRef.current.has(headerId)) {
            return;
        }

        element.setAttribute("data-header-id", headerId);
        observerRef.current.observe(element);
        observedElementsRef.current.set(headerId, element);
    }, []);

    /**
     * Unobserve a header element
     */
    const unobserveHeaderElement = useCallback((headerId: string) => {
        const element = observedElementsRef.current.get(headerId);
        if (element && observerRef.current) {
            observerRef.current.unobserve(element);
            observedElementsRef.current.delete(headerId);
        }
    }, []);

    /**
     * Setup scroll listener with IntersectionObserver support
     */
    const setupScrollListener = useCallback(
        (scrollContainer: HTMLElement | null, itemHeight = 40) => {
            if (!scrollContainer || mergedConfig.mode === "none") {
                return;
            }

            // Setup IntersectionObserver first
            const observerCleanup = setupIntersectionObserver(scrollContainer);

            // Keep scroll handler as fallback and for velocity tracking
            const scrollHandler = () => handleScroll(scrollContainer, itemHeight);
            scrollContainer.addEventListener("scroll", scrollHandler, { passive: true });

            // Initial calculation
            scrollHandler();

            return () => {
                scrollContainer.removeEventListener("scroll", scrollHandler);
                observerCleanup?.();
            };
        },
        [handleScroll, mergedConfig.mode, setupIntersectionObserver]
    );

    /**
     * Get animation duration based on scroll velocity
     */
    const getAnimationDuration = useCallback(
        (scrollVelocity?: number): number => {
            const velocity = scrollVelocity ?? scrollVelocityRef.current;
            const baseDuration = mergedConfig.animationDuration || 150;
            const minDuration = 100;
            const maxDuration = 300;

            // Reduce duration based on scroll speed
            const speedFactor = Math.min(velocity / 1000, 1);
            const duration = baseDuration * (1 - speedFactor * 0.5);

            return Math.max(minDuration, Math.min(maxDuration, duration));
        },
        [mergedConfig.animationDuration]
    );

    /**
     * Update sticky header based on IntersectionObserver data
     */
    const updateStickyHeaderFromObserver = useCallback(
        (node: TreeNode, headerType: "parent" | "category") => {
            if (headerType === "parent") {
                const parentPath = getNodeParentPath(node);
                if (parentPath.length > 0) {
                    // Count siblings
                    const parentId = node.parentId;
                    const siblingNodes = visibleNodes.filter(n => n.parentId === parentId);
                    const siblingCount = siblingNodes.length;

                    // Find the start and end indices of siblings in the visible nodes array
                    const firstSiblingIndex = visibleNodes.findIndex(n => n.parentId === parentId);
                    const lastSiblingIndex = firstSiblingIndex >= 0 ? firstSiblingIndex + siblingCount - 1 : -1;

                    setActiveStickyHeader({
                        type: "parent",
                        displayText: formatPath(parentPath, effectiveDisplayMode),
                        fullPath: parentPath,
                        itemCount: mergedConfig.showItemCount ? siblingCount : undefined,
                        nodeId: parentId || undefined,
                        startIndex: firstSiblingIndex >= 0 ? firstSiblingIndex : 0,
                        endIndex: lastSiblingIndex >= 0 ? lastSiblingIndex : 0
                    });
                }
            } else if (headerType === "category") {
                const category = getNodeCategory(node);
                if (category) {
                    const categories = getCachedCategories(category);
                    const categoryNodes = visibleNodes.filter(n => getNodeCategory(n) === category);
                    const categoryCount = categoryNodes.length;

                    // Find the start and end indices of nodes in this category
                    const firstCategoryIndex = visibleNodes.findIndex(n => getNodeCategory(n) === category);
                    const lastCategoryIndex = firstCategoryIndex >= 0 ? firstCategoryIndex + categoryCount - 1 : -1;

                    setActiveStickyHeader({
                        type: "category",
                        displayText: formatPath(categories, effectiveDisplayMode),
                        fullPath: categories,
                        itemCount: mergedConfig.showItemCount ? categoryCount : undefined,
                        startIndex: firstCategoryIndex >= 0 ? firstCategoryIndex : 0,
                        endIndex: lastCategoryIndex >= 0 ? lastCategoryIndex : 0
                    });
                }
            }
        },
        [
            getNodeParentPath,
            getNodeCategory,
            getCachedCategories,
            formatPath,
            effectiveDisplayMode,
            mergedConfig.showItemCount,
            visibleNodes,
            nodeMap
        ]
    );

    /**
     * Calculate which nodes should be sticky headers
     * For parent mode: expanded parent nodes
     * For category mode: nodes that start categories
     */
    const stickyNodeIds = useMemo(() => {
        const stickySet = new Set<string>();

        if (mergedConfig.mode === "none" || !validation.isValid) {
            return stickySet;
        }

        if (mergedConfig.mode === "parent") {
            // In parent mode, a node is sticky if:
            // 1. It has children
            // 2. It is expanded
            // 3. Some of its children are visible
            visibleNodes.forEach(node => {
                if (node.children.length > 0 && node.isExpanded) {
                    // Check if any children are in the visible list
                    const hasVisibleChildren = node.children.some(child => visibleNodes.some(vn => vn.id === child.id));
                    if (hasVisibleChildren) {
                        stickySet.add(node.id);
                    }
                }
            });
        } else if (mergedConfig.mode === "category") {
            // In category mode, track first node of each category
            const categoryFirstNodes = new Map<string, string>();

            visibleNodes.forEach(node => {
                const category = getNodeCategory(node);
                if (category && !categoryFirstNodes.has(category)) {
                    categoryFirstNodes.set(category, node.id);
                    stickySet.add(node.id);
                }
            });
        }

        return stickySet;
    }, [mergedConfig.mode, validation.isValid, visibleNodes, getNodeCategory]);

    /**
     * Helper function to check if a node should be sticky
     */
    const isNodeSticky = useCallback(
        (nodeId: string): boolean => {
            return stickyNodeIds.has(nodeId);
        },
        [stickyNodeIds]
    );

    /**
     * Get category information for a specific node
     * Returns category name and item count
     */
    const getNodeCategoryInfo = useCallback(
        (
            node: TreeNode
        ): {
            category: string | null;
            itemCount?: number;
        } | null => {
            if (mergedConfig.mode !== "category") {
                return null;
            }

            const category = getNodeCategory(node);
            if (!category) {
                return null;
            }

            // Count items in this category
            const itemCount = mergedConfig.showItemCount
                ? visibleNodes.filter(n => getNodeCategory(n) === category).length
                : undefined;

            return {
                category,
                itemCount
            };
        },
        [mergedConfig.mode, mergedConfig.showItemCount, getNodeCategory, visibleNodes]
    );

    return {
        isEnabled: mergedConfig.mode !== "none" && validation.isValid,
        mode: mergedConfig.mode,
        displayMode: effectiveDisplayMode,
        validation,
        activeStickyHeader,
        setupScrollListener,
        getAnimationDuration,
        showItemCount: mergedConfig.showItemCount,
        // Sticky node determination
        stickyNodeIds,
        isNodeSticky,
        // Category information
        getNodeCategoryInfo,
        // IntersectionObserver methods for precise header tracking
        observeHeaderElement,
        unobserveHeaderElement
    };
}
