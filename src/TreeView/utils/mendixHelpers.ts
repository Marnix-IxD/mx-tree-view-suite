import { EditableValue, ListValue, ValueStatus } from "mendix";
import { Big } from "big.js";

// Type alias for Mendix attribute values
type AttributeValue = string | boolean | Date | Big | undefined;

/**
 * Mendix value status helper utilities
 * Provides consistent ways to check and handle Mendix value statuses
 */

/**
 * Check if an editable value is available and can be modified
 */
export function isEditableValueAvailable<T extends AttributeValue = AttributeValue>(
    value: EditableValue<T> | undefined
): boolean {
    return value?.status === ValueStatus.Available;
}

/**
 * Check if a list value (datasource) is available
 */
export function isDatasourceAvailable(datasource: ListValue | undefined): boolean {
    return datasource?.status === ValueStatus.Available;
}

/**
 * Check if a datasource is loading
 */
export function isDatasourceLoading(datasource: ListValue | undefined): boolean {
    return datasource?.status === ValueStatus.Loading;
}

/**
 * Check if a datasource is unavailable (no data)
 */
export function isDatasourceUnavailable(datasource: ListValue | undefined): boolean {
    return datasource?.status === ValueStatus.Unavailable;
}

/**
 * Safely set an editable value if it's available
 * @returns true if the value was set, false otherwise
 */
export function setEditableValue<T extends AttributeValue = AttributeValue>(
    editableValue: EditableValue<T> | undefined,
    value: T
): boolean {
    if (isEditableValueAvailable(editableValue)) {
        editableValue!.setValue(value);
        return true;
    }
    return false;
}

/**
 * Safely set an attribute value with comprehensive error handling
 * Handles both regular EditableValue and ListAttributeValue cases
 * @param editableValue - The editable value to set
 * @param value - The value to set
 * @param attributeName - Optional attribute name for logging
 * @returns true if the value was set, false otherwise
 */
export function safeSetAttributeValue<T extends AttributeValue = AttributeValue>(
    editableValue: EditableValue<T> | undefined,
    value: T,
    attributeName?: string
): boolean {
    try {
        // Check if value exists
        if (!editableValue) {
            console.debug(`Cannot set ${attributeName || "attribute"}: value is undefined`);
            return false;
        }

        // Check if value is available
        if (editableValue.status !== ValueStatus.Available) {
            console.debug(`Cannot set ${attributeName || "attribute"}: status is ${editableValue.status}`);
            return false;
        }

        // Check if value is read-only (common with datasource attributes)
        if (editableValue.readOnly) {
            console.debug(
                `Cannot set ${attributeName || "attribute"}: attribute is read-only (likely from datasource)`
            );
            return false;
        }

        // Try to set the value
        editableValue.setValue(value);
        return true;
    } catch (error: any) {
        // Handle the specific datasource error
        if (error.message?.includes("not yet supported on attributes linked to a datasource")) {
            console.debug(`Cannot set ${attributeName || "attribute"}: attribute is from datasource and read-only`);
        } else {
            console.debug(`Error setting ${attributeName || "attribute"}:`, error.message);
        }
        return false;
    }
}

/**
 * Safely get the value from an editable value
 * @returns the value or the provided default value
 */
export function getEditableValue<T extends AttributeValue = AttributeValue>(
    editableValue: EditableValue<T> | undefined,
    defaultValue: T
): T {
    if (isEditableValueAvailable(editableValue)) {
        return editableValue!.value || defaultValue;
    }
    return defaultValue;
}

/**
 * Get user-friendly message for datasource status
 */
export function getDatasourceStatusMessage(datasource: ListValue | undefined): string {
    if (isDatasourceLoading(datasource)) {
        return "Loading...";
    }
    if (isDatasourceUnavailable(datasource)) {
        return "No data available to display";
    }
    if (isDatasourceAvailable(datasource) && (!datasource!.items || datasource!.items.length === 0)) {
        return "No items to display";
    }
    return "";
}

/**
 * Check if we should show a loading state
 * Useful for components that need to show loading for either datasource or other async operations
 */
export function shouldShowLoading(datasource: ListValue | undefined, additionalLoadingState = false): boolean {
    return isDatasourceLoading(datasource) || additionalLoadingState;
}

/**
 * Check if we should show an empty/unavailable state
 */
export function shouldShowEmptyState(datasource: ListValue | undefined): boolean {
    return (
        isDatasourceUnavailable(datasource) ||
        (isDatasourceAvailable(datasource) && (!datasource!.items || datasource!.items.length === 0))
    );
}
