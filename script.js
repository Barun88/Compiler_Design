const workspace = Blockly.inject('blocklyDiv', {
  toolbox: document.getElementById('toolbox'),
  grid: {
    spacing: 20,
    length: 3,
    colour: '#ccc',
    snap: true
  },
  trashcan: true,
  zoom: {
    controls: true,
    wheel: false,
    startScale: 1.0,
    maxScale: 2,
    minScale: 0.5
  }
});

let generatedcode='';

function generateCode() {
  generatedcode = Blockly.JavaScript.workspaceToCode(workspace);
  document.getElementById('generatedCode').innerText = generatedcode || '// No blocks';
}

function clearWorkspace() {
  workspace.clear();
  generatedcode='';
  document.getElementById('generatedCode').innerText = '// Workspace cleared';
}

// Auto-generate code when blocks change
workspace.addChangeListener(generateCode);

// Initial generation
generateCode();

function logCode(){
    console.log("Current Generated Js Code:\n",generatedcode);
}

