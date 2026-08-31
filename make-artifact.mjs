// Собирает dist/index.html (single-file сборка Vite) в фрагмент для Claude Artifact:
// без doctype/html/head/body — только title, стили, корневой div и скрипт.
import { readFileSync, writeFileSync } from 'fs';

const html = readFileSync('dist/index.html', 'utf8');

const style = html.match(/<style[\s\S]*?<\/style>/)?.[0] ?? '';
const script = html.match(/<script type="module"[\s\S]*<\/script>/)?.[0] ?? '';
if (!script) throw new Error('script not found in dist/index.html');

const out = `<title>Солнце в офисе</title>\n${style}\n<div id="root"></div>\n${script}\n`;
writeFileSync('artifact.html', out);
console.log(`artifact.html: ${(out.length / 1024).toFixed(0)} KB`);
