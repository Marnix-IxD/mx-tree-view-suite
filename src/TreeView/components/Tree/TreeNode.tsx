import { ReactElement, createElement, memo } from "react";
import { TreeNode as TreeNodeType } from "../../types/TreeTypes";
import { ListWidgetValue, ListAttributeValue, DynamicValue, WebIcon } from "mendix";
import { TreeNodeContent } from "./TreeNodeContent";
import { Icon } from "../../icons/Icon";
import classNames from "classnames";
import "../../ui/TreeNode.css";

// TODO FIX: This component should check if node.isSkeleton and render skeleton or trigger data loading
// TODO ENHANCE: Add loading spinner overlay when node is loading children
// TODO FIX: Implement smooth transition from skeleton to loaded state

export interface TreeNodeProps {
    node: TreeNodeType;
    nodeContent?: ListWidgetValue;
    nodeLabelAttribute?: ListAttributeValue<string>;
    indentSize: number;
    showLines: boolean;
    showIcons: boolean;
    enableVisibilityToggle: boolean;
    isSelected: boolean;
    isHighlighted: boolean;
    isFocused: boolean;
    isVisible: boolean;
    isExpanded: boolean;
    isSticky: boolean;
    hasStickyAncestor: boolean;
    expandIcon?: DynamicValue<WebIcon>;
    collapseIcon?: DynamicValue<WebIcon>;
    visibilityOnIcon?: DynamicValue<WebIcon>;
    visibilityOffIcon?: DynamicValue<WebIcon>;
    onClick: () => void;
    onHover: () => void;
    onContextMenu: (e: React.MouseEvent) => void;
    onToggleExpanded: () => void;
    onToggleVisibility: () => void;
}

export const TreeNode = memo((props: TreeNodeProps): ReactElement => {
    const {
        node,
        nodeContent,
        nodeLabelAttribute,
        indentSize,
        showLines,
        showIcons,
        enableVisibilityToggle,
        isSelected,
        isHighlighted,
        isFocused,
        isVisible,
        isExpanded,
        isSticky,
        hasStickyAncestor,
        expandIcon,
        collapseIcon,
        visibilityOnIcon,
        visibilityOffIcon,
        onClick,
        onHover,
        onContextMenu,
        onToggleExpanded,
        onToggleVisibility
    } = props;

    const nodeClasses = classNames("mx-tree__node", {
        "mx-tree__node--selected": isSelected,
        "mx-tree__node--highlighted": isHighlighted,
        "mx-tree__node--focused": isFocused,
        "mx-tree__node--hidden": !isVisible,
        "mx-tree__node--expanded": isExpanded,
        "mx-tree__node--leaf": node.isLeaf,
        "mx-tree__node--sticky": isSticky,
        "mx-tree__node--has-sticky-ancestor": hasStickyAncestor
    });

    const nodeStyle = {
        paddingLeft: `${node.level * indentSize}px`
    };

    const handleExpandClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onToggleExpanded();
    };

    const handleVisibilityClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onToggleVisibility();
    };

    const renderExpandIcon = () => {
        if (node.isLeaf || !showIcons) {
            return null;
        }

        const iconClass = classNames("mx-tree__node-expand-button", {
            "mx-tree__node-expand-button--expanded": isExpanded
        });

        return (
            <button className={iconClass} onClick={handleExpandClick} aria-label={isExpanded ? "Collapse" : "Expand"}>
                <Icon
                    icon={isExpanded ? collapseIcon : expandIcon}
                    fallback={isExpanded ? "chevron-down" : "chevron"}
                    className="mx-tree__node-expand-icon-svg"
                />
            </button>
        );
    };

    const renderVisibilityToggle = () => {
        if (!enableVisibilityToggle) {
            return null;
        }

        return (
            <button
                className="mx-tree__node-visibility-button"
                onClick={handleVisibilityClick}
                aria-label={isVisible ? "Hide" : "Show"}
            >
                <Icon
                    icon={isVisible ? visibilityOnIcon : visibilityOffIcon}
                    fallback={isVisible ? "eye-open" : "eye-closed"}
                    className="mx-tree__node-visibility-icon-svg"
                />
            </button>
        );
    };

    return (
        <div
            className={nodeClasses}
            style={nodeStyle}
            data-node-id={node.id}
            onClick={onClick}
            onMouseEnter={onHover}
            onContextMenu={onContextMenu}
            role="treeitem"
            aria-selected={isSelected}
            aria-expanded={!node.isLeaf ? isExpanded : undefined}
            tabIndex={isFocused ? 0 : -1}
        >
            {showLines && (
                <div className="mx-tree__node-lines">{/* Tree connection lines would be rendered here */}</div>
            )}

            <div className="mx-tree__node-content">
                {renderExpandIcon()}

                <TreeNodeContent node={node} nodeContent={nodeContent} nodeLabelAttribute={nodeLabelAttribute} />

                {renderVisibilityToggle()}
            </div>
        </div>
    );
});
