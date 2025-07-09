import { injectable } from 'tsyringe';
import { IBatcherService } from '../IBatcherService';

@injectable()
export class BatcherService implements IBatcherService {
  public add(text: string): void {
    // Placeholder implementation
    console.log('BatcherService: add called with', text);
  }
}
