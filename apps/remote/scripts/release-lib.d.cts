export declare const ALLOWED_PERMISSIONS: string[];
export declare function versionCodeFor(semver: string): number;
export declare function setVersion<T extends { expo: object }>(appJson: T, semver: string): T;
export declare function permissionsIn(xml: string): string[];
export declare function checkPermissions(found: string[]): { extra: string[]; missing: string[] };
