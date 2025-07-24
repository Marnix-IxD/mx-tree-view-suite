import { ReactElement, createElement, useState, useEffect, useRef, useCallback, Fragment } from "react";
import { EditableValue, DynamicValue, ListWidgetValue, ObjectItem } from "mendix";
import { DragDropOperation } from "../../hooks/useTreeDragDrop";
import { DragDropConfirmDialog } from "./DragDropConfirmDialog";
import { LoadingIndicator } from "./LoadingIndicator";
import { setTimer } from "../../utils/timers";
import "../../ui/DragDropManager.css";

interface DragDropManagerProps {
    // Widget properties
    dragDropEndpoint?: string;
    dragDropStatusAttribute?: EditableValue<string>;
    dragDropConfirmLabel?: DynamicValue<string>;
    dragDropCancelLabel?: DynamicValue<string>;
    dragDropConfirmContent?: ListWidgetValue;
    datasource?: ObjectItem[];

    // Drag drop operation from hook
    pendingOperation: DragDropOperation | null;
    onConfirm: (operation: DragDropOperation) => void;
    onCancel: () => void;
    onComplete: () => void; // Clear pending operation
    onRollback: (operation: DragDropOperation) => void;
}

interface LoadingItem {
    nodeId: string;
    message: string;
    type: "loading" | "success" | "error";
}

export function DragDropManager({
    dragDropEndpoint,
    dragDropStatusAttribute,
    dragDropConfirmLabel,
    dragDropCancelLabel,
    dragDropConfirmContent,
    datasource,
    pendingOperation,
    onConfirm,
    onCancel,
    onComplete,
    onRollback
}: DragDropManagerProps): ReactElement {
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [activeOperation, setActiveOperation] = useState<DragDropOperation | null>(null);
    const [loadingItems, setLoadingItems] = useState<Map<string, LoadingItem>>(new Map());
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const statusValueRef = useRef<string>("");

    // Show confirm dialog when there's a pending operation
    useEffect(() => {
        setShowConfirmDialog(!!pendingOperation);
    }, [pendingOperation]);

    // Monitor status attribute for updates
    useEffect(() => {
        if (!dragDropStatusAttribute || !dragDropStatusAttribute.value || !activeOperation) {
            return;
        }

        const currentValue = dragDropStatusAttribute.value;

        // Only process if value changed
        if (currentValue === statusValueRef.current) {
            return;
        }
        statusValueRef.current = currentValue;

        try {
            // Parse status update: {"requestId": "status"}
            // TODO ADD: Validate JSON structure before parsing
            // TODO FIX: Handle multiple concurrent operations properly
            const statusUpdate = JSON.parse(currentValue);
            const [requestId, status] = Object.entries(statusUpdate)[0] as [string, string];

            // Check if this is for our active operation
            if (requestId !== activeOperation.requestId) {
                return;
            }

            switch (status) {
                case "processing":
                    // Keep showing loading
                    break;

                case "success":
                    // Update loading indicators to success
                    const successItems = new Map<string, LoadingItem>();
                    activeOperation.topLevelNodes.forEach(nodeId => {
                        successItems.set(nodeId, {
                            nodeId,
                            message: `✓ ${activeOperation.totalItemCount} items moved successfully`,
                            type: "success"
                        });
                    });
                    setLoadingItems(successItems);

                    // Fade out after 2 seconds
                    setTimer(() => {
                        setLoadingItems(new Map());
                        setActiveOperation(null);
                        onComplete();
                    }, 2000);
                    break;

                case "failed":
                    // Clear loading and show error
                    setLoadingItems(new Map());
                    setErrorMessage("Failed to move items. Changes have been reverted.");

                    // Trigger rollback
                    onRollback(activeOperation);

                    // Clear error after 3 seconds
                    setTimer(() => {
                        setErrorMessage(null);
                        setActiveOperation(null);
                        onComplete();
                    }, 3000);
                    break;
            }
        } catch (error) {
            console.error("Failed to parse drag drop status:", error);
        }
    }, [dragDropStatusAttribute?.value, activeOperation, onComplete, onRollback]);

    // Handle confirmation
    const handleConfirm = useCallback(() => {
        if (!pendingOperation || !dragDropEndpoint) {
            return;
        }

        // Set active operation
        setActiveOperation(pendingOperation);

        // Show loading indicators on top-level nodes only
        const loading = new Map<string, LoadingItem>();
        pendingOperation.topLevelNodes.forEach(nodeId => {
            loading.set(nodeId, {
                nodeId,
                message: `Moving ${pendingOperation.totalItemCount} items...`,
                type: "loading"
            });
        });

        setLoadingItems(loading);
        setShowConfirmDialog(false);

        // Notify parent to make the API call
        onConfirm(pendingOperation);
    }, [pendingOperation, dragDropEndpoint, onConfirm]);

    // Handle cancellation
    const handleCancel = useCallback(() => {
        setShowConfirmDialog(false);
        onCancel();
    }, [onCancel]);

    return (
        <Fragment>
            {/* Confirmation Dialog */}
            <DragDropConfirmDialog
                isOpen={showConfirmDialog}
                changes={pendingOperation?.changes || []}
                confirmLabel={dragDropConfirmLabel}
                cancelLabel={dragDropCancelLabel}
                customContent={dragDropConfirmContent}
                datasource={datasource}
                onConfirm={handleConfirm}
                onCancel={handleCancel}
            />

            {/* Loading Indicators */}
            {Array.from(loadingItems.values()).map(item => (
                <LoadingIndicator key={item.nodeId} nodeId={item.nodeId} message={item.message} type={item.type} />
            ))}

            {/* Error Messages */}
            {errorMessage && <div className="drag-drop-error-toast">{errorMessage}</div>}
        </Fragment>
    );
}
