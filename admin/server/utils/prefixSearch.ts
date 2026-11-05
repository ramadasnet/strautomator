// Shared helpers for Firestore prefix searches.

/**
 * Upper bound of prefix range queries: everything starting with the prefix sorts before it,
 * so a range up to `prefix + PREFIX_END` includes all values starting with the prefix.
 */
export const PREFIX_END: string = "\uf8ff"

/**
 * Maximum results returned by a search. Also passed as the limit of each range query,
 * so the amount of documents read from the database is bounded.
 */
export const MAX_RESULTS: number = 500

/**
 * Builds a Firestore range query matching values that start with `value`.
 * Firestore has no case-insensitive or substring operators, so callers should also
 * query the relevant case variants (as typed / lowercase / capitalized).
 * @param field Field to search.
 * @param value Prefix to look for, with the same case it is stored on the database.
 * @returns Query list to be passed to `database.search`.
 */
export const prefixQuery = (field: string, value: string): any[][] => [
    [field, ">=", value],
    [field, "<=", value + PREFIX_END]
]
