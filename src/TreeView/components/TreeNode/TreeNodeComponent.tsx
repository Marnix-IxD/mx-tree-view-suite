import { ReactElement, createElement, useCallback, useMemo, Fragment, memo, useRef, useEffect, useState } from "react";
import classNames from "classnames";
import { TreeNode, SelectionMode } from "../../types/TreeTypes";
import { DynamicValue, WebIcon, ListWidgetValue, ListAttributeValue, ListExpressionValue } from "mendix";
import { Icon } from "../../icons/Icon";
import { highlightSearchText, containsSearchText } from "../../utils/textHighlighter";
import { TreeNodeSkeleton } from "./TreeNodeSkeleton";

// Constants
const INDENT_SIZE_DEFAULT = 20;

interface ITreeNodeComponentProps {
    // Node data
    node: TreeNode;
    level: number;

    // State flags
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
    isLastChild?: boolean; // For proper tree line rendering
    isSearchMatch?: boolean; // Node matches search but text may not be visible
    searchQuery?: string; // Current search query for text highlighting

    // Event handlers
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
    enableDragDrop?: boolean;
    nodeContent?: ListWidgetValue;
    itemHeight?: number; // From XML configuration

    // Node label configuration
    nodeLabelType: "attribute" | "expression" | "widget";
    nodeLabelAttribute?: ListAttributeValue<string>;
    nodeLabelExpression?: ListExpressionValue<string>;
    nodeLabelContent?: ListWidgetValue;

    indentSize: number;
    showLines: boolean;
    showIcons: boolean;

    // Icons
    expandIcon?: DynamicValue<WebIcon>;
    collapseIcon?: DynamicValue<WebIcon>;
    visibilityOnIcon?: DynamicValue<WebIcon>;
    visibilityOffIcon?: DynamicValue<WebIcon>;
}

/**
 * Improved TreeNodeComponent - Renders a single tree node with proper alignment
 * Fixes indentation, selection styling, and tree lines visualization
 */
export function TreeNodeComponent(props: ITreeNodeComponentProps): ReactElement {
    const {
        node,
        level,
        isSelected,
        isHighlighted,
        isFocused,
        isHovered,
        isExpanded,
        isVisible,
        isSticky,
        isDragging = false,
        isDraggedOver = false,
        dropPosition = null,
        isLastChild = false,
        isSearchMatch = false,
        searchQuery = "",
        onClick,
        onHover,
        onContextMenu,
        onToggleExpanded,
        onToggleVisibility,
        onDragStart,
        onDragOver,
        onDragLeave,
        onDrop,
        onDragEnd,
        selectionMode,
        enableVisibilityToggle,
        enableDragDrop = false,
        nodeContent,
        itemHeight,
        nodeLabelType,
        nodeLabelAttribute,
        nodeLabelExpression,
        nodeLabelContent,
        indentSize = INDENT_SIZE_DEFAULT,
        showLines,
        showIcons,
        expandIcon,
        collapseIcon,
        visibilityOnIcon,
        visibilityOffIcon
    } = props;

    // Calculate indentation
    const indent = useMemo(() => level * indentSize, [level, indentSize]);

    // Check if node has custom content
    const hasCustomContent = useMemo(() => {
        return nodeContent !== undefined || (nodeLabelType === "widget" && nodeLabelContent !== undefined);
    }, [nodeContent, nodeLabelType, nodeLabelContent]);

    // Get node label based on type
    const nodeLabel = useMemo(() => {
        switch (nodeLabelType) {
            case "attribute":
                if (nodeLabelAttribute) {
                    const value = nodeLabelAttribute.get(node.objectItem).value;
                    return value || node.id;
                }
                return node.id;

            case "expression":
                if (nodeLabelExpression) {
                    const value = nodeLabelExpression.get(node.objectItem).value;
                    return value || node.id;
                }
                return node.id;

            case "widget":
                // For widget type, we'll render it in renderContent
                return null;

            default:
                return node.id;
        }
    }, [node, nodeLabelType, nodeLabelAttribute, nodeLabelExpression]);

    // If this is a skeleton node, render the skeleton component
    if (node.isSkeleton) {
        return (
            <TreeNodeSkeleton
                level={level}
                indentSize={indentSize}
                showLines={showLines}
                itemHeight={itemHeight || 32}
            />
        );
    }

    // Handle mouse enter for hover
    const handleMouseEnter = useCallback(() => {
        onHover();
    }, [onHover]);

    // Handle keyboard interaction
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            switch (e.key) {
                case "Enter":
                case " ":
                    e.preventDefault();
                    onClick();
                    break;
                case "ArrowLeft":
                    if (isExpanded && (node.children.length > 0 || !node.isLeaf)) {
                        e.preventDefault();
                        onToggleExpanded();
                    }
                    break;
                case "ArrowRight":
                    if (!isExpanded && (node.children.length > 0 || !node.isLeaf)) {
                        e.preventDefault();
                        onToggleExpanded();
                    }
                    break;
            }
        },
        [onClick, isExpanded, node.children.length, node.isLeaf, onToggleExpanded]
    );

    // Render drag handle
    const renderDragHandle = () => {
        if (!enableDragDrop) {
            return null;
        }

        return (
            <div
                className="mx-tree__node-drag-handle"
                draggable
                onDragStart={e => {
                    e.stopPropagation();
                    if (onDragStart) {
                        onDragStart(e as any);
                    }
                }}
                aria-label="Drag handle"
                style={{ width: 20 }}
            >
                <span className="mx-tree__node-drag-handle-icon">⋮⋮</span>
            </div>
        );
    };

    // Render expand/collapse icon
    const renderExpandIcon = () => {
        // Show expand icon if:
        // 1. Node already has children loaded
        // 2. Node is not a leaf (can have children even if not loaded yet)
        const hasChildrenOrCanHave = node.children.length > 0 || !node.isLeaf;

        if (!hasChildrenOrCanHave) {
            // Render empty space for alignment
            return <span className="mx-tree__node-expand-spacer" />;
        }

        const icon = isExpanded ? collapseIcon : expandIcon;

        return (
            <button
                className="mx-tree__node-expand-button"
                onClick={e => {
                    e.stopPropagation();
                    onToggleExpanded(e);
                }}
                onMouseDown={e => e.preventDefault()} // Prevent focus shift
                aria-label={isExpanded ? "Collapse" : "Expand"}
                tabIndex={-1}
            >
                {showIcons && icon ? (
                    <Icon
                        icon={icon}
                        fallback={isExpanded ? "chevron-down" : "chevron"}
                        className="mx-tree__node-expand-icon-svg"
                    />
                ) : (
                    <span className="mx-tree__node-expand-icon-text">{isExpanded ? "−" : "+"}</span>
                )}
            </button>
        );
    };

    // Render visibility toggle
    const renderVisibilityToggle = () => {
        if (!enableVisibilityToggle) {
            return null;
        }

        const icon = isVisible ? visibilityOnIcon : visibilityOffIcon;

        return (
            <button
                className="mx-tree__node-visibility-button"
                onClick={e => {
                    e.stopPropagation();
                    onToggleVisibility();
                }}
                onMouseDown={e => e.preventDefault()} // Prevent focus shift
                aria-label={isVisible ? "Hide" : "Show"}
                tabIndex={-1}
            >
                <Icon
                    icon={icon}
                    fallback={isVisible ? "eye-open" : "eye-closed"}
                    className="mx-tree__node-visibility-icon-svg"
                />
            </button>
        );
    };

    // Render selection indicator
    const renderSelectionIndicator = () => {
        if (selectionMode === "none") {
            return null;
        }

        return (
            <div className="mx-tree__node-selection">
                {selectionMode === "multi" ? (
                    <input
                        type="checkbox"
                        className="mx-tree__node-checkbox"
                        checked={isSelected}
                        onChange={() => {
                            /* Handled by onClick */
                        }}
                        onClick={e => e.stopPropagation()} // Prevent double handling
                        tabIndex={-1}
                        aria-label={`Select ${nodeLabel}`}
                    />
                ) : (
                    <input
                        type="radio"
                        className="mx-tree__node-radio"
                        checked={isSelected}
                        onChange={() => {
                            /* Handled by onClick */
                        }}
                        onClick={e => e.stopPropagation()} // Prevent double handling
                        tabIndex={-1}
                        aria-label={`Select ${nodeLabel}`}
                    />
                )}
            </div>
        );
    };

    // Check if content contains search text (for visual indicator)
    const contentRef = useRef<HTMLDivElement>(null);
    const [hasVisibleSearchMatch, setHasVisibleSearchMatch] = useState(false);

    // Detect if the rendered content contains the search text
    useEffect(() => {
        if (!searchQuery || !isSearchMatch || !contentRef.current) {
            setHasVisibleSearchMatch(false);
            return;
        }

        // Check if the actual rendered text contains the search query
        const textContent = contentRef.current.textContent || "";
        const contains = containsSearchText(textContent, searchQuery);
        setHasVisibleSearchMatch(contains);
    }, [searchQuery, isSearchMatch, nodeLabel, nodeContent, nodeLabelContent]);

    // Render node content with optional search highlighting
    const renderContent = () => {
        let content: ReactElement;

        // If nodeContent is provided, use it for the entire node content
        if (nodeContent) {
            const customContent = nodeContent.get(node.objectItem);
            content = <div className="mx-tree__node-custom-content">{customContent}</div>;
        }
        // Otherwise, render based on label type
        else if (nodeLabelType === "widget" && nodeLabelContent) {
            // Custom widget for label only
            const widgetContent = nodeLabelContent.get(node.objectItem);
            content = <div className="mx-tree__node-label-widget">{widgetContent}</div>;
        }
        // Default label rendering (for attribute or expression types)
        else {
            content = <span className="mx-tree__node-label">{nodeLabel}</span>;
        }

        // Apply search highlighting if there's a search query
        if (searchQuery && searchQuery.length >= 2) {
            const highlightedContent = highlightSearchText(content, searchQuery);
            return highlightedContent;
        }

        return content;
    };

    // Render connecting lines if enabled
    const renderLines = () => {
        if (!showLines) {
            return null;
        }

        return (
            <div className="mx-tree__node-lines" style={{ width: indent }}>
                {/* Vertical lines for each ancestor level */}
                {Array.from({ length: level }).map((_, i) => (
                    <span
                        key={i}
                        className={classNames("mx-tree__node-line-vertical", {
                            // Hide line if this is the last child at that level
                            "mx-tree__node-line-vertical--hidden": isLastChild && i === level - 1
                        })}
                        style={{
                            left: i * indentSize + indentSize / 2 - 0.5
                        }}
                    />
                ))}
                {/* Horizontal line to this node */}
                {level > 0 && (
                    <span
                        className="mx-tree__node-line-horizontal"
                        style={{
                            left: (level - 1) * indentSize + indentSize / 2,
                            width: indentSize / 2
                        }}
                    />
                )}
            </div>
        );
    };

    // Calculate dynamic height style if itemHeight is provided
    const nodeStyle = useMemo(() => {
        const style: React.CSSProperties = {};

        if (itemHeight && itemHeight > 0) {
            style.minHeight = `${itemHeight}px`;
            if (!hasCustomContent) {
                style.height = `${itemHeight}px`;
            }
        }

        return style;
    }, [itemHeight, hasCustomContent]);

    return (
        <Fragment>
            {/* Drop indicator before */}
            {isDraggedOver && dropPosition === "before" && (
                <div className="mx-tree__drop-indicator mx-tree__drop-indicator--before" />
            )}

            <div
                className={classNames("mx-tree__node", {
                    "mx-tree__node--selected": isSelected,
                    "mx-tree__node--highlighted": isHighlighted,
                    "mx-tree__node--focused": isFocused,
                    "mx-tree__node--hovered": isHovered,
                    "mx-tree__node--expanded": isExpanded,
                    "mx-tree__node--collapsed": !isExpanded && (node.children.length > 0 || !node.isLeaf),
                    "mx-tree__node--leaf": node.isLeaf && node.children.length === 0,
                    "mx-tree__node--parent": node.children.length > 0 || !node.isLeaf,
                    "mx-tree__node--visible": isVisible,
                    "mx-tree__node--hidden": !isVisible,
                    "mx-tree__node--sticky": isSticky,
                    "mx-tree__node--dragging": isDragging,
                    "mx-tree__node--dragged-over": isDraggedOver,
                    "mx-tree__node--drop-inside": isDraggedOver && dropPosition === "inside",
                    "mx-tree__node--drop-before": isDraggedOver && dropPosition === "before",
                    "mx-tree__node--drop-after": isDraggedOver && dropPosition === "after",
                    "mx-tree__node--last-child": isLastChild,
                    "mx-tree__node--has-custom-content": hasCustomContent,
                    "mx-tree__node--search-highlighted": isSearchMatch && searchQuery, // Persistent highlight during search
                    "mx-tree__node--search-match": isSearchMatch && !hasVisibleSearchMatch, // Pulse when match is not visible
                    [`mx-tree__node--level-${level}`]: true
                })}
                onClick={onClick}
                onMouseEnter={handleMouseEnter}
                onContextMenu={onContextMenu}
                onKeyDown={handleKeyDown}
                role="treeitem"
                aria-expanded={node.children.length > 0 || !node.isLeaf ? isExpanded : undefined}
                aria-selected={isSelected}
                aria-level={level + 1}
                tabIndex={isFocused ? 0 : -1}
                draggable={false}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onDragEnd={onDragEnd}
                style={nodeStyle}
            >
                <div className="mx-tree__node-wrapper">
                    {/* Indentation spacer */}
                    {!showLines && <span className="mx-tree__node-indent" style={{ width: indent }} />}

                    {/* Tree lines (positioned absolutely) */}
                    {showLines && renderLines()}

                    {/* Node controls */}
                    <div className="mx-tree__node-controls">
                        {/* Drag handle */}
                        {renderDragHandle()}

                        {/* Expand/collapse button */}
                        {renderExpandIcon()}

                        {/* Selection indicator */}
                        {renderSelectionIndicator()}
                    </div>

                    {/* Node content */}
                    <div className="mx-tree__node-content" ref={contentRef}>
                        {renderContent()}
                    </div>

                    {/* Visibility toggle */}
                    {renderVisibilityToggle()}
                </div>
            </div>

            {/* Drop indicator after */}
            {isDraggedOver && dropPosition === "after" && (
                <div className="mx-tree__drop-indicator mx-tree__drop-indicator--after" />
            )}
        </Fragment>
    );
}

// Memoize for performance
export default memo(TreeNodeComponent, (prevProps, nextProps) => {
    // Custom comparison for performance - only re-render if relevant props changed
    return (
        prevProps.node.id === nextProps.node.id &&
        prevProps.isSelected === nextProps.isSelected &&
        prevProps.isHighlighted === nextProps.isHighlighted &&
        prevProps.isFocused === nextProps.isFocused &&
        prevProps.isHovered === nextProps.isHovered &&
        prevProps.isExpanded === nextProps.isExpanded &&
        prevProps.isVisible === nextProps.isVisible &&
        prevProps.isSticky === nextProps.isSticky &&
        prevProps.isDragging === nextProps.isDragging &&
        prevProps.isDraggedOver === nextProps.isDraggedOver &&
        prevProps.dropPosition === nextProps.dropPosition &&
        prevProps.level === nextProps.level &&
        prevProps.isLastChild === nextProps.isLastChild &&
        prevProps.itemHeight === nextProps.itemHeight &&
        prevProps.isSearchMatch === nextProps.isSearchMatch &&
        prevProps.searchQuery === nextProps.searchQuery
    );
});
