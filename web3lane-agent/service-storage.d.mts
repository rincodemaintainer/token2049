export function serviceDataRoot(): string;
export function serviceDataPath(...parts: string[]): string;
export const dataPath: typeof serviceDataPath;
export function writeJsonAtomic(file: string, value: unknown): Promise<void>;
export function createJsonOnce(file: string, value: unknown): Promise<void>;
export function acquireApiLock(): Promise<() => Promise<void>>;
