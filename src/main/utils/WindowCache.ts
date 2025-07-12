import { ICache } from '../utils/ICache';
import { injectable } from 'tsyringe';

@injectable()
export class WindowCache implements ICache<string, { mode: string; lastClassified: number }> {
  private readonly cache = new Map<string, { mode: string; lastClassified: number }>();

  get(key: string): { mode: string; lastClassified: number }  {
    return this.cache.get(key) as { mode: string; lastClassified: number };
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
