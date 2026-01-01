import * as path from 'path';

export interface Node {
    id: string;
    label: string;
    type: 'file' | 'class' | 'function' | 'module';
}

export interface Edge {
    from: string;
    to: string;
    label?: string;
}

export interface ArchitectureGraph {
    nodes: Node[];
    edges: Edge[];
}

export class CodeParser {
    public static async parseFile(content: string, filePath: string, workspaceRoot?: string): Promise<ArchitectureGraph> {
        const nodes: Node[] = [];
        const edges: Edge[] = [];

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

    public static async parseWorkspace(files: { path: string, content: string }[], workspaceRoot: string): Promise<ArchitectureGraph> {
        const allNodes: Node[] = [];
        const allEdges: Edge[] = [];
        const nodeIds = new Set<string>();

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

    public static toMermaid(graph: ArchitectureGraph): string {
        let mermaid = 'graph TD\n';

        // Add nodes with styles/types if needed
        for (const node of graph.nodes) {
            if (node.type === 'class') {
                mermaid += `  ${node.id}[["${node.label}"]] \n`;
            } else {
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
