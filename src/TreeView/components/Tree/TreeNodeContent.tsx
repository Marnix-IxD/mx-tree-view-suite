import { ReactElement, createElement } from "react";
import { TreeNode } from "../../types/TreeTypes";
import { ListWidgetValue, ListAttributeValue, ListExpressionValue } from "mendix";
import { NodeLabelTypeEnum } from "../../../../typings/TreeViewProps";
import { highlightText } from "../../utils/textHighlighting";
import { getNodeHighlighting, NodeContentType } from "../../utils/nodeHighlighting";
import classNames from "classnames";

export interface TreeNodeContentProps {
    node: TreeNode;
    nodeContent?: ListWidgetValue;
    nodeLabelAttribute?: ListAttributeValue<string>;
    // Additional props for enhanced version
    nodeLabelType?: NodeLabelTypeEnum;
    nodeLabelExpression?: ListExpressionValue<string>;
    // Highlighting props
    searchQuery?: string;
    isSearchMatch?: boolean;
    isNavigationTarget?: boolean;
    isExternalNavigationTarget?: boolean;
    // Style props
    className?: string;
}

export function TreeNodeContent({
    node,
    nodeContent,
    nodeLabelAttribute,
    nodeLabelType = "attribute",
    nodeLabelExpression,
    searchQuery,
    isSearchMatch,
    isNavigationTarget,
    isExternalNavigationTarget,
    className
}: TreeNodeContentProps): ReactElement {
    // Get content based on type
    let content: React.ReactNode = null;
    let contentType: NodeContentType = "attribute";

    if (nodeLabelType === "widget" && nodeContent) {
        content = nodeContent.get(node.objectItem);
        contentType = "widget";
    } else if (nodeLabelType === "expression" && nodeLabelExpression) {
        content = nodeLabelExpression.get(node.objectItem).value || "";
        contentType = "expression";
    } else {
        // Default to attribute or fallback
        const label =
            node.label || (nodeLabelAttribute ? nodeLabelAttribute.get(node.objectItem).value : null) || "Untitled";
        content = label;
        contentType = "attribute";
    }

    // Apply highlighting if needed
    if (searchQuery || isNavigationTarget || isExternalNavigationTarget) {
        // Only apply highlighting to text content
        if (contentType !== "widget" && typeof content === "string") {
            const highlighting = getNodeHighlighting(content, {
                nodeId: node.id,
                contentType,
                searchQuery,
                isSearchMatch,
                isNavigationTarget,
                isExternalNavigationTarget
            });

            // For text content, use highlighted version
            return (
                <span className={classNames("tree-node-label", className)} aria-label={highlighting.ariaLabel}>
                    {highlighting.highlightedContent || content}
                </span>
            );
        }

        // For widget content, just apply visual effects without text highlighting
        if (contentType === "widget") {
            const visualClass = classNames({
                "tree-node-highlight-search": isSearchMatch && searchQuery,
                "tree-node-highlight-navigation": isNavigationTarget,
                "tree-node-highlight-external": isExternalNavigationTarget
            });

            return (
                <div
                    className={classNames("tree-node-custom-content", className, visualClass)}
                    aria-label={`${isNavigationTarget ? "Navigation target: " : ""}${node.label || "Custom content"}`}
                >
                    {content}
                </div>
            );
        }
    }

    // No highlighting needed
    if (contentType === "widget") {
        return <div className={classNames("tree-node-custom-content", className)}>{content}</div>;
    }

    return <span className={classNames("tree-node-label", className)}>{content}</span>;
}

/**
 * Simplified version for search results (text only)
 */
export function TreeNodeSearchResult({
    label,
    searchQuery,
    className,
    onClick
}: {
    label: string;
    searchQuery: string;
    className?: string;
    onClick?: () => void;
}): ReactElement {
    const highlightedContent = highlightText(label, { searchQuery });

    return (
        <div className={classNames("tree-node-search-result", className)} onClick={onClick} role="button" tabIndex={0}>
            {highlightedContent}
        </div>
    );
}
