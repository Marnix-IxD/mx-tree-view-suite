/**
 * This file was generated from TreeViewContextManager.xml
 * WARNING: All changes made to this file will be overwritten
 * @author Mendix Widgets Framework Team
 */
import { ComponentType, CSSProperties, ReactNode } from "react";
import { ActionValue, DynamicValue, EditableValue, ListValue, ReferenceSetValue } from "mendix";
import { Big } from "big.js";

export type SelectionModeEnum = "none" | "single" | "multiple";

export type TreeSelectionModeEnum = "none" | "single" | "multiple";

export type DragRestrictionEnum = "none" | "horizontal" | "vertical" | "toTarget";

export type DragDirectionBiasEnum = "none" | "left" | "right" | "up" | "down";

export interface ManagedTreeViewsType {
    treeIdentifier: string;
    displayName: string;
    selectionAssociation: ReferenceSetValue;
    overrideSelectionMode: boolean;
    treeSelectionMode: TreeSelectionModeEnum;
    maxSelectionCount: number;
    selectedCountAttribute?: EditableValue<Big>;
    lastUpdateAttribute?: EditableValue<Date>;
    isActiveAttribute?: EditableValue<boolean>;
    treeContainerClass?: DynamicValue<string>;
    treeLayoutWeight: number;
    onSelectionChange?: ActionValue;
    onMaxSelectionReached?: ActionValue;
    beforeSelectionChange?: ActionValue;
    allowDragFrom: boolean;
    allowDropTo: boolean;
    allowedDropSources?: DynamicValue<string>;
    dragRestriction: DragRestrictionEnum;
    allowReverseTransfer: boolean;
    restrictDragDistance: number;
    dragDirectionBias: DragDirectionBiasEnum;
    biasResistance: Big;
    biasElasticity: boolean;
    dropZoneHighlightColor?: DynamicValue<string>;
    magneticDropZones: boolean;
    magneticRange: number;
}

export type DefaultDragDropModeEnum = "move" | "copy" | "ask";

export type OrphanHandlingEnum = "includeDescendants" | "excludeDescendants" | "promoteOrphans";

export type DragFeedbackStyleEnum = "minimal" | "modern" | "playful";

export type LogLevelEnum = "none" | "error" | "warn" | "info" | "debug";

export type SubscriptionStrategyEnum = "eager" | "lazy" | "smart";

export interface ManagedTreeViewsPreviewType {
    treeIdentifier: string;
    displayName: string;
    selectionAssociation: string;
    overrideSelectionMode: boolean;
    treeSelectionMode: TreeSelectionModeEnum;
    maxSelectionCount: number | null;
    selectedCountAttribute: string;
    lastUpdateAttribute: string;
    isActiveAttribute: string;
    treeContainerClass: string;
    treeLayoutWeight: number | null;
    onSelectionChange: {} | null;
    onMaxSelectionReached: {} | null;
    beforeSelectionChange: {} | null;
    allowDragFrom: boolean;
    allowDropTo: boolean;
    allowedDropSources: string;
    dragRestriction: DragRestrictionEnum;
    allowReverseTransfer: boolean;
    restrictDragDistance: number | null;
    dragDirectionBias: DragDirectionBiasEnum;
    biasResistance: number | null;
    biasElasticity: boolean;
    dropZoneHighlightColor: string;
    magneticDropZones: boolean;
    magneticRange: number | null;
}

export interface TreeViewContextManagerContainerProps {
    name: string;
    class: string;
    style?: CSSProperties;
    tabIndex?: number;
    content: ReactNode;
    treeViewNodeEntityType: ListValue;
    selectionMode: SelectionModeEnum;
    managedTreeViews: ManagedTreeViewsType[];
    totalSelectedCountAttribute?: EditableValue<Big>;
    lastGlobalUpdateAttribute?: EditableValue<Date>;
    activeTreeIdAttribute?: EditableValue<string>;
    globalSelectionStateAttribute?: EditableValue<string>;
    onAnySelectionChange?: ActionValue;
    onAllSelectionsCleared?: ActionValue;
    onActiveTreeChange?: ActionValue;
    focusedNodeIdAttribute?: EditableValue<string>;
    hoveredNodeIdAttribute?: EditableValue<string>;
    focusedTreeIdAttribute?: EditableValue<string>;
    commandQueueAttribute?: EditableValue<string>;
    commandTimestampAttribute?: EditableValue<Date>;
    batchOperationStatusAttribute?: EditableValue<string>;
    batchProgressAttribute?: EditableValue<Big>;
    currentBatchIdAttribute?: EditableValue<string>;
    enableCrossTreeDragDrop: boolean;
    defaultDragDropMode: DefaultDragDropModeEnum;
    orphanHandling: OrphanHandlingEnum;
    showDragPreview: boolean;
    maxDragPreviewItems: number;
    showDropZoneIndicators: boolean;
    dropZoneHighlightDelay: number;
    dragFeedbackStyle: DragFeedbackStyleEnum;
    enableHapticFeedback: boolean;
    beforeAnyTransfer?: ActionValue;
    onAnyTransfer?: ActionValue;
    onTransferError?: ActionValue;
    onBatchTransferComplete?: ActionValue;
    viewportOptimization: boolean;
    selectionQueryBatchSize: number;
    selectionDebounceDelay: number;
    maxCachedSelections: number;
    progressiveLoadThreshold: number;
    prefetchMultiplier: Big;
    memoryCleanupInterval: number;
    batchCommitThreshold: number;
    batchProcessingDelay: number;
    enableBackgroundProcessing: boolean;
    debugMode: boolean;
    logLevel: LogLevelEnum;
    performanceOverlay: boolean;
    subscriptionStrategy: SubscriptionStrategyEnum;
    enableWebWorkers: boolean;
    containerClass?: DynamicValue<string>;
}

export interface TreeViewContextManagerPreviewProps {
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
    content: { widgetCount: number; renderer: ComponentType<{ children: ReactNode; caption?: string }> };
    treeViewNodeEntityType: {} | { caption: string } | { type: string } | null;
    selectionMode: SelectionModeEnum;
    managedTreeViews: ManagedTreeViewsPreviewType[];
    totalSelectedCountAttribute: string;
    lastGlobalUpdateAttribute: string;
    activeTreeIdAttribute: string;
    globalSelectionStateAttribute: string;
    onAnySelectionChange: {} | null;
    onAllSelectionsCleared: {} | null;
    onActiveTreeChange: {} | null;
    focusedNodeIdAttribute: string;
    hoveredNodeIdAttribute: string;
    focusedTreeIdAttribute: string;
    commandQueueAttribute: string;
    commandTimestampAttribute: string;
    batchOperationStatusAttribute: string;
    batchProgressAttribute: string;
    currentBatchIdAttribute: string;
    enableCrossTreeDragDrop: boolean;
    defaultDragDropMode: DefaultDragDropModeEnum;
    orphanHandling: OrphanHandlingEnum;
    showDragPreview: boolean;
    maxDragPreviewItems: number | null;
    showDropZoneIndicators: boolean;
    dropZoneHighlightDelay: number | null;
    dragFeedbackStyle: DragFeedbackStyleEnum;
    enableHapticFeedback: boolean;
    beforeAnyTransfer: {} | null;
    onAnyTransfer: {} | null;
    onTransferError: {} | null;
    onBatchTransferComplete: {} | null;
    viewportOptimization: boolean;
    selectionQueryBatchSize: number | null;
    selectionDebounceDelay: number | null;
    maxCachedSelections: number | null;
    progressiveLoadThreshold: number | null;
    prefetchMultiplier: number | null;
    memoryCleanupInterval: number | null;
    batchCommitThreshold: number | null;
    batchProcessingDelay: number | null;
    enableBackgroundProcessing: boolean;
    debugMode: boolean;
    logLevel: LogLevelEnum;
    performanceOverlay: boolean;
    subscriptionStrategy: SubscriptionStrategyEnum;
    enableWebWorkers: boolean;
    containerClass: string;
}
