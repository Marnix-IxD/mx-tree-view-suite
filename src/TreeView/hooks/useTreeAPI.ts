import { useCallback, useRef } from "react";

interface TreeAPIProps {
    dragDropEndpoint?: string;
    searchEndpoint?: string;
    stateEndpoint: string; // Required unified state endpoint for all node state changes
}

// Node state information
interface NodeState {
    nodeId: string;
    structureId: string;
    level: number;
    selected?: boolean;
    expanded?: boolean;
    visible?: boolean;
}

// Batch state change request structure
interface BatchStateChangeRequest {
    timestamp: number;
    changes: NodeState[];
    // Optional: Include deselected orphans when doing range/multi selections
    deselectedOrphans?: Array<{
        nodeId: string;
        structureId: string;
        level: number;
    }>;
}

interface DragDropInfo {
    level: number;
    treeItemId: string;
    structureId: string;
    oldParentID: string;
    newParentID: string;
    oldIndex: number;
    newIndex: number;
    affectedSiblings?: Array<{
        treeItemId: string;
        structureId: string;
        index: number;
    }>;
}

export function useTreeAPI(props: TreeAPIProps) {
    // Store abort controllers for cancellable requests
    const abortControllers = useRef<Map<string, AbortController>>(new Map());

    // Helper to build full URL
    const buildUrl = useCallback((endpoint: string | undefined): string | null => {
        if (!endpoint) {
            return null;
        }

        // @ts-ignore - mx is a global Mendix object
        const baseUrl = window.mx?.appUrl || "";
        return `${baseUrl}/rest/${endpoint}`;
    }, []);

    // Helper to get CSRF token
    const getCsrfToken = useCallback((): string => {
        // @ts-ignore - mx is a global Mendix object
        return window.mx?.session?.getCSRFToken() || "";
    }, []);

    // Generic API call function
    const callAPI = useCallback(
        async <T = any>(
            endpoint: string | undefined,
            data: any,
            requestKey?: string,
            additionalHeaders?: Record<string, string>
        ): Promise<{ success: boolean; data?: T; error?: string; response?: Response }> => {
            const url = buildUrl(endpoint);
            if (!url) {
                return { success: false, error: "No endpoint configured" };
            }

            // Cancel previous request of the same type if exists
            if (requestKey) {
                const existingController = abortControllers.current.get(requestKey);
                if (existingController) {
                    existingController.abort();
                }
            }

            const controller = new AbortController();
            if (requestKey) {
                abortControllers.current.set(requestKey, controller);
            }

            try {
                const response = await fetch(url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Csrf-Token": getCsrfToken(),
                        ...additionalHeaders
                    },
                    body: JSON.stringify(data),
                    signal: controller.signal
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    let errorMessage = `API call failed: ${response.status} ${response.statusText}`;

                    // Try to parse error details from response
                    if (errorText) {
                        try {
                            const errorJson = JSON.parse(errorText);
                            errorMessage = errorJson.message || errorJson.error || errorMessage;
                        } catch {
                            // If not JSON, include raw text if it's not too long
                            if (errorText.length < 200) {
                                errorMessage += `: ${errorText}`;
                            }
                        }
                    }

                    console.error(`TreeAPI: ${requestKey || endpoint} failed:`, errorMessage);
                    return {
                        success: false,
                        error: errorMessage,
                        response
                    };
                }

                const responseData = await response.json();
                return { success: true, data: responseData, response };
            } catch (error: any) {
                if (error.name === "AbortError") {
                    return { success: false, error: "Request cancelled" };
                }
                return { success: false, error: error.message || "Network error" };
            } finally {
                if (requestKey) {
                    abortControllers.current.delete(requestKey);
                }
            }
        },
        [buildUrl, getCsrfToken]
    );

    // Send drag & drop intent
    const sendDragDrop = useCallback(
        async (
            changes: DragDropInfo[],
            requestId?: string
        ): Promise<{ success: boolean; error?: string; requestId: string }> => {
            const url = buildUrl(props.dragDropEndpoint);
            if (!url) {
                return { success: false, error: "No endpoint configured", requestId: requestId || "" };
            }

            const finalRequestId = requestId || `dd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            try {
                const response = await fetch(url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Csrf-Token": getCsrfToken(),
                        "X-Request-ID": finalRequestId
                    },
                    body: JSON.stringify({
                        requestId: finalRequestId,
                        changes
                    })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    let errorMessage = `API call failed: ${response.status}`;

                    // Handle specific error cases
                    if (response.status === 400) {
                        errorMessage = "Invalid drag & drop operation";
                    } else if (response.status === 409) {
                        errorMessage = "Conflict: The tree structure has changed";
                    } else if (response.status === 403) {
                        errorMessage = "Permission denied for this operation";
                    }

                    // Include server error details if available
                    if (errorText) {
                        try {
                            const errorJson = JSON.parse(errorText);
                            errorMessage = errorJson.message || errorJson.error || errorMessage;
                        } catch {
                            // If not JSON, append the text if it's not too long
                            if (errorText.length < 200) {
                                errorMessage += `: ${errorText}`;
                            }
                        }
                    }

                    return {
                        success: false,
                        error: errorMessage,
                        requestId: finalRequestId
                    };
                }

                const result = await response.json();
                return {
                    success: true,
                    requestId: finalRequestId,
                    ...result
                };
            } catch (error: any) {
                console.error("Drag & drop API error:", error);
                return {
                    success: false,
                    error: error.message || "Network error",
                    requestId: finalRequestId
                };
            }
        },
        [props.dragDropEndpoint, buildUrl, getCsrfToken]
    );

    // Send search request with advanced filters
    const sendSearch = useCallback(
        async (searchRequest: any): Promise<any> => {
            const url = buildUrl(props.searchEndpoint);
            if (!url) {
                console.error("useTreeAPI.ts [SEARCH][ERROR]: Search endpoint not configured");
                throw new Error("Search endpoint not configured");
            }

            console.debug(`useTreeAPI.ts [SEARCH][START]: Sending search request to ${url}`);

            // Cancel previous search
            const existingController = abortControllers.current.get("search");
            if (existingController) {
                console.debug("useTreeAPI.ts [SEARCH][CANCEL]: Cancelling previous search request");
                existingController.abort();
            }

            const controller = new AbortController();
            abortControllers.current.set("search", controller);

            try {
                console.debug("useTreeAPI.ts [SEARCH][REQUEST]: POST request with body:", searchRequest);

                const response = await fetch(url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Csrf-Token": getCsrfToken()
                    },
                    body: JSON.stringify(searchRequest),
                    signal: controller.signal
                });

                console.debug(`useTreeAPI.ts [SEARCH][RESPONSE]: Status ${response.status}`);

                if (!response.ok) {
                    let errorMessage = `Search failed: ${response.status}`;

                    // Provide specific error messages
                    if (response.status === 404) {
                        errorMessage = "Search endpoint not found. Please check your server configuration.";
                    } else if (response.status === 401 || response.status === 403) {
                        errorMessage = "Not authorized to perform search.";
                    } else if (response.status === 500) {
                        errorMessage = "Server error during search. Please check server logs.";
                    } else if (response.status === 400) {
                        errorMessage = "Invalid search request.";
                    }

                    // Try to get more details from response
                    try {
                        const errorData = await response.text();
                        if (errorData) {
                            const errorJson = JSON.parse(errorData);
                            errorMessage = errorJson.message || errorJson.error || errorMessage;
                        }
                    } catch {
                        // Ignore JSON parse errors
                    }

                    console.error(`useTreeAPI.ts [SEARCH][ERROR]: ${errorMessage}`);
                    throw new Error(errorMessage);
                }

                const data = await response.json();
                console.debug(`useTreeAPI.ts [SEARCH][SUCCESS]: Response data:`, data);
                return data;
            } catch (error: any) {
                if (error.name === "AbortError") {
                    console.debug("useTreeAPI.ts [SEARCH][ABORTED]: Search cancelled by user");
                    return null; // Search was cancelled
                } else if (error.name === "TypeError" && error.message.includes("fetch")) {
                    console.error("useTreeAPI.ts [SEARCH][NETWORK-ERROR]: Cannot reach search endpoint");
                    throw new Error("Network error: Cannot reach search endpoint");
                } else {
                    console.error("useTreeAPI.ts [SEARCH][ERROR]:", error);
                    throw error; // Re-throw with original message
                }
            } finally {
                abortControllers.current.delete("search");
            }
        },
        [props.searchEndpoint, buildUrl, getCsrfToken]
    );

    // Cleanup on unmount
    const cleanup = useCallback(() => {
        abortControllers.current.forEach(controller => controller.abort());
        abortControllers.current.clear();
    }, []);

    // Send batched state changes
    const sendBatchStateChange = useCallback(
        async (
            changes: NodeState[],
            deselectedOrphans?: NodeState[]
        ): Promise<{ success: boolean; error?: string }> => {
            const batchRequest: BatchStateChangeRequest = {
                timestamp: Date.now(),
                changes,
                deselectedOrphans: deselectedOrphans?.map(node => ({
                    nodeId: node.nodeId,
                    structureId: node.structureId,
                    level: node.level
                }))
            };

            console.debug(`useTreeAPI [BATCH_STATE]: Sending state changes for ${changes.length} nodes`);
            if (deselectedOrphans && deselectedOrphans.length > 0) {
                console.debug(`useTreeAPI [BATCH_STATE]: Including ${deselectedOrphans.length} deselected orphans`);
            }

            const result = await callAPI(props.stateEndpoint, batchRequest, "batch_state_change");

            if (!result.success) {
                // Handle specific error cases based on response status
                if (result.response) {
                    const status = result.response.status;
                    let errorMessage = result.error || `State change failed: ${status}`;

                    if (status === 400) {
                        errorMessage = "Invalid state change request";
                    } else if (status === 403) {
                        errorMessage = "Permission denied for state changes";
                    } else if (status === 404) {
                        errorMessage = "State endpoint not found";
                    }

                    console.error(`useTreeAPI [BATCH_STATE][ERROR]: ${errorMessage}`);
                    return { success: false, error: errorMessage };
                }

                console.error(`useTreeAPI [BATCH_STATE][ERROR]: ${result.error}`);
                return { success: false, error: result.error };
            }

            console.debug(`useTreeAPI [BATCH_STATE][SUCCESS]: State changes applied`);
            return { success: true };
        },
        [props.stateEndpoint, callAPI]
    );

    return {
        sendDragDrop,
        sendSearch,
        sendBatchStateChange,
        cleanup
    };
}

// Export types for use in other components
export type { NodeState, BatchStateChangeRequest };
