/**
 * Utility functions for calculating tree levels consistently
 * Handles both 0-based and 1-based level conventions
 */

/**
 * Calculate the level of a node from its structure ID
 * Intelligently handles both 0-based and 1-based conventions
 *
 * @param structureId - The structure ID (e.g., "1.2.3.")
 * @param nodeMap - Optional map of all nodes to determine the convention
 * @returns The calculated level
 */
export function calculateLevelFromStructureId(
    structureId: string,
    nodeMap?: Map<string, { level?: number; structureId?: string }>
): number {
    // Parse structure ID - handle trailing dots
    const parts = structureId.split(".").filter(part => part.length > 0);

    // Default calculation: parts.length - 1 means 0-based
    // "1." = 0, "1.2." = 1, etc.
    const calculatedLevel = Math.max(0, parts.length - 1);

    // If we have a nodeMap, try to detect the convention
    if (nodeMap && nodeMap.size > 0) {
        // Find a root node to check the convention
        let rootLevelConvention: number | undefined;

        for (const [, node] of nodeMap) {
            if (node.structureId && node.level !== undefined) {
                const nodeParts = node.structureId.split(".").filter(part => part.length > 0);
                if (nodeParts.length === 1) {
                    // This is a root node
                    rootLevelConvention = node.level;
                    break;
                }
            }
        }

        // If we detected that root nodes use level 1, adjust our calculation
        if (rootLevelConvention === 1) {
            return calculatedLevel + 1;
        }
    }

    return calculatedLevel;
}

/**
 * Calculate the level for a moved node based on its new parent and position
 *
 * @param newParentId - The ID of the new parent (null for root)
 * @param dropPosition - The drop position relative to target
 * @param targetLevel - The level of the drop target node
 * @param nodeMap - Map of all nodes to look up parent info
 * @returns The calculated level for the moved node
 */
export function calculateLevelAfterMove(
    newParentId: string | null,
    dropPosition: "before" | "inside" | "after",
    targetLevel: number,
    nodeMap?: Map<string, { level?: number }>
): number {
    // If dropping inside, the level is parent level + 1
    if (dropPosition === "inside") {
        return targetLevel + 1;
    }

    // If dropping before/after, use same level as target
    if (dropPosition === "before" || dropPosition === "after") {
        return targetLevel;
    }

    // Fallback: if we have a parent, look up its level
    if (newParentId && nodeMap) {
        const parent = nodeMap.get(newParentId);
        if (parent && parent.level !== undefined) {
            return parent.level + 1;
        }
    }

    // Ultimate fallback: assume root level
    // Check if the app uses 0-based or 1-based by looking at any root node
    if (nodeMap && nodeMap.size > 0) {
        for (const [, node] of nodeMap) {
            if (node.level !== undefined && node.level <= 1) {
                // If we find a node with level 0, assume 0-based
                // If all root nodes have level 1, assume 1-based
                return node.level;
            }
        }
    }

    return 0; // Default to 0-based
}

/**
 * Normalize a level value to ensure consistency
 * Some systems might use -1 or null for undefined levels
 *
 * @param level - The level value to normalize
 * @param defaultLevel - The default level to use (default: 0)
 * @returns The normalized level
 */
export function normalizeLevel(level: number | undefined | null, defaultLevel = 0): number {
    if (level === undefined || level === null || level < 0) {
        return defaultLevel;
    }
    return level;
}
