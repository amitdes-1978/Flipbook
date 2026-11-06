// Concatenate the viewer stylesheets into one file that exports inline.
import { readFileSync, writeFileSync } from 'node:fs';
const css = ['css/flipbook.css', 'css/themes.css', 'css/viewer.css'].map(f => readFileSync(f, 'utf8')).join('\n');
writeFileSync('dist/viewer-runtime.css', css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n\s*\n/g, '\n'));
console.log('dist/viewer-runtime.css', css.length, 'bytes');
