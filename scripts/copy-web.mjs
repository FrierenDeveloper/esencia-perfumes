import { cp, mkdir, rm } from 'node:fs/promises';

await rm('www', { recursive: true, force: true });
await mkdir('www', { recursive: true });
for (const file of ['index.html', 'styles.css', 'app.js']) {
  await cp(file, `www/${file}`);
}
console.log('Web app copied to www/');
