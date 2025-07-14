import { injectable } from 'tsyringe';
import { IClassificationService } from '../IClassificationService';
import { pipeline } from '@xenova/transformers';

@injectable()
export class DistilBARTService implements IClassificationService {
  private classifierPromise?: Promise<any>;

  public async init(): Promise<void> {
    this.classifierPromise = pipeline(
      'zero-shot-classification',
      'Xenova/distilbart-mnli'
    );
  }

  public async classify(text: string): Promise<string> {
    if (!this.classifierPromise) {
      throw new Error("DistilBARTService must be initialized first!");
    }

    const classifier = await this.classifierPromise;

    const labels = ["Computer Science"];
    const result = await classifier(text, labels);

    const score = result.scores[0];
    console.log(`Probability for 'Computer Science': ${score}`);

    if (score >= 0.80) {
      return "Studying";
    } else if (score <= 0.15) {
      return "Idle";
    } else {
      return "Undetermined";
    }
  }
}


