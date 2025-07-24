import { ReactElement, createElement, useEffect, useState, CSSProperties, Fragment } from "react";
import { createPortal } from "react-dom";
import classNames from "classnames";
import { TreeNode } from "../../types/TreeTypes";

/**
 * Drag preview configuration
 */
interface DragPreviewConfig {
    maxItems: number;
    maxDepth: number;
    showCount: boolean;
    opacity: number;
}

/**
 * Drag state information
 */
export interface DragState {
    isDragging: boolean;
    draggedNodes: TreeNode[];
    clientX: number;
    clientY: number;
    offsetX: number;
    offsetY: number;
}

/**
 * Drop indicator position
 */
export interface DropIndicator {
    nodeId: string;
    position: "before" | "inside" | "after";
    depth: number;
}

interface ITreeDragLayerProps {
    dragState: DragState;
    dropIndicator: DropIndicator | null;
    previewConfig?: Partial<DragPreviewConfig>;
    className?: string;
}

const DEFAULT_PREVIEW_CONFIG: DragPreviewConfig = {
    maxItems: 9,
    maxDepth: 3,
    showCount: true,
    opacity: 0.8
};

/**
 * TreeDragLayer - Renders drag preview and drop indicators
 * Uses portal to ensure proper z-index layering
 */
export function TreeDragLayer(props: ITreeDragLayerProps): ReactElement | null {
    const { dragState, dropIndicator, previewConfig = {}, className } = props;

    const config = { ...DEFAULT_PREVIEW_CONFIG, ...previewConfig };
    const [dragPreviewEl, setDragPreviewEl] = useState<HTMLDivElement | null>(null);

    // Create drag preview element
    useEffect(() => {
        if (dragState.isDragging && !dragPreviewEl) {
            const el = document.createElement("div");
            el.className = "mx-tree__drag-preview-container";
            document.body.appendChild(el);
            setDragPreviewEl(el);
        }

        return () => {
            if (dragPreviewEl && dragPreviewEl.parentNode) {
                dragPreviewEl.parentNode.removeChild(dragPreviewEl);
            }
        };
    }, [dragState.isDragging, dragPreviewEl]);

    // Don't render if not dragging
    if (!dragState.isDragging || dragState.draggedNodes.length === 0) {
        return null;
    }

    // Calculate preview position
    const previewStyle: CSSProperties = {
        position: "fixed",
        left: dragState.clientX + dragState.offsetX,
        top: dragState.clientY + dragState.offsetY,
        pointerEvents: "none",
        zIndex: 9999,
        opacity: config.opacity
    };

    // Prepare nodes for preview
    const getPreviewNodes = (): { nodes: TreeNode[]; remainingCount: number } => {
        const nodes: TreeNode[] = [];
        let remainingCount = 0;

        // currentDepth was replaced by the depth parameter in addNode function

        const addNode = (node: TreeNode, depth: number) => {
            if (nodes.length >= config.maxItems || depth > config.maxDepth) {
                remainingCount++;
                return;
            }

            nodes.push({ ...node, level: depth });

            if (node.children && node.children.length > 0) {
                node.children.forEach(child => addNode(child, depth + 1));
            }
        };

        dragState.draggedNodes.forEach(node => addNode(node, 0));

        return { nodes, remainingCount };
    };

    const { nodes: previewNodes, remainingCount } = getPreviewNodes();

    // Render preview content
    const renderPreview = () => (
        <div className={classNames("mx-tree__drag-preview", className)} style={previewStyle}>
            <div className="mx-tree__drag-preview-content">
                {previewNodes.map((node, _index) => (
                    <div
                        key={node.id}
                        className="mx-tree__drag-preview-item"
                        style={{ paddingLeft: `${node.level * 20}px` }}
                    >
                        <span className="mx-tree__drag-preview-icon">📄</span>{" "}
                        {/* TODO REFACTOR: Use configurable icon instead of emoji */}
                        <span className="mx-tree__drag-preview-label">{node.label || node.id}</span>
                    </div>
                ))}

                {config.showCount && remainingCount > 0 && (
                    <div className="mx-tree__drag-preview-count">
                        <span className="mx-tree__drag-preview-count-text">+{remainingCount} more</span>
                    </div>
                )}
            </div>

            {dragState.draggedNodes.length > 1 && (
                <div className="mx-tree__drag-preview-badge">{dragState.draggedNodes.length}</div>
            )}
        </div>
    );

    // Render drop indicator
    const renderDropIndicator = () => {
        if (!dropIndicator) {
            return null;
        }

        const indicatorClass = classNames(
            "mx-tree__drop-indicator",
            `mx-tree__drop-indicator--${dropIndicator.position}`
        );

        return (
            <div
                className={indicatorClass}
                data-node-id={dropIndicator.nodeId}
                style={{
                    left: `${dropIndicator.depth * 20}px`
                }}
            />
        );
    };

    return (
        <Fragment>
            {/* Drag preview - rendered in portal */}
            {dragPreviewEl && createPortal(renderPreview(), dragPreviewEl)}

            {/* Drop indicator - rendered in place */}
            {renderDropIndicator()}
        </Fragment>
    );
}

/**
 * Hook for managing drag layer state
 */
export function useTreeDragLayer() {
    const [dragState, setDragState] = useState<DragState>({
        isDragging: false,
        draggedNodes: [],
        clientX: 0,
        clientY: 0,
        offsetX: 20,
        offsetY: 20
    });

    const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);

    // Update drag position
    const updateDragPosition = (clientX: number, clientY: number) => {
        setDragState(prev => ({
            ...prev,
            clientX,
            clientY
        }));
    };

    // Start dragging
    const startDrag = (nodes: TreeNode[], clientX: number, clientY: number) => {
        setDragState({
            isDragging: true,
            draggedNodes: nodes,
            clientX,
            clientY,
            offsetX: 20,
            offsetY: 20
        });
    };

    // End dragging
    const endDrag = () => {
        setDragState({
            isDragging: false,
            draggedNodes: [],
            clientX: 0,
            clientY: 0,
            offsetX: 20,
            offsetY: 20
        });
        setDropIndicator(null);
    };

    // Update drop indicator
    const updateDropIndicator = (indicator: DropIndicator | null) => {
        setDropIndicator(indicator);
    };

    return {
        dragState,
        dropIndicator,
        updateDragPosition,
        startDrag,
        endDrag,
        updateDropIndicator
    };
}
