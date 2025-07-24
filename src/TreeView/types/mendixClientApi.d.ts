/**
 * Type definitions for Mendix Client API (window.mx)
 * Based on Mendix 10 Client API documentation
 * https://apidocs.rnd.mendix.com/10/client-react/mx.data.html
 */

declare namespace mendix {
    namespace lib {
        interface MxObject {
            getGuid(): string;
            get(attribute: string): any;
            set(attribute: string, value: any): void;
            getEntity(): string;
            isBoolean(attribute: string): boolean;
            isDate(attribute: string): boolean;
            isEnum(attribute: string): boolean;
            isLocalizedDate(attribute: string): boolean;
            isNumber(attribute: string): boolean;
            isPassword(attribute: string): boolean;
            isReference(attribute: string): boolean;
            isReferenceSet(attribute: string): boolean;
            isString(attribute: string): boolean;
            getAttributes(): string[];
            getReferences(): string[];
            hasChanges(): boolean;
            isNew(): boolean;
            getTrackId(): string;
            addReference(reference: string, guid: string): void;
            removeReferences(reference: string, guids: string[]): void;
            getReferencedGuid(reference: string): string | null;
            getReferencedGuids(reference: string): string[];
        }
    }
}

declare global {
    interface Window {
        mx: {
            data: {
                /**
                 * Retrieve objects from the server
                 */
                get(args: {
                    /** XPath constraint to retrieve objects */
                    xpath: string;
                    /** Callback to be called when objects are retrieved */
                    callback: (objs: mendix.lib.MxObject[]) => void;
                    /** Error callback */
                    error?: (error: Error) => void;
                    /** Additional filter options */
                    filter?: {
                        /** List of attributes to fetch. If not specified, all attributes are fetched */
                        attributes?: string[];
                        /** Associations to fetch */
                        references?: Record<string, string>;
                        /** Limit the number of objects to retrieve */
                        amount?: number;
                        /** Offset for pagination */
                        offset?: number;
                        /** Sort specification: array of [attribute, direction] tuples */
                        sort?: Array<[string, "asc" | "desc"]>;
                    };
                    /** Count objects without retrieving them */
                    count?: boolean;
                }): void;

                /**
                 * Retrieve a single object by GUID
                 */
                getByGuid(args: {
                    /** GUID of the object to retrieve */
                    guid: string;
                    /** Callback to be called when object is retrieved */
                    callback: (obj: mendix.lib.MxObject | null) => void;
                    /** Error callback */
                    error?: (error: Error) => void;
                }): void;

                /**
                 * Create a new object
                 */
                create(args: {
                    /** Entity name */
                    entity: string;
                    /** Callback to be called when object is created */
                    callback: (obj: mendix.lib.MxObject) => void;
                    /** Error callback */
                    error?: (error: Error) => void;
                }): void;

                /**
                 * Commit objects to the server
                 */
                commit(args: {
                    /** Objects to commit */
                    mxobjs: mendix.lib.MxObject | mendix.lib.MxObject[];
                    /** Callback to be called when commit succeeds */
                    callback: () => void;
                    /** Error callback */
                    error?: (error: Error) => void;
                    /** Whether to run validation before committing */
                    validate?: boolean;
                }): void;

                /**
                 * Remove objects
                 */
                remove(args: {
                    /** Objects to remove */
                    mxobjs: mendix.lib.MxObject | mendix.lib.MxObject[];
                    /** Callback to be called when removal succeeds */
                    callback: () => void;
                    /** Error callback */
                    error?: (error: Error) => void;
                }): void;

                /**
                 * Rollback changes to objects
                 */
                rollback(args: {
                    /** Objects to rollback */
                    mxobjs: mendix.lib.MxObject | mendix.lib.MxObject[];
                    /** Callback to be called when rollback succeeds */
                    callback: () => void;
                    /** Error callback */
                    error?: (error: Error) => void;
                }): void;

                /**
                 * Release objects from memory to prevent memory leaks
                 * Should be called when objects are no longer needed
                 */
                release(objs: mendix.lib.MxObject | mendix.lib.MxObject[]): void;

                /**
                 * Subscribe to changes on objects
                 * @returns A subscription GUID that can be passed to unsubscribe
                 */
                subscribe(args: {
                    /** Object to subscribe to */
                    guid: string;
                    /** Callback to be called when object changes */
                    callback: (guid: string) => void;
                    /** Error callback */
                    error?: (error: Error) => void;
                }): string;

                /**
                 * Unsubscribe from object changes
                 * @param handle The subscription GUID returned from subscribe
                 */
                unsubscribe(handle: string): void;

                /**
                 * Execute a microflow
                 */
                action(args: {
                    /** Name of the microflow to execute */
                    params: {
                        applyto: "selection";
                        actionname: string;
                        guids?: string[];
                    };
                    /** Callback to be called when microflow completes */
                    callback?: (result: any) => void;
                    /** Error callback */
                    error?: (error: Error) => void;
                }): void;
            };

            /**
             * Session information
             */
            session: {
                getUserId(): string;
                getUserName(): string;
                getSessionObjectId(): string;
                isGuest(): boolean;

                /**
                 * Session data containing cached objects
                 */
                sessionData?: {
                    csrftoken: string;
                    objects?: {
                        [guid: string]: {
                            getEntity(): string;
                            get(attribute: string): {
                                readonly: boolean;
                                value: string; // Always a string! Numbers are "'123'", booleans are "'true'"
                            };
                            getGuid(): string;
                            toString(): string;
                            valueOf(): any;
                        };
                    };
                };
            };

            /**
             * UI functions
             */
            ui: {
                /**
                 * Show information message
                 */
                info(message: string, blocking?: boolean): void;
                /**
                 * Show warning message
                 */
                warning(message: string, blocking?: boolean): void;
                /**
                 * Show error message
                 */
                error(message: string, blocking?: boolean): void;
                /**
                 * Show confirmation dialog
                 */
                confirmation(args: {
                    content: string;
                    proceed: string;
                    cancel: string;
                    handler: (confirmed: boolean) => void;
                }): void;
            };
        };
    }
}

export {};
