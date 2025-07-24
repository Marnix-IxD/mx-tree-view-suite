import { ReactElement, createElement, useRef, useEffect } from "react";
import { TreeNode } from "../../types/TreeTypes";
import { TreeNode as TreeNodeComponent } from "./TreeNode";
import { TreeVirtualizer } from "./TreeVirtualizer";
import { TreeViewProps } from "../TreeViews/TreeViewProps";
import "../../ui/Tree.css";

export function Tree(props: TreeViewProps): ReactElement {
    const containerRef = useRef<HTMLDivElement>(null);
    const {
        rootNodes,
        nodeMap,
        expandedNodes,
        selectedNodes,
        visibleNodes,
        highlightedNodes,
        focusedNodeId,
        isLoading,
        virtualScrolling,
        itemHeight,
        overscan,
        handleNodeClick,
        handleNodeHover,
        handleContextMenu,
        toggleExpanded,
        toggleVisibility,
        nodeContent,
        nodeLabelAttribute,
        indentSize,
        showLines,
        showIcons,
        enableVisibilityToggle,
        expandIcon,
        collapseIcon,
        visibilityOnIcon,
        visibilityOffIcon,
        stickyHeaderMode
    } = props;

    // Calculate visible tree nodes based on expansion state
    const getVisibleTreeNodes = (): TreeNode[] => {
        const visibleTreeNodes: TreeNode[] = [];

        const addVisibleNodes = (nodes: TreeNode[], level = 0) => {
            nodes.forEach(node => {
                if (visibleNodes.has(node.id)) {
                    visibleTreeNodes.push({ ...node, level });

                    if (expandedNodes.has(node.id) && node.children.length > 0) {
                        addVisibleNodes(node.children, level + 1);
                    }
                }
            });
        };

        addVisibleNodes(rootNodes);
        return visibleTreeNodes;
    };

    const visibleTreeNodes = getVisibleTreeNodes();

    // Auto-scroll to focused node
    useEffect(() => {
        if (focusedNodeId && containerRef.current) {
            const focusedElement = containerRef.current.querySelector(
                `[data-node-id="${focusedNodeId}"]`
            ) as HTMLElement;

            if (focusedElement) {
                focusedElement.scrollIntoView({
                    behavior: "smooth",
                    block: "nearest"
                });
            }
        }
    }, [focusedNodeId]);

    if (isLoading) {
        return (
            <div className="tree-loading">
                <div className="tree-loading-spinner" />
                <span>Loading tree data...</span>
            </div>
        );
    }

    if (rootNodes.length === 0) {
        return <div className="tree-empty">No items to display</div>;
    }

    const renderNode = (node: TreeNode, _index: number) => {
        // For sticky headers, we need to check if this node should be sticky
        // In parent mode: expanded parent nodes with children are sticky
        // In category mode: first node of each category is sticky
        const isSticky = stickyHeaderMode === "parent" ? expandedNodes.has(node.id) && node.children.length > 0 : false; // Category mode sticky headers are handled separately by TreeNodeHeader component

        const hasStickyAncestor = getAncestorsWithStickyHeaders(node).length > 0;

        return (
            <TreeNodeComponent
                key={node.id}
                node={node}
                nodeContent={nodeContent}
                nodeLabelAttribute={nodeLabelAttribute}
                indentSize={indentSize}
                showLines={showLines}
                showIcons={showIcons}
                enableVisibilityToggle={enableVisibilityToggle}
                isSelected={selectedNodes.has(node.id)}
                isHighlighted={highlightedNodes.has(node.id)}
                isFocused={focusedNodeId === node.id}
                isVisible={visibleNodes.has(node.id)}
                isExpanded={expandedNodes.has(node.id)}
                isSticky={isSticky}
                hasStickyAncestor={hasStickyAncestor}
                expandIcon={expandIcon}
                collapseIcon={collapseIcon}
                visibilityOnIcon={visibilityOnIcon}
                visibilityOffIcon={visibilityOffIcon}
                onClick={() => handleNodeClick(node)}
                onHover={() => handleNodeHover(node)}
                onContextMenu={e => handleContextMenu(e, node)}
                onToggleExpanded={() => toggleExpanded(node.id)}
                onToggleVisibility={() => toggleVisibility(node.id)}
            />
        );
    };

    const getAncestorsWithStickyHeaders = (node: TreeNode): TreeNode[] => {
        const ancestors: TreeNode[] = [];
        let currentNode = node;

        while (currentNode.parentId) {
            const parent = nodeMap.get(currentNode.parentId);
            if (parent && expandedNodes.has(parent.id) && parent.children.length > 0) {
                ancestors.push(parent);
            }
            currentNode = parent!;
        }

        return ancestors;
    };

    return (
        <div ref={containerRef} className="tree">
            {virtualScrolling ? (
                <TreeVirtualizer
                    items={visibleTreeNodes}
                    itemHeight={itemHeight}
                    overscan={overscan}
                    renderItem={renderNode}
                />
            ) : (
                <div className="tree-nodes">{visibleTreeNodes.map((node, index) => renderNode(node, index))}</div>
            )}
        </div>
    );
}
