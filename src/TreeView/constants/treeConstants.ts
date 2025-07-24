/**
 * Centralized constants for the Tree View widget
 * Following production-grade code standards - no magic numbers
 */

// Performance thresholds
export const PERFORMANCE_THRESHOLDS = {
    LARGE_DATASET_WARNING: 1000,
    FLAT_STRUCTURE_WARNING: 100,
    WORKER_THRESHOLD: 500,
    SMART_LOADING_THRESHOLD: 1000,
    MAX_HISTORY_SIZE: 50,
    NODE_PROCESSING_RATE: 200, // nodes per ms estimate
    SELECTION_WARNING_THRESHOLD: 10000,
    MAX_SELECTION_SIZE: 100000,
    CACHE_TIMEOUT: 15000 // ms
} as const;

// UI Constants
export const UI_CONSTANTS = {
    DEFAULT_ITEM_HEIGHT: 40,
    DEFAULT_INDENT_SIZE: 20,
    SCROLL_DEBOUNCE_DELAY: 150,
    HOVER_INTENT_DELAY: 150,
    SEARCH_DEBOUNCE_DELAY: 300,
    AUTO_EXPAND_DELAY: 500,
    RESIZE_DEBOUNCE_DELAY: 150,
    BATCH_UPDATE_DELAY: 50,
    DEFAULT_OVERSCAN: 5,
    MIN_OVERSCAN: 3,
    MAX_OVERSCAN: 20,
    SCROLL_SPEED: 10,
    SCROLL_THRESHOLD: 50
} as const;

// Data Loading
export const DATA_LOADING_CONSTANTS = {
    DEFAULT_CHUNK_SIZE: 100, // Number of nodes per chunk for progressive loading
    INITIAL_LOAD_SIZE: 50,
    LOAD_AHEAD_FACTOR: 2,
    UNLOAD_THRESHOLD: 5,
    MAX_LOADED_ITEMS: 500
} as const;

// Limits
export const TREE_LIMITS = {
    MAX_CHILDREN_PER_NODE: 100000, // Practical limit for UI performance
    MAX_TREE_DEPTH: 50,
    INITIAL_LOAD_DEPTH: 3, // Maximum depth to load on initial render
    SEARCH_DEPTH_LIMIT: 3, // Maximum depth for search operations
    MAX_SEARCH_RESULTS: 100,
    SEARCH_RESULTS_PER_PAGE: 20,
    MIN_SEARCH_LENGTH: 2,
    MAX_DRAG_NODES: 100,
    CONTEXT_MENU_MAX_WIDTH: 300,
    CONTEXT_MENU_MAX_HEIGHT: 400
} as const;

// Timeouts
export const TIMEOUTS = {
    SERVER_SEARCH: 5000,
    WORKER_TIMEOUT: 10000,
    IDLE_CALLBACK: 5000,
    OFFLINE_CHECK_INTERVAL: 30000
} as const;

// Mendix-specific constants
export const MENDIX_CONSTANTS = {
    SESSION_TIMEOUT: 900000, // 15 minutes
    MAX_XPATH_LENGTH: 2048,
    BATCH_SIZE: 50
} as const;
