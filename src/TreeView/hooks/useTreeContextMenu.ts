import { useCallback, useMemo } from "react";
import { ActionValue, ListActionValue } from "mendix";
import { TreeNode } from "../types/TreeTypes";

/**
 * Dynamic context menu action based on node and selection state
 */
export interface DynamicContextMenuAction {
    id: string;
    label: string;
    icon?: string;
    action: "select" | "select-descendants" | "deselect" | "deselect-descendants" | "expand" | "collapse" | "custom";
    visible: (node: TreeNode, isSelected: boolean, hasChildren: boolean) => boolean;
    enabled: (node: TreeNode, isSelected: boolean, hasChildren: boolean) => boolean;
    customAction?: ActionValue | ListActionValue;
    separator?: boolean; // Show separator after this action
}

/**
 * Context menu configuration
 */
export interface ContextMenuConfig {
    // Built-in actions
    enableSelect?: boolean;
    enableSelectDescendants?: boolean;
    enableExpand?: boolean;
    enableCollapse?: boolean;

    // Custom actions from widget props
    customActions?: DynamicContextMenuAction[];

    // Positioning
    autoPosition?: boolean;
    offsetX?: number;
    offsetY?: number;

    // Appearance
    maxWidth?: number;
    maxHeight?: number;
    theme?: "light" | "dark" | "auto";
}

/**
 * Default context menu actions
 */
const DEFAULT_ACTIONS: DynamicContextMenuAction[] = [
    // Selection actions
    {
        id: "select",
        label: "Select",
        icon: "✓", // TODO REFACTOR: Use configurable icons instead of hardcoded emojis
        action: "select",
        visible: (_node, isSelected) => !isSelected,
        enabled: () => true
    },
    {
        id: "deselect",
        label: "Deselect",
        icon: "✗",
        action: "deselect",
        visible: (_node, isSelected) => isSelected,
        enabled: () => true
    },
    {
        id: "select-descendants",
        label: "Select All Descendants",
        icon: "⬇",
        action: "select-descendants",
        visible: (_node, isSelected, hasChildren) => !isSelected && hasChildren,
        enabled: (_node, _isSelected, hasChildren) => hasChildren
    },
    {
        id: "deselect-descendants",
        label: "Deselect All Descendants",
        icon: "⬆",
        action: "deselect-descendants",
        visible: (_node, isSelected, hasChildren) => isSelected && hasChildren,
        enabled: (_node, _isSelected, hasChildren) => hasChildren,
        separator: true
    },

    // Expansion actions
    {
        id: "expand",
        label: "Expand",
        icon: "▶",
        action: "expand",
        visible: (node, _isSelected, hasChildren) => hasChildren && !node.isExpanded,
        enabled: (_node, _isSelected, hasChildren) => hasChildren
    },
    {
        id: "collapse",
        label: "Collapse",
        icon: "▼",
        action: "collapse",
        visible: (node, _isSelected, hasChildren) => hasChildren && node.isExpanded,
        enabled: (_node, _isSelected, hasChildren) => hasChildren
    }
];

/**
 * Hook for managing dynamic context menu actions
 */
export function useTreeContextMenu(config: ContextMenuConfig = {}, onAction: (action: string, node: TreeNode) => void) {
    const {
        enableSelect = true,
        enableSelectDescendants = true,
        enableExpand = true,
        enableCollapse = true,
        customActions = [],
        autoPosition = true,
        offsetX = 0,
        offsetY = 0,
        maxWidth = 200,
        maxHeight = 300,
        theme = "auto"
    } = config;

    /**
     * Get all available actions for a node
     */
    const getActionsForNode = useCallback(
        (node: TreeNode, isSelected: boolean, _selectedNodes: Set<string>): DynamicContextMenuAction[] => {
            const hasChildren = node.children.length > 0;
            const allActions: DynamicContextMenuAction[] = [];

            // Add built-in actions
            if (enableSelect || enableSelectDescendants) {
                allActions.push(
                    ...DEFAULT_ACTIONS.filter(action => {
                        if (action.action === "select" && !enableSelect) {
                            return false;
                        }
                        if (action.action === "deselect" && !enableSelect) {
                            return false;
                        }
                        if (action.action === "select-descendants" && !enableSelectDescendants) {
                            return false;
                        }
                        if (action.action === "deselect-descendants" && !enableSelectDescendants) {
                            return false;
                        }
                        return true;
                    })
                );
            }

            if (enableExpand || enableCollapse) {
                allActions.push(
                    ...DEFAULT_ACTIONS.filter(action => {
                        if (action.action === "expand" && !enableExpand) {
                            return false;
                        }
                        if (action.action === "collapse" && !enableCollapse) {
                            return false;
                        }
                        return action.action === "expand" || action.action === "collapse";
                    })
                );
            }

            // Add custom actions
            allActions.push(...customActions);

            // Filter based on visibility
            return allActions.filter(action => action.visible(node, isSelected, hasChildren));
        },
        [enableSelect, enableSelectDescendants, enableExpand, enableCollapse, customActions]
    );

    /**
     * Calculate optimal position for context menu
     */
    const calculatePosition = useCallback(
        (
            x: number,
            y: number,
            menuWidth: number,
            menuHeight: number,
            viewportWidth: number,
            viewportHeight: number
        ): { x: number; y: number } => {
            if (!autoPosition) {
                return { x: x + offsetX, y: y + offsetY };
            }

            let menuX = x + offsetX;
            let menuY = y + offsetY;

            // Ensure menu fits within viewport
            if (menuX + menuWidth > viewportWidth) {
                menuX = x - menuWidth - offsetX;
            }

            if (menuY + menuHeight > viewportHeight) {
                menuY = y - menuHeight - offsetY;
            }

            // Ensure menu doesn't go off-screen on the left/top
            menuX = Math.max(0, menuX);
            menuY = Math.max(0, menuY);

            // TODO ADD: Use @floating-ui/react for smarter positioning that handles all edge cases

            return { x: menuX, y: menuY };
        },
        [autoPosition, offsetX, offsetY]
    );

    /**
     * Execute a context menu action
     */
    const executeAction = useCallback(
        (action: DynamicContextMenuAction, node: TreeNode, _selectedNodes: Set<string>) => {
            switch (action.action) {
                case "select":
                    onAction("select", node);
                    break;

                case "deselect":
                    onAction("deselect", node);
                    break;

                case "select-descendants":
                    onAction("select-descendants", node);
                    break;

                case "deselect-descendants":
                    onAction("deselect-descendants", node);
                    break;

                case "expand":
                    onAction("expand", node);
                    break;

                case "collapse":
                    onAction("collapse", node);
                    break;

                case "custom":
                    if (action.customAction) {
                        // Execute Mendix action
                        if ("get" in action.customAction) {
                            // ListActionValue
                            const listAction = action.customAction as ListActionValue;
                            const nodeAction = listAction.get(node.objectItem);
                            if (nodeAction.canExecute) {
                                nodeAction.execute();
                            }
                        } else {
                            // ActionValue
                            const actionValue = action.customAction as ActionValue;
                            if (actionValue.canExecute) {
                                actionValue.execute();
                            }
                        }
                    }
                    break;
            }
        },
        [onAction]
    );

    /**
     * Context menu state and methods
     */
    const contextMenu = useMemo(
        () => ({
            getActionsForNode,
            calculatePosition,
            executeAction,
            config: {
                maxWidth,
                maxHeight,
                theme
            }
        }),
        [getActionsForNode, calculatePosition, executeAction, maxWidth, maxHeight, theme]
    );

    return contextMenu;
}

/**
 * Context menu item component data
 */
export interface ContextMenuItemData {
    action: DynamicContextMenuAction;
    node: TreeNode;
    isEnabled: boolean;
    onClick: () => void;
}

/**
 * Context menu data for rendering
 */
export interface ContextMenuData {
    items: ContextMenuItemData[];
    position: { x: number; y: number };
    visible: boolean;
    onClose: () => void;
}
