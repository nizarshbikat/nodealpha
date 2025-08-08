jQuery.event.special.touchstart = {
    setup: function(_, ns, handle) {
        this.addEventListener('touchstart', handle, { passive: !ns.includes('noPreventDefault') });
    }
};

jQuery.event.special.mousewheel = {
    setup: function(_, ns, handle) {
        this.addEventListener('mousewheel', handle, { passive: !ns.includes('noPreventDefault') });
    }
};

let graph;
let paper;
let currentNode = null;
let currentLine = null;
let startNode = null; 
let endNode = null;
let isGridVisible = false; 
let subCanvasStack = [];
let subCanvasStates = new Map();
let currentCanvas = 'main';
let hierarchicalDiagramWindow = null;
let copiedNode = null;
let lastPosition = { x: 100, y: 100 };
let currentTextElement = null;
let currentlyEditedEquation = null;
let restoreClicked = false;
let updatesMade = false;
let statsInterval;
let timerInterval;
let startTime;
let allowLinkCreation = false; // Flag to control link creation
let elapsedTime = 0;
let isTimerPaused = false;
const tableMappings = {}; 
let showExpression = false;
let globalEquations = {};
let dependencies = {};
let globalTables = {};
let nodeColors = {};
let autosaveEnabled = false;
let autosaveIntervalMinutes = 2;
let autosaveFolderHandle = null;
let autosaveFileHandle = null;
let autosaveTimer = null;
let autosaveSecondsLeft = 0;
let autosaveStatusInterval = null;
let editingTableWrapper = null;
let currentNoteNodeId = null;
const canvasLabels = new Map();
let backgroundMode = 'cover';
const originalConsoleError = console.error;
const functionsList = [
    'sqrt()', 'pow()', 'exp()', 'log()', 'log10()', 'log2()', 'ceil()', 'floor()', 'round()', 'mean()', 'median()', 'mode()', 'std()', 'var()', 'sum()', 'prod()', 'min()', 'max()', 'quantileSeq()', 'random()', 'randomInt()', 'pickRandom()', 'randomSeed()'
];


document.addEventListener('DOMContentLoaded', function() {
    graph = new joint.dia.Graph();

    paper = new joint.dia.Paper({
        el: document.getElementById('paper'),
        model: graph,
        width: '100%',
        height: '100%',
        gridSize: 1,
        drawGrid: false,
        interactive: function(cellView) {
    const model = cellView.model;
    if (model.isElement() && model.prop('locked')) {
        return { elementMove: false };
    }
    return true;
},
        background: {
            color: 'white'
        }
    });

const svgElement = document.querySelector('svg');
    let defs = svgElement.querySelector('defs');
    if (!defs) {
        defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        svgElement.insertBefore(defs, svgElement.firstChild);
    }

    const bottomContainer = document.getElementById('bottomContainer');
    for (let i = 1; i <= 52; i++) {
        const icon = document.createElement('img');
        icon.src = `Icon/icon${i}.png`;
        icon.alt = `icon${i}`;
        icon.draggable = true;
        icon.addEventListener('dragstart', function(event) {
            event.dataTransfer.setData('text/plain', icon.src);
        });
        bottomContainer.appendChild(icon);
    }

updateAutosaveStatusOff();

document.getElementById('hierarchicalDiagramButton').addEventListener('click', function () {
    if (!hierarchicalDiagramWindow || hierarchicalDiagramWindow.closed) {
        hierarchicalDiagramWindow = window.open('', '', 'width=800,height=600');
        hierarchicalDiagramWindow.document.write(`
            <html>
                <head>
                    <title>Nodes Hierarchical Diagram</title>
                    <script src="https://d3js.org/d3.v7.min.js"></script>
                    <style>
                        .link {
                            fill: none;
                            stroke: #555;
                            stroke-width: 1.5px;
                        }
                        .node circle {
                            fill: #999;
                            stroke: steelblue;
                            stroke-width: 1.5px;
                        }
                        .node text {
                            font: 10px sans-serif;
                        }
                    </style>
                </head>
                <body>
                    <div id="hierarchicalGraph"></div>
                    <script>
                        ${generateHierarchicalGraphData.toString()}
                        ${renderHierarchicalGraph.toString()}

                        // Generate and render the graph
                        const graphData = ${JSON.stringify(generateHierarchicalGraphData())};
                        renderHierarchicalGraph(graphData);

                        // Add a global function to refresh the diagram
                        function updateHierarchicalGraph(data) {
                            document.getElementById('hierarchicalGraph').innerHTML = ''; // Clear the container
                            renderHierarchicalGraph(data); // Re-render
                        }
                    </script>
                </body>
            </html>
        `);
    } else {
        hierarchicalDiagramWindow.focus();
        const updatedGraphData = generateHierarchicalGraphData();
        hierarchicalDiagramWindow.updateHierarchicalGraph(updatedGraphData);
    }
});


graph.on('add', function() {
    updateHierarchicalGraph();
});

addMouseWheelZoom();
addPanning();

    document.getElementById('paper').addEventListener('drop', handleIconDrop);
    document.getElementById('paper').addEventListener('dragover', function(event) {
        event.preventDefault();
    });

document.getElementById('colorPicker').addEventListener('change', handleDrawnLineColorChange);

paper.on('link:contextmenu', function(linkView, evt) {
    evt.preventDefault();
    currentLine = linkView.model;
    
    if (currentLine.attr('line/type') === 'drawn') {
        const lineContextMenu = document.getElementById('lineContextMenu');
        lineContextMenu.style.top = `${evt.clientY}px`;
        lineContextMenu.style.left = `${evt.clientX}px`;
        lineContextMenu.style.display = 'block';
    }
});

paper.on('element:contextmenu', function (elementView, evt) {
    evt.preventDefault();
    if (elementView.model instanceof joint.shapes.standard.Rectangle && elementView.model.attr('label/text')) {
        currentTextElement = elementView.model;
        showTextContextMenu(evt.clientX, evt.clientY); // This is for a text-specific context menu
    } else {
        currentNode = elementView.model;
        if (!currentNode.tables) {
            currentNode.tables = [];
        }

        displayTablesForNode();
        showContextMenu(evt.clientX, evt.clientY, 'contextMenu'); // Explicitly pass 'contextMenu' as menuId
    }
});

paper.on('element:contextmenu', function (elementView, evt) {
    evt.preventDefault(); // Prevent default browser context menu
        if (elementView.model instanceof joint.shapes.standard.Rectangle && elementView.model.attr('label/text')) {
        currentTextElement = elementView.model;
        showTextContextMenu(evt.clientX, evt.clientY); // This is for a text-specific context menu
    } else {
        currentNode = elementView.model;
        if (!currentNode.tables) {
            currentNode.tables = [];
        }

        displayTablesForNode();
        showContextMenu(evt.clientX, evt.clientY, 'contextMenu'); // Explicitly pass 'contextMenu' as menuId
    }
});

document.addEventListener('keydown', function (event) {
    if (event.key === 'F9') {
        regenerateRandomFunctions();
    }
});

document.addEventListener('keydown', function(event) {
    if (event.ctrlKey && event.key === 'a') {
        event.preventDefault();
        currentTextElement = null;
        clearTextPopup();
        toggleTextPopup();
    }
});
    document.getElementById('textPopup').style.display = 'none';

document.addEventListener('click', function(event) {
    if (!event.target.closest('.context-menu')) {
        document.getElementById('textContextMenu').style.display = 'none';
    }
});


document.addEventListener('keydown', pasteNode);


paper.on('element:pointerclick', function (elementView) {
    if (!startNode) {
        startNode = elementView.model;
    } else {
        if (startNode === elementView.model) {
            // Reset startNode if the same node is clicked
            startNode = null;
        } else {
            endNode = elementView.model;

            if (startNode && endNode) {
                // Prevent self-links explicitly
                if (startNode.id !== endNode.id) {
                    if (graph.getCell(startNode.id) && graph.getCell(endNode.id)) {
                        // Allow link creation explicitly
                        allowLinkCreation = true;

                        var lineColor = 'black';
                        var link = new joint.dia.Link({
                            source: { id: startNode.id },
                            target: { id: endNode.id },
                            attrs: {
                                '.connection': {
                                    stroke: lineColor,
                                    strokeWidth: 2
                                },
                                '.marker-target': {
                                    fill: lineColor,
                                    stroke: lineColor,
                                    d: 'M 10 -10 0 0 10 10 Z'
                                }
                            }
                        });
                        link.attr('line/type', 'drawn');
                        link.addTo(graph);

                        // Reset after link creation to prevent unintended links
                        allowLinkCreation = false;
                    }
                }
                // Reset startNode and endNode after each interaction
                startNode = null;
                endNode = null;
            }
        }
    }
});




document.addEventListener('click', function(event) {
        if (!event.target.closest('.context-menu')) {
            closeContextMenu();
        }
    });

paper.on('blank:contextmenu', function(evt, x, y) {
    evt.preventDefault();
    const blankContextMenu = document.getElementById('blankContextMenu');
    if (blankContextMenu) {
        blankContextMenu.style.top = `${evt.clientY}px`;
        blankContextMenu.style.left = `${evt.clientX}px`;
        blankContextMenu.style.display = 'block';
        blankContextMenu.dataset.x = x;
        blankContextMenu.dataset.y = y;
    }
});

   // Handling link pointer down and position change
paper.on('link:pointerdown', function(linkView, evt) {
    evt.stopPropagation();
    const link = linkView.model;

    link.on('change:position', function() {
        try {
            const source = link.get('source');
            const target = link.get('target');
            const delta = {
                x: target.x - source.x,
                y: target.y - source.y
            };

            // Translate the link based on the delta
            link.translate(delta.x, delta.y);

            // Update source and target positions accordingly
            link.set('source', { x: source.x - delta.x, y: source.y - delta.y });
            link.set('target', { x: target.x - delta.x, y: target.y - delta.y });

        } catch (error) {
            console.error('Error updating link position:', error);
        }
    });
});

// Passive event listeners for better performance
['touchstart', 'touchmove', 'mousewheel'].forEach(function(eventType) {
    paper.el.addEventListener(eventType, function() {}, { passive: true });
});

    document.getElementById('backButton').style.display = 'none';

const node1 = new joint.shapes.standard.Image({
    id: 'node1',
    position: { x: 50, y: 50 },
    size: { width: 60, height: 60 },
    attrs: {
        image: { 'xlink:href': 'path/to/icon.png', width: 60, height: 60 },
        label: { text: 'Node 1', fill: '#000000', refX: '50%', refY: -10, textAnchor: 'middle', yAlignment: 'middle' }
    },
    data: {
        constants: {},
        variables: {},
        equations: {}
    }
});

const node2 = new joint.shapes.standard.Image({
    id: 'node2',
    position: { x: 150, y: 50 },
    size: { width: 60, height: 60 },
    attrs: {
        image: { 'xlink:href': 'path/to/icon.png', width: 60, height: 60 },
        label: { text: 'Node 2', fill: '#000000', refX: '50%', refY: -10, textAnchor: 'middle', yAlignment: 'middle' }
    },
    data: {
        constants: {},
        variables: {},
        equations: {}
    }
});

document.getElementById('equationInput').addEventListener('blur', (event) => {
    setTimeout(() => {
        if (!document.getElementById('autocompleteContainer').contains(document.activeElement)) {
            hideSuggestions();
        }
    }, 100);
});

graph.getElements().forEach(element => {
    element.on('change:data', updateCardValues);
});

document.getElementById('statsButton').addEventListener('click', () => {
    const statsPanel = document.getElementById('statsPanel');
    if (statsPanel.style.display === 'none' || statsPanel.style.display === '') {
        updateStats();
        statsPanel.style.display = 'block';
        statsInterval = setInterval(updateStats, 1000);
    } else {
        statsPanel.style.display = 'none';
        clearInterval(statsInterval);
    }
});

document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' || event.key === 'Esc') { // 'Esc' for older browsers
        if (startNode) {
            console.log('Link mode cancelled by Escape key.');
            startNode = null;
            // Optionally, visually deselect the startNode
            event.preventDefault(); // Prevent any default Escape key behavior
        }
    }
});

document.getElementById('closeStatsButton').addEventListener('click', () => {
    document.getElementById('statsPanel').style.display = 'none';
    clearInterval(statsInterval);
});

graph.on('remove', (cell) => {
    if (cell.isElement()) {
        const cardContainer = document.querySelector(`.visualization-cards-container[data-id="${cell.id}"]`);
        if (cardContainer) {
            cardContainer.remove();
        }
    }
});



const updateFunctionButton = document.getElementById('updateFunctionButton');
    const newValueInput = document.getElementById('newValue');
    const functionSelect = document.getElementById('functionSelect');

    if (updateFunctionButton && newValueInput && functionSelect) {
        updateFunctionButton.addEventListener('click', () => {
            const selectedFunction = functionSelect.value.trim();
            const newValue = newValueInput.value.trim();

            if (globalEquations[selectedFunction]) {
                globalEquations[selectedFunction].expr = newValue;
                reEvaluateAllEquations();
            } else {
                console.error(`Equation ${selectedFunction} not found in global store`);
            }
        });
    } else {
        console.error("Element 'updateFunctionButton', 'newValue', or 'functionSelect' not found");
    }

if (currentCanvas !== 'main') {
    document.querySelector('.button[onclick="saveGraph()"]').disabled = true;
}

graph.on('remove', (cell) => {
    if (cell.isElement()) {
        removeAnimation(cell);
    }
});


document.getElementById('triggerCondition').addEventListener('change', function() {
    const triggerLogicContainer = document.getElementById('triggerLogicContainer');
    if (triggerLogicContainer) {
        triggerLogicContainer.style.display = this.checked ? 'block' : 'none';
    }
});

    const editLinePropertiesPopup = document.getElementById('editLinePropertiesPopup');
    makeElementDraggable(editLinePropertiesPopup);

    const editNodePropertiesPopup = document.getElementById('editNodePropertiesPopup');
    makeElementDraggable(editNodePropertiesPopup);

    const animationPopup = document.getElementById('animationPopup');
    makeElementDraggable(animationPopup);

document.getElementById('blankContextMenu').addEventListener('click', function(event) {
    if (event.target.matches('li')) {
        const x = parseFloat(this.dataset.x);
        const y = parseFloat(this.dataset.y);
        
        createLine(x, y);
    }

document.getElementById('toggleGridMenu').addEventListener('change', toggleGrid);

});

document.addEventListener('click', function(event) {
    const settingsMenu = document.getElementById('settingsMenu');
    const settingsButton = document.getElementById('settingsButton');
    if (settingsMenu.style.display === 'block' && !settingsMenu.contains(event.target) && !settingsButton.contains(event.target)) {
        settingsMenu.style.display = 'none';
    }
});

window.onclick = function(event) {
    const modal = document.getElementById('resizeModal');
    if (event.target == modal) {
        modal.style.display = 'none';
    }
}

document.addEventListener('dblclick', function(event) {
    const paperCoords = paper.clientToLocalPoint({ x: event.clientX, y: event.clientY });
    const element = paper.findViewsFromPoint(paperCoords)[0];
    if (element && element.model.isElement()) {
        openSubCanvas(element.model);
    }
});

document.getElementById('nodeInvisibleCheckbox').addEventListener('change', function() {
    if (currentNode) {
        const isChecked = this.checked;
        currentNode.attr('label/visibility', isChecked ? 'hidden' : 'visible');
        currentNode.findView(paper).render(); // Re-render the node
    }
});


document.getElementById('backButton').addEventListener('click', function() {
    // Save the current canvas state before switching
    const graphData = graph.toJSON();
    graphData.cells.forEach(cell => {
        const element = graph.getCell(cell.id);
        if (element && element.get('data')) {
            const data = element.get('data');
            cell.data = {
                ...data,
                tables: element.tables || [],
                animation: data.animation || {}
            };
        }
    });

    const canvasNodeColors = {};
graph.getElements().forEach(node => {
    if (nodeColors[node.id]) {
        canvasNodeColors[node.id] = nodeColors[node.id];
    }
});

subCanvasStates.set(currentCanvas, {
    graph: graphData,
    settings: getCurrentSettings(),
    visualizationCards: getVisualizationCardStates(),
    nodeColors: canvasNodeColors
});


    document.querySelectorAll('.visualization-cards-container').forEach(container => {
        container.style.display = 'none';
    });

    graph.getElements().forEach(element => {
        removeAnimation(element, 'appearText');
    });

    // If the stack is not empty, pop the last sub-canvas and go to it
    if (subCanvasStack.length > 0) {
        subCanvasStack.pop();
        currentCanvas = subCanvasStack.length > 0 ? subCanvasStack[subCanvasStack.length - 1] : 'main';
    } else {
        currentCanvas = 'main'; // Ensure we correctly set to "main" if stack is empty
    }

    // Update the breadcrumb correctly
    updateBreadcrumb();

    // Load the previous canvas state if it exists, otherwise reset
    if (subCanvasStates.has(currentCanvas)) {
        const canvasState = subCanvasStates.get(currentCanvas);
        graph.fromJSON(canvasState.graph);

        applySettings(canvasState.settings);

        // Restore tables and equations for all elements
        canvasState.graph.cells.forEach(cell => {
            const element = graph.getCell(cell.id);
            if (element && cell.data) {
                const cellData = cell.data;
                element.set('data', {
                    equations: cellData.equations || {},
                    visualize: cellData.visualize || {},
                    animation: cellData.animation || {}
                });
                element.tables = cellData.tables || [];
            }
        });

        restoreVisualizationCardStates(canvasState.visualizationCards);
    } else if (currentCanvas === 'main') {
        // Reset to the original main canvas state
        graph.clear();
        resetGraphAndSettings();
    }

    if (currentCanvas === 'main') {
        document.getElementById('backButton').style.display = 'none';
        document.querySelector('.button[onclick="saveGraph()"]').classList.remove('locked');
    }

    document.querySelectorAll(`.visualization-cards-container[data-id^="${currentCanvas}"]`).forEach(container => {
        container.style.display = 'block';
    });

    // Set currentNode to the first element of the graph or null if empty
    currentNode = graph.getElements().length > 0 ? graph.getElements()[0] : null;

    // Load tables and equations for the current node
    if (currentNode) {
        displayTablesForNode();
        loadEquationsEditorData(currentNode);
    }

    attachOrRemoveAnimations();
    updateNodeIndicators();
});


document.getElementById('instructionsButton').addEventListener('click', toggleInstructionsPopup);

window.onclick = function(event) {
    const instructionsPopup = document.getElementById('instructionsPopup');
    // Close the popup if the click is outside of it
    if (event.target !== instructionsPopup && !instructionsPopup.contains(event.target) && event.target.id !== 'instructionsButton') {
        instructionsPopup.style.display = 'none';
    }
}

document.getElementById('sensitivityButton').addEventListener('click', () => {
    const toolbar = document.getElementById('sensitivityToolbar');
    const functionSelect = document.getElementById('functionSelect');
    const newValue = document.getElementById('newValue');
    
    if (toolbar.style.display === 'none' || toolbar.style.display === '') {
        toolbar.style.display = 'flex';
        populateFunctionSelect();
        saveOriginalValues();
        restoreClicked = false;
        updatesMade = false;
        functionSelect.value = '';
        newValue.value = '';
    } else {
        toolbar.style.display = 'none';
    }
});

document.getElementById('functionSelect').addEventListener('change', updateSensitivityAnalysisView);

document.getElementById('updateFunctionButton').addEventListener('click', updateFunction);

document.getElementById('restoreValuesButton').addEventListener('click', function() {
    for (const [name, equationObj] of Object.entries(globalEquations)) {
        if (equationObj.originalExpr) {
            equationObj.expr = equationObj.originalExpr;
        }
        if (equationObj.originalValue) {
            equationObj.value = equationObj.originalValue;
        }
    }

    restoreOriginalValues();
    reEvaluateAllEquations();
    updateSensitivityAnalysisView();
    updateFunction();
});

document.getElementById('resetZoomButton').addEventListener('click', () => {
    paper.scale(1, 1);
    updateStats();
});

document.getElementById('startTimerButton').addEventListener('click', startTimer);
document.getElementById('pauseTimerButton').addEventListener('click', pauseTimer);
document.getElementById('resumeTimerButton').addEventListener('click', resumeTimer);
document.getElementById('resetTimerButton').addEventListener('click', resetTimer);

document.getElementById('createTableButton').addEventListener('click', toggleTableCreationPopup);
document.getElementById('createTableButtonPopup').addEventListener('click', createTable);
document.getElementById('saveTableButton').addEventListener('click', saveTable);

console.error = function(message) {
    showErrorPopup(message);
    originalConsoleError.apply(console, arguments);
};

document.getElementById('viewGlobalEquationsIcon').addEventListener('click', showGlobalEquationsSpecial);

document.querySelector('#globalEquationsModalSpecial .close-special').addEventListener('click', function() {
    const modal = document.getElementById('globalEquationsModalSpecial');
    modal.style.display = 'none';
});
window.addEventListener('click', function(event) {
    const modal = document.getElementById('globalEquationsModalSpecial');
    if (event.target == modal) {
        modal.style.display = 'none';
    }
});

    const breadcrumb = document.getElementById('canvasBreadcrumb');
    const leftArrow = document.getElementById('breadcrumbLeftArrow');
    const rightArrow = document.getElementById('breadcrumbRightArrow');

    function scrollBreadcrumb(direction) {
        const scrollAmount = 50; // Pixels to scroll per click
        breadcrumb.scrollBy({
            left: direction === 'left' ? -scrollAmount : scrollAmount,
            behavior: 'smooth'
        });
    }

    leftArrow.addEventListener('click', function () {
        scrollBreadcrumb('left');
    });

    rightArrow.addEventListener('click', function () {
        scrollBreadcrumb('right');
    });

    updateBreadcrumb(); // Initialize with "Main Canvas"

paper.on('link:contextmenu', function (linkView, evt) {
    evt.preventDefault(); // Prevent default browser context menu
    showContextMenu(evt.clientX, evt.clientY, 'lineContextMenu'); // Pass the line context menu ID
});

window.addEventListener('message', function(event) {
    if (event.data?.type === 'focus-node') {
        const { nodeId, canvasId } = event.data;

        resetToMainCanvasDirectly().then(() => {
            // ✅ Check if the node is in the main canvas
            const nodeInMain = subCanvasStates.has('main') && (() => {
                const mainState = subCanvasStates.get('main');
                const mainGraph = new joint.dia.Graph();
                mainGraph.fromJSON(mainState.graph);
                return mainGraph.getCell(nodeId);
            })();

            if (nodeInMain) {
                // ✅ Fully reset to main canvas context
                subCanvasStack.length = 0;
                currentCanvas = 'main';

                const mainState = subCanvasStates.get('main');
                graph.fromJSON(mainState.graph);  // Load real graph
                paper.translate(0, 0);            // Optional: center the paper
                updateBreadcrumb();               // Fix breadcrumb

                setTimeout(() => {
                    const node = graph.getCell(nodeId);
                    if (node) focusOnElement(node);
                }, 300);

                return;
            }

            // 🔍 Find canvas path for subcanvas navigation
            const visited = new Set();
            const path = [];
            const found = findCanvasPath(canvasId, visited, path);

            if (found) {
                path.reverse(); // main → sub → sub...

                let delay = 0;
                path.forEach((canvasStepId, index) => {
                    const isLastStep = index === path.length - 1;

                    setTimeout(() => {
                        const node = graph.getCell(canvasStepId);
                        if (!node) return;

                        openSubCanvas(node);

                        if (isLastStep) {
                            setTimeout(() => {
                                const targetNode = graph.getCell(nodeId);
                                if (targetNode) focusOnElement(targetNode);
                            }, 300);
                        }
                    }, delay);
                    delay += 400;
                });
            } else {
                console.error("❌ Could not find path to canvas:", canvasId);
            }
        });
    }
});



// Save label text when user edits it
document.getElementById('canvasLabelBox').addEventListener('input', function () {
    canvasLabels.set(currentCanvas, this.innerText);
});









});

function toggleCanvasLabel() {
    const checkbox = document.getElementById('toggleCanvasLabel');
    const labelBox = document.getElementById('canvasLabelBox');

    if (checkbox.checked) {
        const text = canvasLabels.get(currentCanvas) || 'Untitled Canvas';
        labelBox.innerText = text;
        labelBox.style.display = 'block';
    } else {
        canvasLabels.set(currentCanvas, labelBox.innerText);
        labelBox.style.display = 'none';
    }
}

function resetToMainCanvasDirectly() {
applyCanvasLabelVisibility();
    return new Promise((resolve) => {
        // 🧹 Clear navigation stack
        subCanvasStack.length = 0;
        currentCanvas = 'main';

        // ✅ Load main canvas graph
        if (subCanvasStates.has('main')) {
            const mainState = subCanvasStates.get('main');
            graph.fromJSON(mainState.graph);
            applySettings(mainState.settings);
            restoreVisualizationCardStates(mainState.visualizationCards);

            // 🟢 Make UI consistent
            document.getElementById('backButton').style.display = 'none';
            document.querySelector('.button[onclick="saveGraph()"]').classList.remove('locked');
        }

        updateBreadcrumb();
        paper.translate(0, 0); // Optional: reset view
        setTimeout(resolve, 300);
    });
}




function navigateToNode(canvasId, nodeId) {
    // Case 1: Go to main canvas
    if (canvasId === 'main') {
        resetToMainCanvas();
        setTimeout(() => {
            const target = graph.getCell(nodeId);
            if (target) centerPaperOnNode(target);
        }, 300);
        return;
    }

    // Case 2: Already on the target canvas
    if (canvasId === currentCanvas) {
        const target = graph.getCell(nodeId);
        if (target) centerPaperOnNode(target);
        return;
    }

    // Case 3: Navigate to a subcanvas through a path
    const visited = new Set();
    const path = [];
    const found = findCanvasPath(canvasId, visited, path);

    if (!found) {
        console.error("No path to canvas:", canvasId);
        return;
    }

    // Always reset to main before traversing
    resetToMainCanvas();
    path.reverse();

    let delay = 0;
    path.forEach((stepCanvasId, index) => {
        setTimeout(() => {
            const parentNode = graph.getCell(stepCanvasId);
            if (parentNode) {
                openSubCanvas(parentNode);

                // Final step: focus the node
                if (index === path.length - 1) {
                    setTimeout(() => {
                        const target = graph.getCell(nodeId);
                        if (target) centerPaperOnNode(target);
                    }, 300);
                }
            }
        }, delay);
        delay += 400;
    });
}



function findCanvasPath(targetCanvasId, visited = new Set(), path = []) {
    for (const [canvasId, state] of subCanvasStates.entries()) {
        if (visited.has(canvasId)) continue;
        visited.add(canvasId);

        const graphTemp = new joint.dia.Graph();
        graphTemp.fromJSON(state.graph);

        for (const el of graphTemp.getElements()) {
            if (el.id === targetCanvasId) {
                path.push(canvasId); // parent of target
                path.push(targetCanvasId); // the target canvasId itself
                return true;
            }

            if (el.get('type') !== 'standard.Rectangle') {
                const subId = el.id;
                if (subCanvasStates.has(subId)) {
                    const found = findCanvasPath(targetCanvasId, visited, path);
                    if (found) {
                        path.push(canvasId); // go up through each parent
                        return true;
                    }
                }
            }
        }
    }

    return false;
}


function centerPaperOnNode(node) {
    if (!node || !paper) return;
    const paperSize = paper.getComputedSize();
    const bbox = node.getBBox();
    const centerX = bbox.x + bbox.width / 2;
    const centerY = bbox.y + bbox.height / 2;
    const offsetX = (paperSize.width / 2) - centerX;
    const offsetY = (paperSize.height / 2) - centerY;
    paper.translate(offsetX, offsetY);
}



function closeContextMenu() {
    document.getElementById('contextMenu').style.display = 'none';
    document.getElementById('lineContextMenu').style.display = 'none';
    const blankContextMenu = document.getElementById('blankContextMenu');
    if (blankContextMenu) {
        blankContextMenu.style.display = 'none';
    }
}

function changeNodeName() {
    const newName = prompt('Enter new name for the node:');
    if (newName && currentNode) {
        const oldName = currentNode.attr('label/text');
        currentNode.attr('label/text', newName);

        // Update breadcrumb if the name is in the stack
        const index = subCanvasStack.indexOf(oldName);
        if (index !== -1) {
            subCanvasStack[index] = newName;
            updateBreadcrumb(); // Refresh breadcrumb with the new name
        }
    }
    closeContextMenu();
}

function uploadNodeImage() {
    if (currentNode) {
        document.getElementById('imageUpload').click();
    }
    closeContextMenu();
}

function handleImageUpload(event) {
    const file = event.target.files[0];
    if (file && currentNode) {
        const reader = new FileReader();
        reader.onload = function(e) {
            currentNode.attr({
                image: {
                    'xlink:href': e.target.result
                }
            });
        };
        reader.readAsDataURL(file);
    }
}

function deleteNode() {
    if (currentNode) {
        const nodeId = currentNode.id;

        // Remove all links connected to the node
        const connectedLinks = graph.getConnectedLinks(currentNode);
        connectedLinks.forEach(link => link.remove());

        // Remove subcanvas states if the node has a subcanvas
        if (subCanvasStates.has(nodeId)) {
            subCanvasStates.delete(nodeId);
            console.log(`Deleted subcanvas state for node ID: ${nodeId}`);
        }

        // Remove node-specific tables and data
        if (currentNode.tables) {
            currentNode.tables.forEach(table => {
                const tableName = table.name;
                if (globalTables[tableName]) {
                    delete globalTables[tableName];
                    console.log(`Deleted table: ${tableName}`);
                }
            });
        }

        // Remove node-specific equations
        const nodeData = currentNode.get('data') || {};
        if (nodeData.equations) {
            Object.keys(nodeData.equations).forEach(equationName => {
                deleteEquation(equationName);
                console.log(`Deleted equation: ${equationName}`);
            });
        }

        // Remove the node
        currentNode.remove();
        currentNode = null;
    }

    // Update indicators and close the context menu
    updateNodeIndicators();
    closeContextMenu();

    console.log("Node and associated subcanvas deleted successfully.");
}


function toggleGrid() {
    const checkbox = document.getElementById('toggleGridMenu');
    isGridVisible = checkbox.checked;
    toggleGridVisibility();
}

function toggleGridVisibility() {
    if (isGridVisible) {
        paper.options.drawGrid = true;
        paper.options.gridSize = 10;
        paper.drawGrid();
    } else {
        paper.options.drawGrid = false;
        paper.options.gridSize = 1;
        paper.clearGrid();
    }
}

function toggleSettingsMenu() {
    const settingsMenu = document.getElementById('settingsMenu');
    settingsMenu.style.display = settingsMenu.style.display === 'none' ? 'block' : 'none';
}

function changeCanvasBackgroundColor(event) {
    const color = event.target.value;
    document.getElementById('paper').style.backgroundColor = color;
}

function uploadCanvasBackgroundImage(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const canvasBackground = document.getElementById('paper');
                canvasBackground.style.backgroundImage = `url(${e.target.result})`;
                applyBackgroundMode(); 
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

function changeBackgroundMode(event) {
    backgroundMode = event.target.value;
    applyBackgroundMode();
}

function applyBackgroundMode() {
    const canvasBackground = document.getElementById('paper');
    if (backgroundMode === 'cover') {
        canvasBackground.style.backgroundSize = 'cover';
        canvasBackground.style.backgroundPosition = 'center';
        canvasBackground.style.backgroundRepeat = 'no-repeat';
    } else if (backgroundMode === 'center') {
        canvasBackground.style.backgroundSize = 'auto';
        canvasBackground.style.backgroundPosition = 'center';
        canvasBackground.style.backgroundRepeat = 'no-repeat';
    }
}

function setDefaultBackground() {
    const canvasBackground = document.getElementById('paper');
    canvasBackground.style.backgroundImage = 'none';
    canvasBackground.style.backgroundColor = 'white';
}

async function saveGraph(isAutosave = false) {
    // First, store the current graph state into subCanvasStates using currentCanvas
    const graphData = graph.toJSON();
    graphData.cells.forEach(cell => {
        const element = graph.getCell(cell.id);
        if (element && element.get('data')) {
            const data = element.get('data');
            cell.data = {
                ...data,
                tables: element.tables || [],
                animation: data.animation || {}
            };
        }
    });

    const canvasNodeColors = {};
    graph.getElements().forEach(node => {
        if (nodeColors[node.id]) {
            canvasNodeColors[node.id] = nodeColors[node.id];
        }
    });

    subCanvasStates.set(currentCanvas, {
        graph: graphData,
        settings: getCurrentSettings(),
        visualizationCards: getVisualizationCardStates(),
        nodeColors: canvasNodeColors
    });

    // Prepare final data with mainCanvas pulled from subCanvasStates
    const data = {
        mainCanvas: {
            graph: subCanvasStates.get('main')?.graph || { cells: [] },
            settings: subCanvasStates.get('main')?.settings || {}
        },
        subCanvasStates: Array.from(subCanvasStates.entries()),
        global: {
            globalEquations,
            globalTables,
            nodeColors
        }
    };

    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });

    if (isAutosave && autosaveFileHandle) {
        const writable = await autosaveFileHandle.createWritable();
        await writable.write(JSON.stringify(data, null, 2));
        await writable.close();
        console.log("✅ Autosaved to file:", autosaveFileHandle.name, "at", new Date().toLocaleTimeString());
        return;
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '-');
    const fileName = `graph_${dateStr}_${timeStr}.json`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    updateNodeIndicators();
}



function uploadGraph(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const data = JSON.parse(e.target.result);

            // Load graph
            graph.fromJSON(data.mainCanvas.graph);

            // Restore tables and equation data
            data.mainCanvas.graph.cells.forEach(cell => {
                const element = graph.getCell(cell.id);
                if (element && cell.data) {
                    const cellData = cell.data;
                    element.set('data', {
                        equations: cellData.equations || {},
                        visualize: cellData.visualize || {},
                        animation: cellData.animation || {} 
                    });
                    element.tables = cellData.tables || [];
                }
            });

            // Restore settings and subcanvas
            applySettings(data.mainCanvas.settings);
            subCanvasStates = new Map(data.subCanvasStates);

            // Restore global state including nodeColors
            if (data.global) {
                globalEquations = data.global.globalEquations || {};
                globalTables = data.global.globalTables || {};
                nodeColors = data.global.nodeColors || {};
            }

            // ✅ Reapply user-defined node colors
            graph.getElements().forEach(node => {
                const color = nodeColors[node.id];
                if (color) {
                    const filterId = `filter-${node.id}`;
                    const svgNS = "http://www.w3.org/2000/svg";

                    const existingFilter = document.getElementById(filterId);
                    if (existingFilter) {
                        existingFilter.remove();
                    }

                    const filter = document.createElementNS(svgNS, "filter");
                    filter.setAttribute("id", filterId);

                    const colorMatrix = document.createElementNS(svgNS, "feColorMatrix");
                    colorMatrix.setAttribute("type", "matrix");
                    colorMatrix.setAttribute("values", `
                        0 0 0 0 ${parseInt(color.substr(1, 2), 16) / 255}
                        0 0 0 0 ${parseInt(color.substr(3, 2), 16) / 255}
                        0 0 0 0 ${parseInt(color.substr(5, 2), 16) / 255}
                        0 0 0 1 0
                    `);

                    filter.appendChild(colorMatrix);
                    document.querySelector('svg defs').appendChild(filter);

                    node.attr('image/filter', `url(#${filterId})`);
                    node.findView(paper).render();
                }
            });

            createVisualizationCards();
            displayTablesForNode();

            const elements = graph.getElements();
            currentNode = elements.length > 0 ? elements[0] : null;

            reEvaluateAllEquations();
            populateFunctionSelect();
            updateSensitivityAnalysisView();
            attachOrRemoveAnimations();
        };

        reader.readAsText(file);
    }

    updateNodeIndicators();
}

function applyCanvasLabelVisibility() {
    const checkbox = document.getElementById('toggleCanvasLabel');
    const labelBox = document.getElementById('canvasLabelBox');

    if (checkbox.checked) {
        labelBox.innerText = canvasLabels.get(currentCanvas) || 'Untitled Canvas';
        labelBox.style.display = 'block';
    } else {
        labelBox.style.display = 'none';
    }
}


function getCurrentSettings() {
    return {
 canvasLabel: canvasLabels.get(currentCanvas) || '',
        isGridVisible: isGridVisible,
        canvasBackground: {
            color: document.getElementById('paper').style.backgroundColor,
            image: document.getElementById('paper').style.backgroundImage,
            mode: backgroundMode
        },
        pan: paper.translate(),
        zoom: paper.scale()
    };
canvasLabel: canvasLabels.get(currentCanvas) || ''
}

function applySettings(settings) {
    isGridVisible = settings.isGridVisible;
    const checkbox = document.getElementById('toggleGridMenu');
    checkbox.checked = isGridVisible;
    
    const canvasBackground = document.getElementById('paper');
    canvasBackground.style.backgroundImage = settings.canvasBackground.image;
    backgroundMode = settings.canvasBackground.mode;
    applyBackgroundMode();

    if (settings.canvasBackground.color) {
        canvasBackground.style.backgroundColor = settings.canvasBackground.color;
    }

if (settings.canvasLabel !== undefined) {
    canvasLabels.set(currentCanvas, settings.canvasLabel);
    const checkbox = document.getElementById('toggleCanvasLabel');
    if (checkbox.checked) {
        document.getElementById('canvasLabelBox').innerText = settings.canvasLabel;
    }
}

    paper.translate(settings.pan.tx, settings.pan.ty);
    paper.scale(settings.zoom.sx, settings.zoom.sy);

    toggleGridVisibility();
}

function resetGraphAndSettings() {
    // Clear the graph
    graph.clear();

    // Reset grid visibility
    isGridVisible = false;
    const checkbox = document.getElementById('toggleGridMenu');
    checkbox.checked = isGridVisible;
    toggleGridVisibility();

    // Reset canvas background
    const canvasBackground = document.getElementById('paper');
    canvasBackground.style.backgroundImage = 'none';
    setDefaultBackground();

    // Clear global equations and tables
    globalEquations = {};
    globalTables = {};

    // Reset nodes and their properties
    currentNode = null;
    graph.getElements().forEach(node => {
        node.set('data', { equations: {}, visualize: {} });
        node.tables = [];
    });

    // Clear subcanvas states
    subCanvasStates.clear();
    subCanvasStack = [];
    currentCanvas = 'main';

    // Reset search field
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.value = '';
    }

    // Reset visualization cards
    const visualizationCards = document.querySelectorAll('.visualization-cards-container');
    visualizationCards.forEach(card => card.remove());

    // Reset settings menu
    applySettings({
        isGridVisible: false,
        canvasBackground: {
            color: 'white',
            image: 'none',
            mode: 'cover'
        },
        pan: { tx: 0, ty: 0 },
        zoom: { sx: 1, sy: 1 }
    });

    // Reset timer and stats
    resetTimer();
    clearInterval(statsInterval);
    document.getElementById('statsPanel').style.display = 'none';

    // Hide breadcrumbs and reset to main canvas
    updateBreadcrumb();
    document.getElementById('backButton').style.display = 'none';
    document.querySelector('.button[onclick="saveGraph()"]').classList.remove('locked');

    console.log('Graph and settings reset successfully.');
}



function resizeNode() {
    if (currentNode) {
        closeContextMenu();

        let resizePopup = document.getElementById('resizePopup');
        if (!resizePopup) {
            resizePopup = document.createElement('div');
            resizePopup.id = 'resizePopup';
            resizePopup.style.position = 'absolute';
            resizePopup.style.backgroundColor = '#f9f9f9';
            resizePopup.style.border = '1px solid #ccc';
            resizePopup.style.padding = '15px';
            resizePopup.style.borderRadius = '8px';
            resizePopup.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
            resizePopup.style.zIndex = '1000';
            resizePopup.style.display = 'none';
            document.body.appendChild(resizePopup);

            const resizeSlider = document.createElement('input');
            resizeSlider.type = 'range';
            resizeSlider.min = '10';     // 10%
            resizeSlider.max = '1000';   // 1000%
            resizeSlider.value = '100';  // default 100%
            resizeSlider.step = '10';
            resizeSlider.style.width = '100%';
            resizeSlider.style.margin = '10px 0';

            const resizeLabel = document.createElement('div');
            resizeLabel.textContent = `Size: 100%`;
            resizeLabel.style.textAlign = 'center';
            resizeLabel.style.marginBottom = '10px';
            resizeLabel.style.fontWeight = 'bold';

            const scaleLabels = document.createElement('div');
            scaleLabels.style.textAlign = 'center';
            scaleLabels.style.fontSize = '12px';
            scaleLabels.style.color = '#555';
            scaleLabels.textContent = `Range: 10% to 1000%`;

            const closeButton = document.createElement('button');
            closeButton.textContent = 'Close';
            closeButton.style.marginTop = '15px';
            closeButton.style.width = '100%';
            closeButton.style.padding = '8px';
            closeButton.style.border = 'none';
            closeButton.style.backgroundColor = '#007bff';
            closeButton.style.color = 'white';
            closeButton.style.borderRadius = '4px';
            closeButton.style.cursor = 'pointer';
            closeButton.style.fontWeight = 'bold';
            closeButton.onclick = function () {
                resizePopup.style.display = 'none';
            };
            closeButton.onmouseover = () => (closeButton.style.backgroundColor = '#0056b3');
            closeButton.onmouseout = () => (closeButton.style.backgroundColor = '#007bff');

            resizePopup.appendChild(resizeLabel);
            resizePopup.appendChild(resizeSlider);
            resizePopup.appendChild(scaleLabels);
            resizePopup.appendChild(closeButton);

            resizeSlider.addEventListener('input', function () {
                const scale = parseInt(this.value, 10) / 100;

                const originalWidth = currentNode.get('originalSize')?.width || currentNode.attributes.size.width || 60;
                const originalHeight = currentNode.get('originalSize')?.height || currentNode.attributes.size.height || 60;

                const newWidth = Math.max(10, originalWidth * scale);
                const newHeight = Math.max(10, originalHeight * scale);

                currentNode.resize(newWidth, newHeight);
                resizeLabel.textContent = `Size: ${this.value}%`;
            });
        }

        if (!currentNode.get('originalSize')) {
            currentNode.set('originalSize', {
                width: currentNode.attributes.size.width || 60,
                height: currentNode.attributes.size.height || 60
            });
        }

        resizePopup.querySelector('input[type="range"]').value = '100';
        resizePopup.querySelector('div').textContent = `Size: 100%`;

        const nodeView = paper.findViewByModel(currentNode);
        if (nodeView) {
            const nodeBBox = nodeView.getBBox();
            const nodeCenter = nodeBBox.center();
            resizePopup.style.left = `${nodeCenter.x + 20}px`;
            resizePopup.style.top = `${nodeCenter.y + 20}px`;
        }

        resizePopup.style.display = 'block';
    }
}





function applyNodeResize() {
    const newWidth = document.getElementById('nodeWidth').value;
    const newHeight = document.getElementById('nodeHeight').value;
    if (currentNode && newWidth && newHeight) {
        currentNode.resize(parseInt(newWidth), parseInt(newHeight));

        currentNode.attr({
            label: {
                refX: '50%',
                refY: -20,
                textAnchor: 'middle',
                yAlignment: 'middle'
            }
        });
updateNodeIndicators();
    }
}

function closeResizeModal() {
    document.getElementById('resizeModal').style.display = 'none';
}

function handleIconDrop(event) {
    event.preventDefault();
    const iconSrc = event.dataTransfer.getData('text/plain');
    const scale = paper.scale().sx;
    const paperPosition = paper.translate();
    const paperElement = paper.el;

    const paperBoundingBox = paperElement.getBoundingClientRect();

    const dropPosition = {
        x: (event.clientX - paperBoundingBox.left - paperPosition.tx) / scale,
        y: (event.clientY - paperBoundingBox.top - paperPosition.ty) / scale
    };

    const node = new joint.shapes.standard.Image({
        position: dropPosition,
        size: { width: 60, height: 60 },
        attrs: {
            image: {
                'xlink:href': iconSrc,
                width: 60,
                height: 60
            },
            label: {
                text: 'Node',
                fill: '#000000',
                refX: '50%',
                refY: -20,
                textAnchor: 'middle',
                yAlignment: 'middle'
            }
        }
    });

    node.tables = [];
    node.addTo(graph);
    currentNode = node;
    
}

function rotateNodeIcon() {
    if (currentNode) {
        // Close the context menu
        closeContextMenu();

        // Create a dedicated rotation slider popup (if it doesn't exist)
        let rotationPopup = document.getElementById('rotationPopup');
        if (!rotationPopup) {
            rotationPopup = document.createElement('div');
            rotationPopup.id = 'rotationPopup';
            rotationPopup.style.position = 'absolute';
            rotationPopup.style.backgroundColor = 'white';
            rotationPopup.style.border = '1px solid #ccc';
            rotationPopup.style.padding = '10px';
            rotationPopup.style.zIndex = '1000';
            rotationPopup.style.display = 'none';
            document.body.appendChild(rotationPopup);

            // Add a slider to the popup
            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = '0';
            slider.max = '360';
            slider.value = '0';
            slider.style.width = '100%';
            slider.style.marginTop = '10px';

            // Add a label for the slider
            const label = document.createElement('div');
            label.textContent = 'Rotation Angle: 0°';
            label.style.textAlign = 'center';
            label.style.marginBottom = '5px';

            // Add a close button
            const closeButton = document.createElement('button');
            closeButton.textContent = 'Close';
            closeButton.style.marginTop = '10px';
            closeButton.style.width = '100%';
            closeButton.onclick = function () {
                rotationPopup.style.display = 'none';
            };

            // Add elements to the popup
            rotationPopup.appendChild(label);
            rotationPopup.appendChild(slider);
            rotationPopup.appendChild(closeButton);

            // Add an event listener to the slider
            slider.addEventListener('input', function () {
                const angle = parseInt(this.value, 10);
                const center = {
                    x: currentNode.attributes.size.width / 2,
                    y: currentNode.attributes.size.height / 2
                };
                currentNode.attr('image/transform', `rotate(${angle} ${center.x} ${center.y})`);
                label.textContent = `Rotation Angle: ${angle}°`;
            });
        }

        // Set the slider value to the current rotation angle
        const currentRotation = currentNode.attr('image/transform') || 'rotate(0 0 0)';
        const angleMatch = currentRotation.match(/rotate\((\d+)\s([^\s]+)\s([^\s]+)\)/);
        const currentAngle = angleMatch ? parseInt(angleMatch[1], 10) : 0;
        rotationPopup.querySelector('input[type="range"]').value = currentAngle;
        rotationPopup.querySelector('div').textContent = `Rotation Angle: ${currentAngle}°`;

        // Position the popup near the node
        const nodeView = paper.findViewByModel(currentNode);
        if (nodeView) {
            const nodeBBox = nodeView.getBBox();
            const nodeCenter = nodeBBox.center();
            rotationPopup.style.left = `${nodeCenter.x + 20}px`;
            rotationPopup.style.top = `${nodeCenter.y + 20}px`;
        }

        // Show the rotation popup
        rotationPopup.style.display = 'block';
    }
}

// Map to store node IDs and their corresponding names
const nodeNamesMap = new Map();

function openSubCanvas(node) {
    // Save the current canvas state before switching
    const graphData = graph.toJSON();
    graphData.cells.forEach(cell => {
        const element = graph.getCell(cell.id);
        if (element && element.get('data')) {
            const data = element.get('data');
            cell.data = {
                ...data,
                tables: element.tables || [],
                animation: data.animation || {}
            };
        }
    });

    const canvasNodeColors = {};
graph.getElements().forEach(node => {
    if (nodeColors[node.id]) {
        canvasNodeColors[node.id] = nodeColors[node.id];
    }
});

subCanvasStates.set(currentCanvas, {
    graph: graphData,
    settings: getCurrentSettings(),
    visualizationCards: getVisualizationCardStates(),
    nodeColors: canvasNodeColors
});


    // Hide all visualization cards containers
    document.querySelectorAll('.visualization-cards-container').forEach(container => {
        container.style.display = 'none';
    });

    // Remove animations
    graph.getElements().forEach(element => {
        removeAnimation(element, 'appearText');
    });

    // Update the current canvas
    currentCanvas = node.id;
    const nodeName = node.attr('label/text') || 'Unnamed Node';

    // Store node name in the map
    nodeNamesMap.set(currentCanvas, nodeName);

    // Push the node ID onto the stack
    subCanvasStack.push(currentCanvas);

    // Update the breadcrumb
    updateBreadcrumb();
    updateNodeIndicators();

applyCanvasLabelVisibility();

    // Load the sub-canvas state if it exists, otherwise reset
    if (subCanvasStates.has(currentCanvas)) {
        const canvasState = subCanvasStates.get(currentCanvas);
        graph.fromJSON(canvasState.graph);
if (canvasState.nodeColors) {
    Object.entries(canvasState.nodeColors).forEach(([id, color]) => {
        nodeColors[id] = color;

        const node = graph.getCell(id);
        if (node) {
            const filterId = `filter-${id}`;
            const svgNS = "http://www.w3.org/2000/svg";

            const existingFilter = document.getElementById(filterId);
            if (existingFilter) {
                existingFilter.remove();
            }

            const filter = document.createElementNS(svgNS, "filter");
            filter.setAttribute("id", filterId);

            const colorMatrix = document.createElementNS(svgNS, "feColorMatrix");
            colorMatrix.setAttribute("type", "matrix");
            colorMatrix.setAttribute("values", `
                0 0 0 0 ${parseInt(color.substr(1, 2), 16) / 255}
                0 0 0 0 ${parseInt(color.substr(3, 2), 16) / 255}
                0 0 0 0 ${parseInt(color.substr(5, 2), 16) / 255}
                0 0 0 1 0
            `);
            filter.appendChild(colorMatrix);
            document.querySelector('svg defs').appendChild(filter);

            node.attr('image/filter', `url(#${filterId})`);
            node.findView(paper).render();
        }
    });
}


        applySettings(canvasState.settings);

        // Restore tables and equations for all elements
        canvasState.graph.cells.forEach(cell => {
            const element = graph.getCell(cell.id);
            if (element && cell.data) {
                const cellData = cell.data;
                element.set('data', {
                    equations: cellData.equations || {},
                    visualize: cellData.visualize || {},
                    animation: cellData.animation || {}
                });
                element.tables = cellData.tables || [];
            }
        });

        restoreVisualizationCardStates(canvasState.visualizationCards);
    } else {
        initializeNewSubCanvas();
    }

    // Ensure the currentNode is set to the new node
    currentNode = node;

    // Load tables and equations for the new node
    displayTablesForNode();
    loadEquationsEditorData(currentNode);

    document.getElementById('backButton').style.display = 'block';

    attachOrRemoveAnimations();
    updateNodeIndicators();
}

function initializeNewSubCanvas() {
    // Initialize a new sub-canvas with default settings
    graph.clear();  // Clears the current graph to start with an empty sub-canvas

    // Reset the default settings for the new sub-canvas
    isGridVisible = false;
    const checkbox = document.getElementById('toggleGridMenu');
    checkbox.checked = isGridVisible;
    toggleGridVisibility();

    const canvasBackground = document.getElementById('paper');
    canvasBackground.style.backgroundImage = 'none';
    setDefaultBackground();
}


 

function attachOrRemoveAnimations() {
    graph.getElements().forEach(element => {
        if (element.get('data').animation) {
            attachAnimation(element, 'appearText', true, element.id);
        }
    });
}


if (currentCanvas !== 'main') {
    document.querySelector('.button[onclick="saveGraph()"]').classList.add('locked');
} else {
    document.querySelector('.button[onclick="saveGraph()"]').classList.remove('locked');
}

function getVisualizationCardStates() {
    const states = [];
    document.querySelectorAll('.visualization-cards-container').forEach(container => {
        states.push({
            id: container.dataset.id,
            visible: container.style.display !== 'none'
        });
    });
    return states;
}

function restoreVisualizationCardStates(states) {
    createVisualizationCards();

    states.forEach(state => {
        const container = document.querySelector(`.visualization-cards-container[data-id="${state.id}"]`);
        if (container) {
            container.style.display = state.visible ? 'block' : 'none';
        }
    });
}

function changeDrawnLineColor() {
    document.getElementById('colorPicker').click();
}

function handleDrawnLineColorChange(event) {
    const color = event.target.value;
    if (currentLine && currentLine.attr('line/type') === 'drawn') {
        currentLine.attr({
            '.connection': {
                stroke: color
            },
            '.marker-target': {
                fill: color,
                stroke: color
            },
            '.marker-source': {
                fill: color,
                stroke: color
            }
        });
        currentLine.findView(paper).render();
    }
}

function changeDrawnLineType(style) {
    if (currentLine && currentLine.attr('line/type') === 'drawn') {
        const stroke = currentLine.attr('.connection/stroke') || 'black';
        let attrs = {
            '.connection': {
                stroke: stroke
            },
            '.marker-source': { display: 'none' },
            '.marker-target': { display: 'none' }
        };

        switch (style) {
            case 'dashed':
                attrs['.connection']['stroke-dasharray'] = '5,5';
                break;
            case 'dotted':
                attrs['.connection']['stroke-dasharray'] = '1,5';
                break;
            case 'solid':
                attrs['.connection']['stroke-dasharray'] = '';
                break;
            case 'arrow':
                attrs['.marker-target'] = {
                    type: 'path',
                    d: 'M 10 -5 0 0 10 5 Z',
                    fill: stroke,
                    stroke: stroke,
                    display: 'block'
                };
                break;
            case 'twoArrows':
                attrs['.marker-source'] = {
                    type: 'path',
                    d: 'M 10 -5 0 0 10 5 Z',
                    fill: stroke,
                    stroke: stroke,
                    display: 'block'
                };
                attrs['.marker-target'] = {
                    type: 'path',
                    d: 'M 10 -5 0 0 10 5 Z',
                    fill: stroke,
                    stroke: stroke,
                    display: 'block'
                };
                break;
        }

        currentLine.attr(attrs);
        currentLine.findView(paper).render();
        closeContextMenu();
    }
}

function deleteDrawnLine() {
    if (currentLine) {
        currentLine.remove();
        currentLine = null;
    }
    closeContextMenu();
}

function addMouseWheelZoom() {
    const paperElement = document.getElementById('paper');

    paperElement.addEventListener('wheel', function(event) {
        const backgroundImage = paperElement.style.backgroundImage;

        if (backgroundImage && backgroundImage !== 'none') {
            event.preventDefault();
            return;
        }

        removeAllAnimations();

        const delta = event.deltaY > 0 ? 0.9 : 1.1;
        const newScaleX = paper.scale().sx * delta;
        const newScaleY = paper.scale().sy * delta;
        paper.scale(newScaleX, newScaleY);

        toggleGridVisibility();

        event.preventDefault();

        clearTimeout(paper.zoomTimeout);
        paper.zoomTimeout = setTimeout(attachOrRemoveAnimations, 200);
    }, { passive: false });
}

function addPanning() {
    let isPanning = false;
    let lastMousePosition = { x: 0, y: 0 };

    paper.on('blank:pointerdown', function(evt) {
        isPanning = true;
        lastMousePosition = { x: evt.clientX, y: evt.clientY };

        removeAllAnimations();
    });

    paper.on('cell:pointerup blank:pointerup', function() {
        isPanning = false;

        attachOrRemoveAnimations();
    });

    paper.on('cell:pointermove blank:pointermove', function(evt) {
        if (isPanning) {
            const currentMousePosition = { x: evt.clientX, y: evt.clientY };
            const dx = currentMousePosition.x - lastMousePosition.x;
            const dy = currentMousePosition.y - lastMousePosition.y;
            const currentTranslate = paper.translate();
            paper.translate(currentTranslate.tx + dx, currentTranslate.ty + dy);
            lastMousePosition = currentMousePosition;
        }
    });
}

function updateHierarchicalGraph() {
    if (hierarchicalDiagramWindow) {
        const graphData = generateHierarchicalGraphData();
        hierarchicalDiagramWindow.renderHierarchicalGraph(graphData);
    }
}

function generateHierarchicalGraphData() {
    const addedCanvases = new Set();

    function createSubCanvasData(cell) {
        if (cell.isElement() && cell.get('type') !== 'standard.Rectangle') {
            const subCanvasId = cell.id;

            if (addedCanvases.has(subCanvasId)) return null;

            const subCanvasData = {
                name: cell.attr('label/text') || 'Unnamed Node',
                icon: cell.attr('image/xlink:href'),
                color: nodeColors[cell.id] || null,
                id: cell.id, // unique node ID
                canvasId: subCanvasId, // used for navigation
                children: []
            };

            addedCanvases.add(subCanvasId);

            if (subCanvasStates.has(subCanvasId)) {
                const subCanvasState = subCanvasStates.get(subCanvasId);
                const subGraph = new joint.dia.Graph();
                subGraph.fromJSON(subCanvasState.graph);

                subGraph.getCells().forEach(subCell => {
                    if (subCell.isElement() && subCell.get('type') !== 'standard.Rectangle') {
                        const childData = createSubCanvasData(subCell);
                        if (childData) subCanvasData.children.push(childData);
                    }
                });
            }

            return subCanvasData;
        }
    }

    const data = {
        name: 'Main Canvas',
        icon: 'path/to/main/icon.png',
        id: 'main',             // For main canvas
        canvasId: 'main',
        children: []
    };

    for (const [subCanvasId, subCanvasState] of subCanvasStates.entries()) {
        if (!addedCanvases.has(subCanvasId)) {
            const subGraph = new joint.dia.Graph();
            subGraph.fromJSON(subCanvasState.graph);

            subGraph.getCells().forEach(cell => {
                if (cell.isElement() && cell.get('type') !== 'standard.Rectangle') {
                    const canvasData = createSubCanvasData(cell);
                    if (canvasData) data.children.push(canvasData);
                }
            });
        }
    }

    return data;
}



function renderHierarchicalGraph(data, orientation = 'horizontal') {
    const container = document.getElementById('hierarchicalGraph');
    container.innerHTML = '';
    const padding = 50;

    const svg = d3.select(container).append('svg')
        .style('background-color', 'white')
        .attr('width', '100%')
        .attr('height', '100%');

    const defs = svg.append('defs');

    // Recursive function to add filters for each node
    function addColorFilters(node) {
        if (node.color && node.id) {
            const filter = defs.append('filter').attr('id', `filter-${node.id}`);

            const r = parseInt(node.color.substr(1, 2), 16) / 255;
            const g = parseInt(node.color.substr(3, 2), 16) / 255;
            const b = parseInt(node.color.substr(5, 2), 16) / 255;

            filter.append('feColorMatrix')
                .attr('type', 'matrix')
                .attr('values', `
                    0 0 0 0 ${r}
                    0 0 0 0 ${g}
                    0 0 0 0 ${b}
                    0 0 0 1 0
                `);
        }
        if (node.children) {
            node.children.forEach(addColorFilters);
        }
    }
    addColorFilters(data);

    const g = svg.append('g');
    const tree = d3.tree().nodeSize(orientation === 'horizontal' ? [50, 200] : [200, 50]);
    const hierarchyData = d3.hierarchy(data);
    const treeData = tree(hierarchyData);

    g.selectAll('.link')
        .data(treeData.links())
        .enter().append('path')
        .attr('class', 'link')
        .attr('d', d3.linkHorizontal()
            .x(d => orientation === 'horizontal' ? d.y : d.x)
            .y(d => orientation === 'horizontal' ? d.x : d.y))
        .attr('fill', 'none')
        .attr('stroke', '#555')
        .attr('stroke-width', 2);

    const node = g.selectAll('.node')
        .data(treeData.descendants())
        .enter().append('g')
        .attr('class', 'node')
        .attr('transform', d => `translate(${orientation === 'horizontal' ? d.y : d.x},${orientation === 'horizontal' ? d.x : d.y})`);

node.on('click', function(event, d) {
    const nodeId = d.data.id;
    const canvasId = d.data.canvasId;

    if (!nodeId || !canvasId || !window.opener) return;

    window.opener.postMessage({
        type: 'focus-node',
        nodeId: nodeId,
        canvasId: canvasId
    }, '*');
});


    // Main canvas circle
    node.filter(d => d.depth === 0)
        .append('circle')
        .attr('r', 20)
        .attr('fill', '#fff')
        .attr('stroke', 'steelblue')
        .attr('stroke-width', 3);

    node.filter(d => d.depth === 0).each(function(d) {
        const words = d.data.name.split(' ');
        const textElement = d3.select(this).append('text')
            .attr('x', 0)
            .attr('dy', -5)
            .style('text-anchor', 'middle')
            .style('font-size', '9px');

        words.forEach((word, index) => {
            textElement.append('tspan')
                .attr('x', 0)
                .attr('dy', index === 0 ? 0 : '1.2em')
                .text(word);
        });
    });

    // Icon with color filter
    node.filter(d => d.depth > 0 && d.data.icon)
        .append('image')
        .attr('href', d => d.data.icon)
        .attr('x', -15)
        .attr('y', -15)
        .attr('width', 30)
        .attr('height', 30)
        .attr('filter', d => d.data.color && d.data.id ? `url(#filter-${d.data.id})` : null);

    node.filter(d => d.depth > 0)
        .append('text')
        .attr('dy', 27)
        .attr('x', 0)
        .style('text-anchor', 'middle')
        .text(d => d.data.name);

    const bounds = g.node().getBBox();
    const width = bounds.width + padding * 2;
    const height = bounds.height + padding * 2;

    svg.attr('viewBox', `${bounds.x - padding} ${bounds.y - padding} ${width} ${height}`);
    svg.attr('preserveAspectRatio', 'xMidYMid meet');

    function ensureImagesLoaded() {
        return new Promise((resolve) => {
            const images = container.querySelectorAll('image');
            let loadedCount = 0;

            images.forEach((img) => {
                const tempImg = new Image();
                tempImg.src = img.getAttribute('href');
                tempImg.onload = tempImg.onerror = () => {
                    loadedCount++;
                    if (loadedCount === images.length) resolve();
                };
            });

            if (images.length === 0) resolve();
        });
    }

    d3.select(container).append('button')
        .text('Print Diagram')
        .style('position', 'absolute')
        .style('top', '10px')
        .style('left', '10px')
        .on('click', async () => {
            await ensureImagesLoaded();
            const svgElement = d3.select(container).select('svg').node();
            const svgString = new XMLSerializer().serializeToString(svgElement);
            const printWindow = window.open('', 'Print Diagram', 'width=1200,height=800');
            printWindow.document.write(`
                <html>
                    <head>
                        <title>Print Diagram</title>
                        <style>
                            body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; }
                            svg { width: 100%; height: 100%; }
                        </style>
                    </head>
                    <body>
                        ${svgString}
                    </body>
                </html>
            `);
            printWindow.document.close();
            printWindow.focus();
            printWindow.print();
        });

    d3.select(container).append('button')
        .text('Toggle Orientation')
        .style('position', 'absolute')
        .style('top', '10px')
        .style('left', '130px')
        .on('click', () => {
            const newOrientation = orientation === 'horizontal' ? 'vertical' : 'horizontal';
            renderHierarchicalGraph(data, newOrientation);
        });
}












function toggleInstructionsPopup() {
    const popup = document.getElementById('instructionsPopup');
    popup.style.display = popup.style.display === 'none' || popup.style.display === '' ? 'block' : 'none';
}

function editLineProperties() {
    if (currentLine) {
        document.getElementById('lineWidth').value = currentLine.attr('.connection/stroke-width') || 2;
        const label = currentLine.labels()[0] || {};
        document.getElementById('lineName').value = label.attrs?.text?.text || '';
        document.getElementById('lineFontSize').value = label.attrs?.text?.fontSize || 12;
        document.getElementById('lineFontColor').value = label.attrs?.text?.fill || '#000000';
        document.getElementById('lineFontBold').checked = label.attrs?.text?.fontWeight === 'bold';
        document.getElementById('lineFontType').value = label.attrs?.text?.fontFamily || 'Arial';
        document.getElementById('lineNameBackgroundColor').value = label.attrs?.rect?.fill || '#ffffff';
        document.getElementById('removeNameBackground').checked = label.attrs?.rect?.fill === 'transparent';
        
          toggleEditLinePropertiesPopup();
          closeContextMenu();
     }

}

function toggleEditLinePropertiesPopup() {
    const popup = document.getElementById('editLinePropertiesPopup');
    popup.style.display = popup.style.display === 'none' || popup.style.display === '' ? 'block' : 'none';
}

function createLine(x, y) {
    if (isNaN(x) || isNaN(y)) {
        console.error("Invalid coordinates received for creating line:", x, y);
        return;
    }

    const startPosition = { x: x, y: y };
    const endPosition = { x: x + 100, y: y + 100 };

    const arrowheadSize = 10;

    const line = new joint.dia.Link({
        source: { x: startPosition.x, y: startPosition.y },
        target: { x: endPosition.x, y: endPosition.y },
        attrs: {
            '.connection': {
                stroke: 'black',
                'stroke-width': 2
            },
           
        }
    });

    line.attr('line/type', 'drawn');
    graph.addCell(line);

    line.on('change:position', function() {
        const delta = {
            x: line.get('target').x - line.get('source').x,
            y: line.get('target').y - line.get('source').y
        };
        line.translate(delta.x, delta.y);
        line.set('source', { x: line.get('source').x - delta.x, y: line.get('source').y - delta.y });
        line.set('target', { x: line.get('target').x - delta.x, y: line.get('target').y - delta.y });
    });

    closeContextMenu();
}

function applyLineProperties() {
    if (currentLine) {
        const width = document.getElementById('lineWidth').value;
        const name = document.getElementById('lineName').value;
        const fontSize = document.getElementById('lineFontSize').value;
        const fontColor = document.getElementById('lineFontColor').value;
        const fontBold = document.getElementById('lineFontBold').checked;
        const fontType = document.getElementById('lineFontType').value;
        const removeBackground = document.getElementById('removeNameBackground').checked;
        const nameBackgroundColor = removeBackground ? 'transparent' : document.getElementById('lineNameBackgroundColor').value;

        const stroke = currentLine.attr('.connection/stroke') || 'black';
        const arrowheadSize = width * 2;

        const sourceArrowAttrs = currentLine.attr('.marker-source') || { display: 'none' };
        const targetArrowAttrs = currentLine.attr('.marker-target') || { display: 'none' };

        let attrs = {
            '.connection': {
                'stroke-width': width,
                stroke: stroke
            },
            '.marker-source': {
                ...sourceArrowAttrs,
                d: sourceArrowAttrs.display !== 'none' ? `M ${arrowheadSize} -${arrowheadSize / 2} 0 0 ${arrowheadSize} ${arrowheadSize / 2} Z` : '',
                transform: sourceArrowAttrs.display !== 'none' ? `rotate(0) translate(${arrowheadSize / 2}, 0)` : '',
                'stroke-width': width,
                display: sourceArrowAttrs.display
            },
            '.marker-target': {
                ...targetArrowAttrs,
                d: targetArrowAttrs.display !== 'none' ? `M ${arrowheadSize} -${arrowheadSize / 2} 0 0 ${arrowheadSize} ${arrowheadSize / 2} Z` : '',
                transform: targetArrowAttrs.display !== 'none' ? `rotate(180) translate(${arrowheadSize / 2}, 0)` : '',
                'stroke-width': width,
                display: targetArrowAttrs.display
            }
        };

        currentLine.attr(attrs);

        currentLine.label(0, {
            attrs: {
                text: {
                    text: name,
                    fontSize: fontSize,
                    fill: fontColor,
                    fontWeight: fontBold ? 'bold' : 'normal',
                    fontFamily: fontType
                },
                rect: {
                    fill: nameBackgroundColor
                }
            }
        });

        currentLine.findView(paper).render();
    }
    toggleEditLinePropertiesPopup();
}

function editNodeName() {
    if (currentNode) {
        const label = currentNode.attr('label') || {};
        document.getElementById('nodeName').value = label.text || '';
        document.getElementById('nodeFontSize').value = label.fontSize || 12;
        document.getElementById('nodeFontColor').value = label.fill || '#000000';
        document.getElementById('nodeFontBold').checked = label.fontWeight === 'bold';
        document.getElementById('nodeFontType').value = label.fontFamily || 'Arial';
        
        // Set the checkbox state
        const isInvisible = label.visibility === 'hidden';
        document.getElementById('nodeInvisibleCheckbox').checked = isInvisible;

        toggleEditNodePropertiesPopup();
        closeContextMenu();
    }
}


function toggleEditNodePropertiesPopup() {
    const popup = document.getElementById('editNodePropertiesPopup');
    popup.style.display = popup.style.display === 'none' || popup.style.display === '' ? 'block' : 'none';
}

function applyNodeProperties() {
    if (currentNode) {
        const name = document.getElementById('nodeName').value;
        const fontSize = parseInt(document.getElementById('nodeFontSize').value);
        const fontColor = document.getElementById('nodeFontColor').value;
        const fontBold = document.getElementById('nodeFontBold').checked;
        const fontType = document.getElementById('nodeFontType').value;
        const isInvisible = document.getElementById('nodeInvisibleCheckbox').checked;

        const labelPosition = -fontSize - 10;

        currentNode.attr({
            label: {
                text: name,
                fontSize: fontSize,
                fill: fontColor,
                fontWeight: fontBold ? 'bold' : 'normal',
                fontFamily: fontType,
                refY: labelPosition,
                textAnchor: 'middle',
                visibility: isInvisible ? 'hidden' : 'visible',
            }
        });

        currentNode.findView(paper).render();
    }
    toggleEditNodePropertiesPopup();
}



function changeNodeColor() {
    if (currentNode) {
        document.getElementById('nodeColorPicker').click();
    }
}

function applyNodeColorChange(event) {
    const color = event.target.value;
    if (currentNode) {
        const filterId = `filter-${currentNode.id}`;
        const svgNS = "http://www.w3.org/2000/svg";
        
        const existingFilter = document.getElementById(filterId);
        if (existingFilter) {
            existingFilter.remove();
        }

        const filter = document.createElementNS(svgNS, "filter");
        filter.setAttribute("id", filterId);
        const colorMatrix = document.createElementNS(svgNS, "feColorMatrix");
        colorMatrix.setAttribute("type", "matrix");
        colorMatrix.setAttribute("values", `
            0 0 0 0 ${parseInt(color.substr(1, 2), 16) / 255} 
            0 0 0 0 ${parseInt(color.substr(3, 2), 16) / 255} 
            0 0 0 0 ${parseInt(color.substr(5, 2), 16) / 255} 
            0 0 0 1 0
        `);
        filter.appendChild(colorMatrix);
        document.querySelector('svg defs').appendChild(filter);

        currentNode.attr({
            image: {
                filter: `url(#${filterId})`
            }
        });

        currentNode.findView(paper).render();

        // ✅ Store selected color for saving/uploading
        nodeColors[currentNode.id] = color;
    }
}




function showContextMenu(x, y, menuId) {
    const menu = document.getElementById(menuId); // Dynamically select the menu by ID
    if (!menu) {
        console.error(`Context menu with ID '${menuId}' not found.`);
        return; // Exit the function if the menu element is not found
    }

    const canvas = document.getElementById('paper'); // The canvas element
    const canvasRect = canvas.getBoundingClientRect(); // Canvas boundaries
    const menuRect = menu.getBoundingClientRect(); // Menu dimensions

    // Calculate constrained positions (clamp values to canvas boundaries)
    const left = Math.min(
        Math.max(x, canvasRect.left), // Ensure it doesn’t go outside the left edge
        canvasRect.right - menuRect.width // Ensure it doesn’t overflow the right edge
    );

    const top = Math.min(
        Math.max(y, canvasRect.top), // Ensure it doesn’t go outside the top edge
        canvasRect.bottom - menuRect.height // Ensure it doesn’t overflow the bottom edge
    );

    // Apply the constrained position
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.display = 'block'; // Make the menu visible
}

function copyNode() {
    if (currentNode) {
        copiedNode = currentNode.clone();
        
        document.getElementById('contextMenu').style.display = 'none';

        showCopyPopup(currentNode);
    } else {
        
    }
}

function pasteNode(event) {
    if (event.ctrlKey && event.key === 'v') {
        if (copiedNode) {
            const newNode = copiedNode.clone();
            newNode.translate(20, 20);
            graph.addCell(newNode);

            newNode.attr('body/stroke', 'none');
            newNode.findView(paper).unhighlight();
            currentNode = newNode;
        } else {
            
        }
    }
}

function stopPropagation(event) {
    event.stopPropagation();
}

function showCopyPopup(node) {
    const popup = document.getElementById('copyPopup');
    const nodePosition = node.position();
    const paperPosition = paper.el.getBoundingClientRect();
    popup.style.left = `${paperPosition.left + nodePosition.x}px`;
    popup.style.top = `${paperPosition.top + nodePosition.y - 80}px`;
    popup.style.display = 'block';
    setTimeout(() => {
        popup.style.display = 'none';
    }, 700);
}

function toggleTextPopup() {
    const textPopup = document.getElementById('textPopup');
    textPopup.style.display = textPopup.style.display === 'none' ? 'block' : 'none';
}

function applyTextProperties() {
    const textContent = document.getElementById('textContent').value;
    const fontSize = document.getElementById('fontSize').value + 'px';
    const fontColor = document.getElementById('fontColor').value;
    const fontType = document.getElementById('fontType').value;
    const borderLine = document.getElementById('borderLine').checked;
    const backgroundColor = document.getElementById('backgroundColor').value;
    const removeBackground = document.getElementById('removeBackground').checked;
    const bold = document.getElementById('bold').checked;
    const underline = document.getElementById('underline').checked;

    const fontWeight = bold ? 'bold' : 'normal';
    const textDecoration = underline ? 'underline' : 'none';
    const bgFill = removeBackground ? 'transparent' : backgroundColor;

    const textAttributes = {
        text: textContent,
        fill: fontColor,
        'font-size': fontSize,
        'font-family': fontType,
        'font-weight': fontWeight,
        'text-anchor': 'middle',
        'y': '50%',
        'dy': '0.35em'
    };

function getTextSize(text, fontSize, fontFamily) {
        const tempElement = document.createElement('div');
        tempElement.style.fontSize = fontSize;
        tempElement.style.fontFamily = fontFamily;
        tempElement.style.position = 'absolute';
        tempElement.style.whiteSpace = 'nowrap';
        tempElement.style.visibility = 'hidden';
        tempElement.innerText = text;
        document.body.appendChild(tempElement);
        const size = { width: tempElement.clientWidth, height: tempElement.clientHeight };
        document.body.removeChild(tempElement);
        return size;
    }

    const textSize = getTextSize(textContent, fontSize, fontType);
    const padding = 10;

    if (!currentTextElement) {
        lastPosition = { x: lastPosition.x + 20, y: lastPosition.y + 20 };

        currentTextElement = new joint.shapes.standard.Rectangle({
            position: lastPosition,
            size: { width: textSize.width + padding * 2, height: textSize.height + padding * 2 },
            attrs: {
                label: {
                    ...textAttributes,
                    refX: '50%',
                    refY: '50%',
                    textAnchor: 'middle',
                    yAlignment: 'middle',
                    textDecoration: textDecoration
                },
                body: {
                    stroke: borderLine ? 'black' : 'none',
                    fill: bgFill
                }
            }
        });
        graph.addCell(currentTextElement);
    } else {
        currentTextElement.resize(textSize.width + padding * 2, textSize.height + padding * 2);
        currentTextElement.attr({
            label: {
                ...textAttributes,
                refX: '50%',
                refY: '50%',
                textAnchor: 'middle',
                yAlignment: 'middle',
                textDecoration: textDecoration
            },
            body: {
                stroke: borderLine ? 'black' : 'none',
                fill: bgFill
            }
        });

        if (underline) {
            currentTextElement.attr('line/visibility', 'visible');
            const labelSize = currentTextElement.size();
            currentTextElement.attr('line', {
                x1: padding,
                y1: labelSize.height - padding,
                x2: labelSize.width - padding,
                y2: labelSize.height - padding,
                stroke: fontColor,
                strokeWidth: 2
            });
        } else {
            currentTextElement.attr('line/visibility', 'hidden');
        }
    }

    toggleTextPopup();
}

function showTextContextMenu(x, y) {
    const textContextMenu = document.getElementById('textContextMenu');
    textContextMenu.style.top = `${y}px`;
    textContextMenu.style.left = `${x}px`;
    textContextMenu.style.display = 'block';
}

function editText() {
    const label = currentTextElement.attr('label/text');
    const fontSize = parseInt(currentTextElement.attr('label/font-size'));
    const fontColor = currentTextElement.attr('label/fill');
    const fontType = currentTextElement.attr('label/font-family');
    const fontWeight = currentTextElement.attr('label/font-weight') === 'bold';
    const textDecoration = currentTextElement.attr('label/text-decoration') === 'underline';
    const borderLine = currentTextElement.attr('body/stroke') === 'black';
    const backgroundColor = currentTextElement.attr('body/fill');
    const removeBackground = backgroundColor === 'transparent';

    document.getElementById('textContent').value = label;
    document.getElementById('fontSize').value = fontSize;
    document.getElementById('fontColor').value = fontColor;
    document.getElementById('fontType').value = fontType;
    document.getElementById('bold').checked = fontWeight;
    document.getElementById('underline').checked = textDecoration;
    document.getElementById('borderLine').checked = borderLine;
    document.getElementById('backgroundColor').value = removeBackground ? '#FFFFFF' : backgroundColor;
    document.getElementById('removeBackground').checked = removeBackground;

    document.getElementById('textContextMenu').style.display = 'none';
    toggleTextPopup();
}

function clearTextPopup() {
    document.getElementById('textContent').value = '';
    document.getElementById('fontSize').value = '16';
    document.getElementById('fontColor').value = '#000000';
    document.getElementById('fontType').value = 'Arial';
    document.getElementById('bold').checked = false;
    document.getElementById('underline').checked = false;
    document.getElementById('borderLine').checked = false;
    document.getElementById('backgroundColor').value = '#FFFFFF';
}

function deleteText() {
    if (currentTextElement) {
        currentTextElement.remove();
        currentTextElement = null;
    }
    document.getElementById('textContextMenu').style.display = 'none';
}

function openEquationsEditor() {
     closeContextMenu();
     document.getElementById('equationPopup').style.display = 'block';
     loadEquationsEditorData(currentNode);
     makeElementDraggable(equationPopup);
}

function insertFunction(func) {
    const equationInput = document.getElementById('equationInput');
    equationInput.value += func;
    equationInput.focus();
}

function closeEquationPopup() {
    hideSuggestions();
    createVisualizationCards();
    document.getElementById('equationPopup').style.display = 'none';
}

function evaluateAllNodes() {
    const allData = { ...globalEquations };

    math.import({
        table: (tableName, rowIndex, columnTitle) => table(tableName, rowIndex, columnTitle)
    }, { override: true });

    graph.getElements().forEach(element => {
        const elementData = element.get('data') || { equations: {} };
        for (const name in elementData.equations) {
            try {
                const value = math.evaluate(elementData.equations[name].expr, allData);
                elementData.equations[name].value = value.toString();
                allData[name] = value;
                globalEquations[name].value = value.toString();
            } catch (error) {
                console.error(`Error evaluating expression: ${elementData.equations[name].expr}`, error);
                elementData.equations[name].value = 'Error: Undefined variable';
                globalEquations[name].value = 'Error: Undefined variable';
            }
        }
        element.set('data', elementData);
    });
}

function table(tableName, columnTitle, rowIndex) {
    if (!globalTables[tableName]) {
        throw new Error(`Table "${tableName}" not found`);
    }

    const table = globalTables[tableName];
    const parser = new DOMParser();
    const doc = parser.parseFromString(table.html, 'text/html');
    const tableElement = doc.querySelector('table');
    if (!tableElement) {
        throw new Error(`Table "${tableName}" is empty or invalid`);
    }

    const headers = Array.from(tableElement.querySelectorAll('th')).map(th => th.innerText);
    const rows = Array.from(tableElement.querySelectorAll('tr')).slice(1).map(tr => {
        const cells = Array.from(tr.querySelectorAll('td'));
        return headers.reduce((row, header, index) => {
            row[header] = cells[index] ? cells[index].innerText : null;
            return row;
        }, {});
    });

    const row = rows[rowIndex - 1];
    if (!row) {
        throw new Error(`Row "${rowIndex}" not found in table "${tableName}"`);
    }

    let value = row[columnTitle];
    if (value === undefined) {
        throw new Error(`Column "${columnTitle}" not found in table "${tableName}"`);
    }

    // Remove any non-numeric characters except for decimal points
    value = value.replace(/[^\d.-]/g, '');

    // Convert to a number if possible
    const numericValue = parseFloat(value);
    if (isNaN(numericValue)) {
        throw new Error(`Cannot convert value "${value}" in table "${tableName}" to a number`);
    }

    return numericValue;
}




function reEvaluateAllEquations() {
    const allData = {};

    // Convert all values to numbers if possible when setting up the context
    for (const [key, value] of Object.entries(globalEquations)) {
        const numericValue = parseFloat(value.expr);
        allData[key] = isNaN(numericValue) ? value.expr : numericValue;
    }

    math.import({
        if: function (condition, trueValue, falseValue) {
            return condition ? trueValue : falseValue;
        },
        table: table
    }, { override: true });

function evaluate(name) {
    const equationObj = globalEquations[name];
    if (!equationObj) return;

    try {
        // Ensure all values used in the evaluation are converted to numbers
        const context = {};
        Object.keys(allData).forEach(key => {
            let value = allData[key];
            if (typeof value === 'string') {
                value = parseFloat(value.replace(/[^\d.-]/g, ''));
            }
            context[key] = isNaN(value) ? allData[key] : value;
        });

        const value = math.evaluate(equationObj.expr, context);
        if (isNaN(value)) {
            throw new Error(`Result is NaN for expression: ${equationObj.expr}`);
        }

        globalEquations[name].value = value.toString();
        allData[name] = value;

        if (dependencies[name]) {
            dependencies[name].forEach(dependentName => evaluate(dependentName));
        }
    } catch (error) {
        console.error(`Error evaluating expression: ${equationObj.expr}`, error);
        globalEquations[name].value = 'Error: Undefined or invalid value';
    }
}


    for (const name in globalEquations) {
        evaluate(name);
    }

    graph.getElements().forEach(element => {
        const elementData = element.get('data') || { equations: {} };
        for (const name in elementData.equations) {
            if (globalEquations[name]) {
                elementData.equations[name].value = globalEquations[name].value;
            }
        }
        element.set('data', elementData);
    });

    subCanvasStates.forEach(canvasState => {
        const subGraph = new joint.dia.Graph();
        subGraph.fromJSON(canvasState.graph);
        subGraph.getElements().forEach(element => {
            const elementData = element.get('data') || { equations: {} };
            for (const name in elementData.equations) {
                if (globalEquations[name]) {
                    elementData.equations[name].value = globalEquations[name].value;
                }
            }
            element.set('data', elementData);
        });
        canvasState.graph = subGraph.toJSON();
    });

    if (currentNode) {
        loadEquationsEditorData(currentNode);
    }
    updateCardValues();
    attachOrRemoveAnimations();
}



function saveEquations() {
    const equationInput = document.getElementById('equationInput').value.trim();
    const equations = equationInput.split('\n');
    const nodeData = currentNode.get('data') || { equations: {}, visualize: {} };

    // Initialize nodeData if not present
    if (!nodeData.equations) {
        nodeData.equations = {};
    }
    if (!nodeData.visualize) {
        nodeData.visualize = {};
    }

    // Function to validate equation format
    function validateEquationFormat(equation) {
        const equationPattern = /^[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*.+$/;
        return equationPattern.test(equation);
    }

    for (const equation of equations) {
        if (equation.includes('=')) {
            const [name, expr] = equation.split('=').map(s => s.trim());

            // Validate equation format
            if (!validateEquationFormat(equation)) {
                alert(`Invalid equation format: ${equation}`);
                continue;
            }

            // Prevent overwriting existing global equations unless it is being edited
            if (globalEquations[name] && (!currentlyEditedEquation || currentlyEditedEquation !== name)) {
                alert(`Equation with the name "${name}" already exists. Please use a different name.`);
                continue;
            }

            // Handle editing of an existing equation
            if (currentlyEditedEquation && currentlyEditedEquation !== name) {
                deleteEquation(currentlyEditedEquation);
                currentlyEditedEquation = null;
            }

            // Store the equation in both the node's data and globally
            nodeData.equations[name] = { expr, value: null, originalExpr: expr, originalValue: null };
            globalEquations[name] = { expr, value: null, originalExpr: expr, originalValue: null };
        } else {
            alert(`Equation "${equation}" is missing an '=' operator. It will not be saved.`);
        }
    }

    // Save the updated node data
    currentNode.set('data', nodeData);

    // Re-evaluate equations and update dependencies
    updateDependencies();
    reEvaluateAllEquations();
}


function deleteEquation(equationName) {
    if (globalEquations.hasOwnProperty(equationName)) {
        delete globalEquations[equationName];

        graph.getElements().forEach(element => {
            const data = element.get('data');
            if (data && data.equations && data.equations.hasOwnProperty(equationName)) {
                delete data.equations[equationName];
                element.set('data', data);
            }

            if (data && data.animation && data.animation.selectedEquationId === equationName) {
                delete data.animation;
                element.set('data', data);
                removeAnimation(element, 'appearText');
            }
        });

        for (const [name, equation] of Object.entries(globalEquations)) {
            if (equation.expr.includes(equationName)) {
                deleteEquation(name);
            }
        }

        subCanvasStates.forEach(canvasState => {
            const subGraph = new joint.dia.Graph();
            subGraph.fromJSON(canvasState.graph);
            subGraph.getElements().forEach(element => {
                const elementData = element.get('data') || {};
                const animationData = elementData.animation;

                if (elementData.equations && elementData.equations.hasOwnProperty(equationName)) {
                    delete elementData.equations[equationName];
                    element.set('data', elementData);
                }

                if (animationData && animationData.selectedEquationId === equationName) {
                    delete elementData.animation;
                    element.set('data', elementData);
                    removeAnimation(element, 'appearText');
                }
            });
            canvasState.graph = subGraph.toJSON();
        });

        reEvaluateAllEquations();
    } else {
        console.warn(`Equation ${equationName} does not exist.`);
    }
}

function loadEquationsEditorData(node) {
    if (!node) {
        console.error("No current node selected");
        return;
    }

    const nodeData = node.get('data') || { equations: {}, visualize: {} };
    node.set('data', nodeData);

    const equationsTableBody = document.getElementById('equationsTable').querySelector('tbody');
    equationsTableBody.innerHTML = '';

    const uniqueEquations = new Set();

    for (const [name, equationObj] of Object.entries(nodeData.equations)) {
        if (!uniqueEquations.has(name)) {
            const displayValue = equationObj.value.startsWith('Error') ? equationObj.value : equationObj.value;
            const isVisualized = nodeData.visualize[name] ? 'checked' : '';
            const checkboxId = `toggleVisualize_${name}`;
            const checkboxName = `toggleVisualize_${name}`;

            equationsTableBody.innerHTML += `<tr>
                                                <td>${name}</td>
                                                <td>${equationObj.expr}</td>
                                                <td>${displayValue}</td>
                                                <td>
                                                    <button onclick="editEquation('${name}')">Edit</button>
                                                    <button onclick="deleteEquation('${name}')">Delete</button>
                                                </td>
                                                <td>
                                                    <input type="checkbox" id="${checkboxId}" name="${checkboxName}" ${isVisualized} onchange="toggleVisualize('${name}', this.checked)">
                                                </td>
                                              </tr>`;
            uniqueEquations.add(name);
        }
    }

    document.getElementById('equationInput').value = '';
}

function toggleVisualize(name, isChecked) {
    const nodeData = currentNode.get('data') || { visualize: {} };
    if (isChecked) {
        nodeData.visualize[name] = true;
    } else {
        delete nodeData.visualize[name];
    }
    currentNode.set('data', nodeData);

    subCanvasStates.set(currentCanvas, {
        graph: graph.toJSON(),
        settings: getCurrentSettings(),
        visualizationCards: getVisualizationCardStates()
    });

    createVisualizationCards();
}

function editEquation(name) {
    const nodeData = currentNode.get('data') || { equations: {} };
    const equation = nodeData.equations[name].expr;
    document.getElementById('equationInput').value = `${name} = ${equation}`;
    currentlyEditedEquation = name;
    hideSuggestions();
}

function evaluateEquations(node, allNodes) {
    const equations = node.get('data').equations;
    const data = node.get('data');

    for (const [variable, equation] of Object.entries(equations)) {
        try {
            const scope = { ...data };

            const equationWithReferences = equation.replace(/node(\d+)\.([a-zA-Z_]\w*)/g, (match, nodeId, varName) => {
                const refNode = allNodes.find(n => n.id === `node${nodeId}`);
                if (refNode) {
                    evaluateEquations(refNode, allNodes);
                    return refNode.get('data')[varName] || 0;
                }
                return 0;
            });

            const value = math.evaluate(equationWithReferences, scope);
            data[variable] = value;
        } catch (error) {
            console.error(`Error evaluating equation for ${variable}: ${equation}`, error);
        }
    }

    node.set('data', data);
}

function toggleFunctionsTable() {
    const functionsTableContainer = document.getElementById('functionsTableContainer');
    functionsTableContainer.style.display = functionsTableContainer.style.display === 'none' ? 'block' : 'none';
}

function getSuggestions(input) {
    const allSuggestionsSet = new Set();

    const nodeData = currentNode.get('data') || { equations: {} };
    for (const equationName in nodeData.equations) {
        allSuggestionsSet.add(equationName);
    }

    graph.getElements().forEach(element => {
        const elementData = element.get('data') || { equations: {} };
        for (const equationName in elementData.equations) {
            allSuggestionsSet.add(equationName);
        }
    });

    subCanvasStates.forEach(canvasState => {
        const subGraph = new joint.dia.Graph();
        subGraph.fromJSON(canvasState.graph);
        subGraph.getElements().forEach(element => {
            const elementData = element.get('data') || { equations: {} };
            for (const equationName in elementData.equations) {
                allSuggestionsSet.add(equationName);
            }
        });
    });

    functionsList.forEach(func => allSuggestionsSet.add(func));

    const allSuggestions = Array.from(allSuggestionsSet);
    return allSuggestions.filter(suggestion => suggestion.toLowerCase().startsWith(input.toLowerCase()));
}

function showSuggestions(event) {
    const input = event.target.value.split(/[^a-zA-Z0-9_]/).pop();
    const suggestionsContainer = document.getElementById('autocompleteContainer');
    suggestionsContainer.innerHTML = '';

    if (input) {
        const suggestions = getSuggestions(input);
        suggestions.forEach(suggestion => {
            const suggestionElement = document.createElement('div');
            suggestionElement.classList.add('autocomplete-suggestion');
            suggestionElement.innerText = suggestion;
            suggestionElement.onclick = (e) => {
                e.stopPropagation();
                addSuggestionToInput(suggestion);
            };
            suggestionsContainer.appendChild(suggestionElement);
        });
    }

    document.addEventListener('click', hideSuggestions);
}

function addSuggestionToInput(suggestion) {
    const equationInput = document.getElementById('equationInput');
    const currentValue = equationInput.value;
    const lastWord = currentValue.split(/[^a-zA-Z0-9_]/).pop();
    equationInput.value = currentValue.slice(0, -lastWord.length) + suggestion;
    equationInput.focus();
    hideSuggestions();
}

function hideSuggestions() {
    const suggestionsContainer = document.getElementById('autocompleteContainer');
    suggestionsContainer.innerHTML = '';
    document.removeEventListener('click', hideSuggestions);
}

function createVisualizationCards() {
    const allCardContainers = document.querySelectorAll('.visualization-cards-container');
    allCardContainers.forEach(container => container.remove());

    const updateCardPosition = (element, cardContainer) => {
        const view = paper.findViewByModel(element);
        if (view && view.el) {
            const bbox = view.el.getBoundingClientRect();
            
            cardContainer.style.position = 'absolute';
            cardContainer.style.top = `${bbox.bottom + window.scrollY + 10}px`;
            cardContainer.style.display = 'block';
            cardContainer.style.left = `${bbox.left + window.scrollX + (bbox.width / 2) - (cardContainer.offsetWidth / 2)}px`;
            cardContainer.style.display = '';
        }
    };

    const updateFontSizeAndCardSize = () => {
        const scale = paper.scale().sx;
        const fontSize = 12 * scale;
        document.querySelectorAll('.visualization-card').forEach(card => {
            card.style.fontSize = `${fontSize}px`;
            card.style.padding = `${2 * scale}px`;
            card.style.margin = `${2 * scale}px`;
            card.style.minWidth = `${50 * scale}px`;
            card.style.minHeight = `${15 * scale}px`;
        });
    };

    graph.getElements().forEach(element => {
        const elementData = element.get('data') || { equations: {}, visualize: {} };

        const cardContainer = document.createElement('div');
        cardContainer.classList.add('visualization-cards-container');
        cardContainer.dataset.id = element.id;

        const view = paper.findViewByModel(element);
        if (view && view.el) {
            document.body.appendChild(cardContainer);

            for (const [name, equationObj] of Object.entries(elementData.equations)) {
                if (elementData.visualize[name]) {
                    const card = document.createElement('div');
                    card.classList.add('visualization-card');
                    card.innerText = `${name} = ${equationObj.value}`;
                    cardContainer.appendChild(card);
                }
            }

            updateCardPosition(element, cardContainer);
            updateFontSizeAndCardSize();

            element.on('change:position', () => {
                updateCardPosition(element, cardContainer);
                updateFontSizeAndCardSize();
            });
        }
    });

    paper.on('scale translate', () => {
        graph.getElements().forEach(element => {
            const cardContainer = document.querySelector(`.visualization-cards-container[data-id="${element.id}"]`);
            if (cardContainer) {
                updateCardPosition(element, cardContainer);
                updateFontSizeAndCardSize();
            }
        });
    });
}

function updateCardValues() {
    graph.getElements().forEach(element => {
        const elementData = element.get('data') || { equations: {}, visualize: {} };
        const cardContainer = document.querySelector(`.visualization-cards-container[data-id="${element.id}"]`);
        if (cardContainer) {
            cardContainer.innerHTML = '';
            for (const [name, equationObj] of Object.entries(elementData.equations)) {
                if (elementData.visualize[name]) {
                    const card = document.createElement('div');
                    card.classList.add('visualization-card');
                    card.innerText = `${name} = ${equationObj.value}`;
                    cardContainer.appendChild(card);
                }
            }
        }
    });
}

const originalValues = new Map();

// ✅ Toggle between expression and value
function toggleShowExpression() {
    showExpression = !showExpression;
    updateSensitivityAnalysisView();
}

// ✅ Populate dropdown with all global equations
function populateFunctionSelect() {
    const functionSelect = document.getElementById('functionSelect');
    functionSelect.innerHTML = '';

    for (const funcName in globalEquations) {
        const option = document.createElement('option');
        option.value = funcName;
        option.text = funcName;
        functionSelect.appendChild(option);
    }
}

// ✅ Save original expressions before changes
function saveOriginalValues() {
    originalValues.clear();
    for (const [name, equationObj] of Object.entries(globalEquations)) {
        originalValues.set(name, equationObj.expr);
    }
}

// ✅ Update the sensitivity input field
function updateSensitivityAnalysisView() {
    const sensitivityInput = document.querySelector('#newValue');
    const functionSelect = document.querySelector('#functionSelect');
    const functionName = functionSelect.value;

    if (functionName) {
        const functionValue = getFunctionValue(functionName);
        const functionExpression = getFunctionExpression(functionName);

        sensitivityInput.value = showExpression ? functionExpression : functionValue;
        sensitivityInput.setAttribute('data-function-name', functionName);
    }
}

// ✅ Get current value of a function from globalEquations
function getFunctionValue(functionName) {
    return globalEquations[functionName]?.value || "";
}

// ✅ Get current expression of a function from globalEquations
function getFunctionExpression(functionName) {
    return globalEquations[functionName]?.expr || "";
}

// ✅ Update global equation expression
function updateFunction() {
    const functionSelect = document.getElementById('functionSelect');
    const newValue = document.getElementById('newValue').value;
    const selectedFunction = functionSelect.value;

    if (globalEquations[selectedFunction]) {
        globalEquations[selectedFunction].expr = newValue;
        updatesMade = true;
        reEvaluateAllEquations();
    }

    if (currentNode) {
        loadEquationsEditorData(currentNode);
    }
}

// ✅ Restore all original expressions
function restoreOriginalValues() {
    for (const [name, originalValue] of originalValues.entries()) {
        if (globalEquations[name]) {
            globalEquations[name].expr = originalValue;
        }
    }

    reEvaluateAllEquations();
    loadEquationsEditorData(currentNode);
    restoreClicked = true;
}



function updateStats() {
    const nodes = graph.getElements().filter(node => {
        // Exclude nodes that are text elements
        return !(node instanceof joint.shapes.standard.Rectangle && node.attr('label/text'));
    });
    const links = graph.getLinks();

    const totalNodes = nodes.length;
    const totalConnections = links.length;

    let mostConnectionsNode = { id: null, name: '', count: 0 };
    let mostOutgoingConnectionsNode = { id: null, name: '', count: 0 };
    let mostIncomingConnectionsNode = { id: null, name: '', count: 0 };
    const nodeConnections = {};
    let unlinkedNodeCount = 0;
    let nodesNamedNodeCount = 0;
    let isolatedFunctionsCount = 0;
    const functionReferences = new Set();
    const referencingFunctions = new Set();
    const allFunctions = new Set();

    nodes.forEach(node => {
        const nodeId = node.id;
        const nodeName = node.attr('label/text') || nodeId;
        const outgoingConnections = graph.getConnectedLinks(node, { outbound: true }).length;
        const incomingConnections = graph.getConnectedLinks(node, { inbound: true }).length;
        const totalConnections = outgoingConnections + incomingConnections;

        if (nodeName.toLowerCase() === "node") {
            nodesNamedNodeCount++;
        }

        if (totalConnections > mostConnectionsNode.count) {
            mostConnectionsNode = { id: nodeId, name: nodeName, count: totalConnections };
        }

        if (outgoingConnections > mostOutgoingConnectionsNode.count) {
            mostOutgoingConnectionsNode = { id: nodeId, name: nodeName, count: outgoingConnections };
        }

        if (incomingConnections > mostIncomingConnectionsNode.count) {
            mostIncomingConnectionsNode = { id: nodeId, name: nodeName, count: incomingConnections };
        }

        nodeConnections[nodeId] = totalConnections;

        if (totalConnections === 0) {
            unlinkedNodeCount++;
        }

        const nodeData = node.get('data') || { equations: {} };
        Object.entries(nodeData.equations).forEach(([name, equationObj]) => {
            allFunctions.add(name);
            const equation = equationObj.expr;
            const matches = equation.match(/[a-zA-Z_][a-zA-Z0-9_]*/g);
            if (matches) {
                matches.forEach(match => functionReferences.add(match));
                referencingFunctions.add(name);
            }
        });
    });

    allFunctions.forEach(funcName => {
        if (!functionReferences.has(funcName) && !referencingFunctions.has(funcName)) {
            isolatedFunctionsCount++;
        }
    });

    const currentZoomScale = paper.scale().sx;

    document.getElementById('totalNodes').innerText = totalNodes;
    document.getElementById('totalConnections').innerText = totalConnections;
    document.getElementById('mostConnectionsNode').innerText = mostConnectionsNode.name || 'N/A';
    document.getElementById('mostOutgoingConnectionsNode').innerText = mostOutgoingConnectionsNode.name || 'N/A';
    document.getElementById('mostIncomingConnectionsNode').innerText = mostIncomingConnectionsNode.name || 'N/A';
    document.getElementById('unlinkedNodes').innerText = unlinkedNodeCount;
    document.getElementById('nodesNamedNode').innerText = nodesNamedNodeCount;
    document.getElementById('currentZoomScale').innerText = (currentZoomScale * 100).toFixed(2) + '%';
    document.getElementById('isolatedFunctions').innerText = isolatedFunctionsCount;
}


function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

function updateSessionTimeDisplay() {
    const sessionTimeElement = document.getElementById('sessionTime');
    const currentTime = Date.now();
    const timeElapsed = elapsedTime + (currentTime - startTime);
    sessionTimeElement.innerText = formatTime(timeElapsed);
}

function startTimer() {
    startTime = Date.now();
    timerInterval = setInterval(updateSessionTimeDisplay, 1000);
    document.getElementById('startTimerButton').style.display = 'none';
    document.getElementById('pauseTimerButton').style.display = 'inline-block';
}

function pauseTimer() {
    clearInterval(timerInterval);
    elapsedTime += Date.now() - startTime;
    isTimerPaused = true;
    document.getElementById('pauseTimerButton').style.display = 'none';
    document.getElementById('resumeTimerButton').style.display = 'inline-block';
}

function resumeTimer() {
    startTime = Date.now();
    timerInterval = setInterval(updateSessionTimeDisplay, 1000);
    isTimerPaused = false;
    document.getElementById('pauseTimerButton').style.display = 'inline-block';
    document.getElementById('resumeTimerButton').style.display = 'none';
}

function resetTimer() {
    clearInterval(timerInterval);
    elapsedTime = 0;
    isTimerPaused = false;
    document.getElementById('sessionTime').innerText = '00:00:00';
    document.getElementById('pauseTimerButton').style.display = 'none';
    document.getElementById('resumeTimerButton').style.display = 'none';
    document.getElementById('startTimerButton').style.display = 'inline-block';
}

function addTablesToNode(node) {
    if (!node.tables) {
        node.tables = [];
    }
}

function toggleTableCreationPopup() {
    const popup = document.getElementById('tableCreationPopup');
    popup.style.display = (popup.style.display === 'none' || popup.style.display === '') ? 'block' : 'none';
    resetTableCreationFields();
    editingTableWrapper = null;
}

function createTable() {
    const numRows = parseInt(document.getElementById('numRows').value);
    const numCols = parseInt(document.getElementById('numCols').value);

    if (numRows > 0 && numCols > 0) {
        let tableHTML = '<table><thead><tr>';

        for (let j = 0; j < numCols; j++) {
            tableHTML += `<th contenteditable="true">Title ${j + 1}</th>`;
        }

        tableHTML += '</tr></thead><tbody>';

        for (let i = 0; i < numRows; i++) {
            tableHTML += '<tr>';
            for (let j = 0; j < numCols; j++) {
                tableHTML += `<td contenteditable="true"></td>`;
            }
            tableHTML += '</tr>';
        }

        tableHTML += '</tbody></table>';
        document.getElementById('tableContainer').innerHTML = tableHTML;

        document.querySelectorAll('#tableContainer table td').forEach(cell => {
            cell.addEventListener('paste', handlePasteEvent);
        });
    }
}

function handlePasteEvent(event) {
    event.preventDefault();

    const pasteData = (event.clipboardData || window.clipboardData).getData('text');
    const rows = pasteData.split('\n');

    let startCell = event.target;
    let startRow = startCell.parentElement.rowIndex;
    let startCol = startCell.cellIndex;

    rows.forEach((rowData, rowIndex) => {
        const cells = rowData.split('\t');
        cells.forEach((cellData, cellIndex) => {
            const cell = startCell.closest('table').rows[startRow + rowIndex]?.cells[startCol + cellIndex];
            if (cell) {
                cell.textContent = cellData;
            }
        });
    });
}

function selectNode(node) {
    if (!node.tables) {
        node.tables = [];
    }

    currentNode = node;
    
    displayTablesForNode();
}

function displayTablesForNode() {
    if (!currentNode) return;

    const savedTablesContainer = document.getElementById('savedTablesContainer');
    savedTablesContainer.innerHTML = '';

    if (currentNode.tables) {
        currentNode.tables.forEach((table, index) => {
            addTableToUI(table.name, table.html, index);
        });
    }
}

function saveTable() {
    if (!currentNode) {
        alert('No node selected.');
        return;
    }

    const tableName = document.getElementById('tableName').value.trim();
    const tableContainer = document.getElementById('tableContainer');

    if (tableName && tableContainer.innerHTML.trim() !== '') {
        const tableHTML = tableContainer.innerHTML;
        const index = editingTableWrapper ? Array.from(editingTableWrapper.parentElement.children).indexOf(editingTableWrapper) : -1;

        const tableData = [];
        const rows = tableContainer.querySelectorAll('tr');
        const columnTitles = Array.from(rows[0].children).map(th => th.textContent.trim());

        for (let i = 1; i < rows.length; i++) {
            const cells = rows[i].children;
            const rowData = Array.from(cells).map(td => td.textContent.trim());
            tableData.push(rowData);
        }

        addTableMapping(tableName, tableData, columnTitles);

        globalTables[tableName] = { html: tableHTML, data: tableData, columns: columnTitles };

        if (index >= 0) {
            currentNode.tables[index] = { name: tableName, html: tableHTML, data: tableData, columns: columnTitles };
            updateTableWrapper(editingTableWrapper, tableName, tableHTML);
            editingTableWrapper = null;
        } else {
            currentNode.tables.push({ name: tableName, html: tableHTML, data: tableData, columns: columnTitles });
            addTableToUI(tableName, tableHTML, currentNode.tables.length - 1);
        }

        resetTableCreationFields();
    }
}

function addTableToUI(name, html, index) {
    const savedTablesContainer = document.getElementById('savedTablesContainer');
    const tableWrapper = document.createElement('div');
    tableWrapper.className = 'saved-table';
    tableWrapper.dataset.index = index;
    tableWrapper.innerHTML = `
        <h4 contenteditable="true">${name}</h4>
        <div contenteditable="true">${html}</div>
        <button onclick="updateTable(this)">Update</button>
        <button onclick="deleteTable(this)">Delete</button>`;
    savedTablesContainer.appendChild(tableWrapper);
}


function updateTable(button) {
    const tableWrapper = button.parentElement;
    const tableName = tableWrapper.querySelector('h4').textContent.trim();
    const tableHTML = tableWrapper.querySelector('div').innerHTML;
    const tableIndex = tableWrapper.dataset.index;

    const tableData = [];
    const rows = tableWrapper.querySelectorAll('tr');
    const columnTitles = Array.from(rows[0].children).map(th => th.textContent.trim());

    for (let i = 1; i < rows.length; i++) {
        const cells = rows[i].children;
        const rowData = Array.from(cells).map(td => td.textContent.trim());
        tableData.push(rowData);
    }

    globalTables[tableName] = { html: tableHTML, data: tableData, columns: columnTitles };

    const node = graph.getCell(currentNode.id); // Assuming currentNode is the node being edited
    if (node) {
        node.tables[tableIndex] = { name: tableName, html: tableHTML, data: tableData, columns: columnTitles };
    }

    reEvaluateAllEquations();

}

function deleteTable(button) {
    const tableWrapper = button.parentElement;
    const tableIndex = tableWrapper.dataset.index;

    // Remove from globalTables
    const tableName = tableWrapper.querySelector('h4').textContent.trim();
    delete globalTables[tableName];
    console.log('Deleted from globalTables:', globalTables);

    // Remove from the corresponding node's tables
    const node = graph.getCell(currentNode.id); // Assuming currentNode is the node being edited
    if (node) {
        node.tables.splice(tableIndex, 1);
        console.log('Updated node tables:', node.tables);
    }

    // Identify and delete all equations that use the deleted table
    const equationsToDelete = [];
    for (const [key, value] of Object.entries(globalEquations)) {
        if (value.expr.includes(tableName)) {
            equationsToDelete.push(key);
        }
    }

    equationsToDelete.forEach(equation => {
        deleteEquation(equation);
        console.log(`Deleted equation: ${equation}`);
    });

    // Remove the table from the UI
    tableWrapper.remove();
    console.log('Table removed from UI');
}

function resetTableCreationFields() {
    document.getElementById('tableName').value = '';
    document.getElementById('numRows').value = '';
    document.getElementById('numCols').value = '';
    document.getElementById('tableContainer').innerHTML = '';
}

function addTableMapping(tableName, tableData, columnTitles) {
    const columnMapping = {};
    columnTitles.forEach((title, index) => {
        columnMapping[title] = index;
    });

    tableMappings[tableName] = {
        data: tableData,
        columns: columnMapping
    };
}

function updateTableMappings() {
    currentNode.tables.forEach(table => {
        addTableMapping(table.name, table.data, table.columns);
    });
}

math.import({
    table: (tableName, columnTitle, rowIndex) => table(tableName, columnTitle, rowIndex)
}, { override: true });

function updateDependencies() {
    dependencies = {};

    for (const [key, equationObj] of Object.entries(globalEquations)) {
        const expr = equationObj.expr;
        const matches = expr.match(/\b[a-zA-Z_]\w*\b/g);

        if (matches) {
            matches.forEach(variable => {
                if (!dependencies[variable]) {
                    dependencies[variable] = new Set();
                }
                dependencies[variable].add(key);
            });
        }
    }

    for (const [variable, dependents] of Object.entries(dependencies)) {
        dependencies[variable] = Array.from(dependents);
    }
}

function showErrorPopup(message) {
    const popup = document.getElementById('consoleErrorPopup');
    const messageElem = document.getElementById('consoleErrorMessage');
    messageElem.textContent = message;
    popup.style.display = 'block';
}

function closeErrorPopup() {
    const popup = document.getElementById('consoleErrorPopup');
    popup.style.display = 'none';
}

function toggleAnimationPopup() {
    const animationPopup = document.getElementById('animationPopup');
    if (animationPopup.style.display === 'none' || !animationPopup.style.display) {
        animationPopup.style.display = 'block';
    } else {
        animationPopup.style.display = 'none';
    }
}

function addConditionEntry() {
    const conditionContainer = document.getElementById('conditionContainer');
    
    // Create a new condition entry element
    const conditionEntry = document.createElement('div');
    conditionEntry.classList.add('condition-entry');
    
    conditionEntry.innerHTML = `
        <label>Condition:</label>
        <select class="triggerCondition">
            <option value="<">Less than</option>
            <option value=">">Greater than</option>
            <option value="<=">Less than or equal to</option>
            <option value=">=">Greater than or equal to</option>
            <option value="==">Equal to</option>
            <option value="!=">Not equal to</option>
        </select>

        <label>Enter Value:</label>
        <input type="number" class="triggerValue" placeholder="Enter value">

        <label>Text to Show if Condition Met:</label>
        <input type="text" class="triggerTextInput" placeholder="Enter text">

        <label>Text Color:</label>
        <input type="color" class="messageFontColor">

        <label>Font Size (px):</label>
        <input type="number" class="messageFontSize" placeholder="Enter font size in px">

        <button class="deleteConditionButton" onclick="deleteCondition(this)">Delete Condition</button>
    `;
    
    conditionContainer.appendChild(conditionEntry);
}
function deleteCondition(button) {
    const conditionEntry = button.parentElement;
    conditionEntry.remove();
}


function openAnimationPopup() {
    closeContextMenu();
    populateNodesAndEquations();
    toggleAnimationPopup();
}

function populateNodesAndEquations() {
    const equationsSelect = document.getElementById('selectEquation');

    equationsSelect.innerHTML = '';

    const currentNodeId = currentNode?.id;
    if (!currentNodeId) {
        console.error('No current node selected');
        return;
    }
    const nodeData = currentNode.get('data') || { equations: {} };
    const equations = nodeData.equations || {};

    Object.keys(equations).forEach(key => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = key;
        equationsSelect.appendChild(option);
    });

    const lastNodeId = document.getElementById('animationPopup').dataset.nodeId;
    if (currentNodeId !== lastNodeId) {
        document.getElementById('triggerCondition').value = '';
        document.getElementById('triggerValue').value = '';
        document.getElementById('triggerTextInput').value = '';
        document.getElementById('animateQuantityCheckbox').checked = false;
    }
    document.getElementById('animationPopup').dataset.nodeId = currentNodeId;
}

function createAnimationObject() {
    const selectedNodeId = currentNode?.id;
    if (!selectedNodeId) return;

    const selectedEquationId = document.getElementById('selectEquation').value;
    const triggerCondition = document.getElementById('triggerCondition').value;
    const triggerValue = document.getElementById('triggerValue').value;
    const triggerText = document.getElementById('triggerTextInput').value.trim(); // Trim input to remove whitespace
    const animateQuantity = document.getElementById('animateQuantityCheckbox').checked;

    const selectedNode = currentNode;
    const nodeData = selectedNode.get('data') || { equations: {} };
    const selectedEquation = nodeData.equations[selectedEquationId];

    if (selectedEquation) {
        const condition = `${selectedEquationId} ${triggerCondition} ${triggerValue}`;

        // Preserve existing animation data if present, otherwise create new animation object
        const currentAnimation = nodeData.animation || {};
        const updatedAnimation = {
            ...currentAnimation,
            animationType: 'appearText',
            condition,
            triggerText: triggerText || '', // Set to empty string if no text is provided
            animateQuantity,
            selectedEquationId
        };

        selectedNode.set('data', {
            ...nodeData,
            animation: updatedAnimation
        });

        // If text is empty, remove the text display but keep animation
        if (!triggerText) {
            removeAnimationText(selectedNode);
        }
    }

    reEvaluateAllEquations();
    toggleAnimationPopup();

    if (animateQuantity) {
        attachQuantityAnimation(selectedNode, selectedEquationId);
    } else {
        removeQuantityAnimation(selectedNode);
    }
}

function removeAnimationText(node) {
    const animationElement = document.querySelector(`.dynamic-animation[data-id="${node.id}"]`);
    if (animationElement) {
        animationElement.remove(); // Remove only the animation text element
    }
}

function attachOrRemoveAnimations() {
    graph.getElements().forEach(element => {
        const data = element.get('data');
        if (!data) return;

        if (data.animation) {
            const condition = data.animation.condition;
            const equationContext = {};

            if (data.equations) {
                for (const [key, value] of Object.entries(data.equations)) {
                    if (value && value.value !== undefined) {
                        equationContext[key] = value.value;
                    }
                }
            }

            if (condition && evaluateTriggerCondition(condition, equationContext)) {
                attachAnimation(element, 'appearText', true, element.id);
            } else {
                removeAnimation(element, 'appearText');
            }

            if (data.animation.animateQuantity) {
                attachQuantityAnimation(element, data.animation.selectedEquationId);
            }
        }
    });
}

function applyAnimations(equationValue) {
    const animationMessageDisplay = document.getElementById('animationMessageDisplay');
    
    // Assuming 'animations' is a collection of all defined animations
    animations.forEach(animation => {
        if (animation.equation) {
            animation.conditions.forEach(condition => {
                let conditionMet = false;

                switch (condition.condition) {
                    case '<':
                        conditionMet = equationValue < condition.value;
                        break;
                    case '>':
                        conditionMet = equationValue > condition.value;
                        break;
                    case '<=':
                        conditionMet = equationValue <= condition.value;
                        break;
                    case '>=':
                        conditionMet = equationValue >= condition.value;
                        break;
                    case '==':
                        conditionMet = equationValue == condition.value;
                        break;
                    case '!=':
                        conditionMet = equationValue != condition.value;
                        break;
                }

                if (conditionMet) {
                    // Set the text and style based on the condition
                    animationMessageDisplay.style.color = condition.color;
                    animationMessageDisplay.style.fontSize = condition.fontSize;
                    animationMessageDisplay.innerText = condition.text;
                    animationMessageDisplay.style.display = 'block';
                    return; // Display only one message per evaluation
                }
            });
        }
    });

    // Hide the message if no condition is met
    animationMessageDisplay.style.display = 'none';
}


function evaluateTriggerCondition(condition, equationContext) {
    try {
        if (!condition) {
            return false;
        }

        for (const [key, value] of Object.entries(equationContext)) {
            if (value === undefined) {
                console.error(`Undefined value for key: ${key} in equationContext`);
                return false;
            }
        }

        const result = math.evaluate(condition, equationContext);
        return result;
    } catch (error) {
        console.error('Error evaluating trigger condition:', error);
        return false;
    }
}

function attachQuantityAnimation(node, selectedEquationId) {
    const nodeView = paper.findViewByModel(node);
    if (!nodeView) return;

    let quantityElement = document.querySelector(`.quantity-animation[data-id="${node.id}"]`);

    if (!quantityElement) {
        quantityElement = document.createElement('div');
        quantityElement.classList.add('quantity-animation');
        quantityElement.dataset.id = node.id;
        document.body.appendChild(quantityElement);
    }

    updateQuantityAnimation(node, selectedEquationId, quantityElement);
    updateAnimationPosition(node, quantityElement, true);

    node.on('change:position', () => {
        updateAnimationPosition(node, quantityElement, true);
    });

    node.on('remove', () => {
        removeAnimation(node, 'appearText');
    });
}

function updateQuantityAnimation(node, selectedEquationId, quantityElement) {
    const quantity = parseInt(node.get('data').equations[selectedEquationId].value, 10);
    quantityElement.innerHTML = '';

    const sqrtQuantity = Math.ceil(Math.sqrt(quantity));
    for (let i = 0; i < quantity; i++) {
        const ball = document.createElement('div');
        ball.classList.add('quantity-ball');
        quantityElement.appendChild(ball);
    }

    quantityElement.style.width = `${sqrtQuantity * 15}px`;
    quantityElement.style.height = `${Math.ceil(quantity / sqrtQuantity) * 15}px`;
}

function removeAnimation(node, animationType) {
    const animationElement = document.querySelector(`.dynamic-animation[data-id="${node.id}"]`);
    if (animationElement) {
        animationElement.remove();
    }

    if (animationType === 'appearText') {
        const quantityElement = document.querySelector(`.quantity-animation[data-id="${node.id}"]`);
        if (quantityElement) {
            quantityElement.remove();
        }
    }
}

function attachAnimation(node, animationType, animateQuantity, selectedEquationId) {
    const nodeView = paper.findViewByModel(node);
    if (!nodeView) {
        console.error('Node view not found');
        return;
    }

    let animationElement = document.querySelector(`.dynamic-animation[data-id="${node.id}"]`);
    let quantityElement = document.querySelector(`.quantity-animation[data-id="${node.id}"]`);

    if (!animationElement && node.get('data').animation.triggerText) {
        if (animationType === 'appearText') {
            const text = node.get('data').animation.triggerText;
            animationElement = document.createElement('div');
            animationElement.textContent = text;
            animationElement.classList.add('dynamic-animation', 'visible');
            document.body.appendChild(animationElement);
        }
        animationElement.dataset.id = node.id;
    } else if (animationElement) {
        animationElement.classList.remove('hidden');
        animationElement.classList.add('visible');
    }

    if (animationElement) {
        updateAnimationPosition(node, animationElement);

        node.on('change:position', () => {
            updateAnimationPosition(node, animationElement);
        });
    }

    if (animateQuantity) {
        if (!quantityElement) {
            quantityElement = document.createElement('div');
            quantityElement.classList.add('quantity-animation');
            quantityElement.dataset.id = node.id;
            document.body.appendChild(quantityElement);
        }
        if (globalEquations[selectedEquationId]) {
            updateQuantityAnimation(node, selectedEquationId, quantityElement);
        }
        updateAnimationPosition(node, quantityElement, true);

        node.on('change:position', () => {
            updateAnimationPosition(node, quantityElement, true);
        });
    }
}

function updateAnimationPosition(node, animationElement, isQuantity = false) {
    const nodeView = paper.findViewByModel(node);
    const nodeBBox = nodeView.getBBox();

    const nodeCenterX = nodeBBox.x + nodeBBox.width / 2;
    const nodeCenterY = nodeBBox.y + nodeBBox.height / 2;

    const verticalOffset = 40;
    const spaceBetweenElements = 5;

    if (isQuantity) {
        const textElement = document.querySelector(`.dynamic-animation[data-id="${node.id}"]`);
        let textElementBottom = nodeBBox.y + nodeBBox.height + verticalOffset;

        if (textElement) {
            const textElementBBox = textElement.getBoundingClientRect();
            textElementBottom = textElementBBox.bottom;
        }

        animationElement.style.left = `${nodeCenterX - animationElement.offsetWidth / 2}px`;
        animationElement.style.top = `${textElementBottom + spaceBetweenElements}px`;
    } else {
        animationElement.style.left = `${nodeCenterX - animationElement.offsetWidth / 2}px`;
        animationElement.style.top = `${nodeBBox.y + nodeBBox.height + verticalOffset}px`;
    }
}

function removeQuantityAnimation(node) {
    const quantityElement = document.querySelector(`.quantity-animation[data-id="${node.id}"]`);
    if (quantityElement) {
        quantityElement.remove();
    }
}

function deleteAnimation() {
    const selectedNodeId = currentNode?.id;
    if (!selectedNodeId) return;

    const selectedNode = currentNode;
    const nodeData = selectedNode.get('data') || {};

    delete nodeData.animation;
    selectedNode.set('data', nodeData);

    removeAnimation(selectedNode, 'appearText');
    removeQuantityAnimation(selectedNode);

    toggleAnimationPopup();
}

function removeAllAnimations() {
    graph.getElements().forEach(element => {
        removeAnimation(element, 'appearText');
        removeQuantityAnimation(element);
    });
}

function showGlobalEquationsSpecial() {
    const globalEquationsList = document.getElementById('globalEquationsListSpecial');
    globalEquationsList.innerHTML = '';

    for (const [name, equation] of Object.entries(globalEquations)) {
        const listItem = document.createElement('li');
        listItem.textContent = `${name} = ${equation.expr}`;
        globalEquationsList.appendChild(listItem);
    }

    const modal = document.getElementById('globalEquationsModalSpecial');
    modal.style.display = 'block';
}

function makeElementDraggable(element) {
    let posX = 0, posY = 0, mouseX = 0, mouseY = 0;

    element.onmousedown = function(e) {
        // Only start dragging if the click is within the top 5 pixels
        if (e.clientY - element.getBoundingClientRect().top <= 30) {
            e.preventDefault();
            mouseX = e.clientX;
            mouseY = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }
    };

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        posX = mouseX - e.clientX;
        posY = mouseY - e.clientY;
        mouseX = e.clientX;
        mouseY = e.clientY;
        element.style.top = (element.offsetTop - posY) + "px";
        element.style.left = (element.offsetLeft - posX) + "px";
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

// Call this function when the popup is shown
function showNotePopup() {
    closeContextMenu(); // Close the context menu when the node is clicked

    if (!currentNode) {
        console.error('No node selected');
        return;
    }

    const notePopup = document.getElementById('notePopup');
    const noteEditor = document.getElementById('noteEditor');
    const imagePreviewContainer = document.getElementById('imagePreviewContainer');

    // Load the existing note if any
    const noteContent = currentNode.get('note') || '';
    noteEditor.value = noteContent;

    // Load existing images if any
    const images = currentNode.get('images') || [];
    imagePreviewContainer.innerHTML = '';
    images.forEach(src => {
        const imgWrapper = document.createElement('div');
        imgWrapper.className = 'image-wrapper';

        const img = document.createElement('img');
        img.src = src;
        img.style.maxWidth = '100%';
        img.style.marginTop = '10px';
        img.draggable = false; // Make the image non-draggable
        imgWrapper.appendChild(img);

        // Create the "X" mark
        const closeBtn = document.createElement('span');
        closeBtn.className = 'close-image';
        closeBtn.innerHTML = '&times;';
        closeBtn.onclick = function() {
            imgWrapper.remove(); // Remove the image wrapper when "X" is clicked
        };
        imgWrapper.appendChild(closeBtn);

        imagePreviewContainer.appendChild(imgWrapper);
    });

    notePopup.style.display = 'block';

    // Make the popup draggable
    makeElementDraggable(notePopup);
}

function closeNotePopup() {
    const notePopup = document.getElementById('notePopup');
    notePopup.style.display = 'none';
}

function saveNote() {
    if (!currentNode) {
        console.error('No node selected');
        return;
    }

    const noteEditor = document.getElementById('noteEditor');
    const noteContent = noteEditor.value;

    // Save the note content to the current node
    currentNode.set('note', noteContent);

    // Save the images to the current node
    const images = [];
    document.querySelectorAll('#imagePreviewContainer img').forEach(img => {
        images.push(img.src);
    });
    currentNode.set('images', images);

    closeNotePopup();
}

function insertImage(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const imagePreviewContainer = document.getElementById('imagePreviewContainer');
            
            // Create a wrapper div for the image and the "X" mark
            const imgWrapper = document.createElement('div');
            imgWrapper.className = 'image-wrapper';

            const img = document.createElement('img');
            img.src = e.target.result;
            img.style.maxWidth = '100%';
            img.style.marginTop = '10px';
            img.draggable = false; // Make the image non-draggable
            imgWrapper.appendChild(img);

            // Create the "X" mark
            const closeBtn = document.createElement('span');
            closeBtn.className = 'close-image';
            closeBtn.innerHTML = '&times;';
            closeBtn.onclick = function() {
                imgWrapper.remove(); // Remove the image wrapper when "X" is clicked
            };
            imgWrapper.appendChild(closeBtn);

            imagePreviewContainer.appendChild(imgWrapper);
        };
        reader.readAsDataURL(file);
    }
}

function updateBreadcrumb() {
    const breadcrumb = document.getElementById('canvasBreadcrumb');
    if (!breadcrumb) return;

    breadcrumb.innerHTML = ""; // Clear existing content

    // Build full trail: main canvas + subcanvas stack
    const fullTrail = ["main", ...subCanvasStack];

    fullTrail.forEach((canvasId, index) => {
        const span = document.createElement("span");
        const isMain = canvasId === "main";

        span.className = "breadcrumb-node-name";
        span.textContent = isMain ? "Main Canvas" : (nodeNamesMap.get(canvasId) || "Unnamed Node");
        span.style.cursor = "pointer";
        span.dataset.canvasIndex = index;

        span.addEventListener("click", () => {
            navigateToBreadcrumbCanvas(index);
        });

        breadcrumb.appendChild(span);

        if (index < fullTrail.length - 1) {
            const separator = document.createElement("span");
            separator.className = "separator";
            separator.textContent = "➜";
            breadcrumb.appendChild(separator);
        }
    });

    breadcrumb.scrollLeft = breadcrumb.scrollWidth; // Auto-scroll to end
}

function navigateToBreadcrumbCanvas(index) {
    if (index === 0) {
        // Return to main canvas
        while (subCanvasStack.length > 0) {
            backButton.click();
        }
    } else {
        // Go up to selected subcanvas level
        const targetStackLength = index;
        while (subCanvasStack.length > targetStackLength) {
            backButton.click();
        }
    }
}



function togglePlusSign() {
    updateNodeIndicators();
}

function updateNodeIndicators() {
    const showSubcanvasIndicator = document.getElementById('togglePlusSign').checked;

    graph.getElements().forEach(node => {
        const subCanvasId = node.id;
        const hasSubCanvas = subCanvasStates.has(subCanvasId);
        let hasElements = false;

        if (hasSubCanvas) {
            const subCanvasState = subCanvasStates.get(subCanvasId);
            const subGraph = new joint.dia.Graph();
            subGraph.fromJSON(subCanvasState.graph);
            hasElements = subGraph.getElements().length > 0 || subGraph.getLinks().length > 0;
        }

        const nodeView = node.findView(paper);
        if (nodeView) {
            let subcanvasElement = nodeView.el.querySelector('.subcanvas-indicator');

            if (showSubcanvasIndicator && hasElements) {
                if (!subcanvasElement) {
                    // Create a new Downward Arrow indicator
                    subcanvasElement = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    subcanvasElement.classList.add('subcanvas-indicator');
                    subcanvasElement.textContent = '⮟'; // Use Downward Arrow
                    subcanvasElement.setAttribute('fill', 'blue');
                    subcanvasElement.setAttribute('font-size', '14');
                    nodeView.el.appendChild(subcanvasElement);
                }

                // Dynamically position the arrow near the resized node
                const bbox = nodeView.el.getBBox();
                const offset = 10; // Distance from the icon
                subcanvasElement.setAttribute('x', bbox.x + bbox.width + offset); // Adjust horizontal position
                subcanvasElement.setAttribute('y', bbox.y + bbox.height / 2); // Center vertically
                subcanvasElement.style.display = 'block'; // Ensure visibility
            } else if (subcanvasElement) {
                // Hide the Downward Arrow if not needed
                subcanvasElement.style.display = 'none';
            }
        }
    });
}



document.getElementById('equationsTreeButton').addEventListener('click', function () {
    openEquationsTreeWindow();
});

function openEquationsTreeWindow() {
    const treeData = generateEquationsTreeData();

    // Open a new popup window
    const equationsTreeWindow = window.open('', '', 'width=800,height=600');

    // Write the basic HTML structure to the new window
    equationsTreeWindow.document.write(`
        <html>
            <head>
                <title>Equations Tree</title>
                <script src="https://d3js.org/d3.v7.min.js"></script>
                <style>
                    .node circle {
                        fill: steelblue;
                        stroke: #fff;
                        stroke-width: 3px;
                    }
                    .node text {
                        font: 12px sans-serif;
                        text-anchor: middle;
                        fill: #333;
                    }
                    .link {
                        fill: none;
                        stroke: #555;
                        stroke-width: 1.5px;
                    }
                </style>
            </head>
            <body>
                <div id="equationsTreeContainer"></div>
                <script>
                    const treeData = ${JSON.stringify(treeData)};
                    (${renderEquationsTree.toString()})(treeData);
                </script>
            </body>
        </html>
    `);

    equationsTreeWindow.document.close();
}

function generateEquationsTreeData() {
    if (!globalEquations || Object.keys(globalEquations).length === 0) {
        console.log("No equations found in globalEquations.");
        return [];
    }

    const nodeMap = {}; // Map to store nodes by name
    const rootNodes = []; // List of root-level nodes
    const dependentNodes = new Set(); // Track all nodes that are dependencies

    // Helper function to get or create a node
    function getOrCreateNode(name) {
        if (!nodeMap[name]) {
            nodeMap[name] = { name, children: [] }; // Create a new node if it doesn't exist
            console.log(`Created new node: ${name}`);
        } else {
            console.log(`Reusing existing node: ${name}`);
        }
        return nodeMap[name];
    }

    // Helper function to find exact dependencies in an expression
    function findDependencies(expression) {
        const dependencies = Object.keys(globalEquations).filter(dep =>
            new RegExp(`\\b${dep}\\b`).test(expression) // Match exact variable names
        );
        console.log(`Dependencies found in "${expression}":`, dependencies);
        return dependencies;
    }

    // Build the dependency tree
    for (const [name, equationObj] of Object.entries(globalEquations)) {
        console.log(`Processing equation: ${name} = ${equationObj.expr}`);
        const parentNode = getOrCreateNode(name); // Get or create the current node
        const dependencies = findDependencies(equationObj.expr); // Extract dependencies

        // Link dependencies to the parent node
        dependencies.forEach(dep => {
            const childNode = getOrCreateNode(dep); // Reuse or create the child node
            if (!parentNode.children.includes(childNode)) {
                parentNode.children.push(childNode); // Link dependency
                console.log(`Linked ${dep} as a child of ${name}`);
            }
            dependentNodes.add(dep); // Mark the dependency
        });
    }

    // Add all independent nodes (not dependencies) as root nodes
    Object.keys(globalEquations).forEach(name => {
        if (!dependentNodes.has(name)) {
            rootNodes.push(getOrCreateNode(name)); // Add independent node to root
            console.log(`Added root node: ${name}`);
        }
    });

    console.log("Final Root Nodes:", rootNodes.map(node => node.name));
    return rootNodes; // Return all root nodes
}









function renderEquationsTree(data) {
    const width = 600;
    const height = 400;
    const margin = { top: 20, right: 90, bottom: 30, left: 90 };

    // Remove any existing tree before rendering a new one
    d3.select("#equationsTreeContainer").selectAll("*").remove();

    // Set up the SVG container
    const svg = d3
        .select("#equationsTreeContainer")
        .append("svg")
        .attr("width", window.innerWidth)
        .attr("height", window.innerHeight)
        .call(
            d3.zoom()
                .scaleExtent([0.5, 2]) // Set zoom scale limits
                .on("zoom", function (event) {
                    g.attr("transform", event.transform); // Apply zoom/pan transform
                })
        );

    // Create a group for panning and zooming
    const g = svg.append("g");

    const tree = d3.tree().size([height, width]);

    // Render each root-level tree
    data.forEach((rootNode, index) => {
        const offsetY = index * (height + 50); // Offset each tree vertically for separation
        const hierarchy = d3.hierarchy(rootNode);
        const treeData = tree(hierarchy);

        // Render links (edges)
        g.selectAll(`.link-${index}`)
            .data(treeData.links())
            .enter()
            .append("path")
            .attr("class", "link")
            .attr("d", d3.linkHorizontal()
                .x(d => d.y)
                .y(d => d.x + offsetY))
            .style("fill", "none")
            .style("stroke", "#ccc")
            .style("stroke-width", "2px");

        // Render nodes
        const node = g
            .selectAll(`.node-${index}`)
            .data(treeData.descendants())
            .enter()
            .append("g")
            .attr("class", "node")
            .attr("transform", d => `translate(${d.y},${d.x + offsetY})`);

        node.append("circle")
            .attr("r", 5)
            .style("fill", "#69b3a2")
            .style("stroke", "#555")
            .style("stroke-width", "2px");

        // Add labels above the nodes
        node.append("text")
            .attr("dy", "-10") // Move text 10px above the node
            .attr("x", 0) // Center text horizontally above the node
            .style("text-anchor", "middle") // Center text alignment
            .text(d => d.data.name)
            .style("font-family", "Arial")
            .style("font-size", "12px")
            .style("fill", "#333");
    });

    // Center the graph dynamically
    function centerGraph() {
        const bounds = g.node().getBBox(); // Get the bounding box of the graph
        const graphWidth = bounds.width;
        const graphHeight = bounds.height;

        const graphX = bounds.x;
        const graphY = bounds.y;

        const svgWidth = svg.attr("width");
        const svgHeight = svg.attr("height");

        const translateX = (svgWidth - graphWidth) / 2 - graphX;
        const translateY = (svgHeight - graphHeight) / 2 - graphY;

        // Apply translation to center the graph
        g.attr("transform", `translate(${translateX},${translateY})`);
    }

    // Center the graph after rendering
    centerGraph();

    // Dynamically update the SVG size and re-center the graph when the window is resized
    function handleResize() {
        svg
            .attr("width", window.innerWidth)
            .attr("height", window.innerHeight);

        centerGraph(); // Re-center the graph after resizing
    }

    window.addEventListener("resize", handleResize);

    // Listen for fullscreen changes to re-center the graph
    document.addEventListener("fullscreenchange", handleResize);
    document.addEventListener("webkitfullscreenchange", handleResize);
    document.addEventListener("mozfullscreenchange", handleResize);
    document.addEventListener("msfullscreenchange", handleResize);
}





function regenerateRandomFunctions() {
    graph.getElements().forEach((element) => {
        const data = element.get('data');
        if (data && data.equations) {
            Object.keys(data.equations).forEach((key) => {
                const equation = data.equations[key];
                if (functionsList.some(func => equation.expr.includes(func))) {
                    try {
                        const newValue = math.evaluate(equation.expr);
                        equation.value = newValue.toString();
                        globalEquations[key].value = newValue.toString();
                        console.log(`Updated ${key}: ${equation.value}`);
                    } catch (error) {
                        console.error(`Error regenerating function for ${key}:`, error);
                    }
                }
            });
        }
    });

    reEvaluateAllEquations(); // Re-evaluate all equations to propagate updates
    console.log('All random functions regenerated.');
}









function performSearch() {
    const query = document.getElementById('searchInput').value.trim().toLowerCase();
    if (!query) {
        alert('Please enter a search term.');
        return;
    }

    let found = false;

    // Check the current canvas
    found = searchInCanvas(graph, query);

    // If not found, recursively search all subcanvases
    if (!found) {
        const visited = new Set(); // Track visited subcanvases
        const path = []; // Track the path to the item
        found = searchAllSubCanvases(query, visited, path);

        if (found && path.length > 0) {
            // Navigate through the path to the target subcanvas
            navigateToSubcanvas(path, query);
        }
    }

    if (!found) {
        alert('The item was not found in the current canvas or any subcanvas.');
    }
}

// Search for nodes or equations in a single canvas
function searchInCanvas(canvasGraph, query) {
    let found = false;

    // Search for a node
    canvasGraph.getElements().forEach(element => {
        if (element.attr('label/text')?.toLowerCase() === query) {
            focusOnElement(element);
            found = true;
        }
    });

    // Search for an equation
    if (!found) {
        Object.keys(globalEquations || {}).forEach(eqName => {
            if (eqName.toLowerCase() === query) {
                const equationNode = canvasGraph.getElements().find(element =>
                    element.get('data')?.equations?.[eqName]
                );
                if (equationNode) {
                    focusOnElement(equationNode);
                    found = true;
                }
            }
        });
    }

    return found;
}

// Recursively search through all subcanvases
function searchAllSubCanvases(query, visited, path) {
    for (const [subCanvasId, subCanvasState] of subCanvasStates.entries()) {
        if (visited.has(subCanvasId)) {
            console.log(`Already visited subcanvas. Skipping: ${subCanvasId}`);
            continue;
        }

        visited.add(subCanvasId); // Mark this subcanvas as visited

        const subCanvasGraph = new joint.dia.Graph();
        subCanvasGraph.fromJSON(subCanvasState.graph);

        // Skip empty subcanvases
        if (subCanvasGraph.getElements().length === 0) {
            console.log(`Subcanvas is empty. Skipping: ${subCanvasId}`);
            continue;
        }

        // Search the current subcanvas
        const found = searchInCanvas(subCanvasGraph, query);
        if (found) {
            console.log(`Found in subcanvas: ${subCanvasId}`);
            path.push(subCanvasId); // Add the subcanvas to the path
            return true;
        }

        // Recursively search deeper subcanvases
        const deeperFound = searchAllSubCanvases(query, visited, path);
        if (deeperFound) {
            path.push(subCanvasId); // Add the current subcanvas to the path
            return true;
        }
    }

    return false;
}

// Navigate through the path to the target subcanvas
function navigateToSubcanvas(path, query) {
    path.reverse(); // Reverse the path to navigate in the correct order
    let delay = 0;

    path.forEach((subCanvasId, index) => {
        setTimeout(() => {
            if (subCanvasId === "main") {
                console.log("Navigating to main canvas.");
                return; // Skip navigating to a parent node for the main canvas
            }

            const parentNode = graph.getElements().find(node => node.id === subCanvasId);
            if (!parentNode) {
                console.error(`Parent node not found for subcanvas ID: ${subCanvasId}`);
                return;
            }

            openSubCanvas(parentNode);

            // If it's the last subcanvas, focus on the found item
            if (index === path.length - 1) {
                const subCanvasGraph = new joint.dia.Graph();
                subCanvasGraph.fromJSON(subCanvasStates.get(subCanvasId).graph);

                const element = subCanvasGraph.getElements().find(el =>
                    el.attr('label/text')?.toLowerCase() === query ||
                    el.get('data')?.equations?.[query]
                );
                if (element) {
                    setTimeout(() => focusOnElement(element), 200); // Ensure subcanvas loads
                }
            }
        }, delay);

        delay += 300; // Increment delay for sequential navigation
    });
}



// Focus on specific coordinates on the canvas
function focusOnCoordinates(coords) {
    const paperTranslate = paper.translate();
    const paperScale = paper.scale().sx; // Assuming uniform scaling

    const paperContainer = document.getElementById('paper');
    if (!paperContainer) {
        console.error("Paper container not found in DOM.");
        return;
    }

    const paperWidth = paperContainer.clientWidth;
    const paperHeight = paperContainer.clientHeight;

    const canvasCenterX = (paperWidth / 2 - paperTranslate.tx) / paperScale;
    const canvasCenterY = (paperHeight / 2 - paperTranslate.ty) / paperScale;

    const translateX = paperTranslate.tx + (canvasCenterX - coords.x) * paperScale;
    const translateY = paperTranslate.ty + (canvasCenterY - coords.y) * paperScale;

    if (isNaN(translateX) || isNaN(translateY)) {
        console.error("Invalid translation values for coordinates:", coords);
        return;
    }

    console.log("New translation for coordinates:", { x: translateX, y: translateY });
    paper.translate(translateX, translateY);
}

// Focus on a specific element in the graph
function focusOnElement(element) {
    const elementBBox = element.getBBox();
    if (!elementBBox) {
        console.error("Bounding box not available for element:", element);
        return;
    }

    const elementCenter = elementBBox.center();
    if (!elementCenter || isNaN(elementCenter.x) || isNaN(elementCenter.y)) {
        console.error("Invalid center coordinates for element:", element);
        return;
    }

    console.log("Element Center:", elementCenter);

    const paperContainer = document.getElementById('paper');
    if (!paperContainer) {
        console.error("Paper container not found in DOM.");
        return;
    }

    const paperWidth = paperContainer.clientWidth;
    const paperHeight = paperContainer.clientHeight;

    const paperTranslate = paper.translate();
    const paperScale = paper.scale().sx;

    const canvasCenterX = (paperWidth / 2 - paperTranslate.tx) / paperScale;
    const canvasCenterY = (paperHeight / 2 - paperTranslate.ty) / paperScale;

    const translateX = paperTranslate.tx + (canvasCenterX - elementCenter.x) * paperScale;
    const translateY = paperTranslate.ty + (canvasCenterY - elementCenter.y) * paperScale;

    if (isNaN(translateX) || isNaN(translateY)) {
        console.error("Invalid translation values:", { translateX, translateY });
        return;
    }

    console.log("New translation:", { x: translateX, y: translateY });

    paper.translate(translateX, translateY);
    highlightElement(element);
}

// Highlight the element temporarily
function highlightElement(element) {
    element.attr({
        body: { stroke: 'red', strokeWidth: 3 }
    });

    setTimeout(() => {
        element.attr({
            body: { stroke: null, strokeWidth: null }
        });
    }, 3000);
}

function handleAutosaveFolder(event) {
    const files = event.target.files;
    if (files.length > 0) {
        // Store the folder handle from the first file's directory
        autosaveFolderHandle = files[0].webkitRelativePath.split("/")[0];
        console.log("Autosave folder selected:", autosaveFolderHandle);
    }
}

function toggleAutosave() {
    const button = document.getElementById('toggleAutosaveButton');
    autosaveIntervalMinutes = parseInt(document.getElementById('autosaveInterval').value, 10) || 2;

    if (!autosaveFileHandle) {
        alert("Please choose a folder directory for autosave first!");
        autosaveEnabled = false;
        button.style.backgroundColor = 'grey';
        button.textContent = `Autosave: OFF`;
        updateAutosaveStatusOff();
        return;
    }

    autosaveEnabled = !autosaveEnabled;
document.getElementById('autosaveInterval').disabled = autosaveEnabled;


    button.style.backgroundColor = autosaveEnabled ? 'blue' : 'grey';
    button.textContent = `Autosave: ${autosaveEnabled ? 'ON' : 'OFF'}`;

    if (autosaveEnabled) {
        startAutosave();
    } else {
        clearInterval(autosaveTimer);
        clearInterval(autosaveStatusInterval);
        updateAutosaveStatusOff();
    }
}


function updateAutosaveStatusOff() {
    const msg = document.getElementById('autosaveMessage');
    const ring = document.getElementById('autosaveProgress');
    msg.textContent = "Autosave is OFF";
    ring.setAttribute('stroke-dashoffset', 62.8); // full reset
}


async function selectAutosaveFile() {
    try {
        const handle = await window.showSaveFilePicker({
            suggestedName: 'autosave_graph.json',
            types: [{
                description: 'JSON Files',
                accept: { 'application/json': ['.json'] }
            }]
        });

        autosaveFileHandle = handle;
        document.getElementById('autosavePath').textContent = handle.name;
        console.log("Autosave file selected:", handle.name);
    } catch (err) {
        console.warn("File selection canceled or unsupported", err);
    }
}


function startAutosave() {
    clearInterval(autosaveTimer);
    const intervalMs = autosaveIntervalMinutes * 60 * 1000;
    const intervalSeconds = autosaveIntervalMinutes * 60;

    autosaveTimer = setInterval(async () => {
        if (autosaveEnabled && autosaveFileHandle) {
            await saveGraph(true);
            flashAutosaveSuccess();
            startAutosaveStatus(intervalSeconds);
        }
    }, intervalMs);

    // Start the first countdown
    startAutosaveStatus(intervalSeconds);
}


function startAutosaveStatus(intervalSeconds) {
    autosaveSecondsLeft = intervalSeconds;
    const progress = document.getElementById('autosaveProgress');
    const msg = document.getElementById('autosaveMessage');
    const total = 62.8;

    if (autosaveStatusInterval) clearInterval(autosaveStatusInterval);

    autosaveStatusInterval = setInterval(() => {
        autosaveSecondsLeft--;
        const percent = autosaveSecondsLeft / intervalSeconds;
        progress.setAttribute('stroke-dashoffset', total * percent);
        msg.textContent = `Autosave in ${String(autosaveSecondsLeft).padStart(2, '0')}s`;

        if (autosaveSecondsLeft <= 0) {
            clearInterval(autosaveStatusInterval);
        }
    }, 1000);
}

function flashAutosaveSuccess() {
    const msg = document.getElementById('autosaveMessage');
    msg.textContent = "💾 Autosaved!";
    msg.style.animation = 'flashSaved 1.5s ease';
    setTimeout(() => {
        msg.style.animation = '';
    }, 1500);

    document.getElementById('lastAutosave').textContent = `Last saved: ${new Date().toLocaleTimeString()}`;
}

function toggleLockMove() {
    if (!currentNode) return;

    const isLocked = currentNode.prop('locked') === true;

    if (isLocked) {
        currentNode.prop('locked', false);
        currentNode.attr('body/cursor', 'move');
    } else {
        currentNode.prop('locked', true);
        currentNode.attr('body/cursor', 'not-allowed');
    }

    closeContextMenu();
}


