declare module "fs" {
  const fs: {
    mkdirSync(path: string, options?: { recursive?: boolean }): void;
    readFileSync(path: string, encoding: string): string;
    writeFileSync(path: string, data: Buffer | Uint8Array | string, encoding?: string): void;
    existsSync(path: string): boolean;
  };
  export = fs;
}
