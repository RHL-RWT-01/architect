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
exports.CodeParser = void 0;
const path = __importStar(require("path"));
class CodeParser {
    static async parseFile(content, filePath, workspaceRoot) {
        const nodes = [];
        const edges = [];
        const relativePath = workspaceRoot ? path.relative(workspaceRoot, filePath) : filePath;
        const fileId = relativePath.replace(/\\/g, '/');
        const fileName = path.basename(filePath);
        nodes.push({ id: fileId, label: fileName, type: 'file' });
        // Simple regex for imports
        const importRegex = /import\s+.*\s+from\s+['"](.*)['"]/g;
        let match;
        while ((match = importRegex.exec(content)) !== null) {
            const importPath = match[1];
            if (importPath.startsWith('.')) {
                // Resolve relative import to a potential file ID
                const absoluteImportPath = path.resolve(path.dirname(filePath), importPath);
                let targetId = workspaceRoot ? path.relative(workspaceRoot, absoluteImportPath) : importPath;
                targetId = targetId.replace(/\\/g, '/');
                // Try to handle missing extensions
                if (!targetId.endsWith('.ts') && !targetId.endsWith('.js') && !targetId.endsWith('.tsx')) {
                    // This is a simplification
                    targetId += '.ts';
                }
                edges.push({ from: fileId, to: targetId });
            }
        }
        return { nodes, edges };
    }
    static async parseWorkspace(files, workspaceRoot) {
        const allNodes = [];
        const allEdges = [];
        const nodeIds = new Set();
        for (const file of files) {
            const graph = await this.parseFile(file.content, file.path, workspaceRoot);
            for (const node of graph.nodes) {
                if (!nodeIds.has(node.id)) {
                    allNodes.push(node);
                    nodeIds.add(node.id);
                }
            }
            allEdges.push(...graph.edges);
        }
        return { nodes: allNodes, edges: allEdges };
    }
    static toMermaid(graph) {
        let mermaid = 'graph TD\n';
        // Add nodes with styles/types if needed
        for (const node of graph.nodes) {
            if (node.type === 'class') {
                mermaid += `  ${node.id}[["${node.label}"]] \n`;
            }
            else {
                mermaid += `  ${node.id}("${node.label}") \n`;
            }
        }
        for (const edge of graph.edges) {
            const label = edge.label ? `|${edge.label}|` : '';
            mermaid += `  ${edge.from} -->${label} ${edge.to}\n`;
        }
        return mermaid;
    }
}
exports.CodeParser = CodeParser;
//# sourceMappingURL=parser.js.map