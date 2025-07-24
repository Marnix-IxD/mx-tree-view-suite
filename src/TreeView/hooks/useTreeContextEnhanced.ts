import { useEffect, useRef, useCallback } from "react";
import { EditableValue } from "mendix";
import { ITreeBranch, ITreeItem } from "../types/TreeTypes";

interface TreeContextEnhancedProps {
    // Attributes for storing state (may be undefined if not configured)
    selectedPartIdAttribute?: EditableValue<string>;
    selectedStructureIdAttribute?: EditableValue<string>;
    focusedPartIdAttribute?: EditableValue<string>;
    focusedStructureIdAttribute?: EditableValue<string>;
    hoveredPartIdAttribute?: EditableValue<string>;
    hoveredStructureIdAttribute?: EditableValue<string>;

    // Selection mode configuration
    selectionMode: "none" | "single" | "multi" | "branch" | "path";

    // Branch selection attributes (for advanced storage)
    selectionBranchesAttribute?: EditableValue<string>; // JSON storage for ITreeBranch[]
    singleSelectionAttribute?: EditableValue<string>; // JSON storage for ITreeItem
}

interface TreeContextEnhancedState {
    // Current widget state
    selectedPartIds: string[];
    selectedStructureIds: string[];
    focusedPartId: string | null;
    focusedStructureId: string | null;
    hoveredPartId: string | null;
    hoveredStructureId: string | null;

    // Branch-based selection state
    singleSelection: ITreeItem | null;
    branches: ITreeBranch[];
}

interface TreeContextEnhancedActions {
    setSelectedNodes: (partIds: string[], structureIds: string[]) => void;
    setFocusedNode: (partId: string | null, structureId: string | null) => void;
    setHoveredNode: (partId: string | null, structureId: string | null) => void;
    setSingleSelection: (selection: ITreeItem | null) => void;
    setBranches: (branches: ITreeBranch[]) => void;

    // Navigation actions
    navigateToNode?: (nodeId: string) => void;
    expandPathToNode?: (nodeId: string) => void;
}

/**
 * Enhanced context hook that supports both legacy comma-separated format
 * and new branch-based selection format for multi and branch selection modes
 */
export function useTreeContextEnhanced(
    props: TreeContextEnhancedProps,
    state: TreeContextEnhancedState,
    actions: TreeContextEnhancedActions
): void {
    const {
        selectedPartIdAttribute,
        selectedStructureIdAttribute,
        focusedPartIdAttribute,
        focusedStructureIdAttribute,
        hoveredPartIdAttribute,
        hoveredStructureIdAttribute,
        selectionBranchesAttribute,
        singleSelectionAttribute,
        selectionMode
    } = props;

    const {
        selectedPartIds,
        selectedStructureIds,
        focusedPartId,
        focusedStructureId,
        hoveredPartId,
        hoveredStructureId,
        singleSelection,
        branches
    } = state;

    const {
        setSelectedNodes,
        setFocusedNode,
        setHoveredNode,
        setSingleSelection,
        setBranches,
        navigateToNode,
        expandPathToNode
    } = actions;

    // Track previous values to detect external changes
    const prevSelectedRef = useRef<string>("");
    const prevFocusedRef = useRef<string>("");
    const prevHoveredRef = useRef<string>("");
    const prevBranchesRef = useRef<string>("");
    const prevSingleRef = useRef<string>("");

    // Debounce timer for hover updates
    const hoverDebounceRef = useRef<number | null>(null);

    /**
     * Serialize branch selection to JSON for storage
     */
    const serializeBranches = useCallback((branches: ITreeBranch[]): string => {
        try {
            return JSON.stringify(branches);
        } catch (error) {
            console.error("Failed to serialize branches:", error);
            return "[]";
        }
    }, []);

    /**
     * Deserialize branch selection from JSON
     */
    const deserializeBranches = useCallback((json: string): ITreeBranch[] => {
        try {
            const parsed = JSON.parse(json);
            if (Array.isArray(parsed)) {
                return parsed;
            }
        } catch (error) {
            console.error("Failed to deserialize branches:", error);
        }
        return [];
    }, []);

    /**
     * Serialize single selection to JSON
     */
    const serializeSingleSelection = useCallback((selection: ITreeItem | null): string => {
        if (!selection) {
            return "";
        }
        try {
            return JSON.stringify(selection);
        } catch (error) {
            console.error("Failed to serialize single selection:", error);
            return "";
        }
    }, []);

    /**
     * Deserialize single selection from JSON
     */
    const deserializeSingleSelection = useCallback((json: string): ITreeItem | null => {
        if (!json) {
            return null;
        }
        try {
            return JSON.parse(json);
        } catch (error) {
            console.error("Failed to deserialize single selection:", error);
        }
        return null;
    }, []);

    // Update branch-based selection attributes when state changes
    useEffect(() => {
        if (selectionMode === "multi" && selectionBranchesAttribute?.status === "available") {
            const serialized = serializeBranches(branches);
            if (selectionBranchesAttribute.value !== serialized) {
                selectionBranchesAttribute.setValue(serialized);
            }
        } else if (selectionMode === "single" && singleSelectionAttribute?.status === "available") {
            const serialized = serializeSingleSelection(singleSelection);
            if (singleSelectionAttribute.value !== serialized) {
                singleSelectionAttribute.setValue(serialized);
            }
        }
    }, [
        branches,
        singleSelection,
        selectionMode,
        selectionBranchesAttribute,
        singleSelectionAttribute,
        serializeBranches,
        serializeSingleSelection
    ]);

    // Update legacy comma-separated attributes (for backwards compatibility)
    useEffect(() => {
        if (
            selectedPartIdAttribute &&
            selectedPartIdAttribute.status === "available" &&
            selectedPartIdAttribute.value !== selectedPartIds.join(",")
        ) {
            selectedPartIdAttribute.setValue(selectedPartIds.join(","));
        }
        if (
            selectedStructureIdAttribute &&
            selectedStructureIdAttribute.status === "available" &&
            selectedStructureIdAttribute.value !== selectedStructureIds.join(",")
        ) {
            selectedStructureIdAttribute.setValue(selectedStructureIds.join(","));
        }
    }, [selectedPartIds, selectedStructureIds, selectedPartIdAttribute, selectedStructureIdAttribute]);

    // Update focus attributes
    useEffect(() => {
        if (
            focusedPartIdAttribute &&
            focusedPartIdAttribute.status === "available" &&
            focusedPartIdAttribute.value !== (focusedPartId || "")
        ) {
            focusedPartIdAttribute.setValue(focusedPartId || "");
        }
        if (
            focusedStructureIdAttribute &&
            focusedStructureIdAttribute.status === "available" &&
            focusedStructureIdAttribute.value !== (focusedStructureId || "")
        ) {
            focusedStructureIdAttribute.setValue(focusedStructureId || "");
        }
    }, [focusedPartId, focusedStructureId, focusedPartIdAttribute, focusedStructureIdAttribute]);

    // Debounced hover updates
    useEffect(() => {
        if (hoverDebounceRef.current) {
            window.clearTimeout(hoverDebounceRef.current);
        }

        hoverDebounceRef.current = window.setTimeout(() => {
            if (
                hoveredPartIdAttribute &&
                hoveredPartIdAttribute.status === "available" &&
                hoveredPartIdAttribute.value !== (hoveredPartId || "")
            ) {
                hoveredPartIdAttribute.setValue(hoveredPartId || "");
            }
            if (
                hoveredStructureIdAttribute &&
                hoveredStructureIdAttribute.status === "available" &&
                hoveredStructureIdAttribute.value !== (hoveredStructureId || "")
            ) {
                hoveredStructureIdAttribute.setValue(hoveredStructureId || "");
            }
        }, 150);

        return () => {
            if (hoverDebounceRef.current) {
                window.clearTimeout(hoverDebounceRef.current);
            }
        };
    }, [hoveredPartId, hoveredStructureId, hoveredPartIdAttribute, hoveredStructureIdAttribute]);

    // Listen for external branch selection changes
    useEffect(() => {
        if (selectionMode === "multi" && selectionBranchesAttribute?.status === "available") {
            const currentValue = selectionBranchesAttribute.value || "[]";

            if (currentValue !== prevBranchesRef.current) {
                prevBranchesRef.current = currentValue;
                const externalBranches = deserializeBranches(currentValue);

                // Only update if actually different
                if (JSON.stringify(externalBranches) !== JSON.stringify(branches)) {
                    setBranches(externalBranches);
                }
            }
        }
    }, [selectionBranchesAttribute?.value, branches, setBranches, deserializeBranches, selectionMode]);

    // Listen for external single selection changes
    useEffect(() => {
        if (selectionMode === "single" && singleSelectionAttribute?.status === "available") {
            const currentValue = singleSelectionAttribute.value || "";

            if (currentValue !== prevSingleRef.current) {
                prevSingleRef.current = currentValue;
                const externalSelection = deserializeSingleSelection(currentValue);

                // Only update if actually different
                if (JSON.stringify(externalSelection) !== JSON.stringify(singleSelection)) {
                    setSingleSelection(externalSelection);
                }
            }
        }
    }, [
        singleSelectionAttribute?.value,
        singleSelection,
        setSingleSelection,
        deserializeSingleSelection,
        selectionMode
    ]);

    // Listen for external selection changes (legacy format)
    useEffect(() => {
        if (
            selectedPartIdAttribute &&
            selectedStructureIdAttribute &&
            selectedPartIdAttribute.status === "available" &&
            selectedStructureIdAttribute.status === "available"
        ) {
            const currentSelected = selectedPartIdAttribute.value || "";

            if (currentSelected !== prevSelectedRef.current && currentSelected !== selectedPartIds.join(",")) {
                // External change detected
                const startTime = performance.now();
                prevSelectedRef.current = currentSelected;
                const partIds = currentSelected ? currentSelected.split(",").filter(Boolean) : [];
                const structureIds = (selectedStructureIdAttribute.value || "").split(",").filter(Boolean);

                // Validate matching lengths
                if (partIds.length !== structureIds.length) {
                    console.warn(
                        `TreeView: Mismatched selection arrays - ${partIds.length} part IDs vs ${structureIds.length} structure IDs.`
                    );
                    const minLength = Math.min(partIds.length, structureIds.length);
                    setSelectedNodes(partIds.slice(0, minLength), structureIds.slice(0, minLength));
                } else {
                    setSelectedNodes(partIds, structureIds);
                }
                measureContextUpdateLatency(startTime, "external selection change processing");
            }
        }
    }, [
        selectedPartIdAttribute?.value,
        selectedStructureIdAttribute?.value,
        selectedPartIds,
        setSelectedNodes,
        selectedPartIdAttribute,
        selectedStructureIdAttribute
    ]);

    // Listen for external focus changes
    useEffect(() => {
        if (
            focusedPartIdAttribute &&
            focusedStructureIdAttribute &&
            focusedPartIdAttribute.status === "available" &&
            focusedStructureIdAttribute.status === "available"
        ) {
            const currentFocused = focusedPartIdAttribute.value || "";

            if (currentFocused !== prevFocusedRef.current && currentFocused !== (focusedPartId || "")) {
                // External change detected
                const startTime = performance.now();
                prevFocusedRef.current = currentFocused;
                const partId = currentFocused || null;
                const structureId = focusedStructureIdAttribute.value || null;
                setFocusedNode(partId, structureId);

                // If navigateToNode is provided, navigate to the focused node
                if (partId && navigateToNode) {
                    navigateToNode(partId);
                }

                // If expandPathToNode is provided, expand path to the focused node
                if (partId && expandPathToNode) {
                    expandPathToNode(partId);
                }
                measureContextUpdateLatency(startTime, "external focus change processing");
            }
        }
    }, [
        focusedPartIdAttribute?.value,
        focusedStructureIdAttribute?.value,
        focusedPartId,
        setFocusedNode,
        navigateToNode,
        expandPathToNode,
        focusedPartIdAttribute,
        focusedStructureIdAttribute
    ]);

    // Listen for external hover changes
    useEffect(() => {
        if (
            hoveredPartIdAttribute &&
            hoveredStructureIdAttribute &&
            hoveredPartIdAttribute.status === "available" &&
            hoveredStructureIdAttribute.status === "available"
        ) {
            const currentHovered = hoveredPartIdAttribute.value || "";

            if (currentHovered !== prevHoveredRef.current && currentHovered !== (hoveredPartId || "")) {
                // External change detected
                prevHoveredRef.current = currentHovered;
                const partId = currentHovered || null;
                const structureId = hoveredStructureIdAttribute.value || null;
                setHoveredNode(partId, structureId);
            }
        }
    }, [
        hoveredPartIdAttribute?.value,
        hoveredStructureIdAttribute?.value,
        hoveredPartId,
        setHoveredNode,
        hoveredPartIdAttribute,
        hoveredStructureIdAttribute
    ]);
}

/**
 * Performance measurement helper
 */
export function measureContextUpdateLatency(startTime: number, operation: string): void {
    const latency = performance.now() - startTime;
    if (latency > 50) {
        console.warn(`TreeContext: ${operation} took ${latency.toFixed(2)}ms (target: <50ms)`);
    }
}
