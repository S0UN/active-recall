// src/test/__fixtures__/index.ts
import fs from 'fs';
import path from 'path';
const fixturesDir = __dirname

export function loadImageFixture(fileName: string): Buffer {
  const imagePath = path.resolve(__dirname, fileName);
  return fs.readFileSync(imagePath);
}

export const simplePng = loadImageFixture('simple.png');
export const fixtures: Record<string, Buffer> = Object.fromEntries(
  fs
    .readdirSync(fixturesDir)
    .filter((f) => /\.(png|jpe?g|gif)$/i.test(f))
    .map((file) => [
      file,
      fs.readFileSync(path.join(fixturesDir, file)),
    ])
)
