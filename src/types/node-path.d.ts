declare module "node:path" {
  const path: {
    isAbsolute(p: string): boolean;
    join(...parts: string[]): string;
    resolve(...parts: string[]): string;
    extname(p: string): string;
    basename(p: string, ext?: string): string;
    dirname(p: string): string;
  };
  export = path;
}
