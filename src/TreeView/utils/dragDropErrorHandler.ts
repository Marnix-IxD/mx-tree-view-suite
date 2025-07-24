import { DragConstraintPattern } from "../hooks/useTreeDragDrop";

/**
 * Error types for drag drop operations
 */
export enum DragDropErrorType {
    CONSTRAINT_VIOLATION = "constraint_violation",
    VALIDATION_FAILED = "validation_failed",
    NETWORK_ERROR = "network_error",
    SERVER_ERROR = "server_error",
    PERMISSION_DENIED = "permission_denied",
    CONCURRENT_MODIFICATION = "concurrent_modification",
    UNKNOWN = "unknown"
}

/**
 * Drag drop error with details
 */
export interface DragDropError {
    type: DragDropErrorType;
    message: string;
    details?: string;
    nodeIds?: string[];
    constraint?: DragConstraintPattern;
    statusCode?: number;
}

/**
 * Get user-friendly error message for constraint violations
 */
export function getConstraintErrorMessage(constraint: DragConstraintPattern): string {
    const messages: Record<DragConstraintPattern, string> = {
        "same-parent": "Items can only be reordered within the same parent",
        "same-level": "Items can only be moved to the same tree level",
        "same-branch": "Items must stay within the same branch",
        "adjacent-only": "Items can only be moved to adjacent positions",
        "leaf-only": "Only items without children can be moved",
        "parent-only": "Only items with children can be moved",
        "no-root-move": "Root level items cannot be moved",
        "max-children": "Target has reached maximum number of children",
        "max-depth": "Moving here would exceed maximum tree depth",
        "maintain-balance": "Move would unbalance the tree structure",
        "preserve-order": "Items must maintain their sort order",
        "no-gaps": "Items must remain sequentially numbered",
        "up-only": "Items can only be moved to higher levels",
        "down-only": "Items can only be moved to deeper levels",
        "forward-only": "Items can only be moved forward in sequence",
        "backward-only": "Items can only be moved backward in sequence"
    };

    return messages[constraint] || `Constraint '${constraint}' violated`;
}

/**
 * Create error object from different error sources
 */
export function createDragDropError(
    source: Error | Response | string | DragDropError,
    defaultType: DragDropErrorType = DragDropErrorType.UNKNOWN
): DragDropError {
    // Already a DragDropError
    if (isDragDropError(source)) {
        return source;
    }

    // HTTP Response error
    if (source instanceof Response) {
        return {
            type: getErrorTypeFromStatus(source.status),
            message: getErrorMessageFromStatus(source.status),
            statusCode: source.status
        };
    }

    // JavaScript Error
    if (source instanceof Error) {
        return {
            type: defaultType,
            message: source.message,
            details: source.stack
        };
    }

    // String error
    if (typeof source === "string") {
        return {
            type: defaultType,
            message: source
        };
    }

    // Unknown
    return {
        type: DragDropErrorType.UNKNOWN,
        message: "An unknown error occurred"
    };
}

/**
 * Type guard for DragDropError
 */
function isDragDropError(obj: any): obj is DragDropError {
    return obj && typeof obj === "object" && "type" in obj && "message" in obj;
}

/**
 * Get error type from HTTP status code
 */
function getErrorTypeFromStatus(status: number): DragDropErrorType {
    if (status === 403) {
        return DragDropErrorType.PERMISSION_DENIED;
    }
    if (status === 409) {
        return DragDropErrorType.CONCURRENT_MODIFICATION;
    }
    if (status >= 500) {
        return DragDropErrorType.SERVER_ERROR;
    }
    if (status >= 400) {
        return DragDropErrorType.VALIDATION_FAILED;
    }
    return DragDropErrorType.NETWORK_ERROR;
}

/**
 * Get user-friendly message from HTTP status
 */
function getErrorMessageFromStatus(status: number): string {
    const messages: Record<number, string> = {
        400: "Invalid request. Please check your data and try again.",
        401: "You are not authenticated. Please log in and try again.",
        403: "You do not have permission to move these items.",
        404: "The requested endpoint was not found.",
        409: "These items were modified by another user. Please refresh and try again.",
        500: "Server error occurred. Please try again later.",
        502: "Server is temporarily unavailable. Please try again later.",
        503: "Service is temporarily unavailable. Please try again later."
    };

    return messages[status] || `Request failed with status ${status}`;
}

/**
 * Format error for display to user
 */
export function formatErrorForUser(error: DragDropError): string {
    let message = error.message;

    // Add node information if available
    if (error.nodeIds && error.nodeIds.length > 0) {
        const nodeCount = error.nodeIds.length;
        message += ` (${nodeCount} item${nodeCount > 1 ? "s" : ""} affected)`;
    }

    // Add constraint information
    if (error.constraint) {
        message = getConstraintErrorMessage(error.constraint);
    }

    return message;
}

/**
 * Log error for debugging
 */
export function logDragDropError(error: DragDropError, context?: any): void {
    console.error("[DragDrop Error]", {
        type: error.type,
        message: error.message,
        details: error.details,
        nodeIds: error.nodeIds,
        constraint: error.constraint,
        statusCode: error.statusCode,
        context
    });
}

/**
 * Check if error is recoverable
 */
export function isRecoverableError(error: DragDropError): boolean {
    const recoverableTypes = [
        DragDropErrorType.NETWORK_ERROR,
        DragDropErrorType.SERVER_ERROR,
        DragDropErrorType.CONCURRENT_MODIFICATION
    ];

    return recoverableTypes.includes(error.type);
}

/**
 * Get retry delay based on error type
 */
export function getRetryDelay(error: DragDropError, attemptNumber: number): number {
    const baseDelay = 1000; // 1 second

    // Exponential backoff for network/server errors
    if (error.type === DragDropErrorType.NETWORK_ERROR || error.type === DragDropErrorType.SERVER_ERROR) {
        return Math.min(baseDelay * Math.pow(2, attemptNumber), 30000); // Max 30 seconds
    }

    // Fixed delay for concurrent modifications
    if (error.type === DragDropErrorType.CONCURRENT_MODIFICATION) {
        return 2000; // 2 seconds
    }

    return baseDelay;
}
