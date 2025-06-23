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
  ast = '';
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

// Send AST to server
async function sendAstToServer() {
  if (!ast) {
    alert('No AST generated yet. Please generate AST first.');
    return;
  }

  try {
    // Show loading state
    const sendButton = document.getElementById('sendAstButton');
    const originalText = sendButton.textContent;
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
    // Reset button state
    const sendButton = document.getElementById('sendAstButton');
    sendButton.textContent = 'Send AST to Server';
    sendButton.disabled = false;
  }
}

// Parse generated code to AST and apply filters
function getAst() {
  if (!generatedcode) {
    alert('No code generated yet. Please add blocks and generate code first.');
    return;
  }

  try {
    const parsedAst = acorn.parse(generatedcode, {
      ecmaVersion: 'latest',
      locations: false
    });
    
    // Apply transformations
    transformAlertToConsoleLog(parsedAst);
    transformConsoleLogToPrint(parsedAst);
    const filteredAst = stripMetadata(parsedAst);
    
    // Store the filtered AST globally
    ast = filteredAst;
    
    console.log("Transformed AST:", filteredAst);
    document.getElementById('generatedCode').innerText = JSON.stringify(filteredAst, null, 2);
    
    // Enable the send button now that we have an AST
    const sendButton = document.getElementById('sendAstButton');
    if (sendButton) {
      sendButton.disabled = false;
    }
    
  } catch (error) {
    console.error("Failed to parse:", error);
    document.getElementById('generatedCode').innerText = `// Failed to generate AST: ${error.message}`;
    ast = ''; // Clear AST on error
  }
}

// For console output
function logCode() {
  if (ast) {
    console.log("Current Generated AST:\n", JSON.stringify(ast, null, 2));
  } else {
    console.log("No AST available. Generate AST first.");
  }
}

// Auto-send AST to server (optional - uncomment if you want automatic sending)
function getAstAndSend() {
  getAst();
  if (ast) {
    setTimeout(() => sendAstToServer(), 100); // Small delay to ensure AST is processed
  }
}

// Initialize - disable send button until AST is generated
document.addEventListener('DOMContentLoaded', function() {
  const sendButton = document.getElementById('sendAstButton');
  if (sendButton) {
    sendButton.disabled = true;
  }
});