export declare const IS_WINDOWS: boolean;
export declare const IS_MACOS: boolean;
export declare const AGENT_DIR: string;
export declare function run(command: string, args: string[], timeout?: number, partial?: boolean): string | undefined;
export declare function onPath(command: string): string | undefined;
export declare function findBrowser(): string | undefined;
export declare function hasNerdFont(): boolean;
export declare function projectListeners(root: string): { port: number; pid: number; cmd: string }[];
export declare function projectRoot(cwd?: string): string;
