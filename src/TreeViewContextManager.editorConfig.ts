import type {
    TreeViewContextManagerPreviewProps,
    ManagedTreeViewsPreviewType
} from "../typings/TreeViewContextManagerProps";
import {
    Properties,
    hidePropertiesIn,
    // hidePropertyIn,
    hideNestedPropertiesIn,
    transformGroupsIntoTabs,
    Problem
} from "@mendix/pluggable-widgets-tools";

/**
 * Configures property visibility based on widget settings
 * Hides irrelevant properties to simplify the Studio Pro experience
 */
export function getProperties(
    values: TreeViewContextManagerPreviewProps,
    defaultProperties: Properties,
    platform: "web" | "desktop" = "web"
): Properties {
    // Hide selection-specific properties when selection mode is "none"
    if (values.selectionMode === "none") {
        hidePropertiesIn(defaultProperties, values, [
            "managedTreeViews",
            "totalSelectedCountAttribute",
            "lastGlobalUpdateAttribute",
            "globalSelectionStateAttribute",
            "onAnySelectionChange",
            "onAllSelectionsCleared"
            // "beforeSelectionChange", // Removed because it's not a valid key of TreeViewContextManagerPreviewProps
        ]);
    }

    // Hide drag & drop properties when cross-tree drag & drop is disabled
    if (!values.enableCrossTreeDragDrop) {
        hidePropertiesIn(defaultProperties, values, [
            "defaultDragDropMode",
            "orphanHandling",
            "showDragPreview",
            "maxDragPreviewItems",
            "dropZoneHighlightDelay",
            "dragFeedbackStyle",
            "enableHapticFeedback",
            "beforeAnyTransfer",
            "onAnyTransfer",
            "onTransferError",
            "onBatchTransferComplete"
        ]);
    }

    // Hide performance properties in desktop mode
    if (platform === "desktop") {
        hidePropertiesIn(defaultProperties, values, ["enableHapticFeedback"]);
    }

    // Hide debug properties when not in debug mode
    if (!values.debugMode) {
        hidePropertiesIn(defaultProperties, values, ["performanceOverlay"]);
    }

    // For each managed tree view, hide conditional properties using hideNestedPropertiesIn
    values.managedTreeViews.forEach((tree, index) => {
        // Hide tree selection mode when not overriding
        if (!tree.overrideSelectionMode) {
            hideNestedPropertiesIn(defaultProperties, values, "managedTreeViews", index, ["treeSelectionMode"] as Array<
                keyof ManagedTreeViewsPreviewType
            >);
        }

        // Hide drag properties when drag is disabled for this tree
        if (!tree.allowDragFrom) {
            hideNestedPropertiesIn(defaultProperties, values, "managedTreeViews", index, [
                "dragRestriction",
                "restrictDragDistance",
                "dragDirectionBias",
                "biasResistance",
                "biasElasticity"
            ] as Array<keyof ManagedTreeViewsPreviewType>);
        }

        // Hide drop properties when drop is disabled for this tree
        if (!tree.allowDropTo) {
            hideNestedPropertiesIn(defaultProperties, values, "managedTreeViews", index, [
                "allowedDropSources",
                "dropZoneHighlightColor"
            ] as Array<keyof ManagedTreeViewsPreviewType>);
        }

        // Hide magnetic properties when not enabled
        if (!tree.magneticDropZones) {
            hideNestedPropertiesIn(defaultProperties, values, "managedTreeViews", index, ["magneticRange"] as Array<
                keyof ManagedTreeViewsPreviewType
            >);
        }

        // Hide bias resistance properties when no bias is set
        if (tree.dragDirectionBias === "none") {
            hideNestedPropertiesIn(defaultProperties, values, "managedTreeViews", index, [
                "biasResistance",
                "biasElasticity"
            ] as Array<keyof ManagedTreeViewsPreviewType>);
        }
    });

    // Transform property groups into tabs for better organization
    transformGroupsIntoTabs(defaultProperties);
    return defaultProperties;
}

/**
 * Validates widget configuration and returns any errors or warnings
 * Ensures proper setup before runtime
 */
export function check(values: TreeViewContextManagerPreviewProps): Problem[] {
    const errors: Problem[] = [];

    // Check for at least one managed tree view
    if (!values.managedTreeViews || values.managedTreeViews.length === 0) {
        errors.push({
            property: "managedTreeViews",
            message: "At least one tree view must be configured",
            severity: "error"
        });
    }

    // Check for duplicate tree identifiers
    const identifiers = values.managedTreeViews.map(tree => tree.treeIdentifier);
    const duplicates = identifiers.filter((id, index) => identifiers.indexOf(id) !== index);
    if (duplicates.length > 0) {
        errors.push({
            property: "managedTreeViews",
            message: `Duplicate tree identifiers found: ${duplicates.join(", ")}`,
            severity: "error"
        });
    }

    // Validate selection associations
    if (values.selectionMode !== "none") {
        values.managedTreeViews.forEach((tree, index) => {
            if (!tree.selectionAssociation) {
                errors.push({
                    property: `managedTreeViews/${index}/selectionAssociation`,
                    message: "Selection association is required when selection mode is not 'none'",
                    severity: "error"
                });
            }
        });
    }

    // Validate drag & drop configuration
    if (values.enableCrossTreeDragDrop) {
        const hasAnyDragSource = values.managedTreeViews.some(tree => tree.allowDragFrom);
        const hasAnyDropTarget = values.managedTreeViews.some(tree => tree.allowDropTo);

        if (!hasAnyDragSource || !hasAnyDropTarget) {
            errors.push({
                property: "enableCrossTreeDragDrop",
                message: "Cross-tree drag & drop is enabled but no valid drag sources or drop targets are configured",
                severity: "warning"
            });
        }
    }

    // Validate bias resistance values
    values.managedTreeViews.forEach((tree, index) => {
        if (
            tree.biasResistance !== undefined &&
            tree.biasResistance !== null &&
            (tree.biasResistance < 0 || tree.biasResistance > 1)
        ) {
            errors.push({
                property: `managedTreeViews/${index}/biasResistance`,
                message: "Bias resistance must be between 0 and 1",
                severity: "error"
            });
        }
    });

    return errors;
}
