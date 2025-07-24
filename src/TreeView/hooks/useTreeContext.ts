import { useEffect, useRef } from "react";
import { EditableValue } from "mendix";
import { setTimer, clearTimer, TimerId } from "../utils/timers";

interface TreeContextProps {
    selectedPartIdAttribute: EditableValue<string>;
    selectedStructureIdAttribute: EditableValue<string>;
    focusedPartIdAttribute: EditableValue<string>;
    focusedStructureIdAttribute: EditableValue<string>;
    hoveredPartIdAttribute: EditableValue<string>;
    hoveredStructureIdAttribute: EditableValue<string>;
}

interface TreeContextState {
    selectedPartIds: string[];
    selectedStructureIds: string[];
    focusedPartId: string | null;
    focusedStructureId: string | null;
    hoveredPartId: string | null;
    hoveredStructureId: string | null;
}

interface TreeContextActions {
    setSelectedNodes: (partIds: string[], structureIds: string[]) => void;
    setFocusedNode: (partId: string | null, structureId: string | null) => void;
    setHoveredNode: (partId: string | null, structureId: string | null) => void;
}

export function useTreeContext(props: TreeContextProps, state: TreeContextState, actions: TreeContextActions): void {
    const {
        selectedPartIdAttribute,
        selectedStructureIdAttribute,
        focusedPartIdAttribute,
        focusedStructureIdAttribute,
        hoveredPartIdAttribute,
        hoveredStructureIdAttribute
    } = props;

    const {
        selectedPartIds,
        selectedStructureIds,
        focusedPartId,
        focusedStructureId,
        hoveredPartId,
        hoveredStructureId
    } = state;
    const { setSelectedNodes, setFocusedNode, setHoveredNode } = actions;

    // Track previous values to detect external changes
    const prevSelectedRef = useRef<string>("");
    const prevFocusedRef = useRef<string>("");
    const prevHoveredRef = useRef<string>("");

    // Track pending updates to prevent feedback loops
    const pendingUpdatesRef = useRef<Map<string, { value: string; timestamp: number }>>(new Map());
    const UPDATE_WINDOW_MS = 300; // Time window to consider an update as "pending"

    // Helper to check if a value is pending
    const isPendingUpdate = (key: string, value: string): boolean => {
        const pending = pendingUpdatesRef.current.get(key);
        if (!pending) {
            return false;
        }

        const isRecent = Date.now() - pending.timestamp < UPDATE_WINDOW_MS;
        const isSameValue = pending.value === value;

        // Clean up old pending updates
        if (!isRecent) {
            pendingUpdatesRef.current.delete(key);
        }

        return isRecent && isSameValue;
    };

    // Helper to mark an update as pending
    const markAsPending = (key: string, value: string): void => {
        pendingUpdatesRef.current.set(key, { value, timestamp: Date.now() });
    };

    // Debounce timer for hover updates
    const hoverDebounceRef = useRef<TimerId | null>(null);

    // Cleanup pending updates on unmount
    useEffect(() => {
        return () => {
            pendingUpdatesRef.current.clear();
        };
    }, []);

    // Update Mendix attributes when state changes
    useEffect(() => {
        if (
            selectedPartIdAttribute &&
            selectedPartIdAttribute.status === "available" &&
            selectedPartIdAttribute.value !== selectedPartIds.join(",")
        ) {
            const newValue = selectedPartIds.join(",");
            markAsPending("selectedPartIds", newValue);
            selectedPartIdAttribute.setValue(newValue);
        }
        if (
            selectedStructureIdAttribute &&
            selectedStructureIdAttribute.status === "available" &&
            selectedStructureIdAttribute.value !== selectedStructureIds.join(",")
        ) {
            const newValue = selectedStructureIds.join(",");
            markAsPending("selectedStructureIds", newValue);
            selectedStructureIdAttribute.setValue(newValue);
        }
    }, [selectedPartIds, selectedStructureIds, selectedPartIdAttribute, selectedStructureIdAttribute]);

    useEffect(() => {
        if (
            focusedPartIdAttribute &&
            focusedPartIdAttribute.status === "available" &&
            focusedPartIdAttribute.value !== (focusedPartId || "")
        ) {
            const newValue = focusedPartId || "";
            console.debug(
                `useTreeContext [NODE][FOCUS] Setting focusedPartIdAttribute from "${focusedPartIdAttribute.value}" to "${newValue}"`
            );
            markAsPending("focusedPartId", newValue);
            focusedPartIdAttribute.setValue(newValue);
        }
        if (
            focusedStructureIdAttribute &&
            focusedStructureIdAttribute.status === "available" &&
            focusedStructureIdAttribute.value !== (focusedStructureId || "")
        ) {
            const newValue = focusedStructureId || "";
            markAsPending("focusedStructureId", newValue);
            focusedStructureIdAttribute.setValue(newValue);
        }
    }, [focusedPartId, focusedStructureId, focusedPartIdAttribute, focusedStructureIdAttribute]);

    // Debounced hover updates to avoid excessive attribute updates
    useEffect(() => {
        clearTimer(hoverDebounceRef.current);

        hoverDebounceRef.current = setTimer(() => {
            if (
                hoveredPartIdAttribute &&
                hoveredPartIdAttribute.status === "available" &&
                hoveredPartIdAttribute.value !== (hoveredPartId || "")
            ) {
                const newValue = hoveredPartId || "";
                markAsPending("hoveredPartId", newValue);
                hoveredPartIdAttribute.setValue(newValue);
            }
            if (
                hoveredStructureIdAttribute &&
                hoveredStructureIdAttribute.status === "available" &&
                hoveredStructureIdAttribute.value !== (hoveredStructureId || "")
            ) {
                hoveredStructureIdAttribute.setValue(hoveredStructureId || "");
            }
        }, 150); // Debounce hover updates to 150ms

        return () => {
            clearTimer(hoverDebounceRef.current);
        };
    }, [hoveredPartId, hoveredStructureId, hoveredPartIdAttribute, hoveredStructureIdAttribute]);

    // Listen for external attribute changes
    useEffect(() => {
        if (
            selectedPartIdAttribute &&
            selectedPartIdAttribute.status === "available" &&
            selectedStructureIdAttribute &&
            selectedStructureIdAttribute.status === "available"
        ) {
            const currentSelected = selectedPartIdAttribute.value || "";

            // Skip if this is an echo of our own update
            if (isPendingUpdate("selectedPartIds", currentSelected)) {
                prevSelectedRef.current = currentSelected;
                return;
            }

            if (currentSelected !== prevSelectedRef.current && currentSelected !== selectedPartIds.join(",")) {
                // External change detected
                prevSelectedRef.current = currentSelected;
                const partIds = currentSelected ? currentSelected.split(",").filter(Boolean) : [];
                const structureIds = (selectedStructureIdAttribute.value || "").split(",").filter(Boolean);

                // Validate that partIds and structureIds arrays have matching lengths
                if (partIds.length !== structureIds.length) {
                    console.warn(
                        `TreeView: Mismatched selection arrays - ${partIds.length} part IDs vs ${structureIds.length} structure IDs. ` +
                            `Using shorter array length to prevent errors.`
                    );
                    const minLength = Math.min(partIds.length, structureIds.length);
                    setSelectedNodes(partIds.slice(0, minLength), structureIds.slice(0, minLength));
                } else {
                    setSelectedNodes(partIds, structureIds);
                }
            }
        }
    }, [selectedPartIdAttribute?.value, selectedStructureIdAttribute?.value, selectedPartIds, setSelectedNodes]);

    useEffect(() => {
        if (
            focusedPartIdAttribute &&
            focusedPartIdAttribute.status === "available" &&
            focusedStructureIdAttribute &&
            focusedStructureIdAttribute.status === "available"
        ) {
            const currentFocused = focusedPartIdAttribute.value || "";
            const currentStructure = focusedStructureIdAttribute.value || "";

            // Skip if this is an echo of our own update
            if (isPendingUpdate("focusedPartId", currentFocused)) {
                console.debug(`useTreeContext [NODE][FOCUS] Ignoring echo of our own update: "${currentFocused}"`);
                prevFocusedRef.current = currentFocused;
                return;
            }

            // Check if value actually changed
            if (currentFocused !== prevFocusedRef.current && currentFocused !== (focusedPartId || "")) {
                // External change detected
                console.debug(
                    `useTreeContext [NODE][FOCUS] External focus change detected - from "${
                        focusedPartId || ""
                    }" to "${currentFocused}"`
                );
                prevFocusedRef.current = currentFocused;
                const partId = currentFocused || null;
                const structureId = currentStructure || null;
                setFocusedNode(partId, structureId);
            }
        }
    }, [focusedPartIdAttribute?.value, focusedStructureIdAttribute?.value, focusedPartId, setFocusedNode]);

    useEffect(() => {
        if (
            hoveredPartIdAttribute &&
            hoveredPartIdAttribute.status === "available" &&
            hoveredStructureIdAttribute &&
            hoveredStructureIdAttribute.status === "available"
        ) {
            const currentHovered = hoveredPartIdAttribute.value || "";

            // Skip if this is an echo of our own update
            if (isPendingUpdate("hoveredPartId", currentHovered)) {
                prevHoveredRef.current = currentHovered;
                return;
            }

            if (currentHovered !== prevHoveredRef.current && currentHovered !== (hoveredPartId || "")) {
                // External change detected
                prevHoveredRef.current = currentHovered;
                const partId = currentHovered || null;
                const structureId = hoveredStructureIdAttribute.value || null;
                setHoveredNode(partId, structureId);
            }
        }
    }, [hoveredPartIdAttribute?.value, hoveredStructureIdAttribute?.value, hoveredPartId, setHoveredNode]);
}
