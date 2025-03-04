import { flattenObject } from '../utils';

function nestedSetValue(obj: Record<string, any>, path: string, value: any): void {
  const parts = path.split('.');
  let current = obj;
  
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    current[key] = current[key] || {};
    current = current[key];
  }
  
  current[parts[parts.length - 1]] = value;
}

describe('Utils', () => {
  describe('flattenObject', () => {
    it('flattens nested objects into dot notation', () => {
      const input = {
        server: {
          production: {
            ip: '192.168.1.100',
            port: 8080
          },
          development: {
            ip: '127.0.0.1',
            port: 3000
          }
        },
        app: {
          name: 'TestApp'
        }
      };
      
      const expected = {
        'server.production.ip': '192.168.1.100',
        'server.production.port': 8080,
        'server.development.ip': '127.0.0.1',
        'server.development.port': 3000,
        'app.name': 'TestApp'
      };
      
      expect(flattenObject(input)).toEqual(expected);
    });
    
    it('handles empty objects', () => {
      expect(flattenObject({})).toEqual({});
    });
    
    it('preserves non-nested properties', () => {
      const input = { name: 'Test', value: 123 };
      expect(flattenObject(input)).toEqual(input);
    });
  });
  
  describe('nestedSetValue', () => {
    it('sets a value using dot notation path', () => {
      const obj: Record<string, any> = {};
      nestedSetValue(obj, 'server.production.ip', '192.168.1.100');
      expect(obj).toEqual({
        server: {
          production: {
            ip: '192.168.1.100'
          }
        }
      });
    });
    
    it('updates an existing value', () => {
      const obj: Record<string, any> = {
        server: {
          production: {
            ip: '192.168.1.100'
          }
        }
      };
      nestedSetValue(obj, 'server.production.ip', '192.168.1.200');
      expect(obj).toEqual({
        server: {
          production: {
            ip: '192.168.1.200'
          }
        }
      });
    });
    
    it('creates intermediate objects as needed', () => {
      const obj: Record<string, any> = {};
      nestedSetValue(obj, 'a.very.deep.nested.path', 'value');
      expect(obj.a?.very?.deep?.nested?.path).toBe('value');
    });
  });
});