import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('build/web-mobile');
const port=Number(process.env.SURVIVAL_PREVIEW_PORT||7457);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('预览端口必须在 1024～65535');
const faultFile=process.env.SURVIVAL_PREVIEW_FAULT_FILE;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png' };
http.createServer(async (req, res) => {
    try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if(faultFile){const failed=(await readFile(faultFile,'utf8').catch(()=>'')).trim();if(/^game-(startup|common|heroes|monsters|seasons)$/.test(failed)&&pathname.startsWith(`/assets/${failed}/`)){res.writeHead(503,{'Cache-Control':'no-store'}).end('开发验证：模拟内容加载失败');return;}}
        let file = path.resolve(root, `.${pathname}`);
        if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
        if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
        res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
        res.end(await readFile(file));
    } catch { res.writeHead(404).end('未找到构建文件，请先执行 npm run build:web'); }
}).listen(port, '127.0.0.1', () => console.log(`游戏预览：http://127.0.0.1:${port}`));
