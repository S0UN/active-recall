import { ICache } from '../utils/ICache';
import { injectable } from 'tsyringe';
import { PollingConfigService } from '../configs/PollingConfigService';

@injectable()
export class WindowCache implements ICache<string, { mode: string; lastClassified: number }> {
  private readonly cache = new Map<string, { mode: string; lastClassified: number }>();
  private readonly configService = new PollingConfigService();

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

  startTTL(): void {
    setInterval(() => {
      this.createTTL();
    }, 60 * 1000); // Check every minute
  }

  createTTL():void{
    if (this.cache.size > 0) {
      const now = Date.now();
      for (const [key, value] of this.cache.entries()) {
        if (now - value.lastClassified > this.configService.windowCacheTTL) { 
          this.cache.delete(key);
        }
      }
    }
  }

}
