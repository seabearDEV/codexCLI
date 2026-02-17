import { color } from '../formatting';

// Conditionally log debug information
export function debug(message: string, data?: unknown): void {
  if (process.env.DEBUG === 'true') {
    console.log(color.boldColors.yellow(`[DEBUG] ${message}`));
    if (data !== undefined) console.log(color.gray(JSON.stringify(data, null, 2)));
  }
}