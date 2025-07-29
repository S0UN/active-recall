import { ITextPreprocessor } from '../ITextPreprocessor';
import { spawn } from 'child_process';
import * as path from 'path';

export class TextPreprocessor implements ITextPreprocessor {
  private readonly pythonScriptPath: string;

  constructor() {
    this.pythonScriptPath = path.join(__dirname, 'spellcheck.py');
  }

  public async preprocess(text: string): Promise<string> {
    if (!text) {
      return '';
    }

    const basicCleaned = this.removeUIArtifacts(text);
    const spellCorrected = await this.correctSpelling(basicCleaned);
    return spellCorrected.trim();
  }

  private removeUIArtifacts(text: string): string {
    return this.normalizeWhitespace(
      this.removeCodeArtifacts(
        this.removeNavigationElements(
          this.removeSpecialCharacters(text)
        )
      )
    );
  }

  private removeSpecialCharacters(text: string): string {
    return text
      .replace(/[«»£]/g, '')
      .replace(/[{}%$<>]/g, '');
  }

  private removeNavigationElements(text: string): string {
    return text
      .replace(/\[\[\s*\]\]/g, '')
      .replace(/\[\s*\]/g, '')
      .replace(/\|\s*\|/g, '|')
      .replace(/OPEN EDITORS\s*/g, '')
      .replace(/\[ia\]/g, '');
  }

  private removeCodeArtifacts(text: string): string {
    return text
      .replace(/(?:src\/|main\/|services\/|analysis\/|impl\/)/g, '')
      .replace(/^\d+\s+/gm, '')
      .replace(/\|S\s*%\s*X/g, '')
      .replace(/\d+,\s*[MU]/g, '')
      .replace(/TS\s+/g, '')
      .replace(/LEN\s+A=/g, '');
  }

  private normalizeWhitespace(text: string): string {
    return text.replace(/\s+/g, ' ');
  }

  private correctSpelling(text: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const pythonPath = this.getPythonPath();
      const python = spawn(pythonPath, [this.pythonScriptPath]);
      
      this.handleSpellCheckingProcess(python, text, resolve, reject);
    });
  }

  private getPythonPath(): string {
    return path.join(__dirname, '../../../../../venv/bin/python');
  }

  private handleSpellCheckingProcess(
    python: any,
    text: string,
    resolve: (value: string) => void,
    reject: (reason: Error) => void
  ): void {
    let result = '';
    let error = '';

    python.stdout.on('data', (data: any) => {
      result += data.toString();
    });

    python.stderr.on('data', (data: any) => {
      error += data.toString();
    });

    python.on('close', (code: number) => {
      if (code !== 0) {
        reject(new Error(`Python script exited with code ${code}: ${error}`));
      } else {
        resolve(result.trim());
      }
    });

    python.on('error', (err: Error) => {
      reject(err);
    });

    python.stdin.write(text);
    python.stdin.end();
  }
}