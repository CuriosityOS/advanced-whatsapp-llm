/**
 * Calculator Tool
 * Performs mathematical calculations safely
 */

module.exports = {
  name: 'calculator',
  description: 'Perform mathematical calculations and solve math problems',
  parameters: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: 'Mathematical expression to evaluate (e.g., "2 + 2", "sqrt(16)", "sin(30)")'
      }
    },
    required: ['expression']
  },
  enabled: true,
  category: 'utility',
  version: '1.0.0',

  async execute({ expression }, context) {
    try {
      // Basic validation to prevent code injection
      const safeExpression = expression.replace(/[^0-9+\-*/.()^%\s\w]/g, '');
      
      if (safeExpression !== expression) {
        return {
          success: false,
          error: 'Invalid characters in mathematical expression',
          message: 'Please use only numbers, basic operators (+, -, *, /, ^, %), and common math functions.'
        };
      }

      // Replace common math functions with JavaScript equivalents
      let jsExpression = safeExpression
        .replace(/\^/g, '**')  // Power operator
        .replace(/sqrt\(/g, 'Math.sqrt(')
        .replace(/sin\(/g, 'Math.sin(')
        .replace(/cos\(/g, 'Math.cos(')
        .replace(/tan\(/g, 'Math.tan(')
        .replace(/log\(/g, 'Math.log(')
        .replace(/abs\(/g, 'Math.abs(')
        .replace(/floor\(/g, 'Math.floor(')
        .replace(/ceil\(/g, 'Math.ceil(')
        .replace(/round\(/g, 'Math.round(')
        .replace(/pi/gi, 'Math.PI')
        .replace(/e/gi, 'Math.E');

      // Evaluate the expression safely
      const result = Function(`"use strict"; return (${jsExpression})`)();

      if (typeof result !== 'number' || !isFinite(result)) {
        return {
          success: false,
          error: 'Invalid calculation result',
          message: 'The calculation resulted in an invalid number.'
        };
      }

      return {
        success: true,
        data: {
          expression: expression,
          result: result,
          formatted: Number.isInteger(result) ? result.toString() : result.toFixed(6).replace(/\.?0+$/, '')
        },
        message: `${expression} = ${result}`
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Could not evaluate the mathematical expression. Please check the syntax.'
      };
    }
  }
};