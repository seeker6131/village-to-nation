// Builds play.html: one offline HTML file with CSS, every ES module (wrapped, dependency-ordered) and the
// artwork used at runtime embedded as data URLs. Source stays modular in src/ — never edit play.html by hand.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = path.resolve(import.meta.dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

// ---- module graph
const IMPORT_RE = /^import\s*\{([^}]*)\}\s*from\s*'(\.{1,2}\/[^']+)';\s*$/gm;
const mods = new Map(); // rel path -> {code, deps}
function load(rel) {
  if (mods.has(rel)) return;
  const src = read(rel);
  const deps = [];
  for (const m of src.matchAll(IMPORT_RE)) deps.push(path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[2])));
  mods.set(rel, { src, deps });
  for (const d of deps) load(d);
}
load('src/main.js');
const order = [], state = new Map();
function visit(rel, stack = []) {
  if (state.get(rel) === 'done') return;
  if (state.get(rel) === 'visiting') throw new Error('Import cycle: ' + [...stack, rel].join(' -> '));
  state.set(rel, 'visiting');
  for (const d of mods.get(rel).deps) visit(d, [...stack, rel]);
  state.set(rel, 'done'); order.push(rel);
}
visit('src/main.js');

// Export names come from Node itself (handles `export const A = 1, B = 2;` etc.). main.js has no exports.
const exportNames = {};
for (const rel of order) exportNames[rel] = rel === 'src/main.js' ? [] : Object.keys(await import(pathToFileURL(path.join(root, rel)).href));

function transform(rel, src) {
  const exportsList = [...exportNames[rel]];
  let code = src.replace(IMPORT_RE, (_, names, from) => {
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), from));
    const binds = names.split(',').map(s => s.trim()).filter(Boolean).map(s => s.replace(/\s+as\s+/, ': '));
    return `const { ${binds.join(', ')} } = __mod[${JSON.stringify(target)}];`;
  });
  code = code.replace(/^export\s+(?=(async\s+function|function|const|let|class)\b)/gm, '');
  code = code.replace(/^export\s*\{([^}]*)\};?\s*$/gm, (_, names) => {
    for (const n of names.split(',').map(s => s.trim()).filter(Boolean)) { const [a, b] = n.split(/\s+as\s+/); if (b) { exportsList.splice(exportsList.indexOf(b), 1, `${b}: ${a}`); } }
    return '';
  });
  if (/^\s*(import|export)\b/m.test(code)) throw new Error('Unprocessed import/export in ' + rel);
  return `// ==== ${rel} ====\n__mod[${JSON.stringify(rel)}] = (() => {\n${code}\nreturn { ${exportsList.join(', ')} };\n})();`;
}
const bundle = 'const __mod = {};\n' + order.map(rel => transform(rel, mods.get(rel).src)).join('\n');

// ---- assets actually used at runtime
const used = (await import(pathToFileURL(path.join(root, 'src/ui/render.js')).href)).ART_USED; // exactly what the renderer loads
const map = {};
for (const id of used) map[id] = 'data:image/webp;base64,' + fs.readFileSync(path.join(root, 'assets', id + '.webp')).toString('base64');

const fantasyAssets = {};
for (const name of ['char_base_walk','hair_short','hair_ponytail','hair_wavy','beards','hats','outfit_poor','outfit_noble','outfit_smith','outfit_soldier','outfit_merchant']) {
  fantasyAssets[name] = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'source_art/fantasy', name + '.png')).toString('base64');
}
const html = read('index.html')
  .replace('<link rel="stylesheet" href="./src/style.css" />', () => `<style>${read('src/style.css')}</style>`)
  .replace('<script type="module" src="./src/main.js"></script>', () => `<script>\nwindow.__V2N_ASSET_MAP__=${JSON.stringify(map)};
window.__V2N_FANTASY_MAP__=${JSON.stringify(fantasyAssets)};\n(() => {\n${bundle}\n})();\n</script>`);
fs.writeFileSync(path.join(root, 'play.html'), html);
console.log(`play.html: ${order.length} modules, ${used.length} images, ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MiB`);
