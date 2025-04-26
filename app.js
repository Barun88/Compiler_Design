// Get canvas and context
const canvas = document.getElementById("code_space");
const ctx = canvas.getContext("2d");
const gridSize = 20;

// --- Canvas Setup and Resizing ---

// Set canvas dimensions properly and handle resize
function resizeCanvas() {
    // Get the device pixel ratio, falling back to 1
    const dpr = window.devicePixelRatio || 1;
    // Get the size of the canvas in CSS pixels
    const rect = canvas.getBoundingClientRect();
    // Set the canvas drawing buffer size in actual pixels
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    // Scale the context to ensure correct drawing sizes
    ctx.scale(dpr, dpr);
    // Set the CSS size of the canvas
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    render(); // Re-render after resize
}

// Initial resize and add event listener
window.addEventListener("resize", resizeCanvas);

// --- State Variables ---

let blocks = []; // Array to hold all blocks in the workspace
let selectedBlock = null; // The block currently being dragged
let offsetX = 0, offsetY = 0; // Offset between mouse and block top-left corner during drag
let isDragging = false; // Flag indicating if a block is being dragged

// Canvas view controls
let viewX = 0; // World coordinate of the top-left corner of the viewport
let viewY = 0;
let zoomLevel = 1; // Current zoom level
let isPanning = false; // Flag indicating if the canvas is being panned
let lastPanPoint = { x: 0, y: 0 }; // Last mouse position during panning
let spacePressed = false; // Flag indicating if the space bar is held down

// Undo/Redo functionality
const history = []; // Stores past states of the blocks array
const redoStack = []; // Stores states that have been undone
let currentStateIndex = -1; // Index of the current state in the history array

// --- Block Class ---

class Block {
    constructor(x, y, text, color, type, id = `block_${Date.now()}_${Math.random().toString(16).slice(2)}`) {
        this.x = x; // World x-coordinate
        this.y = y; // World y-coordinate
        this.color = color;
        this.width = 180; // Base width
        this.height = 40; // Base height for stack/cap blocks
        this.text = text;
        this.type = type; // "cap", "stack", "c-block", "reporter", "end-cap"
        this.id = id; // Unique identifier

        // Connection references
        this.connectedAbove = null; // Block connected directly above
        this.connectedBelow = null; // Block connected directly below
        this.parentCBlock = null; // C-block this block is nested inside

        // Shape parameters (used for drawing)
        this.notchWidth = 20;
        this.notchHeight = 10;
        this.cornerRadius = 5;
        this.indentWidth = 20; // Indentation for C-blocks and nested blocks
        this.notchInset = 40; // Horizontal position of notches

        // C-block specific properties
        if (this.type === "c-block") {
            this.cBlockHeight = 80; // Initial height for the inner section
            this.nestedBlocks = []; // Array of blocks nested inside
        }
    }

    // --- Drawing Methods ---

    // Main draw method, applies transformations and calls specific shape drawing
    draw() {
        // Apply view transform (world to screen coordinates)
        const screenX = (this.x - viewX) * zoomLevel;
        const screenY = (this.y - viewY) * zoomLevel;
        const scaledWidth = this.width * zoomLevel;
        const scaledHeight = this.height * zoomLevel;

        ctx.save(); // Save context state

        // Draw the block shape based on its type
        if (this.type === "reporter") {
            this.drawReporterBlock(screenX, screenY, scaledWidth, scaledHeight);
        } else if (this.type === "c-block") {
            this.drawCBlock(screenX, screenY, scaledWidth, scaledHeight);
        } else {
            // Handles "cap", "stack", "end-cap"
            this.drawStackBlock(screenX, screenY, scaledWidth, scaledHeight);
        }

        // Draw text centered vertically
        ctx.fillStyle = "white";
        ctx.font = `${14 * zoomLevel}px Arial`; // Scale font size with zoom
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        // Indent text slightly from the left edge
        const textIndent = (this.parentCBlock ? this.indentWidth : 10) * zoomLevel;
        ctx.fillText(this.text, screenX + textIndent, screenY + (this.height / 2) * zoomLevel);

        ctx.restore(); // Restore context state

        // Recursively draw nested blocks for C-blocks and update C-block height
        if (this.type === 'c-block') {
            this.updateAndDrawNestedBlocks();
        }
    }

    // Draws standard stackable blocks (stack, cap, end-cap)
    drawStackBlock(screenX, screenY, scaledWidth, scaledHeight) {
        ctx.fillStyle = this.color;
        ctx.strokeStyle = this.darkenColor(this.color, 20);
        ctx.lineWidth = 1.5 * zoomLevel; // Slightly thinner line

        const r = this.cornerRadius * zoomLevel;
        const notchW = this.notchWidth * zoomLevel;
        const notchH = this.notchHeight * zoomLevel;
        const notchIn = this.notchInset * zoomLevel;

        ctx.beginPath();

        // Top edge: Start after top-left corner radius
        ctx.moveTo(screenX + r, screenY);

        // Top notch (indent) if not a cap block
        if (this.type !== "cap") {
            ctx.lineTo(screenX + notchIn, screenY);
            ctx.lineTo(screenX + notchIn, screenY + notchH);
            ctx.lineTo(screenX + notchIn + notchW, screenY + notchH);
            ctx.lineTo(screenX + notchIn + notchW, screenY);
        }

        // Continue top edge to top-right corner
        ctx.lineTo(screenX + scaledWidth - r, screenY);
        // Top-right corner
        ctx.arcTo(screenX + scaledWidth, screenY, screenX + scaledWidth, screenY + r, r);
        // Right edge
        ctx.lineTo(screenX + scaledWidth, screenY + scaledHeight - r);
        // Bottom-right corner
        ctx.arcTo(screenX + scaledWidth, screenY + scaledHeight, screenX + scaledWidth - r, screenY + scaledHeight, r);

        // Bottom edge: Start after bottom-right corner
        // Bottom notch (protrusion) if not an end-cap
        if (this.type !== "end-cap" && this.type !== "reporter") { // Reporters don't have bottom notches
             ctx.lineTo(screenX + notchIn + notchW, screenY + scaledHeight);
             ctx.lineTo(screenX + notchIn + notchW, screenY + scaledHeight + notchH); // Bump down
             ctx.lineTo(screenX + notchIn, screenY + scaledHeight + notchH); // Across bump
             ctx.lineTo(screenX + notchIn, screenY + scaledHeight); // Bump up
        }

        // Continue bottom edge to bottom-left corner
        ctx.lineTo(screenX + r, screenY + scaledHeight);
        // Bottom-left corner
        ctx.arcTo(screenX, screenY + scaledHeight, screenX, screenY + scaledHeight - r, r);
        // Left edge
        ctx.lineTo(screenX, screenY + r);
        // Top-left corner
        ctx.arcTo(screenX, screenY, screenX + r, screenY, r);

        ctx.closePath();
        ctx.fill();
        ctx.stroke();

         // *** POTENTIAL DRAWING ISSUE AREA ***
         // The notch drawing logic above is simplified. Creating perfect Scratch-like
         // curved notches requires more complex path commands (e.g., arcTo, bezierCurveTo)
         // and precise coordinate calculations. This simplified version uses straight lines.
    }

    // Draws reporter blocks (oval shape)
    drawReporterBlock(screenX, screenY, scaledWidth, scaledHeight) {
        ctx.fillStyle = this.color;
        ctx.strokeStyle = this.darkenColor(this.color, 20);
        ctx.lineWidth = 1.5 * zoomLevel;

        const r = scaledHeight / 2; // Radius is half the height for oval ends

        ctx.beginPath();
        // Start at top-center of left arc
        ctx.moveTo(screenX + r, screenY);
        // Top line
        ctx.lineTo(screenX + scaledWidth - r, screenY);
        // Right arc
        ctx.arc(screenX + scaledWidth - r, screenY + r, r, -Math.PI / 2, Math.PI / 2, false);
        // Bottom line
        ctx.lineTo(screenX + r, screenY + scaledHeight);
        // Left arc
        ctx.arc(screenX + r, screenY + r, r, Math.PI / 2, -Math.PI / 2, false);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    // Draws C-shaped blocks (like if, repeat)
    drawCBlock(screenX, screenY, scaledWidth, scaledHeight) {
        ctx.fillStyle = this.color;
        ctx.strokeStyle = this.darkenColor(this.color, 20);
        ctx.lineWidth = 1.5 * zoomLevel;

        const r = this.cornerRadius * zoomLevel;
        const notchW = this.notchWidth * zoomLevel;
        const notchH = this.notchHeight * zoomLevel;
        const notchIn = this.notchInset * zoomLevel;
        const indentW = this.indentWidth * zoomLevel;
        // Calculate scaled inner height based on potentially updated cBlockHeight
        const innerH = this.cBlockHeight * zoomLevel;
        // Calculate the total height needed for the bottom bar of the C-block
        const bottomBarHeight = this.height * zoomLevel; // Use the standard block height

        ctx.beginPath();

        // --- Top Bar ---
        // Start after top-left corner
        ctx.moveTo(screenX + r, screenY);
        // Top notch (indent) - C blocks are typically caps, but adding for consistency if needed
        if (this.type !== "cap") {
             ctx.lineTo(screenX + notchIn, screenY);
             ctx.lineTo(screenX + notchIn, screenY + notchH);
             ctx.lineTo(screenX + notchIn + notchW, screenY + notchH);
             ctx.lineTo(screenX + notchIn + notchW, screenY);
        }
        // Top edge to top-right corner
        ctx.lineTo(screenX + scaledWidth - r, screenY);
        // Top-right corner
        ctx.arcTo(screenX + scaledWidth, screenY, screenX + scaledWidth, screenY + r, r);
        // Right edge of top bar
        ctx.lineTo(screenX + scaledWidth, screenY + scaledHeight - r);
        // Bottom-right corner of top bar
        ctx.arcTo(screenX + scaledWidth, screenY + scaledHeight, screenX + scaledWidth - r, screenY + scaledHeight, r);
        // Bottom edge of top bar, up to the indent
        ctx.lineTo(screenX + indentW + r, screenY + scaledHeight);
        // Inner top-right corner (inside the C)
        ctx.arcTo(screenX + indentW, screenY + scaledHeight, screenX + indentW, screenY + scaledHeight + r, r);

        // --- Inner Vertical Section ---
        // Left edge of the inner space
        ctx.lineTo(screenX + indentW, screenY + scaledHeight + innerH - r);
        // Inner bottom-left corner (inside the C)
        ctx.arcTo(screenX + indentW, screenY + scaledHeight + innerH, screenX + indentW + r, screenY + scaledHeight + innerH, r);

        // --- Bottom Bar ---
        // Top edge of the bottom bar
        ctx.lineTo(screenX + scaledWidth - r, screenY + scaledHeight + innerH);
        // Top-right corner of the bottom bar
        ctx.arcTo(screenX + scaledWidth, screenY + scaledHeight + innerH, screenX + scaledWidth, screenY + scaledHeight + innerH + r, r);
        // Right edge of the bottom bar
        ctx.lineTo(screenX + scaledWidth, screenY + scaledHeight + innerH + bottomBarHeight - r);
        // Bottom-right corner of the entire block
        ctx.arcTo(screenX + scaledWidth, screenY + scaledHeight + innerH + bottomBarHeight, screenX + scaledWidth - r, screenY + scaledHeight + innerH + bottomBarHeight, r);

        // Bottom edge with notch (protrusion)
        const bottomY = screenY + scaledHeight + innerH + bottomBarHeight;
        ctx.lineTo(screenX + notchIn + notchW, bottomY);
        ctx.lineTo(screenX + notchIn + notchW, bottomY + notchH); // Bump down
        ctx.lineTo(screenX + notchIn, bottomY + notchH); // Across bump
        ctx.lineTo(screenX + notchIn, bottomY); // Bump up

        // Continue bottom edge to bottom-left corner
        ctx.lineTo(screenX + r, bottomY);
        // Bottom-left corner of the entire block
        ctx.arcTo(screenX, bottomY, screenX, bottomY - r, r);
        // Left edge (outer)
        ctx.lineTo(screenX, screenY + r);
        // Top-left corner
        ctx.arcTo(screenX, screenY, screenX + r, screenY, r);

        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // *** POTENTIAL DRAWING ISSUE AREA ***
        // Similar to drawStackBlock, notch drawing is simplified.
        // The overall C-shape path requires careful coordinate calculation.
    }

    // Updates positions and draws nested blocks, recalculating required C-block height
    updateAndDrawNestedBlocks() {
        if (this.type !== 'c-block') return; // Only for C-blocks

        let currentY = this.y + this.height; // Start below the top bar
        let requiredInnerHeight = 0;

        for (const nestedBlock of this.nestedBlocks) {
            // Update nested block's position relative to the C-block
            nestedBlock.x = this.x + this.indentWidth; // Indent nested blocks
            nestedBlock.y = currentY;
            nestedBlock.parentCBlock = this; // Ensure parent reference is set

            nestedBlock.draw(); // Draw the nested block

            // Calculate the height of the nested block (including its own inner height if it's a C-block)
            const nestedTotalHeight = nestedBlock.height + (nestedBlock.type === 'c-block' ? nestedBlock.cBlockHeight : 0);
            requiredInnerHeight += nestedTotalHeight;
            currentY += nestedTotalHeight; // Move down for the next block
        }

        // Update the C-block's inner height. Use a minimum height.
        this.cBlockHeight = Math.max(40, requiredInnerHeight); // Minimum inner height of 40
    }


    // --- Interaction and Logic ---

    // Check if a point (screen coordinates) is inside the block's shape
    isInside(mx, my) {
        // Convert screen coordinates to world coordinates
        const worldX = mx / zoomLevel + viewX;
        const worldY = my / zoomLevel + viewY;

        // Simple bounding box check for now. More complex shapes require path checking.
        if (this.type === "c-block") {
            // Check top bar, inner area (approximated by indent), and bottom bar
            const topPart = worldX >= this.x && worldX <= this.x + this.width &&
                            worldY >= this.y && worldY <= this.y + this.height;

            // FIX: Corrected calculation for bottom bar Y position
            const bottomBarYStart = this.y + this.height + this.cBlockHeight;
            const bottomBarYEnd = bottomBarYStart + this.height; // Bottom bar has standard height
            const bottomPart = worldX >= this.x && worldX <= this.x + this.width &&
                               worldY >= bottomBarYStart && worldY <= bottomBarYEnd;

            // Check the vertical connecting part (simplified to the indented area)
            const verticalPart = worldX >= this.x && worldX <= this.x + this.indentWidth &&
                                 worldY >= this.y + this.height &&
                                 worldY <= bottomBarYStart; // Check up to the start of the bottom bar

            return topPart || bottomPart || verticalPart;
        } else {
            // Default check for stack/cap/end-cap/reporter blocks (bounding box)
            return worldX >= this.x && worldX <= this.x + this.width &&
                   worldY >= this.y && worldY <= this.y + this.height;
        }
    }

    // Snap block's top-left corner to the grid
    snap_to_grid() {
        // Only snap if not connected to anything
        if (!this.connectedAbove && !this.connectedBelow && !this.parentCBlock) {
            this.x = Math.round(this.x / gridSize) * gridSize;
            this.y = Math.round(this.y / gridSize) * gridSize;
        }
    }

    // Check for potential connections with other blocks and perform snapping
    checkConnections(otherBlocks) {
        const snapDistance = 30; // Max distance to trigger a snap

        let bestConnection = null;
        let minDistance = snapDistance;

        // Don't connect reporter blocks vertically like stack blocks
        if (this.type === "reporter") {
             // TODO: Implement snapping reporters into input slots
            return false;
        }

        for (const otherBlock of otherBlocks) {
            if (otherBlock === this || otherBlock.type === "reporter") continue; // Skip self and reporters

            const otherTotalHeight = otherBlock.height + (otherBlock.type === 'c-block' ? otherBlock.cBlockHeight : 0);

            // 1. Check for snapping BELOW another block (this block's top to other block's bottom)
            if (otherBlock.type !== "end-cap" && this.type !== "cap") { // Can't snap below end-caps, can't snap caps below anything
                const snapPointX = otherBlock.x + this.notchInset; // Target notch X
                const snapPointY = otherBlock.y + otherTotalHeight; // Target bottom Y (below potential C-block inner area)
                const myNotchX = this.x + this.notchInset; // My notch X
                const myNotchY = this.y; // My top Y

                // Calculate distance between notch points
                const distance = Math.sqrt(Math.pow(myNotchX - snapPointX, 2) + Math.pow(myNotchY - snapPointY, 2));

                if (distance < minDistance) {
                    minDistance = distance;
                    bestConnection = { block: otherBlock, type: "below" };
                }
            }

            // 2. Check for snapping ABOVE another block (this block's bottom to other block's top)
            // (This check is implicitly handled by the "below" check of the other block,
            // but we could add it for redundancy or different logic if needed)
            // FIX: Corrected distance check logic for snapping above
            if (this.type !== "end-cap" && otherBlock.type !== "cap") { // Can't snap end-caps above, can't snap above caps
                const snapPointX = otherBlock.x + this.notchInset; // Target notch X
                const snapPointY = otherBlock.y; // Target top Y
                const myNotchX = this.x + this.notchInset; // My notch X
                const myBottomY = this.y + this.height + (this.type === 'c-block' ? this.cBlockHeight : 0); // My bottom Y

                const distance = Math.sqrt(Math.pow(myNotchX - snapPointX, 2) + Math.pow(myBottomY - snapPointY, 2));

                 if (distance < minDistance) {
                     minDistance = distance;
                     bestConnection = { block: otherBlock, type: "above" };
                 }
            }


            // 3. Check for snapping INSIDE a C-block
            if (otherBlock.type === "c-block" && this.type !== "cap" && this.type !== "end-cap") { // Can't nest caps/end-caps
                const cBlockInnerX = otherBlock.x + otherBlock.indentWidth;
                const cBlockInnerY = otherBlock.y + otherBlock.height; // Snap point below the top bar

                // Check distance from this block's top-left to the C-block's inner snap point
                const distance = Math.sqrt(Math.pow(this.x - cBlockInnerX, 2) + Math.pow(this.y - cBlockInnerY, 2));

                if (distance < minDistance) {
                    minDistance = distance;
                    bestConnection = { block: otherBlock, type: "inside" };
                }
            }
        }

        // Perform the snap if a connection is found
        if (bestConnection) {
            const targetBlock = bestConnection.block;
            const connectionType = bestConnection.type;

            // Disconnect from any previous connections or parent
            this.disconnect();

            if (connectionType === "below") {
                // Snap this block below the target block
                this.x = targetBlock.x; // Align X
                const targetTotalHeight = targetBlock.height + (targetBlock.type === 'c-block' ? targetBlock.cBlockHeight : 0);
                this.y = targetBlock.y + targetTotalHeight; // Position below target
                this.connectedAbove = targetBlock;
                targetBlock.connectedBelow = this;
                this.parentCBlock = null; // Not nested
            } else if (connectionType === "above") {
                 // Snap this block above the target block
                 this.x = targetBlock.x; // Align X
                 const thisTotalHeight = this.height + (this.type === 'c-block' ? this.cBlockHeight : 0);
                 this.y = targetBlock.y - thisTotalHeight; // Position above target
                 this.connectedBelow = targetBlock;
                 targetBlock.connectedAbove = this;
                 this.parentCBlock = null; // Not nested
            } else if (connectionType === "inside" && targetBlock.type === 'c-block') {
                // Snap this block inside the target C-block
                this.x = targetBlock.x + targetBlock.indentWidth;
                this.y = targetBlock.y + targetBlock.height; // Position below the top bar
                this.parentCBlock = targetBlock;

                // Add to nested blocks array (maintain order if possible, simple push for now)
                // Ideally, insert based on Y position relative to other nested blocks
                targetBlock.nestedBlocks.push(this);
                targetBlock.nestedBlocks.sort((a, b) => a.y - b.y); // Sort by Y after adding

                // No vertical connections when nested
                this.connectedAbove = null;
                this.connectedBelow = null;
            }

            // Snap any blocks connected below this one recursively
            this.updateConnectedBlockPositions();

            return true; // Connection was made
        }

        return false; // No connection found
    }

    // Recursively update positions of blocks connected below or nested inside
    updateConnectedBlockPositions() {
        // Update block directly below
        if (this.connectedBelow) {
            this.connectedBelow.x = this.x; // Align X
            const thisTotalHeight = this.height + (this.type === 'c-block' ? this.cBlockHeight : 0);
            this.connectedBelow.y = this.y + thisTotalHeight; // Position below
            this.connectedBelow.updateConnectedBlockPositions(); // Recurse down
        }

        // Update nested blocks if this is a C-block
        if (this.type === 'c-block') {
            let currentY = this.y + this.height; // Start below top bar
            for (const nestedBlock of this.nestedBlocks) {
                nestedBlock.x = this.x + this.indentWidth; // Indent
                nestedBlock.y = currentY;
                nestedBlock.updateConnectedBlockPositions(); // Recurse on nested blocks

                const nestedTotalHeight = nestedBlock.height + (nestedBlock.type === 'c-block' ? nestedBlock.cBlockHeight : 0);
                currentY += nestedTotalHeight; // Move down for next nested block
            }
            // Recalculate C-block height after updating children
             this.cBlockHeight = Math.max(40, currentY - (this.y + this.height));
        }
    }

    // Disconnect the block from adjacent blocks or its parent C-block
    disconnect() {
        // Disconnect from block above
        if (this.connectedAbove) {
            this.connectedAbove.connectedBelow = null;
            this.connectedAbove = null;
        }
        // Disconnect from block below
        if (this.connectedBelow) {
            this.connectedBelow.connectedAbove = null;
            // Don't null out this.connectedBelow here, the drag operation needs it temporarily
            // It will be nulled out if a new connection is made or on mouseup.
        }
        // Disconnect from parent C-block
        if (this.parentCBlock) {
            const index = this.parentCBlock.nestedBlocks.indexOf(this);
            if (index > -1) {
                this.parentCBlock.nestedBlocks.splice(index, 1);
            }
            // Recalculate parent C-block height after removing child
            this.parentCBlock.updateAndDrawNestedBlocks(); // Trigger update
            this.parentCBlock = null;
        }
    }

    // Utility to darken a hex color
    darkenColor(color, percent) {
        const hex = color.replace('#', '');
        let r = parseInt(hex.substring(0, 2), 16);
        let g = parseInt(hex.substring(2, 4), 16);
        let b = parseInt(hex.substring(4, 6), 16);

        r = Math.max(0, Math.floor(r * (100 - percent) / 100));
        g = Math.max(0, Math.floor(g * (100 - percent) / 100));
        b = Math.max(0, Math.floor(b * (100 - percent) / 100));

        const toHex = (c) => c.toString(16).padStart(2, '0');
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }
}

// --- Initial Blocks ---

function addStarterBlocks() {
    blocks.push(new Block(100, 100, "When program starts", "#4c97ff", "cap"));
    blocks.push(new Block(100, 150, "Move 10 steps", "#4c97ff", "stack")); // Adjusted Y
    const ifBlock = new Block(300, 100, "if condition", "#ffa629", "c-block");
    blocks.push(ifBlock);
    blocks.push(new Block(350, 150, "x < y", "#5cb712", "reporter"));
    // Example of nested block
    const nestedMove = new Block(ifBlock.x + ifBlock.indentWidth, ifBlock.y + ifBlock.height, "Turn 15 degrees", "#4c97ff", "stack");
    blocks.push(nestedMove);
    ifBlock.nestedBlocks.push(nestedMove); // Manually add to nested array
    nestedMove.parentCBlock = ifBlock; // Set parent reference
}

// --- Drawing Functions ---

// Draw the background grid
function drawGrid() {
    // Use CSS dimensions for grid calculations
    const canvasWidth = canvas.offsetWidth;
    const canvasHeight = canvas.offsetHeight;
    const gridSizeScaled = gridSize * zoomLevel;

    // Calculate grid offset based on view position (world to screen)
    const startX = (-viewX * zoomLevel) % gridSizeScaled;
    const startY = (-viewY * zoomLevel) % gridSizeScaled;

    ctx.strokeStyle = "rgba(200, 200, 200, 0.5)"; // Light grey grid
    ctx.lineWidth = 0.5; // Thin lines

    // Draw vertical grid lines
    for (let x = startX; x < canvasWidth; x += gridSizeScaled) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvasHeight);
        ctx.stroke();
    }

    // Draw horizontal grid lines
    for (let y = startY; y < canvasHeight; y += gridSizeScaled) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        // FIX: Use canvasWidth for the line end coordinate
        ctx.lineTo(canvasWidth, y); // <-- Corrected
        ctx.stroke();
    }
}

// Draw the minimap
function drawMinimap() {
    // Use CSS dimensions for minimap positioning
    const canvasWidth = canvas.offsetWidth;
    const canvasHeight = canvas.offsetHeight;
    const minimapSize = 120;
    const minimapPadding = 10;
    const minimapX = canvasWidth - minimapSize - minimapPadding;
    const minimapY = canvasHeight - minimapSize - minimapPadding;

    // Draw minimap background
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)"; // Slightly more opaque
    ctx.fillRect(minimapX, minimapY, minimapSize, minimapSize);
    ctx.strokeStyle = "#aaa";
    ctx.lineWidth = 1; // Use non-scaled line width
    ctx.strokeRect(minimapX, minimapY, minimapSize, minimapSize);

    // Determine the bounds of all blocks in world coordinates
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    if (blocks.length > 0) {
        blocks.forEach(block => {
            minX = Math.min(minX, block.x);
            minY = Math.min(minY, block.y);
            const blockTotalHeight = block.height + (block.type === 'c-block' ? block.cBlockHeight : 0);
            maxX = Math.max(maxX, block.x + block.width);
            maxY = Math.max(maxY, block.y + blockTotalHeight);
        });
    } else {
        // Default bounds if no blocks exist
        minX = 0; minY = 0; maxX = canvasWidth / zoomLevel; maxY = canvasHeight / zoomLevel;
    }

    // Add some padding to the bounds
    const padding = 50;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const worldWidth = maxX - minX;
    const worldHeight = maxY - minY;

    // Calculate minimap scale factor
    const scaleX = minimapSize / worldWidth;
    const scaleY = minimapSize / worldHeight;
    const minimapScale = Math.min(scaleX, scaleY); // Use the smaller scale to fit everything

    // Draw blocks on minimap (simplified rectangles)
    ctx.save();
    ctx.rect(minimapX, minimapY, minimapSize, minimapSize); // Clip drawing to minimap bounds
    ctx.clip();

    for (const block of blocks) {
        ctx.fillStyle = block.color;
        const blockX = minimapX + (block.x - minX) * minimapScale;
        const blockY = minimapY + (block.y - minY) * minimapScale;
        const blockWidth = block.width * minimapScale;
        const blockTotalHeight = (block.height + (block.type === 'c-block' ? block.cBlockHeight : 0)) * minimapScale;
        ctx.fillRect(blockX, blockY, blockWidth, blockTotalHeight);
    }
    ctx.restore(); // Remove clipping

    // Draw viewport rectangle on minimap
    // Calculate viewport position and size in minimap coordinates
    const viewportWidth = (canvasWidth / zoomLevel) * minimapScale;
    const viewportHeight = (canvasHeight / zoomLevel) * minimapScale;
    const viewportX = minimapX + (viewX - minX) * minimapScale;
    const viewportY = minimapY + (viewY - minY) * minimapScale;

    ctx.strokeStyle = "#ff0000"; // Red outline for viewport
    ctx.lineWidth = 2; // Use non-scaled line width
    ctx.strokeRect(viewportX, viewportY, viewportWidth, viewportHeight);
}

// Draw UI Control Buttons (Fixed Size)
function drawControlButtons() {
    ctx.save(); // Save current canvas state (transformations)
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform to draw in screen space

    // Define button styles and positions (fixed screen coordinates)
    const buttonSize = 30;
    const buttonMargin = 10;
    const buttonY = 10; // Top margin
    let currentX = 10; // Left margin
    const buttonColor = "#e0e0e0"; // Lighter gray
    const buttonHoverColor = "#f0f0f0"; // Even lighter on hover (optional)
    const borderColor = "#a0a0a0"; // Darker gray border
    const textColor = "#333";
    const lineWidth = 1;
    const textFont = `12px Arial`; // Fixed font size

    // --- Button Definitions ---
    const buttons = [
        { id: 'zoom-in', width: buttonSize, text: '+', action: zoomIn },
        { id: 'zoom-out', width: buttonSize, text: '-', action: zoomOut },
        { id: 'reset-view', width: 50, text: 'Reset', action: resetView },
        { id: 'save', width: 50, text: 'Save', action: saveProject },
        { id: 'load', width: 50, text: 'Load', action: loadProject },
        { id: 'undo', width: 40, text: 'Undo', action: undo },
        { id: 'redo', width: 40, text: 'Redo', action: redo }
    ];

    // Draw each button
    buttons.forEach(button => {
        // Store button bounds for click detection
        button.bounds = { x: currentX, y: buttonY, width: button.width, height: buttonSize };

        // Basic drawing (can add hover effect later if needed)
        ctx.fillStyle = buttonColor;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = lineWidth;
        ctx.fillRect(button.bounds.x, button.bounds.y, button.bounds.width, button.bounds.height);
        ctx.strokeRect(button.bounds.x, button.bounds.y, button.bounds.width, button.bounds.height);

        // Draw text/symbol
        ctx.fillStyle = textColor;
        ctx.font = textFont;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(button.text, button.bounds.x + button.bounds.width / 2, button.bounds.y + button.bounds.height / 2);

        currentX += button.width + buttonMargin; // Move to next button position
    });

    // Store button definitions globally for click handling
    window.controlButtons = buttons;

    ctx.restore(); // Restore previous canvas state
}

// --- Main Render Function ---

// Separated drawing logic from the main render call
function drawScene() {
    // Use CSS dimensions for clearing
    const canvasWidth = canvas.offsetWidth;
    const canvasHeight = canvas.offsetHeight;
    ctx.clearRect(0, 0, canvasWidth, canvasHeight); // Clear the canvas

    drawGrid(); // Draw the background grid

    // Draw blocks - iterate top-down (visually) by drawing from start of array
    // No need to copy if draw doesn't modify the array structure itself
    blocks.forEach(block => {
        // Only draw blocks that are not nested within another block directly
        if (!block.parentCBlock) {
            block.draw();
        }
    });

    // Highlight potential connection points if dragging
    if (isDragging && selectedBlock) {
        checkBlockConnectionHighlight(selectedBlock, blocks);
    }

    drawMinimap(); // Draw the minimap
}

// Main render loop function
function render() {
    // Request the next frame. This creates a smooth animation loop.
    requestAnimationFrame(() => {
        drawScene(); // Draw the main canvas content (grid, blocks, minimap)
        drawControlButtons(); // Draw the UI buttons on top in screen space
    });
}

// --- Event Handlers ---

// Mouse Down Handler
canvas.addEventListener("mousedown", (e) => {
    // Use offsetX/Y which are relative to the canvas element
    const mouseX = e.offsetX;
    const mouseY = e.offsetY;

    // 1. Check for Control Button Clicks (using screen coordinates)
    if (window.controlButtons) {
        for (const button of window.controlButtons) {
            if (mouseX >= button.bounds.x && mouseX <= button.bounds.x + button.bounds.width &&
                mouseY >= button.bounds.y && mouseY <= button.bounds.y + button.bounds.height) {
                button.action(); // Execute the button's action
                return; // Stop processing if a button was clicked
            }
        }
    }

    // 2. Panning Activation (Middle mouse or Space + Left Click)
    if (e.button === 1 || (e.button === 0 && spacePressed)) {
        isPanning = true;
        lastPanPoint = { x: mouseX, y: mouseY };
        canvas.style.cursor = "grabbing";
        return;
    }

    // 3. Block Selection and Drag Initiation (Left Click)
    if (e.button === 0) {
        let foundBlock = null;
        // Check blocks in reverse order (top ones first visually)
        for (let i = blocks.length - 1; i >= 0; i--) {
            const block = blocks[i];
            if (block.isInside(mouseX, mouseY)) {
                foundBlock = block;
                break; // Found the topmost block under the cursor
            }
        }

        if (foundBlock) {
            selectedBlock = foundBlock;
            isDragging = true;

            // Calculate offset in world coordinates
            const worldMouseX = mouseX / zoomLevel + viewX;
            const worldMouseY = mouseY / zoomLevel + viewY;
            offsetX = worldMouseX - selectedBlock.x;
            offsetY = worldMouseY - selectedBlock.y;

            // Move the selected block to the end of the array to draw it on top
            blocks.splice(blocks.indexOf(selectedBlock), 1);
            blocks.push(selectedBlock);

            // Disconnect the block when starting to drag
            selectedBlock.disconnect();
            // Null out the reference from the block below if it exists
            if (selectedBlock.connectedBelow) {
                 selectedBlock.connectedBelow.connectedAbove = null;
                 // Keep selectedBlock.connectedBelow temporarily for potential re-connection logic
            }


            canvas.style.cursor = "grabbing";
            render(); // Re-render to show block on top and disconnected
        } else {
            // 4. Canvas Panning (if no block was clicked)
            isPanning = true;
            lastPanPoint = { x: mouseX, y: mouseY };
            canvas.style.cursor = "grabbing";
        }
    }
});

// Mouse Move Handler
canvas.addEventListener("mousemove", (e) => {
    const mouseX = e.offsetX;
    const mouseY = e.offsetY;

    // Panning Logic
    if (isPanning) {
        // Calculate change in mouse position (screen coordinates)
        const dxScreen = mouseX - lastPanPoint.x;
        const dyScreen = mouseY - lastPanPoint.y;

        // Convert screen delta to world delta
        const dxWorld = dxScreen / zoomLevel;
        const dyWorld = dyScreen / zoomLevel;

        // Update view coordinates
        viewX -= dxWorld;
        viewY -= dyWorld;

        lastPanPoint = { x: mouseX, y: mouseY }; // Update last position
        render(); // Re-render during panning
    }
    // Dragging Logic
    else if (isDragging && selectedBlock) {
        // Convert mouse position to world coordinates
        const worldMouseX = mouseX / zoomLevel + viewX;
        const worldMouseY = mouseY / zoomLevel + viewY;

        // Update block position based on mouse and initial offset
        selectedBlock.x = worldMouseX - offsetX;
        selectedBlock.y = worldMouseY - offsetY;

        // Update positions of any blocks connected below the dragged block
        selectedBlock.updateConnectedBlockPositions();

        render(); // Re-render during dragging
    }
    // Hover effects (optional, e.g., highlight block under mouse)
    else {
         // Can add logic here to change cursor or highlight blocks on hover
         // For simplicity, keeping default cursor unless panning/dragging
         if (!spacePressed) {
             canvas.style.cursor = "default";
             // Check if hovering over a block
              for (let i = blocks.length - 1; i >= 0; i--) {
                 if (blocks[i].isInside(mouseX, mouseY)) {
                     canvas.style.cursor = "grab";
                     break;
                 }
             }
         }
    }
});

// Mouse Up Handler
canvas.addEventListener("mouseup", (e) => {
    // Block Drag End
    if (isDragging && selectedBlock) {
        // Try to connect with other blocks
        const connected = selectedBlock.checkConnections(blocks);

        if (!connected) {
            // If no connection was made, snap to grid
            selectedBlock.snap_to_grid();
            // Ensure the temporarily held connectedBelow reference is cleared if no connection happened
             selectedBlock.connectedBelow = null;
        }

        saveState(); // Save state after block interaction ends
        isDragging = false;
        selectedBlock = null;
    }

    // Panning End
    if (isPanning) {
        isPanning = false;
    }

    // Reset cursor based on space bar state
    canvas.style.cursor = spacePressed ? "grab" : "default";
    render(); // Final render after interaction
});

// Mouse Wheel Handler (Zooming)
canvas.addEventListener("wheel", (e) => {
    e.preventDefault(); // Prevent default page scrolling

    // Get mouse position relative to canvas (screen coordinates)
    const mouseX = e.offsetX;
    const mouseY = e.offsetY;

    // Convert mouse position to world coordinates before zoom
    const worldXBeforeZoom = mouseX / zoomLevel + viewX;
    const worldYBeforeZoom = mouseY / zoomLevel + viewY;

    // Determine zoom direction and factor
    const zoomFactor = 1.1;
    let newZoomLevel = zoomLevel;
    if (e.deltaY < 0) {
        // Zoom in
        newZoomLevel *= zoomFactor;
    } else {
        // Zoom out
        newZoomLevel /= zoomFactor;
    }

    // Clamp zoom level
    newZoomLevel = Math.max(0.2, Math.min(3, newZoomLevel)); // Min 0.2x, Max 3x

    // Update zoom level
    zoomLevel = newZoomLevel;

    // Calculate world coordinates under mouse *after* zoom
    // We want these to match worldX/YBeforeZoom.
    // worldXAfter = mouseX / newZoomLevel + newViewX;
    // newViewX = worldXBeforeZoom - mouseX / newZoomLevel;
    viewX = worldXBeforeZoom - mouseX / zoomLevel;
    viewY = worldYBeforeZoom - mouseY / zoomLevel;

    render(); // Re-render after zooming
});

// Prevent context menu on right-click
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// --- Keyboard Handlers ---

document.addEventListener("keydown", (e) => {
    // Space bar for panning activation
    if (e.key === " " || e.code === "Space") {
        e.preventDefault(); // Prevent default space bar action (scrolling)
        if (!spacePressed) {
            spacePressed = true;
            if (!isDragging && !isPanning) { // Only change cursor if not actively dragging/panning
                canvas.style.cursor = "grab";
            }
        }
    }

    // Undo/Redo Shortcuts
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        undo();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        redo();
    }
     // Redo alternative for MacOS (Cmd+Shift+Z)
     if (e.metaKey && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
         e.preventDefault();
         redo();
     }
});

document.addEventListener("keyup", (e) => {
    // Space bar release
    if (e.key === " " || e.code === "Space") {
        spacePressed = false;
        if (!isDragging && !isPanning) { // Only reset cursor if not actively dragging/panning
            canvas.style.cursor = "default"; // Or check for hover state
        }
    }
});

// --- Control Button Actions ---

function zoomIn() {
    // Get center of the canvas in screen coordinates
    const centerX = canvas.offsetWidth / 2;
    const centerY = canvas.offsetHeight / 2;
    // Convert center to world coordinates before zoom
    const worldX = centerX / zoomLevel + viewX;
    const worldY = centerY / zoomLevel + viewY;

    zoomLevel *= 1.2;
    zoomLevel = Math.min(3, zoomLevel); // Clamp max zoom

    // Adjust view to keep world center point in the screen center
    viewX = worldX - centerX / zoomLevel;
    viewY = worldY - centerY / zoomLevel;
    render();
}

function zoomOut() {
     // Get center of the canvas in screen coordinates
    const centerX = canvas.offsetWidth / 2;
    const centerY = canvas.offsetHeight / 2;
    // Convert center to world coordinates before zoom
    const worldX = centerX / zoomLevel + viewX;
    const worldY = centerY / zoomLevel + viewY;

    zoomLevel /= 1.2;
    zoomLevel = Math.max(0.2, zoomLevel); // Clamp min zoom

     // Adjust view to keep world center point in the screen center
    viewX = worldX - centerX / zoomLevel;
    viewY = worldY - centerY / zoomLevel;
    render();
}

function resetView() {
    viewX = 0;
    viewY = 0;
    zoomLevel = 1;
    render();
}

// --- Undo/Redo Implementation ---

function saveState() {
    // Deep copy the current state of blocks, including connections by ID
    const state = JSON.stringify(
        blocks.map(block => ({
            x: block.x,
            y: block.y,
            text: block.text,
            color: block.color,
            type: block.type,
            id: block.id,
            // Save connection IDs
            connectedAboveId: block.connectedAbove ? block.connectedAbove.id : null,
            connectedBelowId: block.connectedBelow ? block.connectedBelow.id : null,
            parentCBlockId: block.parentCBlock ? block.parentCBlock.id : null,
            // C-block specific
            cBlockHeight: block.cBlockHeight, // Save calculated height
            nestedBlockIds: block.nestedBlocks ? block.nestedBlocks.map(b => b.id) : []
        }))
    );

    // If we undid, new action clears the redo stack
    if (currentStateIndex < history.length - 1) {
        history.splice(currentStateIndex + 1);
        redoStack.length = 0;
    }

    history.push(state);
    currentStateIndex = history.length - 1;

    // Optional: Limit history size
    const maxHistory = 50;
    if (history.length > maxHistory) {
        history.shift();
        currentStateIndex--;
    }
    // console.log("State saved. History:", history.length, "Redo:", redoStack.length);
}

function loadState(stateJson) {
    const stateData = JSON.parse(stateJson);
    const blockMap = new Map(); // To easily find blocks by ID

    // Create new block instances from saved data
    const newBlocks = stateData.map(blockData => {
        const block = new Block(
            blockData.x,
            blockData.y,
            blockData.text,
            blockData.color,
            blockData.type,
            blockData.id // Use saved ID
        );
        // Restore C-block specific properties
        if (blockData.cBlockHeight !== undefined) block.cBlockHeight = blockData.cBlockHeight;
        // Initialize nestedBlocks array if it's a C-block
        if (block.type === 'c-block') {
            block.nestedBlocks = [];
        }
        blockMap.set(block.id, block); // Add to map
        return block;
    });

    // Restore connections and nesting using the blockMap
    newBlocks.forEach(block => {
        const blockData = stateData.find(data => data.id === block.id);
        if (blockData) {
            block.connectedAbove = blockMap.get(blockData.connectedAboveId) || null;
            block.connectedBelow = blockMap.get(blockData.connectedBelowId) || null;
            block.parentCBlock = blockMap.get(blockData.parentCBlockId) || null;

            // Restore nested blocks for C-blocks
            if (block.type === 'c-block' && blockData.nestedBlockIds) {
                block.nestedBlocks = blockData.nestedBlockIds
                    .map(id => blockMap.get(id))
                    .filter(b => b); // Filter out any undefined blocks
            }
        }
    });

    blocks = newBlocks; // Replace the current blocks array
    render(); // Render the loaded state
    // console.log("State loaded. Index:", currentStateIndex);
}

function undo() {
    if (currentStateIndex > 0) {
        // Push the current state (before undoing) onto the redo stack
        redoStack.push(history[currentStateIndex]);
        currentStateIndex--;
        loadState(history[currentStateIndex]);
    } else {
        console.log("Cannot undo further.");
    }
}

function redo() {
    if (redoStack.length > 0) {
        const stateToRestore = redoStack.pop();
        // The state to restore becomes the current state
        history.push(stateToRestore); // Add it back to history
        currentStateIndex++;
        loadState(stateToRestore);
    } else {
        console.log("Cannot redo further.");
    }
}


// --- Save/Load Project Implementation ---

function saveProject() {
    // Use the same structure as saveState for consistency
     const projectData = {
        blocks: blocks.map(block => ({
            x: block.x,
            y: block.y,
            text: block.text,
            color: block.color,
            type: block.type,
            id: block.id,
            connectedAboveId: block.connectedAbove ? block.connectedAbove.id : null,
            connectedBelowId: block.connectedBelow ? block.connectedBelow.id : null,
            parentCBlockId: block.parentCBlock ? block.parentCBlock.id : null,
            cBlockHeight: block.cBlockHeight,
            nestedBlockIds: block.nestedBlocks ? block.nestedBlocks.map(b => b.id) : []
        })),
        viewX: viewX,
        viewY: viewY,
        zoomLevel: zoomLevel
    };

    const jsonData = JSON.stringify(projectData, null, 2); // Pretty print JSON
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'visual_flow_project.json'; // Filename for download
    document.body.appendChild(link);
    link.click(); // Trigger download
    document.body.removeChild(link); // Clean up the link
    URL.revokeObjectURL(url); // Release the object URL
    console.log("Project saved.");
}

function loadProject() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json'; // Accept only JSON files

    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = event => {
            try {
                const jsonData = event.target.result;
                const projectData = JSON.parse(jsonData);

                // Basic validation
                if (!projectData || !projectData.blocks || !Array.isArray(projectData.blocks)) {
                    throw new Error("Invalid project file format.");
                }

                // Use the same loading logic as loadState
                const blockMap = new Map();
                const loadedBlocks = projectData.blocks.map(blockData => {
                     const block = new Block(
                        blockData.x, blockData.y, blockData.text, blockData.color, blockData.type, blockData.id
                    );
                    if (blockData.cBlockHeight !== undefined) block.cBlockHeight = blockData.cBlockHeight;
                    if (block.type === 'c-block') block.nestedBlocks = [];
                    blockMap.set(block.id, block);
                    return block;
                });

                 loadedBlocks.forEach(block => {
                    const blockData = projectData.blocks.find(data => data.id === block.id);
                    if (blockData) {
                        block.connectedAbove = blockMap.get(blockData.connectedAboveId) || null;
                        block.connectedBelow = blockMap.get(blockData.connectedBelowId) || null;
                        block.parentCBlock = blockMap.get(blockData.parentCBlockId) || null;
                        if (block.type === 'c-block' && blockData.nestedBlockIds) {
                            block.nestedBlocks = blockData.nestedBlockIds
                                .map(id => blockMap.get(id))
                                .filter(b => b);
                        }
                    }
                });

                blocks = loadedBlocks; // Replace current blocks

                // Restore view settings
                viewX = projectData.viewX || 0;
                viewY = projectData.viewY || 0;
                zoomLevel = projectData.zoomLevel || 1;

                // Clear history and save the loaded state as the initial state
                history.length = 0;
                redoStack.length = 0;
                currentStateIndex = -1;
                saveState();

                render(); // Render the loaded project
                console.log("Project loaded successfully.");

            } catch (error) {
                console.error("Error loading project file:", error);
                alert(`Error loading project: ${error.message}`);
            }
        };
        reader.onerror = () => {
             console.error("Error reading file.");
             alert("Error reading the selected file.");
        };
        reader.readAsText(file);
    };

    input.click(); // Open file dialog
}

// --- Palette Initialization ---

function initializePalette() {
    // Use the updated class name 'palette-item'
    const paletteItems = document.querySelectorAll("#palate .palette-item");

    paletteItems.forEach(item => {
        item.addEventListener("mousedown", (e) => {
            e.preventDefault(); // Prevent default text selection, etc.

            // Get data from the palette item's data attributes
            const text = item.querySelector("span").innerText; // Or construct text based on data
            const blockType = item.dataset.blockType;
            const color = item.dataset.color || "#4c97ff"; // Get color from data attribute or default

            // Calculate initial position in world coordinates near the mouse
            // Adjusting for palette offset might be needed if it's not full height
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left; // Mouse X relative to canvas
            const mouseY = e.clientY - rect.top;  // Mouse Y relative to canvas

            const worldX = mouseX / zoomLevel + viewX;
            const worldY = mouseY / zoomLevel + viewY;

            // Create the new block centered under the mouse cursor
            const newBlock = new Block(worldX - 90, worldY - 20, text, color, blockType); // Approx center offset
            blocks.push(newBlock);

            // Immediately start dragging the new block
            selectedBlock = newBlock;
            isDragging = true;
            // Calculate offset relative to the new block's top-left
            offsetX = worldX - newBlock.x;
            offsetY = worldY - newBlock.y;

            // Move to end of array for top rendering
            blocks.splice(blocks.indexOf(newBlock), 1);
            blocks.push(newBlock);

            canvas.style.cursor = "grabbing";
            render(); // Render the new block being dragged
        });
    });
}

// --- Connection Highlighting ---

// Function to draw highlights for potential snap points
function checkBlockConnectionHighlight(draggedBlock, otherBlocks) {
    const snapDistance = 30; // Max distance for highlight
    let nearestConnection = null;
    let minDistance = snapDistance;

    // Don't highlight for reporters yet
    if (draggedBlock.type === "reporter") return;

     // Calculate dragged block's relevant points in world coordinates
     const dragTop = draggedBlock.y;
     const dragBottom = draggedBlock.y + draggedBlock.height + (draggedBlock.type === 'c-block' ? draggedBlock.cBlockHeight : 0);
     const dragNotchX = draggedBlock.x + draggedBlock.notchInset;
     const dragLeft = draggedBlock.x;


    for (const otherBlock of otherBlocks) {
        if (otherBlock === draggedBlock || otherBlock.type === "reporter") continue;

        const otherTotalHeight = otherBlock.height + (otherBlock.type === 'c-block' ? otherBlock.cBlockHeight : 0);
        const otherTop = otherBlock.y;
        const otherBottom = otherBlock.y + otherTotalHeight;
        const otherNotchX = otherBlock.x + otherBlock.notchInset;
        const otherInnerX = otherBlock.x + otherBlock.indentWidth;
        const otherInnerY = otherBlock.y + otherBlock.height;


        // 1. Highlight BELOW other block
        if (otherBlock.type !== "end-cap" && draggedBlock.type !== "cap") {
            const distance = Math.sqrt(Math.pow(dragNotchX - otherNotchX, 2) + Math.pow(dragTop - otherBottom, 2));
            if (distance < minDistance) {
                minDistance = distance;
                nearestConnection = { block: otherBlock, type: "below" };
            }
        }

        // 2. Highlight ABOVE other block
         if (draggedBlock.type !== "end-cap" && otherBlock.type !== "cap") {
            const distance = Math.sqrt(Math.pow(dragNotchX - otherNotchX, 2) + Math.pow(dragBottom - otherTop, 2));
             if (distance < minDistance) {
                 minDistance = distance;
                 nearestConnection = { block: otherBlock, type: "above" };
             }
         }

        // 3. Highlight INSIDE C-block
        if (otherBlock.type === "c-block" && draggedBlock.type !== "cap" && draggedBlock.type !== "end-cap") {
            const distance = Math.sqrt(Math.pow(dragLeft - otherInnerX, 2) + Math.pow(dragTop - otherInnerY, 2));
             if (distance < minDistance) {
                 minDistance = distance;
                 nearestConnection = { block: otherBlock, type: "inside" };
             }
        }
    }

    // Draw the highlight if a potential connection is found
    if (nearestConnection) {
        ctx.save();
        ctx.strokeStyle = "#FFD700"; // Gold highlight color
        ctx.lineWidth = 3; // Fixed line width for highlight
        ctx.setTransform(1, 0, 0, 1, 0, 0); // Draw in screen space

        const targetBlock = nearestConnection.block;
        const targetType = nearestConnection.type;

        // Convert target block's world coords to screen coords
        const targetScreenX = (targetBlock.x - viewX) * zoomLevel;
        const targetScreenY = (targetBlock.y - viewY) * zoomLevel;
        const targetScaledWidth = targetBlock.width * zoomLevel;
        const targetScaledHeight = targetBlock.height * zoomLevel;
        const targetScaledTotalHeight = (targetBlock.height + (targetBlock.type === 'c-block' ? targetBlock.cBlockHeight : 0)) * zoomLevel;
        const targetScaledIndent = targetBlock.indentWidth * zoomLevel;


        ctx.beginPath();
        if (targetType === "below") {
            // Highlight bottom edge of the target block
            const y = targetScreenY + targetScaledTotalHeight;
            ctx.moveTo(targetScreenX, y);
            ctx.lineTo(targetScreenX + targetScaledWidth, y);
        } else if (targetType === "above") {
            // Highlight top edge of the target block
             const y = targetScreenY;
             ctx.moveTo(targetScreenX, y);
             ctx.lineTo(targetScreenX + targetScaledWidth, y);
        } else if (targetType === "inside") {
            // Highlight the inner insertion point of the C-block
             const x = targetScreenX + targetScaledIndent;
             const y = targetScreenY + targetScaledHeight;
             ctx.moveTo(x, y - 5); // Small vertical line
             ctx.lineTo(x, y + 5);
        }
        ctx.stroke();
        ctx.restore();
    }
}


// --- Initialization ---

window.addEventListener("load", () => {
    // Initial setup
    addStarterBlocks(); // Add default blocks
    initializePalette(); // Set up palette listeners
    resizeCanvas(); // Set initial canvas size and render
    saveState(); // Save the initial state for undo

    // Create and append the info div (if not already in HTML)
    let infoDiv = document.getElementById("canvas-controls-info");
    if (!infoDiv) {
        infoDiv = document.createElement("div");
        infoDiv.id = "canvas-controls-info";
        infoDiv.className = "absolute top-10 right-10 bg-white/90 p-3 rounded-lg shadow-md text-xs z-10 border border-gray-300"; // Tailwind classes
        infoDiv.innerHTML = `
            <h3 class="text-sm font-semibold mb-1 pb-1 border-b border-gray-300">Controls</h3>
            <ul class="list-disc list-inside space-y-0.5">
                <li><strong>Pan:</strong> Space + Drag / Middle Click Drag</li>
                <li><strong>Zoom:</strong> Mouse Wheel / +/- Buttons</li>
                <li><strong>Select/Drag:</strong> Left Click</li>
                <li><strong>Undo:</strong> Ctrl/Cmd + Z</li>
                <li><strong>Redo:</strong> Ctrl/Cmd + Y / Cmd+Shift+Z</li>
            </ul>
        `;
        // Append to the main container, not body, to keep it relative
        document.getElementById("main").appendChild(infoDiv);
    }

    // Initial render call
    render();
    console.log("Visual Flow Initialized.");
});
