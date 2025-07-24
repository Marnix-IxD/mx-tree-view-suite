/**
 * Filter helper utilities for TreeView
 * Provides type-safe filter creation patterns
 */

import { FilterCondition } from "mendix/filters";
import { equals, literal } from "mendix/filters/builders";

/**
 * Creates a filter condition that always evaluates to false
 * This is useful for scenarios where we need to return no results
 *
 * Uses the pattern: 1 = 0 which is always false
 *
 * @returns A FilterCondition that always evaluates to false
 */
export function createAlwaysFalseFilter(): FilterCondition {
    // Use boolean literal false comparison
    // This is a more type-safe approach than comparing numbers
    return equals(literal(true), literal(false));
}

/**
 * Creates a filter condition that always evaluates to true
 * This is useful for scenarios where we want to match all items
 *
 * @returns A FilterCondition that always evaluates to true
 */
export function createAlwaysTrueFilter(): FilterCondition {
    // Use boolean literal true comparison
    return equals(literal(true), literal(true));
}

/**
 * Creates an empty result filter
 * Alias for createAlwaysFalseFilter for better semantic meaning
 *
 * @returns A FilterCondition that returns no results
 */
export function createEmptyResultFilter(): FilterCondition {
    return createAlwaysFalseFilter();
}
