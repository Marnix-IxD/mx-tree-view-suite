import { ObjectItem, ListAttributeValue, ListReferenceValue, ListReferenceSetValue } from "mendix";
import { Big } from "big.js";
import { TreeNode } from "../types/TreeTypes";

/**
 * Build tree from parent ID attribute
 */
export function buildTreeFromParentId(
    items: ObjectItem[],
    nodeIdAttribute: ListAttributeValue<string | Big>,
    parentIdAttribute: ListAttributeValue<string | Big>,
    visibilityAttribute?: ListAttributeValue<boolean>,
    expandedAttribute?: ListAttributeValue<boolean>
): TreeNode[] {
    const nodeMap = new Map<string, TreeNode>();
    const rootNodes: TreeNode[] = [];

    // First pass: create all nodes
    items.forEach((item, index) => {
        const nodeIdAttr = nodeIdAttribute?.get(item);
        const nodeIdValue = nodeIdAttr?.value;
        if (!nodeIdValue) {
            console.warn(`TreeView: Item at index ${index} has no node ID, skipping`);
            return;
        }
        const nodeId = typeof nodeIdValue === "string" ? nodeIdValue : nodeIdValue.toString();

        const parentIdAttr = parentIdAttribute?.get(item);
        const parentIdValue = parentIdAttr?.value;
        const parentId = parentIdValue
            ? typeof parentIdValue === "string"
                ? parentIdValue
                : parentIdValue.toString()
            : null;
        const isVisible = visibilityAttribute ? visibilityAttribute.get(item).value !== false : true;
        const isExpanded = expandedAttribute ? expandedAttribute.get(item).value === true : false;

        const node: TreeNode = {
            id: nodeId,
            parentId,
            objectItem: item,
            children: [],
            level: 0,
            path: [],
            isLeaf: true,
            isVisible,
            isExpanded
        };

        nodeMap.set(nodeId, node);
    });

    // Second pass: build tree structure
    nodeMap.forEach(node => {
        if (node.parentId) {
            const parent = nodeMap.get(node.parentId);
            if (parent) {
                parent.children.push(node);
                parent.isLeaf = false;
                node.level = parent.level + 1;
                node.path = [...parent.path, parent.id];
            } else {
                // Orphan node - treat as root
                rootNodes.push(node);
            }
        } else {
            rootNodes.push(node);
        }
    });

    return rootNodes;
}

/**
 * Build tree from parent association
 */
export function buildTreeFromAssociation(
    items: ObjectItem[],
    nodeIdAttribute: ListAttributeValue<string | Big>,
    parentAssociation: ListReferenceValue | ListReferenceSetValue,
    visibilityAttribute?: ListAttributeValue<boolean>,
    expandedAttribute?: ListAttributeValue<boolean>
): TreeNode[] {
    const nodeMap = new Map<string, TreeNode>();
    const itemToNodeId = new Map<ObjectItem, string>();
    const rootNodes: TreeNode[] = [];

    // First pass: create nodes and build item-to-ID mapping
    items.forEach((item, index) => {
        const nodeIdAttr = nodeIdAttribute?.get(item);
        const nodeIdValue = nodeIdAttr?.value;
        if (!nodeIdValue) {
            console.warn(`TreeView: Item at index ${index} has no node ID, skipping`);
            return;
        }
        const nodeId = typeof nodeIdValue === "string" ? nodeIdValue : nodeIdValue.toString();

        itemToNodeId.set(item, nodeId);

        const isVisible = visibilityAttribute ? visibilityAttribute.get(item).value !== false : true;
        const isExpanded = expandedAttribute ? expandedAttribute.get(item).value === true : false;

        const node: TreeNode = {
            id: nodeId,
            parentId: null,
            objectItem: item,
            children: [],
            level: 0,
            path: [],
            isLeaf: true,
            isVisible,
            isExpanded
        };

        nodeMap.set(nodeId, node);
    });

    // Second pass: build relationships
    items.forEach(item => {
        const nodeId = itemToNodeId.get(item);
        if (!nodeId) {
            return;
        }

        const node = nodeMap.get(nodeId);
        if (!node) {
            return;
        }

        const parentRef = parentAssociation.get(item);
        const parentValue = parentRef.value;
        const parentItem = Array.isArray(parentValue) ? parentValue[0] : parentValue;

        if (parentItem) {
            const parentId = itemToNodeId.get(parentItem);
            if (parentId) {
                const parent = nodeMap.get(parentId);
                if (parent) {
                    node.parentId = parentId;
                    parent.children.push(node);
                    parent.isLeaf = false;
                    node.level = parent.level + 1;
                    node.path = [...parent.path, parent.id];
                } else {
                    rootNodes.push(node);
                }
            } else {
                rootNodes.push(node);
            }
        } else {
            rootNodes.push(node);
        }
    });

    return rootNodes;
}

/**
 * Build tree from structure ID (e.g., "1.2.3")
 */
export function buildTreeFromStructureId(
    items: ObjectItem[],
    nodeIdAttribute: ListAttributeValue<string | Big>,
    structureIdAttribute: ListAttributeValue<string>,
    visibilityAttribute?: ListAttributeValue<boolean>,
    expandedAttribute?: ListAttributeValue<boolean>
): TreeNode[] {
    const nodeMap = new Map<string, TreeNode>();
    const structureMap = new Map<string, TreeNode>();
    const rootNodes: TreeNode[] = [];

    // Sort items by structure ID to ensure parents come before children
    const sortedItems = items.slice().sort((a, b) => {
        const structA = structureIdAttribute?.get(a)?.value || "";
        const structB = structureIdAttribute?.get(b)?.value || "";
        return structA.localeCompare(structB);
    });

    sortedItems.forEach((item, index) => {
        const nodeIdAttr = nodeIdAttribute?.get(item);
        const nodeIdValue = nodeIdAttr?.value;
        if (!nodeIdValue) {
            console.warn(`TreeView: Item at index ${index} has no node ID, skipping`);
            return;
        }
        const nodeId = typeof nodeIdValue === "string" ? nodeIdValue : nodeIdValue.toString();

        const structureIdAttr = structureIdAttribute?.get(item);
        const structureId = structureIdAttr?.value;
        if (!structureId) {
            console.warn(`TreeView: Item at index ${index} has no structure ID, skipping`);
            return;
        }

        const isVisible = visibilityAttribute ? visibilityAttribute.get(item).value !== false : true;
        const isExpanded = expandedAttribute ? expandedAttribute.get(item).value === true : false;

        // Parse structure ID - handle trailing dots
        // For "1.2.", split gives ["1", "2", ""], so we need to filter out empty strings
        const parts = structureId.split(".").filter(part => part.length > 0);
        const level = parts.length - 1;
        let parentId: string | null = null;

        // Find parent structure ID
        if (parts.length > 1) {
            // For "1.2.", parent should be "1."
            const parentParts = parts.slice(0, -1);
            const parentStructureId = parentParts.join(".") + ".";
            const parentNode = structureMap.get(parentStructureId);
            if (parentNode) {
                parentId = parentNode.id;
            }
        }

        // Debug log for first few nodes
        if (index < 3) {
            console.debug(`TreeView buildTreeFromStructureId node ${index}:`, {
                nodeId,
                structureId,
                parts,
                level,
                calculatedParentId: parentId,
                structureMapSize: structureMap.size
            });
        }

        const node: TreeNode = {
            id: nodeId,
            parentId,
            objectItem: item,
            children: [],
            level,
            path: [],
            isLeaf: true,
            isVisible,
            isExpanded,
            structureId
        };

        nodeMap.set(nodeId, node);
        structureMap.set(structureId, node);

        // Add to parent or root
        if (parentId) {
            const parent = nodeMap.get(parentId);
            if (parent) {
                parent.children.push(node);
                parent.isLeaf = false;
                node.path = [...parent.path, parent.id];
            } else {
                rootNodes.push(node);
            }
        } else {
            rootNodes.push(node);
        }
    });

    return rootNodes;
}

/**
 * Sort nodes by attribute value
 */
export function sortNodes(
    nodes: TreeNode[],
    sortAttribute: ListAttributeValue<any>,
    sortOrder: "asc" | "desc"
): TreeNode[] {
    const sortRecursive = (nodeList: TreeNode[]): TreeNode[] => {
        const sorted = nodeList.slice().sort((a, b) => {
            const aValue = sortAttribute.get(a.objectItem).value;
            const bValue = sortAttribute.get(b.objectItem).value;

            // Handle null/undefined values
            if (aValue == null && bValue == null) {
                return 0;
            }
            if (aValue == null) {
                return sortOrder === "asc" ? 1 : -1;
            }
            if (bValue == null) {
                return sortOrder === "asc" ? -1 : 1;
            }

            // Compare values
            let comparison = 0;
            if (typeof aValue === "string" && typeof bValue === "string") {
                comparison = aValue.localeCompare(bValue);
            } else if (typeof aValue === "number" && typeof bValue === "number") {
                comparison = aValue - bValue;
            } else if (aValue instanceof Date && bValue instanceof Date) {
                comparison = aValue.getTime() - bValue.getTime();
            } else {
                comparison = String(aValue).localeCompare(String(bValue));
            }

            return sortOrder === "asc" ? comparison : -comparison;
        });

        // Sort children recursively
        sorted.forEach(node => {
            if (node.children.length > 0) {
                node.children = sortRecursive(node.children);
            }
        });

        return sorted;
    };

    return sortRecursive(nodes);
}

/**
 * Filter nodes based on visibility
 */
export function filterVisibleNodes(nodes: TreeNode[]): TreeNode[] {
    const filterRecursive = (nodeList: TreeNode[]): TreeNode[] => {
        return nodeList
            .filter(node => node.isVisible)
            .map(node => ({
                ...node,
                children: filterRecursive(node.children)
            }));
    };

    return filterRecursive(nodes);
}

/**
 * Count total nodes in tree
 */
export function countNodes(nodes: TreeNode[]): number {
    let count = 0;

    const countRecursive = (nodeList: TreeNode[]) => {
        nodeList.forEach(node => {
            count++;
            countRecursive(node.children);
        });
    };

    countRecursive(nodes);
    return count;
}

/**
 * Find node by ID
 */
export function findNodeById(nodes: TreeNode[], nodeId: string): TreeNode | null {
    for (const node of nodes) {
        if (node.id === nodeId) {
            return node;
        }
        const found = findNodeById(node.children, nodeId);
        if (found) {
            return found;
        }
    }
    return null;
}

/**
 * Get all descendant IDs
 */
export function getDescendantIds(node: TreeNode): string[] {
    const ids: string[] = [];

    const collectIds = (n: TreeNode) => {
        ids.push(n.id);
        n.children.forEach(collectIds);
    };

    node.children.forEach(collectIds);
    return ids;
}

/**
 * Get node depth (maximum level in subtree)
 */
export function getNodeDepth(node: TreeNode): number {
    if (node.isLeaf) {
        return 0;
    }

    let maxDepth = 0;
    node.children.forEach(child => {
        maxDepth = Math.max(maxDepth, getNodeDepth(child) + 1);
    });

    return maxDepth;
}

/**
 * Flatten tree to array
 */
export function flattenTree(nodes: TreeNode[]): TreeNode[] {
    const flattened: TreeNode[] = [];

    const flatten = (nodeList: TreeNode[]) => {
        nodeList.forEach(node => {
            flattened.push(node);
            flatten(node.children);
        });
    };

    flatten(nodes);
    return flattened;
}
