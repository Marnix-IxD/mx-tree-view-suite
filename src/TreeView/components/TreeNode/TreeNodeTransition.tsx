import { ReactElement, createElement, useState, useEffect, useRef } from "react";
import { TreeNode, SelectionMode } from "../../types/TreeTypes";
import { TreeNodeComponent } from "./TreeNodeComponent";
import { TreeNodeSkeleton } from "./TreeNodeSkeleton";
import "../../ui/TreeNodeTransition.css";

interface TreeNodeTransitionProps {
    node: TreeNode;
    index: number;
    // All TreeNodeComponent props
    level: number;
    isSelected: boolean;
    isHighlighted: boolean;
    isFocused: boolean;
    isHovered: boolean;
    isExpanded: boolean;
    isVisible: boolean;
    isSticky: boolean;
    isDragging?: boolean;
    isDraggedOver?: boolean;
    dropPosition?: "before" | "inside" | "after" | null;
    isLastChild: boolean;
    isSearchMatch: boolean;
    searchQuery: string;
    // Handlers
    onClick: () => void;
    onHover: () => void;
    onContextMenu: (e: React.MouseEvent) => void;
    onToggleExpanded: (e?: React.MouseEvent) => void;
    onToggleVisibility: () => void;
    // Drag & Drop handlers
    onDragStart?: (e: React.DragEvent) => void;
    onDragOver?: (e: React.DragEvent) => void;
    onDragLeave?: (e: React.DragEvent) => void;
    onDrop?: (e: React.DragEvent) => void;
    onDragEnd?: (e: React.DragEvent) => void;
    // Configuration
    selectionMode: SelectionMode;
    enableVisibilityToggle: boolean;
    enableDragDrop: boolean;
    nodeContent?: any;
    itemHeight: number;
    nodeLabelType: "attribute" | "expression" | "widget";
    nodeLabelAttribute?: any;
    nodeLabelExpression?: any;
    nodeLabelContent?: any;
    indentSize: number;
    showLines: boolean;
    showIcons: boolean;
    // Icons
    expandIcon?: any;
    collapseIcon?: any;
    visibilityOnIcon?: any;
    visibilityOffIcon?: any;
}

/**
 * Component that handles smooth transitions between skeleton and loaded states
 */
export function TreeNodeTransition(props: TreeNodeTransitionProps): ReactElement {
    const { node, index, ...nodeProps } = props;
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [showSkeleton, setShowSkeleton] = useState(node.isSkeleton);
    const prevSkeletonState = useRef(node.isSkeleton);
    const transitionTimeoutRef = useRef<number | null>(null);

    // Handle skeleton to loaded transition
    useEffect(() => {
        const wasSkeletonNowLoaded = prevSkeletonState.current && !node.isSkeleton;
        const wasLoadedNowSkeleton = !prevSkeletonState.current && node.isSkeleton;

        if (wasSkeletonNowLoaded || wasLoadedNowSkeleton) {
            setIsTransitioning(true);

            // Clear any existing timeout
            if (transitionTimeoutRef.current) {
                clearTimeout(transitionTimeoutRef.current);
            }

            if (wasSkeletonNowLoaded) {
                // Skeleton → Loaded: Show skeleton briefly, then transition
                transitionTimeoutRef.current = window.setTimeout(() => {
                    setShowSkeleton(false);
                    transitionTimeoutRef.current = window.setTimeout(() => {
                        setIsTransitioning(false);
                    }, 300); // Match CSS transition duration
                }, 100); // Brief delay to show loading complete state
            } else {
                // Loaded → Skeleton: Immediate transition
                setShowSkeleton(true);
                transitionTimeoutRef.current = window.setTimeout(() => {
                    setIsTransitioning(false);
                }, 300);
            }
        }

        prevSkeletonState.current = node.isSkeleton;

        return () => {
            if (transitionTimeoutRef.current) {
                clearTimeout(transitionTimeoutRef.current);
            }
        };
    }, [node.isSkeleton]);

    // Update loading state for skeleton
    useEffect(() => {
        if (node.isSkeleton && node.loadingState !== "loading") {
            // Auto-start loading state when skeleton becomes visible
            const timer = setTimeout(() => {
                if (node.isSkeleton) {
                    // This would trigger the parent to update the node's loading state
                    // In real implementation, this would call a callback to update the node
                }
            }, 100);

            return () => clearTimeout(timer);
        }
    }, [node.isSkeleton, node.loadingState]);

    if (showSkeleton || node.isSkeleton) {
        return (
            <div
                className={`mx-tree__node-transition ${isTransitioning ? "mx-tree__node-transition--active" : ""}`}
                style={{
                    opacity: isTransitioning && !node.isSkeleton ? 0.7 : 1,
                    transform: isTransitioning ? "translateY(-2px)" : "translateY(0)",
                    transition: "opacity 0.3s ease-out, transform 0.3s ease-out"
                }}
            >
                <TreeNodeSkeleton
                    level={nodeProps.level}
                    indentSize={nodeProps.indentSize}
                    showLines={nodeProps.showLines}
                    itemHeight={nodeProps.itemHeight}
                    loadingState={node.loadingState}
                    loadingProgress={node.loadingProgress}
                    nodeId={node.id}
                />
            </div>
        );
    }

    return (
        <div
            className={`mx-tree__node-transition ${isTransitioning ? "mx-tree__node-transition--active" : ""}`}
            style={{
                opacity: isTransitioning ? 0.9 : 1,
                transform: isTransitioning ? "translateY(2px) scale(1.01)" : "translateY(0) scale(1)",
                transition: "opacity 0.3s ease-out, transform 0.3s ease-out"
            }}
        >
            <TreeNodeComponent key={node.id} node={node} {...nodeProps} />
        </div>
    );
}

export default TreeNodeTransition;
