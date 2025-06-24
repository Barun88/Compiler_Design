const express = require('express');
const fs=require("fs");
const {exec}=require("child_process");
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
  const { llvmIR } = req.body;
  const llFile = `temp_output_llvm.ll`;
  const outFile = `temp_output.exe`;

  // Write the LLVM IR to file
  fs.writeFileSync(llFile, llvmIR);

  // Compile LLVM IR using clang to an executable
  exec(`clang ${llFile} -o ${outFile}`, (compileErr, stdout, stderr) => {
    if (compileErr) {
      console.error('Compilation Error:', stderr);
      return res.status(500).json({ success: false, error: 'Compilation failed', stderr });
    }

    // Run the compiled executable
    exec(`${outFile}`, (runErr, stdout, stderr) => {
      if (runErr) {
        console.error('Execution Error:', stderr);
        return res.status(500).json({ success: false, error: 'Execution failed', stderr });
      }

      res.json({
        success: true,
        message: 'LLVM IR compiled and executed successfully',
        output: stdout.trim()
      });
    });
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