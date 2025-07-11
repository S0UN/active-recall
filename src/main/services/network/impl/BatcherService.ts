import { injectable } from 'tsyringe';
import { IBatcherService } from '../IBatcherService';

@injectable()
export class BatcherService implements IBatcherService {
  public add(text: string): void {
    // Placeholder implementation
    console.log('BatcherService: add called with', text);
  }
  public async flushIfNeeded(): Promise<void> {
    // Placeholder implementation
    console.log('BatcherService: flushIfNeeded called');
    // Simulate some async operation
    return new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
