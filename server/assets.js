import { readFileSync } from 'node:fs';
export function readAssets() {
  return Object.fromEntries(['index.html', 'style.css', 'app.js', 'admin.html', 'admin.js', 'favicon.svg'].map(file => [
    `/${file}`, { body: readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8'),
      type: file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript' },
  ]));
}
