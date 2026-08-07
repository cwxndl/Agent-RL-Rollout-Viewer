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
const deductionReport_1 = require("./deductionReport");
const readdir = (0, util_1.promisify)(fs.readdir);
const readFile = (0, util_1.promisify)(fs.readFile);
const writeFile = (0, util_1.promisify)(fs.writeFile);
const stat = (0, util_1.promisify)(fs.stat);
/** 各 step 目录下的摘要缓存文件名（排除在 json 列表外） */
const SUMMARY_CACHE_FILE = '.agent_rl_viewer_summary.json';
const SUMMARY_CACHE_VERSION = 9;
const STEP_INDEX_FILE = 'index.jsonl';
const USER_QUESTION_END_MARKER = '---用户提问结束---';
/** 摘要接口并行读取上限（偏 IO 密集，可略高于 CPU 核数） */
const SUMMARY_READ_CONCURRENCY = 96;
/** 批量扣分报告接口并行读取上限 */
const STEP_DEDUCTION_READ_CONCURRENCY = 48;
/** 校验缓存时并行 stat 源 json 的并发 */
const SUMMARY_STAT_CONCURRENCY = 128;
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
    if (name === SUMMARY_CACHE_FILE) {
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
    if (typeof r.group_reward === 'number') {
        return r.group_reward;
    }
    if (typeof r.final_reward === 'number') {
        return r.final_reward;
    }
    /** 部分索引/导出使用首字母大写 Reward */
    if (typeof r.Reward === 'number') {
        return r.Reward;
    }
    if (typeof r.reward_score === 'number') {
        return r.reward_score;
    }
    const reward = r.reward;
    if (typeof reward?.score === 'number') {
        return reward.score;
    }
    const topInfo = r.reward_info;
    if (typeof topInfo?.final_reward === 'number') {
        return topInfo.final_reward;
    }
    const nestedInfo = r.reward?.reward_info;
    if (typeof nestedInfo?.final_reward === 'number') {
        return nestedInfo.final_reward;
    }
    return 0;
}
function arrayNumberAt(value, index) {
    if (!Array.isArray(value)) {
        return undefined;
    }
    const n = value[index];
    return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}
function objectAt(value, index) {
    if (Array.isArray(value)) {
        const item = value[index];
        return item && typeof item === 'object' && !Array.isArray(item)
            ? item
            : undefined;
    }
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : undefined;
}
function getSampleReward(sample, group, index, sampleField, groupField) {
    const direct = sample[sampleField];
    if (typeof direct === 'number' && Number.isFinite(direct)) {
        return direct;
    }
    return arrayNumberAt(group[groupField], index);
}
function rolloutInfoForSample(group, sample, rewardInfo, sampleIndex) {
    return (objectAt(sample.rollout_info, sampleIndex) ||
        objectAt(sample.rollout_infos, sampleIndex) ||
        objectAt(rewardInfo.rollout_info, sampleIndex) ||
        objectAt(rewardInfo.current_rollout_info, sampleIndex) ||
        objectAt(rewardInfo.rollout_infos, sampleIndex) ||
        objectAt(group.rollout_info, sampleIndex) ||
        objectAt(group.rollout_infos, sampleIndex));
}
function rolloutRunTimeSeconds(r) {
    const rt = r.run_time;
    if (rt && typeof rt === 'object' && !Array.isArray(rt)) {
        const total = rt.total_time;
        if (typeof total === 'number' && Number.isFinite(total)) {
            return total;
        }
    }
    if (typeof rt === 'number' && Number.isFinite(rt)) {
        return rt;
    }
    if (typeof r.total_time === 'number' && Number.isFinite(r.total_time)) {
        return r.total_time;
    }
    if (typeof r.runtime === 'number' && Number.isFinite(r.runtime)) {
        return r.runtime;
    }
    const infoTop = r.reward_info;
    if (typeof infoTop?.reward_time === 'number' && Number.isFinite(infoTop.reward_time)) {
        return infoTop.reward_time;
    }
    const reward = r.reward;
    if (reward?.reward_info &&
        typeof reward.reward_info.reward_time === 'number' &&
        Number.isFinite(reward.reward_info.reward_time)) {
        return reward.reward_info.reward_time;
    }
    return undefined;
}
function rolloutTokenCount(r) {
    if (typeof r.Tokens === 'number' && Number.isFinite(r.Tokens)) {
        return r.Tokens;
    }
    if (typeof r.tokens === 'number' && Number.isFinite(r.tokens)) {
        return r.tokens;
    }
    const token = r.token;
    const total = token?.token_info?.total_tokens;
    return typeof total === 'number' && Number.isFinite(total) ? total : undefined;
}
/** 与 viewer：多模态 user 的 content 为数组时，仅拼接 type===text 的片段再抽问句 */
function contentToPlainTextForQuestion(content) {
    if (typeof content === 'string') {
        return content;
    }
    if (!Array.isArray(content)) {
        return '';
    }
    const parts = [];
    for (const p of content) {
        if (p && typeof p === 'object' && p.type === 'text' && typeof p.text === 'string') {
            parts.push(p.text);
        }
    }
    return parts.join('\n');
}
function stripSystemReminder(text) {
    const idx = text.indexOf('# system-reminder');
    return idx >= 0 ? text.substring(0, idx) : text;
}
function stripAutoGeneratedUserMetadata(text) {
    const idx = text.indexOf(USER_QUESTION_END_MARKER);
    return idx >= 0 ? text.substring(0, idx) : text;
}
function extractQuestion(content) {
    const cleaned = stripSystemReminder(stripAutoGeneratedUserMetadata(content));
    const nluMatch = cleaned.match(/^(.*?)<NLU\(仅供参考\)>/s);
    if (nluMatch) {
        return nluMatch[1].trim();
    }
    const timeMatch = cleaned.match(/^(.*?)<当前系统时间>/s) || cleaned.match(/^(.*?)<当前时间>/s);
    if (timeMatch) {
        return timeMatch[1].trim();
    }
    const lines = cleaned.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
            return trimmed.substring(0, 200);
        }
    }
    return '';
}
function isImageContentPart(part) {
    if (!part || typeof part !== 'object') {
        return false;
    }
    const type = part.type;
    return type === 'image_url' || type === 'image';
}
function contentHasImage(content) {
    if (!Array.isArray(content)) {
        return false;
    }
    return content.some(isImageContentPart);
}
function rolloutHasGroundTruth(data) {
    const gt = data.ground_truth;
    if (gt == null) {
        return false;
    }
    if (typeof gt === 'string') {
        return gt.trim().length > 0;
    }
    if (Array.isArray(gt)) {
        return gt.length > 0;
    }
    if (typeof gt === 'object') {
        return Object.keys(gt).length > 0;
    }
    return String(gt).trim().length > 0;
}
function messageContentToComparableText(content) {
    if (typeof content === 'string') {
        return content.replace(/\r\n/g, '\n').trim();
    }
    if (!Array.isArray(content)) {
        return content == null ? '' : String(content).replace(/\r\n/g, '\n').trim();
    }
    const parts = [];
    for (const part of content) {
        if (part && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string') {
            parts.push(part.text);
        }
    }
    return parts.join('\n').replace(/\r\n/g, '\n').trim();
}
function conversationHistoryHash(messages) {
    if (!Array.isArray(messages)) {
        return 'no_history';
    }
    let lastUserIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg && msg.role === 'user') {
            lastUserIndex = i;
            break;
        }
    }
    if (lastUserIndex < 0) {
        return 'no_history';
    }
    const parts = [];
    for (let i = 0; i <= lastUserIndex; i++) {
        const msg = messages[i];
        if (!msg || typeof msg !== 'object' || msg.role === 'system') {
            continue;
        }
        const role = typeof msg.role === 'string' ? msg.role : 'unknown';
        const text = messageContentToComparableText(msg.content);
        if (role || text) {
            parts.push(role + '\n' + text);
        }
    }
    const history = parts.join('\n\n---\n\n').trim();
    if (!history) {
        return 'no_history';
    }
    return crypto.createHash('sha1').update(history).digest('hex').slice(0, 12);
}
function conversationKeyForQuestion(question, historyHash) {
    return (historyHash || 'no_history') + '::' + (question || '未找到user内容');
}
function rawHistoryLookupKey(uid, assistant) {
    return uid + '\u0000' + assistant;
}
function lastAssistantContent(messages) {
    if (!Array.isArray(messages)) {
        return '';
    }
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg && msg.role === 'assistant') {
            return messageContentToComparableText(msg.content);
        }
    }
    return '';
}
function rewardResponseTail(value) {
    if (typeof value !== 'string') {
        return undefined;
    }
    const tag = '</think>';
    const idx = value.lastIndexOf(tag);
    const tail = (idx >= 0 ? value.substring(idx + tag.length) : value).trim();
    return tail || undefined;
}
function isGroupedRolloutFile(data) {
    return Array.isArray(data.samples);
}
function assistantOnlyMessages(sample) {
    const messages = sample.messages;
    if (!Array.isArray(messages)) {
        return [];
    }
    return messages.filter(msg => msg && typeof msg === 'object' && msg.role === 'assistant');
}
function normalizeGroupedSampleRollout(group, sample, file, sampleIndex) {
    const groupReward = getSampleReward(sample, group, sampleIndex, 'group_reward', 'group_rewards');
    const finalReward = getSampleReward(sample, group, sampleIndex, 'final_reward', 'final_rewards');
    const singleReward = getSampleReward(sample, group, sampleIndex, 'single_reward', 'single_rewards');
    let rewardInfo = sample.group_reward_info && typeof sample.group_reward_info === 'object'
        ? { ...sample.group_reward_info }
        : {};
    if (sample.rollout_infos != null && rewardInfo.rollout_infos == null) {
        rewardInfo.rollout_infos = sample.rollout_infos;
    }
    if (group.rollout_infos != null && rewardInfo.rollout_infos == null) {
        rewardInfo.rollout_infos = group.rollout_infos;
    }
    const currentRolloutInfo = rolloutInfoForSample(group, sample, rewardInfo, sampleIndex);
    if (currentRolloutInfo) {
        rewardInfo = {
            ...rewardInfo,
            ...currentRolloutInfo,
            rollout_info: currentRolloutInfo,
            current_rollout_info: currentRolloutInfo
        };
    }
    if (finalReward != null && rewardInfo.final_reward == null) {
        rewardInfo.final_reward = finalReward;
    }
    if (groupReward != null && rewardInfo.group_reward == null) {
        rewardInfo.group_reward = groupReward;
    }
    if (singleReward != null && rewardInfo.single_reward == null) {
        rewardInfo.single_reward = singleReward;
    }
    const rrTail = rewardResponseTail(rewardInfo.reward_response);
    if (rrTail != null) {
        rewardInfo.group_reward_response_tail = rrTail;
    }
    return {
        ...sample,
        messages: assistantOnlyMessages(sample),
        question: group.question,
        ground_truth: group.ground_truth,
        data_source: group.data_source,
        ori_data_source: group.ori_data_source,
        timestamp: group.timestamp,
        step: group.step,
        validate: group.validate,
        uid: group.uid,
        request_id: sample.request_id ??
            (group.uid != null ? `${String(group.uid)}#sample-${sampleIndex + 1}` : undefined),
        finish_reason: sample.finish_reason,
        score: groupReward ?? finalReward ?? rolloutScore(sample),
        group_reward: groupReward,
        final_reward: finalReward,
        single_reward: singleReward,
        llm_reward: rewardInfo.llm_reward,
        rollout_info: currentRolloutInfo,
        current_rollout_info: currentRolloutInfo,
        reward_info: rewardInfo,
        group_reward_response_tail: rrTail,
        __source_file: file,
        __sample_index: sampleIndex,
        __sample_count: Array.isArray(group.samples) ? group.samples.length : undefined
    };
}
function summarizeRollout(data, file) {
    const messages = data.messages || [];
    let extractedQuestion = '';
    let hasImage = false;
    for (let j = messages.length - 1; j >= 0; j--) {
        if (messages[j].role === 'user') {
            const c = messages[j].content;
            hasImage = contentHasImage(c);
            let raw = contentToPlainTextForQuestion(c);
            if (!raw.trim()) {
                raw = typeof c === 'string' ? c : JSON.stringify(c);
            }
            extractedQuestion = extractQuestion(raw);
            break;
        }
    }
    if (!extractedQuestion && typeof data.question === 'string') {
        const rawQuestion = data.question.trim();
        extractedQuestion = extractQuestion(rawQuestion) || rawQuestion.substring(0, 200);
    }
    if (!extractedQuestion) {
        extractedQuestion = '未找到user内容';
    }
    const conversationHash = conversationHistoryHash(messages);
    return {
        file,
        score: rolloutScore(data),
        question: extractedQuestion,
        conversation_hash: conversationHash,
        conversation_key: conversationKeyForQuestion(extractedQuestion, conversationHash),
        hasImage,
        hasGroundTruth: rolloutHasGroundTruth(data),
        request_id: data.request_id,
        query_id: data.query_id,
        timestamp: data.timestamp,
        run_time: rolloutRunTimeSeconds(data),
        tokens: rolloutTokenCount(data),
        data_source: data.data_source,
        ori_data_source: data.ori_data_source,
        finish_reason: data.finish_reason
    };
}
function summarizeGroupedSample(group, sample, file, sampleIndex, sampleCount, rawHistoryLookup) {
    const normalized = normalizeGroupedSampleRollout(group, sample, file, sampleIndex);
    const rawQuestion = typeof group.question === 'string' ? group.question.trim() : '';
    let question = rawQuestion
        ? extractQuestion(rawQuestion) || rawQuestion.substring(0, 200)
        : '未找到user内容';
    const messagesForHistory = Array.isArray(sample.messages)
        ? sample.messages
        : (Array.isArray(group.messages) ? group.messages : []);
    let conversationHash = conversationHistoryHash(messagesForHistory);
    const uid = typeof group.uid === 'string' ? group.uid : '';
    const assistant = lastAssistantContent(sample.messages);
    let rawEntry = uid && assistant && rawHistoryLookup
        ? rawHistoryLookup.byUidAssistant.get(rawHistoryLookupKey(uid, assistant))
        : undefined;
    if (!rawEntry &&
        assistant &&
        rawHistoryLookup &&
        !rawHistoryLookup.ambiguousAssistants.has(assistant)) {
        rawEntry = rawHistoryLookup.byAssistant.get(assistant);
    }
    const rawSummary = rawEntry === null || rawEntry === void 0 ? void 0 : rawEntry.summary;
    if (rawEntry) {
        conversationHash = rawEntry.conversationHash;
        if (typeof (rawSummary === null || rawSummary === void 0 ? void 0 : rawSummary.question) === 'string' && rawSummary.question) {
            question = rawSummary.question;
        }
    }
    return {
        file,
        sample_index: sampleIndex,
        sample_count: sampleCount,
        score: rolloutScore(normalized),
        group_reward: normalized.group_reward,
        final_reward: normalized.final_reward,
        single_reward: normalized.single_reward,
        llm_reward: normalized.llm_reward,
        question,
        conversation_hash: conversationHash,
        conversation_key: conversationKeyForQuestion(question, conversationHash),
        hasImage: typeof (rawSummary === null || rawSummary === void 0 ? void 0 : rawSummary.hasImage) === 'boolean' ? rawSummary.hasImage : false,
        hasGroundTruth: rolloutHasGroundTruth(group),
        request_id: (rawSummary === null || rawSummary === void 0 ? void 0 : rawSummary.request_id) ?? normalized.request_id,
        query_id: (rawSummary === null || rawSummary === void 0 ? void 0 : rawSummary.query_id) ?? group.query_id,
        timestamp: (rawSummary === null || rawSummary === void 0 ? void 0 : rawSummary.timestamp) ?? group.timestamp,
        run_time: (rawSummary === null || rawSummary === void 0 ? void 0 : rawSummary.run_time) ?? rolloutRunTimeSeconds(normalized),
        tokens: (rawSummary === null || rawSummary === void 0 ? void 0 : rawSummary.tokens) ?? rolloutTokenCount(normalized),
        data_source: (rawSummary === null || rawSummary === void 0 ? void 0 : rawSummary.data_source) ?? group.data_source,
        ori_data_source: (rawSummary === null || rawSummary === void 0 ? void 0 : rawSummary.ori_data_source) ?? group.ori_data_source,
        finish_reason: (rawSummary === null || rawSummary === void 0 ? void 0 : rawSummary.finish_reason) ?? sample.finish_reason,
        uid: group.uid
    };
}

function pairedRawStepDir(groupStepDir) {
    const base = path.basename(groupStepDir);
    let rawBase = '';
    if (base.endsWith('_groups')) {
        rawBase = base.substring(0, base.length - '_groups'.length);
    }
    else if (base.endsWith('_group')) {
        rawBase = base.substring(0, base.length - '_group'.length);
    }
    if (!rawBase || !safeStepSegment(rawBase)) {
        return null;
    }
    return path.join(path.dirname(groupStepDir), rawBase);
}
async function buildRawHistoryHashLookup(groupStepDir) {
    const rawStepDir = pairedRawStepDir(groupStepDir);
    if (!rawStepDir) {
        return null;
    }
    let names;
    try {
        names = (await readdir(rawStepDir)).filter(f => safeJsonBasename(f)).sort();
    }
    catch {
        return null;
    }
    const lookup = { byUidAssistant: new Map(), byAssistant: new Map(), ambiguousAssistants: new Set() };
    for (const file of names) {
        try {
            const data = JSON.parse(await readFile(path.join(rawStepDir, file), 'utf-8'));
            const assistant = lastAssistantContent(data.messages);
            if (!assistant) {
                continue;
            }
            const hash = conversationHistoryHash(data.messages);
            const entry = { file, summary: summarizeRollout(data, file), conversationHash: hash };
            const uid = typeof data.uid === 'string' ? data.uid : '';
            if (uid) {
                lookup.byUidAssistant.set(rawHistoryLookupKey(uid, assistant), entry);
            }
            const existing = lookup.byAssistant.get(assistant);
            if (existing == null) {
                lookup.byAssistant.set(assistant, entry);
            }
            else if (existing.conversationHash !== hash) {
                lookup.ambiguousAssistants.add(assistant);
                lookup.byAssistant.delete(assistant);
            }
        }
        catch {
            /* 单个 raw rollout 损坏不影响其它匹配 */
        }
    }
    return lookup;
}

async function findMatchingRawRollout(groupStepDir, group, sample) {
    const uid = typeof group.uid === 'string' ? group.uid : '';
    const targetAssistant = lastAssistantContent(sample.messages);
    const rawStepDir = pairedRawStepDir(groupStepDir);
    if (!targetAssistant || !rawStepDir) {
        return null;
    }
    let names;
    try {
        names = (await readdir(rawStepDir)).filter(f => safeJsonBasename(f)).sort();
    }
    catch {
        return null;
    }
    let firstUidMatch = null;
    let assistantMatch = null;
    let assistantAmbiguous = false;
    for (const file of names) {
        const fp = path.join(rawStepDir, file);
        try {
            const raw = await readFile(fp, 'utf-8');
            const data = JSON.parse(raw);
            const rawAssistant = lastAssistantContent(data.messages);
            if (uid && data.uid === uid) {
                if (!firstUidMatch) {
                    firstUidMatch = { file, data };
                }
                if (rawAssistant === targetAssistant) {
                    return { file, data };
                }
            }
            if (rawAssistant === targetAssistant) {
                if (!assistantMatch) {
                    assistantMatch = { file, data };
                }
                else {
                    assistantAmbiguous = true;
                }
            }
        }
        catch {
            /* 单个 rollout 损坏不影响其它匹配 */
        }
    }
    if (assistantMatch && !assistantAmbiguous) {
        return assistantMatch;
    }
    return firstUidMatch;
}
async function buildGroupedSampleDetail(groupStepDir, group, sample, file, sampleIndex) {
    const normalized = normalizeGroupedSampleRollout(group, sample, file, sampleIndex);
    const matched = await findMatchingRawRollout(groupStepDir, group, sample);
    if (!matched) {
        return { ...normalized, __match_failed: true };
    }
    const rawRewardInfo = matched.data.reward_info && typeof matched.data.reward_info === 'object'
        ? matched.data.reward_info
        : {};
    const groupRewardInfo = normalized.reward_info && typeof normalized.reward_info === 'object'
        ? normalized.reward_info
        : {};
    return {
        ...matched.data,
        ...normalized,
        messages: matched.data.messages,
        reward_info: { ...rawRewardInfo, ...groupRewardInfo },
        request_id: matched.data.request_id ?? normalized.request_id,
        run_time: rolloutRunTimeSeconds(matched.data) ?? rolloutRunTimeSeconds(normalized),
        tokens: rolloutTokenCount(matched.data) ?? rolloutTokenCount(normalized),
        __matched_rollout_file: matched.file,
        __matched_rollout_step: path.basename(pairedRawStepDir(groupStepDir) || ''),
        __match_failed: false
    };
}
function summarizeRolloutEntries(data, file, rawHistoryLookup) {
    if (!isGroupedRolloutFile(data)) {
        return [summarizeRollout(data, file)];
    }
    const samples = data.samples;
    const out = [];
    for (let i = 0; i < samples.length; i++) {
        const sample = samples[i];
        if (!sample || typeof sample !== 'object' || Array.isArray(sample)) {
            continue;
        }
        out.push(summarizeGroupedSample(data, sample, file, i, samples.length, rawHistoryLookup));
    }
    return out.length ? out : [summarizeRollout(data, file)];
}
function summarizeIndexEntry(data) {
    const rawFile = data['轨迹文件名'] ??
        data.file ??
        data.filename ??
        data.rollout_file ??
        data.path;
    if (typeof rawFile !== 'string') {
        return null;
    }
    const file = path.basename(rawFile);
    if (!safeJsonBasename(file)) {
        return null;
    }
    const rawQuestion = typeof data.question === 'string' ? data.question.trim() : '';
    const extractedQuestion = rawQuestion ? extractQuestion(rawQuestion) : '';
    const question = extractedQuestion || (rawQuestion ? rawQuestion.substring(0, 200) : '未找到user内容');
    const conversationHash =
        typeof data.conversation_hash === 'string' && data.conversation_hash
            ? data.conversation_hash
            : (typeof data.history_hash === 'string' && data.history_hash ? data.history_hash : 'no_history');
    const hasImage = data.hasImage === true ||
        data.has_image === true ||
        (typeof data.image_count === 'number' && data.image_count > 0) ||
        (typeof data.imageCount === 'number' && data.imageCount > 0) ||
        contentHasImage(data.messages);
    return {
        file,
        score: rolloutScore(data),
        question,
        conversation_hash: conversationHash,
        conversation_key: conversationKeyForQuestion(question, conversationHash),
        hasImage,
        request_id: data.request_id,
        query_id: data.query_id,
        timestamp: data.timestamp,
        run_time: rolloutRunTimeSeconds(data),
        tokens: rolloutTokenCount(data),
        data_source: data.data_source,
        ori_data_source: data.ori_data_source,
        finish_reason: data.finish_reason,
        phase: data['阶段'] ?? data.phase,
        step: data.step
    };
}
async function tryReadStepIndexSummaries(stepDir) {
    let raw;
    try {
        raw = await readFile(path.join(stepDir, STEP_INDEX_FILE), 'utf-8');
    }
    catch {
        return null;
    }
    const summaries = [];
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
        const s = line.trim();
        if (!s) {
            continue;
        }
        try {
            const item = JSON.parse(s);
            const summary = summarizeIndexEntry(item);
            if (summary) {
                summaries.push(summary);
            }
        }
        catch {
            /* 单行索引损坏不影响其它轨迹展示 */
        }
    }
    return summaries.length > 0 ? summaries : null;
}
function summarizeRolloutFailed(file) {
    return {
        file,
        score: 0,
        question: '（JSON 解析失败或文件损坏）',
        request_id: undefined,
        timestamp: undefined,
        run_time: undefined
    };
}
async function maxSourceMtimeMs(stepDir, sortedFiles) {
    let max = 0;
    for (let i = 0; i < sortedFiles.length; i += SUMMARY_STAT_CONCURRENCY) {
        const chunk = sortedFiles.slice(i, i + SUMMARY_STAT_CONCURRENCY);
        const times = await Promise.all(chunk.map(async (f) => {
            const st = await stat(path.join(stepDir, f));
            return st.mtimeMs;
        }));
        for (const t of times) {
            if (t > max) {
                max = t;
            }
        }
    }
    return max;
}
async function tryReadSummaryCache(stepDir, sortedFiles) {
    const cachePath = path.join(stepDir, SUMMARY_CACHE_FILE);
    let cstat;
    try {
        cstat = await stat(cachePath);
    }
    catch {
        return null;
    }
    let raw;
    try {
        raw = await readFile(cachePath, 'utf-8');
    }
    catch {
        return null;
    }
    let payload;
    try {
        payload = JSON.parse(raw);
    }
    catch {
        return null;
    }
    if (payload.version !== SUMMARY_CACHE_VERSION ||
        !Array.isArray(payload.files) ||
        !Array.isArray(payload.summaries) ||
        payload.files.length !== sortedFiles.length ||
        payload.summaries.length !== sortedFiles.length) {
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
async function writeSummaryCache(stepDir, sortedFiles, summaries) {
    const cachePath = path.join(stepDir, SUMMARY_CACHE_FILE);
    const body = {
        version: SUMMARY_CACHE_VERSION,
        files: sortedFiles,
        summaries
    };
    await writeFile(cachePath, JSON.stringify(body), 'utf-8');
}
/**
 * 只枚举 rollout 根目录下的 step_* 文件夹，不对每个目录做 readdir 统计 json 数量。
 * 若在每个 step 内对海量 .json 做全量 readdir，/api/steps 极易超过一分钟，触发前端超时。
 */
function resolveStepDir(rolloutRoot, stepName) {
    const root = path.resolve(rolloutRoot);
    if (path.basename(root) === stepName && safeStepSegment(stepName)) {
        return root;
    }
    return path.join(root, stepName);
}
async function scanStepFolders(rolloutFolder) {
    const steps = [];
    const rootBase = path.basename(path.resolve(rolloutFolder));
    if (safeStepSegment(rootBase)) {
        let fileCount = null;
        try {
            const entries = await fs.promises.readdir(rolloutFolder, { withFileTypes: true });
            fileCount = entries.filter(ent => ent.isFile() && safeJsonBasename(ent.name)).length;
        }
        catch {
            fileCount = null;
        }
        return [{ name: rootBase, path: rolloutFolder, fileCount }];
    }
    let entries;
    try {
        entries = await fs.promises.readdir(rolloutFolder, { withFileTypes: true });
    }
    catch {
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
function mediaContentType(filePath) {
    switch (path.extname(filePath).toLowerCase()) {
        case '.css':
            return 'text/css; charset=utf-8';
        case '.js':
            return 'application/javascript; charset=utf-8';
        case '.svg':
            return 'image/svg+xml';
        case '.png':
            return 'image/png';
        case '.jpg':
        case '.jpeg':
            return 'image/jpeg';
        case '.woff2':
            return 'font/woff2';
        case '.woff':
            return 'font/woff';
        case '.ttf':
            return 'font/ttf';
        default:
            return 'application/octet-stream';
    }
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
                let html = fs.readFileSync(viewerPath, 'utf-8');
                const inject = `<script>window.__AGENT_RL_API_TOKEN__=${JSON.stringify(token)};</script>`;
                html = html.replace('</head>', `${inject}</head>`);
                const buf = Buffer.from(html, 'utf-8');
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': buf.length, 'Cache-Control': 'no-store' });
                res.end(buf);
                return;
            }
            if (!pathname.startsWith('/api/')) {
                const mediaRelativePath = pathname.replace(/^\/+/, '');
                if (mediaRelativePath) {
                    const mediaFilePath = path.join(extensionMediaDir, mediaRelativePath);
                    if (isPathInsideRoot(extensionMediaDir, mediaFilePath) && fs.existsSync(mediaFilePath) && fs.statSync(mediaFilePath).isFile()) {
                        const buf = await readFile(mediaFilePath);
                        res.writeHead(200, {
                            'Content-Type': mediaContentType(mediaFilePath),
                            'Content-Length': buf.length,
                            'Cache-Control': 'public, max-age=3600'
                        });
                        res.end(buf);
                        return;
                    }
                }
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
                const stepDir = resolveStepDir(rolloutRoot, stepName);
                if (!isPathInsideRoot(rolloutRoot, stepDir)) {
                    forbidden(res);
                    return;
                }
                const indexedSummaries = await tryReadStepIndexSummaries(stepDir);
                if (indexedSummaries) {
                    json(res, 200, {
                        summaries: indexedSummaries,
                        fromCache: false,
                        fromIndex: true
                    });
                    return;
                }
                let names;
                try {
                    names = (await readdir(stepDir)).filter(f => safeJsonBasename(f)).sort();
                }
                catch {
                    json(res, 404, { error: 'Step not found' });
                    return;
                }
                const fileJobs = names
                    .map(file => ({ file, fp: path.join(stepDir, file) }))
                    .filter(({ fp }) => isPathInsideRoot(rolloutRoot, fp));
                if (!skipCache && fileJobs.length > 0) {
                    const cached = await tryReadSummaryCache(stepDir, fileJobs.map(j => j.file));
                    if (cached) {
                        json(res, 200, { summaries: cached, fromCache: true });
                        return;
                    }
                }
                const rawHistoryLookup = await buildRawHistoryHashLookup(stepDir);
                const summaries = [];
                for (let i = 0; i < fileJobs.length; i += SUMMARY_READ_CONCURRENCY) {
                    const chunk = fileJobs.slice(i, i + SUMMARY_READ_CONCURRENCY);
                    const batch = await Promise.all(chunk.map(async ({ file, fp }) => {
                        try {
                            const raw = await readFile(fp, 'utf-8');
                            const data = JSON.parse(raw);
                            return summarizeRolloutEntries(data, file, rawHistoryLookup);
                        }
                        catch {
                            return summarizeRolloutFailed(file);
                        }
                    }));
                    for (const s of batch) {
                        if (Array.isArray(s)) {
                            summaries.push(...s);
                        }
                        else {
                            summaries.push(s);
                        }
                    }
                }
                if (fileJobs.length > 0) {
                    try {
                        await writeSummaryCache(stepDir, fileJobs.map(j => j.file), summaries);
                    }
                    catch {
                        /* 缓存写入失败不影响返回摘要 */
                    }
                }
                json(res, 200, { summaries, fromCache: false });
                return;
            }
            if (pathname === '/api/rollout') {
                const stepName = u.searchParams.get('step') || '';
                const file = u.searchParams.get('file') || '';
                const sampleParam = u.searchParams.get('sample');
                const sampleIndex = sampleParam == null ? null : parseInt(sampleParam, 10);
                if (!safeStepSegment(stepName) ||
                    !safeJsonBasename(file) ||
                    (sampleParam != null && (!Number.isInteger(sampleIndex) || (sampleIndex ?? -1) < 0))) {
                    json(res, 400, { error: 'Invalid step or file' });
                    return;
                }
                const fp = path.join(resolveStepDir(rolloutRoot, stepName), file);
                if (!isPathInsideRoot(rolloutRoot, fp)) {
                    forbidden(res);
                    return;
                }
                try {
                    const raw = await readFile(fp, 'utf-8');
                    const data = JSON.parse(raw);
                    if (sampleIndex != null) {
                        if (!Array.isArray(data.samples) || sampleIndex >= data.samples.length) {
                            json(res, 404, { error: 'Sample not found' });
                            return;
                        }
                        const sample = data.samples[sampleIndex];
                        if (!sample || typeof sample !== 'object' || Array.isArray(sample)) {
                            json(res, 404, { error: 'Sample not found' });
                            return;
                        }
                        const detail = await buildGroupedSampleDetail(path.dirname(fp), data, sample, file, sampleIndex);
                        json(res, 200, detail);
                        return;
                    }
                    json(res, 200, data);
                }
                catch {
                    json(res, 404, { error: 'File not found' });
                }
                return;
            }
            if (pathname === '/api/step-deduction-reports') {
                const stepName = u.searchParams.get('step') || '';
                if (!safeStepSegment(stepName)) {
                    json(res, 400, { error: 'Invalid step' });
                    return;
                }
                const modeParam = (u.searchParams.get('mode') || 'deductions').toLowerCase();
                const mode = modeParam === 'report' ? 'report' : 'deductions';
                const stepDir = resolveStepDir(rolloutRoot, stepName);
                if (!isPathInsideRoot(rolloutRoot, stepDir)) {
                    forbidden(res);
                    return;
                }
                let names;
                try {
                    names = (await readdir(stepDir)).filter(f => safeJsonBasename(f)).sort();
                }
                catch {
                    json(res, 404, { error: 'Step not found' });
                    return;
                }
                const items = [];
                const fileJobs = names
                    .map(file => ({ file, fp: path.join(stepDir, file) }))
                    .filter(({ fp }) => isPathInsideRoot(rolloutRoot, fp));
                for (let i = 0; i < fileJobs.length; i += STEP_DEDUCTION_READ_CONCURRENCY) {
                    const chunk = fileJobs.slice(i, i + STEP_DEDUCTION_READ_CONCURRENCY);
                    const batch = await Promise.all(chunk.map(async ({ file, fp }) => {
                        try {
                            const raw = await readFile(fp, 'utf-8');
                            const data = JSON.parse(raw);
                            const text = mode === 'report'
                                ? (0, deductionReport_1.buildDeductionSummaryMarkdown)(data)
                                : (0, deductionReport_1.buildDeductionsRawExport)(data);
                            const meta = (0, deductionReport_1.extractRolloutMeta)(data);
                            return { file, text, meta };
                        }
                        catch {
                            return { file, text: null, parseError: 'json_parse_failed' };
                        }
                    }));
                    for (const b of batch) {
                        items.push(b);
                    }
                }
                json(res, 200, { step: stepName, mode, totalFiles: items.length, items });
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