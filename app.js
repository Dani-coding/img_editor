(function() {
    const canvas = document.getElementById('editor-canvas');
    const ctx = canvas.getContext('2d');
    const emptyState = document.getElementById('empty-state');
    const themeToggle = document.getElementById('theme-toggle');
    const colorPicker = document.getElementById('color-picker');
    const strokeWidth = document.getElementById('stroke-width');
    const strokeValue = document.getElementById('stroke-value');
    const fileInput = document.getElementById('file-input');
    const selectionActions = document.querySelector('.selection-actions');

    let currentTool = 'pencil';
    let isDrawing = false;
    let startX, startY;
    let initialImageData = null;
    let originalImageData = null;
    let hasImage = false;
    let hasChanges = false;
    let autoSaveInterval;

    let selection = null;
    let isDraggingSelection = false;
    let dragHandle = null;
    let dragOffset = { x: 0, y: 0 };
    let selectionStartPos = null;
    let isMovingSelection = false;
    let isResizingSelection = false;
    let resizeHandle = null;

    const MIN_SELECTION = 20;

    function init() {
        loadTheme();
        loadAutoSave();
        setupEventListeners();
        setupAutoSave();
    }

    function loadTheme() {
        const theme = localStorage.getItem('imageEditor_theme') || 'light';
        document.documentElement.setAttribute('data-theme', theme);
        themeToggle.querySelector('.icon').textContent = theme === 'light' ? '☀️' : '🌙';
    }

    function toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('imageEditor_theme', next);
        themeToggle.querySelector('.icon').textContent = next === 'light' ? '☀️' : '🌙';
    }

    function loadAutoSave() {
        const saved = localStorage.getItem('imageEditor_autosave');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                const img = new Image();
                img.onload = function() {
                    canvas.width = img.width;
                    canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);
                    hasImage = true;
                    hasChanges = false;
                    emptyState.classList.add('hidden');
                    if (currentTool === 'selection') {
                        originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    }
                };
                img.src = data.imageData;
            } catch (e) {
                console.error('Error loading autosave:', e);
            }
        }
    }

    function setupAutoSave() {
        autoSaveInterval = setInterval(function() {
            if (hasImage && hasChanges) {
                saveToAutoSave();
            }
        }, 20000);
    }

    function saveToAutoSave() {
        const data = {
            imageData: canvas.toDataURL('image/png'),
            timestamp: Date.now()
        };
        localStorage.setItem('imageEditor_autosave', JSON.stringify(data));
        hasChanges = false;
    }

    function setupEventListeners() {
        themeToggle.addEventListener('click', toggleTheme);

        document.getElementById('btn-open').addEventListener('click', function() {
            fileInput.click();
        });

        fileInput.addEventListener('change', handleFileSelect);

        document.getElementById('btn-copy').addEventListener('click', copyToClipboard);
        document.getElementById('btn-download').addEventListener('click', downloadImage);
        document.getElementById('btn-clear').addEventListener('click', clearCanvas);

        document.getElementById('btn-crop').addEventListener('click', cropSelection);
        document.getElementById('btn-copy-selection').addEventListener('click', copySelection);

        document.querySelectorAll('.tool-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                setTool(this.dataset.tool);
            });
        });

        colorPicker.addEventListener('input', function() {
            hasChanges = true;
        });

        strokeWidth.addEventListener('input', function() {
            strokeValue.textContent = this.value + 'px';
            hasChanges = true;
        });

        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mouseup', handleMouseUp);
        canvas.addEventListener('mouseleave', handleMouseUp);

        document.addEventListener('paste', handlePaste);
        document.addEventListener('keydown', handleKeyDown);
    }

    function setTool(tool) {
        currentTool = tool;
        document.querySelectorAll('.tool-btn').forEach(function(btn) {
            btn.classList.toggle('active', btn.dataset.tool === tool);
        });

        if (tool === 'selection') {
            canvas.style.cursor = 'default';
            if (hasImage) {
                originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            }
        } else {
            canvas.style.cursor = 'crosshair';
            if (originalImageData) {
                ctx.putImageData(originalImageData, 0, 0);
                originalImageData = null;
            }
        }

        clearSelection();
    }

    function handleFileSelect(e) {
        const file = e.target.files[0];
        if (file && file.type.startsWith('image/')) {
            loadImage(file);
        }
        e.target.value = '';
    }

    function handlePaste(e) {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.startsWith('image/')) {
                const file = items[i].getAsFile();
                loadImage(file);
                break;
            }
        }
    }

    function loadImage(file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const maxWidth = window.innerWidth - 250;
                const maxHeight = window.innerHeight - 100;

                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = (maxWidth / width) * height;
                    width = maxWidth;
                }
                if (height > maxHeight) {
                    width = (maxHeight / height) * width;
                    height = maxHeight;
                }

                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);

                hasImage = true;
                hasChanges = true;
                emptyState.classList.add('hidden');
                if (currentTool === 'selection') {
                    originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                }
                clearSelection();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function handleMouseDown(e) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (currentTool === 'selection' && hasImage) {
            const handle = getHandleAtPosition(x, y);
            if (handle) {
                ctx.putImageData(originalImageData, 0, 0);
                originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                isResizingSelection = true;
                resizeHandle = handle;
                return;
            }
            
            if (selection && isInsideSelection(x, y)) {
                ctx.putImageData(originalImageData, 0, 0);
                originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                isMovingSelection = true;
                dragOffset = { x: x - selection.x, y: y - selection.y };
            } else {
                if (selection) {
                    clearSelection();
                }
                originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                selectionStartPos = { x: x, y: y };
                selection = { x: x, y: y, w: 0, h: 0 };
                isDraggingSelection = true;
            }
            return;
        }

        if (!hasImage) return;

        isDrawing = true;
        startX = x;
        startY = y;
        if (currentTool !== 'pencil') {
            initialImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        }

        if (currentTool === 'pencil') {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.strokeStyle = colorPicker.value;
            ctx.lineWidth = strokeWidth.value;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
        }
    }

    function handleMouseMove(e) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (currentTool === 'selection') {
            if (selection) {
                updateSelectionCursor(x, y);
            }
            
            if (isResizingSelection && resizeHandle) {
                resizeSelection(resizeHandle, x, y);
            } else if (isMovingSelection && selection) {
                const newX = x - dragOffset.x;
                const newY = y - dragOffset.y;
                
                if (newX >= 0 && newY >= 0 && 
                    newX + selection.w <= canvas.width && 
                    newY + selection.h <= canvas.height) {
                    
                    selection.x = newX;
                    selection.y = newY;
                    
                    ctx.putImageData(originalImageData, 0, 0);
                    drawSelectionOverlay();
                }
            } else if (isDraggingSelection && selectionStartPos) {
                drawSelectionPreview(x, y);
            }
            return;
        }

        if (!isDrawing || !hasImage) return;

        if (currentTool === 'pencil') {
            ctx.lineTo(x, y);
            ctx.stroke();
        } else {
            drawPreview(x, y);
        }
    }

    function handleMouseUp(e) {
        if (currentTool === 'selection') {
            if (isDraggingSelection && selectionStartPos) {
                const rect = canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                finishSelection(x, y);
            }
            isDraggingSelection = false;
            isMovingSelection = false;
            isResizingSelection = false;
            dragHandle = null;
            resizeHandle = null;
            return;
        }

        if (!isDrawing || !hasImage) return;

        const rect = canvas.getBoundingClientRect();
        const endX = e.clientX - rect.left;
        const endY = e.clientY - rect.top;

        ctx.strokeStyle = colorPicker.value;
        ctx.lineWidth = strokeWidth.value;

        switch (currentTool) {
            case 'line':
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo(endX, endY);
                ctx.stroke();
                break;
            case 'rectangle':
                ctx.strokeRect(startX, startY, endX - startX, endY - startY);
                break;
            case 'circle':
                const radius = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
                ctx.beginPath();
                ctx.arc(startX, startY, radius, 0, Math.PI * 2);
                ctx.stroke();
                break;
        }

        isDrawing = false;
        hasChanges = true;
        initialImageData = null;
    }

    function drawPreview(endX, endY) {
        ctx.save();
        ctx.strokeStyle = colorPicker.value;
        ctx.lineWidth = strokeWidth.value;

        if (initialImageData) {
            ctx.putImageData(initialImageData, 0, 0);
        } else {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            ctx.putImageData(imageData, 0, 0);
        }

        switch (currentTool) {
            case 'line':
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo(endX, endY);
                ctx.stroke();
                break;
            case 'rectangle':
                ctx.strokeRect(startX, startY, endX - startX, endY - startY);
                break;
            case 'circle':
                const radius = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
                ctx.beginPath();
                ctx.arc(startX, startY, radius, 0, Math.PI * 2);
                ctx.stroke();
                break;
        }

        ctx.restore();
    }

    function startSelection(x, y) {
        selectionStartPos = { x: x, y: y };
        selection = { x: x, y: y, w: 0, h: 0 };
        isDraggingSelection = true;
        
        if (hasImage) {
            originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        }
    }

    function drawSelectionPreview(endX, endY) {
        if (!selectionStartPos) return;
        
        const x = Math.min(selectionStartPos.x, endX);
        const y = Math.min(selectionStartPos.y, endY);
        const w = Math.abs(endX - selectionStartPos.x);
        const h = Math.abs(endY - selectionStartPos.y);

        if (originalImageData) {
            ctx.putImageData(originalImageData, 0, 0);
        }
        
        ctx.save();
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
        ctx.restore();
    }

    function finishSelection(endX, endY) {
        let x = Math.min(selectionStartPos.x, endX);
        let y = Math.min(selectionStartPos.y, endY);
        let w = Math.abs(endX - selectionStartPos.x);
        let h = Math.abs(endY - selectionStartPos.y);

        if (w < MIN_SELECTION || h < MIN_SELECTION) {
            clearSelection();
            return;
        }

        selection = { x: x, y: y, w: w, h: h };
        selectionStartPos = null;
        updateSelectionActions();
        drawSelectionOverlay();
    }

    function drawSelectionRect(x, y, w, h) {
        ctx.save();
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
        drawHandles(x, y, w, h);
        ctx.restore();
    }

    function drawHandles(x, y, w, h) {
        const handleSize = 8;
        const handles = [
            { x: x, y: y },
            { x: x + w, y: y },
            { x: x, y: y + h },
            { x: x + w, y: y + h }
        ];

        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;

        handles.forEach(function(h) {
            ctx.fillRect(h.x - handleSize/2, h.y - handleSize/2, handleSize, handleSize);
            ctx.strokeRect(h.x - handleSize/2, h.y - handleSize/2, handleSize, handleSize);
        });
    }

    function drawSelectionOverlay() {
        if (!selection) return;

        if (originalImageData) {
            ctx.putImageData(originalImageData, 0, 0);
        }

        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, selection.x, canvas.height);
        ctx.fillRect(selection.x, 0, selection.w, selection.y);
        ctx.fillRect(selection.x + selection.w, 0, canvas.width - selection.x - selection.w, canvas.height);
        ctx.fillRect(selection.x, selection.y + selection.h, selection.w, canvas.height - selection.y - selection.h);

        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.strokeRect(selection.x, selection.y, selection.w, selection.h);

        drawHandles(selection.x, selection.y, selection.w, selection.h);
        ctx.restore();
    }

    function getHandleAtPosition(x, y) {
        if (!selection) return null;
        
        const handleSize = 12;
        const handles = [
            { name: 'nw', x: selection.x, y: selection.y },
            { name: 'ne', x: selection.x + selection.w, y: selection.y },
            { name: 'sw', x: selection.x, y: selection.y + selection.h },
            { name: 'se', x: selection.x + selection.w, y: selection.y + selection.h }
        ];

        for (let i = 0; i < handles.length; i++) {
            const h = handles[i];
            if (Math.abs(x - h.x) < handleSize && Math.abs(y - h.y) < handleSize) {
                return h.name;
            }
        }
        return null;
    }

    function isInsideSelection(x, y) {
        if (!selection) return false;
        return x >= selection.x && x <= selection.x + selection.w &&
               y >= selection.y && y <= selection.y + selection.h;
    }

    function updateSelectionCursor(x, y) {
        if (!selection) return;

        const handle = getHandleAtPosition(x, y);
        if (handle) {
            canvas.style.cursor = 'nwse-resize';
        } else if (isInsideSelection(x, y)) {
            canvas.style.cursor = 'move';
        } else {
            canvas.style.cursor = 'default';
        }
    }

    function resizeSelection(handle, x, y) {
        const old = { ...selection };

        switch (handle) {
            case 'nw':
                selection.w = old.x + old.w - x;
                selection.h = old.y + old.h - y;
                selection.x = x;
                selection.y = y;
                break;
            case 'ne':
                selection.w = x - old.x;
                selection.h = old.y + old.h - y;
                selection.y = y;
                break;
            case 'sw':
                selection.w = old.x + old.w - x;
                selection.h = y - old.y;
                selection.x = x;
                break;
            case 'se':
                selection.w = x - old.x;
                selection.h = y - old.y;
                break;
        }

        if (selection.w < MIN_SELECTION || selection.h < MIN_SELECTION) {
            selection = old;
            return;
        }

        drawSelectionOverlay();
    }

    function moveSelection(x, y) {
        const old = { ...selection };
        selection.x = x;
        selection.y = y;

        if (selection.x < 0) selection.x = 0;
        if (selection.y < 0) selection.y = 0;
        if (selection.x + selection.w > canvas.width) selection.x = canvas.width - selection.w;
        if (selection.y + selection.h > canvas.height) selection.y = canvas.height - selection.h;

        drawSelectionOverlay();
    }

    function clearSelection() {
        selection = null;
        selectionStartPos = null;
        selectionActions.style.display = 'none';
        if (originalImageData) {
            ctx.putImageData(originalImageData, 0, 0);
        } else if (hasImage) {
            ctx.putImageData(ctx.getImageData(0, 0, canvas.width, canvas.height), 0, 0);
        }
    }

    function updateSelectionActions() {
        selectionActions.style.display = selection ? 'block' : 'none';
    }

    function cropSelection() {
        if (!selection) return;

        const imageData = ctx.getImageData(selection.x, selection.y, selection.w, selection.h);
        canvas.width = selection.w;
        canvas.height = selection.h;
        ctx.putImageData(imageData, 0, 0);
        originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        clearSelection();
        hasChanges = true;
    }

    function copySelection() {
        if (!selection) return;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = selection.w;
        tempCanvas.height = selection.h;
        const tempCtx = tempCanvas.getContext('2d');

        const imageData = ctx.getImageData(selection.x, selection.y, selection.w, selection.h);
        tempCtx.putImageData(imageData, 0, 0);

        tempCanvas.toBlob(function(blob) {
            navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]).then(function() {
                alert('Selección copiada al portapapeles');
            }).catch(function(err) {
                console.error('Error copying:', err);
            });
        }, 'image/png');
    }

    function copyToClipboard() {
        if (!hasImage) return;

        canvas.toBlob(function(blob) {
            navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]).then(function() {
                alert('Imagen copiada al portapapeles');
            }).catch(function(err) {
                console.error('Error copying:', err);
            });
        }, 'image/png', 0.85);
    }

    function downloadImage() {
        if (!hasImage) return;

        const link = document.createElement('a');
        link.download = 'imagen-editada.png';
        link.href = canvas.toDataURL('image/png', 0.85);
        link.click();
    }

    function clearCanvas() {
        if (!hasImage) return;

        if (confirm('¿Estás seguro de que quieres limpiar el canvas?')) {
            canvas.width = 800;
            canvas.height = 600;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            hasImage = false;
            hasChanges = false;
            emptyState.classList.remove('hidden');
            clearSelection();
            localStorage.removeItem('imageEditor_autosave');
        }
    }

    function handleKeyDown(e) {
        if (e.target.tagName === 'INPUT') return;

        switch (e.key.toLowerCase()) {
            case 'p':
                setTool('pencil');
                break;
            case 'l':
                setTool('line');
                break;
            case 'r':
                setTool('rectangle');
                break;
            case 'c':
                setTool('circle');
                break;
            case 's':
                setTool('selection');
                break;
            case 'escape':
                clearSelection();
                setTool('pencil');
                break;
            case 'delete':
            case 'backspace':
                if (selection) {
                    cropSelection();
                }
                break;
        }

        if (e.ctrlKey && e.key.toLowerCase() === 'c' && selection) {
            e.preventDefault();
            copySelection();
        }

        if (e.ctrlKey && e.key.toLowerCase() === 'x' && selection) {
            e.preventDefault();
            cropSelection();
        }
    }

    window.addEventListener('beforeunload', function() {
        if (hasImage && hasChanges) {
            saveToAutoSave();
        }
    });

    init();
})();