import * as crypto from 'crypto';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { URL } from 'url';
import { promisify } from 'util';

const readdir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const stat = promisify(fs.stat);

/** 各 step 目录下的摘要缓存文件名（排除在 json 列表外） */
const SUMMARY_CACHE_FILE = '.agent_rl_viewer_summary.json';

/** 摘要接口并行读取上限（偏 IO 密集，可略高于 CPU 核数） */
const SUMMARY_READ_CONCURRENCY = 96;

/** 校验缓存时并行 stat 源 json 的并发 */
const SUMMARY_STAT_CONCURRENCY = 128;

interface SummaryCachePayload {
    version: 1;
    files: string[];
    summaries: Record<string, unknown>[];
}

export interface RolloutServerHandle {
    port: number;
    token: string;
    baseUrl: string;
    dispose: () => void;
}

function isPathInsideRoot(root: string, target: string): boolean {
    const rootR = path.resolve(root);
    const targetR = path.resolve(target);
    const rel = path.relative(rootR, targetR);
    return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..');
}

function safeStepSegment(name: string): boolean {
    if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) {
        return false;
    }
    return name.startsWith('step_');
}

function safeJsonBasename(name: string): boolean {
    if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) {
        return false;
    }
    if (name === SUMMARY_CACHE_FILE) {
        return false;
    }
    return name.endsWith('.json');
}

function rolloutScore(r: Record<string, unknown>): number {
    if (r == null) {
        return 0;
    }
    if (typeof r.score === 'number') {
        return r.score;
    }
    const reward = r.reward as { score?: number } | undefined;
    return reward?.score ?? 0;
}

/** 与 viewer：多模态 user 的 content 为数组时，仅拼接 type===text 的片段再抽问句 */
function contentToPlainTextForQuestion(content: unknown): string {
    if (typeof content === 'string') {
        return content;
    }
    if (!Array.isArray(content)) {
        return '';
    }
    const parts: string[] = [];
    for (const p of content as Array<{ type?: string; text?: unknown }>) {
        if (p && typeof p === 'object' && p.type === 'text' && typeof p.text === 'string') {
            parts.push(p.text);
        }
    }
    return parts.join('\n');
}

function extractQuestion(content: string): string {
    const nluMatch = content.match(/^(.*?)<NLU\(仅供参考\)>/s);
    if (nluMatch) {
        return nluMatch[1].trim();
    }
    const timeMatch =
        content.match(/^(.*?)<当前系统时间>/s) || content.match(/^(.*?)<当前时间>/s);
    if (timeMatch) {
        return timeMatch[1].trim();
    }
    const firstLine = content.split('\n')[0].trim();
    return firstLine.substring(0, 200);
}

function summarizeRollout(data: Record<string, unknown>, file: string): Record<string, unknown> {
    const messages = (data.messages as Array<{ role?: string; content?: unknown }>) || [];
    let extractedQuestion = '';
    for (let j = messages.length - 1; j >= 0; j--) {
        if (messages[j].role === 'user') {
            const c = messages[j].content;
            let raw = contentToPlainTextForQuestion(c);
            if (!raw.trim()) {
                raw = typeof c === 'string' ? c : JSON.stringify(c);
            }
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

function summarizeRolloutFailed(file: string): Record<string, unknown> {
    return {
        file,
        score: 0,
        question: '（JSON 解析失败或文件损坏）',
        request_id: undefined,
        timestamp: undefined,
        run_time: undefined
    };
}

async function maxSourceMtimeMs(stepDir: string, sortedFiles: string[]): Promise<number> {
    let max = 0;
    for (let i = 0; i < sortedFiles.length; i += SUMMARY_STAT_CONCURRENCY) {
        const chunk = sortedFiles.slice(i, i + SUMMARY_STAT_CONCURRENCY);
        const times = await Promise.all(
            chunk.map(async f => {
                const st = await stat(path.join(stepDir, f));
                return st.mtimeMs;
            })
        );
        for (const t of times) {
            if (t > max) {
                max = t;
            }
        }
    }
    return max;
}

async function tryReadSummaryCache(
    stepDir: string,
    sortedFiles: string[]
): Promise<Record<string, unknown>[] | null> {
    const cachePath = path.join(stepDir, SUMMARY_CACHE_FILE);
    let cstat: fs.Stats;
    try {
        cstat = await stat(cachePath);
    } catch {
        return null;
    }
    let raw: string;
    try {
        raw = await readFile(cachePath, 'utf-8');
    } catch {
        return null;
    }
    let payload: SummaryCachePayload;
    try {
        payload = JSON.parse(raw) as SummaryCachePayload;
    } catch {
        return null;
    }
    if (
        payload.version !== 1 ||
        !Array.isArray(payload.files) ||
        !Array.isArray(payload.summaries) ||
        payload.files.length !== sortedFiles.length ||
        payload.summaries.length !== sortedFiles.length
    ) {
        return null;
    }
    for (let i = 0; i < sortedFiles.length; i++) {
        if (payload.files[i] !== sortedFiles[i]) {
            return null;
        }
    }
    const maxMtime = await maxSourceMtimeMs(stepDir, sortedFiles);
    if (maxMtime > cstat.mtimeMs + 500) {
        return null;
    }
    return payload.summaries;
}

async function writeSummaryCache(
    stepDir: string,
    sortedFiles: string[],
    summaries: Record<string, unknown>[]
): Promise<void> {
    const cachePath = path.join(stepDir, SUMMARY_CACHE_FILE);
    const body: SummaryCachePayload = {
        version: 1,
        files: sortedFiles,
        summaries
    };
    await writeFile(cachePath, JSON.stringify(body), 'utf-8');
}

/**
 * 只枚举 rollout 根目录下的 step_* 文件夹，不对每个目录做 readdir 统计 json 数量。
 * 若在每个 step 内对海量 .json 做全量 readdir，/api/steps 极易超过一分钟，触发前端超时。
 */
async function scanStepFolders(rolloutFolder: string): Promise<
    { name: string; path: string; fileCount: number | null }[]
> {
    const steps: { name: string; path: string; fileCount: number | null }[] = [];
    let entries: fs.Dirent[];
    try {
        entries = await fs.promises.readdir(rolloutFolder, { withFileTypes: true });
    } catch {
        return steps;
    }
    for (const ent of entries) {
        if (!ent.name.startsWith('step_') || !ent.isDirectory()) {
            continue;
        }
        const fullPath = path.join(rolloutFolder, ent.name);
        steps.push({ name: ent.name, path: fullPath, fileCount: null });
    }
    steps.sort((a, b) => {
        const numA = parseInt(a.name.replace('step_', ''), 10);
        const numB = parseInt(b.name.replace('step_', ''), 10);
        return (isNaN(numA) ? 0 : numA) - (isNaN(numB) ? 0 : numB);
    });
    return steps;
}

function json(res: http.ServerResponse, code: number, body: unknown): void {
    const s = JSON.stringify(body);
    res.writeHead(code, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(s)
    });
    res.end(s);
}

function forbidden(res: http.ServerResponse): void {
    json(res, 403, { error: 'Forbidden' });
}

function notFound(res: http.ServerResponse): void {
    json(res, 404, { error: 'Not Found' });
}

/**
 * 在 127.0.0.1 上启动本地服务：提供 viewer 页面与 /api/steps、/api/summary、/api/rollout。
 */
export function startRolloutServer(rolloutRoot: string, extensionMediaDir: string): Promise<RolloutServerHandle> {
    const token = crypto.randomBytes(24).toString('hex');
    const viewerPath = path.join(extensionMediaDir, 'viewer.html');

    const server = http.createServer(async (req, res) => {
        try {
            const u = new URL(req.url || '/', 'http://127.0.0.1');
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
                const skipCache = u.searchParams.get('nocache') === '1' || u.searchParams.get('nocache') === 'true';
                if (!safeStepSegment(stepName)) {
                    json(res, 400, { error: 'Invalid step' });
                    return;
                }
                const stepDir = path.join(rolloutRoot, stepName);
                if (!isPathInsideRoot(rolloutRoot, stepDir)) {
                    forbidden(res);
                    return;
                }
                let names: string[];
                try {
                    names = (await readdir(stepDir)).filter(f => safeJsonBasename(f)).sort();
                } catch {
                    json(res, 404, { error: 'Step not found' });
                    return;
                }
                const fileJobs = names
                    .map(file => ({ file, fp: path.join(stepDir, file) }))
                    .filter(({ fp }) => isPathInsideRoot(rolloutRoot, fp));

                if (!skipCache && fileJobs.length > 0) {
                    const cached = await tryReadSummaryCache(
                        stepDir,
                        fileJobs.map(j => j.file)
                    );
                    if (cached) {
                        json(res, 200, { summaries: cached, fromCache: true });
                        return;
                    }
                }

                const summaries: Record<string, unknown>[] = [];
                for (let i = 0; i < fileJobs.length; i += SUMMARY_READ_CONCURRENCY) {
                    const chunk = fileJobs.slice(i, i + SUMMARY_READ_CONCURRENCY);
                    const batch = await Promise.all(
                        chunk.map(async ({ file, fp }) => {
                            try {
                                const raw = await readFile(fp, 'utf-8');
                                const data = JSON.parse(raw) as Record<string, unknown>;
                                return summarizeRollout(data, file);
                            } catch {
                                return summarizeRolloutFailed(file);
                            }
                        })
                    );
                    for (const s of batch) {
                        summaries.push(s);
                    }
                }

                if (fileJobs.length > 0) {
                    try {
                        await writeSummaryCache(
                            stepDir,
                            fileJobs.map(j => j.file),
                            summaries
                        );
                    } catch {
                        /* 缓存写入失败不影响返回摘要 */
                    }
                }

                json(res, 200, { summaries, fromCache: false });
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
                } catch {
                    json(res, 404, { error: 'File not found' });
                }
                return;
            }

            notFound(res);
        } catch (e) {
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
