const canvas = document.getElementById("code_space");
const ctx = canvas.getContext("2d");
const grid_size=50;
function resizeCanvas() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    ctx.scale(ratio, ratio);
}

resizeCanvas();

let blocks = [];
let selectedBlock = null;
let offsetX = 0, offsetY = 0;

class Block {
    constructor(x, y, text,color) {
        this.x = x;
        this.y = y;
        this.color=color;
        this.width = 160;
        this.height = 50;
        this.text = text;
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.strokeStyle = "#b08102";
        ctx.strokeRect(this.x, this.y, this.width, this.height);
        ctx.fillStyle = "black";
        ctx.font = "20px Arial";
        ctx.fillText(this.text, this.x + 10, this.y + 30);
    }

    isInside(mx, my) {
        return mx > this.x && mx < this.x + this.width &&
               my > this.y && my < this.y + this.height;
    }

    snap_to_grid(){
        this.x=Math.round(this.x/grid_size)*grid_size;
        this.y=Math.round(this.y/grid_size)*grid_size;
    }
}

blocks.push(new Block(100, 100, "Start","red"));

function drawGrid() {
    ctx.strokeStyle = "rgba(200, 200, 200, 0.5)";
    ctx.lineWidth = 1;

    for (let x = 0; x < canvas.width; x += GRID_SIZE) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }

    for (let y = 0; y < canvas.height; y += GRID_SIZE) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    blocks.forEach(block => block.draw());
}



canvas.onmousedown = (e) => {
    const mouseX = e.offsetX;
    const mouseY = e.offsetY;

    for (let block of blocks) {
        if (block.isInside(mouseX, mouseY)) {
            selectedBlock = block;
            offsetX = mouseX - block.x;
            offsetY = mouseY - block.y;
            break;
        }
    }
};

canvas.onmousemove = (e) => {
    if (selectedBlock) {
        selectedBlock.x = e.offsetX - offsetX;
        selectedBlock.y = e.offsetY - offsetY;
        render();
    }
};

canvas.onmouseup = () => {
    if(selectedBlock)
    {
        selectedBlock.snap_to_grid();
        render();
        selectedBlock=null;
    }
};

render();

window.onresize = () => {
    resizeCanvas();
    render();
};
