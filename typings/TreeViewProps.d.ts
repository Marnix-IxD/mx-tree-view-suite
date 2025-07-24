/**
 * This file was generated from TreeView.xml
 * WARNING: All changes made to this file will be overwritten
 * @author Mendix Widgets Framework Team
 */
import { ComponentType, CSSProperties, ReactNode } from "react";
import { ActionValue, DynamicValue, EditableValue, ListValue, ListAttributeValue, ListExpressionValue, ListReferenceValue, ListWidgetValue, ReferenceValue, ReferenceSetValue, SelectionSingleValue, SelectionMultiValue, WebIcon } from "mendix";
import { Big } from "big.js";

export type DataLoadingModeEnum = "all" | "progressive" | "onDemand";

export type ParentRelationTypeEnum = "attribute" | "association" | "structureId";

export type NodeLabelTypeEnum = "attribute" | "expression" | "widget";

export type DisplayAsEnum = "standard" | "floating" | "sliding";

export type DisplayAsXSEnum = "default" | "standard" | "sliding";

export type DisplayAsSMEnum = "default" | "standard" | "sliding";

export type DisplayAsMDEnum = "default" | "standard" | "floating" | "sliding";

export type StickyHeaderModeEnum = "none" | "parent" | "category";

export type StickyHeaderDisplayEnum = "auto" | "path" | "closest";

export type SearchModeEnum = "client" | "server" | "hybrid";

export interface FilterListType {
    filter: ListAttributeValue<string | Big | boolean | Date>;
}

export type SelectionModeEnum = "none" | "single" | "multi" | "branch" | "path";

export type SelectionStorageMethodEnum = "association" | "asyncApi";

export type SelectionOutputTypeEnum = "guids" | "attributes" | "structureIds";

export interface ContextMenuActionsType {
    label: DynamicValue<string>;
    action?: ActionValue;
}

export type ExpandModeEnum = "single" | "multiple";

export interface FilterListPreviewType {
    filter: string;
}

export interface ContextMenuActionsPreviewType {
    label: string;
    action: {} | null;
}

export interface TreeViewContainerProps {
    name: string;
    class: string;
    style?: CSSProperties;
    tabIndex?: number;
    datasource: ListValue;
    dataLoadingMode: DataLoadingModeEnum;
    cacheTimeout: number;
    initialLoadLimit: number;
    nodeIdAttribute: ListAttributeValue<string | Big>;
    levelAttribute: ListAttributeValue<Big>;
    sortOrderAttribute: ListAttributeValue<Big>;
    hasChildrenAttribute?: ListAttributeValue<boolean>;
    childCountAttribute?: ListAttributeValue<Big>;
    parentRelationType: ParentRelationTypeEnum;
    parentIdAttribute?: ListAttributeValue<string | Big>;
    parentAssociation?: ListReferenceValue;
    structureIdAttribute?: ListAttributeValue<string>;
    nodeLabelType: NodeLabelTypeEnum;
    nodeLabelAttribute?: ListAttributeValue<string>;
    nodeLabelExpression?: ListExpressionValue<string>;
    nodeLabelContent?: ListWidgetValue;
    displayAs: DisplayAsEnum;
    displayAsXS: DisplayAsXSEnum;
    displayAsSM: DisplayAsSMEnum;
    displayAsMD: DisplayAsMDEnum;
    indentSize: number;
    showLines: boolean;
    showIcons: boolean;
    nodeContent?: ListWidgetValue;
    expandIcon?: DynamicValue<WebIcon>;
    collapseIcon?: DynamicValue<WebIcon>;
    visibilityOnIcon?: DynamicValue<WebIcon>;
    visibilityOffIcon?: DynamicValue<WebIcon>;
    searchIcon?: DynamicValue<WebIcon>;
    unavailableDataIcon?: DynamicValue<WebIcon>;
    categoryAttribute?: ListAttributeValue<string>;
    categoryExpression?: ListExpressionValue<string>;
    showCategoryItemCount: boolean;
    stickyHeaderMode: StickyHeaderModeEnum;
    stickyHeaderDisplay: StickyHeaderDisplayEnum;
    enableSearch: boolean;
    searchPlaceholder?: DynamicValue<string>;
    searchMode: SearchModeEnum;
    searchResultsAsOverlay: boolean;
    searchDebounce: number;
    searchMinCharacters: number;
    searchScalingDelay: boolean;
    serverSearchAction?: ActionValue;
    filterList: FilterListType[];
    filtersPlaceholder?: ReactNode;
    selectionMode: SelectionModeEnum;
    selectionStorageMethod: SelectionStorageMethodEnum;
    selectionsAssociation?: ReferenceValue | ReferenceSetValue;
    nativeSelection: SelectionSingleValue | SelectionMultiValue;
    serverSideSelectionsJSONAttribute?: EditableValue<string>;
    selectionOutputType: SelectionOutputTypeEnum;
    allowDeselectingAncestors: boolean;
    allowDeselectingDescendants: boolean;
    onNodeClick?: ActionValue;
    onSelectionChange?: ActionValue;
    onNodeHover?: ActionValue;
    contextMenuActions: ContextMenuActionsType[];
    enableVisibilityToggle: boolean;
    visibilityAttribute?: ListAttributeValue<boolean>;
    onVisibilityChange?: ActionValue;
    expandMode: ExpandModeEnum;
    defaultExpandLevel: number;
    enableDragDrop: boolean;
    dragMaxChildren: number;
    dragMaxDepth: number;
    dragPatterns: string;
    dragDropConfirmLabel?: DynamicValue<string>;
    dragDropCancelLabel?: DynamicValue<string>;
    dragDropConfirmContent?: ListWidgetValue;
    dragDropStatusAttribute?: EditableValue<string>;
    selectedNodeIdAttribute?: EditableValue<string>;
    selectedStructureIdAttribute?: EditableValue<string>;
    focusedNodeIdAttribute?: EditableValue<string>;
    focusedStructureIdAttribute?: EditableValue<string>;
    hoveredNodeIdAttribute?: EditableValue<string>;
    hoveredStructureIdAttribute?: EditableValue<string>;
    dragDropEndpoint: string;
    searchEndpoint: string;
    stateEndpoint: string;
    virtualScrolling: boolean;
    itemHeight: number;
    overscan: number;
    enableHoverServerUpdates: boolean;
    hoverVelocityThreshold: number;
    hoverIntentDelay: number;
    enableKeyboardNavigation: boolean;
    enableBreadcrumb: boolean;
    breadcrumbCaption?: ListExpressionValue<string>;
    debugMode: boolean;
}

export interface TreeViewPreviewProps {
    /**
     * @deprecated Deprecated since version 9.18.0. Please use class property instead.
     */
    className: string;
    class: string;
    style: string;
    styleObject?: CSSProperties;
    readOnly: boolean;
    renderMode: "design" | "xray" | "structure";
    translate: (text: string) => string;
    datasource: {} | { caption: string } | { type: string } | null;
    dataLoadingMode: DataLoadingModeEnum;
    cacheTimeout: number | null;
    initialLoadLimit: number | null;
    nodeIdAttribute: string;
    levelAttribute: string;
    sortOrderAttribute: string;
    hasChildrenAttribute: string;
    childCountAttribute: string;
    parentRelationType: ParentRelationTypeEnum;
    parentIdAttribute: string;
    parentAssociation: string;
    structureIdAttribute: string;
    nodeLabelType: NodeLabelTypeEnum;
    nodeLabelAttribute: string;
    nodeLabelExpression: string;
    nodeLabelContent: { widgetCount: number; renderer: ComponentType<{ children: ReactNode; caption?: string }> };
    displayAs: DisplayAsEnum;
    displayAsXS: DisplayAsXSEnum;
    displayAsSM: DisplayAsSMEnum;
    displayAsMD: DisplayAsMDEnum;
    indentSize: number | null;
    showLines: boolean;
    showIcons: boolean;
    nodeContent: { widgetCount: number; renderer: ComponentType<{ children: ReactNode; caption?: string }> };
    expandIcon: { type: "glyph"; iconClass: string; } | { type: "image"; imageUrl: string; iconUrl: string; } | { type: "icon"; iconClass: string; } | undefined;
    collapseIcon: { type: "glyph"; iconClass: string; } | { type: "image"; imageUrl: string; iconUrl: string; } | { type: "icon"; iconClass: string; } | undefined;
    visibilityOnIcon: { type: "glyph"; iconClass: string; } | { type: "image"; imageUrl: string; iconUrl: string; } | { type: "icon"; iconClass: string; } | undefined;
    visibilityOffIcon: { type: "glyph"; iconClass: string; } | { type: "image"; imageUrl: string; iconUrl: string; } | { type: "icon"; iconClass: string; } | undefined;
    searchIcon: { type: "glyph"; iconClass: string; } | { type: "image"; imageUrl: string; iconUrl: string; } | { type: "icon"; iconClass: string; } | undefined;
    unavailableDataIcon: { type: "glyph"; iconClass: string; } | { type: "image"; imageUrl: string; iconUrl: string; } | { type: "icon"; iconClass: string; } | undefined;
    categoryAttribute: string;
    categoryExpression: string;
    showCategoryItemCount: boolean;
    stickyHeaderMode: StickyHeaderModeEnum;
    stickyHeaderDisplay: StickyHeaderDisplayEnum;
    enableSearch: boolean;
    searchPlaceholder: string;
    searchMode: SearchModeEnum;
    searchResultsAsOverlay: boolean;
    searchDebounce: number | null;
    searchMinCharacters: number | null;
    searchScalingDelay: boolean;
    serverSearchAction: {} | null;
    filterList: FilterListPreviewType[];
    filtersPlaceholder: { widgetCount: number; renderer: ComponentType<{ children: ReactNode; caption?: string }> };
    selectionMode: SelectionModeEnum;
    selectionStorageMethod: SelectionStorageMethodEnum;
    selectionsAssociation: string;
    nativeSelection: "Single" | "Multi";
    serverSideSelectionsJSONAttribute: string;
    selectionOutputType: SelectionOutputTypeEnum;
    allowDeselectingAncestors: boolean;
    allowDeselectingDescendants: boolean;
    onNodeClick: {} | null;
    onSelectionChange: {} | null;
    onNodeHover: {} | null;
    contextMenuActions: ContextMenuActionsPreviewType[];
    enableVisibilityToggle: boolean;
    visibilityAttribute: string;
    onVisibilityChange: {} | null;
    expandMode: ExpandModeEnum;
    defaultExpandLevel: number | null;
    enableDragDrop: boolean;
    dragMaxChildren: number | null;
    dragMaxDepth: number | null;
    dragPatterns: string;
    dragDropConfirmLabel: string;
    dragDropCancelLabel: string;
    dragDropConfirmContent: { widgetCount: number; renderer: ComponentType<{ children: ReactNode; caption?: string }> };
    dragDropStatusAttribute: string;
    selectedNodeIdAttribute: string;
    selectedStructureIdAttribute: string;
    focusedNodeIdAttribute: string;
    focusedStructureIdAttribute: string;
    hoveredNodeIdAttribute: string;
    hoveredStructureIdAttribute: string;
    dragDropEndpoint: string;
    searchEndpoint: string;
    stateEndpoint: string;
    virtualScrolling: boolean;
    itemHeight: number | null;
    overscan: number | null;
    enableHoverServerUpdates: boolean;
    hoverVelocityThreshold: number | null;
    hoverIntentDelay: number | null;
    enableKeyboardNavigation: boolean;
    enableBreadcrumb: boolean;
    breadcrumbCaption: string;
    debugMode: boolean;
}
