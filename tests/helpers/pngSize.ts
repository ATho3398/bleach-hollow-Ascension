// PNG 파일 머리(IHDR)에서 가로·세로를 읽는다 (테스트용, 라이브러리 없이)
import { readFileSync } from 'node:fs';

export function imageSize(path: string): [number, number] {
  const b = readFileSync(path);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}
