import { ReactElement, createElement } from "react";
import { TreeNode } from "../../types/TreeTypes";
import { ListAttributeValue } from "mendix";
import "../../ui/TreeSearchResults.css";

export interface TreeSearchResultsProps {
    results: any[];
    totalCount: number;
    currentPage: number;
    resultsPerPage: number;
    onPageChange: (page: number) => void;
    onSelectResult: (nodeId: string) => void;
    onClose: () => void;
    nodeMap: Map<string, TreeNode>;
    nodeLabelAttribute: ListAttributeValue<string>;
    isLoading: boolean;
}

export function TreeSearchResults({
    results,
    totalCount,
    currentPage,
    resultsPerPage,
    onPageChange,
    onSelectResult,
    onClose,
    nodeMap,
    nodeLabelAttribute,
    isLoading
}: TreeSearchResultsProps): ReactElement {
    const totalPages = Math.ceil(totalCount / resultsPerPage);

    const handleResultClick = (nodeId: string) => {
        onSelectResult(nodeId);
        onClose();
    };

    const renderPath = (node: TreeNode): string => {
        const path: string[] = [];
        let current: TreeNode | undefined = node;

        while (current && current.parentId) {
            const parent = nodeMap.get(current.parentId);
            if (parent) {
                const label = parent.label || nodeLabelAttribute.get(parent.objectItem).value || "Untitled";
                path.unshift(label);
                current = parent;
            } else {
                break;
            }
        }

        return path.join(" > ");
    };

    if (isLoading) {
        return (
            <div className="tree-search-results tree-search-results--loading">
                <div className="tree-search-results-spinner" />
                <span>Searching...</span>
            </div>
        );
    }

    if (results.length === 0) {
        return (
            <div className="tree-search-results tree-search-results--empty">
                <p>No results found</p>
                <button className="tree-search-results-close" onClick={onClose}>
                    Close
                </button>
            </div>
        );
    }

    return (
        <div className="tree-search-results">
            <div className="tree-search-results-header">
                <h3>Search Results ({totalCount})</h3>
                <button className="tree-search-results-close" onClick={onClose} aria-label="Close search results">
                    ✕
                </button>
            </div>

            <div className="tree-search-results-list">
                {results.map(result => {
                    const node = nodeMap.get(result.nodeId);
                    if (!node) {
                        return null;
                    }

                    const label = node.label || nodeLabelAttribute.get(node.objectItem).value || "Untitled";
                    const path = renderPath(node);

                    return (
                        <div
                            key={result.nodeId}
                            className="tree-search-result"
                            onClick={() => handleResultClick(result.nodeId)}
                        >
                            <div className="tree-search-result-label">{label}</div>
                            {path && <div className="tree-search-result-path">{path}</div>}
                        </div>
                    );
                })}
            </div>

            {totalPages > 1 && (
                <div className="tree-search-results-pagination">
                    <button
                        onClick={() => onPageChange(currentPage - 1)}
                        disabled={currentPage === 0}
                        className="tree-search-results-page-button"
                    >
                        Previous
                    </button>
                    <span className="tree-search-results-page-info">
                        Page {currentPage + 1} of {totalPages}
                    </span>
                    <button
                        onClick={() => onPageChange(currentPage + 1)}
                        disabled={currentPage === totalPages - 1}
                        className="tree-search-results-page-button"
                    >
                        Next
                    </button>
                </div>
            )}
        </div>
    );
}
