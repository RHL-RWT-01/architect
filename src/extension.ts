import * as vscode from 'vscode';
import { CodeParser } from './parser';

export function activate(context: vscode.ExtensionContext) {
    console.log('Architect extension is now active!');

    let disposable = vscode.commands.registerCommand('architect.generateDiagram', () => {
        ArchitectPanel.createOrShow(context.extensionUri);
    });
    context.subscriptions.push(disposable);

    // Register Sidebar View
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'architectura.view',
            new ArchitectSidebarProvider(context.extensionUri)
        )
    );

    // Auto-update when active editor changes
    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && ArchitectPanel.currentPanel) {
            ArchitectPanel.currentPanel.updateForEditor(editor);
        }
    }, null, context.subscriptions);

    // Auto-update when document is saved
    vscode.workspace.onDidSaveTextDocument(doc => {
        if (ArchitectPanel.currentPanel && vscode.window.activeTextEditor?.document === doc) {
            ArchitectPanel.currentPanel.updateForEditor(vscode.window.activeTextEditor);
        }
    }, null, context.subscriptions);
}

class ArchitectPanel {
    public static currentPanel: ArchitectPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (ArchitectPanel.currentPanel) {
            ArchitectPanel.currentPanel._panel.reveal(column);
            ArchitectPanel.currentPanel.updateForEditor(vscode.window.activeTextEditor);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'architect',
            'Architecture Diagram',
            column ? column + 1 : vscode.ViewColumn.Two,
            {
                enableScripts: true,
                localResourceRoots: [extensionUri]
            }
        );

        ArchitectPanel.currentPanel = new ArchitectPanel(panel, extensionUri);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;

        this.updateForEditor(vscode.window.activeTextEditor);

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    public async updateForEditor(editor: vscode.TextEditor | undefined) {
        if (!editor) {
            return;
        }

        const content = editor.document.getText();
        const fileName = editor.document.fileName;
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        const graph = await CodeParser.parseFile(content, fileName, workspaceRoot);
        const mermaid = CodeParser.toMermaid(graph);

        this._panel.webview.postMessage({ command: 'update', mermaid });
        this._update(mermaid);
    }

    private async _scanWorkspace() {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        if (!workspaceRoot) {
            vscode.window.showErrorMessage('No workspace open');
            return;
        }

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Architect: Scanning workspace...",
            cancellable: false
        }, async (progress) => {
            const files = await vscode.workspace.findFiles('**/*.{ts,js,tsx,jsx}', '**/node_modules/**');
            const fileData = await Promise.all(files.map(async file => ({
                path: file.fsPath,
                content: (await vscode.workspace.openTextDocument(file)).getText()
            })));

            const graph = await CodeParser.parseWorkspace(fileData, workspaceRoot);
            const mermaid = CodeParser.toMermaid(graph);

            this._panel.webview.postMessage({ command: 'update', mermaid });
            this._update(mermaid);
        });
    }

    public dispose() {
        ArchitectPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _update(mermaidCode: string = '') {
        const webview = this._panel.webview;
        this._panel.title = 'Architecture Diagram';
        this._panel.webview.html = this._getHtmlForWebview(webview, mermaidCode);

        this._panel.webview.onDidReceiveMessage(async message => {
            if (message.command === 'scanWorkspace') {
                this._scanWorkspace();
            } else if (message.command === 'openFile') {
                const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
                if (workspaceRoot) {
                    const fullPath = vscode.Uri.file(require('path').join(workspaceRoot, message.filePath));
                    try {
                        const doc = await vscode.workspace.openTextDocument(fullPath);
                        await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One });
                    } catch (e) {
                        vscode.window.showErrorMessage(`Could not open file: ${message.filePath}`);
                    }
                }
            }
        }, null, this._disposables);
    }

    private _getHtmlForWebview(webview: vscode.Webview, mermaidCode: string) {
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
                <style>
                    :root {
                        --padding: 24px;
                        --accent: var(--vscode-button-background);
                        --bg: var(--vscode-editor-background);
                        --fg: var(--vscode-editor-foreground);
                        --border: var(--vscode-panel-border);
                    }
                    body {
                        font-family: var(--vscode-font-family);
                        background-color: var(--bg);
                        color: var(--fg);
                        padding: 0;
                        margin: 0;
                        overflow: hidden;
                        display: flex;
                        flex-direction: column;
                        height: 100vh;
                    }
                    .header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 12px var(--padding);
                        background: var(--vscode-sideBar-background);
                        border-bottom: 1px solid var(--border);
                        flex-shrink: 0;
                    }
                    .header h1 {
                        font-size: 14px;
                        text-transform: uppercase;
                        letter-spacing: 1px;
                        margin: 0;
                        opacity: 0.8;
                    }
                    button {
                        background-color: var(--accent);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 6px 14px;
                        cursor: pointer;
                        border-radius: 4px;
                        font-size: 11px;
                        font-weight: 600;
                        transition: filter 0.2s;
                    }
                    button:hover {
                        filter: brightness(1.2);
                    }
                    .mermaid-container {
                        flex-grow: 1;
                        overflow: auto;
                        padding: var(--padding);
                        display: flex;
                        justify-content: center;
                        background-image: 
                            radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0);
                        background-size: 24px 24px;
                    }
                    .mermaid {
                        background: white;
                        padding: 40px;
                        border-radius: 12px;
                        box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                        height: fit-content;
                        min-width: 300px;
                        color: #333;
                    }
                    #error {
                        color: var(--vscode-errorForeground);
                        display: none;
                        padding: 12px;
                        margin: 10px var(--padding);
                        border-left: 3px solid var(--vscode-errorForeground);
                        background: rgba(255,0,0,0.1);
                        font-size: 12px;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>Architectura</h1>
                    <button onclick="scan()">SCAN WORKSPACE</button>
                </div>
                <div id="error"></div>
                <div class="mermaid-container">
                    <div class="mermaid" id="diagram">
                        ${mermaidCode || 'graph TD\\n  A[Open a file to see diagram]'}
                    </div>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    
                    window.handleNodeClick = function(nodeId) {
                        vscode.postMessage({ 
                            command: 'openFile', 
                            filePath: nodeId 
                        });
                    };

                    mermaid.initialize({ 
                        startOnLoad: true, 
                        theme: 'neutral',
                        securityLevel: 'loose',
                        maxTextSize: 1000000,
                        flowchart: {
                            useMaxWidth: false,
                            htmlLabels: true,
                            curve: 'basis'
                        }
                    });

                    function scan() {
                        vscode.postMessage({ command: 'scanWorkspace' });
                    }

                    window.addEventListener('message', async event => {
                        const message = event.data;
                        if (message.command === 'update') {
                            const container = document.getElementById('diagram');
                            container.removeAttribute('data-processed');
                            
                            let code = message.mermaid;
                            // Add click handlers to all nodes
                            const nodeIds = [];
                            const lines = code.split('\\n');
                            lines.forEach(l => {
                                const m = l.match(/^\\s*([^\\s\\[\\(\\{]+)/);
                                if (m && !['graph', 'TD', 'click', 'subgraph', 'end'].includes(m[1].trim())) {
                                    nodeIds.push(m[1].trim());
                                }
                            });
                            
                            nodeIds.forEach(id => {
                                if (id.length > 0) {
                                    code += \`\\n  click \${id} call handleNodeClick("\${id}")\`;
                                }
                            });

                            container.innerText = code;
                            
                            try {
                                await mermaid.run({
                                    nodes: [container]
                                });
                                document.getElementById('error').style.display = 'none';
                            } catch (err) {
                                document.getElementById('error').innerText = err.message;
                                document.getElementById('error').style.display = 'block';
                            }
                        }
                    });
                </script>
            </body>
            </html>`;
    }
}

class ArchitectSidebarProvider implements vscode.WebviewViewProvider {
    constructor(private readonly _extensionUri: vscode.Uri) { }

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        const update = async () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const content = editor.document.getText();
                const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
                const graph = await CodeParser.parseFile(content, editor.document.fileName, workspaceRoot);
                const mermaid = CodeParser.toMermaid(graph);
                webviewView.webview.postMessage({ command: 'update', mermaid });
            }
        };

        webviewView.webview.onDidReceiveMessage(async message => {
            if (message.command === 'scanWorkspace') {
                vscode.commands.executeCommand('architect.generateDiagram');
                if (ArchitectPanel.currentPanel) {
                    // This is a shortcut for the demo
                    (ArchitectPanel.currentPanel as any)._scanWorkspace();
                }
            } else if (message.command === 'openFile') {
                const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
                if (workspaceRoot) {
                    const fullPath = vscode.Uri.file(require('path').join(workspaceRoot, message.filePath));
                    const doc = await vscode.workspace.openTextDocument(fullPath);
                    await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One });
                }
            }
        });

        // Initial HTML load (empty state)
        webviewView.webview.html = (ArchitectPanel.currentPanel as any)?._getHtmlForWebview(webviewView.webview, '');

        vscode.window.onDidChangeActiveTextEditor(update);
        vscode.workspace.onDidSaveTextDocument(update);
        update();
    }
}

export function deactivate() { }

