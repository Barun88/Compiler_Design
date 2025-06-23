// LLVM IR Generator from JavaScript AST
class LLVMIRGenerator {
  constructor() {
    this.output = [];
    this.labelCounter = 0;
    this.variableCounter = 0;
    this.variables = new Map(); // variable name -> { type, llvmName }
    this.functions = new Map();
    this.currentFunction = null;
    this.stringConstants = new Map(); // string -> global variable name
    this.stringCounter = 0;
  }

  // Generate a new label
  newLabel() {
    return `label${this.labelCounter++}`;
  }

  // Generate a new variable name
  newVariable() {
    return `%${this.variableCounter++}`;
  }

  // Generate a new string constant
  newStringConstant(str) {
    if (this.stringConstants.has(str)) {
      return this.stringConstants.get(str);
    }
    const globalName = `@.str.${this.stringCounter++}`;
    this.stringConstants.set(str, globalName);
    return globalName;
  }

  // Add line to output
  emit(line) {
    this.output.push(line);
  }

  // Generate LLVM IR from AST
  generate(ast) {
    this.output = [];
    this.labelCounter = 0;
    this.variableCounter = 0;
    this.variables.clear();
    this.functions.clear();
    this.stringConstants.clear();
    this.stringCounter = 0;

    // Add standard library declarations
    this.addStandardLibrary();

    // Process the AST
    this.visitProgram(ast);

    // Add string constants at the end
    this.addStringConstants();

    return this.output.join('\n');
  }

  // Add standard library function declarations
  addStandardLibrary() {
    this.emit('; Standard library functions');
    this.emit('declare i32 @printf(i8*, ...)');
    this.emit('declare i32 @scanf(i8*, ...)');
    this.emit('declare i8* @malloc(i64)');
    this.emit('declare void @free(i8*)');
    this.emit('declare i32 @puts(i8*)');
    this.emit('');
  }

  // Add string constants
  addStringConstants() {
    if (this.stringConstants.size > 0) {
      this.emit('\n; String constants');
      for (const [str, globalName] of this.stringConstants) {
        const escaped = str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
        const length = escaped.length + 1; // +1 for null terminator
        this.emit(`${globalName} = private unnamed_addr constant [${length} x i8] c"${escaped}\\00", align 1`);
      }
    }
  }

  // Visit program node
  visitProgram(node) {
    this.emit('');

    // Create main function
    this.emit('define i32 @main() {');
    this.emit('entry:');
    
    // Process body statements
    if (node.body) {
      for (const stmt of node.body) {
        this.visitStatement(stmt);
      }
    }

    // Return 0 from main
    this.emit('  ret i32 0');
    this.emit('}');
  }

  // Visit statement
  visitStatement(node) {
    switch (node.type) {
      case 'VariableDeclaration':
        this.visitVariableDeclaration(node);
        break;
      case 'ExpressionStatement':
        this.visitExpressionStatement(node);
        break;
      case 'PrintStatement': // Custom print statement
        this.visitPrintStatement(node);
        break;
      case 'IfStatement':
        this.visitIfStatement(node);
        break;
      case 'WhileStatement':
        this.visitWhileStatement(node);
        break;
      case 'ForStatement':
        this.visitForStatement(node);
        break;
      case 'BlockStatement':
        this.visitBlockStatement(node);
        break;
      case 'ReturnStatement':
        this.visitReturnStatement(node);
        break;
      default:
        this.emit(`  ; Unsupported statement: ${node.type}`);
    }
  }

  // Visit variable declaration
  visitVariableDeclaration(node) {
    for (const declarator of node.declarations) {
      const varName = declarator.id.name;
      const llvmVar = this.newVariable();
      
      // Allocate space for the variable
      this.emit(`  ${llvmVar} = alloca i32, align 4`);
      this.variables.set(varName, { type: 'i32', llvmName: llvmVar });

      // Initialize if there's an initializer
      if (declarator.init) {
        const valueVar = this.visitExpression(declarator.init);
        this.emit(`  store i32 ${valueVar}, i32* ${llvmVar}, align 4`);
      }
    }
  }

  // Visit expression statement
  visitExpressionStatement(node) {
    this.visitExpression(node.expression);
  }

  // Visit print statement (custom)
  visitPrintStatement(node) {
    const argVar = this.visitExpression(node.argument);
    
    // Check if it's a string or number
    if (node.argument.type === 'Literal' && typeof node.argument.value === 'string') {
      // Print string
      const strGlobal = this.newStringConstant(node.argument.value);
      const strPtr = this.newVariable();
      this.emit(`  ${strPtr} = getelementptr inbounds [${node.argument.value.length + 1} x i8], [${node.argument.value.length + 1} x i8]* ${strGlobal}, i64 0, i64 0`);
      this.emit(`  call i32 @puts(i8* ${strPtr})`);
    } else {
      // Print number
      const formatStr = this.newStringConstant('%d\\n');
      const formatPtr = this.newVariable();
      this.emit(`  ${formatPtr} = getelementptr inbounds [4 x i8], [4 x i8]* ${formatStr}, i64 0, i64 0`);
      this.emit(`  call i32 (i8*, ...) @printf(i8* ${formatPtr}, i32 ${argVar})`);
    }
  }

  // Visit if statement
  visitIfStatement(node) {
    const testVar = this.visitExpression(node.test);
    const thenLabel = this.newLabel();
    const elseLabel = node.alternate ? this.newLabel() : null;
    const endLabel = this.newLabel();

    // Compare with 0 (false)
    const condVar = this.newVariable();
    this.emit(`  ${condVar} = icmp ne i32 ${testVar}, 0`);
    
    if (elseLabel) {
      this.emit(`  br i1 ${condVar}, label %${thenLabel}, label %${elseLabel}`);
    } else {
      this.emit(`  br i1 ${condVar}, label %${thenLabel}, label %${endLabel}`);
    }

    // Then block
    this.emit(`${thenLabel}:`);
    this.visitStatement(node.consequent);
    this.emit(`  br label %${endLabel}`);

    // Else block
    if (node.alternate) {
      this.emit(`${elseLabel}:`);
      this.visitStatement(node.alternate);
      this.emit(`  br label %${endLabel}`);
    }

    // End block
    this.emit(`${endLabel}:`);
  }

  // Visit while statement
  visitWhileStatement(node) {
    const condLabel = this.newLabel();
    const bodyLabel = this.newLabel();
    const endLabel = this.newLabel();

    this.emit(`  br label %${condLabel}`);

    // Condition block
    this.emit(`${condLabel}:`);
    const testVar = this.visitExpression(node.test);
    const condVar = this.newVariable();
    this.emit(`  ${condVar} = icmp ne i32 ${testVar}, 0`);
    this.emit(`  br i1 ${condVar}, label %${bodyLabel}, label %${endLabel}`);

    // Body block
    this.emit(`${bodyLabel}:`);
    this.visitStatement(node.body);
    this.emit(`  br label %${condLabel}`);

    // End block
    this.emit(`${endLabel}:`);
  }

  // Visit block statement
  visitBlockStatement(node) {
    for (const stmt of node.body) {
      this.visitStatement(stmt);
    }
  }

  // Visit return statement
  visitReturnStatement(node) {
    if (node.argument) {
      const valueVar = this.visitExpression(node.argument);
      this.emit(`  ret i32 ${valueVar}`);
    } else {
      this.emit(`  ret i32 0`);
    }
  }

  // Visit expression and return the variable containing the result
  visitExpression(node) {
    switch (node.type) {
      case 'Literal':
        return this.visitLiteral(node);
      case 'Identifier':
        return this.visitIdentifier(node);
      case 'BinaryExpression':
        return this.visitBinaryExpression(node);
      case 'UnaryExpression':
        return this.visitUnaryExpression(node);
      case 'AssignmentExpression':
        return this.visitAssignmentExpression(node);
      case 'UpdateExpression':
        return this.visitUpdateExpression(node);
      case 'CallExpression':
        return this.visitCallExpression(node);
      default:
        this.emit(`  ; Unsupported expression: ${node.type}`);
        return '0';
    }
  }

  // Visit literal
  visitLiteral(node) {
    if (typeof node.value === 'number') {
      return node.value.toString();
    } else if (typeof node.value === 'string') {
      // For string literals used in expressions, we need to return a pointer
      const strGlobal = this.newStringConstant(node.value);
      const strPtr = this.newVariable();
      this.emit(`  ${strPtr} = getelementptr inbounds [${node.value.length + 1} x i8], [${node.value.length + 1} x i8]* ${strGlobal}, i64 0, i64 0`);
      return strPtr;
    } else if (typeof node.value === 'boolean') {
      return node.value ? '1' : '0';
    }
    return '0';
  }

  // Visit identifier
  visitIdentifier(node) {
    const variable = this.variables.get(node.name);
    if (variable) {
      const loadVar = this.newVariable();
      this.emit(`  ${loadVar} = load ${variable.type}, ${variable.type}* ${variable.llvmName}, align 4`);
      return loadVar;
    }
    this.emit(`  ; Undefined variable: ${node.name}`);
    return '0';
  }

  // Visit binary expression
  visitBinaryExpression(node) {
    const leftVar = this.visitExpression(node.left);
    const rightVar = this.visitExpression(node.right);
    const resultVar = this.newVariable();

    switch (node.operator) {
      case '+':
        this.emit(`  ${resultVar} = add i32 ${leftVar}, ${rightVar}`);
        break;
      case '-':
        this.emit(`  ${resultVar} = sub i32 ${leftVar}, ${rightVar}`);
        break;
      case '*':
        this.emit(`  ${resultVar} = mul i32 ${leftVar}, ${rightVar}`);
        break;
      case '/':
        this.emit(`  ${resultVar} = sdiv i32 ${leftVar}, ${rightVar}`);
        break;
      case '%':
        this.emit(`  ${resultVar} = srem i32 ${leftVar}, ${rightVar}`);
        break;
      case '<':
        this.emit(`  ${resultVar} = icmp slt i32 ${leftVar}, ${rightVar}`);
        break;
      case '>':
        this.emit(`  ${resultVar} = icmp sgt i32 ${leftVar}, ${rightVar}`);
        break;
      case '<=':
        this.emit(`  ${resultVar} = icmp sle i32 ${leftVar}, ${rightVar}`);
        break;
      case '>=':
        this.emit(`  ${resultVar} = icmp sge i32 ${leftVar}, ${rightVar}`);
        break;
      case '==':
        this.emit(`  ${resultVar} = icmp eq i32 ${leftVar}, ${rightVar}`);
        break;
      case '!=':
        this.emit(`  ${resultVar} = icmp ne i32 ${leftVar}, ${rightVar}`);
        break;
      case '&&':
        this.emit(`  ${resultVar} = and i32 ${leftVar}, ${rightVar}`);
        break;
      case '||':
        this.emit(`  ${resultVar} = or i32 ${leftVar}, ${rightVar}`);
        break;
      default:
        this.emit(`  ; Unsupported operator: ${node.operator}`);
        return '0';
    }

    return resultVar;
  }

  // Visit assignment expression
  visitAssignmentExpression(node) {
    const valueVar = this.visitExpression(node.right);
    
    if (node.left.type === 'Identifier') {
      const variable = this.variables.get(node.left.name);
      if (variable) {
        this.emit(`  store i32 ${valueVar}, i32* ${variable.llvmName}, align 4`);
      } else {
        this.emit(`  ; Undefined variable in assignment: ${node.left.name}`);
      }
    }
    
    return valueVar;
  }

  // Visit update expression (++, --)
  visitUpdateExpression(node) {
    if (node.argument.type === 'Identifier') {
      const variable = this.variables.get(node.argument.name);
      if (variable) {
        const currentVar = this.newVariable();
        const resultVar = this.newVariable();
        
        this.emit(`  ${currentVar} = load ${variable.type}, ${variable.type}* ${variable.llvmName}, align 4`);
        
        if (node.operator === '++') {
          this.emit(`  ${resultVar} = add i32 ${currentVar}, 1`);
        } else if (node.operator === '--') {
          this.emit(`  ${resultVar} = sub i32 ${currentVar}, 1`);
        }
        
        this.emit(`  store i32 ${resultVar}, i32* ${variable.llvmName}, align 4`);
        
        return node.prefix ? resultVar : currentVar;
      }
    }
    return '0';
  }

  // Visit call expression
  visitCallExpression(node) {
    this.emit(`  ; Function call not fully implemented: ${node.callee.name || 'unknown'}`);
    return '0';
  }
}

// Global instance
const llvmGenerator = new LLVMIRGenerator();

// Function to generate LLVM IR from current AST
function generateLLVMIR() {
  if (!ast) {
    alert('No AST available. Please generate AST first.');
    return;
  }

  try {
    const llvmIR = llvmGenerator.generate(ast);
    
    // Display the LLVM IR
    document.getElementById('generatedCode').innerText = llvmIR;
    
    console.log("Generated LLVM IR:");
    console.log(llvmIR);
    
    return llvmIR;
  } catch (error) {
    console.error("Failed to generate LLVM IR:", error);
    document.getElementById('generatedCode').innerText = `// Failed to generate LLVM IR: ${error.message}`;
    return null;
  }
}

// Function to send LLVM IR to server
async function sendLLVMIRToServer() {
  const llvmIR = generateLLVMIR();
  
  if (!llvmIR) {
    return;
  }

  try {
    const response = await fetch('/api/llvm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        llvmIR: llvmIR,
        ast: ast,
        timestamp: new Date().toISOString()
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('LLVM IR sent successfully:', result);
      alert('LLVM IR sent to server successfully!');
    } else {
      console.error('Failed to send LLVM IR. Status:', response.status);
      alert(`Failed to send LLVM IR. Server responded with status: ${response.status}`);
    }
  } catch (error) {
    console.error('Error sending LLVM IR:', error);
    alert('Error sending LLVM IR to server. Check console for details.');
  }
}