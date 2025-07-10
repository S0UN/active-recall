import { ICache } from '../utils/ICache';
import { injectable } from 'tsyringe';

@injectable()
class WindowCache implements ICache<string, any> {
  private cache = new Map<string, any>();

  get(key: string): any | undefined {
    return this.cache.get(key);
  }

  set(key: string, value: any): void {
    this.cache.set(key, value);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string): void {
    this.cache.delete(key);
  }
  
}
