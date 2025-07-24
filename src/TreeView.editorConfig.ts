import { TreeViewPreviewProps, ContextMenuActionsPreviewType } from "../typings/TreeViewProps";
import {
    Properties,
    hidePropertiesIn,
    hidePropertyIn,
    transformGroupsIntoTabs,
    Problem
} from "@mendix/pluggable-widgets-tools";

/**
 * TreeView Editor Configuration - Production Grade
 *
 * Provides intelligent validation, property visibility control, and custom captions
 * for optimal TreeView widget configuration experience in Mendix Studio Pro
 *
 * Key features:
 * - Smart property hiding based on dependencies
 * - Comprehensive validation with helpful error messages
 * - Organized property groups with logical tabs
 * - Performance and accessibility guidance
 */

// Constants for validation
const MAX_CACHE_TIMEOUT = 300000; // 5 minutes
const MIN_CACHE_TIMEOUT = 1000; // 1 second
const MAX_INITIAL_LOAD_LIMIT = 10000;
const MIN_INITIAL_LOAD_LIMIT = 10;
const MAX_DEBOUNCE_DELAY = 2000;
const MIN_DEBOUNCE_DELAY = 50;

/**
 * Validation helper: Check if a string value is empty or whitespace
 */
function isEmpty(value: string | undefined): boolean {
    return !value || value.trim().length === 0;
}

/**
 * Validation helper: Check if a numeric value is within range
 */
function isInRange(value: number, min: number, max: number): boolean {
    return value >= min && value <= max;
}

/**
 * Validation helper: Check if datasource has required attributes
 */
function validateDatasourceAttributes(values: TreeViewPreviewProps): Problem[] {
    const errors: Problem[] = [];

    // Check if datasource is configured
    if (!values.datasource) {
        errors.push({
            property: "datasource",
            message: "Data source is required for the tree view widget",
            severity: "error"
        });
        return errors;
    }

    // Validate node ID attribute
    if (!values.nodeIdAttribute) {
        errors.push({
            property: "nodeIdAttribute",
            message: "Node ID attribute is required to uniquely identify tree nodes",
            severity: "error"
        });
    }

    // Validate level attribute - CRITICAL for tree structure
    if (!values.levelAttribute) {
        errors.push({
            property: "levelAttribute",
            message:
                "Level attribute is required for tree hierarchy. Must be an integer indicating depth (1=root, 2=child, etc.)",
            severity: "error"
        });
    }

    // Validate sort order attribute - CRITICAL for sibling ordering
    if (!values.sortOrderAttribute) {
        errors.push({
            property: "sortOrderAttribute",
            message: "Sort order attribute is required to maintain consistent node ordering",
            severity: "error"
        });
    }

    // Validate parent relation configuration
    if (values.parentRelationType === "attribute" && !values.parentIdAttribute) {
        errors.push({
            property: "parentIdAttribute",
            message: "Parent ID attribute is required when using attribute-based parent relation",
            severity: "error"
        });
    }

    if (values.parentRelationType === "association" && !values.parentAssociation) {
        errors.push({
            property: "parentAssociation",
            message: "Parent association is required when using association-based parent relation",
            severity: "error"
        });
    }

    if (values.parentRelationType === "structureId" && !values.structureIdAttribute) {
        errors.push({
            property: "structureIdAttribute",
            message: "Structure ID attribute is required when using structure ID-based hierarchy",
            severity: "error"
        });
    }

    return errors;
}

/**
 * Validation helper: Check node label configuration
 */
function validateNodeLabelConfiguration(values: TreeViewPreviewProps): Problem[] {
    const errors: Problem[] = [];

    if (values.nodeLabelType === "attribute" && !values.nodeLabelAttribute) {
        errors.push({
            property: "nodeLabelAttribute",
            message: "Node label attribute is required when label type is set to 'Attribute'",
            severity: "error"
        });
    }

    if (values.nodeLabelType === "expression" && !values.nodeLabelExpression) {
        errors.push({
            property: "nodeLabelExpression",
            message: "Node label expression is required when label type is set to 'Expression'",
            severity: "error"
        });
    }

    if (values.nodeLabelType === "widget" && !values.nodeLabelContent) {
        errors.push({
            property: "nodeLabelContent",
            message: "Node label content is required when label type is set to 'Custom widget'",
            severity: "error"
        });
    }

    return errors;
}

/**
 * Validation helper: Check performance-related settings
 */
function validatePerformanceSettings(values: TreeViewPreviewProps): Problem[] {
    const errors: Problem[] = [];

    // Validate cache timeout
    if (values.cacheTimeout !== undefined && values.cacheTimeout !== null) {
        if (!isInRange(values.cacheTimeout, MIN_CACHE_TIMEOUT, MAX_CACHE_TIMEOUT)) {
            errors.push({
                property: "cacheTimeout",
                message: `Cache timeout must be between ${MIN_CACHE_TIMEOUT} and ${MAX_CACHE_TIMEOUT} milliseconds`,
                severity: "warning"
            });
        }
    }

    // Validate initial load limit
    if (values.initialLoadLimit !== undefined && values.initialLoadLimit !== null) {
        if (!isInRange(values.initialLoadLimit, MIN_INITIAL_LOAD_LIMIT, MAX_INITIAL_LOAD_LIMIT)) {
            errors.push({
                property: "initialLoadLimit",
                message: `Initial load limit must be between ${MIN_INITIAL_LOAD_LIMIT} and ${MAX_INITIAL_LOAD_LIMIT} items`,
                severity: "warning"
            });
        }

        // Warn about performance with large initial loads
        if (values.initialLoadLimit !== null && values.initialLoadLimit > 1000) {
            errors.push({
                property: "initialLoadLimit",
                message:
                    "Loading more than 1000 items initially may impact performance. Consider using progressive loading.",
                severity: "warning"
            });
        }
    }

    // Validate search debounce
    if (values.searchDebounce !== undefined && values.searchDebounce !== null) {
        if (!isInRange(values.searchDebounce, MIN_DEBOUNCE_DELAY, MAX_DEBOUNCE_DELAY)) {
            errors.push({
                property: "searchDebounce",
                message: `Search debounce must be between ${MIN_DEBOUNCE_DELAY} and ${MAX_DEBOUNCE_DELAY} milliseconds`,
                severity: "warning"
            });
        }
    }

    return errors;
}

/**
 * Validation helper: Check search configuration
 */
function validateSearchConfiguration(values: TreeViewPreviewProps): Problem[] {
    const errors: Problem[] = [];

    // Validate server search configuration
    if (values.searchMode === "server" && isEmpty(values.serverSearchAction as string)) {
        errors.push({
            property: "serverSearchAction",
            message: "Server search action is required when search mode is set to 'Server'",
            severity: "error"
        });
    }

    if (values.searchMode === "hybrid") {
        if (isEmpty(values.serverSearchAction as string)) {
            errors.push({
                property: "serverSearchAction",
                message: "Server search action is required for hybrid search mode",
                severity: "error"
            });
        }
    }

    // Validate filter configuration for search
    if (values.enableSearch && (!values.filterList || values.filterList.length === 0)) {
        errors.push({
            property: "filterList",
            message: "At least one filter must be configured when search is enabled",
            severity: "warning"
        });
    }

    return errors;
}

/**
 * Validation helper: Check selection configuration
 */
function validateSelectionConfiguration(values: TreeViewPreviewProps): Problem[] {
    const errors: Problem[] = [];

    // Validate selection configuration based on storage method
    if (values.selectionMode !== "none") {
        if (values.selectionStorageMethod === "association") {
            // Validate association-based selection
            if (!values.selectionsAssociation) {
                errors.push({
                    property: "selectionsAssociation",
                    message: "Selection association is required when using association storage method",
                    severity: "error"
                });
            }
            if (!values.nativeSelection) {
                errors.push({
                    property: "nativeSelection",
                    message: "Native selection is required when using association storage method",
                    severity: "error"
                });
            }
            // Check native selection type matches selection mode
            if (
                values.nativeSelection === "Single" &&
                (values.selectionMode === "multi" ||
                    values.selectionMode === "branch" ||
                    values.selectionMode === "path")
            ) {
                errors.push({
                    property: "nativeSelection",
                    message:
                        "Native selection type 'Single' cannot be used with multi/branch/path selection modes. Use 'Multi' instead.",
                    severity: "error"
                });
            }
            if (values.nativeSelection === "Multi" && values.selectionMode === "single") {
                errors.push({
                    property: "nativeSelection",
                    message:
                        "Native selection type 'Multi' is not recommended for single selection mode. Consider using 'Single' instead.",
                    severity: "warning"
                });
            }
        } else if (values.selectionStorageMethod === "asyncApi") {
            // Validate API-based selection
            if (!values.serverSideSelectionsJSONAttribute) {
                errors.push({
                    property: "serverSideSelectionsJSONAttribute",
                    message: "Server-side selections JSON attribute is required when using async API storage method",
                    severity: "error"
                });
            }

            // Validate selection output attributes
            if (values.selectionOutputType === "attributes" && !values.selectedNodeIdAttribute) {
                errors.push({
                    property: "selectedNodeIdAttribute",
                    message: "Selected node ID attribute is required when selection output type is 'Attributes'",
                    severity: "error"
                });
            }
        }
    }

    // Validate context menu
    if (values.contextMenuActions && values.contextMenuActions.length > 0 && values.selectionMode === "none") {
        errors.push({
            property: "contextMenuActions",
            message: "Context menu actions require selection to be enabled",
            severity: "warning"
        });
    }

    return errors;
}

/**
 * Validation helper: Check structure ID attribute usage
 */
function validateStructureIdAttributes(values: TreeViewPreviewProps): Problem[] {
    const errors: Problem[] = [];

    // Check if using client-side structure ID generation
    const isClientSideGeneration = !values.structureIdAttribute;

    // Validate focused node structure ID
    if (isClientSideGeneration && values.focusedStructureIdAttribute) {
        errors.push({
            property: "focusedStructureIdAttribute",
            message:
                "Focused node structure ID attribute cannot be used with client-side structure ID generation. The server doesn't know about client-generated IDs. Use focusedNodeIdAttribute instead.",
            severity: "error"
        });
    }

    // Validate hovered node structure ID
    if (isClientSideGeneration && values.hoveredStructureIdAttribute) {
        errors.push({
            property: "hoveredStructureIdAttribute",
            message:
                "Hovered node structure ID attribute cannot be used with client-side structure ID generation. The server doesn't know about client-generated IDs. Use hoveredNodeIdAttribute instead.",
            severity: "error"
        });
    }

    // Validate selected node structure ID
    if (isClientSideGeneration && values.selectedStructureIdAttribute) {
        errors.push({
            property: "selectedStructureIdAttribute",
            message:
                "Selected node structure ID attribute cannot be used with client-side structure ID generation. The server doesn't know about client-generated IDs. Use selectedNodeIdAttribute instead.",
            severity: "error"
        });
    }

    // Warn about progressive loading with structure ID attributes
    if (values.structureIdAttribute && values.dataLoadingMode !== "all") {
        if (values.focusedStructureIdAttribute) {
            errors.push({
                property: "focusedStructureIdAttribute",
                message:
                    "Focused structure ID may not work reliably with progressive loading if the node hasn't been loaded yet. Consider using 'Load full data at once' mode.",
                severity: "warning"
            });
        }
        if (values.hoveredStructureIdAttribute) {
            errors.push({
                property: "hoveredStructureIdAttribute",
                message:
                    "Hovered structure ID may not work reliably with progressive loading if the node hasn't been loaded yet. Consider using 'Load full data at once' mode.",
                severity: "warning"
            });
        }
        if (values.selectedStructureIdAttribute) {
            errors.push({
                property: "selectedStructureIdAttribute",
                message:
                    "Selected structure ID may not work reliably with progressive loading if the node hasn't been loaded yet. Consider using 'Load full data at once' mode.",
                severity: "warning"
            });
        }
    }

    return errors;
}

/**
 * Validation helper: Check display configuration
 */
function validateDisplayConfiguration(values: TreeViewPreviewProps): Problem[] {
    const errors: Problem[] = [];

    // Validate floating display requirements
    if (values.displayAs === "floating") {
        if (values.selectionMode === "none") {
            errors.push({
                property: "selectionMode",
                message: "Floating display mode requires selection to be enabled for node focusing",
                severity: "warning"
            });
        }
    }

    // Validate sliding panel requirements
    if (values.displayAs === "sliding") {
        if (!values.enableBreadcrumb) {
            errors.push({
                property: "enableBreadcrumb",
                message: "Breadcrumb navigation is recommended for sliding panel mode",
                severity: "warning"
            });
        }
    }

    // Validate virtual scrolling
    if (
        values.virtualScrolling &&
        values.itemHeight !== undefined &&
        values.itemHeight !== null &&
        values.itemHeight < 20
    ) {
        errors.push({
            property: "itemHeight",
            message: "Item height should be at least 20px for virtual scrolling to work properly",
            severity: "warning"
        });
    }

    // Validate drag & drop configuration
    if (values.enableDragDrop && !values.dragDropStatusAttribute) {
        errors.push({
            property: "dragDropStatusAttribute",
            message: "Drag & drop status attribute is required to track ongoing operations",
            severity: "warning"
        });
    }

    // Validate drag & drop with progressive loading requires structure IDs
    if (values.enableDragDrop && values.dataLoadingMode !== "all" && !values.structureIdAttribute) {
        errors.push({
            property: "structureIdAttribute",
            message:
                "Structure ID attribute is required for drag & drop when using progressive loading. With partial data, the server needs structure IDs to recalculate positions. Alternatively, use 'Load full data at once' mode.",
            severity: "error"
        });
    }

    // Validate data loading mode configuration
    if (values.dataLoadingMode === "progressive" || values.dataLoadingMode === "onDemand") {
        // Check if has children attribute is configured for lazy loading
        if (!values.hasChildrenAttribute) {
            errors.push({
                property: "hasChildrenAttribute",
                message:
                    "Has children attribute is recommended for progressive/on-demand loading to show expand icons correctly",
                severity: "warning"
            });
        }

        // Check initial load limit
        if (values.initialLoadLimit && values.initialLoadLimit < 50) {
            errors.push({
                property: "initialLoadLimit",
                message: "Initial load limit below 50 items may cause excessive loading requests",
                severity: "warning"
            });
        }
    }

    return errors;
}

/**
 * Main validation function
 */
export function check(values: TreeViewPreviewProps): Problem[] {
    const errors: Problem[] = [];

    // Run all validation checks
    errors.push(...validateDatasourceAttributes(values));
    errors.push(...validateNodeLabelConfiguration(values));
    errors.push(...validatePerformanceSettings(values));
    errors.push(...validateSearchConfiguration(values));
    errors.push(...validateSelectionConfiguration(values));
    errors.push(...validateStructureIdAttributes(values));
    errors.push(...validateDisplayConfiguration(values));

    return errors;
}

/**
 * Property visibility configuration
 * Controls which properties are shown based on other property values
 */
export function getProperties(values: TreeViewPreviewProps, defaultProperties: Properties): Properties {
    // Organize properties into logical tabs
    transformGroupsIntoTabs(defaultProperties);

    // Hide parent relation properties based on type
    if (values.parentRelationType !== "attribute") {
        hidePropertyIn(defaultProperties, values, "parentIdAttribute");
    }
    if (values.parentRelationType !== "association") {
        hidePropertyIn(defaultProperties, values, "parentAssociation");
    }
    if (values.parentRelationType !== "structureId") {
        hidePropertyIn(defaultProperties, values, "structureIdAttribute");
    }

    // Hide node label properties based on type
    if (values.nodeLabelType !== "attribute") {
        hidePropertyIn(defaultProperties, values, "nodeLabelAttribute");
    }
    if (values.nodeLabelType !== "expression") {
        hidePropertyIn(defaultProperties, values, "nodeLabelExpression");
    }
    if (values.nodeLabelType !== "widget") {
        hidePropertyIn(defaultProperties, values, "nodeLabelContent");
    }

    // Hide search-related properties when search is disabled
    if (!values.enableSearch) {
        hidePropertiesIn(defaultProperties, values, [
            "searchMode",
            "searchDebounce",
            "filterList",
            "serverSearchAction",
            "searchIcon",
            "searchResultsAsOverlay",
            "searchMinCharacters",
            "searchScalingDelay",
            "searchEndpoint"
        ]);
    }

    // Hide server search properties when not using server search
    if (values.searchMode === "client" || !values.enableSearch) {
        hidePropertiesIn(defaultProperties, values, ["serverSearchAction", "searchEndpoint"]);
    }

    // Hide selection properties when selection is disabled
    if (values.selectionMode === "none") {
        hidePropertiesIn(defaultProperties, values, [
            "selectionStorageMethod",
            "selectionOutputType",
            "serverSideSelectionsJSONAttribute",
            "selectedNodeIdAttribute",
            "selectedStructureIdAttribute",
            "onSelectionChange",
            "allowDeselectingAncestors",
            "allowDeselectingDescendants",
            "selectionsAssociation",
            "stateEndpoint"
        ]);
    }

    // Show/hide properties based on selection storage method
    if (values.selectionMode !== "none") {
        if (values.selectionStorageMethod === "association") {
            // Hide API-based properties when using association
            hidePropertiesIn(defaultProperties, values, [
                "serverSideSelectionsJSONAttribute",
                "selectionOutputType",
                "selectedNodeIdAttribute",
                "selectedStructureIdAttribute",
                "stateEndpoint"
            ]);
        } else if (values.selectionStorageMethod === "asyncApi") {
            // Hide association properties when using async API
            hidePropertyIn(defaultProperties, values, "selectionsAssociation");

            // Show output type specific properties
            if (values.selectionOutputType !== "attributes") {
                hidePropertiesIn(defaultProperties, values, [
                    "selectedNodeIdAttribute",
                    "selectedStructureIdAttribute"
                ]);
            }
        }
    }

    // Hide multi-select properties when not in multi-select mode
    if (values.selectionMode !== "multi" && values.selectionMode !== "branch" && values.selectionMode !== "path") {
        hidePropertiesIn(defaultProperties, values, ["allowDeselectingAncestors", "allowDeselectingDescendants"]);
    }

    // Hide deselecting descendants when not in branch mode
    if (values.selectionMode !== "branch") {
        hidePropertyIn(defaultProperties, values, "allowDeselectingDescendants");
    }

    // Hide deselecting ancestors when not in branch or path mode
    if (values.selectionMode !== "branch" && values.selectionMode !== "path") {
        hidePropertyIn(defaultProperties, values, "allowDeselectingAncestors");
    }

    // Hide structure ID attributes when using client-side generation
    if (!values.structureIdAttribute) {
        hidePropertiesIn(defaultProperties, values, [
            "focusedStructureIdAttribute",
            "hoveredStructureIdAttribute",
            "selectedStructureIdAttribute"
        ]);
    }

    // Note: Focus attributes (focusedNodeIdAttribute, focusedStructureIdAttribute) are always visible
    // as they are needed for keyboard navigation and accessibility regardless of selection mode

    // Context menu actions are always available, no need to hide

    // Hide breadcrumb properties when disabled
    if (!values.enableBreadcrumb) {
        hidePropertyIn(defaultProperties, values, "breadcrumbCaption");
    }

    // Hide hover properties when hover updates are disabled
    if (!values.enableHoverServerUpdates) {
        hidePropertiesIn(defaultProperties, values, [
            "hoveredNodeIdAttribute",
            "hoveredStructureIdAttribute",
            "hoverVelocityThreshold",
            "hoverIntentDelay",
            "onNodeHover"
        ]);
    }

    // Hide virtual scrolling properties when disabled
    if (!values.virtualScrolling) {
        hidePropertiesIn(defaultProperties, values, ["itemHeight", "overscan"]);
    }

    // Hide drag & drop properties when disabled
    if (!values.enableDragDrop) {
        hidePropertiesIn(defaultProperties, values, [
            "dragDropConfirmLabel",
            "dragDropCancelLabel",
            "dragDropConfirmContent",
            "dragDropStatusAttribute",
            "dragDropEndpoint",
            "dragMaxChildren",
            "dragMaxDepth",
            "dragPatterns"
        ]);
    }

    // Hide visibility toggle properties when disabled
    if (!values.enableVisibilityToggle) {
        hidePropertiesIn(defaultProperties, values, ["visibilityOnIcon", "visibilityOffIcon"]);
    }

    // Hide category header properties when sticky headers are not set to category
    if (values.stickyHeaderMode !== "category") {
        hidePropertiesIn(defaultProperties, values, [
            "categoryAttribute",
            "categoryExpression",
            "showCategoryItemCount"
        ]);
    }

    // Hide progressive loading properties based on mode
    if (values.dataLoadingMode === "all") {
        hidePropertiesIn(defaultProperties, values, ["initialLoadLimit"]);
    }

    // Selection mode specific configurations
    if (values.selectionMode === "none") {
        // Hide all selection-related properties
        hidePropertiesIn(defaultProperties, values, [
            "selectionOutputType",
            "serverSideSelectionsJSONAttribute",
            "onSelectionChange",
            "allowDeselectingAncestors",
            "allowDeselectingDescendants",
            "selectionsAssociation"
        ]);
    } else if (values.selectionMode === "single") {
        // Single selection doesn't need deselection options
        hidePropertiesIn(defaultProperties, values, ["allowDeselectingAncestors", "allowDeselectingDescendants"]);
    } else if (values.selectionMode === "path") {
        // Path mode: force allowDeselectingAncestors to false and hide it
        values.allowDeselectingAncestors = false;
        hidePropertiesIn(defaultProperties, values, ["allowDeselectingAncestors"]);
    }

    // Hide selection properties based on storage method
    // Note: selectionsAssociation and nativeSelection are always visible due to Mendix requirements
    // They are only functionally used when selectionStorageMethod is "association"
    if (values.selectionStorageMethod === "association") {
        // When using association storage, hide the API-based properties
        hidePropertiesIn(defaultProperties, values, ["serverSideSelectionsJSONAttribute", "selectionOutputType"]);
    } else if (values.selectionStorageMethod === "asyncApi") {
        // When using API storage, association properties remain visible but are not used
        // Only hide properties that are not required by Mendix
    }

    // Hide display-specific properties
    if (values.displayAs === "standard") {
        // All display properties are available for standard mode
    }
    // Floating properties would be defined if they existed in XML
    // Sliding panel properties would be defined if they existed in XML

    // Hide progressive loading properties when not needed
    if (values.dataLoadingMode === "all") {
        hidePropertyIn(defaultProperties, values, "initialLoadLimit");
    }

    // Hide API endpoint properties based on usage
    if (!values.enableDragDrop) {
        hidePropertyIn(defaultProperties, values, "dragDropEndpoint");
    }
    if (values.searchMode !== "server" && values.searchMode !== "hybrid") {
        hidePropertyIn(defaultProperties, values, "searchEndpoint");
    }
    if (values.selectionStorageMethod !== "asyncApi") {
        hidePropertyIn(defaultProperties, values, "stateEndpoint");
    }

    return defaultProperties;
}

/**
 * Custom caption for context menu actions
 */
export function getCustomCaption(values: TreeViewPreviewProps): string {
    const parts: string[] = [];

    // Add display mode
    if (values.displayAs && values.displayAs !== "standard") {
        parts.push(values.displayAs.charAt(0).toUpperCase() + values.displayAs.slice(1));
    }

    // Add key features
    if (values.enableSearch) {
        parts.push("Search");
    }
    if (values.enableDragDrop) {
        parts.push("Drag&Drop");
    }
    if (values.virtualScrolling) {
        parts.push("Virtual");
    }

    // Add data mode
    if (values.dataLoadingMode && values.dataLoadingMode !== "progressive") {
        parts.push(values.dataLoadingMode === "all" ? "All Data" : "On-Demand");
    }

    const suffix = parts.length > 0 ? ` (${parts.join(", ")})` : "";
    return `Tree View${suffix}`;
}

/**
 * Context menu actions caption
 */
export function getContextMenuActionsCaption(value: ContextMenuActionsPreviewType, index: number): string {
    if (value && value.label) {
        return value.label;
    }
    return `Action ${index + 1}`;
}

/**
 * Get preview structure for Studio Pro
 * Provides a visual representation in the widget toolbox
 */
export function getPreview(values: TreeViewPreviewProps): any {
    // Base64 encoded icons for tree structure
    const chevronRight =
        "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTYgMTJMOSA4TDYgNCIgc3Ryb2tlPSIjNjY2NjY2IiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+Cjwvc3ZnPg==";

    const chevronDown =
        "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDZMOCA5TDQgNiIgc3Ryb2tlPSIjNjY2NjY2IiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+Cjwvc3ZnPg==";

    const checkbox =
        "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3QgeD0iMyIgeT0iMyIgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiByeD0iMiIgc3Ryb2tlPSIjNjY2NjY2IiBzdHJva2Utd2lkdGg9IjEuNSIvPgo8L3N2Zz4=";

    const checkboxChecked =
        "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3QgeD0iMyIgeT0iMyIgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiByeD0iMiIgZmlsbD0iIzMzNjZGRiIgc3Ryb2tlPSIjMzM2NkZGIiBzdHJva2Utd2lkdGg9IjEuNSIvPgo8cGF0aCBkPSJNNiA4TDcuNSA5LjVMMTAgNi41IiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+Cjwvc3ZnPg==";

    const eyeIcon =
        "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTggNUMzIDUgMSA4IDEgOEMxIDggMyAxMSA4IDExQzEzIDExIDE1IDggMTUgOEMxNSA4IDEzIDUgOCA1WiIgc3Ryb2tlPSIjNjY2NjY2IiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+CjxjaXJjbGUgY3g9IjgiIGN5PSI4IiByPSIyIiBzdHJva2U9IiM2NjY2NjYiIHN0cm9rZS13aWR0aD0iMS41Ii8+Cjwvc3ZnPg==";

    const folderIcon =
        "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTIgNEMyIDMuNDQ3NzIgMi40NDc3MiAzIDMgM0g2TDggNUgxM0MxMy41NTIzIDUgMTQgNS40NDc3MiAxNCA2VjEyQzE0IDEyLjU1MjMgMTMuNTUyMyAxMyAxMyAxM0gzQzIuNDQ3NzIgMTMgMiAxMi41NTIzIDIgMTJWNFoiIGZpbGw9IiNGRkE1MDAiIHN0cm9rZT0iI0ZGQTUwMCIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8L3N2Zz4=";

    const fileIcon =
        "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTkgMlYzLjVDOSAzLjc3NjE0IDkuMjIzODYgNCA5LjUgNEgxMU0xMCAySDRDMy40NDc3MiAyIDMgMi40NDc3MiAzIDNWMTNDMyAxMy41NTIzIDMuNDQ3NzIgMTQgNCAxNEgxMkMxMi41NTIzIDE0IDEzIDEzLjU1MjMgMTMgMTNWNUwxMCAyWiIgc3Ryb2tlPSIjNjY2NjY2IiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+Cjwvc3ZnPg==";

    // Helper function to create a tree node row
    const createTreeNode = (
        label: string,
        indent = 0,
        isExpanded = false,
        isSelected = false,
        hasChildren = true,
        showVisibility = true
    ) => {
        const nodeElements: any[] = [];

        // Add indent spacing
        if (indent > 0) {
            nodeElements.push({
                type: "Container",
                width: indent * 20,
                height: 1
            });
        }

        // Add expand/collapse arrow (if has children)
        if (hasChildren) {
            nodeElements.push({
                type: "Image",
                data: isExpanded ? chevronDown : chevronRight,
                width: 16,
                height: 16
            });
        } else {
            // Empty space for leaf nodes
            nodeElements.push({
                type: "Container",
                width: 16,
                height: 16
            });
        }

        // Add checkbox (if selection enabled)
        if (values.selectionMode !== "none") {
            nodeElements.push({
                type: "Container",
                width: 4,
                height: 1
            });
            nodeElements.push({
                type: "Image",
                data: isSelected ? checkboxChecked : checkbox,
                width: 16,
                height: 16
            });
        }

        // Add folder/file icon
        nodeElements.push({
            type: "Container",
            width: 4,
            height: 1
        });
        nodeElements.push({
            type: "Image",
            data: hasChildren ? folderIcon : fileIcon,
            width: 16,
            height: 16
        });

        // Add label
        nodeElements.push({
            type: "Container",
            width: 8,
            height: 1
        });

        // Handle different label types
        if (values.nodeLabelType === "widget" && values.nodeLabelContent) {
            nodeElements.push(values.nodeLabelContent);
        } else {
            nodeElements.push({
                type: "Text",
                content: label,
                fontSize: 13,
                fontColor: "#333333"
            });
        }

        // Add visibility toggle (if enabled)
        if (showVisibility && values.enableVisibilityToggle) {
            nodeElements.push({
                type: "Container",
                grow: 1
            });
            nodeElements.push({
                type: "Image",
                data: eyeIcon,
                width: 16,
                height: 16
            });
        }

        return {
            type: "RowLayout",
            columnSize: "fixed",
            backgroundColor: isSelected ? "#E6F2FF" : "transparent",
            padding: 4,
            children: nodeElements
        };
    };

    // Build the tree structure preview
    const treeNodes: any[] = [];

    // Add header if needed
    if (values.enableBreadcrumb) {
        treeNodes.push({
            type: "Container",
            backgroundColor: "#F5F5F5",
            padding: 8,
            children: [
                {
                    type: "Text",
                    content: "Root > Category > Current Location",
                    fontSize: 12,
                    fontColor: "#666666"
                }
            ]
        });
    }

    // Add search bar if enabled
    if (values.enableSearch) {
        treeNodes.push({
            type: "Container",
            backgroundColor: "#FFFFFF",
            borderWidth: 1,
            borderColor: "#DDDDDD",
            borderRadius: 4,
            padding: 8,
            margin: 8,
            children: [
                {
                    type: "Text",
                    content: values.searchPlaceholder || "Search nodes...",
                    fontSize: 13,
                    fontColor: "#999999"
                }
            ]
        });
    }

    // Add tree nodes
    treeNodes.push(createTreeNode("Root Node 1", 0, true, false, true));
    treeNodes.push(createTreeNode("Child Node 1.1", 1, false, true, true));
    treeNodes.push(createTreeNode("Child Node 1.2", 1, true, false, true));
    treeNodes.push(createTreeNode("Grandchild 1.2.1", 2, false, false, false));
    treeNodes.push(createTreeNode("Grandchild 1.2.2", 2, false, false, false));
    treeNodes.push(createTreeNode("Root Node 2", 0, false, false, true));

    // Main container
    return {
        type: "Container",
        backgroundColor: "#FFFFFF",
        borderRadius: 4,
        borderWidth: 1,
        borderColor: "#E0E0E0",
        children: [
            {
                type: "Container",
                backgroundColor: "#F8F9FA",
                padding: 12,
                borderRadius: 4,
                children: [
                    {
                        type: "Text",
                        content: getCustomCaption(values),
                        fontSize: 14,
                        fontColor: "#333333",
                        bold: true
                    }
                ]
            },
            {
                type: "Container",
                children: treeNodes
            }
        ]
    };
}
