import { cp, mkdir, rm, writeFile } from 'node:fs/promises';

await rm('www', { recursive: true, force: true });
await mkdir('www', { recursive: true });
for (const file of ['index.html', 'styles.css', 'app.js']) {
  await cp(file, `www/${file}`);
}
const apiBaseUrl = process.env.ESENCIA_API_BASE_URL || '';
await writeFile('www/app-config.js', `window.ESENCIA_API_BASE_URL = ${JSON.stringify(apiBaseUrl)};\n`);
console.log('Web app copied to www/');
