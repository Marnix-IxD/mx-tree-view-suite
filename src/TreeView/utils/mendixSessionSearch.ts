import { ObjectItem } from "mendix";
import { ISearchFilter } from "../types/SearchTypes";
import { Big } from "big.js";

/**
 * Search through Mendix's in-memory session cache
 */
export class MendixSessionSearch {
    /**
     * Search session objects using filters
     * @param filters - Array of search filters
     * @param logic - AND or OR logic for combining filters
     * @param entityType - Entity type to filter on (e.g., "MyModule.Product")
     * @returns Array of matching ObjectItems from session cache
     */
    searchSessionObjectsWithFilters(filters: ISearchFilter[], logic: "AND" | "OR", entityType: string): ObjectItem[] {
        const results: ObjectItem[] = [];

        if (!filters || filters.length === 0) {
            return results;
        }

        // Check if mx.session.sessionData.objects exists
        if (!window.mx?.session?.sessionData?.objects) {
            console.warn("Mendix session data not available");
            return results;
        }

        const sessionObjects = window.mx.session.sessionData.objects;

        // Search through all cached objects
        Object.values(sessionObjects).forEach(obj => {
            try {
                // Filter by entity type
                if (obj.getEntity() !== entityType) {
                    return;
                }

                // Evaluate filters
                const filterResults = filters.map(filter => this.evaluateFilter(filter, obj));

                // Apply logic
                const matches =
                    logic === "AND" ? filterResults.every(result => result) : filterResults.some(result => result);

                if (matches) {
                    results.push(obj as unknown as ObjectItem);
                }
            } catch (error) {
                // Skip objects that cause errors
                console.debug("Error searching object:", error);
            }
        });

        return results;
    }

    /**
     * Evaluate a single filter against an object
     */
    private evaluateFilter(filter: ISearchFilter, obj: any): boolean {
        try {
            const attrData = obj.get(filter.attributeName);

            if (!attrData || attrData.value === null || attrData.value === undefined) {
                return filter.operator === "notEquals";
            }

            // Handle the {readonly: boolean, value: string} structure
            let value = attrData.value;

            // Remove surrounding single quotes for string values
            if (typeof value === "string" && value.startsWith("'") && value.endsWith("'")) {
                value = value.slice(1, -1);
            }

            switch (filter.attributeType) {
                case "String":
                    return this.evaluateStringFilter(value, filter);

                case "Integer":
                case "Long":
                case "Decimal":
                    return this.evaluateNumericFilter(value, filter);

                case "Boolean":
                    return this.evaluateBooleanFilter(value, filter);

                case "DateTime":
                    return this.evaluateDateFilter(value, filter);

                case "Enum":
                    return this.evaluateEnumFilter(value, filter);

                default:
                    return false;
            }
        } catch (error) {
            console.debug(`Error evaluating filter for attribute ${filter.attributeName}:`, error);
            return false;
        }
    }

    private evaluateStringFilter(value: any, filter: ISearchFilter): boolean {
        const stringValue = value.toString().toLowerCase();
        const searchValue = (filter.value?.toString() || "").toLowerCase();

        switch (filter.operator) {
            case "contains":
                return stringValue.includes(searchValue);
            case "startsWith":
                return stringValue.startsWith(searchValue);
            case "endsWith":
                return stringValue.endsWith(searchValue);
            case "equals":
                return stringValue === searchValue;
            case "notEquals":
                return stringValue !== searchValue;
            default:
                return false;
        }
    }

    private evaluateNumericFilter(value: any, filter: ISearchFilter): boolean {
        try {
            const numValue = new Big(value);
            const compareValue = filter.value ? new Big(filter.value) : new Big(0);

            switch (filter.operator) {
                case "equals":
                    return numValue.eq(compareValue);
                case "notEquals":
                    return !numValue.eq(compareValue);
                case "greater":
                    return numValue.gt(compareValue);
                case "greaterOrEqual":
                    return numValue.gte(compareValue);
                case "less":
                    return numValue.lt(compareValue);
                case "lessOrEqual":
                    return numValue.lte(compareValue);
                case "between":
                    if (filter.value2) {
                        const compareValue2 = new Big(filter.value2);
                        return numValue.gte(compareValue) && numValue.lte(compareValue2);
                    }
                    return false;
                default:
                    return false;
            }
        } catch (error) {
            console.debug("Error evaluating numeric filter:", error);
            return false;
        }
    }

    private evaluateBooleanFilter(value: any, filter: ISearchFilter): boolean {
        const boolValue = value === "true" || value === true;
        const compareValue = filter.value === "true" || filter.value === true;

        return filter.operator === "equals" ? boolValue === compareValue : boolValue !== compareValue;
    }

    private evaluateDateFilter(value: any, filter: ISearchFilter): boolean {
        try {
            // Mendix stores dates as milliseconds since epoch
            const dateValue = new Date(parseInt(value));
            const compareValue = filter.value instanceof Date ? filter.value : new Date(filter.value);

            switch (filter.operator) {
                case "equals":
                    return dateValue.getTime() === compareValue.getTime();
                case "notEquals":
                    return dateValue.getTime() !== compareValue.getTime();
                case "greater":
                    return dateValue > compareValue;
                case "greaterOrEqual":
                    return dateValue >= compareValue;
                case "less":
                    return dateValue < compareValue;
                case "lessOrEqual":
                    return dateValue <= compareValue;
                case "between":
                    if (filter.value2) {
                        const compareValue2 = filter.value2 instanceof Date ? filter.value2 : new Date(filter.value2);
                        return dateValue >= compareValue && dateValue <= compareValue2;
                    }
                    return false;
                default:
                    return false;
            }
        } catch (error) {
            console.debug("Error evaluating date filter:", error);
            return false;
        }
    }

    private evaluateEnumFilter(value: any, filter: ISearchFilter): boolean {
        const enumValue = value.toString();
        const compareValue = filter.value?.toString() || "";

        return filter.operator === "equals" ? enumValue === compareValue : enumValue !== compareValue;
    }

    /**
     * Get entity type from a datasource
     * @param datasource - The list datasource from widget props
     * @returns Entity type string or empty string if not found
     */
    getEntityType(datasource: any): string {
        // Try various ways to get entity type
        if (datasource?._entity) {
            return datasource._entity;
        }

        if (datasource?.entity) {
            return datasource.entity;
        }

        // Try to get from first item if available
        if (datasource?.items && datasource.items.length > 0) {
            const firstItem = datasource.items[0];
            if (firstItem && typeof firstItem.getEntity === "function") {
                return firstItem.getEntity();
            }
        }

        console.warn("Could not determine entity type from datasource");
        return "";
    }

    /**
     * Count total objects in session cache for a specific entity
     */
    countSessionObjects(entityType: string): number {
        if (!window.mx?.session?.sessionData?.objects) {
            return 0;
        }

        let count = 0;
        const sessionObjects = window.mx.session.sessionData.objects;

        Object.values(sessionObjects).forEach(obj => {
            if (obj.getEntity() === entityType) {
                count++;
            }
        });

        return count;
    }

    /**
     * Get a specific object from session by GUID
     */
    getSessionObject(guid: string): ObjectItem | null {
        if (!window.mx?.session?.sessionData?.objects) {
            return null;
        }

        const obj = window.mx.session.sessionData.objects[guid];
        return obj ? (obj as unknown as ObjectItem) : null;
    }

    /**
     * Check if session cache is available
     */
    isSessionCacheAvailable(): boolean {
        return !!window.mx?.session?.sessionData?.objects;
    }
}
