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
const parser_1 = require("./parser");
function activate(context) {
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
    static currentPanel;
    _panel;
    _disposables = [];
    static createOrShow(extensionUri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
        if (ArchitectPanel.currentPanel) {
            ArchitectPanel.currentPanel._panel.reveal(column);
            ArchitectPanel.currentPanel.updateForEditor(vscode.window.activeTextEditor);
            return;
        }
        const panel = vscode.window.createWebviewPanel('architect', 'Architecture Diagram', column ? column + 1 : vscode.ViewColumn.Two, {
            enableScripts: true,
            localResourceRoots: [extensionUri]
        });
        ArchitectPanel.currentPanel = new ArchitectPanel(panel, extensionUri);
    }
    constructor(panel, extensionUri) {
        this._panel = panel;
        this.updateForEditor(vscode.window.activeTextEditor);
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }
    async updateForEditor(editor) {
        if (!editor) {
            return;
        }
        const content = editor.document.getText();
        const fileName = editor.document.fileName;
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        const graph = await parser_1.CodeParser.parseFile(content, fileName, workspaceRoot);
        const mermaid = parser_1.CodeParser.toMermaid(graph);
        this._panel.webview.postMessage({ command: 'update', mermaid });
        this._update(mermaid);
    }
    async _scanWorkspace() {
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
            const fileData = await Promise.all(files.map(async (file) => ({
                path: file.fsPath,
                content: (await vscode.workspace.openTextDocument(file)).getText()
            })));
            const graph = await parser_1.CodeParser.parseWorkspace(fileData, workspaceRoot);
            const mermaid = parser_1.CodeParser.toMermaid(graph);
            this._panel.webview.postMessage({ command: 'update', mermaid });
            this._update(mermaid);
        });
    }
    dispose() {
        ArchitectPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
    _update(mermaidCode = '') {
        const webview = this._panel.webview;
        this._panel.title = 'Architecture Diagram';
        this._panel.webview.html = this._getHtmlForWebview(webview, mermaidCode);
        this._panel.webview.onDidReceiveMessage(message => {
            if (message.command === 'scanWorkspace') {
                this._scanWorkspace();
            }
        }, null, this._disposables);
    }
    _getHtmlForWebview(webview, mermaidCode) {
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
function deactivate() { }
//# sourceMappingURL=extension.js.map