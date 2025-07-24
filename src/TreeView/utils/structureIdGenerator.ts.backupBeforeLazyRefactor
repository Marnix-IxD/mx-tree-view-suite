import { ObjectItem } from "mendix";
import { ListAttributeValue, ListReferenceValue } from "mendix";

/**
 * Structure ID generation modes
 */
export enum StructureIDMode {
    USER_PROVIDED = "user_provided", // All have structure IDs
    AUTO_GENERATED = "auto_generated" // None have structure IDs (client-side generation)
}

/**
 * Detect the structure ID mode based on data
 * Enforces all-or-nothing approach: either ALL nodes have structure IDs or NONE do
 */
export function detectStructureIDMode(
    items: ObjectItem[],
    structureIdAttribute?: ListAttributeValue<string>
): StructureIDMode {
    if (!structureIdAttribute || items.length === 0) {
        return StructureIDMode.AUTO_GENERATED;
    }

    let hasStructureId = 0;
    let missingStructureId = 0;

    for (const item of items) {
        const structureId = structureIdAttribute.get(item).value;
        if (structureId && structureId.trim() !== "") {
            hasStructureId++;
        } else {
            missingStructureId++;
        }
    }

    if (hasStructureId === items.length) {
        return StructureIDMode.USER_PROVIDED;
    } else if (missingStructureId === items.length) {
        return StructureIDMode.AUTO_GENERATED;
    } else {
        // Mixed mode not allowed - if some have structure IDs and some don't,
        // treat as auto-generated and log a warning
        console.debug(
            `[StructureIdGenerator][DetectMode] Mixed structure ID mode detected: ${hasStructureId} nodes have structure IDs, ${missingStructureId} don't. ` +
                `Treating as auto-generated mode. For optimal performance, either provide structure IDs for ALL nodes or NONE.`
        );
        return StructureIDMode.AUTO_GENERATED;
    }
}

/**
 * Generate a structure ID for a node based on its position in the tree
 * Format: "1.", "1.1.", "1.1.1.", etc. (with trailing dot)
 */
export function generateStructureId(_nodeId: string, parentStructureId: string | null, siblingIndex: number): string {
    if (!parentStructureId) {
        // Root level
        return `${siblingIndex + 1}.`;
    }
    // Child level - parent already has trailing dot
    return `${parentStructureId}${siblingIndex + 1}.`;
}

/**
 * Generate structure IDs for items based on parent relationships
 */
export function generateStructureIdsFromParentId(
    items: ObjectItem[],
    nodeIdAttribute: ListAttributeValue<string | import("big.js").Big>,
    parentIdAttribute: ListAttributeValue<string | import("big.js").Big>,
    existingStructureIds?: Map<string, string>,
    sortAttribute?: ListAttributeValue<string | import("big.js").Big | Date>,
    sortOrder: "asc" | "desc" = "asc"
): Map<string, string> {
    const structureIds = new Map<string, string>(existingStructureIds);
    const nodeMap = new Map<string, ObjectItem>();
    const childrenMap = new Map<string, ObjectItem[]>();

    // First pass: build maps
    items.forEach(item => {
        const nodeId = String(nodeIdAttribute.get(item).value || "");
        const parentId = String(parentIdAttribute.get(item).value || "");

        nodeMap.set(nodeId, item);

        if (!childrenMap.has(parentId)) {
            childrenMap.set(parentId, []);
        }
        childrenMap.get(parentId)!.push(item);
    });

    // Second pass: generate structure IDs iteratively (breadth-first)
    interface QueueItem {
        parentId: string | null;
        parentStructureId: string | null;
    }

    const queue: QueueItem[] = [{ parentId: null, parentStructureId: null }];

    while (queue.length > 0) {
        const { parentId, parentStructureId } = queue.shift()!;
        const children = childrenMap.get(parentId || "") || [];

        // Sort children if sort attribute is provided
        if (sortAttribute) {
            children.sort((a, b) => {
                try {
                    const valueA = sortAttribute.get(a).value;
                    const valueB = sortAttribute.get(b).value;

                    if (valueA == null && valueB == null) {
                        return 0;
                    }
                    if (valueA == null) {
                        return sortOrder === "asc" ? 1 : -1;
                    }
                    if (valueB == null) {
                        return sortOrder === "asc" ? -1 : 1;
                    }

                    let comparison = 0;
                    if (typeof valueA === "number" && typeof valueB === "number") {
                        comparison = valueA - valueB;
                    } else if (valueA instanceof Date && valueB instanceof Date) {
                        comparison = valueA.getTime() - valueB.getTime();
                    } else {
                        comparison = String(valueA).localeCompare(String(valueB));
                    }

                    return sortOrder === "desc" ? -comparison : comparison;
                } catch (error) {
                    console.debug(`[StructureIdGenerator][Sort] Error sorting nodes:`, error);
                    return 0;
                }
            });
        }

        children.forEach((child, index) => {
            const childId = String(nodeIdAttribute.get(child).value || "");

            // Skip if already has a structure ID
            if (structureIds.has(childId)) {
                // Add to queue to process its children with existing structure ID
                queue.push({ parentId: childId, parentStructureId: structureIds.get(childId)! });
                return;
            }

            // Generate new structure ID using sorted index
            const newStructureId = generateStructureId(childId, parentStructureId, index);
            structureIds.set(childId, newStructureId);

            // Add to queue to process its children
            queue.push({ parentId: childId, parentStructureId: newStructureId });
        });
    }

    return structureIds;
}

/**
 * Generate structure IDs for items based on parent associations
 */
export function generateStructureIdsFromAssociation(
    items: ObjectItem[],
    nodeIdAttribute: ListAttributeValue<string | import("big.js").Big>,
    parentAssociation: ListReferenceValue,
    existingStructureIds?: Map<string, string>,
    sortAttribute?: ListAttributeValue<string | import("big.js").Big | Date>,
    sortOrder: "asc" | "desc" = "asc"
): Map<string, string> {
    const structureIds = new Map<string, string>(existingStructureIds);
    const nodeMap = new Map<string, ObjectItem>();
    const childrenMap = new Map<string, ObjectItem[]>();

    // First pass: build maps
    items.forEach(item => {
        const nodeId = String(nodeIdAttribute.get(item).value || "");
        nodeMap.set(nodeId, item);

        const parentRef = parentAssociation.get(item).value;
        const parentId = parentRef ? String(nodeIdAttribute.get(parentRef).value || "") : "";

        if (!childrenMap.has(parentId)) {
            childrenMap.set(parentId, []);
        }
        childrenMap.get(parentId)!.push(item);
    });

    // Second pass: generate structure IDs iteratively (breadth-first)
    interface QueueItem {
        parentId: string | null;
        parentStructureId: string | null;
    }

    const queue: QueueItem[] = [{ parentId: null, parentStructureId: null }];

    while (queue.length > 0) {
        const { parentId, parentStructureId } = queue.shift()!;
        const children = childrenMap.get(parentId || "") || [];

        // Sort children if sort attribute is provided
        if (sortAttribute) {
            children.sort((a, b) => {
                try {
                    const valueA = sortAttribute.get(a).value;
                    const valueB = sortAttribute.get(b).value;

                    if (valueA == null && valueB == null) {
                        return 0;
                    }
                    if (valueA == null) {
                        return sortOrder === "asc" ? 1 : -1;
                    }
                    if (valueB == null) {
                        return sortOrder === "asc" ? -1 : 1;
                    }

                    let comparison = 0;
                    if (typeof valueA === "number" && typeof valueB === "number") {
                        comparison = valueA - valueB;
                    } else if (valueA instanceof Date && valueB instanceof Date) {
                        comparison = valueA.getTime() - valueB.getTime();
                    } else {
                        comparison = String(valueA).localeCompare(String(valueB));
                    }

                    return sortOrder === "desc" ? -comparison : comparison;
                } catch (error) {
                    console.debug(`[StructureIdGenerator][Sort] Error sorting nodes:`, error);
                    return 0;
                }
            });
        }

        children.forEach((child, index) => {
            const childId = String(nodeIdAttribute.get(child).value || "");

            // Skip if already has a structure ID
            if (structureIds.has(childId)) {
                // Add to queue to process its children with existing structure ID
                queue.push({ parentId: childId, parentStructureId: structureIds.get(childId)! });
                return;
            }

            // Generate new structure ID using sorted index
            const newStructureId = generateStructureId(childId, parentStructureId, index);
            structureIds.set(childId, newStructureId);

            // Add to queue to process its children
            queue.push({ parentId: childId, parentStructureId: newStructureId });
        });
    }

    return structureIds;
}

/**
 * Update structure IDs after a tree structure change
 * This recalculates structure IDs for affected nodes
 */
export function updateStructureIdsAfterMove(
    nodeId: string,
    newParentId: string | null,
    newIndex: number,
    existingStructureIds: Map<string, string>,
    childrenMap: Map<string, string[]>
): Map<string, string> {
    const updatedIds = new Map(existingStructureIds);

    // Get new parent structure ID
    let parentStructureId: string | null = null;
    if (newParentId) {
        parentStructureId = existingStructureIds.get(newParentId) || null;
        if (!parentStructureId) {
            console.error(
                `[StructureIdGenerator][UpdateAfterMove] Parent node ${newParentId} does not have a structure ID. This indicates a data integrity issue.`
            );
            // Generate a temporary structure ID for the parent to maintain tree integrity
            // This should ideally never happen if the tree is properly initialized
            throw new Error(`Cannot move node ${nodeId} to parent ${newParentId}: parent structure ID not found`);
        }
    }

    // Generate new structure ID for the moved node
    const newStructureId = generateStructureId(nodeId, parentStructureId, newIndex);
    updatedIds.set(nodeId, newStructureId);

    // Recursively update all descendants
    const updateDescendants = (parentId: string, parentStructureId: string) => {
        const children = childrenMap.get(parentId) || [];
        children.forEach((childId, index) => {
            const childStructureId = generateStructureId(childId, parentStructureId, index);
            updatedIds.set(childId, childStructureId);
            updateDescendants(childId, childStructureId);
        });
    };

    updateDescendants(nodeId, newStructureId);

    return updatedIds;
}

/**
 * Validate structure IDs for consistency
 */
export function validateStructureIds(
    structureIds: Map<string, string>,
    parentChildMap: Map<string, string[]>
): string[] {
    const errors: string[] = [];

    // Check for duplicates
    const seen = new Set<string>();
    structureIds.forEach((structureId, _nodeId) => {
        if (seen.has(structureId)) {
            errors.push(`Duplicate structure ID: ${structureId}`);
        }
        seen.add(structureId);
    });

    // Check parent-child consistency
    parentChildMap.forEach((children, parentId) => {
        const parentStructureId = structureIds.get(parentId);
        if (!parentStructureId && parentId) {
            errors.push(`Missing structure ID for parent: ${parentId}`);
            return;
        }

        children.forEach((childId, _index) => {
            const childStructureId = structureIds.get(childId);
            if (!childStructureId) {
                errors.push(`Missing structure ID for child: ${childId}`);
                return;
            }

            // With trailing dots, parent structure ID already includes the dot
            const expectedPrefix = parentStructureId || "";
            if (!childStructureId.startsWith(expectedPrefix)) {
                errors.push(
                    `Invalid structure ID hierarchy: ${childId} (${childStructureId}) is not under parent ${parentId} (${parentStructureId})`
                );
            }
        });
    });

    return errors;
}

/**
 * Check if a node is a descendant of another using structure IDs
 * With trailing dots, this is a simple prefix check
 */
export function isDescendantOf(childStructureId: string, parentStructureId: string): boolean {
    // A node cannot be its own descendant
    if (childStructureId === parentStructureId) {
        return false;
    }

    // With trailing dots, just check if child starts with parent
    return childStructureId.startsWith(parentStructureId);
}

/**
 * Get the depth/level of a node from its structure ID
 */
export function getDepthFromStructureId(structureId: string): number {
    if (!structureId) {
        return 0;
    }

    // Count the dots (excluding the trailing one)
    const cleanId = structureId.endsWith(".") ? structureId.slice(0, -1) : structureId;
    return cleanId.split(".").length - 1;
}

/**
 * Get parent structure ID from a child structure ID
 */
export function getParentStructureId(structureId: string): string | null {
    if (!structureId) {
        return null;
    }

    // Remove trailing dot for processing
    const cleanId = structureId.endsWith(".") ? structureId.slice(0, -1) : structureId;
    const parts = cleanId.split(".");

    if (parts.length <= 1) {
        // This is a root node
        return null;
    }

    // Remove last part and add trailing dot
    parts.pop();
    return parts.join(".") + ".";
}

/**
 * Comprehensive structure ID validation
 */
export interface StructureIDValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    statistics: {
        totalNodes: number;
        maxDepth: number;
        rootNodes: number;
        orphanedNodes: number;
        duplicateIds: number;
    };
}

/**
 * Validate tree structure and detect common issues
 */
export function validateTreeStructure(
    items: ObjectItem[],
    nodeIdAttribute: ListAttributeValue<string | import("big.js").Big>,
    structureIdAttribute?: ListAttributeValue<string>
): StructureIDValidationResult {
    const result: StructureIDValidationResult = {
        isValid: true,
        errors: [],
        warnings: [],
        statistics: {
            totalNodes: items.length,
            maxDepth: 0,
            rootNodes: 0,
            orphanedNodes: 0,
            duplicateIds: 0
        }
    };

    if (items.length === 0) {
        return result;
    }

    const nodeIds = new Set<string>();
    const structureIds = new Set<string>();
    const structureIdToNodeId = new Map<string, string>();

    // First pass: collect all IDs and check for duplicates
    for (const item of items) {
        const nodeId = String(nodeIdAttribute.get(item).value || "");
        const structureId = structureIdAttribute ? String(structureIdAttribute.get(item).value || "") : "";

        // Check for duplicate node IDs
        if (nodeIds.has(nodeId)) {
            result.errors.push(`Duplicate node ID: ${nodeId}`);
            result.isValid = false;
        }
        nodeIds.add(nodeId);

        // Check for duplicate structure IDs
        if (structureId && structureIds.has(structureId)) {
            result.errors.push(`Duplicate structure ID: ${structureId}`);
            result.statistics.duplicateIds++;
            result.isValid = false;
        }
        if (structureId) {
            structureIds.add(structureId);
            structureIdToNodeId.set(structureId, nodeId);
        }

        // Calculate depth and count roots
        if (structureId) {
            const depth = getDepthFromStructureId(structureId);
            result.statistics.maxDepth = Math.max(result.statistics.maxDepth, depth);

            if (depth === 0) {
                result.statistics.rootNodes++;
            }
        }
    }

    // Second pass: validate structure ID hierarchy
    if (structureIdAttribute) {
        for (const item of items) {
            const nodeId = String(nodeIdAttribute.get(item).value || "");
            const structureId = String(structureIdAttribute.get(item).value || "");

            if (!structureId) {
                continue;
            }

            // Check if parent structure ID exists
            const parentStructureId = getParentStructureId(structureId);
            if (parentStructureId && !structureIds.has(parentStructureId)) {
                result.errors.push(`Orphaned node: ${nodeId} (${structureId}) - parent ${parentStructureId} not found`);
                result.statistics.orphanedNodes++;
                result.isValid = false;
            }

            // Validate structure ID format
            if (!isValidStructureIdFormat(structureId)) {
                result.errors.push(`Invalid structure ID format: ${structureId} for node ${nodeId}`);
                result.isValid = false;
            }
        }
    }

    // Performance warnings
    if (result.statistics.totalNodes > 10000) {
        result.warnings.push(
            `Large dataset (${result.statistics.totalNodes} nodes) - consider server-side structure ID generation for optimal performance`
        );
    }

    if (result.statistics.maxDepth > 10) {
        result.warnings.push(`Deep tree structure (${result.statistics.maxDepth} levels) - may impact performance`);
    }

    if (result.statistics.rootNodes === 0 && result.statistics.totalNodes > 0) {
        result.errors.push("No root nodes found - tree structure is invalid");
        result.isValid = false;
    }

    return result;
}

/**
 * Check if a structure ID has valid format
 */
function isValidStructureIdFormat(structureId: string): boolean {
    if (!structureId || !structureId.endsWith(".")) {
        return false;
    }

    const cleanId = structureId.slice(0, -1);
    const parts = cleanId.split(".");

    // Check that all parts are positive integers
    for (const part of parts) {
        if (!/^\d+$/.test(part) || parseInt(part) <= 0) {
            return false;
        }
    }

    return true;
}

/**
 * Detect circular references in tree structure
 */
export function detectCircularReferences(
    items: ObjectItem[],
    nodeIdAttribute: ListAttributeValue<string | import("big.js").Big>,
    parentIdAttribute: ListAttributeValue<string | import("big.js").Big>
): string[] {
    const errors: string[] = [];
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const nodeMap = new Map<string, string>();

    // Build parent map
    for (const item of items) {
        const nodeId = String(nodeIdAttribute.get(item).value || "");
        const parentId = String(parentIdAttribute.get(item).value || "");
        if (parentId) {
            nodeMap.set(nodeId, parentId);
        }
    }

    // DFS to detect cycles
    function dfs(nodeId: string, path: string[] = []): void {
        if (visiting.has(nodeId)) {
            const cycleStart = path.indexOf(nodeId);
            const cycle = path.slice(cycleStart).concat(nodeId);
            errors.push(`Circular reference detected: ${cycle.join(" -> ")}`);
            return;
        }

        if (visited.has(nodeId)) {
            return;
        }

        visiting.add(nodeId);
        path.push(nodeId);

        const parentId = nodeMap.get(nodeId);
        if (parentId) {
            dfs(parentId, path);
        }

        visiting.delete(nodeId);
        visited.add(nodeId);
        path.pop();
    }

    // Check each node
    for (const nodeId of nodeMap.keys()) {
        if (!visited.has(nodeId)) {
            dfs(nodeId);
        }
    }

    return errors;
}
