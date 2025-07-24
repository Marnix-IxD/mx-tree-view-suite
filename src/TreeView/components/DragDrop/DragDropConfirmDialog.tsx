import { ReactElement, createElement, useEffect, useRef } from "react";
import { DynamicValue, ListWidgetValue, ObjectItem } from "mendix";
import { StructureChange } from "../../hooks/useTreeDragDrop";
import "../../ui/DragDropConfirmDialog.css";

interface DragDropConfirmDialogProps {
    isOpen: boolean;
    changes: StructureChange[];
    confirmLabel?: DynamicValue<string>;
    cancelLabel?: DynamicValue<string>;
    customContent?: ListWidgetValue;
    datasource?: ObjectItem[];
    onConfirm: () => void;
    onCancel: () => void;
}

export function DragDropConfirmDialog({
    isOpen,
    changes,
    confirmLabel,
    cancelLabel,
    customContent,
    datasource,
    onConfirm,
    onCancel
}: DragDropConfirmDialogProps): ReactElement | null {
    const dialogRef = useRef<HTMLDivElement>(null);
    const confirmButtonRef = useRef<HTMLButtonElement>(null);

    // Focus management
    useEffect(() => {
        if (isOpen && confirmButtonRef.current) {
            confirmButtonRef.current.focus();
        }
    }, [isOpen]);

    // Trap focus within dialog
    useEffect(() => {
        if (!isOpen || !dialogRef.current) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onCancel();
            }

            // Tab trap
            if (event.key === "Tab") {
                const focusableElements = dialogRef.current!.querySelectorAll(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                );
                const firstElement = focusableElements[0] as HTMLElement;
                const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

                if (event.shiftKey && document.activeElement === firstElement) {
                    event.preventDefault();
                    lastElement.focus();
                } else if (!event.shiftKey && document.activeElement === lastElement) {
                    event.preventDefault();
                    firstElement.focus();
                }
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onCancel]);

    if (!isOpen) {
        return null;
    }

    // Calculate summary statistics
    const movedCount = changes.filter(c => c.oldParentId !== c.newParentId || c.oldIndex !== c.newIndex).length;
    const affectedCount = changes.length;

    return (
        <div className="drag-drop-confirm-overlay" onClick={onCancel}>
            <div
                ref={dialogRef}
                className="drag-drop-confirm-dialog"
                onClick={e => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="drag-drop-dialog-title"
            >
                <div className="drag-drop-confirm-header">
                    <h3 id="drag-drop-dialog-title">Confirm Changes</h3>
                </div>

                <div className="drag-drop-confirm-content">
                    {customContent && datasource && datasource.length > 0 ? (
                        // Render custom content if provided
                        <div className="drag-drop-confirm-custom">
                            {datasource.map((item, index) => (
                                <div key={index}>{customContent.get(item)}</div>
                            ))}
                        </div>
                    ) : (
                        // Default content
                        <div className="drag-drop-confirm-default">
                            <p>
                                You are about to move <strong>{movedCount}</strong> item{movedCount !== 1 ? "s" : ""}.
                            </p>
                            <p>
                                This will affect <strong>{affectedCount}</strong> total item
                                {affectedCount !== 1 ? "s" : ""}
                                (including descendants and siblings).
                            </p>
                            <p className="drag-drop-confirm-warning">
                                This action cannot be undone without server support.
                            </p>
                            {/* TODO ADD: Show preview of the new tree structure after the move */}
                            {/* TODO ADD: Add option to remember decision for batch operations */}
                        </div>
                    )}
                </div>

                <div className="drag-drop-confirm-actions">
                    <button
                        className="drag-drop-confirm-button drag-drop-confirm-cancel"
                        onClick={onCancel}
                        type="button"
                    >
                        {cancelLabel?.value || "Cancel"}
                    </button>
                    <button
                        ref={confirmButtonRef}
                        className="drag-drop-confirm-button drag-drop-confirm-submit"
                        onClick={onConfirm}
                        type="button"
                    >
                        {confirmLabel?.value || "Confirm"}
                    </button>
                </div>
            </div>
        </div>
    );
}
