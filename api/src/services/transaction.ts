/** Runs `fn` atomically. Injected into services so they stay unaware of the DB driver. */
export type Transact = <T>(fn: () => T) => T;
