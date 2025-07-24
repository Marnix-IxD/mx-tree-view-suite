import { ReactElement, createElement, useEffect, useRef, useState, useCallback, useMemo } from "react";
import { ValueStatus } from "mendix";
import { Big } from "big.js";

import type {
    TreeViewContextManagerContainerProps,
    ManagedTreeViewsType
} from "../typings/TreeViewContextManagerProps";
import "./ui/TreeViewContextManager.css";

// Constants
const DEFAULT_DEBOUNCE_DELAY = 50;
// const DEFAULT_BATCH_SIZE = 100; // Will be used when batch operations are implemented
const MAX_SELECTION_DISPLAY = 100;

// Types for internal state management
interface IManagedTree {
    id: string;
    identifier: string;
    displayName: string;
    element: HTMLElement | null;
    widget: any; // TODO FIX: [SEL-001d] Define proper interface for TreeView widget instance
    selectionCount: number;
    isActive: boolean;
    lastUpdate: Date | null;
}

interface ISelectionState {
    totalCount: number;
    treeSelections: Map<string, Set<string>>; // treeId -> Set of selected node IDs
    lastGlobalUpdate: Date;
    activeTreeId: string | null;
}

// TODO: [SEL-004a] Implement drag state interface when cross-tree drag & drop is added
// interface IDragState {
//     isDragging: boolean;
//     sourceTreeId: string | null;
//     draggedNodes: string[];
//     currentTarget: string | null;
//     dragPreview: HTMLElement | null;
// }

interface IBatchOperation {
    id: string;
    type: "move" | "copy" | "delete";
    status: "pending" | "processing" | "complete" | "error";
    progress: number;
    totalNodes: number;
    processedNodes: number;
    startTime: Date;
    endTime?: Date;
}

export function TreeViewContextManager(props: TreeViewContextManagerContainerProps): ReactElement {
    const {
        name,
        class: className,
        tabIndex,
        selectionMode,
        managedTreeViews,
        // treeViewNodeEntityType, // TODO: [SEL-001e] Use when implementing tree node entity operations
        // enableCrossTreeDragDrop, // TODO: [SEL-004a] Use when implementing drag physics
        debugMode,
        content,
        // State attributes
        totalSelectedCountAttribute,
        lastGlobalUpdateAttribute,
        activeTreeIdAttribute,
        globalSelectionStateAttribute,
        // Performance settings
        // viewportOptimization, // TODO: [SEL-005] Use when implementing viewport optimization
        // selectionQueryBatchSize, // TODO: [SEL-006] Use when implementing selection query batching
        selectionDebounceDelay,
        // Actions
        onAnySelectionChange
        // onAllSelectionsCleared, // TODO: [SEL-003] Use when implementing selection clearing
        // onActiveTreeChange, // TODO: [SEL-001d] Use when implementing tree focus handling
        // Drag & drop settings - TODO: [SEL-004a] Use when implementing drag physics
        // defaultDragDropMode,
        // orphanHandling,
        // showDragPreview // TODO: [SEL-007] Use when implementing drag preview visualization
        // maxDragPreviewItems,
        // dragFeedbackStyle,
        // enableHapticFeedback,
        // Batch processing - TODO: [SEL-002] Use when implementing batch operations
        // batchCommitThreshold,
        // batchProcessingDelay,
        // enableBackgroundProcessing
    } = props;

    // State management
    const [managedTrees, setManagedTrees] = useState<Map<string, IManagedTree>>(new Map());
    const [selectionState, setSelectionState] = useState<ISelectionState>({
        totalCount: 0,
        treeSelections: new Map(),
        lastGlobalUpdate: new Date(),
        activeTreeId: null
    });
    // TODO: [SEL-004a] Implement drag state when cross-tree drag & drop is added
    // const [dragState, _setDragState] = useState<IDragState>({
    //     isDragging: false,
    //     sourceTreeId: null,
    //     draggedNodes: [],
    //     currentTarget: null,
    //     dragPreview: null
    // });
    const [batchOperations, _setBatchOperations] = useState<Map<string, IBatchOperation>>(new Map());

    // Refs for performance optimization
    const containerRef = useRef<HTMLDivElement>(null);
    const pendingUpdatesRef = useRef<Set<string>>(new Set());
    const updateDebounceRef = useRef<number>();
    const performanceMetricsRef = useRef({
        selectionUpdates: 0,
        batchOperations: 0,
        lastUpdateTime: Date.now()
    });

    // Helper function to find tree elements
    const findTreeElements = useCallback((): HTMLElement[] => {
        if (!containerRef.current) {
            return [];
        }

        const elements: HTMLElement[] = [];

        // Look for tree views by configured identifiers
        managedTreeViews.forEach(config => {
            if (config.treeIdentifier) {
                // Try by class name first
                // TODO REVIEW TOMORROW - querySelector with dynamic class selector could fail if treeIdentifier contains special characters
                // Should escape the identifier or validate it first
                const byClass = containerRef.current!.querySelector(`.${config.treeIdentifier}`);
                if (byClass instanceof HTMLElement) {
                    elements.push(byClass);
                    return;
                }

                // Try by data attribute
                const byData = containerRef.current!.querySelector(`[data-tree-id="${config.treeIdentifier}"]`);
                if (byData instanceof HTMLElement) {
                    elements.push(byData);
                    return;
                }

                // Try by widget name
                const byWidget = containerRef.current!.querySelector(`[data-widget-name="${config.treeIdentifier}"]`);
                if (byWidget instanceof HTMLElement) {
                    elements.push(byWidget);
                }
            }
        });

        return elements;
    }, [managedTreeViews]);

    // TODO: [SEL-001d] Add viewport optimization when tree widget provides viewport info
    // Note: With ReferenceSetValue, we get the selected node IDs directly from the association

    // Update global attributes
    const updateGlobalAttributes = useCallback(() => {
        // Total selected count
        if (totalSelectedCountAttribute?.status === ValueStatus.Available) {
            totalSelectedCountAttribute.setValue(Big(selectionState.totalCount));
        }

        // Last global update
        if (lastGlobalUpdateAttribute?.status === ValueStatus.Available) {
            lastGlobalUpdateAttribute.setValue(selectionState.lastGlobalUpdate);
        }

        // Active tree ID
        if (activeTreeIdAttribute?.status === ValueStatus.Available && selectionState.activeTreeId) {
            activeTreeIdAttribute.setValue(selectionState.activeTreeId);
        }

        // Global selection state (JSON)
        if (globalSelectionStateAttribute?.status === ValueStatus.Available) {
            const stateJson = JSON.stringify({
                totalCount: selectionState.totalCount,
                trees: Array.from(selectionState.treeSelections.entries()).map(([treeId, selections]) => ({
                    treeId,
                    count: selections.size,
                    selections: Array.from(selections).slice(0, MAX_SELECTION_DISPLAY)
                })),
                lastUpdate: selectionState.lastGlobalUpdate.toISOString()
            });
            globalSelectionStateAttribute.setValue(stateJson);
        }
    }, [
        selectionState,
        totalSelectedCountAttribute,
        lastGlobalUpdateAttribute,
        activeTreeIdAttribute,
        globalSelectionStateAttribute
    ]);

    // Process pending selection updates
    const processPendingSelectionUpdates = useCallback(async () => {
        const updates = Array.from(pendingUpdatesRef.current);
        pendingUpdatesRef.current.clear();

        // Process each tree's selection update
        for (const treeId of updates) {
            const treeIndex = parseInt(treeId.split("-")[1], 10);
            const treeConfig = managedTreeViews[treeIndex];
            if (!treeConfig || !treeConfig.selectionAssociation) {
                continue;
            }

            try {
                // Get selected node IDs from the association value
                // TODO REVIEW TOMORROW - CRITICAL: Accessing .value without null check could crash
                // treeConfig.selectionAssociation could be undefined/null if widget hasn't loaded yet
                const selectedObjects = treeConfig.selectionAssociation?.value || [];
                // Extract GUIDs from ObjectItem objects
                const selectedNodeIds = selectedObjects.map(obj => obj.id);

                // Update selection state
                setSelectionState(prev => {
                    const newState = { ...prev };
                    newState.treeSelections.set(treeId, new Set(selectedNodeIds));
                    newState.totalCount = Array.from(newState.treeSelections.values()).reduce(
                        (sum, set) => sum + set.size,
                        0
                    );
                    newState.lastGlobalUpdate = new Date();
                    return newState;
                });

                // Update tree's selection count
                if (treeConfig.selectedCountAttribute?.status === ValueStatus.Available) {
                    treeConfig.selectedCountAttribute.setValue(Big(selectedObjects.length));
                }

                // Update last update time
                if (treeConfig.lastUpdateAttribute?.status === ValueStatus.Available) {
                    treeConfig.lastUpdateAttribute.setValue(new Date());
                }
            } catch (error) {
                if (debugMode) {
                    console.error(`[TreeViewContextManager] Error processing selection update for ${treeId}:`, error);
                }
            }
        }

        // Update global attributes
        updateGlobalAttributes();

        // Trigger global action
        if (onAnySelectionChange?.canExecute) {
            onAnySelectionChange.execute();
        }

        // Update performance metrics
        performanceMetricsRef.current.selectionUpdates++;
    }, [managedTreeViews, onAnySelectionChange, updateGlobalAttributes, debugMode]);

    // Handle selection changes with debouncing
    const handleSelectionChange = useCallback(
        (treeId: string, _treeConfig: ManagedTreeViewsType) => {
            // Add to pending updates
            pendingUpdatesRef.current.add(treeId);

            // Clear existing debounce
            if (updateDebounceRef.current) {
                window.clearTimeout(updateDebounceRef.current);
            }

            // Debounce updates
            updateDebounceRef.current = window.setTimeout(() => {
                processPendingSelectionUpdates();
            }, selectionDebounceDelay || DEFAULT_DEBOUNCE_DELAY);
        },
        [selectionDebounceDelay, processPendingSelectionUpdates]
    );

    // TODO: [SEL-001d] Implement tree focus handling when connecting to tree widget events
    // const _handleTreeFocus = useCallback(
    //     (treeId: string) => {
    //         setSelectionState(prev => ({
    //             ...prev,
    //             activeTreeId: treeId
    //         }));

    //         // Update active tree in managed trees
    //         setManagedTrees(prev => {
    //             const newTrees = new Map(prev);
    //             newTrees.forEach((tree, id) => {
    //                 tree.isActive = id === treeId;
    //             });
    //             return newTrees;
    //         });

    //         // Trigger action
    //         if (onActiveTreeChange?.canExecute) {
    //             onActiveTreeChange.execute();
    //         }
    //     },
    //     [onActiveTreeChange]
    // );

    // Tree detection and registration effect
    useEffect(() => {
        if (!containerRef.current) {
            return;
        }

        const detectAndRegisterTrees = (): void => {
            const treeElements = findTreeElements();
            const newTrees = new Map<string, IManagedTree>();

            treeElements.forEach((element, index) => {
                const config = managedTreeViews[index];
                if (!config) {
                    return;
                }

                const tree: IManagedTree = {
                    id: `tree-${index}`,
                    identifier: config.treeIdentifier,
                    displayName: config.displayName || config.treeIdentifier || `Tree ${index + 1}`,
                    element,
                    widget: null, // Will be set when we implement widget detection
                    selectionCount: 0,
                    isActive: false,
                    lastUpdate: null
                };

                newTrees.set(tree.id, tree);
            });

            setManagedTrees(newTrees);

            // Log detection in debug mode
            if (debugMode) {
                console.debug(`[TreeViewContextManager] Detected ${newTrees.size} tree views`);
            }
        };

        // Initial detection
        detectAndRegisterTrees();

        // Set up mutation observer for dynamic tree additions/removals
        const observer = new MutationObserver(() => {
            detectAndRegisterTrees();
        });

        observer.observe(containerRef.current, {
            childList: true,
            subtree: true
        });

        return () => {
            observer.disconnect();
        };
    }, [managedTreeViews, debugMode, findTreeElements]);

    // Create a stable string representation of selection associations for dependency tracking
    const selectionAssociationsKey = useMemo(
        () => managedTreeViews.map(config => config.selectionAssociation?.value?.toString() || "").join(","),
        [managedTreeViews]
    );

    // Monitor selection changes effect
    useEffect(() => {
        if (selectionMode === "none") {
            return;
        }

        // Process selection changes for each tree
        managedTreeViews.forEach((treeConfig, index) => {
            if (!treeConfig.selectionAssociation) {
                return;
            }

            // Trigger selection change handler
            // The ReferenceSetValue will trigger re-renders automatically when changed
            handleSelectionChange(`tree-${index}`, treeConfig);
        });
    }, [managedTreeViews, selectionMode, handleSelectionChange, selectionAssociationsKey]);

    // Render performance overlay if debug mode is enabled
    const renderDebugOverlay = useCallback(() => {
        if (!debugMode) {
            return null;
        }

        return (
            <div className="context-manager-debug-overlay">
                <h4>Performance Metrics</h4>
                <div className="debug-metrics">
                    <div className="metric">
                        <span className="label">Trees:</span>
                        <span className="value">{managedTrees.size}</span>
                    </div>
                    <div className="metric">
                        <span className="label">Total Selected:</span>
                        <span className="value">{selectionState.totalCount}</span>
                    </div>
                    <div className="metric">
                        <span className="label">Selection Updates:</span>
                        <span className="value">{performanceMetricsRef.current.selectionUpdates}</span>
                    </div>
                    <div className="metric">
                        <span className="label">Batch Operations:</span>
                        <span className="value">{batchOperations.size}</span>
                    </div>
                    <div className="metric">
                        <span className="label">Active Tree:</span>
                        <span className="value">{selectionState.activeTreeId || "none"}</span>
                    </div>
                </div>
                <div className="debug-trees">
                    <h5>Managed Trees</h5>
                    {Array.from(managedTrees.values()).map(tree => (
                        <div key={tree.id} className={`debug-tree ${tree.isActive ? "active" : ""}`}>
                            <span className="tree-name">{tree.displayName}</span>
                            <span className="tree-selections">
                                {selectionState.treeSelections.get(tree.id)?.size || 0} selected
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }, [debugMode, managedTrees, selectionState, batchOperations]);

    return (
        <div
            ref={containerRef}
            className={`tree-view-context-manager ${className || ""}`}
            tabIndex={tabIndex}
            data-widget-name={name}
        >
            {/* Render child widgets (tree views) */}
            {content}

            {/* Drag preview - TODO ADD: [SEL-004a] Implement proper drag preview with drag physics */}
            {/* TODO FIX: Remove display:none and implement actual drag preview positioning */}
            {/* TODO ADD: Show dragged node count and preview of first few nodes */}
            {/* {dragState.isDragging && showDragPreview && <div className="drag-preview" style={{ display: "none" }} />} */}

            {/* Debug overlay */}
            {renderDebugOverlay()}
        </div>
    );
}
