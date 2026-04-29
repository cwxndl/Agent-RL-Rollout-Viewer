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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const util_1 = require("util");
const rolloutServer_1 = require("./rolloutServer");
const readdir = (0, util_1.promisify)(fs.readdir);
const stat = (0, util_1.promisify)(fs.stat);
let stepCache = null;
const CACHE_TTL = 30000; // 30秒缓存
let serverState = null;
function disposeRolloutServer() {
    if (serverState) {
        serverState.handle.dispose();
        serverState = null;
    }
}
async function ensureRolloutServer(rolloutFolder, extensionPath) {
    if (serverState && serverState.folder === rolloutFolder) {
        return serverState.handle;
    }
    disposeRolloutServer();
    const mediaDir = path.join(extensionPath, 'media');
    const handle = await (0, rolloutServer_1.startRolloutServer)(rolloutFolder, mediaDir);
    serverState = { folder: rolloutFolder, handle };
    return handle;
}
async function openRolloutInBrowser(rolloutFolder, extensionPath, stepName) {
    const handle = await ensureRolloutServer(rolloutFolder, extensionPath);
    const u = new URL(`${handle.baseUrl}/`);
    u.searchParams.set('token', handle.token);
    if (stepName) {
        u.searchParams.set('step', stepName);
    }
    const ok = await vscode.env.openExternal(vscode.Uri.parse(u.toString()));
    if (!ok) {
        vscode.window.showWarningMessage(`无法在浏览器中打开。请手动访问：${u.toString()}`);
    }
    else {
        vscode.window.showInformationMessage('已在系统浏览器中打开 Rollout Viewer（本地 127.0.0.1，关闭扩展或切换 Rollout 目录后会停止服务）');
    }
}
function activate(context) {
    console.log('Agent RL Rollout Viewer is now active');
    const treeDataProvider = new RolloutTreeProvider();
    const treeView = vscode.window.createTreeView('agentRLExplorer', {
        treeDataProvider: treeDataProvider
    });
    // 注册命令：设置rollout文件夹
    context.subscriptions.push(vscode.commands.registerCommand('agentRL.setRolloutFolder', async () => {
        const folder = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select Rollout Folder'
        });
        if (folder && folder[0]) {
            const folderPath = folder[0].fsPath;
            await vscode.workspace.getConfiguration('agentRL').update('rolloutFolder', folderPath, vscode.ConfigurationTarget.Global);
            // 清除缓存
            stepCache = null;
            vscode.window.showInformationMessage(`Rollout folder set to: ${folderPath}`);
            treeDataProvider.refresh();
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('agentRL.openViewer', async () => {
        const config = vscode.workspace.getConfiguration('agentRL');
        const rolloutFolder = config.get('rolloutFolder');
        if (!rolloutFolder || !fs.existsSync(rolloutFolder)) {
            vscode.window.showErrorMessage('请先设置rollout文件夹');
            return;
        }
        try {
            await openRolloutInBrowser(rolloutFolder, context.extensionPath);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            vscode.window.showErrorMessage('启动本地查看服务失败: ' + msg);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('agentRL.openStep', async (item) => {
        const config = vscode.workspace.getConfiguration('agentRL');
        const rolloutFolder = config.get('rolloutFolder') || path.dirname(item.folderPath);
        if (!rolloutFolder || !fs.existsSync(rolloutFolder)) {
            vscode.window.showErrorMessage('请先设置rollout文件夹');
            return;
        }
        try {
            await openRolloutInBrowser(rolloutFolder, context.extensionPath, item.stepName);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            vscode.window.showErrorMessage('启动本地查看服务失败: ' + msg);
        }
    }));
    // 注册命令：刷新
    context.subscriptions.push(vscode.commands.registerCommand('agentRL.refresh', () => {
        stepCache = null; // 清除缓存
        treeDataProvider.refresh();
    }));
    context.subscriptions.push(treeView);
    context.subscriptions.push({
        dispose: () => disposeRolloutServer()
    });
}
function deactivate() {
    disposeRolloutServer();
}
// 异步扫描step文件夹（带缓存）
async function scanStepFoldersAsync(rolloutFolder) {
    // 检查缓存
    if (stepCache && stepCache.folderPath === rolloutFolder && Date.now() - stepCache.timestamp < CACHE_TTL) {
        return stepCache.steps;
    }
    const steps = [];
    try {
        const files = await readdir(rolloutFolder);
        // 并行检查所有目录
        const checkPromises = files
            .filter(f => f.startsWith('step_'))
            .map(async (file) => {
            const fullPath = path.join(rolloutFolder, file);
            try {
                const fileStat = await stat(fullPath);
                if (fileStat.isDirectory()) {
                    // 快速计数：只读取目录，不读取文件内容
                    const subFiles = await readdir(fullPath);
                    const jsonCount = subFiles.filter(f => f.endsWith('.json') && !f.startsWith('.')).length;
                    return { name: file, path: fullPath, fileCount: jsonCount };
                }
            }
            catch {
                // 忽略错误
            }
            return null;
        });
        const results = await Promise.all(checkPromises);
        for (const r of results) {
            if (r)
                steps.push(r);
        }
        // 按step数字排序
        steps.sort((a, b) => {
            const numA = parseInt(a.name.replace('step_', ''));
            const numB = parseInt(b.name.replace('step_', ''));
            return numA - numB;
        });
        // 更新缓存
        stepCache = { folderPath: rolloutFolder, steps, timestamp: Date.now() };
    }
    catch (error) {
        console.error('Error scanning folders:', error);
    }
    return steps;
}
// TreeView数据提供器
class RolloutTreeProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren(element) {
        if (!element) {
            // 根节点：读取配置的rollout文件夹
            const config = vscode.workspace.getConfiguration('agentRL');
            const rolloutFolder = config.get('rolloutFolder');
            if (!rolloutFolder || !fs.existsSync(rolloutFolder)) {
                vscode.window.showInformationMessage('Please set rollout folder first');
                return [];
            }
            // 使用异步扫描
            const steps = await scanStepFoldersAsync(rolloutFolder);
            return steps.map(step => new StepItem(step.name, step.path, step.fileCount));
        }
        return [];
    }
}
class StepItem extends vscode.TreeItem {
    constructor(stepName, folderPath, fileCount) {
        super(stepName, vscode.TreeItemCollapsibleState.None);
        this.stepName = stepName;
        this.folderPath = folderPath;
        this.fileCount = fileCount;
        this.id = stepName + '_' + fileCount + '_' + Date.now();
        this.tooltip = `${fileCount} rollout files`;
        this.description = `${fileCount} files`;
        this.contextValue = 'stepFolder';
        this.command = {
            command: 'agentRL.openStep',
            title: 'Open Step',
            arguments: [this]
        };
        this.iconPath = new vscode.ThemeIcon('folder-opened');
    }
}
//# sourceMappingURL=extension.js.map