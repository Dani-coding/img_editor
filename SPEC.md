# Image Editor - Specification Document

## Project Overview

- **Project name**: Image Editor Web
- **Type**: Single-page web application (HTML/CSS/JS)
- **Core functionality**: A lightweight, dependency-free image editor for basic drawing and editing tasks
- **Target users**: General users who need quick image editing in the browser

---

## UI/UX Specification

### Layout Structure

```
+-------------------------------------------------------------+
|  TOOLBAR (fixed top)                                        |
|  [Theme Toggle] [Abrir] [Copiar] [Descargar] [Limpiar]     |
+----------------+--------------------------------------------+
|  SIDEBAR       |                                            |
|  (left panel)  |           CANVAS AREA                     |
|                |                                            |
|  Tools:        |      (main editing workspace)             |
|  - Pencil      |                                            |
|  - Line        |                                            |
|  - Rectangle   |                                            |
|  - Circle      |                                            |
|  - Selection  |                                            |
|                |                                            |
|  ---------     |                                            |
|  Color Picker |                                            |
|  Stroke Width |                                            |
+----------------+--------------------------------------------+
```

- **Responsive**: Canvas adapts to image size (max viewport)
- **Sidebar**: Fixed width 180px
- **Toolbar**: Full width, height 50px

### Visual Design

#### Color Palette

**Light Theme**
| Element | Color |
|---------|-------|
| Background | `#f5f5f5` |
| Surface | `#ffffff` |
| Primary accent | `#3b82f6` |
| Text primary | `#1f2937` |
| Border | `#e5e7eb` |

**Dark Theme**
| Element | Color |
|---------|-------|
| Background | `#18181b` |
| Surface | `#27272a` |
| Primary accent | `#60a5fa` |
| Text primary | `#f4f4f5` |
| Border | `#3f3f46` |

#### Typography

- Font: `"Segoe UI", system-ui, sans-serif`
- Headings: 16px semi-bold
- Body: 14px

---

## Functionality Specification

### I/O Features
- Paste (Ctrl+V) from clipboard
- Open file from disk
- Copy to clipboard (PNG, 85% quality)
- Download (PNG, 85% quality)
- Clear canvas with confirmation
- Auto-save to localStorage every 20s

### Drawing Tools
| Tool | Shortcut |
|------|----------|
| Pencil | P |
| Line | L |
| Rectangle | R |
| Circle | C |
| Selection | S |

### Selection Tool
- Click+drag to create rectangle
- Minimum 20x20px area
- 4 corner handles for resize
- Drag interior to move
- Ctrl+X: Crop selection
- Ctrl+C: Copy selection
- Escape: Deselect

### Auto-save
- Key: `imageEditor_autosave`
- Restores automatically on page load
- Theme preference: `imageEditor_theme`