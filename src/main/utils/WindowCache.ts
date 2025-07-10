import { ICache } from '../utils/ICache';
import { injectable } from 'tsyringe';

@injectable()
export class WindowCache implements ICache<string, any> {
  private cache = new Map<string, { mode: string; lastClassified: number }>();

  get(key: string): { mode: string; lastClassified: number } | undefined {
    return this.cache.get(key);
  }

  set(key: string, value: { mode: string; lastClassified: number }): void {
    this.cache.set(key, value);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string): void {
    this.cache.delete(key);
  }
  
}
