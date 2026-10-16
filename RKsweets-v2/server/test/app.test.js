import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

test('health endpoint is available and returns service identity', async () => {
  const server=createApp().listen(0);
  try {const {port}=server.address();const response=await fetch(`http://127.0.0.1:${port}/health`);assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,service:'rk-sweets-api'});} finally {await new Promise(resolve=>server.close(resolve));}
});
test('admin operations require authentication', async () => {
  const server=createApp().listen(0);
  try {const {port}=server.address();const response=await fetch(`http://127.0.0.1:${port}/api/admin/orders`);assert.equal(response.status,401);} finally {await new Promise(resolve=>server.close(resolve));}
});
