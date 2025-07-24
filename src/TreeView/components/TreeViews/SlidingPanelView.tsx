import { ReactElement, createElement, useRef, useState, useEffect, useCallback, useMemo, memo } from "react";
import classNames from "classnames";
import { SlidingPanelViewProps } from "./TreeViewProps";
import { TreeNode } from "../../types/TreeTypes";
import { TreeNodeComponent } from "../TreeNode/TreeNodeComponent";
import { TreeBreadcrumbEnhanced } from "../Breadcrumb/TreeBreadcrumbEnhanced";
import { useTreeTouch, SwipeDirection } from "../../hooks/useTreeTouch";
import { useMobileOptimizations } from "../../hooks/useMobileOptimizations";
import { useSmartScrolling } from "../../hooks/useSmartScrolling";
import { setTimer, clearTimer } from "../../utils/timers";
import { TreeSearchBar } from "../Search/TreeSearchBar";
import { SearchResultsDropdown } from "../Search/SearchResultsDropdown";
import { TreeLoadingBar } from "../Tree/TreeLoadingBar";
import { useScreenReaderAnnouncer, treeAnnouncements } from "../../utils/screenReaderAnnouncer";
import { useSlidingPanelScrollPreservation } from "../../hooks/useSlidingPanelScrollPreservation";

// Constants
const ANIMATION_DURATION = 300;
const SWIPE_VELOCITY_THRESHOLD = 200;

interface NavigationLevel {
    nodeId: string | null; // null for root level
    scrollPosition: number;
}

/**
 * SlidingPanelView - Mobile-first tree navigation with sliding panels
 * Each level slides in from the right when navigating deeper
 * Swipe gestures control navigation
 */
export function SlidingPanelView(props: SlidingPanelViewProps): ReactElement {
    const {
        // Tree data
        // nodes, // Not used in sliding panel view
        rootNodes,
        nodeMap,
        // expandedNodes, // Not used in sliding panel view
        selectedNodes,
        // visibleNodes, // Not used in sliding panel view
        highlightedNodes,
        focusedNodeId,
        hoveredNodeId,
        isLoading,

        // Tree actions
        handleNodeClick: handleNodeClickProp,
        handleNodeHover,
        // toggleExpanded, // Not used in sliding panel view

        // Search
        enableSearch,
        searchQuery,
        setSearchQuery,
        searchResultsList,
        showSearchResults,
        setShowSearchResults,
        handleSearchResultSelect,
        isSearching,
        totalResultCount,
        currentPage,
        resultsPerPage,
        setCurrentPage,

        // Configuration
        selectionMode,
        // indentSize, // Not used in sliding panel view
        // showLines, // Not used in sliding panel view
        showIcons,
        enableBreadcrumb,
        // breadcrumbCaption, // Not used in sliding panel view
        enableTouchGestures = true,
        itemHeight, // Use the configured item height from props
        searchPlaceholder,

        // Icons
        searchIcon,
        expandIcon,
        collapseIcon,
        visibilityOnIcon,
        visibilityOffIcon,

        // Render configuration
        nodeContent,
        nodeLabelType,
        nodeLabelAttribute,
        nodeLabelExpression,
        nodeLabelContent,

        // Debug
        debugMode,

        // Smart scrolling
        onPreloadRange
    } = props;

    // State for navigation
    const [navigationHistory, setNavigationHistory] = useState<NavigationLevel[]>([
        { nodeId: null, scrollPosition: 0 }
    ]);
    const [currentLevelIndex, setCurrentLevelIndex] = useState(0);
    const [focusedIndex, setFocusedIndex] = useState<number>(-1);
    const announcer = useScreenReaderAnnouncer();

    // Refs
    const panelContainerRef = useRef<HTMLDivElement>(null);
    const currentPanelRef = useRef<HTMLDivElement>(null);
    // const touchStartXRef = useRef<number>(0); // Will be used when touch gestures are implemented
    const scrollContainerRef = currentPanelRef; // Alias for smart scrolling hook

    // Mobile optimizations
    const { deviceCapabilities, provideHapticFeedback, /* getScrollBehavior, */ isNarrowScreen } =
        useMobileOptimizations(panelContainerRef);

    // Create a Set of search result node IDs for efficient lookup
    const searchResults = useMemo(() => new Set(searchResultsList.map(result => result.objectId)), [searchResultsList]);

    // Get current level data
    const currentLevel = navigationHistory[currentLevelIndex];
    const currentParentNode = currentLevel.nodeId ? nodeMap.get(currentLevel.nodeId) : null;

    // Get nodes for current level
    const currentLevelNodes = useMemo(() => {
        if (!currentLevel.nodeId) {
            // Root level
            return rootNodes;
        }

        // Get children of current parent
        const parent = nodeMap.get(currentLevel.nodeId);
        if (!parent) {
            return [];
        }

        return parent.children;
    }, [currentLevel.nodeId, rootNodes, nodeMap]);

    // Integrate sliding panel scroll preservation
    const {
        saveCurrentScroll,
        restoreScroll,
        navigateToNode: navigateToPanelNode,
        navigateWithAnimation,
        getFocusedNodeForLevel,
        maintainFocusDuringNavigation,
        animationState
    } = useSlidingPanelScrollPreservation({
        currentLevelIndex,
        navigationHistory,
        currentLevelNodes,
        containerRef: currentPanelRef,
        nodeMap,
        debugMode: debugMode || false
    });

    // Derive animation state from hook
    const isAnimating = animationState !== null;
    const animationDirection = animationState?.direction || null;

    /**
     * Initialize smart scrolling for performance optimization
     * Only enable if current level has 100+ items
     */
    const {
        // dynamicOverscan, // Will be used when smart scrolling is fully implemented
        metrics: scrollMetrics
        // forcePreload // Will be used when smart scrolling is fully implemented
    } = useSmartScrolling(
        scrollContainerRef,
        currentLevelNodes.length,
        itemHeight || 32, // Use configured item height or fallback to 32
        Math.ceil((panelContainerRef.current?.clientHeight || 600) / 32),
        currentLevelNodes.length >= 100 && onPreloadRange
            ? (start: number, end: number) => {
                  // Only preload if we have many items
                  const startNode = currentLevelNodes[start];
                  const endNode = currentLevelNodes[Math.min(end, currentLevelNodes.length - 1)];
                  if (startNode?.structureId && endNode?.structureId) {
                      onPreloadRange(startNode.structureId, endNode.structureId);
                  }
              }
            : undefined,
        {
            enabled: currentLevelNodes.length >= 100, // Only enable for 100+ items
            minVelocityThreshold: 300, // Higher threshold for mobile
            overscanMultiplier: 0.3, // Smaller multiplier for mobile
            minOverscan: 3,
            maxOverscan: 20, // Lower max for mobile
            debugMode
        }
    );

    // Get breadcrumb path
    const breadcrumbPath = useMemo(() => {
        const path: TreeNode[] = [];

        navigationHistory.slice(0, currentLevelIndex + 1).forEach(level => {
            if (level.nodeId) {
                const node = nodeMap.get(level.nodeId);
                if (node) {
                    path.push(node);
                }
            }
        });

        return path;
    }, [navigationHistory, currentLevelIndex, nodeMap]);

    // Navigation functions (defined below but used in keyboard navigation)
    const navigateToChild = useCallback(
        (node: TreeNode) => {
            if (node.children.length === 0) {
                // Leaf node - select it instead
                // TODO FIX: Properly handle leaf node selection
                // onNodeSelect?.(node.id); // Will be implemented with proper selection handling
                return;
            }

            // Save current scroll position
            if (currentPanelRef.current) {
                const scrollTop = currentPanelRef.current.scrollTop;
                const updatedHistory = [...navigationHistory];
                updatedHistory[currentLevelIndex] = {
                    ...updatedHistory[currentLevelIndex],
                    scrollPosition: scrollTop
                };
                setNavigationHistory(updatedHistory);

                // Save using scroll preservation hook
                saveCurrentScroll();
            }

            // Add new level
            const newLevel: NavigationLevel = {
                nodeId: node.id,
                scrollPosition: 0
            };

            // Use navigateWithAnimation for coordinated animation
            navigateWithAnimation(node, "forward").then(() => {
                // Update navigation history after animation starts
                const newHistory = [...navigationHistory.slice(0, currentLevelIndex + 1), newLevel];
                setNavigationHistory(newHistory);
                setCurrentLevelIndex(currentLevelIndex + 1);

                // Haptic feedback
                if (deviceCapabilities.hasTouch) {
                    provideHapticFeedback();
                }
            });
        },
        [
            navigationHistory,
            currentLevelIndex,
            deviceCapabilities,
            provideHapticFeedback,
            nodeMap,
            navigateWithAnimation,
            saveCurrentScroll
        ]
    );

    const navigateToParent = useCallback(() => {
        if (currentLevelIndex === 0) {
            return;
        } // Already at root

        // Get parent node for animation
        const parentNodeId = navigationHistory[currentLevelIndex - 1].nodeId;
        const parentNode = parentNodeId ? nodeMap.get(parentNodeId) : null;

        // Use navigateWithAnimation for coordinated animation
        const targetNode = parentNode || ({ id: "root", label: "Root" } as TreeNode);
        navigateWithAnimation(targetNode, "backward").then(() => {
            setCurrentLevelIndex(currentLevelIndex - 1);

            // Haptic feedback
            if (deviceCapabilities.hasTouch) {
                provideHapticFeedback();
            }
        });
    }, [
        currentLevelIndex,
        navigationHistory,
        nodeMap,
        deviceCapabilities,
        provideHapticFeedback,
        navigateWithAnimation
    ]);

    // Keyboard navigation
    const handleKeyDown = useCallback(
        (event: React.KeyboardEvent) => {
            const { key } = event;
            const itemCount = currentLevelNodes.length;

            if (itemCount === 0) {
                return;
            }

            switch (key) {
                case "ArrowDown":
                    event.preventDefault();
                    const nextIndex = (focusedIndex + 1) % itemCount;
                    setFocusedIndex(nextIndex);
                    const nextNode = currentLevelNodes[nextIndex];
                    announcer(
                        treeAnnouncements.navigationTo(nextNode.label || "", currentLevelIndex, {
                            current: nextIndex + 1,
                            total: itemCount
                        })
                    );
                    break;
                case "ArrowUp":
                    event.preventDefault();
                    const prevIndex = (focusedIndex - 1 + itemCount) % itemCount;
                    setFocusedIndex(prevIndex);
                    const prevNode = currentLevelNodes[prevIndex];
                    announcer(
                        treeAnnouncements.navigationTo(prevNode.label || "", currentLevelIndex, {
                            current: prevIndex + 1,
                            total: itemCount
                        })
                    );
                    break;
                case "ArrowRight":
                case "Enter":
                    if (focusedIndex >= 0 && focusedIndex < itemCount) {
                        const node = currentLevelNodes[focusedIndex];
                        const hasChildren = node.children.length > 0 || !node.isLeaf;
                        if (hasChildren) {
                            event.preventDefault();
                            navigateToChild(node);
                            announcer(treeAnnouncements.nodeExpanded(node.label || "", node.children.length));
                        }
                    }
                    break;
                case "ArrowLeft":
                case "Escape":
                    if (currentLevelIndex > 0) {
                        event.preventDefault();
                        navigateToParent();
                    }
                    break;
                case "Home":
                    event.preventDefault();
                    setFocusedIndex(0);
                    announcer(
                        treeAnnouncements.navigationTo(currentLevelNodes[0].label || "", currentLevelIndex, {
                            current: 1,
                            total: itemCount
                        })
                    );
                    break;
                case "End":
                    event.preventDefault();
                    const lastIndex = itemCount - 1;
                    setFocusedIndex(lastIndex);
                    announcer(
                        treeAnnouncements.navigationTo(currentLevelNodes[lastIndex].label || "", currentLevelIndex, {
                            current: itemCount,
                            total: itemCount
                        })
                    );
                    break;
                case " ":
                    if (focusedIndex >= 0 && focusedIndex < itemCount) {
                        event.preventDefault();
                        handleNodeClickProp(currentLevelNodes[focusedIndex]);
                    }
                    break;
            }
        },
        [
            currentLevelNodes,
            focusedIndex,
            currentLevelIndex,
            announcer,
            handleNodeClickProp,
            navigateToChild,
            navigateToParent
        ]
    );

    /**
     * Navigate to specific breadcrumb item
     */
    const navigateToBreadcrumb = useCallback(
        (targetNode: TreeNode) => {
            // Find the level index for this node
            const targetIndex = navigationHistory.findIndex(level => level.nodeId === targetNode.id);

            if (targetIndex >= 0 && targetIndex < currentLevelIndex) {
                // Use navigateWithAnimation for coordinated animation
                navigateWithAnimation(targetNode, "backward").then(() => {
                    setCurrentLevelIndex(targetIndex);
                });
            }
        },
        [navigationHistory, currentLevelIndex, navigateWithAnimation]
    );

    /**
     * Handle swipe gestures
     */
    const handleSwipe = useCallback(
        (direction: SwipeDirection, velocity: number) => {
            if (Math.abs(velocity) < SWIPE_VELOCITY_THRESHOLD) {
                return;
            }

            if (direction === "left" && currentLevelIndex > 0) {
                // Swipe left = go back to parent
                navigateToParent();
            } else if (direction === "right") {
                // Swipe right = navigate to selected child (if any)
                const selectedInLevel = currentLevelNodes.find(node => selectedNodes.has(node.id));
                if (selectedInLevel && selectedInLevel.children.length > 0) {
                    navigateToChild(selectedInLevel);
                }
            }
        },
        [currentLevelIndex, currentLevelNodes, selectedNodes, navigateToParent, navigateToChild]
    );

    // Node clicks are handled by the parent component via handleNodeClickProp

    // Initialize touch gestures
    const {
        /* isGestureActive */
    } = useTreeTouch(
        panelContainerRef,
        {
            onSwipe: handleSwipe,
            onTap: (x, y) => {
                // Handle tap on nodes
                const element = document.elementFromPoint(x, y);
                const nodeElement = element?.closest(".tree-node");
                if (nodeElement) {
                    const nodeId = nodeElement.getAttribute("data-node-id");
                    if (nodeId) {
                        const node = nodeMap.get(nodeId);
                        if (node) {
                            handleNodeClickProp(node);
                        }
                    }
                }
            }
        },
        {
            enabled: enableTouchGestures && deviceCapabilities.hasTouch,
            swipeThreshold: 50,
            swipeVelocityThreshold: SWIPE_VELOCITY_THRESHOLD
        }
    );

    // Restore scroll position when navigating
    useEffect(() => {
        if (currentPanelRef.current && !isAnimating) {
            const targetScroll = navigationHistory[currentLevelIndex]?.scrollPosition || 0;
            currentPanelRef.current.scrollTop = targetScroll;

            // Restore using scroll preservation hook
            restoreScroll(currentLevelIndex);

            // Restore focus to last focused node if available
            const lastFocusedNodeId = getFocusedNodeForLevel(currentLevelIndex);
            if (lastFocusedNodeId) {
                const nodeIndex = currentLevelNodes.findIndex(node => node.id === lastFocusedNodeId);
                if (nodeIndex >= 0) {
                    setFocusedIndex(nodeIndex);
                }
            }
        }
    }, [currentLevelIndex, navigationHistory, isAnimating, restoreScroll, getFocusedNodeForLevel, currentLevelNodes]);

    // Maintain focus after navigation animation completes
    useEffect(() => {
        if (isAnimating) {
            const timer = setTimer(() => {
                // Maintain focus after navigation animation
                maintainFocusDuringNavigation();
            }, ANIMATION_DURATION);

            return () => clearTimer(timer);
        }
    }, [isAnimating, maintainFocusDuringNavigation]);

    // Focus item when focusedIndex changes
    useEffect(() => {
        if (focusedIndex >= 0 && currentPanelRef.current) {
            const items = currentPanelRef.current.querySelectorAll(".mx-tree-node");
            const item = items[focusedIndex] as HTMLElement;
            if (item) {
                item.focus();
            }
        }
    }, [focusedIndex]);

    // Reset focus when changing levels
    useEffect(() => {
        setFocusedIndex(-1);
    }, [currentLevelIndex]);

    /**
     * Render a tree node
     */
    const renderNode = useCallback(
        (node: TreeNode, index: number, siblingNodes: TreeNode[]) => {
            const isSelected = selectedNodes.has(node.id);
            const isHighlighted = highlightedNodes.has(node.id);
            const isFocused = focusedNodeId === node.id || focusedIndex === index;
            const isHovered = hoveredNodeId === node.id || focusedIndex === index;
            const isSearchMatch = searchResults.has(node.id);
            // const hasChildren = node.children.length > 0; // Will be used when expand functionality is implemented

            // Determine if this is the last child in the current panel
            const isLastChild = index === siblingNodes.length - 1;

            return (
                <TreeNodeComponent
                    key={node.id}
                    node={node}
                    level={0} // Always 0 in sliding panel mode
                    isExpanded={false} // No expansion in sliding mode
                    isSelected={isSelected}
                    isVisible
                    isHighlighted={isHighlighted}
                    isFocused={isFocused}
                    isHovered={isHovered}
                    isSticky={false}
                    isLastChild={isLastChild}
                    isSearchMatch={isSearchMatch}
                    searchQuery={searchQuery}
                    indentSize={0} // No indentation in sliding mode
                    showLines={false} // No lines in sliding mode
                    showIcons={showIcons}
                    nodeContent={nodeContent}
                    nodeLabelType={nodeLabelType}
                    nodeLabelAttribute={nodeLabelAttribute}
                    nodeLabelExpression={nodeLabelExpression}
                    nodeLabelContent={nodeLabelContent}
                    expandIcon={expandIcon}
                    collapseIcon={collapseIcon}
                    visibilityOnIcon={visibilityOnIcon}
                    visibilityOffIcon={visibilityOffIcon}
                    enableVisibilityToggle={false} // Not used in sliding mode
                    onClick={() => handleNodeClickProp(node)}
                    onHover={() => handleNodeHover(node)}
                    onContextMenu={() => {}}
                    onToggleExpanded={() => {}} // Disabled in sliding mode
                    onToggleVisibility={() => {}} // Not used in sliding mode
                    selectionMode={selectionMode}
                />
            );
        },
        [
            selectedNodes,
            highlightedNodes,
            focusedNodeId,
            hoveredNodeId,
            showIcons,
            nodeContent,
            itemHeight,
            nodeLabelType,
            nodeLabelAttribute,
            nodeLabelExpression,
            nodeLabelContent,
            expandIcon,
            collapseIcon,
            visibilityOnIcon,
            visibilityOffIcon,
            handleNodeClickProp,
            handleNodeHover,
            selectionMode,
            searchResults,
            searchQuery,
            searchIcon
        ]
    );

    return (
        <div
            ref={panelContainerRef}
            className={classNames("sliding-panel-view", {
                "sliding-panel-view--animating": isAnimating,
                "sliding-panel-view--forward": animationDirection === "forward",
                "sliding-panel-view--backward": animationDirection === "backward",
                "sliding-panel-view--touch": deviceCapabilities.hasTouch,
                "sliding-panel-view--narrow": isNarrowScreen
            })}
            onKeyDown={handleKeyDown}
            tabIndex={0}
            role="region"
            aria-label={`Tree level ${currentLevelIndex}, ${currentParentNode ? currentParentNode.label : "Root"}`}
        >
            {/* Search bar - shows when search is enabled */}
            {enableSearch && (
                <div className="sliding-panel-search-container">
                    <TreeSearchBar
                        searchQuery={searchQuery}
                        onSearchChange={setSearchQuery}
                        isSearching={isSearching}
                        resultCount={totalResultCount}
                        searchIcon={searchIcon}
                        searchPlaceholder={searchPlaceholder}
                    />

                    {/* Search results dropdown */}
                    {showSearchResults && searchResultsList.length > 0 && (
                        <SearchResultsDropdown
                            results={searchResultsList}
                            currentPage={currentPage}
                            totalPages={Math.ceil(totalResultCount / resultsPerPage)}
                            onPageChange={setCurrentPage}
                            onResultSelect={nodeId => {
                                handleSearchResultSelect(nodeId);
                                setShowSearchResults(false);
                                // Navigate to the panel containing this node
                                navigateToPanelNode(nodeId).then(() => {
                                    // Ensure focus is on the selected node after navigation
                                    const nodeIndex = currentLevelNodes.findIndex(n => n.id === nodeId);
                                    if (nodeIndex >= 0) {
                                        setFocusedIndex(nodeIndex);
                                    }
                                });
                            }}
                            onClose={() => setShowSearchResults(false)}
                            nodeMap={nodeMap}
                            style={{
                                position: "absolute",
                                top: "100%",
                                left: 0,
                                right: 0,
                                zIndex: 1000
                            }}
                        />
                    )}
                </div>
            )}

            {/* Breadcrumb navigation */}
            {enableBreadcrumb && breadcrumbPath.length > 0 && (
                <div className="sliding-panel-breadcrumb">
                    <TreeBreadcrumbEnhanced
                        path={breadcrumbPath}
                        onNodeClick={navigateToBreadcrumb}
                        collapseMode="scroll"
                    />
                </div>
            )}

            {/* Panel container with sliding animation */}
            <div
                className="sliding-panel-container"
                style={{
                    transform: isAnimating
                        ? `translateX(${animationDirection === "forward" ? "-100%" : "0"})`
                        : "translateX(0)",
                    transition: isAnimating ? `transform ${ANIMATION_DURATION}ms ease-out` : "none"
                }}
            >
                {/* Current level panel */}
                <div
                    ref={currentPanelRef}
                    className="sliding-panel-level"
                    style={{
                        overscrollBehavior: "contain",
                        WebkitOverflowScrolling: "touch"
                    }}
                >
                    {/* Back button for non-root levels */}
                    {currentLevelIndex > 0 && (
                        <button
                            className="sliding-panel-back-button"
                            onClick={navigateToParent}
                            aria-label="Go back to parent level"
                        >
                            <span className="sliding-panel-back-icon">‹</span>
                            <span className="sliding-panel-back-label">Back</span>
                        </button>
                    )}

                    {/* Level title */}
                    <div className="sliding-panel-level-title">
                        {currentParentNode ? currentParentNode.label : "Root"}{" "}
                        {/* TODO ADD: Make root label configurable */}
                    </div>

                    {/* Tree nodes for current level */}
                    <div className="sliding-panel-nodes">
                        {currentLevelNodes.map((node, index) => renderNode(node, index, currentLevelNodes))}
                    </div>
                </div>
            </div>

            {/* Debug info */}
            {debugMode && (
                <div className="sliding-panel-debug">
                    Level: {currentLevelIndex} | Nodes: {currentLevelNodes.length} | Touch:{" "}
                    {deviceCapabilities.hasTouch ? "Yes" : "No"}
                    {currentLevelNodes.length >= 100 && scrollMetrics && (
                        <div>
                            | Scroll: {scrollMetrics.scrollEvents} events, {Math.round(scrollMetrics.velocityPeak)}px/s
                            peak
                        </div>
                    )}
                </div>
            )}

            {/* Loading indicator at bottom */}
            <TreeLoadingBar isLoading={isLoading || isSearching} />
        </div>
    );
}

// Memoize for performance
export default memo(SlidingPanelView);
