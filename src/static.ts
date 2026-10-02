import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { sha256 } from './util/crypto.js';

const FILES: Record<string, string> = {
  'style.css': 'text/css; charset=utf-8',
  'app.js': 'text/javascript; charset=utf-8',
  'favicon.svg': 'image/svg+xml',
  // Browsers and search crawlers ask for /favicon.ico on their own; Safari ignores SVG icons.
  'favicon.ico': 'image/x-icon',
  'apple-touch-icon.png': 'image/png',
};

export type AssetUrls = Record<keyof typeof FILES, string>;

/**
 * Serves public/ from memory. Pages link `/<file>?v=<hash>`, so the files can be cached for a
 * year and a deploy still reaches every browser at once.
 */
export function registerStatic(app: FastifyInstance): AssetUrls {
  const dir = new URL('../public/', import.meta.url);
  const urls: Record<string, string> = {};
  for (const [file, type] of Object.entries(FILES)) {
    const body = readFileSync(new URL(file, dir));
    const version = sha256(body.toString('latin1')).slice(0, 10);
    urls[file] = `/${file}?v=${version}`;
    app.get(`/${file}`, async (req, reply) => {
      const versioned = (req.query as { v?: string }).v === version;
      return reply
        .type(type)
        .header(
          'cache-control',
          versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
        )
        .send(body);
    });
  }
  return urls as AssetUrls;
}
