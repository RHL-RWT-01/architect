import * as vscode from 'vscode';
import { CodeParser } from './parser';

export function activate(context: vscode.ExtensionContext) {
    console.log('Architect extension is now active!');

    let disposable = vscode.commands.registerCommand('architect.generateDiagram', () => {
        ArchitectPanel.createOrShow(context.extensionUri);
    });

    context.subscriptions.push(disposable);

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

        this._panel.webview.onDidReceiveMessage(message => {
            if (message.command === 'scanWorkspace') {
                this._scanWorkspace();
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
                        --padding: 20px;
                    }
                    body {
                        font-family: var(--vscode-font-family);
                        background-color: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                        padding: var(--padding);
                        margin: 0;
                    }
                    .header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        padding-bottom: 10px;
                        margin-bottom: 20px;
                    }
                    button {
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 8px 16px;
                        cursor: pointer;
                        border-radius: 2px;
                    }
                    button:hover {
                        background-color: var(--vscode-button-hoverBackground);
                    }
                    .mermaid {
                        background-color: white;
                        padding: 20px;
                        border-radius: 8px;
                        overflow: auto;
                    }
                    #error {
                        color: var(--vscode-errorForeground);
                        display: none;
                        padding: 10px;
                        border: 1px solid var(--vscode-errorForeground);
                        margin-top: 10px;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>Architecture Preview</h1>
                    <button onclick="scan()">Scan Full Workspace</button>
                </div>
                <div id="error"></div>
                <div class="mermaid" id="diagram">
                    ${mermaidCode || 'graph TD\\n  A[Open a file to see diagram]'}
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    
                    mermaid.initialize({ 
                        startOnLoad: true, 
                        theme: 'default',
                        securityLevel: 'loose'
                    });

                    function scan() {
                        vscode.postMessage({ command: 'scanWorkspace' });
                    }

                    window.addEventListener('message', event => {
                        const message = event.data;
                        if (message.command === 'update') {
                            const container = document.getElementById('diagram');
                            container.removeAttribute('data-processed');
                            container.innerHTML = message.mermaid;
                            try {
                                mermaid.contentLoaded();
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

export function deactivate() { }
