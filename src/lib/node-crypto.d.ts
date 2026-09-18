declare module "node:buffer" {
  export class Buffer {
    static from(str: string | any, encoding?: string): any;
    static concat(buffers: any[]): any;
    toString(encoding?: string): string;
  }
}

declare module "node:crypto" {
  export function randomBytes(size: number): any;
  export function publicEncrypt(key: any, buffer: any): any;
  export function privateDecrypt(key: any, buffer: any): any;
  export function createCipheriv(algorithm: string, key: any, iv: any): any;
  export function createDecipheriv(algorithm: string, key: any, iv: any): any;
  export const constants: { RSA_PKCS1_PADDING: number };
}
