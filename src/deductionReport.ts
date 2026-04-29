/**
 * 与 media/viewer.html 中 buildDeductionSummaryReport 逻辑一致，
 * 供服务端批量生成扣分报告 Markdown。
 */

function parseRewardResponseObject(rr: unknown): Record<string, unknown> | null {
    if (rr == null) {
        return null;
    }
    if (typeof rr === 'object' && !Array.isArray(rr)) {
        return rr as Record<string, unknown>;
    }
    if (typeof rr === 'string') {
        try {
            const o = JSON.parse(rr) as unknown;
            return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
        } catch {
            return null;
        }
    }
    return null;
}

function getRewardContainer(rollout: Record<string, unknown>): Record<string, unknown> | null {
    if (rollout.reward && typeof rollout.reward === 'object' && !Array.isArray(rollout.reward)) {
        return rollout.reward as Record<string, unknown>;
    }
    if (rollout.reward_info && typeof rollout.reward_info === 'object' && !Array.isArray(rollout.reward_info)) {
        return rollout as Record<string, unknown>;
    }
    return null;
}

function getRewardInfoObject(rollout: Record<string, unknown>): Record<string, unknown> | null {
    const reward = getRewardContainer(rollout);
    if (!reward) {
        return null;
    }
    const info = reward.reward_info;
    if (!info || typeof info !== 'object' || Array.isArray(info)) {
        return null;
    }
    return info as Record<string, unknown>;
}

function getRawOutputsFromRollout(rollout: Record<string, unknown>): Record<string, unknown> | null {
    const info = getRewardInfoObject(rollout);
    const rr = parseRewardResponseObject(info?.reward_response);
    const ro = rr?.raw_outputs;
    if (!ro || typeof ro !== 'object' || Array.isArray(ro)) {
        return null;
    }
    return ro as Record<string, unknown>;
}

const REDACTED_THINKING_CLOSE = '</redacted_thinking>';
const THINK_CLOSE = '</think>';

/** 仅解析该标记之后的正文，避免与思维链内的重复 `<deductions>` 混淆 */
function sliceAfterRedactedThinking(raw: string): string {
    const idx = raw.indexOf(REDACTED_THINKING_CLOSE);
    if (idx < 0) {
        return raw;
    }
    return raw.slice(idx + REDACTED_THINKING_CLOSE.length);
}

function sliceAfterThinking(raw: string): string {
    const idx = raw.indexOf(THINK_CLOSE);
    if (idx < 0) {
        return raw;
    }
    return raw.slice(idx + THINK_CLOSE.length);
}

function extractDeductionsInners(text: unknown): string[] {
    const s = sliceAfterRedactedThinking(sliceAfterThinking(text == null ? '' : String(text)));
    const re = /<deductions>([\s\S]*?)<\/deductions>/gi;
    const out: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) {
        out.push(m[1].trim());
    }
    if (out.length <= 1) {
        return out;
    }
    return [out[out.length - 1]];
}

function extractEvaluationInners(text: unknown): string[] {
    const s = sliceAfterRedactedThinking(sliceAfterThinking(text == null ? '' : String(text)));
    const re = /<evaluation>([\s\S]*?)<\/evaluation>/gi;
    const out: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) {
        out.push(m[1].trim());
    }
    if (out.length <= 1) {
        return out;
    }
    return [out[out.length - 1]];
}

function normalizeFieldKeyName(key: string): string {
    return key.toLowerCase().replace(/[\s_-]+/g, ' ').trim();
}

function parseEvaluationFields(inner: string): Record<string, string> {
    const fields: Record<string, string> = {};
    if (!inner) {
        return fields;
    }
    const blockRe = /<([a-zA-Z_][\w\-]*)>([\s\S]*?)<\/\1>/g;
    let m: RegExpExecArray | null;
    while ((m = blockRe.exec(inner)) !== null) {
        const rawTag = m[1];
        const valueRaw = m[2]
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (!valueRaw) {
            continue;
        }
        const k = normalizeFieldKeyName(rawTag);
        fields[k] = valueRaw;
    }
    return fields;
}

function parseDeductionBlockFields(inner: string): Record<string, string> {
    const fields: Record<string, string> = {};
    if (!inner) {
        return fields;
    }
    const lines = inner.split(/\r?\n/);
    let currentKey: string | null = null;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const m = line.match(/^\s*-\s*(.+?)\s*:\s*(.*)$/);
        if (m) {
            currentKey = normalizeFieldKeyName(m[1].trim());
            fields[currentKey] = m[2].trim();
        } else if (currentKey && line.trim() !== '') {
            fields[currentKey] =
                (fields[currentKey] ? fields[currentKey] + ' ' : '') + line.trim();
        }
    }
    return fields;
}

/**
 * 若无可解析的 `<deductions>` / `<evaluation>` 则返回 null。
 */
export function buildDeductionSummaryMarkdown(rollout: Record<string, unknown>): string | null {
    const ro = getRawOutputsFromRollout(rollout);
    if (!ro) {
        return null;
    }
    const trajDedInners = extractDeductionsInners(ro.trajectory);
    const ansDedInners = extractDeductionsInners(ro.answer);
    const trajEvalInners = extractEvaluationInners(ro.trajectory);
    const ansEvalInners = extractEvaluationInners(ro.answer);
    const trajBlocks =
        trajDedInners.length > 0
            ? trajDedInners.map(inner => ({ kind: 'deductions', inner, fields: parseDeductionBlockFields(inner) }))
            : trajEvalInners.map(inner => ({ kind: 'evaluation', inner, fields: parseEvaluationFields(inner) }));
    const ansBlocks =
        ansDedInners.length > 0
            ? ansDedInners.map(inner => ({ kind: 'deductions', inner, fields: parseDeductionBlockFields(inner) }))
            : ansEvalInners.map(inner => ({ kind: 'evaluation', inner, fields: parseEvaluationFields(inner) }));
    if (trajBlocks.length === 0 && ansBlocks.length === 0) {
        return null;
    }

    const infoTop = getRewardInfoObject(rollout) ?? undefined;
    const parsedRr = parseRewardResponseObject(infoTop?.reward_response);
    const scores =
        parsedRr?.scores && typeof parsedRr.scores === 'object' && !Array.isArray(parsedRr.scores)
            ? (parsedRr.scores as Record<string, unknown>)
            : null;

    const lines: string[] = [];

    lines.push('# Rollout 扣分报告');
    lines.push('');
    lines.push('## 概况');
    lines.push('');
    if (rollout.question != null && String(rollout.question).trim() !== '') {
        lines.push('- **用户问题**：' + String(rollout.question).trim());
    }
    if (rollout.request_id != null && String(rollout.request_id).trim() !== '') {
        lines.push('- **Request ID**：' + String(rollout.request_id).trim());
    }
    if (scores) {
        if (scores.trajectory != null) {
            lines.push('- **轨迹评分（trajectory）**：' + String(scores.trajectory));
        }
        if (scores.answer != null) {
            lines.push('- **回答评分（answer）**：' + String(scores.answer));
        }
    }
    const fr = infoTop?.final_reward;
    if (fr != null) {
        lines.push(
            '- **综合 reward**：' + (typeof fr === 'number' ? fr.toFixed(3) : String(fr))
        );
    }
    lines.push('');

    const fieldLabels: [string, string][] = [
        ['dimension', '扣分维度'],
        ['rule', '触犯规则'],
        ['evidence', '证据与说明'],
        ['points', '本条扣分'],
        ['total deductions', '累计扣分（本节）'],
        ['raw score', '折算说明'],
        ['final score', '本节最终得分']
    ];
    const knownEn = new Set(fieldLabels.map(x => x[0]));

    function emitStep(
        sectionZh: string,
        idx: number,
        fields: Record<string, string>,
        kind: 'deductions' | 'evaluation'
    ): void {
        lines.push('### ' + sectionZh + ' · 扣分项 ' + idx + (kind === 'evaluation' ? '（evaluation）' : ''));
        lines.push('');
        for (let j = 0; j < fieldLabels.length; j++) {
            const en = fieldLabels[j][0];
            const zh = fieldLabels[j][1];
            const v = fields[en];
            if (v != null && String(v).trim() !== '') {
                lines.push('- **' + zh + '**（' + en + '）：' + String(v).trim());
            }
        }
        const keys = Object.keys(fields);
        for (let k = 0; k < keys.length; k++) {
            const key = keys[k];
            if (!knownEn.has(normalizeFieldKeyName(key)) && fields[key] != null && String(fields[key]).trim() !== '') {
                lines.push('- **' + key + '**：' + String(fields[key]).trim());
            }
        }
        lines.push('');
    }

    lines.push('---');
    lines.push('');
    lines.push('## 一、轨迹（Trajectory）扣分明细');
    lines.push('');
    if (trajBlocks.length === 0) {
        lines.push('*（本段无 `<deductions>` / `<evaluation>` 记录）*');
        lines.push('');
    } else {
        for (let t = 0; t < trajBlocks.length; t++) {
            emitStep('轨迹', t + 1, trajBlocks[t].fields, trajBlocks[t].kind as 'deductions' | 'evaluation');
        }
    }

    lines.push('---');
    lines.push('');
    lines.push('## 二、最终回答（Answer）扣分明细');
    lines.push('');
    if (ansBlocks.length === 0) {
        lines.push('*（本段无 `<deductions>` / `<evaluation>` 记录）*');
        lines.push('');
    } else {
        for (let a = 0; a < ansBlocks.length; a++) {
            emitStep('回答', a + 1, ansBlocks[a].fields, ansBlocks[a].kind as 'deductions' | 'evaluation');
        }
    }

    function shortRule(r: string | undefined): string {
        if (r == null || r === '') {
            return '';
        }
        let t = String(r).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
        if (t.length > 100) {
            t = t.substring(0, 97) + '...';
        }
        return t;
    }

    lines.push('---');
    lines.push('');
    lines.push('## 三、扣分维度与规则汇总表');
    lines.push('');
    lines.push('| 环节 | 序号 | 扣分维度 | 触犯规则（摘要） | 本条扣分 |');
    lines.push('|------|------|----------|------------------|----------|');
    for (let t = 0; t < trajBlocks.length; t++) {
        const f = trajBlocks[t].fields;
        lines.push(
            '| 轨迹 | ' +
                (t + 1) +
                ' | ' +
                (f['dimension'] || '').replace(/\|/g, '\\|') +
                ' | ' +
                shortRule(f['rule']) +
                ' | ' +
                (f['points'] || '').replace(/\|/g, '\\|') +
                ' |'
        );
    }
    for (let a = 0; a < ansBlocks.length; a++) {
        const f = ansBlocks[a].fields;
        lines.push(
            '| 回答 | ' +
                (a + 1) +
                ' | ' +
                (f['dimension'] || '').replace(/\|/g, '\\|') +
                ' | ' +
                shortRule(f['rule']) +
                ' | ' +
                (f['points'] || '').replace(/\|/g, '\\|') +
                ' |'
        );
    }
    lines.push('');
    lines.push(
        '*本报告由 Viewer 根据 `reward_response.raw_outputs` 中的 `<deductions>` / `<evaluation>` 自动解析生成。*'
    );
    lines.push('');

    return lines.join('\n');
}

/**
 * 与 viewer 中单条「导出 deductions」一致：导出 trajectory/answer 下的 `<deductions>`，
 * 若不存在则回退导出 `<evaluation>`。
 */
export function buildDeductionsRawExport(rollout: Record<string, unknown>): string | null {
    const ro = getRawOutputsFromRollout(rollout);
    if (!ro) {
        return null;
    }
    const trajDedBlocks = extractDeductionsInners(ro.trajectory).map(
        inner => '<deductions>' + inner + '</deductions>'
    );
    const ansDedBlocks = extractDeductionsInners(ro.answer).map(
        inner => '<deductions>' + inner + '</deductions>'
    );
    const trajEvalBlocks = extractEvaluationInners(ro.trajectory).map(
        inner => '<evaluation>' + inner + '</evaluation>'
    );
    const ansEvalBlocks = extractEvaluationInners(ro.answer).map(
        inner => '<evaluation>' + inner + '</evaluation>'
    );
    const trajBlocks = trajDedBlocks.length > 0 ? trajDedBlocks : trajEvalBlocks;
    const ansBlocks = ansDedBlocks.length > 0 ? ansDedBlocks : ansEvalBlocks;
    if (trajBlocks.length === 0 && ansBlocks.length === 0) {
        return null;
    }
    const lines: string[] = [];
    lines.push(
        'raw_outputs.trajectory — ' + (trajDedBlocks.length > 0 ? '<deductions>' : '<evaluation>')
    );
    lines.push('');
    for (let i = 0; i < trajBlocks.length; i++) {
        if (trajBlocks.length > 1) {
            lines.push('<!-- block ' + (i + 1) + ' -->');
        }
        lines.push(trajBlocks[i]);
        lines.push('');
    }
    lines.push('---');
    lines.push('');
    lines.push('raw_outputs.answer — ' + (ansDedBlocks.length > 0 ? '<deductions>' : '<evaluation>'));
    lines.push('');
    for (let j = 0; j < ansBlocks.length; j++) {
        if (ansBlocks.length > 1) {
            lines.push('<!-- block ' + (j + 1) + ' -->');
        }
        lines.push(ansBlocks[j]);
        lines.push('');
    }
    return lines.join('\n').trim() + '\n';
}

/**
 * 从 rollout 中提取结构化元数据（question / request_id / scores / final_reward），
 * 供批量导出时在每个源文件条目前附加，方便跨 step 对比分析。
 */
export function extractRolloutMeta(rollout: Record<string, unknown>): {
    question: string;
    request_id: string;
    score: number | null;
    trajectory_score: number | null;
    answer_score: number | null;
    final_reward: number | null;
} {
    const messages = (rollout.messages as Array<{ role?: string; content?: unknown }>) || [];
    let question = '';
    for (let j = messages.length - 1; j >= 0; j--) {
        if (messages[j].role === 'user') {
            const c = messages[j].content;
            let raw = '';
            if (typeof c === 'string') {
                raw = c;
            } else if (Array.isArray(c)) {
                const parts: string[] = [];
                for (const p of c as Array<{ type?: string; text?: unknown }>) {
                    if (p && typeof p === 'object' && p.type === 'text' && typeof p.text === 'string') {
                        parts.push(p.text);
                    }
                }
                raw = parts.join('\n');
            }
            if (raw.trim()) {
                const nlu = raw.match(/^(.*?)<NLU\(仅供参考\)>/s);
                const time = raw.match(/^(.*?)<当前系统时间>/s) || raw.match(/^(.*?)<当前时间>/s);
                if (nlu) {
                    question = nlu[1].trim();
                } else if (time) {
                    question = time[1].trim();
                } else {
                    question = raw.split('\n')[0].trim().substring(0, 200);
                }
            }
            break;
        }
    }

    const request_id = rollout.request_id != null ? String(rollout.request_id) : '';

    const reward = getRewardContainer(rollout) ?? undefined;
    let score: number | null = null;
    if (typeof rollout.reward_score === 'number') {
        score = rollout.reward_score;
    } else if (reward && typeof reward.score === 'number') {
        score = reward.score;
    }

    const info = getRewardInfoObject(rollout) ?? undefined;
    const final_reward = info?.final_reward != null && typeof info.final_reward === 'number'
        ? info.final_reward : null;

    const rr = parseRewardResponseObject(info?.reward_response);
    let trajectory_score: number | null = null;
    let answer_score: number | null = null;
    if (rr?.scores && typeof rr.scores === 'object' && !Array.isArray(rr.scores)) {
        const sc = rr.scores as Record<string, unknown>;
        if (typeof sc.trajectory === 'number') { trajectory_score = sc.trajectory; }
        if (typeof sc.answer === 'number') { answer_score = sc.answer; }
    }

    return { question, request_id, score, trajectory_score, answer_score, final_reward };
}
