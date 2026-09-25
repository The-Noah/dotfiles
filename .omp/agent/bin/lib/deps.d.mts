export interface Dep {
  id: string;
  label: string;
  why: string;
  applies?: () => boolean;
  present: () => boolean;
  install: () => string[] | undefined;
  manual: string;
}
export declare const DEPS: Dep[];
export declare function missingDeps(): Dep[];
