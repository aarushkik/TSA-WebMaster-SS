import { mkdirSync, readFileSync, writeFileSync, cpSync } from 'node:fs';
import { readAssets } from '../server/assets.js';
mkdirSync('dist/server', { recursive: true });
const source = readFileSync('server/app.js', 'utf8');
writeFileSync('dist/server/index.js', `${source}\nconst assets = ${JSON.stringify(readAssets())};\nexport default { fetch(request, env) { return handle(request, env.DB, assets); } };\n`);
cpSync('.openai', 'dist/.openai', { recursive: true });
cpSync('migrations', 'dist/migrations', { recursive: true });
console.log('Built worker with embedded HTML, CSS, and JavaScript.');
