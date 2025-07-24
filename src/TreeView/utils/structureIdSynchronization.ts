/**
 * Structure ID Synchronization
 *
 * Handles synchronization between server and client structure IDs
 * Supports two modes:
 * 1. Server-provided IDs (use directly)
 * 2. Client-generated IDs (from minimal data like siblingIndex)
 *
 * Uses widget properties to receive server state changes:
 * - focusedNodeStructureID
 * - hoveredNodeStructureID
 * - selections (comma-separated structure IDs)
 */

import { EditableValue, ObjectItem } from "mendix";
import { TreeNode } from "../types/TreeTypes";
import { Big } from "big.js";

// Constants
const STRUCTURE_ID_SEPARATOR = ".";
const SELECTIONS_SEPARATOR = ",";

/**
 * Structure ID synchronization mode
 */
export enum StructureIdSyncMode {
    SERVER_PROVIDED = "SERVER_PROVIDED", // Server sends complete structure IDs
    CLIENT_GENERATED = "CLIENT_GENERATED", // Client builds from minimal data
    HYBRID = "HYBRID" // Mix of both (during transition)
}

/**
 * Minimal data needed for client-side generation
 */
export interface IMinimalNodeData {
    nodeId: string;
    parentId: string | null;
    siblingIndex: number; // Position among siblings (1-based)
    level: number;
}

/**
 * Structure ID sync configuration
 */
export interface IStructureIdSyncConfig {
    mode: StructureIdSyncMode;
    structureIdAttribute?: EditableValue<string>;
    siblingIndexAttribute?: EditableValue<Big>;
    focusedStructureIdAttribute?: EditableValue<string>;
    hoveredStructureIdAttribute?: EditableValue<string>;
    selectionsAttribute?: EditableValue<string>;
}

/**
 * Main synchronization class
 */
export class StructureIdSynchronizer {
    private config: IStructureIdSyncConfig;
    private clientGeneratedMap: Map<string, string> = new Map(); // nodeId -> structureId
    private serverProvidedMap: Map<string, string> = new Map(); // nodeId -> structureId
    private structureToNodeMap: Map<string, string> = new Map(); // structureId -> nodeId

    constructor(config: IStructureIdSyncConfig) {
        this.config = config;
    }

    /**
     * Get structure ID for a node
     * Handles both server-provided and client-generated scenarios
     */
    getStructureId(node: TreeNode, item?: ObjectItem): string | undefined {
        // First check if server provided a structure ID
        if (this.config.structureIdAttribute && item) {
            const attr = this.config.structureIdAttribute;
            if (attr.status === "available" && attr.value) {
                const serverStructureId = attr.value;
                this.serverProvidedMap.set(node.id, serverStructureId);
                this.structureToNodeMap.set(serverStructureId, node.id);
                return serverStructureId;
            }
        }

        // Check if we already generated one
        const cached = this.clientGeneratedMap.get(node.id);
        if (cached) {
            return cached;
        }

        // In CLIENT_GENERATED mode, we need to build it
        if (this.config.mode === StructureIdSyncMode.CLIENT_GENERATED && item) {
            return this.generateClientStructureId(node, item);
        }

        return undefined;
    }

    /**
     * Generate structure ID on client side using minimal data
     */
    private generateClientStructureId(node: TreeNode, _item: ObjectItem): string | undefined {
        if (!this.config.siblingIndexAttribute) {
            console.error("[StructureIdSync][Generate] No siblingIndexAttribute configured for client generation");
            return undefined;
        }

        // Note: siblingIndexAttribute is a single EditableValue, not a list attribute
        // The item parameter is kept for consistency with the API but not used here
        const siblingIndexAttr = this.config.siblingIndexAttribute;
        if (siblingIndexAttr.status !== "available" || !siblingIndexAttr.value) {
            console.debug(`[StructureIdSync][Generate] No sibling index for node ${node.id}`);
            return undefined;
        }
        const siblingIndex = Number(siblingIndexAttr.value.toString());
        if (siblingIndex === 0) {
            console.debug(`[StructureIdSync][Generate] Invalid sibling index for node ${node.id}`);
            return undefined;
        }

        // Build structure ID from parent's structure ID
        let structureId: string;
        if (!node.parentId) {
            // Root node
            structureId = `${siblingIndex}${STRUCTURE_ID_SEPARATOR}`;
        } else {
            // Need parent's structure ID first
            const parentStructureId = this.getStructureIdByNodeId(node.parentId);
            if (!parentStructureId) {
                console.debug(`[StructureIdSync][Generate] Parent structure ID not available for node ${node.id}`);
                return undefined;
            }
            structureId = `${parentStructureId}${siblingIndex}${STRUCTURE_ID_SEPARATOR}`;
        }

        // Cache the generated ID
        this.clientGeneratedMap.set(node.id, structureId);
        this.structureToNodeMap.set(structureId, node.id);

        console.debug(`[StructureIdSync][Generate] Generated structure ID ${structureId} for node ${node.id}`);
        return structureId;
    }

    /**
     * Get node ID by structure ID
     */
    getNodeIdByStructureId(structureId: string): string | undefined {
        return this.structureToNodeMap.get(structureId);
    }

    /**
     * Get structure ID by node ID
     */
    getStructureIdByNodeId(nodeId: string): string | undefined {
        // Check server-provided first
        const serverProvided = this.serverProvidedMap.get(nodeId);
        if (serverProvided) {
            return serverProvided;
        }

        // Then check client-generated
        return this.clientGeneratedMap.get(nodeId);
    }

    /**
     * Process server state changes from widget properties
     */
    processServerStateChanges(
        focusedStructureId: string | undefined,
        hoveredStructureId: string | undefined,
        selectionsString: string | undefined
    ): {
        focusedNodeId?: string;
        hoveredNodeId?: string;
        selectedNodeIds: string[];
    } {
        const result: {
            focusedNodeId?: string;
            hoveredNodeId?: string;
            selectedNodeIds: string[];
        } = {
            selectedNodeIds: []
        };

        // Process focused node
        if (focusedStructureId) {
            const nodeId = this.getNodeIdByStructureId(focusedStructureId);
            if (nodeId) {
                result.focusedNodeId = nodeId;
            } else {
                console.debug(
                    `[StructureIdSync][ProcessServerState] Unknown focused structure ID: ${focusedStructureId}`
                );
            }
        }

        // Process hovered node
        if (hoveredStructureId) {
            const nodeId = this.getNodeIdByStructureId(hoveredStructureId);
            if (nodeId) {
                result.hoveredNodeId = nodeId;
            } else {
                console.debug(
                    `[StructureIdSync][ProcessServerState] Unknown hovered structure ID: ${hoveredStructureId}`
                );
            }
        }

        // Process selections (comma-separated structure IDs)
        if (selectionsString && selectionsString.trim()) {
            const structureIds = selectionsString.split(SELECTIONS_SEPARATOR).map(id => id.trim());
            for (const structureId of structureIds) {
                if (structureId) {
                    const nodeId = this.getNodeIdByStructureId(structureId);
                    if (nodeId) {
                        result.selectedNodeIds.push(nodeId);
                    } else {
                        console.debug(
                            `[StructureIdSync][ProcessServerState] Unknown selected structure ID: ${structureId}`
                        );
                    }
                }
            }
        }

        return result;
    }

    /**
     * Update server with client state changes
     * Only works when structure IDs are server-provided
     */
    updateServerState(
        focusedNodeId: string | undefined,
        hoveredNodeId: string | undefined,
        selectedNodeIds: string[]
    ): void {
        if (this.config.mode === StructureIdSyncMode.CLIENT_GENERATED) {
            // Cannot update server with client-generated IDs
            console.debug("[StructureIdSync][UpdateServerState] Skipping server update in CLIENT_GENERATED mode");
            return;
        }

        // Update focused structure ID
        if (this.config.focusedStructureIdAttribute) {
            const focusedStructureId = focusedNodeId ? this.getStructureIdByNodeId(focusedNodeId) : "";
            const attr = this.config.focusedStructureIdAttribute;
            if (attr.status === "available" && attr.value !== focusedStructureId) {
                attr.setValue(focusedStructureId || "");
            }
        }

        // Update hovered structure ID
        if (this.config.hoveredStructureIdAttribute) {
            const hoveredStructureId = hoveredNodeId ? this.getStructureIdByNodeId(hoveredNodeId) : "";
            const attr = this.config.hoveredStructureIdAttribute;
            if (attr.status === "available" && attr.value !== hoveredStructureId) {
                attr.setValue(hoveredStructureId || "");
            }
        }

        // Update selections
        if (this.config.selectionsAttribute) {
            const selectedStructureIds = selectedNodeIds
                .map(nodeId => this.getStructureIdByNodeId(nodeId))
                .filter(id => id !== undefined) as string[];

            const selectionsString = selectedStructureIds.join(SELECTIONS_SEPARATOR);
            const attr = this.config.selectionsAttribute;
            if (attr.status === "available" && attr.value !== selectionsString) {
                attr.setValue(selectionsString);
            }
        }
    }

    /**
     * Clear all cached data
     */
    clear(): void {
        this.clientGeneratedMap.clear();
        this.serverProvidedMap.clear();
        this.structureToNodeMap.clear();
    }

    /**
     * Get synchronization statistics
     */
    getStats(): {
        mode: StructureIdSyncMode;
        serverProvidedCount: number;
        clientGeneratedCount: number;
        totalMapped: number;
    } {
        return {
            mode: this.config.mode,
            serverProvidedCount: this.serverProvidedMap.size,
            clientGeneratedCount: this.clientGeneratedMap.size,
            totalMapped: this.structureToNodeMap.size
        };
    }
}

/**
 * Determine synchronization mode based on available attributes
 */
export function determineSyncMode(
    structureIdAttribute?: EditableValue<string>,
    siblingIndexAttribute?: EditableValue<Big>
): StructureIdSyncMode {
    if (structureIdAttribute && !siblingIndexAttribute) {
        return StructureIdSyncMode.SERVER_PROVIDED;
    }

    if (!structureIdAttribute && siblingIndexAttribute) {
        return StructureIdSyncMode.CLIENT_GENERATED;
    }

    if (structureIdAttribute && siblingIndexAttribute) {
        // Both available - could be transitioning
        return StructureIdSyncMode.HYBRID;
    }

    // Neither available - client-only mode
    return StructureIdSyncMode.CLIENT_GENERATED;
}

/**
 * Parse selections string into structure IDs
 */
export function parseSelectionsString(selectionsString: string | undefined): string[] {
    if (!selectionsString || !selectionsString.trim()) {
        return [];
    }

    return selectionsString
        .split(SELECTIONS_SEPARATOR)
        .map(id => id.trim())
        .filter(id => id.length > 0);
}

/**
 * Create selections string from structure IDs
 */
export function createSelectionsString(structureIds: string[]): string {
    return structureIds.filter(id => id).join(SELECTIONS_SEPARATOR);
}
