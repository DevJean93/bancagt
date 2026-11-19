// Construye el sitio de evidencias para GitHub Pages sin dependencias externas:
// convierte cada docs/*.md a HTML (Markdown básico) y arma un índice con los
// documentos y los reportes de seguridad descargados del último CI.
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, basename, relative } from 'node:path';

const destino = process.argv[2] || 'sitio';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

function enLinea(t) {
  return esc(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, txt, url) => `<a href="${url.replace(/\.md(#|$)/, '.html$1')}">${txt}</a>`);
}

function markdown(md) {
  const out = [];
  const lineas = md.replace(/\r/g, '').split('\n');
  let i = 0;
  while (i < lineas.length) {
    const l = lineas[i];
    if (l.startsWith('```')) {
      const bloque = [];
      i++;
      while (i < lineas.length && !lineas[i].startsWith('```')) bloque.push(lineas[i++]);
      out.push(`<pre><code>${esc(bloque.join('\n'))}</code></pre>`);
      i++;
      continue;
    }
    const h = l.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      const n = h[1].length;
      out.push(`<h${n} id="${slug(h[2])}">${enLinea(h[2])}</h${n}>`);
      i++;
      continue;
    }
    if (l.startsWith('|')) {
      const filas = [];
      while (i < lineas.length && lineas[i].startsWith('|')) filas.push(lineas[i++]);
      const celdas = (f) => f.slice(1, -1).split('|').map((c) => c.trim());
      const cab = celdas(filas[0]);
      const cuerpo = filas.slice(2).map(celdas);
      out.push(`<table><thead><tr>${cab.map((c) => `<th>${enLinea(c)}</th>`).join('')}</tr></thead><tbody>${cuerpo.map((f) => `<tr>${f.map((c) => `<td>${enLinea(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (/^\s*[-*]\s+/.test(l) || /^\s*\d+\.\s+/.test(l)) {
      const ordenada = /^\s*\d+\./.test(l);
      const items = [];
      while (i < lineas.length && (/^\s*[-*]\s+/.test(lineas[i]) || /^\s*\d+\.\s+/.test(lineas[i]))) {
        items.push(lineas[i].replace(/^\s*([-*]|\d+\.)\s+/, ''));
        i++;
      }
      const tag = ordenada ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((x) => `<li>${enLinea(x)}</li>`).join('')}</${tag}>`);
      continue;
    }
    if (l.startsWith('>')) {
      out.push(`<blockquote>${enLinea(l.replace(/^>\s?/, ''))}</blockquote>`);
      i++;
      continue;
    }
    if (l.trim() === '') { i++; continue; }
    const parrafo = [];
    while (i < lineas.length && lineas[i].trim() !== '' && !/^(#|```|\||>|\s*[-*]\s|\s*\d+\.\s)/.test(lineas[i])) parrafo.push(lineas[i++]);
    out.push(`<p>${enLinea(parrafo.join(' '))}</p>`);
  }
  return out.join('\n');
}

const estilo = `
:root{--navy:#0f2a52;--gold:#a8842f;--txt:#1c2433;--suave:#5b6578;--linea:#dfe4ec;--fondo:#f5f7fa}
@media (prefers-color-scheme:dark){:root{--navy:#9fb8e0;--gold:#d4b25a;--txt:#e3e7ee;--suave:#a3acbb;--linea:#2c3442;--fondo:#12161d}}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,"Segoe UI",sans-serif;color:var(--txt);background:var(--fondo);line-height:1.6}
header{background:#0f2a52;color:#fff;padding:18px 24px}header a{color:#fff;text-decoration:none;font-weight:700}
main{max-width:920px;margin:0 auto;padding:24px 16px}h1,h2,h3{color:var(--navy);line-height:1.3}h2{border-bottom:2px solid var(--gold);padding-bottom:4px;margin-top:2em}
table{border-collapse:collapse;width:100%;display:block;overflow-x:auto;font-size:.92rem}th,td{border:1px solid var(--linea);padding:6px 8px;text-align:left;vertical-align:top}th{background:rgba(15,42,82,.08)}
pre{background:#0f172a;color:#e2e8f0;padding:12px;border-radius:6px;overflow-x:auto;font-size:.85rem}code{font-family:Consolas,monospace}
blockquote{border-left:4px solid var(--gold);margin:1em 0;padding:4px 14px;color:var(--suave)}a{color:var(--navy)}
`;

const pagina = (titulo, cuerpo) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo)} · BancaGT</title><style>${estilo}</style></head><body><header><a href="index.html">BancaGT · Evidencias DevSecOps</a></header><main>${cuerpo}</main></body></html>`;

// 1. Documentos Markdown → HTML
const docs = readdirSync(destino).filter((f) => f.endsWith('.md') && f !== 'README.md');
const enlaces = [];
for (const f of docs) {
  const md = readFileSync(join(destino, f), 'utf8');
  const titulo = (md.match(/^#\s+(.*)/m) || [, basename(f, '.md')])[1];
  writeFileSync(join(destino, f.replace(/\.md$/, '.html')), pagina(titulo, markdown(md)));
  enlaces.push({ titulo, url: f.replace(/\.md$/, '.html') });
}

// 2. Reportes de CI y evidencias (listado de archivos)
function listar(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? listar(p) : [relative(destino, p).replace(/\\/g, '/')];
  });
}
const reportes = listar(join(destino, 'reportes'));
const evidencias = listar(join(destino, 'evidencias'));

const indice = `
<h1>BancaGT en Línea · Evidencias del Proyecto Final</h1>
<p>Sitio generado automáticamente por GitHub Actions en cada cambio de la rama <code>main</code>.
Permanece disponible aunque el clúster local esté apagado.</p>
<h2>Documentación operativa</h2>
<ul>${enlaces.sort((a, b) => a.url.localeCompare(b.url)).map((e) => `<li><a href="${e.url}">${esc(e.titulo)}</a></li>`).join('')}</ul>
<h2>Reportes de seguridad del último pipeline</h2>
${reportes.length ? `<ul>${reportes.map((r) => `<li><a href="${r}">${esc(r)}</a></li>`).join('')}</ul>` : '<p>Aún no hay reportes publicados.</p>'}
<h2>Evidencias de pruebas en el entorno local</h2>
${evidencias.length ? `<ul>${evidencias.map((r) => `<li><a href="${r}">${esc(r)}</a></li>`).join('')}</ul>` : '<p>Aún no hay evidencias publicadas.</p>'}
<p><small>Generado: ${new Date().toISOString()}</small></p>`;
writeFileSync(join(destino, 'index.html'), pagina('Inicio', indice));
console.log(`Sitio listo: ${enlaces.length} documentos, ${reportes.length} reportes, ${evidencias.length} evidencias`);
