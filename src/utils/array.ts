/**
 * type-guarded function that tells TypeScript (in strictNullChecks mode) that you're filtering out null/undefined items.
 * example: array.filter(isNotNull)
 */
export const isNotNull = <T>(item: T): item is NonNullable<T> => item != null;

// alternative
// const const isNotNull = <T>(item: T | null): item is T => item !== null;
