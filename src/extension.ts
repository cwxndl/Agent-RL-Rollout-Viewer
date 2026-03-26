import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { promisify } from 'util';
import { startRolloutServer, RolloutServerHandle } from './rolloutServer';

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

// 缓存扫描结果
interface StepCache {
    folderPath: string;
    steps: { name: string; path: string; fileCount: number }[];
    timestamp: number;
}
let stepCache: StepCache | null = null;
const CACHE_TTL = 30000; // 30秒缓存

let serverState: { folder: string; handle: RolloutServerHandle } | null = null;

function disposeRolloutServer(): void {
    if (serverState) {
        serverState.handle.dispose();
        serverState = null;
    }
}

async function ensureRolloutServer(rolloutFolder: string, extensionPath: string): Promise<RolloutServerHandle> {
    if (serverState && serverState.folder === rolloutFolder) {
        return serverState.handle;
    }
    disposeRolloutServer();
    const mediaDir = path.join(extensionPath, 'media');
    const handle = await startRolloutServer(rolloutFolder, mediaDir);
    serverState = { folder: rolloutFolder, handle };
    return handle;
}

async function openRolloutInBrowser(
    rolloutFolder: string,
    extensionPath: string,
    stepName?: string
): Promise<void> {
    const handle = await ensureRolloutServer(rolloutFolder, extensionPath);
    const u = new URL(`${handle.baseUrl}/`);
    u.searchParams.set('token', handle.token);
    if (stepName) {
        u.searchParams.set('step', stepName);
    }
    const ok = await vscode.env.openExternal(vscode.Uri.parse(u.toString()));
    if (!ok) {
        vscode.window.showWarningMessage(
            `无法在浏览器中打开。请手动访问：${u.toString()}`
        );
    } else {
        vscode.window.showInformationMessage(
            '已在系统浏览器中打开 Rollout Viewer（本地 127.0.0.1，关闭扩展或切换 Rollout 目录后会停止服务）'
        );
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Agent RL Rollout Viewer is now active');

    const treeDataProvider = new RolloutTreeProvider();
    const treeView = vscode.window.createTreeView('agentRLExplorer', {
        treeDataProvider: treeDataProvider
    });

    // 注册命令：设置rollout文件夹
    context.subscriptions.push(
        vscode.commands.registerCommand('agentRL.setRolloutFolder', async () => {
            const folder = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Select Rollout Folder'
            });

            if (folder && folder[0]) {
                const folderPath = folder[0].fsPath;
                await vscode.workspace.getConfiguration('agentRL').update(
                    'rolloutFolder',
                    folderPath,
                    vscode.ConfigurationTarget.Global
                );
                // 清除缓存
                stepCache = null;
                vscode.window.showInformationMessage(`Rollout folder set to: ${folderPath}`);
                treeDataProvider.refresh();
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('agentRL.openViewer', async () => {
            const config = vscode.workspace.getConfiguration('agentRL');
            const rolloutFolder = config.get<string>('rolloutFolder');

            if (!rolloutFolder || !fs.existsSync(rolloutFolder)) {
                vscode.window.showErrorMessage('请先设置rollout文件夹');
                return;
            }

            try {
                await openRolloutInBrowser(rolloutFolder, context.extensionPath);
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                vscode.window.showErrorMessage('启动本地查看服务失败: ' + msg);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('agentRL.openStep', async (item: StepItem) => {
            const config = vscode.workspace.getConfiguration('agentRL');
            const rolloutFolder = config.get<string>('rolloutFolder') || path.dirname(item.folderPath);

            if (!rolloutFolder || !fs.existsSync(rolloutFolder)) {
                vscode.window.showErrorMessage('请先设置rollout文件夹');
                return;
            }

            try {
                await openRolloutInBrowser(rolloutFolder, context.extensionPath, item.stepName);
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                vscode.window.showErrorMessage('启动本地查看服务失败: ' + msg);
            }
        })
    );

    // 注册命令：刷新
    context.subscriptions.push(
        vscode.commands.registerCommand('agentRL.refresh', () => {
            stepCache = null; // 清除缓存
            treeDataProvider.refresh();
        })
    );

    context.subscriptions.push(treeView);

    context.subscriptions.push({
        dispose: () => disposeRolloutServer()
    });
}

export function deactivate() {
    disposeRolloutServer();
}

// 异步扫描step文件夹（带缓存）
async function scanStepFoldersAsync(rolloutFolder: string): Promise<{ name: string; path: string; fileCount: number }[]> {
    // 检查缓存
    if (stepCache && stepCache.folderPath === rolloutFolder && Date.now() - stepCache.timestamp < CACHE_TTL) {
        return stepCache.steps;
    }

    const steps: { name: string; path: string; fileCount: number }[] = [];

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
                        const jsonCount = subFiles.filter(f => f.endsWith('.json')).length;
                        return { name: file, path: fullPath, fileCount: jsonCount };
                    }
                } catch {
                    // 忽略错误
                }
                return null;
            });

        const results = await Promise.all(checkPromises);

        for (const r of results) {
            if (r) steps.push(r);
        }

        // 按step数字排序
        steps.sort((a, b) => {
            const numA = parseInt(a.name.replace('step_', ''));
            const numB = parseInt(b.name.replace('step_', ''));
            return numA - numB;
        });

        // 更新缓存
        stepCache = { folderPath: rolloutFolder, steps, timestamp: Date.now() };
    } catch (error) {
        console.error('Error scanning folders:', error);
    }

    return steps;
}

// TreeView数据提供器
class RolloutTreeProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TreeItem): Promise<TreeItem[]> {
        if (!element) {
            // 根节点：读取配置的rollout文件夹
            const config = vscode.workspace.getConfiguration('agentRL');
            const rolloutFolder = config.get<string>('rolloutFolder');

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
    constructor(
        public readonly stepName: string,
        public readonly folderPath: string,
        public readonly fileCount: number
    ) {
        super(stepName, vscode.TreeItemCollapsibleState.None);
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

type TreeItem = StepItem;
