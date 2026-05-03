(function() {
    const canvas = document.getElementById('editor-canvas');
    const ctx = canvas.getContext('2d');
    const emptyState = document.getElementById('empty-state');
    const themeToggle = document.getElementById('theme-toggle');
    const colorPicker = document.getElementById('color-picker');
    const strokeWidth = document.getElementById('stroke-width');
    const strokeValue = document.getElementById('stroke-value');
    const textSizeInput = document.getElementById('text-size');
    const textSizeValue = document.getElementById('text-size-value');
    const textSizeRow = document.getElementById('text-size-row');
    const fileInput = document.getElementById('file-input');
    const selectionActions = document.querySelector('.selection-actions');

    let currentTool = 'pencil';
    let isDrawing = false;
    let startX, startY;
    let initialImageData = null;
    let hasImage = false;
    let hasChanges = false;
    let autoSaveInterval;

    let auxCanvas = document.createElement('canvas');
    let auxCtx = auxCanvas.getContext('2d');

    let selection = null;
    let isDraggingSelection = false;

    let textElements = [];
    let activeTextElement = null;
    let textInput = null;
    let isEditingText = false;
    let isDraggingText = false;
    let textDragOffset = { x: 0, y: 0 };
    let dragHandle = null;
    let dragOffset = { x: 0, y: 0 };
    let selectionStartPos = null;
    let isMovingSelection = false;
    let isResizingSelection = false;
    let resizeHandle = null;

    const MIN_SELECTION = 20;

    function init() {
        loadTheme();
        initCanvas();
        loadAutoSave();
        setupEventListeners();
        setupAutoSave();
    }

    function initCanvas() {
        canvas.width = 800;
        canvas.height = 600;
        auxCanvas.width = 800;
        auxCanvas.height = 600;
        const theme = document.documentElement.getAttribute('data-theme') || 'light';
        const bgColor = theme === 'dark' ? '#27272a' : '#e5e7eb';
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        auxCtx.fillStyle = bgColor;
        auxCtx.fillRect(0, 0, auxCanvas.width, auxCanvas.height);
        hasImage = false;
        hasChanges = false;
        emptyState.classList.remove('hidden');
        clearSelection();
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

        if (!hasImage) {
            const theme = document.documentElement.getAttribute('data-theme') || 'light';
            ctx.fillStyle = theme === 'dark' ? '#27272a' : '#e5e7eb';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
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
                    auxCanvas.width = img.width;
                    auxCanvas.height = img.height;
                    auxCtx.drawImage(img, 0, 0);
                    ctx.drawImage(auxCanvas, 0, 0);
                    hasImage = true;
                    hasChanges = false;
                    emptyState.classList.add('hidden');
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
        const canvasContainer = document.querySelector('.canvas-container');

        themeToggle.addEventListener('click', toggleTheme);

        canvasContainer.addEventListener('dragover', function(e) {
            e.preventDefault();
            canvasContainer.classList.add('drag-over');
        });

        canvasContainer.addEventListener('dragleave', function(e) {
            if (e.relatedTarget && !canvasContainer.contains(e.relatedTarget)) {
                canvasContainer.classList.remove('drag-over');
            }
        });

        canvasContainer.addEventListener('drop', function(e) {
            e.preventDefault();
            canvasContainer.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                loadImage(file);
            }
        });

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

        textSizeInput.addEventListener('input', function() {
            textSizeValue.textContent = this.value + 'px';
            hasChanges = true;
        });

        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mouseup', handleMouseUp);
        canvas.addEventListener('mouseleave', handleMouseUp);
        canvas.addEventListener('dblclick', handleTextDblClick);

        window.addEventListener('mousedown', function(e) {
            if (textInput && isEditingText && !textInput.contains(e.target) && e.target !== canvas && !canvas.contains(e.target)) {
                finishTextEditing();
            }
        });

        document.addEventListener('paste', handlePaste);
        document.addEventListener('keydown', handleKeyDown);
    }

    function setTool(tool) {
        currentTool = tool;
        document.querySelectorAll('.tool-btn').forEach(function(btn) {
            btn.classList.toggle('active', btn.dataset.tool === tool);
        });

        textSizeRow.style.display = tool === 'text' ? 'flex' : 'none';

        if (tool === 'selection') {
            canvas.style.cursor = 'default';
        } else if (tool === 'text') {
            canvas.style.cursor = 'text';
            refreshCanvas();
        } else {
            ctx.drawImage(auxCanvas, 0, 0);
            canvas.style.cursor = 'crosshair';
        }

        clearSelection();
        if (tool !== 'text') {
            finishTextEditing();
        }
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
                auxCanvas.width = width;
                auxCanvas.height = height;
                auxCtx.drawImage(img, 0, 0, width, height);
                ctx.drawImage(auxCanvas, 0, 0);

                hasImage = true;
                hasChanges = true;
                emptyState.classList.add('hidden');
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

        if (currentTool === 'text' && hasImage) {
            
            if (textElements.length > 0) {
                const textAtPos = getTextAtPosition(x, y);
                if (textAtPos) {
                    isDraggingText = true;
                    activeTextElement = textAtPos;
                    textDragOffset = { x: x - textAtPos.x, y: y - textAtPos.y };
                    return;
                }
            }
            
            if (isEditingText) {
                return;
            }
            
            if (textElements.length > 0) {
                renderTextElements();
            }
            
            startTextInput(x, y);
            return;
        }

        if (currentTool === 'selection' && hasImage) {
            const handle = getHandleAtPosition(x, y);
            if (handle) {
                isResizingSelection = true;
                resizeHandle = handle;
                return;
            }
            
            if (selection && isInsideSelection(x, y)) {
                isMovingSelection = true;
                dragOffset = { x: x - selection.x, y: y - selection.y };
            } else {
                if (selection) {
                    clearSelection();
                }
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
            initialImageData = auxCtx.getImageData(0, 0, canvas.width, canvas.height);
        }

        if (currentTool === 'pencil') {
            auxCtx.beginPath();
            auxCtx.moveTo(x, y);
            auxCtx.strokeStyle = colorPicker.value;
            auxCtx.lineWidth = strokeWidth.value;
            auxCtx.lineCap = 'round';
            auxCtx.lineJoin = 'round';
        }
    }

    function handleMouseMove(e) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (currentTool === 'text' && isDraggingText) {
            dragText(x, y);
            return;
        }

        if (currentTool === 'text' && !isEditingText && !isDraggingText) {
            const textEl = getTextAtPosition(x, y);
            canvas.style.cursor = textEl ? 'move' : 'text';
            return;
        }

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
                    
                    ctx.drawImage(auxCanvas, 0, 0);
                    drawSelectionOverlay();
                }
            } else if (isDraggingSelection && selectionStartPos) {
                drawSelectionPreview(x, y);
            }
            return;
        }

        if (!isDrawing || !hasImage) return;

        if (currentTool === 'pencil') {
            auxCtx.lineTo(x, y);
            auxCtx.stroke();
            refreshCanvas();
        } else {
            drawPreview(x, y);
        }
    }

    function handleMouseUp(e) {
        if (currentTool === 'text' && isDraggingText) {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            finishDragText(x, y);
            return;
        }

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

        auxCtx.strokeStyle = colorPicker.value;
        auxCtx.lineWidth = strokeWidth.value;

        switch (currentTool) {
            case 'line':
                auxCtx.beginPath();
                auxCtx.moveTo(startX, startY);
                auxCtx.lineTo(endX, endY);
                auxCtx.stroke();
                break;
            case 'rectangle':
                auxCtx.strokeRect(startX, startY, endX - startX, endY - startY);
                break;
            case 'circle':
                const radius = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
                auxCtx.beginPath();
                auxCtx.arc(startX, startY, radius, 0, Math.PI * 2);
                auxCtx.stroke();
                break;
        }

        refreshCanvas();
        isDrawing = false;
        hasChanges = true;
        initialImageData = null;
    }

    function drawPreview(endX, endY) {
        ctx.save();
        ctx.strokeStyle = colorPicker.value;
        ctx.lineWidth = strokeWidth.value;

        ctx.drawImage(auxCanvas, 0, 0);

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
    }

    function drawSelectionPreview(endX, endY) {
        if (!selectionStartPos) return;
        
        const x = Math.min(selectionStartPos.x, endX);
        const y = Math.min(selectionStartPos.y, endY);
        const w = Math.abs(endX - selectionStartPos.x);
        const h = Math.abs(endY - selectionStartPos.y);

        ctx.drawImage(auxCanvas, 0, 0);
        
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

        ctx.drawImage(auxCanvas, 0, 0);

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
        refreshCanvas();
    }

    function updateSelectionActions() {
        selectionActions.style.display = selection ? 'block' : 'none';
    }

    function cropSelection() {
        if (!selection) return;

        const imageData = auxCtx.getImageData(selection.x, selection.y, selection.w, selection.h);
        canvas.width = selection.w;
        canvas.height = selection.h;
        auxCanvas.width = selection.w;
        auxCanvas.height = selection.h;
        auxCtx.putImageData(imageData, 0, 0);
        ctx.drawImage(auxCanvas, 0, 0);

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

        const dataUrl = tempCanvas.toDataURL('image/png');

        fetch(dataUrl)
            .then(function(res) { return res.blob(); })
            .then(function(blob) {
                return navigator.clipboard.write([
                    new ClipboardItem({ 'image/png': blob })
                ]);
            })
            .catch(function(err) {
                var link = document.createElement('a');
                link.download = 'selection.png';
                link.href = dataUrl;
                link.click();
            });
    }

function startTextInput(x, y) {
        
        if (!hasImage) return;

        finishTextEditing();

        const wrapper = canvas.parentElement;
        
        textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.id = 'temp-text-input';
        textInput.placeholder = 'Escribe aquí...';
        textInput.style.position = 'absolute';
        textInput.style.left = (canvas.offsetLeft + x) + 'px';
        textInput.style.top = (canvas.offsetTop + y) + 'px';
        textInput.style.zIndex = '999';
        textInput.style.background = 'transparent';
        textInput.style.border = '1px dashed ' + colorPicker.value;
        textInput.style.color = colorPicker.value;
        textInput.style.fontSize = textSizeInput.value + 'px';
        
        wrapper.appendChild(textInput);
        
        setTimeout(function() {
            textInput.focus();
        }, 100);

        activeTextElement = {
            x: x,
            y: y,
            text: '',
            fontSize: parseInt(textSizeInput.value),
            color: colorPicker.value
        };

        isEditingText = true;

        textInput.addEventListener('blur', function(e) {
            setTimeout(function() {
                finishTextEditing();
                canvas.style.cursor = 'text';
            }, 100);
        });
    }

    function finishTextEditing() {
        if (textInput && textInput.value.trim()) {
            const text = textInput.value.trim();
            if (activeTextElement) {
                activeTextElement.text = text;
                textElements.push({ ...activeTextElement });
                hasChanges = true;
            }
            textInput.remove();
            textInput = null;
        } else if (textInput) {
            textInput.remove();
            textInput = null;
        }
        activeTextElement = null;
        isEditingText = false;
        
        refreshCanvas();
    }

    function getTextAtPosition(x, y) {
        for (let i = textElements.length - 1; i >= 0; i--) {
            const textEl = textElements[i];
            ctx.font = textEl.fontSize + 'px sans-serif';
            const metrics = ctx.measureText(textEl.text);
            const textWidth = metrics.width;
            const textHeight = textEl.fontSize;

            if (x >= textEl.x && x <= textEl.x + textWidth &&
                y >= textEl.y - textHeight && y <= textEl.y) {
                return textEl;
            }
        }
        return null;
    }

    function startDragText(x, y) {
        const textEl = getTextAtPosition(x, y);
        if (textEl) {
            isDraggingText = true;
            activeTextElement = textEl;
            textDragOffset = { x: x - textEl.x, y: y - textEl.y };
            return true;
        }
        return false;
    }

    function renderTextElements() {
        ctx.save();
        textElements.forEach(function(textEl) {
            ctx.font = textEl.fontSize + 'px sans-serif';
            ctx.fillStyle = textEl.color;
            ctx.fillText(textEl.text, textEl.x, textEl.y + textEl.fontSize);
        });
        ctx.restore();
    }

    function refreshCanvas() {
        ctx.drawImage(auxCanvas, 0, 0);
        renderTextElements();
    }

    function dragText(x, y) {
        if (!activeTextElement) return;

        const newX = x - textDragOffset.x;
        const newY = y - textDragOffset.y;

        ctx.drawImage(auxCanvas, 0, 0);

        textElements.forEach(function(textEl) {
            if (textEl === activeTextElement) {
                ctx.save();
                ctx.font = textEl.fontSize + 'px sans-serif';
                ctx.fillStyle = textEl.color;
                ctx.globalAlpha = 0.7;
                ctx.fillText(textEl.text, newX, newY + textEl.fontSize);
                ctx.restore();
            } else {
                ctx.font = textEl.fontSize + 'px sans-serif';
                ctx.fillStyle = textEl.color;
                ctx.fillText(textEl.text, textEl.x, textEl.y + textEl.fontSize);
            }
        });
    }

    function finishDragText(x, y) {
        if (!activeTextElement) return;

        const newX = x - textDragOffset.x;
        const newY = y - textDragOffset.y;

        const finalX = newX;
        const finalY = newY;
        const fontSize = activeTextElement.fontSize;
        const color = activeTextElement.color;
        const text = activeTextElement.text;

        activeTextElement.x = finalX;
        activeTextElement.y = finalY;
        hasChanges = true;

        isDraggingText = false;
        activeTextElement = null;

        refreshCanvas();
    }

    function editTextElement(textEl) {
        finishTextEditing();

        textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.value = textEl.text;
        textInput.className = 'text-input';
        textInput.style.position = 'absolute';
        textInput.style.left = (canvas.getBoundingClientRect().left + textEl.x) + 'px';
        textInput.style.top = (canvas.getBoundingClientRect().top + textEl.y - 10) + 'px';
        textInput.style.fontSize = textEl.fontSize + 'px';
        textInput.style.fontFamily = 'sans-serif';
        textInput.style.color = textEl.color;
        textInput.style.background = 'rgba(255,255,255,0.8)';
        textInput.style.border = '1px dashed ' + textEl.color;
        textInput.style.padding = '2px 5px';
        textInput.style.minWidth = '100px';
        textInput.style.outline = 'none';

        document.body.appendChild(textInput);
        textInput.focus();

        activeTextElement = { ...textEl, originalIndex: textElements.indexOf(textEl) };
        isEditingText = true;

        textInput.addEventListener('blur', function() {
            const text = textInput.value.trim();
            if (text && activeTextElement) {
                textEl.text = text;
                hasChanges = true;
            }
            textInput.remove();
            textInput = null;
            activeTextElement = null;
            isEditingText = false;
            renderTextElements();
        });
    }

    function deleteActiveText() {
        if (textInput) {
            textInput.remove();
            textInput = null;
        }
        activeTextElement = null;
        isEditingText = false;
    }

    function copyToClipboard() {
        if (!hasImage) return;

        canvas.toBlob(function(blob) {
            navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]).catch(function(err) {
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
            initCanvas();
            localStorage.removeItem('imageEditor_autosave');
        }
    }

    function handleTextDblClick(e) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const textEl = getTextAtPosition(x, y);
        if (textEl) {
            editTextElement(textEl);
        }
    }

    function handleKeyDown(e) {
        if (e.target.tagName === 'INPUT') return;

        if (e.ctrlKey && e.key.toLowerCase() === 'c' && selection) {
            e.preventDefault();
            copySelection();
            return;
        }

        if (e.ctrlKey && e.key.toLowerCase() === 'x' && selection) {
            e.preventDefault();
            cropSelection();
            return;
        }

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
            case 't':
                setTool('text');
                break;
            case 'escape':
                if (currentTool === 'text' && (isEditingText || activeTextElement)) {
                    deleteActiveText();
                } else {
                    clearSelection();
                    setTool('pencil');
                }
                break;
            case 'delete':
            case 'backspace':
                if (selection) {
                    cropSelection();
                }
                break;
        }
    }

    window.addEventListener('beforeunload', function() {
        if (hasImage && hasChanges) {
            saveToAutoSave();
        }
    });

    init();
})();