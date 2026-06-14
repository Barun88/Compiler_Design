// Inject Blockly workspace into the webpage
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

// Global variables to store generated JavaScript code and AST
let generatedcode = '';
let ast = '';

// Convert Blockly blocks into JavaScript code
function generateCode() {
  generatedcode = Blockly.JavaScript.workspaceToCode(workspace);
  document.getElementById('generatedCode').innerText =
    generatedcode || '// No blocks';
}

// Clear workspace and reset generated outputs
function clearWorkspace() {
  workspace.clear();
  generatedcode = '';
  ast = '';
  document.getElementById('generatedCode').innerText =
    '// Workspace cleared';
}

// Remove unnecessary parser metadata (start/end positions)
// to make AST cleaner and easier to read/store
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

// Transform window.alert() calls into console.log()
// This standardizes output handling before further processing
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

  // Recursively visit child nodes
  for (const key in node) {
    transformAlertToConsoleLog(node[key]);
  }
}

// Convert console.log() nodes into custom PrintStatement nodes
// This creates a language-independent AST representation
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

  // Traverse entire AST recursively
  for (const key in node) {
    transformConsoleLogToPrint(node[key]);
  }
}

// Send generated AST and source code to backend server
async function sendAstToServer() {
  if (!ast) {
    alert('No AST generated yet. Please generate AST first.');
    return;
  }

  try {
    const sendButton = document.getElementById('sendAstButton');
    const originalText = sendButton.textContent;

    // Display loading state
    sendButton.textContent = 'Sending...';
    sendButton.disabled = true;

    const response = await fetch('/api/ast', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ast: ast,
        generatedCode: generatedcode,
        timestamp: new Date().toISOString()
      })
    });

    if (response.ok) {
      const result = await response.json();
      console.log('AST sent successfully:', result);
      alert('AST sent to server successfully!');
    } else {
      console.error('Failed to send AST. Status:', response.status);
      alert(`Failed to send AST. Server responded with status: ${response.status}`);
    }
  } catch (error) {
    console.error('Error sending AST:', error);
    alert('Error sending AST to server. Check console for details.');
  } finally {
    // Restore button state
    const sendButton = document.getElementById('sendAstButton');
    sendButton.textContent = 'Send AST to Server';
    sendButton.disabled = false;
  }
}

// Parse generated JavaScript into AST using Acorn parser
function getAst() {
  if (!generatedcode) {
    alert('No code generated yet. Please add blocks and generate code first.');
    return;
  }

  try {
    // Generate AST from JavaScript code
    const parsedAst = acorn.parse(generatedcode, {
      ecmaVersion: 'latest',
      locations: false
    });

    // Apply custom AST transformations
    transformAlertToConsoleLog(parsedAst);
    transformConsoleLogToPrint(parsedAst);

    // Remove unnecessary metadata
    const filteredAst = stripMetadata(parsedAst);

    // Store final AST globally
    ast = filteredAst;

    console.log("Transformed AST:", filteredAst);

    // Display AST in formatted JSON structure
    document.getElementById('generatedCode').innerText =
      JSON.stringify(filteredAst, null, 2);

    // Enable server upload button
    const sendButton = document.getElementById('sendAstButton');
    if (sendButton) {
      sendButton.disabled = false;
    }

  } catch (error) {
    console.error("Failed to parse:", error);
    document.getElementById('generatedCode').innerText =
      `// Failed to generate AST: ${error.message}`;

    ast = '';
  }
}

// Print current AST in browser console
function logCode() {
  if (ast) {
    console.log(
      "Current Generated AST:\n",
      JSON.stringify(ast, null, 2)
    );
  } else {
    console.log("No AST available. Generate AST first.");
  }
}

// Utility function:
// Generate AST and automatically send it to backend
function getAstAndSend() {
  getAst();

  if (ast) {
    setTimeout(() => sendAstToServer(), 100);
  }
}

// Initialize page
// Send button remains disabled until AST is generated
document.addEventListener('DOMContentLoaded', function() {
  const sendButton = document.getElementById('sendAstButton');

  if (sendButton) {
    sendButton.disabled = true;
  }
});
