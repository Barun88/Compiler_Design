//injection [properties and behaviour of the codespace]
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
    wheel: true,
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

//acron parsing function
 function getAst() {
    try {
      const ast = acorn.parse(generatedcode, {ecmaVersion: "latest",locations:false});
      //console.log("AST:", ast);
      document.getElementById('generatedCode').innerText = JSON.stringify(ast, null, 2);
    } catch (error) {
      console.error("Failed to parse:", error);
      document.getElementById('generatedCode').innerText = '// Failed to generate AST';
    }
  }

  //for future reference -> i need to filter the ast generation for llvm ir things to remove:[startIndicator,endIndicator] also convert the windows.alert function to a simple console log function, then filter and simpilfy it further to a print statement :D


function logCode(){
    console.log("Current Generated Js Code:\n",generatedcode);
}

