/**
 * Breakpoint utilities for TreeView
 * Consistent with CSSGrid widget breakpoints
 */

export type BreakpointSize = "xs" | "sm" | "md" | "lg" | "xl" | "xxl" | "xxxl" | "xxxxl";

export interface BreakpointConfig {
    size: BreakpointSize;
    minWidth: number;
    maxWidth?: number;
    label: string;
}

export const BREAKPOINT_CONFIGS: BreakpointConfig[] = [
    { size: "xs", minWidth: 0, maxWidth: 639, label: "Extra Small" },
    { size: "sm", minWidth: 640, maxWidth: 767, label: "Small" },
    { size: "md", minWidth: 768, maxWidth: 1023, label: "Medium" },
    { size: "lg", minWidth: 1024, maxWidth: 1439, label: "Large" },
    { size: "xl", minWidth: 1440, maxWidth: 1919, label: "Extra Large" },
    { size: "xxl", minWidth: 1920, maxWidth: 2559, label: "2X Large" },
    { size: "xxxl", minWidth: 2560, maxWidth: 3839, label: "2K" },
    { size: "xxxxl", minWidth: 3840, label: "4K" }
];

/**
 * Get the active breakpoint based on current width
 */
export function getActiveBreakpoint(width: number): BreakpointSize {
    // Start from largest and work down
    for (let i = BREAKPOINT_CONFIGS.length - 1; i >= 0; i--) {
        const config = BREAKPOINT_CONFIGS[i];
        const inRange = config.maxWidth
            ? width >= config.minWidth && width <= config.maxWidth
            : width >= config.minWidth;

        if (inRange) {
            return config.size;
        }
    }
    return "xs"; // Fallback
}

/**
 * Get breakpoint-specific CSS classes for the tree view
 */
export function getBreakpointClasses(width: number): string[] {
    const activeBreakpoint = getActiveBreakpoint(width);
    const classes: string[] = [
        `mx-tree-${activeBreakpoint}` // Active breakpoint class
    ];

    // Add data attribute for CSS custom properties
    return classes;
}

/**
 * Check if current width is within a specific breakpoint
 */
export function isBreakpoint(width: number, breakpoint: BreakpointSize): boolean {
    const config = BREAKPOINT_CONFIGS.find(bp => bp.size === breakpoint);
    if (!config) {
        return false;
    }

    return config.maxWidth ? width >= config.minWidth && width <= config.maxWidth : width >= config.minWidth;
}

/**
 * Get minimum width for a breakpoint
 */
export function getBreakpointMinWidth(breakpoint: BreakpointSize): number {
    const config = BREAKPOINT_CONFIGS.find(bp => bp.size === breakpoint);
    return config?.minWidth ?? 0;
}

/**
 * Get maximum width for a breakpoint
 */
export function getBreakpointMaxWidth(breakpoint: BreakpointSize): number | undefined {
    const config = BREAKPOINT_CONFIGS.find(bp => bp.size === breakpoint);
    return config?.maxWidth;
}
