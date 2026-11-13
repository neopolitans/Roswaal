/** Whether release `a` is later than release `b`. See `versions.mjs`. */
export function newer(a: string, b: string): boolean;

/** Whether a range's lowest version is later than `latest`. See `versions.mjs`. */
export function aboveLatest(range: string, latest: string): boolean;
