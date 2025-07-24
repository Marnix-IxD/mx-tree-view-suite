// import { ReactNode } from "react"; // Will be used when ReactNode types are needed
import { TreeNode, SelectionMode } from "../../types/TreeTypes";
import { ListWidgetValue, ListAttributeValue, ListExpressionValue, DynamicValue, WebIcon, ListValue } from "mendix";

export interface TreeViewProps {
    // Tree data
    nodes: TreeNode[];
    rootNodes: TreeNode[];
    nodeMap: Map<string, TreeNode>;
    expandedNodes: Set<string>;
    selectedNodes: Set<string>;
    visibleNodes: Set<string>;
    highlightedNodes: Set<string>;
    focusedNodeId: string | null;
    hoveredNodeId: string | null;
    isLoading: boolean;
    isUnavailable?: boolean;

    // Drag & Drop state
    draggedNodes?: TreeNode[];
    isDraggingOver?: string | null;
    dropPosition?: "before" | "inside" | "after" | null;

    // Search
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    clearSearch: () => void;
    isSearching: boolean;
    totalResultCount: number;
    showSearchResults: boolean;
    setShowSearchResults: (show: boolean) => void;
    searchResultsList: any[];
    currentPage: number;
    resultsPerPage: number;
    setCurrentPage: (page: number) => void;
    // Progressive search props
    isOffline?: boolean;
    isLoadingServer?: boolean;
    serverTimeout?: boolean;
    cachedResultCount?: number;

    // Handlers
    handleNodeClick: (node: TreeNode) => void;
    handleNodeHover: (node: TreeNode) => void;
    handleContextMenu: (e: React.MouseEvent, node: TreeNode) => void;
    toggleExpanded: (nodeId: string) => void;
    toggleVisibility: (nodeId: string) => void;
    handleSearchResultSelect: (nodeId: string) => void;
    handleBreadcrumbClick: (node: TreeNode) => void;
    getBreadcrumbPath: () => TreeNode[];

    // Drag & Drop handlers
    handleDragStart?: (e: React.DragEvent, node: TreeNode) => void;
    handleDragOver?: (e: React.DragEvent, node: TreeNode) => void;
    handleDragLeave?: (e: React.DragEvent) => void;
    handleDrop?: (e: React.DragEvent, node: TreeNode) => void;
    handleDragEnd?: (e: React.DragEvent) => void;

    // UI Configuration
    enableSearch: boolean;
    enableBreadcrumb: boolean;
    enableVisibilityToggle: boolean;
    enableDragDrop: boolean;
    selectionMode: SelectionMode;

    // Actions
    expandAll: () => void;
    collapseAll: () => void;
    expandToLevel: (level: number) => void;
    selectAll: () => void;
    clearSelection: () => void;

    // Render configuration
    nodeContent?: ListWidgetValue;

    // Node label configuration
    nodeLabelType: "attribute" | "expression" | "widget";
    nodeLabelAttribute?: ListAttributeValue<string>;
    nodeLabelExpression?: ListExpressionValue<string>;
    nodeLabelContent?: ListWidgetValue;

    indentSize: number;
    showLines: boolean;
    showIcons: boolean;
    stickyHeaderMode: "none" | "parent" | "category";
    stickyHeaderDisplay: "auto" | "path" | "closest";
    narrowScreenThreshold?: number;
    categoryAttribute?: ListAttributeValue<string>;
    categoryExpression?: ListExpressionValue<string>;
    showCategoryItemCount: boolean;
    virtualScrolling: boolean;
    itemHeight: number;
    overscan: number;

    // Icons
    searchIcon?: DynamicValue<WebIcon>;
    expandIcon?: DynamicValue<WebIcon>;
    collapseIcon?: DynamicValue<WebIcon>;

    // Search configuration
    searchPlaceholder?: string;
    visibilityOnIcon?: DynamicValue<WebIcon>;
    visibilityOffIcon?: DynamicValue<WebIcon>;
    unavailableDataIcon?: DynamicValue<WebIcon>;

    // Debug
    debugMode: boolean;
    renderMetrics: any;

    // Memory management
    updateViewport?: (visibleNodeIds: string[]) => void;

    // Progressive loading
    totalNodeCount?: number;
    enableVariableHeight?: boolean;

    // Sliding panel specific
    breadcrumbCaption?: string;
    enableTouchGestures?: boolean;

    // Core tree operations provided by parent
    treeOperations?: {
        expandPath: (nodeIds: string[]) => Promise<void>;
        ensureNodeLoaded: (nodeId: string) => Promise<void>;
        navigateToNode: (nodeId: string) => Promise<void>;
    };
}

export interface StandardTreeViewProps extends TreeViewProps {
    onPreloadRange?: (startStructureId: string, endStructureId: string) => void;
    onRequestNodeData?: (nodeIds: string[]) => void;
    onNodeDataLoaded?: (nodeIds: string[]) => void;
    onNodeLoadingError?: (nodeIds: string[], error: string) => void;
    selectedBranches?: Array<{
        branchSelection: string;
        deselectedAncestors: string[];
        deselectedDescendants: string[];
    }>;
    datasource?: ListValue;
}

export interface FloatingTreeViewProps extends TreeViewProps {
    // TODO ADD: Add floating-specific props like position, offset, maxWidth, maxHeight
}

export interface SlidingPanelViewProps extends TreeViewProps {
    breadcrumbCaption?: string;
    enableTouchGestures: boolean;
    onPreloadRange?: (startStructureId: string, endStructureId: string) => void;
    // TODO ADD: Add sliding-specific props like animationDuration, swipeThreshold
}
