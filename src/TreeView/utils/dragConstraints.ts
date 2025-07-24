import { DragConstraintPattern } from "../hooks/useTreeDragDrop";

/**
 * Common drag constraint patterns for tree views
 * These are generic patterns that can be applied to any tree structure
 */

/**
 * Patterns for basic tree operations
 */
export const BASIC_PATTERNS = {
    /**
     * Items can only be reordered within their parent
     * Good for: Sortable lists, menu builders
     */
    reorderOnly: ["same-parent"] as DragConstraintPattern[],

    /**
     * Items stay at same depth level
     * Good for: Flat lists, peer-to-peer movements
     */
    sameLevel: ["same-level"] as DragConstraintPattern[],

    /**
     * Items stay within their top-level branch
     * Good for: Categorized content, section-based organization
     */
    withinBranch: ["same-branch"] as DragConstraintPattern[],

    /**
     * Only allow small movements
     * Good for: Fine-tuning order, minimal disruption
     */
    adjacentOnly: ["adjacent-only"] as DragConstraintPattern[]
};

/**
 * Patterns for node type restrictions
 */
export const NODE_TYPE_PATTERNS = {
    /**
     * Only leaf nodes (items without children) can move
     * Good for: Moving individual items but not containers
     */
    leafOnly: ["leaf-only"] as DragConstraintPattern[],

    /**
     * Only parent nodes (items with children) can move
     * Good for: Reorganizing containers but not individual items
     */
    parentOnly: ["parent-only"] as DragConstraintPattern[],

    /**
     * Root nodes stay fixed
     * Good for: Protecting top-level structure
     */
    noRootMove: ["no-root-move"] as DragConstraintPattern[]
};

/**
 * Patterns for hierarchy control
 */
export const HIERARCHY_PATTERNS = {
    /**
     * Limit how many items can be under one parent
     * Good for: Preventing overloaded categories
     */
    limitedChildren: ["max-children"] as DragConstraintPattern[],

    /**
     * Limit how deep the tree can go
     * Good for: Preventing overly complex nesting
     */
    limitedDepth: ["max-depth"] as DragConstraintPattern[],

    /**
     * Keep tree branches balanced
     * Good for: Maintaining visual balance
     */
    balanced: ["maintain-balance"] as DragConstraintPattern[]
};

/**
 * Patterns for directional movement
 */
export const DIRECTION_PATTERNS = {
    /**
     * Items can only move up the hierarchy
     * Good for: Promotion workflows
     */
    upOnly: ["up-only"] as DragConstraintPattern[],

    /**
     * Items can only move down the hierarchy
     * Good for: Delegation workflows
     */
    downOnly: ["down-only"] as DragConstraintPattern[],

    /**
     * Items can only move forward in sequence
     * Good for: Progressive workflows
     */
    forwardOnly: ["forward-only"] as DragConstraintPattern[],

    /**
     * Items can only move backward in sequence
     * Good for: Rollback scenarios
     */
    backwardOnly: ["backward-only"] as DragConstraintPattern[]
};

/**
 * Common constraint presets
 */
export const DRAG_CONSTRAINT_PRESETS = {
    /**
     * Free movement - no restrictions
     */
    free: {
        patterns: [] as DragConstraintPattern[],
        constraints: {}
    },

    /**
     * Sortable list - items can only be reordered
     */
    sortable: {
        patterns: ["same-parent"] as DragConstraintPattern[],
        constraints: {},
        allowReorder: true,
        allowReparent: false
    },

    /**
     * Folder structure - typical file system behavior
     */
    folders: {
        patterns: ["no-root-move"] as DragConstraintPattern[],
        constraints: {
            maxDepth: 10,
            maxChildren: 100
        }
    },

    /**
     * Category system - items stay within categories
     */
    categories: {
        patterns: ["same-branch"] as DragConstraintPattern[],
        constraints: {
            branchDepth: 1 // Top-level categories
        }
    },

    /**
     * Binary tree - CS data structure
     */
    binaryTree: {
        patterns: ["max-children"] as DragConstraintPattern[],
        constraints: {
            maxChildren: 2
        }
    },

    /**
     * Flat list - no hierarchy changes
     */
    flat: {
        patterns: ["same-level", "same-parent"] as DragConstraintPattern[],
        constraints: {},
        allowReorder: true,
        allowReparent: false
    },

    /**
     * Read-only - no drag & drop
     */
    readOnly: {
        enabled: false
    }
};

/**
 * Helper to combine multiple patterns
 */
export function combinePatterns(...patterns: DragConstraintPattern[][]): DragConstraintPattern[] {
    return [...new Set(patterns.flat())];
}

/**
 * Example configurations showing how to use patterns
 */
export const EXAMPLES = {
    /**
     * Menu builder - items can be reordered and nested with limits
     */
    menuBuilder: {
        patterns: combinePatterns(NODE_TYPE_PATTERNS.noRootMove, HIERARCHY_PATTERNS.limitedDepth),
        constraints: {
            maxDepth: 3,
            maxChildren: 10
        }
    },

    /**
     * Task board - items move between columns but stay at same level
     */
    taskBoard: {
        patterns: combinePatterns(BASIC_PATTERNS.sameLevel, NODE_TYPE_PATTERNS.leafOnly),
        constraints: {}
    },

    /**
     * Org chart - limited movement within departments
     */
    orgChart: {
        patterns: combinePatterns(BASIC_PATTERNS.withinBranch, HIERARCHY_PATTERNS.balanced),
        constraints: {
            branchDepth: 2, // Department level
            maxChildren: 8 // Direct reports
        }
    }
};
