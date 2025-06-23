const express = require('express');
const fs=require("fs")
const path = require('path');
const app = express();
const PORT = 3000;


app.use(express.json());
app.use(express.static('public')); 

app.post('/api/ast', (req, res) => {
  const { ast, generatedCode, timestamp } = req.body;
  console.log('Generated Code:', generatedCode);
  console.log('AST:', JSON.stringify(ast, null, 2));
  
  
  res.json({ 
    success: true, 
    message: 'AST received successfully',
    astNodeCount: countNodes(ast)
  });
});

// API endpoint to receive LLVM IR
app.post('/api/llvm', (req, res) => {
  const { llvmIR, ast, timestamp } = req.body;
  console.log(llvmIR);
  fs.writeFileSync(`output.ll`, llvmIR);
  res.json({ 
    success: true, 
    message: 'LLVM IR received successfully',
    irLines: llvmIR.split('\n').length
  });
});

// Helper function to count AST nodes
function countNodes(node) {
  if (!node || typeof node !== 'object') return 0;
  if (Array.isArray(node)) {
    return node.reduce((count, item) => count + countNodes(item), 0);
  }
  
  let count = 1;
  for (const key in node) {
    if (typeof node[key] === 'object') {
      count += countNodes(node[key]);
    }
  }
  return count;
}

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});