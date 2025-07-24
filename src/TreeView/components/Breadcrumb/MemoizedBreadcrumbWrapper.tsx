import { ReactElement, createElement, useMemo, memo, Fragment } from "react";
import { TreeNode } from "../../types/TreeTypes";
import { TreeBreadcrumbEnhanced } from "./TreeBreadcrumbEnhanced";

interface IMemoizedBreadcrumbWrapperProps {
    focusedNodeId: string;
    nodeMap: Map<string, TreeNode>;
    getBreadcrumbPath: () => TreeNode[];
    onNodeClick: (node: TreeNode) => void;
    className?: string;
}

/**
 * Memoized wrapper for TreeBreadcrumbEnhanced to prevent infinite re-renders
 *
 * This component solves the issue where getBreadcrumbPath() was being called
 * on every render, creating a new array reference and causing the breadcrumb
 * to re-render continuously.
 *
 * The breadcrumb path is now properly memoized based on the focused node ID,
 * ensuring it only recalculates when the focused node actually changes.
 */
export const MemoizedBreadcrumbWrapper = memo(
    ({ focusedNodeId, getBreadcrumbPath, onNodeClick, className }: IMemoizedBreadcrumbWrapperProps): ReactElement => {
        // Memoize the breadcrumb path based on focused node ID
        // This prevents the path array from being recreated on every render
        const breadcrumbPath = useMemo(() => {
            console.debug(
                `MemoizedBreadcrumbWrapper [BREADCRUMB][COMPUTE] Building breadcrumb path for node ${focusedNodeId}`
            );

            try {
                const path = getBreadcrumbPath();
                console.debug(
                    `MemoizedBreadcrumbWrapper [BREADCRUMB][COMPUTE] Path computed - length: ${
                        path.length
                    }, nodes: [${path.map(n => n.id).join(" > ")}]`
                );
                return path;
            } catch (error) {
                console.error(
                    `MemoizedBreadcrumbWrapper [ERROR]: Failed to compute breadcrumb path for node ${focusedNodeId}:`,
                    error
                );
                return [];
            }
        }, [focusedNodeId, getBreadcrumbPath]);

        // Don't render if we have no path
        if (breadcrumbPath.length === 0) {
            console.debug(
                `MemoizedBreadcrumbWrapper [BREADCRUMB][RENDER] No path to display for node ${focusedNodeId}`
            );
            return <Fragment></Fragment>;
        }

        return <TreeBreadcrumbEnhanced path={breadcrumbPath} onNodeClick={onNodeClick} className={className} />;
    }
);

MemoizedBreadcrumbWrapper.displayName = "MemoizedBreadcrumbWrapper";
