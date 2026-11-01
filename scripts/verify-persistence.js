import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// Run only after Compose is configured. This recreates app + DB containers,
// not their named volume, and leaves one evidence task in the database.
const base =
  process.env.API_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`;
function compose(...args) {
  execFileSync('docker', ['compose', ...args], { stdio: 'inherit' });
}
compose('up', '-d', '--build', '--wait');
const title = `Persistence proof ${new Date().toISOString()}`;
const createdResponse = await fetch(`${base}/tasks`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title }),
});
assert.equal(createdResponse.status, 201);
const created = await createdResponse.json();
console.log('Created:', created);
compose('up', '-d', '--force-recreate', '--wait');
const response = await fetch(`${base}/tasks/${created.id}`);
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), created);
console.log(
  'PASS: identical task remains after app and database container recreation.',
);
