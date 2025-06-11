// Blockly workspace injection
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

let generatedcode = '';
let ast = '';

// Generate JS code from blocks
function generateCode() {
  generatedcode = Blockly.JavaScript.workspaceToCode(workspace);
  document.getElementById('generatedCode').innerText = generatedcode || '// No blocks';
}

// Clear workspace and output
function clearWorkspace() {
  workspace.clear();
  generatedcode = '';
  document.getElementById('generatedCode').innerText = '// Workspace cleared';
}

// Strip metadata like start/end from AST
function stripMetadata(node) {
  if (Array.isArray(node)) {
    return node.map(stripMetadata);
  } else if (node && typeof node === 'object') {
    const newNode = {};
    for (const key in node) {
      if (key !== 'start' && key !== 'end') {
        newNode[key] = stripMetadata(node[key]);
      }
    }
    return newNode;
  }
  return node;
}

// Transform window.alert(...) → console.log(...)
function transformAlertToConsoleLog(node) {
  if (!node || typeof node !== 'object') return;

  if (
    node.type === 'ExpressionStatement' &&
    node.expression?.type === 'CallExpression' &&
    node.expression.callee?.object?.name === 'window' &&
    node.expression.callee?.property?.name === 'alert'
  ) {
    node.expression.callee.object.name = 'console';
    node.expression.callee.property.name = 'log';
  }

  for (const key in node) {
    transformAlertToConsoleLog(node[key]);
  }
}

// Transform console.log(...) → PrintStatement (custom)
function transformConsoleLogToPrint(node) {
  if (!node || typeof node !== 'object') return;

  if (
    node.type === 'ExpressionStatement' &&
    node.expression?.type === 'CallExpression' &&
    node.expression.callee?.object?.name === 'console' &&
    node.expression.callee?.property?.name === 'log'
  ) {
    node.type = 'PrintStatement';
    node.argument = node.expression.arguments[0];
    delete node.expression;
  }

  for (const key in node) {
    transformConsoleLogToPrint(node[key]);
  }
}

// Parse generated code to AST and apply filters
function getAst() {
  try {
    ast = acorn.parse(generatedcode, {
      ecmaVersion: 'latest',
      locations: false
    });

    transformAlertToConsoleLog(ast);
    transformConsoleLogToPrint(ast);
    const filteredAst = stripMetadata(ast);

    console.log("Transformed AST:", filteredAst);
    document.getElementById('generatedCode').innerText = JSON.stringify(filteredAst, null, 2);
  } catch (error) {
    console.error("Failed to parse:", error);
    document.getElementById('generatedCode').innerText = '// Failed to generate AST';
  }
}

// For console output
function logCode() {
  console.log("Current Generated AST:\n", JSON.stringify(ast, null, 2));
}