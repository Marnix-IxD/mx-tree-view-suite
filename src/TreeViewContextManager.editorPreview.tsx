import { Fragment, ReactElement, createElement, CSSProperties } from "react";
import { TreeViewContextManagerPreviewProps } from "../typings/TreeViewContextManagerProps";

// Helper function to parse style string into CSSProperties
function parseStyle(style = ""): CSSProperties {
    const styleObject: CSSProperties = {};
    if (!style) {
        return styleObject;
    }

    style.split(";").forEach(rule => {
        const [property, value] = rule.split(":").map(s => s.trim());
        if (property && value) {
            // Convert kebab-case to camelCase
            const camelProperty = property.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
            (styleObject as any)[camelProperty] = value;
        }
    });

    return styleObject;
}

/**
 * Preview component for TreeViewContextManager widget in Mendix Studio Pro
 * Provides visual representation of managed trees and their configurations
 */
export function preview(props: TreeViewContextManagerPreviewProps): ReactElement {
    const {
        managedTreeViews,
        enableCrossTreeDragDrop,
        showDropZoneIndicators,
        selectionMode,
        debugMode,
        containerClass,
        style
    } = props;

    // Determine if we should show action buttons between trees based on drag/drop settings
    const showActionButtons = enableCrossTreeDragDrop && showDropZoneIndicators;
    const treeCount = managedTreeViews.length || 0;

    return (
        <div
            className={`tree-view-context-manager-preview ${containerClass}`}
            style={props.styleObject || parseStyle(style)}
        >
            {/* Header Section */}
            <div className="context-manager-header">
                <h4>Tree View Context Manager</h4>
                <div className="context-manager-info">
                    <span className="info-item">
                        <strong>Trees:</strong> {treeCount}
                    </span>
                    <span className="info-item">
                        <strong>Selection:</strong> {selectionMode}
                    </span>
                    {enableCrossTreeDragDrop && (
                        <span className="info-item">
                            <strong>Drag & Drop:</strong> Enabled
                        </span>
                    )}
                </div>
            </div>

            {/* Trees Container */}
            <div className="managed-trees-container">
                {treeCount === 0 ? (
                    <div className="empty-state">
                        <p>No tree views configured yet.</p>
                        <p className="hint">Add tree configurations in the "Managed Tree Views" section.</p>
                    </div>
                ) : (
                    <div className={`trees-layout ${showActionButtons ? "with-actions" : "no-actions"}`}>
                        {managedTreeViews.map((tree, index) => (
                            <Fragment key={tree.treeIdentifier || `tree-${index}`}>
                                {/* Tree View Preview */}
                                <div
                                    className="tree-preview"
                                    style={{
                                        flex: tree.treeLayoutWeight || 1,
                                        minWidth: "200px"
                                    }}
                                >
                                    <div className="tree-header">
                                        <h5>{tree.displayName || tree.treeIdentifier || `Tree ${index + 1}`}</h5>
                                        <div className="tree-capabilities">
                                            {tree.allowDragFrom && <span className="capability drag">↗ Drag</span>}
                                            {tree.allowDropTo && <span className="capability drop">↘ Drop</span>}
                                        </div>
                                    </div>

                                    <div className="tree-body">
                                        <div className="tree-placeholder">
                                            <svg width="100%" height="200" viewBox="0 0 300 200">
                                                {/* Tree structure visualization */}
                                                <line x1="50" y1="30" x2="50" y2="170" stroke="#ddd" strokeWidth="2" />
                                                <line x1="50" y1="50" x2="70" y2="50" stroke="#ddd" strokeWidth="1" />
                                                <line x1="50" y1="80" x2="70" y2="80" stroke="#ddd" strokeWidth="1" />
                                                <line x1="50" y1="110" x2="70" y2="110" stroke="#ddd" strokeWidth="1" />
                                                <line x1="70" y1="110" x2="70" y2="140" stroke="#ddd" strokeWidth="1" />
                                                <line x1="70" y1="140" x2="90" y2="140" stroke="#ddd" strokeWidth="1" />

                                                {/* Tree nodes */}
                                                <rect
                                                    x="70"
                                                    y="40"
                                                    width="120"
                                                    height="20"
                                                    rx="3"
                                                    fill="#f0f0f0"
                                                    stroke="#ccc"
                                                />
                                                <text x="80" y="54" fontSize="12" fill="#666">
                                                    Node 1
                                                </text>

                                                <rect
                                                    x="70"
                                                    y="70"
                                                    width="120"
                                                    height="20"
                                                    rx="3"
                                                    fill="#f0f0f0"
                                                    stroke="#ccc"
                                                />
                                                <text x="80" y="84" fontSize="12" fill="#666">
                                                    Node 2
                                                </text>

                                                <rect
                                                    x="70"
                                                    y="100"
                                                    width="120"
                                                    height="20"
                                                    rx="3"
                                                    fill="#f0f0f0"
                                                    stroke="#ccc"
                                                />
                                                <text x="80" y="114" fontSize="12" fill="#666">
                                                    Node 3
                                                </text>

                                                <rect
                                                    x="90"
                                                    y="130"
                                                    width="100"
                                                    height="20"
                                                    rx="3"
                                                    fill="#e8e8e8"
                                                    stroke="#ccc"
                                                />
                                                <text x="100" y="144" fontSize="11" fill="#666">
                                                    Child 3.1
                                                </text>

                                                {/* Selection indicators if enabled */}
                                                {selectionMode !== "none" && (
                                                    <Fragment>
                                                        <rect
                                                            x="190"
                                                            y="40"
                                                            width="16"
                                                            height="20"
                                                            fill="transparent"
                                                        />
                                                        <rect
                                                            x="192"
                                                            y="45"
                                                            width="10"
                                                            height="10"
                                                            rx="2"
                                                            fill="white"
                                                            stroke="#666"
                                                            strokeWidth="1"
                                                        />

                                                        <rect
                                                            x="190"
                                                            y="70"
                                                            width="16"
                                                            height="20"
                                                            fill="transparent"
                                                        />
                                                        <rect
                                                            x="192"
                                                            y="75"
                                                            width="10"
                                                            height="10"
                                                            rx="2"
                                                            fill="#007bff"
                                                            stroke="#007bff"
                                                            strokeWidth="1"
                                                        />
                                                        <path
                                                            d="M 194 78 L 196 80 L 200 76"
                                                            stroke="white"
                                                            strokeWidth="2"
                                                            fill="none"
                                                        />
                                                    </Fragment>
                                                )}
                                            </svg>
                                        </div>

                                        {/* Tree configuration summary */}
                                        <div className="tree-config-summary">
                                            {tree.selectionAssociation && (
                                                <div className="config-item">
                                                    <span className="label">Association:</span>
                                                    <span className="value">{tree.selectionAssociation}</span>
                                                </div>
                                            )}
                                            {tree.overrideSelectionMode && tree.treeSelectionMode && (
                                                <div className="config-item">
                                                    <span className="label">Selection:</span>
                                                    <span className="value">{tree.treeSelectionMode}</span>
                                                </div>
                                            )}
                                            {tree.allowDragFrom && tree.dragRestriction !== "none" && (
                                                <div className="config-item">
                                                    <span className="label">Drag:</span>
                                                    <span className="value">{tree.dragRestriction}</span>
                                                </div>
                                            )}
                                            {tree.allowDropTo && tree.magneticDropZones && (
                                                <div className="config-item">
                                                    <span className="label">Magnetic:</span>
                                                    <span className="value">Yes ({tree.magneticRange || 50}px)</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Action buttons between trees */}
                                {showActionButtons && index < managedTreeViews.length - 1 && (
                                    <div className="action-buttons-container">
                                        <div className="action-buttons">
                                            <button
                                                className="action-button transfer-right"
                                                title="Transfer selected to right"
                                            >
                                                <svg width="20" height="20" viewBox="0 0 20 20">
                                                    <path d="M12 4l6 6-6 6v-4H4v-4h8V4z" fill="currentColor" />
                                                </svg>
                                            </button>
                                            <button
                                                className="action-button transfer-left"
                                                title="Transfer selected to left"
                                            >
                                                <svg width="20" height="20" viewBox="0 0 20 20">
                                                    <path d="M8 16l-6-6 6-6v4h8v4H8v4z" fill="currentColor" />
                                                </svg>
                                            </button>
                                            <div className="action-hint">Transfer Actions</div>
                                        </div>
                                    </div>
                                )}
                            </Fragment>
                        ))}
                    </div>
                )}
            </div>

            {/* Content placeholder for child widgets */}
            <div className="content-placeholder">
                <div className="placeholder-content">
                    <props.content.renderer>
                        <div>Content area for tree views</div>
                    </props.content.renderer>
                </div>
            </div>

            {/* Debug mode indicator */}
            {debugMode && (
                <div className="debug-indicator">
                    <span className="debug-icon">🐛</span>
                    <span>Debug mode enabled - Performance metrics will be shown</span>
                </div>
            )}

            {/* Inline styles for preview */}
            <style>{`
                .tree-view-context-manager-preview {
                    border: 1px solid #e0e0e0;
                    border-radius: 8px;
                    padding: 16px;
                    background: #f8f9fa;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                }

                .context-manager-header {
                    margin-bottom: 16px;
                    border-bottom: 1px solid #e0e0e0;
                    padding-bottom: 12px;
                }

                .context-manager-header h4 {
                    margin: 0 0 8px 0;
                    color: #333;
                    font-size: 16px;
                    font-weight: 600;
                }

                .context-manager-info {
                    display: flex;
                    gap: 16px;
                    font-size: 12px;
                    color: #666;
                }

                .info-item strong {
                    font-weight: 600;
                    margin-right: 4px;
                }

                .managed-trees-container {
                    background: white;
                    border-radius: 6px;
                    padding: 16px;
                    min-height: 280px;
                }

                .empty-state {
                    text-align: center;
                    padding: 60px 20px;
                    color: #666;
                }

                .empty-state p {
                    margin: 0 0 8px 0;
                }

                .empty-state .hint {
                    font-size: 12px;
                    color: #999;
                }

                .trees-layout {
                    display: flex;
                    gap: 16px;
                    align-items: stretch;
                }

                .trees-layout.with-actions {
                    gap: 8px;
                }

                .tree-preview {
                    background: #f8f9fa;
                    border: 1px solid #dee2e6;
                    border-radius: 6px;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                }

                .tree-header {
                    background: #e9ecef;
                    padding: 12px;
                    border-bottom: 1px solid #dee2e6;
                }

                .tree-header h5 {
                    margin: 0 0 4px 0;
                    font-size: 14px;
                    font-weight: 600;
                    color: #495057;
                }

                .tree-capabilities {
                    display: flex;
                    gap: 8px;
                    margin-top: 4px;
                }

                .capability {
                    font-size: 11px;
                    padding: 2px 6px;
                    border-radius: 3px;
                    font-weight: 500;
                }

                .capability.drag {
                    background: #e3f2fd;
                    color: #1976d2;
                }

                .capability.drop {
                    background: #f3e5f5;
                    color: #7b1fa2;
                }

                .tree-body {
                    flex: 1;
                    padding: 12px;
                    display: flex;
                    flex-direction: column;
                }

                .tree-placeholder {
                    flex: 1;
                    background: white;
                    border: 1px dashed #dee2e6;
                    border-radius: 4px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 12px;
                }

                .tree-config-summary {
                    font-size: 11px;
                    color: #666;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }

                .config-item {
                    display: flex;
                    justify-content: space-between;
                }

                .config-item .label {
                    font-weight: 600;
                    color: #495057;
                }

                .config-item .value {
                    color: #6c757d;
                    text-align: right;
                    flex: 1;
                    margin-left: 8px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .action-buttons-container {
                    display: flex;
                    align-items: center;
                    padding: 0 8px;
                }

                .action-buttons {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    align-items: center;
                }

                .action-button {
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    border: 1px solid #dee2e6;
                    background: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: all 0.2s;
                    color: #495057;
                }

                .action-button:hover {
                    background: #f8f9fa;
                    border-color: #adb5bd;
                    transform: scale(1.05);
                }

                .action-button.transfer-right {
                    color: #28a745;
                }

                .action-button.transfer-left {
                    color: #17a2b8;
                }

                .action-hint {
                    font-size: 10px;
                    color: #6c757d;
                    text-align: center;
                    margin-top: 4px;
                    white-space: nowrap;
                }

                .content-placeholder {
                    margin-top: 16px;
                    border-top: 1px solid #e0e0e0;
                    padding-top: 16px;
                }

                .placeholder-content {
                    min-height: 40px;
                    background: #f0f0f0;
                    border: 1px dashed #ccc;
                    border-radius: 4px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #666;
                    font-size: 12px;
                }

                .debug-indicator {
                    margin-top: 16px;
                    padding: 8px 12px;
                    background: #fff3cd;
                    border: 1px solid #ffeeba;
                    border-radius: 4px;
                    color: #856404;
                    font-size: 12px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .debug-icon {
                    font-size: 16px;
                }
            `}</style>
        </div>
    );
}

/**
 * Returns any additional CSS needed for the preview
 * Currently not required as styles are inline
 */
export function getPreviewCss(): string {
    return "";
}
