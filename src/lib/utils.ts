/* eslint @typescript-eslint/no-require-imports: "off" */
import * as crypto from 'crypto';
import * as fs from 'fs';
const hash = require('object-hash');
const fetch = require('sync-fetch');

const urlPattern = /^((http|https|ftp):\/\/)/;

export function artifactHash(path: string): string {
  let file_buffer;
  if (urlPattern.test(path)) {file_buffer = fetch(path).buffer();} else {file_buffer = fs.readFileSync(path);}
  const sum = crypto.createHash('sha256');
  sum.update(file_buffer);
  return sum.digest('hex');
}

export function artifactsHash(pathes: string[]): string {
  const filesHash: { [key: string]: string } = {};
  for (const path of pathes) {
    filesHash[path] = artifactHash(path);
  }
  return hash(filesHash);
}

export function dirArtifactHash(folderpath: string): string {
  const filesHash: {[key: string]: string} = {};
  const filenames = fs.readdirSync(folderpath, { withFileTypes: true });
  filenames.forEach(file => {
    if (file.isDirectory()) {filesHash[file.name] = dirArtifactHash(`${folderpath}/${file.name}`);} else {filesHash[file.name] = artifactHash(`${folderpath}/${file.name}`);}
  });
  return hash(filesHash);
}