"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.startRolloutServer = startRolloutServer;
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const http = __importStar(require("http"));
const path = __importStar(require("path"));
const url_1 = require("url");
const util_1 = require("util");
const readdir = (0, util_1.promisify)(fs.readdir);
const readFile = (0, util_1.promisify)(fs.readFile);
const stat = (0, util_1.promisify)(fs.stat);
function isPathInsideRoot(root, target) {
    const rootR = path.resolve(root);
    const targetR = path.resolve(target);
    const rel = path.relative(rootR, targetR);
    return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..');
}
function safeStepSegment(name) {
    if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) {
        return false;
    }
    return name.startsWith('step_');
}
function safeJsonBasename(name) {
    if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) {
        return false;
    }
    return name.endsWith('.json');
}
function rolloutScore(r) {
    if (r == null) {
        return 0;
    }
    if (typeof r.score === 'number') {
        return r.score;
    }
    const reward = r.reward;
    return reward?.score ?? 0;
}
function extractQuestion(content) {
    const nluMatch = content.match(/^(.*?)<NLU\(仅供参考\)>/s);
    if (nluMatch) {
        return nluMatch[1].trim();
    }
    const timeMatch = content.match(/^(.*?)<当前系统时间>/s);
    if (timeMatch) {
        return timeMatch[1].trim();
    }
    const firstLine = content.split('\n')[0].trim();
    return firstLine.substring(0, 200);
}
function summarizeRollout(data, file) {
    const messages = data.messages || [];
    let extractedQuestion = '';
    for (let j = messages.length - 1; j >= 0; j--) {
        if (messages[j].role === 'user') {
            const c = messages[j].content;
            const raw = typeof c === 'string' ? c : JSON.stringify(c);
            extractedQuestion = extractQuestion(raw);
            break;
        }
    }
    if (!extractedQuestion) {
        extractedQuestion = '未找到user内容';
    }
    return {
        file,
        score: rolloutScore(data),
        question: extractedQuestion,
        request_id: data.request_id,
        timestamp: data.timestamp,
        run_time: data.run_time
    };
}
async function scanStepFolders(rolloutFolder) {
    const steps = [];
    const files = await readdir(rolloutFolder);
    const checkPromises = files
        .filter(f => f.startsWith('step_'))
        .map(async (file) => {
        const fullPath = path.join(rolloutFolder, file);
        try {
            const fileStat = await stat(fullPath);
            if (fileStat.isDirectory()) {
                const subFiles = await readdir(fullPath);
                const jsonCount = subFiles.filter(f => f.endsWith('.json')).length;
                return { name: file, path: fullPath, fileCount: jsonCount };
            }
        }
        catch {
            /* ignore */
        }
        return null;
    });
    const results = await Promise.all(checkPromises);
    for (const r of results) {
        if (r) {
            steps.push(r);
        }
    }
    steps.sort((a, b) => {
        const numA = parseInt(a.name.replace('step_', ''), 10);
        const numB = parseInt(b.name.replace('step_', ''), 10);
        return (isNaN(numA) ? 0 : numA) - (isNaN(numB) ? 0 : numB);
    });
    return steps;
}
function json(res, code, body) {
    const s = JSON.stringify(body);
    res.writeHead(code, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(s)
    });
    res.end(s);
}
function forbidden(res) {
    json(res, 403, { error: 'Forbidden' });
}
function notFound(res) {
    json(res, 404, { error: 'Not Found' });
}
/**
 * 在 127.0.0.1 上启动本地服务：提供 viewer 页面与 /api/steps、/api/summary、/api/rollout。
 */
function startRolloutServer(rolloutRoot, extensionMediaDir) {
    const token = crypto.randomBytes(24).toString('hex');
    const viewerPath = path.join(extensionMediaDir, 'viewer.html');
    const server = http.createServer(async (req, res) => {
        try {
            const u = new url_1.URL(req.url || '/', 'http://127.0.0.1');
            const pathname = u.pathname.replace(/\/$/, '') || '/';
            if (pathname === '/' || pathname === '/viewer.html' || pathname === '/index.html') {
                const qToken = u.searchParams.get('token') || '';
                if (qToken !== token) {
                    forbidden(res);
                    return;
                }
                let html = fs.readFileSync(viewerPath, 'utf-8');
                const inject = `<script>window.__AGENT_RL_API_TOKEN__=${JSON.stringify(token)};</script>`;
                html = html.replace('</head>', `${inject}</head>`);
                const buf = Buffer.from(html, 'utf-8');
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': buf.length });
                res.end(buf);
                return;
            }
            const apiToken = u.searchParams.get('token') || '';
            if (apiToken !== token) {
                forbidden(res);
                return;
            }
            if (pathname === '/api/steps') {
                const steps = await scanStepFolders(rolloutRoot);
                json(res, 200, { steps, rootFolder: rolloutRoot });
                return;
            }
            if (pathname === '/api/summary') {
                const stepName = u.searchParams.get('step') || '';
                if (!safeStepSegment(stepName)) {
                    json(res, 400, { error: 'Invalid step' });
                    return;
                }
                const stepDir = path.join(rolloutRoot, stepName);
                if (!isPathInsideRoot(rolloutRoot, stepDir)) {
                    forbidden(res);
                    return;
                }
                let names;
                try {
                    names = (await readdir(stepDir)).filter(f => f.endsWith('.json'));
                }
                catch {
                    json(res, 404, { error: 'Step not found' });
                    return;
                }
                const fileJobs = names
                    .filter(f => safeJsonBasename(f))
                    .map(file => ({ file, fp: path.join(stepDir, file) }))
                    .filter(({ fp }) => isPathInsideRoot(rolloutRoot, fp));
                /** 并行读取摘要，分块限制并发，避免一次性打开过多文件句柄 */
                const CONCURRENCY = 32;
                const summaries = [];
                for (let i = 0; i < fileJobs.length; i += CONCURRENCY) {
                    const chunk = fileJobs.slice(i, i + CONCURRENCY);
                    const batch = await Promise.all(chunk.map(async ({ file, fp }) => {
                        try {
                            const raw = await readFile(fp, 'utf-8');
                            const data = JSON.parse(raw);
                            return summarizeRollout(data, file);
                        }
                        catch {
                            return null;
                        }
                    }));
                    for (const s of batch) {
                        if (s) {
                            summaries.push(s);
                        }
                    }
                }
                json(res, 200, { summaries });
                return;
            }
            if (pathname === '/api/rollout') {
                const stepName = u.searchParams.get('step') || '';
                const file = u.searchParams.get('file') || '';
                if (!safeStepSegment(stepName) || !safeJsonBasename(file)) {
                    json(res, 400, { error: 'Invalid step or file' });
                    return;
                }
                const fp = path.join(rolloutRoot, stepName, file);
                if (!isPathInsideRoot(rolloutRoot, fp)) {
                    forbidden(res);
                    return;
                }
                try {
                    const raw = await readFile(fp, 'utf-8');
                    const data = JSON.parse(raw);
                    json(res, 200, data);
                }
                catch {
                    json(res, 404, { error: 'File not found' });
                }
                return;
            }
            notFound(res);
        }
        catch (e) {
            json(res, 500, { error: e instanceof Error ? e.message : 'Internal error' });
        }
    });
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            server.off('error', reject);
            const addr = server.address();
            const port = typeof addr === 'object' && addr && 'port' in addr ? addr.port : 0;
            const baseUrl = `http://127.0.0.1:${port}`;
            resolve({
                port,
                token,
                baseUrl,
                dispose: () => {
                    server.close();
                }
            });
        });
    });
}
//# sourceMappingURL=rolloutServer.js.map