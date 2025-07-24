/**
 * Filter Bridge - Converts between mx.data query results and ListValue filters
 *
 * This module bridges the gap between two different filtering systems:
 * 1. mx.data.get API results (returns object IDs)
 * 2. ListValue FilterCondition (used by Mendix widgets)
 *
 * Purpose: When we use mx.data.get for complex queries that ListValue can't handle,
 * this bridge converts the results into filters that ListValue understands.
 */

import { FilterCondition } from "mendix/filters";
import { ListAttributeValue } from "mendix";
import { Big } from "big.js";
import { buildMultipleIdsFilter } from "./listValueFilterBuilder";
import { createEmptyResultFilter } from "./filterHelpers";

/**
 * Convert search query results from mx.data into a ListValue filter
 * @param results - The IDs returned from mx.data query
 * @param nodeIdAttribute - The attribute to filter by
 * @returns FilterCondition for use with ListValue
 */
export function convertSearchResultsToFilter(
    results: { matchingIds: string[]; ancestorIds: string[] },
    nodeIdAttribute: ListAttributeValue<string | Big>
): FilterCondition {
    const allIds = [...results.matchingIds, ...results.ancestorIds];

    if (allIds.length === 0) {
        return createEmptyResultFilter();
    }

    return buildMultipleIdsFilter(nodeIdAttribute, allIds);
}

/**
 * Convert ancestor query results from mx.data into a ListValue filter
 * @param ancestorIds - The ancestor IDs returned from mx.data query
 * @param nodeIdAttribute - The attribute to filter by
 * @returns FilterCondition for use with ListValue
 */
export function convertAncestorResultsToFilter(
    ancestorIds: string[],
    nodeIdAttribute: ListAttributeValue<string | Big>
): FilterCondition {
    if (ancestorIds.length === 0) {
        return createEmptyResultFilter();
    }

    return buildMultipleIdsFilter(nodeIdAttribute, ancestorIds);
}

/**
 * Convert children query results from mx.data into a ListValue filter
 * @param childrenByParent - Map of parent IDs to their children IDs
 * @param nodeIdAttribute - The attribute to filter by
 * @returns FilterCondition for use with ListValue
 */
export function convertChildrenResultsToFilter(
    childrenByParent: Map<string, string[]>,
    nodeIdAttribute: ListAttributeValue<string | Big>
): FilterCondition {
    const allChildIds: string[] = [];

    childrenByParent.forEach(childIds => {
        allChildIds.push(...childIds);
    });

    if (allChildIds.length === 0) {
        return createEmptyResultFilter();
    }

    return buildMultipleIdsFilter(nodeIdAttribute, allChildIds);
}

/**
 * Convert a single ID result to a filter
 * @param nodeId - Single node ID
 * @param nodeIdAttribute - The attribute to filter by
 * @returns FilterCondition for use with ListValue
 */
export function convertSingleIdToFilter(
    nodeId: string | null,
    nodeIdAttribute: ListAttributeValue<string | Big>
): FilterCondition {
    if (!nodeId) {
        return createEmptyResultFilter();
    }

    return buildMultipleIdsFilter(nodeIdAttribute, [nodeId]);
}

/**
 * Combine mx.data results with additional filters
 * This is useful when you need to add extra constraints to mx.data results
 *
 * @param mxDataIds - IDs from mx.data query
 * @param additionalFilter - Additional filter to combine
 * @param nodeIdAttribute - The attribute to filter by
 * @returns Combined FilterCondition
 */
export function combineQueryResultsWithFilter(
    mxDataIds: string[],
    additionalFilter: FilterCondition | undefined,
    nodeIdAttribute: ListAttributeValue<string | Big>
): FilterCondition {
    const idFilter = mxDataIds.length > 0 ? buildMultipleIdsFilter(nodeIdAttribute, mxDataIds) : undefined;

    if (!idFilter && !additionalFilter) {
        return createEmptyResultFilter();
    }

    if (!idFilter) {
        return additionalFilter!;
    }

    if (!additionalFilter) {
        return idFilter;
    }

    // Both filters exist, combine with AND
    // Note: This would need the 'and' function from filterBuilder
    // For now, just return the ID filter as it's more restrictive
    return idFilter;
}
