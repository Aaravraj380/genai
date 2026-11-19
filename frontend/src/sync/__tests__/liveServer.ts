/// <reference types="node" />
/**
 * Starts the real FastAPI backend (../backend) on a free port for the
 * integration tests, with a throw-away database. If Python or the backend's
 * virtual environment isn't found, the tests that need it are skipped.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

/** frontend/src/sync/__tests__ → <project>/backend (override with BACKEND_DIR). */
export const BACKEND_DIR = process.env.BACKEND_DIR ?? path.resolve(__dirname, '../../../../backend');

export function findPython(): string | null {
  const candidates = [
    path.join(BACKEND_DIR, '.venv', 'bin', 'python'),
    path.join(BACKEND_DIR, '.venv', 'Scripts', 'python.exe'),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

/**
 * A minimal `fetch` on Node's http module (the test environment's fetch is a
 * browser polyfill that can't make real requests). Supports what the API client uses.
 */
export const nodeFetch: typeof fetch = (input, init = {}) =>
  new Promise((resolve, reject) => {
    const url = new URL(String(input));
    const body = typeof init.body === 'string' ? init.body : undefined;
    const headers = { ...(init.headers as Record<string, string>), ...(body !== undefined ? { 'Content-Length': String(Buffer.byteLength(body)) } : {}) };
    const signal = init.signal as AbortSignal | undefined;
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method: init.method ?? 'GET', headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({
            ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300,
            status: res.statusCode ?? 0,
            headers: { get: (k: string) => (res.headers[k.toLowerCase()] as string | undefined) ?? null },
            text: async () => text,
            json: async () => JSON.parse(text),
          } as unknown as Response);
        });
      },
    );
    req.on('error', (e) => reject(Object.assign(new TypeError('Network request failed'), { cause: e })));
    signal?.addEventListener('abort', () => {
      req.destroy();
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    });
    if (body !== undefined) req.write(body);
    req.end();
  });

export interface LiveServer {
  url: string;
  stop(): Promise<void>;
}

export async function startServer(): Promise<LiveServer> {
  const python = findPython();
  if (!python) throw new Error('backend virtual environment not found');
  const port = await freePort();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-api-'));
  const child: ChildProcess = spawn(python, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(port), '--log-level', 'warning'], {
    cwd: BACKEND_DIR,
    env: { ...process.env, DATABASE_URL: `sqlite:///${path.join(dir, 'test.db').replace(/\\/g, '/')}`, SECRET_KEY: 'jest-'.repeat(10) },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr?.on('data', (d) => (stderr += String(d)));
  const url = `http://127.0.0.1:${port}`;

  const deadline = Date.now() + 20_000;
  for (;;) {
    try {
      const res = await nodeFetch(`${url}/health`);
      if (res.ok) break;
    } catch {
      /* not up yet */
    }
    if (child.exitCode !== null || Date.now() > deadline) {
      child.kill();
      throw new Error(`backend did not start: ${stderr}`);
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return {
    url,
    stop: () =>
      new Promise<void>((resolve) => {
        child.once('exit', () => {
          fs.rmSync(dir, { recursive: true, force: true });
          resolve();
        });
        child.kill();
      }),
  };
}
