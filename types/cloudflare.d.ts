/* Minimal ambient bindings used by the bundled Cloudflare worker entry. */
/* eslint-disable @typescript-eslint/no-explicit-any */

type Fetcher = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

type D1Database = any;

declare module "cloudflare:workers" {
  export const env: Record<string, any>;
}
