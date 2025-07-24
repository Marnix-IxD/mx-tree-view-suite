import {
    ObjectItem,
    ListValue,
    ListAttributeValue,
    ListExpressionValue,
    ListWidgetValue,
    ListReferenceValue,
    ListReferenceSetValue,
    ActionValue,
    EditableValue
} from "mendix";
import { Big } from "big.js";
import { RefObject } from "react";

export interface TreeNode {
    id: string;
    parentId: string | null;
    objectItem: ObjectItem;
    children: TreeNode[];
    level: number;
    path: string[];
    isLeaf: boolean;
    isVisible: boolean;
    isExpanded: boolean;
    structureId?: string;
    sortValue?: string | number | boolean | Big;
    sortOrder?: number; // Absolute position in fully expanded tree
    label?: string;
    hasChildren?: boolean;
    _generatedStructureId?: boolean; // Internal flag to track generated IDs
    isSkeleton?: boolean; // True when node data is offloaded
    loadingState?: "idle" | "loading" | "loaded" | "error"; // Loading state for transitions
    loadingProgress?: number; // 0-100 for determinate progress
}

export interface TreeNodeMap {
    [key: string]: TreeNode;
}

export type ParentRelationType = "attribute" | "association" | "structureId";
export type SearchMode = "client" | "server" | "hybrid";
export type SelectionMode = "none" | "single" | "multi" | "branch" | "path";
export type ExpandMode = "single" | "multiple";
export type SelectionOutputType = "guids" | "attributes" | "structureIds";

export interface TreeState {
    expandedNodes: Set<string>;
    selectedNodes: Set<string>;
    visibleNodes: Set<string>;
    focusedNodeId: string | null;
    searchQuery: string;
    searchResults: Set<string>;
}

export interface TreeAction {
    type: TreeActionType;
    payload: {
        nodeId?: string;
        nodeIds?: string[];
        level?: number;
        query?: string;
        results?: Set<string>;
        [key: string]: unknown;
    };
    timestamp: number;
}

export type TreeActionType =
    | "TOGGLE_EXPANDED"
    | "TOGGLE_VISIBILITY"
    | "SELECT_NODE"
    | "CLEAR_SELECTION"
    | "SET_SEARCH_QUERY"
    | "SET_SEARCH_RESULTS"
    | "EXPAND_ALL"
    | "COLLAPSE_ALL"
    | "EXPAND_TO_LEVEL";

export interface SearchResult {
    nodeId: string;
    matches: SearchMatch[];
}

export interface SearchMatch {
    attribute: string;
    value: string;
    matchedText: string;
    startIndex: number;
    endIndex: number;
}

export interface TreeDataHookProps {
    datasource: ListValue;
    nodeIdAttribute: ListAttributeValue<string | Big>;
    parentRelationType: ParentRelationType;
    parentIdAttribute?: ListAttributeValue<string | Big>;
    parentAssociation?: ListReferenceValue | ListReferenceSetValue;
    structureIdAttribute?: ListAttributeValue<string>;
    sortOrderAttribute: ListAttributeValue<Big>;
    visibilityAttribute?: ListAttributeValue<boolean>;
    defaultExpandLevel: number;
    dataLoadingMode?: "all" | "progressive" | "onDemand";
    levelAttribute: ListAttributeValue<Big>;
    initialLoadLimit?: number;
    debugMode?: boolean;
}

export interface TreeStateHookProps {
    nodes: TreeNode[];
    nodeMap: Map<string, TreeNode>;
    expandMode: ExpandMode;
    enableVisibilityToggle: boolean;
    visibilityAttribute?: ListAttributeValue<boolean>;
    onVisibilityChange?: ActionValue;
    getDescendantIds?: (nodeId: string) => string[];
}

export interface TreeSearchHookProps {
    nodes: TreeNode[];
    nodeMap: Map<string, TreeNode>;
    searchMode: SearchMode;
    serverSearchAction?: ActionValue;
    searchDebounce: number;
    expandedNodes: Set<string>;
    toggleExpanded: (nodeId: string) => void;
    debugMode?: boolean;
}

export interface TreeSelectionHookProps {
    nodes: TreeNode[];
    nodeMap: Map<string, TreeNode>;
    selectionMode: SelectionMode;
    selectionOutputType: SelectionOutputType;
    serverSideSelectionsJSONAttribute?: EditableValue<string>;
    onSelectionChange?: ActionValue;
}

export interface TreeKeyboardHookProps {
    containerRef: RefObject<HTMLDivElement>;
    nodes: TreeNode[];
    nodeMap: Map<string, TreeNode>;
    expandedNodes: Set<string>;
    selectedNodes: Set<string>;
    focusedNodeId: string | null;
    setFocusedNodeId: (nodeId: string | null) => void;
    toggleExpanded: (nodeId: string) => void;
    toggleSelection: (nodeId: string) => void;
    selectNode: (nodeId: string) => void;
    clearSelection: () => void;
    enabled: boolean;
    isNodeSelected?: (nodeId: string) => boolean;
    selectionMode: SelectionMode;
    // Node label configuration for type-ahead search
    nodeLabelType?: "attribute" | "expression" | "widget";
    nodeLabelAttribute?: ListAttributeValue<string>;
    nodeLabelExpression?: ListExpressionValue<string>;
    nodeLabelContent?: ListWidgetValue;
}

export interface VirtualizerItem {
    index: number;
    start: number;
    size: number;
    node: TreeNode;
}

export interface VirtualizerState {
    scrollTop: number;
    containerHeight: number;
    virtualItems: VirtualizerItem[];
    totalSize: number;
    startIndex: number;
    endIndex: number;
}

export interface ContextMenuAction {
    label: string;
    icon?: string;
    action: () => void;
    disabled?: boolean;
    separator?: boolean;
}

// Branch-based selection model interfaces
export interface ITreeBranch {
    branchSelection: string; // Structure ID of the selected branch (e.g., "1.1.")
    deselectedAncestors: string[]; // Array of ancestor structure IDs that are deselected (e.g., ["1."])
    deselectedDescendants: string[]; // Array of descendant structure IDs that are deselected (e.g., ["1.1.1.", "1.1.2."])
}

export interface ITreeItem {
    structureId: string; // Structure ID of the selected item
    treeItemId: string; // Node ID (aligns with Mendix TreeItemID naming)
    level: number; // Tree depth (0 = root, 1 = first level, etc.)
    sortOrder?: number; // Linear position in flattened tree (like line number)
}

export type BranchSelectionMode = "legacy" | "branch";

export interface BranchSelectionState {
    mode: BranchSelectionMode;
    // For legacy mode
    selectedIds?: Set<string>;
    // For branch mode
    branches?: ITreeBranch[];
    // For single selection mode
    singleSelection?: ITreeItem;
}
