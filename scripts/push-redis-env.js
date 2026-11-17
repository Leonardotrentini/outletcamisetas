const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.kv.tmp');
const env = fs.readFileSync(envPath, 'utf8');

function get(key) {
  const m = env.match(new RegExp('^' + key + '="?([^"\\r\\n]+)"?', 'm'));
  if (!m) throw new Error('missing ' + key);
  return m[1];
}

const url = get('KV_REST_API_URL');
const token = get('KV_REST_API_TOKEN');

const pairs = [
  ['KV_REST_API_URL', url],
  ['KV_REST_API_TOKEN', token],
  ['UPSTASH_REDIS_REST_URL', url],
  ['UPSTASH_REDIS_REST_TOKEN', token],
];

for (const [key, value] of pairs) {
  execFileSync('vercel', ['env', 'add', key, 'production'], {
    input: value,
    stdio: ['pipe', 'inherit', 'inherit'],
    shell: true,
  });
}

console.log('redis_env_ok');
