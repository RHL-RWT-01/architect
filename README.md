# Architect

Generate clean, interactive architecture diagrams from your code automatically.

![Architect Icon](resources/icon.png)

## Features

- **Real-time Visualization**: Instantly see the structure of your current file.
- **Workspace Scan**: One-click to generate a full system dependency graph.
- **Mermaid.js Powered**: Uses the industry standard for diagramming.
- **Interactive Webview**: Zoom, pan, and explore your architecture.
- **Theme Aware**: Matches your VS Code theme (Dark/Light).

## Usage

1. Open any `.ts`, `.js`, `.tsx`, or `.jsx` file.
2. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
3. Run **`Architect: Generate Diagram`**.
4. Use the **"Scan Full Workspace"** button in the preview panel for a project-wide view.

## Requirements

- VS Code v1.85.0 or higher.
- Internet connection (to load Mermaid.js from CDN - offline support coming soon).

## Extension Settings

This extension contributes the following settings:

* `architect.autoUpdate`: Enable/disable real-time updates while typing.

## Release Notes

### 0.0.1
Initial release with basic dependency parsing and workspace scanning.

---

**Built with ❤️ for better system design.**
