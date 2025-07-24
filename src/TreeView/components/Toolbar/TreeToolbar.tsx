import { ReactElement, createElement, memo } from "react";
import { SelectionMode } from "../../types/TreeTypes";

interface ITreeToolbarProps {
    // Expand/Collapse
    onExpandAll: () => void;
    onCollapseAll: () => void;

    // Selection
    selectionMode: SelectionMode;
    onSelectAll: () => void;
    onClearSelection: () => void;
    selectedCount: number;
    totalCount: number;
}

/**
 * TreeToolbar - Action toolbar for tree view
 * Provides quick access to common tree operations
 */
export function TreeToolbar(props: ITreeToolbarProps): ReactElement {
    const { onExpandAll, onCollapseAll, selectionMode, onSelectAll, onClearSelection, selectedCount, totalCount } =
        props;

    const hasSelection = selectedCount > 0;
    const allSelected = selectedCount === totalCount && totalCount > 0;

    return (
        <div className="mx-tree__toolbar">
            <div className="mx-tree__toolbar-group mx-tree__toolbar-group--expand">
                <button
                    className="mx-tree__toolbar-button"
                    onClick={onExpandAll}
                    title="Expand all nodes"
                    aria-label="Expand all nodes"
                >
                    {/* TODO REFACTOR: Use Icon component with proper icons instead of text symbols */}
                    <span className="mx-tree__toolbar-icon">⊞</span>
                    <span className="mx-tree__toolbar-label">Expand All</span>
                </button>
                <button
                    className="mx-tree__toolbar-button"
                    onClick={onCollapseAll}
                    title="Collapse all nodes"
                    aria-label="Collapse all nodes"
                >
                    <span className="mx-tree__toolbar-icon">⊟</span>
                    <span className="mx-tree__toolbar-label">Collapse All</span>
                </button>
            </div>

            {selectionMode === "multi" && (
                <div className="mx-tree__toolbar-group mx-tree__toolbar-group--selection">
                    <button
                        className="mx-tree__toolbar-button"
                        onClick={onSelectAll}
                        disabled={allSelected}
                        title="Select all nodes"
                        aria-label="Select all nodes"
                    >
                        <span className="mx-tree__toolbar-icon">☑</span>
                        <span className="mx-tree__toolbar-label">Select All</span>
                    </button>
                    <button
                        className="mx-tree__toolbar-button"
                        onClick={onClearSelection}
                        disabled={!hasSelection}
                        title="Clear selection"
                        aria-label="Clear selection"
                    >
                        <span className="mx-tree__toolbar-icon">☐</span>
                        <span className="mx-tree__toolbar-label">Clear</span>
                    </button>
                    {hasSelection && (
                        <span className="mx-tree__toolbar-selection-count">
                            {selectedCount} of {totalCount} selected
                        </span>
                    )}
                </div>
            )}

            {selectionMode === "single" && hasSelection && (
                <div className="mx-tree__toolbar-group mx-tree__toolbar-group--selection">
                    <button
                        className="mx-tree__toolbar-button"
                        onClick={onClearSelection}
                        disabled={!hasSelection}
                        title="Clear selection"
                        aria-label="Clear selection"
                    >
                        <span className="mx-tree__toolbar-icon">☐</span>
                        <span className="mx-tree__toolbar-label">Clear Selection</span>
                    </button>
                </div>
            )}
        </div>
    );
}

// Memoize for performance
export default memo(TreeToolbar);
