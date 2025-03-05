import { color } from '../formatting';

// Conditionally log debug information
export function debug(message: string, data?: any): void {
  if (process.env.DEBUG === 'true') {
    console.log(color.gray(`[DEBUG] ${message}`));
    if (data) console.log(color.gray(JSON.stringify(data, null, 2)));
  }
}