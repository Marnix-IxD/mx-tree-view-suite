// React namespace is accessed through React.FC type annotation
import React, { createElement, CSSProperties, useMemo, useCallback } from "react";
import { TreeViewPreviewProps, NodeLabelTypeEnum } from "../typings/TreeViewProps";

// Constants for preview rendering
const PREVIEW_NODE_HEIGHT = 32;
const PREVIEW_INDENT_SIZE = 20;
const PREVIEW_MAX_NODES = 8; // Limit nodes to prevent overwhelming preview
const PREVIEW_MIN_HEIGHT = 120;
// Preview rendering constants

/**
 * Sample tree data for preview rendering
 * Represents a typical tree structure with various node types
 */
interface PreviewTreeNode {
    id: string;
    label: string;
    level: number;
    isExpanded: boolean;
    hasChildren: boolean;
    isSelected: boolean;
    isVisible: boolean;
    parentId?: string;
    structureId?: string;
}

/**
 * TreeView Editor Preview Component - Production Grade
 *
 * Provides a visual preview of the TreeView widget configuration in Mendix Studio Pro
 * Shows sample tree structure with different display modes and configurations
 * Uses inline styles for compatibility with Mendix Studio Pro's limited rendering environment
 */
// Note: Mendix requires the preview export to be lowercase
// eslint-disable-next-line react-hooks/rules-of-hooks -- Mendix requires lowercase 'preview' for Studio Pro
export const preview: React.FC<TreeViewPreviewProps> = props => {
    const {
        displayAs = "standard",
        nodeLabelType = "attribute",
        parentRelationType = "attribute",
        enableSearch = false,
        enableBreadcrumb = false,
        enableVisibilityToggle = false,
        selectionMode = "single",
        // expandMode = "multiple", // Not used in preview
        searchMode = "client",
        dataLoadingMode = "progressive",
        showLines = false,
        showIcons = true,
        virtualScrolling = false,
        stickyHeaderMode = "none",
        showCategoryItemCount = false,
        class: className = "",
        style: customStyle = ""
    } = props;

    /**
     * Generate sample tree data for preview
     * Creates a realistic tree structure based on widget configuration
     */
    const generateSampleTreeData = useCallback((): PreviewTreeNode[] => {
        const nodes: PreviewTreeNode[] = [];

        // Show different preview data based on parent relation type
        if (parentRelationType === "structureId") {
            // Structure ID example
            nodes.push({
                id: "1",
                label: "Company",
                level: 0,
                isExpanded: true,
                hasChildren: true,
                isSelected: false,
                isVisible: true,
                structureId: "1"
            });

            nodes.push({
                id: "2",
                label: "Engineering",
                level: 1,
                isExpanded: true,
                hasChildren: true,
                isSelected: selectionMode !== "none",
                isVisible: true,
                parentId: "1",
                structureId: "1.1"
            });

            nodes.push({
                id: "3",
                label: "Frontend Team",
                level: 2,
                isExpanded: false,
                hasChildren: false,
                isSelected: false,
                isVisible: true,
                parentId: "2",
                structureId: "1.1.1"
            });
        } else {
            // Regular parent ID example
            nodes.push({
                id: "root1",
                label: nodeLabelType === "expression" ? "Root Node (ID: root1)" : "Documents",
                level: 0,
                isExpanded: true,
                hasChildren: true,
                isSelected: false,
                isVisible: true,
                structureId: "1"
            });

            nodes.push({
                id: "root2",
                label: nodeLabelType === "expression" ? "Root Node (ID: root2)" : "Projects",
                level: 0,
                isExpanded: false,
                hasChildren: true,
                isSelected: selectionMode !== "none",
                isVisible: true,
                structureId: "2"
            });

            // Child nodes under Documents
            nodes.push({
                id: "child1",
                label: nodeLabelType === "widget" ? "📁 Reports" : "Reports",
                level: 1,
                isExpanded: false,
                hasChildren: true,
                isSelected: false,
                isVisible: true,
                parentId: "root1",
                structureId: "1.1"
            });

            nodes.push({
                id: "child2",
                label: nodeLabelType === "widget" ? "🖼️ Images" : "Images",
                level: 1,
                isExpanded: true,
                hasChildren: true,
                isSelected: false,
                isVisible: true,
                parentId: "root1",
                structureId: "1.2"
            });
        }

        // Grandchild nodes
        nodes.push({
            id: "grandchild1",
            label: "Screenshots",
            level: 2,
            isExpanded: false,
            hasChildren: false,
            isSelected: false,
            isVisible: true,
            parentId: "child2",
            structureId: "1.2.1"
        });

        nodes.push({
            id: "grandchild2",
            label: "Logos",
            level: 2,
            isExpanded: false,
            hasChildren: false,
            isSelected: false,
            isVisible: !enableVisibilityToggle, // Show hidden state if visibility toggle enabled
            parentId: "child2",
            structureId: "1.2.2"
        });

        // Add more nodes if there's space
        if (PREVIEW_MAX_NODES > 6) {
            nodes.push({
                id: "child3",
                label: "Archive",
                level: 1,
                isExpanded: false,
                hasChildren: false,
                isSelected: false,
                isVisible: true,
                parentId: "root1",
                structureId: "1.3"
            });
        }

        return nodes.slice(0, PREVIEW_MAX_NODES);
    }, [selectionMode, enableVisibilityToggle, parentRelationType, nodeLabelType]);

    /**
     * Get sample tree data with memoization
     */
    const sampleNodes = useMemo(() => generateSampleTreeData(), [generateSampleTreeData]);

    /**
     * Parse custom style string into React CSSProperties
     * Simple parsing without regex for Mendix Studio Pro compatibility
     */
    const parseInlineStyles = useCallback((styleStr: string): CSSProperties => {
        const styles: CSSProperties = {};
        if (!styleStr) {
            return styles;
        }

        let currentProp = "";
        let currentValue = "";
        let inValue = false;

        for (let i = 0; i < styleStr.length; i++) {
            const char = styleStr[i];

            if (char === ":" && !inValue) {
                inValue = true;
            } else if (char === ";" || i === styleStr.length - 1) {
                if (i === styleStr.length - 1 && char !== ";") {
                    currentValue += char;
                }

                const prop = currentProp.trim();
                const value = currentValue.trim();

                if (prop && value) {
                    // Convert kebab-case to camelCase manually
                    let camelCaseProperty = "";
                    let nextUpper = false;

                    for (const char of prop) {
                        if (char === "-") {
                            nextUpper = true;
                        } else {
                            camelCaseProperty += nextUpper ? char.toUpperCase() : char;
                            nextUpper = false;
                        }
                    }

                    // Set style property with basic validation
                    if (camelCaseProperty && typeof value === "string") {
                        (styles as any)[camelCaseProperty] = value;
                    }
                }

                currentProp = "";
                currentValue = "";
                inValue = false;
            } else if (inValue) {
                currentValue += char;
            } else {
                currentProp += char;
            }
        }

        return styles;
    }, []);

    /**
     * Get display name for node label type
     */
    const getNodeLabelTypeDisplay = useCallback((type: NodeLabelTypeEnum): string => {
        switch (type) {
            case "attribute":
                return "Node.Name";
            case "expression":
                return "{Node.Name + ' (' + Node.Code + ')'}";
            case "widget":
                return "[Custom Widget]";
            default:
                return "Node.Name";
        }
    }, []);

    /**
     * Get icon for expand/collapse state
     */
    const getExpandIcon = useCallback((isExpanded: boolean, hasChildren: boolean): string => {
        if (!hasChildren) {
            return "";
        }
        return isExpanded ? "▼" : "▶";
    }, []);

    /**
     * Get node label text based on configuration
     */
    const getNodeLabelText = useCallback(
        (node: PreviewTreeNode): string => {
            switch (nodeLabelType) {
                case "expression":
                    return node.id === "root1"
                        ? "Documents (DOC)"
                        : node.id === "root2"
                        ? "Projects (PRJ)"
                        : node.label + " (Item)";
                case "widget":
                    return "[" + node.label + " Widget]";
                default:
                    return node.label;
            }
        },
        [nodeLabelType]
    );

    /**
     * Render a single tree node for preview
     */
    const renderPreviewNode = useCallback(
        (node: PreviewTreeNode, index: number) => {
            const indent = node.level * PREVIEW_INDENT_SIZE;
            const isEvenRow = index % 2 === 0;

            const nodeStyles: CSSProperties = {
                display: "flex",
                alignItems: "center",
                height: PREVIEW_NODE_HEIGHT + "px",
                paddingLeft: 8 + indent + "px",
                paddingRight: "8px",
                backgroundColor: node.isSelected
                    ? "rgba(59, 130, 246, 0.1)"
                    : isEvenRow
                    ? "rgba(0, 0, 0, 0.02)"
                    : "transparent",
                borderLeft: node.isSelected ? "3px solid #3b82f6" : "3px solid transparent",
                borderBottom: showLines ? "1px solid rgba(0, 0, 0, 0.05)" : "none",
                opacity: node.isVisible ? 1 : 0.4,
                fontSize: "13px",
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                color: node.isSelected ? "#1d4ed8" : "#374151",
                cursor: "default",
                position: "relative"
            };

            const expandIconStyles: CSSProperties = {
                width: "16px",
                height: "16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginRight: "4px",
                fontSize: "10px",
                color: "#6b7280",
                visibility: showIcons && node.hasChildren ? "visible" : "hidden"
            };

            const selectionIndicatorStyles: CSSProperties = {
                width: "16px",
                height: "16px",
                marginRight: "6px",
                display: selectionMode === "none" ? "none" : "flex",
                alignItems: "center",
                justifyContent: "center"
            };

            const labelStyles: CSSProperties = {
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontWeight: node.level === 0 ? "500" : "normal"
            };

            const visibilityToggleStyles: CSSProperties = {
                width: "16px",
                height: "16px",
                marginLeft: "4px",
                display: enableVisibilityToggle ? "flex" : "none",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "10px",
                color: "#6b7280"
            };

            return (
                <div key={node.id} style={nodeStyles}>
                    {/* Expand/collapse icon */}
                    <div style={expandIconStyles}>{getExpandIcon(node.isExpanded, node.hasChildren)}</div>

                    {/* Selection indicator */}
                    <div style={selectionIndicatorStyles}>
                        {selectionMode === "multi" && (
                            <div
                                style={{
                                    width: "12px",
                                    height: "12px",
                                    border: "1px solid #d1d5db",
                                    backgroundColor: node.isSelected ? "#3b82f6" : "white",
                                    borderRadius: "2px",
                                    position: "relative"
                                }}
                            >
                                {node.isSelected && (
                                    <div
                                        style={{
                                            position: "absolute",
                                            top: "1px",
                                            left: "2px",
                                            width: "6px",
                                            height: "3px",
                                            borderLeft: "2px solid white",
                                            borderBottom: "2px solid white",
                                            transform: "rotate(-45deg)"
                                        }}
                                    />
                                )}
                            </div>
                        )}
                        {selectionMode === "single" && (
                            <div
                                style={{
                                    width: "12px",
                                    height: "12px",
                                    border: "1px solid #d1d5db",
                                    backgroundColor: node.isSelected ? "#3b82f6" : "white",
                                    borderRadius: "50%"
                                }}
                            />
                        )}
                    </div>

                    {/* Node label */}
                    <div style={labelStyles}>{getNodeLabelText(node)}</div>

                    {/* Visibility toggle */}
                    <div style={visibilityToggleStyles}>{node.isVisible ? "👁" : "👁‍🗨"}</div>
                </div>
            );
        },
        [selectionMode, showLines, showIcons, enableVisibilityToggle, getExpandIcon, getNodeLabelText]
    );

    /**
     * Render search bar preview
     */
    const renderSearchPreview = useCallback(() => {
        if (!enableSearch) {
            return null;
        }

        const searchStyles: CSSProperties = {
            padding: "8px",
            borderBottom: "1px solid rgba(0, 0, 0, 0.1)",
            backgroundColor: "rgba(0, 0, 0, 0.02)"
        };

        const searchInputStyles: CSSProperties = {
            width: "100%",
            padding: "6px 32px 6px 8px",
            border: "1px solid #d1d5db",
            borderRadius: "4px",
            fontSize: "13px",
            backgroundColor: "white",
            position: "relative"
        };

        const searchIconStyles: CSSProperties = {
            position: "absolute",
            right: "8px",
            top: "50%",
            transform: "translateY(-50%)",
            color: "#9ca3af",
            fontSize: "14px",
            pointerEvents: "none"
        };

        return (
            <div style={searchStyles}>
                <div style={{ position: "relative" }}>
                    <input style={searchInputStyles} placeholder="Search nodes..." readOnly value="" />
                    <span style={searchIconStyles}>🔍</span>
                </div>
            </div>
        );
    }, [enableSearch]);

    /**
     * Render breadcrumb preview
     */
    const renderBreadcrumbPreview = useCallback(() => {
        if (!enableBreadcrumb) {
            return null;
        }

        const breadcrumbStyles: CSSProperties = {
            padding: "6px 8px",
            borderBottom: "1px solid rgba(0, 0, 0, 0.1)",
            backgroundColor: "rgba(0, 0, 0, 0.01)",
            fontSize: "12px",
            color: "#6b7280"
        };

        return <div style={breadcrumbStyles}>Documents / Images / Screenshots</div>;
    }, [enableBreadcrumb]);

    /**
     * Render category header preview
     */
    const renderCategoryHeaderPreview = useCallback(() => {
        if (stickyHeaderMode !== "category") {
            return null;
        }

        const categoryStyles: CSSProperties = {
            padding: "4px 8px",
            backgroundColor: "rgba(59, 130, 246, 0.05)",
            borderLeft: "3px solid #3b82f6",
            fontSize: "11px",
            fontWeight: "600",
            color: "#1d4ed8",
            textTransform: "uppercase",
            letterSpacing: "0.5px"
        };

        return <div style={categoryStyles}>File System {showCategoryItemCount && "(7 items)"}</div>;
    }, [stickyHeaderMode, showCategoryItemCount]);

    /**
     * Get container styles based on display mode
     */
    const getContainerStyles = useCallback((): CSSProperties => {
        const baseStyles: CSSProperties = {
            width: "100%",
            minHeight: PREVIEW_MIN_HEIGHT + "px",
            border: "1px solid #e5e7eb",
            borderRadius: "6px",
            backgroundColor: "white",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            fontSize: "13px",
            overflow: "hidden",
            position: "relative",
            ...parseInlineStyles(customStyle)
        };

        // Adjust styles based on display mode
        switch (displayAs) {
            case "floating":
                return {
                    ...baseStyles,
                    boxShadow: "0 10px 25px rgba(0, 0, 0, 0.15)",
                    border: "1px solid #d1d5db"
                };
            case "sliding":
                return {
                    ...baseStyles,
                    borderRadius: "0",
                    borderLeft: "none",
                    borderRight: "none"
                };
            default:
                return baseStyles;
        }
    }, [displayAs, customStyle, parseInlineStyles]);

    /**
     * Build container class names
     */
    const containerClasses = useMemo(() => {
        const classes = ["tree-view-preview", `tree-view--${displayAs}`, className];

        if (virtualScrolling) {
            classes.push("tree-view--virtual");
        }
        if (enableSearch) {
            classes.push("tree-view--with-search");
        }
        if (enableBreadcrumb) {
            classes.push("tree-view--with-breadcrumb");
        }
        if (selectionMode !== "none") {
            classes.push("tree-view--selectable");
        }

        return classes.filter(Boolean).join(" ");
    }, [displayAs, className, virtualScrolling, enableSearch, enableBreadcrumb, selectionMode]);

    /**
     * Render mode indicator
     */
    const renderModeIndicator = useCallback(() => {
        const indicatorStyles: CSSProperties = {
            position: "absolute",
            top: "4px",
            right: "4px",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "10px",
            color: "#6b7280",
            backgroundColor: "rgba(255, 255, 255, 0.9)",
            padding: "2px 6px",
            borderRadius: "3px",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
            zIndex: 10
        };

        const getModeDisplay = (): string => {
            const modes = [];
            if (displayAs !== "standard") {
                modes.push(displayAs.toUpperCase());
            }
            if (virtualScrolling) {
                modes.push("VIRTUAL");
            }
            if (searchMode === "server") {
                modes.push("SERVER");
            }
            if (dataLoadingMode === "progressive") {
                modes.push("PROG");
            }
            return modes.join(" | ") || "STANDARD";
        };

        return (
            <div style={indicatorStyles}>
                <span>🌳</span>
                <span style={{ fontWeight: "500", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    {getModeDisplay()}
                </span>
            </div>
        );
    }, [displayAs, virtualScrolling, searchMode, dataLoadingMode]);

    /**
     * Render configuration summary
     */
    const renderConfigSummary = useCallback(() => {
        const summaryStyles: CSSProperties = {
            position: "absolute",
            bottom: "4px",
            left: "4px",
            fontSize: "9px",
            color: "#9ca3af",
            backgroundColor: "rgba(255, 255, 255, 0.8)",
            padding: "2px 4px",
            borderRadius: "2px",
            zIndex: 10
        };

        const getConfigText = (): string => {
            const parts = [];
            parts.push(getNodeLabelTypeDisplay(nodeLabelType));
            if (parentRelationType !== "attribute") {
                parts.push(parentRelationType);
            }
            if (selectionMode !== "none") {
                parts.push(`sel:${selectionMode}`);
            }
            return parts.join(" | ");
        };

        return <div style={summaryStyles}>{getConfigText()}</div>;
    }, [nodeLabelType, parentRelationType, selectionMode, getNodeLabelTypeDisplay]);

    return (
        <div className={containerClasses} style={getContainerStyles()}>
            {/* Mode indicator */}
            {renderModeIndicator()}

            {/* Configuration summary */}
            {renderConfigSummary()}

            {/* Search bar */}
            {renderSearchPreview()}

            {/* Breadcrumb */}
            {renderBreadcrumbPreview()}

            {/* Category header */}
            {renderCategoryHeaderPreview()}

            {/* Tree nodes */}
            <div style={{ overflow: "hidden" }}>{sampleNodes.map((node, index) => renderPreviewNode(node, index))}</div>

            {/* Virtual scrolling indicator */}
            {virtualScrolling && (
                <div
                    style={{
                        position: "absolute",
                        bottom: "0",
                        right: "0",
                        width: "8px",
                        height: "30px",
                        backgroundColor: "rgba(59, 130, 246, 0.3)",
                        borderRadius: "4px 0 0 4px"
                    }}
                />
            )}
        </div>
    );
};

/**
 * Get preview CSS styles
 * Provides all necessary styles for the editor preview
 */
export function getPreviewCss(): string {
    return `
        /* Base tree view preview styles */
        .tree-view-preview {
            box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            position: relative;
            contain: layout style;
        }

        /* Display mode specific styles */
        .tree-view--floating {
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15) !important;
        }

        .tree-view--sliding {
            border-radius: 0 !important;
            border-left: none !important;
            border-right: none !important;
        }

        /* Selection styles */
        .tree-view--selectable .tree-node-selected {
            background-color: rgba(59, 130, 246, 0.1) !important;
            border-left-color: #3b82f6 !important;
        }

        /* Virtual scrolling indicator */
        .tree-view--virtual::after {
            content: "";
            position: absolute;
            bottom: 0;
            right: 0;
            width: 8px;
            height: 30px;
            background-color: rgba(59, 130, 246, 0.3);
            border-radius: 4px 0 0 4px;
        }

        /* Search enabled styles */
        .tree-view--with-search {
            border-top: 2px solid #3b82f6;
        }

        /* Breadcrumb enabled styles */
        .tree-view--with-breadcrumb .tree-view-breadcrumb {
            border-bottom: 1px solid rgba(0, 0, 0, 0.1);
        }

        /* Ensure proper text rendering */
        .tree-view-preview * {
            box-sizing: border-box;
        }

        /* Responsive behavior for small editor views */
        .tree-view-preview {
            min-width: 250px;
        }

        /* Hover states for better interaction feedback */
        .tree-view-preview:hover {
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        /* Focus styles for accessibility */
        .tree-view-preview:focus-visible {
            outline: 2px solid #3b82f6;
            outline-offset: 2px;
        }

        /* Text selection prevention */
        .tree-view-preview {
            user-select: none;
            -webkit-user-select: none;
            -moz-user-select: none;
        }

        /* Smooth transitions */
        .tree-view-preview,
        .tree-view-preview * {
            transition: all 0.2s ease;
        }
    `;
}
