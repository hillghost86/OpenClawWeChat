declare module "node:path" {
  const path: {
    isAbsolute(p: string): boolean;
    join(...parts: string[]): string;
    resolve(...parts: string[]): string;
  };
  export = path;
}
