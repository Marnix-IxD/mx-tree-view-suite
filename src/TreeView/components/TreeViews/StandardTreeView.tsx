import { ReactElement, createElement, useRef, useCallback, useMemo, useEffect, useState, memo } from "react";
import classNames from "classnames";
import { StandardTreeViewProps } from "./TreeViewProps";
import { TreeNode } from "../../types/TreeTypes";
import { TreeToolbar } from "../Toolbar/TreeToolbar";
import { TreeSearchBar } from "../Search/TreeSearchBar";
import { MemoizedBreadcrumbWrapper } from "../Breadcrumb/MemoizedBreadcrumbWrapper";
import { TreeVirtualizerEnhanced, ITreeVirtualizerHandle } from "../Tree/TreeVirtualizerEnhanced";
import { PerformanceOverlay } from "../Debug/PerformanceOverlay";
import { SearchResultsDropdown } from "../Search/SearchResultsDropdown";
import { TreeNodeHeader } from "../Tree/TreeNodeHeader";
import { useTreeNodeHeaders } from "../../hooks/useTreeNodeHeaders";
import { useSmartScrolling } from "../../hooks/useSmartScrolling";
import { useViewportTracking } from "../../hooks/useViewportTracking";
import { Icon } from "../../icons/Icon";
import { TreeLoadingBar } from "../Tree/TreeLoadingBar";
import { TreeNodeTransition } from "../TreeNode/TreeNodeTransition";
import { useTreeWithMemory } from "../../hooks/useTreeWithMemory";
import { useScrollPositionPreservation } from "../../hooks/useScrollPositionPreservation";
import "../../ui/TreeScrollPreservation.css";

// Constants for performance optimization
const DEFAULT_ITEM_HEIGHT = 32;
const DEFAULT_OVERSCAN = 5;
// const STICKY_HEADER_Z_INDEX = 10; // Will be used when sticky headers are implemented
const SEARCH_DROPDOWN_Z_INDEX = 20;

/**
 * StandardTreeView - The default tree rendering mode
 * Provides a standard hierarchical tree view with virtual scrolling,
 * sticky headers, and comprehensive feature support
 */
export function StandardTreeView(props: StandardTreeViewProps): ReactElement {
    const {
        // Tree data
        nodes,
        rootNodes,
        nodeMap,
        expandedNodes,
        selectedNodes,
        visibleNodes,
        highlightedNodes,
        focusedNodeId,
        hoveredNodeId,
        isLoading,
        isUnavailable,

        // Search
        searchQuery,
        setSearchQuery,
        isSearching,
        totalResultCount,
        showSearchResults,
        setShowSearchResults,
        searchResultsList,
        currentPage,
        resultsPerPage,
        setCurrentPage,

        // Handlers
        handleNodeClick,
        handleNodeHover,
        handleContextMenu,
        toggleExpanded,
        toggleVisibility,
        handleSearchResultSelect,
        handleBreadcrumbClick,
        getBreadcrumbPath,

        // Drag & Drop
        draggedNodes,
        isDraggingOver,
        dropPosition,
        handleDragStart,
        handleDragOver,
        handleDragLeave,
        handleDrop,
        handleDragEnd,

        // UI Configuration
        enableSearch,
        enableBreadcrumb,
        enableVisibilityToggle,
        enableDragDrop,
        selectionMode,

        // Actions
        expandAll,
        collapseAll,
        selectAll,
        clearSelection,

        // Render configuration
        nodeContent,
        nodeLabelType,
        nodeLabelAttribute,
        nodeLabelExpression,
        nodeLabelContent,
        indentSize,
        showLines,
        showIcons,
        stickyHeaderMode,
        stickyHeaderDisplay,
        categoryAttribute,
        categoryExpression,
        showCategoryItemCount,
        virtualScrolling,
        itemHeight = DEFAULT_ITEM_HEIGHT,
        overscan = DEFAULT_OVERSCAN,

        // Icons
        searchIcon,
        expandIcon,
        collapseIcon,
        visibilityOnIcon,
        visibilityOffIcon,

        // Debug
        debugMode,
        renderMetrics,

        // Tree operations
        treeOperations
    } = props;

    // State for container measurements
    const [containerWidth, setContainerWidth] = useState(0);

    // Create a Set of search result node IDs for efficient lookup
    const searchResults = useMemo(() => new Set(searchResultsList.map(result => result.objectId)), [searchResultsList]);

    // Refs for measurements and scroll handling
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const virtualScrollRef = useRef<ITreeVirtualizerHandle>(null);
    const stickyHeadersRef = useRef<Set<string>>(new Set());
    const actualScrollContainerRef = useRef<HTMLDivElement | null>(null);

    // State for virtual scroll metrics
    const [visibleItemCount, setVisibleItemCount] = useState(0);
    const [virtualScrollMetrics, setVirtualScrollMetrics] = useState<{
        velocity: number;
        overscan: number;
        visibleRange: { start: number; end: number };
    }>({ velocity: 0, overscan, visibleRange: { start: 0, end: 0 } });

    /**
     * Calculate visible nodes based on expansion state
     * This creates a flat list of nodes that should be rendered
     */
    const visibleNodesList = useMemo(() => {
        const visible: TreeNode[] = [];

        // Helper to recursively add visible nodes
        const addVisibleNodes = (nodeList: TreeNode[], parentExpanded = true) => {
            for (const node of nodeList) {
                // Node is visible if all ancestors are expanded
                if (parentExpanded) {
                    visible.push(node);

                    // Add children if this node is expanded
                    if (expandedNodes.has(node.id) && node.children.length > 0) {
                        addVisibleNodes(node.children, true);
                    }
                }
            }
        };

        // Start with root nodes
        addVisibleNodes(rootNodes);

        return visible;
    }, [rootNodes, expandedNodes]);

    // Get visible node IDs for memory management
    const visibleNodeIds = useMemo(() => {
        return visibleNodesList.map(node => node.id);
    }, [visibleNodesList]);

    // Integrate memory management with skeleton nodes
    const { enhancedNodes, enhancedNodeMap, recordActivity } = useTreeWithMemory({
        nodes: rootNodes,
        nodeMap,
        visibleNodeIds,
        expandedNodes,
        selectedBranches: props.selectedBranches,
        itemHeight: itemHeight || DEFAULT_ITEM_HEIGHT,
        containerRef,
        debugMode,
        onRequestNodeData: props.onRequestNodeData,
        onNodeDataLoaded: (nodeIds: string[]) => {
            // Notify parent
            props.onNodeDataLoaded?.(nodeIds);
            // Update scroll preservation
            handleNodesLoaded(nodeIds);
        },
        onNodeLoadingError: props.onNodeLoadingError
    });

    // Recalculate visible nodes with enhanced nodes (includes skeleton state)
    const visibleNodesListWithSkeletons = useMemo(() => {
        const visible: TreeNode[] = [];

        // Helper to recursively add visible nodes
        const addVisibleNodes = (nodeList: TreeNode[], parentExpanded = true) => {
            for (const node of nodeList) {
                // Node is visible if all ancestors are expanded
                if (parentExpanded) {
                    visible.push(node);

                    // Add children if this node is expanded
                    if (expandedNodes.has(node.id) && node.children.length > 0) {
                        addVisibleNodes(node.children, true);
                    }
                }
            }
        };

        // Start with enhanced root nodes (includes skeleton information)
        addVisibleNodes(enhancedNodes);

        return visible;
    }, [enhancedNodes, expandedNodes]);

    // Integrate scroll position preservation
    const { maintainScrollDuringExpand, handleNodesLoaded, navigateToNode, scrollToSearchResult } =
        useScrollPositionPreservation({
            containerRef: actualScrollContainerRef as React.RefObject<HTMLElement>,
            nodeMap: enhancedNodeMap,
            visibleNodes: visibleNodesListWithSkeletons,
            expandedNodes,
            itemHeight: itemHeight || DEFAULT_ITEM_HEIGHT,
            debugMode,
            datasource: props.datasource,
            onExpandPath: treeOperations?.expandPath,
            onEnsureNodeLoaded: treeOperations?.ensureNodeLoaded
        });

    // Set up viewport tracking for memory management
    useViewportTracking({
        containerRef: actualScrollContainerRef as React.RefObject<HTMLElement>,
        nodes: visibleNodesListWithSkeletons,
        nodeHeight: itemHeight || DEFAULT_ITEM_HEIGHT,
        updateViewport: props.updateViewport,
        enabled: virtualScrolling && !!props.updateViewport
    });

    /**
     * Initialize node headers hook (sticky headers for parent/category nodes)
     */
    const {
        isEnabled: stickyHeadersEnabled,
        validation,
        activeStickyHeader,
        setupScrollListener,
        stickyNodeIds,
        isNodeSticky,
        getNodeCategoryInfo,
        getAnimationDuration,
        showItemCount
    } = useTreeNodeHeaders(enhancedNodes, visibleNodesListWithSkeletons, enhancedNodeMap, containerWidth, {
        mode: stickyHeaderMode,
        display: stickyHeaderDisplay,
        categoryAttribute,
        categoryExpression,
        showItemCount: showCategoryItemCount,
        narrowScreenThreshold: props.narrowScreenThreshold
    });

    /**
     * Initialize smart scrolling for performance optimization
     */
    const {
        dynamicOverscan,
        metrics: scrollMetrics
        // forcePreload // Will be used when smart preloading is fully implemented
    } = useSmartScrolling(
        scrollContainerRef,
        visibleNodesListWithSkeletons.length,
        itemHeight,
        Math.ceil((containerRef.current?.clientHeight || 600) / itemHeight),
        virtualScrolling
            ? (start: number, end: number) => {
                  // Trigger preloading for visible range
                  if (props.onPreloadRange) {
                      const startNode = visibleNodesListWithSkeletons[start];
                      const endNode =
                          visibleNodesListWithSkeletons[Math.min(end, visibleNodesListWithSkeletons.length - 1)];
                      if (startNode?.structureId && endNode?.structureId) {
                          props.onPreloadRange(startNode.structureId, endNode.structureId);
                      }
                  }
              }
            : undefined,
        {
            enabled: virtualScrolling && visibleNodesList.length > 100,
            minVelocityThreshold: 200,
            overscanMultiplier: 0.5,
            minOverscan: 5,
            maxOverscan: 50,
            debugMode
        }
    );

    // Use dynamic overscan from smart scrolling if available
    const effectiveOverscan = virtualScrolling && dynamicOverscan ? dynamicOverscan : overscan;

    /**
     * Handle node expansion with scroll preservation
     */
    const handleToggleExpanded = useCallback(
        async (nodeId: string, event?: React.MouseEvent) => {
            if (debugMode) {
                console.debug(`StandardTreeView [NODE][EXPANSION] handleToggleExpanded called for node "${nodeId}"`);
            }
            // Prevent event bubbling
            event?.stopPropagation();

            // Record activity for memory management
            recordActivity("expand");

            // Use scroll preservation for expansion
            await maintainScrollDuringExpand(nodeId, async () => {
                // Toggle expansion
                toggleExpanded(nodeId);

                // If enabling sticky headers, track this node
                if (stickyHeaderMode === "parent" && enhancedNodeMap.get(nodeId)?.children.length) {
                    stickyHeadersRef.current = new Set(stickyNodeIds);
                }
            });
        },
        [
            toggleExpanded,
            stickyHeaderMode,
            enhancedNodeMap,
            stickyNodeIds,
            recordActivity,
            maintainScrollDuringExpand,
            debugMode
        ]
    );

    /**
     * Create a flat list of renderable items (nodes + category headers) for virtual scrolling
     */
    const renderableItems = useMemo(() => {
        if (stickyHeaderMode !== "category" || !stickyHeadersEnabled) {
            // No category headers, just return nodes
            return visibleNodesListWithSkeletons.map(node => ({ type: "node" as const, node }));
        }

        const items: Array<{ type: "node" | "category"; node?: TreeNode; category?: string; itemCount?: number }> = [];
        let currentCategory: string | null = null;

        visibleNodesListWithSkeletons.forEach(node => {
            const categoryInfo = getNodeCategoryInfo(node);
            const nodeCategory = categoryInfo?.category || null;

            // Check if we're entering a new category
            if (nodeCategory !== currentCategory && nodeCategory !== null) {
                // Add category header item
                items.push({
                    type: "category",
                    category: nodeCategory,
                    itemCount: categoryInfo?.itemCount
                });
                currentCategory = nodeCategory;
            }

            // Add the node item
            items.push({ type: "node", node });
        });

        return items;
    }, [visibleNodesListWithSkeletons, stickyHeaderMode, stickyHeadersEnabled, getNodeCategoryInfo]);

    /**
     * Render a single tree node with smooth transitions
     */
    const renderNode = useCallback(
        (node: TreeNode, index: number) => {
            const isSelected = selectedNodes.has(node.id);
            const isHighlighted = highlightedNodes.has(node.id);
            const isFocused = focusedNodeId === node.id;
            const isHovered = hoveredNodeId === node.id;
            const isExpanded = expandedNodes.has(node.id);
            const isSticky = isNodeSticky(node.id);
            const isVisible = visibleNodes.has(node.id);
            const isSearchMatch = searchResults.has(node.id);

            // Determine if this is the last child among its siblings
            const parent = node.parentId ? enhancedNodeMap.get(node.parentId) : null;
            const siblings = parent
                ? parent.children
                : Array.from(enhancedNodeMap.values())
                      .filter(n => !n.parentId)
                      .map(n => n.id);
            const isLastChild = siblings.length > 0 && siblings[siblings.length - 1] === node.id;

            return (
                <TreeNodeTransition
                    key={node.id}
                    node={node}
                    index={index}
                    level={node.level}
                    isSelected={isSelected}
                    isHighlighted={isHighlighted}
                    isFocused={isFocused}
                    isHovered={isHovered}
                    isExpanded={isExpanded}
                    isVisible={isVisible}
                    isSticky={isSticky}
                    isDragging={draggedNodes?.some(n => n.id === node.id)}
                    isDraggedOver={isDraggingOver === node.id}
                    dropPosition={isDraggingOver === node.id ? dropPosition : null}
                    isLastChild={isLastChild}
                    isSearchMatch={isSearchMatch}
                    searchQuery={searchQuery}
                    // Handlers
                    onClick={() => handleNodeClick(node)}
                    onHover={() => handleNodeHover(node)}
                    onContextMenu={e => handleContextMenu(e, node)}
                    onToggleExpanded={e => handleToggleExpanded(node.id, e)}
                    onToggleVisibility={() => toggleVisibility(node.id)}
                    // Drag & Drop handlers
                    onDragStart={handleDragStart ? e => handleDragStart(e, node) : undefined}
                    onDragOver={handleDragOver ? e => handleDragOver(e, node) : undefined}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop ? e => handleDrop(e, node) : undefined}
                    onDragEnd={handleDragEnd}
                    // Configuration
                    selectionMode={selectionMode}
                    enableVisibilityToggle={enableVisibilityToggle}
                    enableDragDrop={enableDragDrop}
                    nodeContent={nodeContent}
                    itemHeight={itemHeight}
                    nodeLabelType={nodeLabelType}
                    nodeLabelAttribute={nodeLabelAttribute}
                    nodeLabelExpression={nodeLabelExpression}
                    nodeLabelContent={nodeLabelContent}
                    indentSize={indentSize}
                    showLines={showLines}
                    showIcons={showIcons}
                    // Icons
                    expandIcon={expandIcon}
                    collapseIcon={collapseIcon}
                    visibilityOnIcon={visibilityOnIcon}
                    visibilityOffIcon={visibilityOffIcon}
                />
            );
        },
        [
            selectedNodes,
            highlightedNodes,
            focusedNodeId,
            hoveredNodeId,
            expandedNodes,
            isNodeSticky,
            visibleNodes,
            handleNodeClick,
            handleNodeHover,
            handleContextMenu,
            handleToggleExpanded,
            toggleVisibility,
            selectionMode,
            enableVisibilityToggle,
            enableDragDrop,
            draggedNodes,
            isDraggingOver,
            dropPosition,
            handleDragStart,
            handleDragOver,
            handleDragLeave,
            handleDrop,
            handleDragEnd,
            nodeContent,
            itemHeight,
            nodeLabelType,
            nodeLabelAttribute,
            nodeLabelExpression,
            nodeLabelContent,
            indentSize,
            showLines,
            showIcons,
            expandIcon,
            collapseIcon,
            visibilityOnIcon,
            visibilityOffIcon,
            nodes,
            searchResults,
            searchQuery
        ]
    );

    /**
     * Render a single item (node or category header) for virtual scrolling
     */
    const renderItem = useCallback(
        (item: (typeof renderableItems)[0], index: number) => {
            if (item.type === "category") {
                return (
                    <TreeNodeHeader
                        key={`category-${item.category}`}
                        displayText={item.category!}
                        itemCount={item.itemCount}
                        showItemCount={showItemCount}
                        animationDuration={getAnimationDuration(0)}
                        className="mx-tree__category-divider"
                        headerType="category"
                    />
                );
            } else {
                return renderNode(item.node!, index);
            }
        },
        [renderNode, showItemCount, getAnimationDuration]
    );

    /**
     * Render nodes with category headers when in category mode
     */
    const renderNodesWithCategoryHeaders = useCallback(
        (nodes: TreeNode[]) => {
            if (stickyHeaderMode !== "category" || !stickyHeadersEnabled) {
                // No category headers, just render nodes
                return nodes.map((node, index) => renderNode(node, index));
            }

            const elements: ReactElement[] = [];
            let currentCategory: string | null = null;
            let categoryNodeCount = 0;

            nodes.forEach((node, index) => {
                const categoryInfo = getNodeCategoryInfo(node);
                const nodeCategory = categoryInfo?.category || null;

                // Check if we're entering a new category
                if (nodeCategory !== currentCategory && nodeCategory !== null) {
                    // Add category header before this node
                    elements.push(
                        <TreeNodeHeader
                            key={`category-${nodeCategory}`}
                            displayText={nodeCategory}
                            itemCount={categoryInfo?.itemCount}
                            showItemCount={showItemCount}
                            animationDuration={getAnimationDuration(0)}
                            className="mx-tree__category-divider"
                            headerType="category"
                        />
                    );
                    currentCategory = nodeCategory;
                    categoryNodeCount = 0;
                }

                // Add the node itself
                elements.push(renderNode(node, index));
                categoryNodeCount++;
            });

            return elements;
        },
        [stickyHeaderMode, stickyHeadersEnabled, getNodeCategoryInfo, showItemCount, getAnimationDuration, renderNode]
    );

    /**
     * Render the tree content - either virtual or standard
     */
    const renderTreeContent = () => {
        if (isLoading) {
            return (
                <div className="mx-tree__loading">
                    <div className="mx-tree__loading-spinner" />
                    <span>Loading tree data...</span>
                </div>
            );
        }

        if (isUnavailable) {
            return (
                <div className="mx-tree__unavailable">
                    <div className="mx-tree__unavailable-icon">
                        <Icon icon={props.unavailableDataIcon} fallback="warning" className="mx-tree__icon--warning" />
                    </div>
                    <span className="mx-tree__unavailable-message">No data available to display</span>
                </div>
            );
        }

        if (visibleNodesListWithSkeletons.length === 0) {
            return (
                <div className="mx-tree__empty">
                    <span>No items to display</span>
                </div>
            );
        }

        if (virtualScrolling) {
            // Use renderableItems when category headers are enabled, otherwise use nodes directly
            const items =
                stickyHeaderMode === "category" && stickyHeadersEnabled
                    ? renderableItems
                    : visibleNodesListWithSkeletons;
            const renderer = stickyHeaderMode === "category" && stickyHeadersEnabled ? renderItem : renderNode;

            return (
                <TreeVirtualizerEnhanced
                    ref={virtualScrollRef}
                    items={items}
                    itemHeight={itemHeight}
                    overscan={effectiveOverscan}
                    renderItem={renderer}
                    className="mx-tree__virtual-scroll"
                    dynamicOverscan
                    minOverscan={3}
                    maxOverscan={20}
                    // Progressive loading support
                    totalCount={props.totalNodeCount || items.length}
                    isItemLoaded={index => {
                        // Check if this item index has actual data
                        if (index >= items.length) {
                            return false;
                        }
                        const item = items[index];
                        // Check if it's a skeleton node (using type check for category headers)
                        if ("type" in item && item.type === "node" && item.node) {
                            return !item.node.isSkeleton;
                        }
                        return true; // Category headers are always "loaded"
                    }}
                    onLoadMore={(startIndex, endIndex) => {
                        // Trigger loading of nodes in range
                        if (props.onPreloadRange) {
                            // Convert indices to structure IDs if available
                            const startNode = items[startIndex];
                            const endNode = items[endIndex];
                            if (
                                startNode &&
                                "type" in startNode &&
                                startNode.type === "node" &&
                                endNode &&
                                "type" in endNode &&
                                endNode.type === "node"
                            ) {
                                const startStructureId = startNode.node?.structureId || "";
                                const endStructureId = endNode.node?.structureId || "";
                                props.onPreloadRange(startStructureId, endStructureId);
                            }
                        }
                    }}
                    // Variable height support
                    measureItem={
                        props.enableVariableHeight
                            ? (element: HTMLElement, _index: number) => {
                                  // Let the virtualizer measure the element
                                  const height = element.getBoundingClientRect().height;
                                  return height;
                              }
                            : undefined
                    }
                    minItemHeight={itemHeight}
                    estimatedItemHeight={itemHeight}
                    onVisibleRangeChange={(startIndex, endIndex) => {
                        // Update performance metrics with visible range
                        const visibleCount = endIndex - startIndex + 1;
                        setVisibleItemCount(visibleCount);

                        if (virtualScrollRef.current) {
                            const virtualItems = virtualScrollRef.current.getVirtualItems();
                            setVirtualScrollMetrics(prev => ({
                                ...prev,
                                visibleRange: { start: startIndex, end: endIndex }
                            }));

                            if (debugMode) {
                                console.debug(
                                    `[Virtual Scroll] Rendering ${virtualItems.length} of ${items.length} items`
                                );
                            }
                        }
                    }}
                    onScroll={(_scrollTop, visibleStart, visibleEnd) => {
                        // Can be used for tracking scroll position for restoration
                        if (debugMode) {
                            console.debug(`[Virtual Scroll] Visible range: ${visibleStart}-${visibleEnd}`);
                        }
                    }}
                />
            );
        }

        // Standard rendering without virtual scrolling
        return (
            <div ref={scrollContainerRef} className="mx-tree__scroll-container">
                {renderNodesWithCategoryHeaders(visibleNodesListWithSkeletons)}
            </div>
        );
    };

    // Setup category header scroll listener
    // Track container width for responsive behavior
    useEffect(() => {
        if (!containerRef.current) {
            return;
        }

        const resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                const width = entry.contentRect.width;
                setContainerWidth(width);
            }
        });

        resizeObserver.observe(containerRef.current);

        return () => {
            resizeObserver.disconnect();
        };
    }, []);

    // Get actual scroll container from virtual scroll when using virtual scrolling
    useEffect(() => {
        if (virtualScrolling && virtualScrollRef.current) {
            actualScrollContainerRef.current = virtualScrollRef.current.getScrollContainer();
        } else if (!virtualScrolling && scrollContainerRef.current) {
            actualScrollContainerRef.current = scrollContainerRef.current;
        }
    }, [virtualScrolling]);

    useEffect(() => {
        if (stickyHeadersEnabled && actualScrollContainerRef.current) {
            return setupScrollListener(actualScrollContainerRef.current);
        }
    }, [stickyHeadersEnabled, setupScrollListener]);

    // Log category validation errors
    useEffect(() => {
        if (validation && !validation.isValid) {
            validation.errors.forEach(error => {
                console.error(`[TreeView Headers] ${error}`);
            });
            validation.warnings.forEach(warning => {
                console.warn(`[TreeView Headers] ${warning}`);
            });
        }
    }, [validation]);

    return (
        <div
            ref={containerRef}
            className={classNames("mx-tree__standard", {
                "mx-tree__standard--loading": isLoading,
                "mx-tree__standard--sticky-headers": stickyHeaderMode === "parent",
                "mx-tree__standard--category-headers": stickyHeaderMode === "category",
                "mx-tree__standard--virtual": virtualScrolling
            })}
        >
            {/* Toolbar with actions */}
            <TreeToolbar
                onExpandAll={expandAll}
                onCollapseAll={collapseAll}
                selectionMode={selectionMode}
                onSelectAll={selectAll}
                onClearSelection={clearSelection}
                selectedCount={selectedNodes.size}
                totalCount={nodes.length}
            />

            {/* Search bar */}
            {enableSearch && (
                <div className="mx-tree__search-container">
                    <TreeSearchBar
                        searchQuery={searchQuery}
                        onSearchChange={setSearchQuery}
                        isSearching={isSearching}
                        isOffline={props.isOffline}
                        isLoadingServer={props.isLoadingServer}
                        resultCount={totalResultCount}
                        searchIcon={searchIcon}
                        searchPlaceholder={props.searchPlaceholder}
                    />

                    {/* Search results dropdown */}
                    {showSearchResults && searchResultsList.length > 0 && (
                        <SearchResultsDropdown
                            results={searchResultsList}
                            currentPage={currentPage}
                            totalPages={Math.ceil(totalResultCount / resultsPerPage)}
                            onPageChange={setCurrentPage}
                            onResultSelect={(nodeId: string) => {
                                handleSearchResultSelect(nodeId);
                                // Scroll to result after a short delay
                                setTimeout(() => scrollToSearchResult(nodeId), 100);
                            }}
                            onClose={() => setShowSearchResults(false)}
                            nodeMap={nodeMap}
                            style={{ zIndex: SEARCH_DROPDOWN_Z_INDEX }}
                        />
                    )}
                </div>
            )}

            {/* Breadcrumb navigation */}
            {enableBreadcrumb && focusedNodeId && (
                <MemoizedBreadcrumbWrapper
                    focusedNodeId={focusedNodeId}
                    nodeMap={nodeMap}
                    getBreadcrumbPath={getBreadcrumbPath}
                    onNodeClick={async (node: TreeNode) => {
                        handleBreadcrumbClick(node);
                        await navigateToNode(node.id);
                    }}
                    className="mx-tree__breadcrumb"
                />
            )}

            {/* Main tree content */}
            <div className="mx-tree__content">
                {/* Category header (sticky) */}
                {stickyHeadersEnabled && activeStickyHeader && (
                    <TreeNodeHeader
                        displayText={activeStickyHeader.displayText}
                        itemCount={activeStickyHeader.itemCount}
                        showItemCount={showItemCount}
                        animationDuration={getAnimationDuration(0)} // TODO: track scroll velocity
                        className="mx-tree__category-header"
                        headerType="category"
                    />
                )}

                {renderTreeContent()}

                {/* Loading indicator at bottom of tree */}
                <TreeLoadingBar isLoading={isLoading || isSearching} />
            </div>

            {/* Debug performance overlay */}
            {debugMode && renderMetrics && (
                <PerformanceOverlay
                    metrics={{
                        ...renderMetrics,
                        scrollMetrics: virtualScrolling ? scrollMetrics : undefined,
                        // Add virtual scroll specific metrics
                        visibleCount: virtualScrolling ? visibleItemCount : visibleNodesList.length,
                        totalCount: visibleNodesList.length,
                        virtualScrolling,
                        virtualMetrics: virtualScrolling
                            ? {
                                  overscan: virtualScrollMetrics.overscan,
                                  velocity: virtualScrollMetrics.velocity,
                                  visibleRange: virtualScrollMetrics.visibleRange
                              }
                            : undefined
                    }}
                />
            )}
        </div>
    );
}

// Memoize the component for performance
export default memo(StandardTreeView);
