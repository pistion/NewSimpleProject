const http = require('http');
const assert = require('assert');
const { createNativeServer } = require('./server/create-native-server');

function request(port, method, path, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: raw ? JSON.parse(raw) : null });
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  const server = createNativeServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const health = await request(port, 'GET', '/api/health');
    assert.strictEqual(health.statusCode, 200, 'health endpoint should respond 200');
    assert.strictEqual(health.body.ok, true, 'health response should be ok');

    const positions = await request(port, 'GET', '/api/positions');
    assert.strictEqual(positions.statusCode, 200, 'positions endpoint should respond 200');
    assert(Array.isArray(positions.body.data), 'positions should return an array');

    const applicants = await request(port, 'GET', '/api/applicants/summary');
    assert.strictEqual(applicants.statusCode, 200, 'applicant summary endpoint should respond 200');
    assert(applicants.body.data.total >= 18, 'applicant summary should include seeded applicants');

    const created = await request(port, 'POST', '/api/tasks', {
      title: 'Smoke test server task',
      owner: 'system',
      status: 'open'
    });
    assert.strictEqual(created.statusCode, 201, 'task create endpoint should respond 201');

    console.log('HEYA server smoke test passed');
    console.log('health:', health.body.data || health.body.meta || health.body);
    console.log('routes:', server.routes.length);
  } finally {
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
