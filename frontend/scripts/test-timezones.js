/**
 * Runs the domain test-suite under several process time zones to prove the
 * streak engine does not depend on the device's UTC offset or DST rules.
 * Cross-platform (works on Windows, macOS and Linux): `npm run test:tz`.
 */
const { spawnSync } = require('child_process');

const zones = ['UTC', 'Asia/Kolkata', 'America/New_York', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Australia/Lord_Howe'];
let failed = false;
for (const tz of zones) {
  process.stdout.write(`\n▶ TZ=${tz}\n`);
  const res = spawnSync('npx', ['jest', 'src/domain', 'src/services', '--silent'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, TZ: tz },
  });
  if (res.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
