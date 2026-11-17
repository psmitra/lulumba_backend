// Local FTP server for development: `npm run ftp:dev` (reads .env).
//
// Serves DEV_FTP_ROOT on FTP_HOST:FTP_PORT and accepts exactly one login,
// FTP_USERNAME / FTP_PASSWORD, so STORAGE_DRIVER=ftp works without
// installing an FTP server. The API then stores files under
// DEV_FTP_ROOT + FTP_ROOT_PATH, e.g.
//   D:/wamp64/www/lulumba-uploads + /lulumba
// Never use it in production: plain FTP, one user, no TLS.
import FtpSrv from 'ftp-srv';
import { mkdirSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

const env = process.env;

if (env.APP_ENV === 'production') {
  fail('refusing to run with APP_ENV=production');
}
if (env.STORAGE_DRIVER !== 'ftp') {
  console.warn(
    `[dev-ftp] note: STORAGE_DRIVER is "${env.STORAGE_DRIVER}", so the API won't use this server`,
  );
}

const host = env.FTP_HOST || '127.0.0.1';
const port = Number(env.FTP_PORT || 21);
const user = env.FTP_USERNAME;
const password = env.FTP_PASSWORD ?? '';
const root = env.DEV_FTP_ROOT;

if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
  fail(
    `FTP_HOST is "${host}"; the dev server only runs on this machine (127.0.0.1)`,
  );
}
if (!user) fail('FTP_USERNAME is not set in .env');
// FTP clients can't send an empty PASS (servers answer 501).
if (!password) fail('FTP_PASSWORD is empty in .env; set any dev password');
if (!root || !isAbsolute(root)) {
  fail(
    'DEV_FTP_ROOT must be an absolute directory, e.g. D:/wamp64/www/lulumba-uploads',
  );
}
if (env.FTP_SECURE && env.FTP_SECURE !== 'false') {
  fail('set FTP_SECURE=false: the dev server is plain FTP');
}

const rootDir = resolve(root);
mkdirSync(rootDir, { recursive: true });

// ftp-srv expects a bunyan logger; keep only warnings and real errors.
// Skipped: "not found" replies (the API's exists/delete checks) and the
// client hanging up (the API closes its connection after every operation).
const EXPECTED = /ENOENT|Socket not writable/;
const report =
  (write) =>
  (...args) => {
    const parts = describe(args);
    if (!parts.some((part) => EXPECTED.test(String(part)))) {
      write('[dev-ftp]', ...parts);
    }
  };
const logger = {
  child: () => logger,
  trace() {},
  debug() {},
  info() {},
  warn: report(console.warn),
  error: report(console.error),
};

const server = new FtpSrv({
  url: `ftp://127.0.0.1:${port}`,
  pasv_url: '127.0.0.1',
  pasv_min: 50000,
  pasv_max: 50100,
  anonymous: false,
  greeting: 'Lulumba dev FTP server',
  log: logger,
});

server.on('login', ({ username, password: given }, accept, reject) => {
  if (username === user && given === password) {
    accept({ root: rootDir });
  } else {
    console.warn(`[dev-ftp] rejected login for "${username}"`);
    reject(new Error('Invalid username or password'));
  }
});

server.on('server-error', ({ error }) => {
  console.error('[dev-ftp] server error:', error.message);
});

try {
  await server.listen();
} catch (error) {
  fail(
    error.code === 'EADDRINUSE'
      ? `port ${port} is already in use (another FTP server running?)`
      : error.message,
  );
}
console.log(`[dev-ftp] ftp://127.0.0.1:${port} -> ${rootDir} (user "${user}")`);
console.log(
  `[dev-ftp] API files land in ${resolve(rootDir, '.' + (env.FTP_ROOT_PATH || '/lulumba'))}`,
);

const stop = () => server.close().finally(() => process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

function fail(message) {
  console.error(`[dev-ftp] ${message}`);
  process.exit(1);
}

// bunyan style: (fields, message) or (error).
function describe(args) {
  return args.map((arg) =>
    arg instanceof Error
      ? arg.message
      : arg && typeof arg === 'object'
        ? (arg.err?.message ?? arg.error?.message ?? JSON.stringify(arg))
        : arg,
  );
}
