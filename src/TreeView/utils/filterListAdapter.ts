/**
 * Filter List Adapter - Maps attribute types to their available operators
 */

import { SearchAttributeType, SearchOperator, ISearchFilter } from "../types/SearchTypes";
import { FilterListType } from "../../../typings/TreeViewProps";
import { ListAttributeValue } from "mendix";
import { Big } from "big.js";

/**
 * Get available operators for a specific attribute type
 * @param attributeType - The type of attribute to get operators for
 * @returns Array of available operators for the given type
 */
export function getOperatorsForType(attributeType: SearchAttributeType): SearchOperator[] {
    switch (attributeType) {
        case "String":
            return ["contains", "startsWith", "endsWith", "equals", "notEquals"];

        case "Enum":
            return ["equals", "notEquals"];

        case "Integer":
        case "Long":
        case "Decimal":
            return ["equals", "notEquals", "greater", "greaterOrEqual", "less", "lessOrEqual", "between"];

        case "Boolean":
            return ["equals", "notEquals"];

        case "DateTime":
            return ["equals", "notEquals", "greater", "greaterOrEqual", "less", "lessOrEqual", "between"];

        default:
            return ["equals", "notEquals"];
    }
}

/**
 * Get display label for an operator
 * @param operator - The operator to get label for
 * @returns Human-readable label for the operator
 */
export function getOperatorLabel(operator: SearchOperator): string {
    const labels: Record<SearchOperator, string> = {
        contains: "Contains",
        startsWith: "Starts with",
        endsWith: "Ends with",
        equals: "Equals",
        notEquals: "Not equals",
        greater: "Greater than",
        greaterOrEqual: "Greater or equal",
        less: "Less than",
        lessOrEqual: "Less or equal",
        between: "Between",
        regex: "Matches pattern"
    };

    return labels[operator] || operator;
}

/**
 * Convert FilterListType array to ISearchFilter array
 * @param filterList - Array of filter configurations from widget props
 * @returns Array of search filters ready for use in search operations
 */
export function convertFilterListToSearchFilters(filterList: FilterListType[]): ISearchFilter[] {
    return filterList.map(filterItem => {
        // Detect attribute type based on the filter's attribute
        const attributeType = detectAttributeTypeFromFilter(filterItem);

        return {
            attribute: filterItem.filter as ListAttributeValue<string | Big | boolean | Date>,
            attributeName: filterItem.filter.id,
            attributeType,
            operator: getDefaultOperatorForType(attributeType),
            value: undefined,
            value2: undefined
        };
    });
}

/**
 * Detect attribute type from a filter configuration
 * @param filter - Filter configuration
 * @returns The detected attribute type
 */
function detectAttributeTypeFromFilter(_filter: FilterListType): SearchAttributeType {
    // Since FilterListType only contains the filter attribute without type information,
    // we need to infer the type from the attribute's runtime value type
    // This is a limitation of the current widget XML configuration

    // For now, default to String which supports the most common search operations
    // In a future enhancement, we could add attributeType to FilterListType in the XML
    return "String";
}

/**
 * Get the default operator for a given attribute type
 * @param attributeType - The attribute type
 * @returns The default operator for that type
 */
function getDefaultOperatorForType(attributeType: SearchAttributeType): SearchOperator {
    switch (attributeType) {
        case "String":
            return "contains";
        case "Integer":
        case "Long":
        case "Decimal":
        case "DateTime":
            return "equals";
        case "Boolean":
        case "Enum":
            return "equals";
        default:
            return "equals";
    }
}
