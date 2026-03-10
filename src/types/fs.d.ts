declare module "fs" {
  const fs: {
    mkdirSync(path: string, options?: { recursive?: boolean }): void;
    writeFileSync(path: string, data: Buffer | Uint8Array): void;
    existsSync(path: string): boolean;
  };
  export = fs;
}
