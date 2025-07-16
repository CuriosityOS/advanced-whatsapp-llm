/**
 * UUID Generator Tool
 * Generates various types of unique identifiers
 */

const { v4: uuidv4, v1: uuidv1, v5: uuidv5, v3: uuidv3 } = require('uuid');
const crypto = require('crypto');

module.exports = {
  name: 'uuid',
  description: 'Generate unique identifiers (UUIDs) and random strings for development and testing',
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        description: 'Type of identifier to generate',
        enum: ['uuid4', 'uuid1', 'uuid5', 'uuid3', 'nanoid', 'random', 'short'],
        default: 'uuid4'
      },
      count: {
        type: 'number',
        description: 'Number of identifiers to generate',
        minimum: 1,
        maximum: 20,
        default: 1
      },
      namespace: {
        type: 'string',
        description: 'Namespace for UUID v5/v3 (required for those types)'
      },
      name: {
        type: 'string',
        description: 'Name for UUID v5/v3 (required for those types)'
      },
      length: {
        type: 'number',
        description: 'Length for random string (default: 16)',
        minimum: 4,
        maximum: 64,
        default: 16
      }
    }
  },
  enabled: true,
  category: 'developer',
  version: '1.0.0',

  async execute({ type = 'uuid4', count = 1, namespace, name, length = 16 }, context) {
    try {
      const identifiers = [];
      
      for (let i = 0; i < count; i++) {
        let identifier;
        
        switch (type) {
          case 'uuid1':
            identifier = uuidv1();
            break;
            
          case 'uuid3':
            if (!namespace || !name) {
              return {
                success: false,
                error: 'UUID v3 requires both namespace and name parameters',
                message: 'Please provide both namespace and name for UUID v3 generation.'
              };
            }
            identifier = uuidv3(name, namespace);
            break;
            
          case 'uuid5':
            if (!namespace || !name) {
              return {
                success: false,
                error: 'UUID v5 requires both namespace and name parameters',
                message: 'Please provide both namespace and name for UUID v5 generation.'
              };
            }
            identifier = uuidv5(name, namespace);
            break;
            
          case 'nanoid':
            identifier = this.generateNanoId(length);
            break;
            
          case 'random':
            identifier = this.generateRandomString(length);
            break;
            
          case 'short':
            identifier = this.generateShortId();
            break;
            
          case 'uuid4':
          default:
            identifier = uuidv4();
            break;
        }
        
        identifiers.push(identifier);
      }

      const typeDescriptions = {
        uuid4: 'Random UUID (v4)',
        uuid1: 'Time-based UUID (v1)',
        uuid3: 'Name-based UUID using MD5 (v3)',
        uuid5: 'Name-based UUID using SHA-1 (v5)',
        nanoid: 'URL-safe random string',
        random: 'Random alphanumeric string',
        short: 'Short random identifier'
      };

      const resultMessage = count === 1 
        ? `🆔 **${typeDescriptions[type]}:**\n\`${identifiers[0]}\``
        : `🆔 **${count} ${typeDescriptions[type]}s:**\n${identifiers.map(id => `\`${id}\``).join('\n')}`;

      return {
        success: true,
        data: {
          type,
          count,
          identifiers,
          description: typeDescriptions[type]
        },
        message: resultMessage
      };

    } catch (error) {
      console.error('UUID generation error:', error);
      return {
        success: false,
        error: error.message,
        message: `Sorry, I couldn't generate the ${type} identifier. Please check your parameters.`
      };
    }
  },

  generateNanoId(length) {
    const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return result;
  },

  generateRandomString(length) {
    const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return result;
  },

  generateShortId() {
    return Math.random().toString(36).substring(2, 9);
  }
};