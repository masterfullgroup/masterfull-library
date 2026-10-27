import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractDriveFileId, normalizeDriveFile } from '../src/services/files/googleDrive.mjs';

test('normaliza enlaces de Drive y crea la ruta de vista previa', () => {
  const result = normalizeDriveFile('https://drive.google.com/file/d/1Abc_DEF-234567890/view?usp=sharing');
  assert.equal(result.driveFileId, '1Abc_DEF-234567890');
  assert.equal(result.driveUrl, 'https://drive.google.com/file/d/1Abc_DEF-234567890/view');
  assert.equal(result.previewUrl, 'https://drive.google.com/file/d/1Abc_DEF-234567890/preview');
});

test('acepta el formato open?id de Drive', () => {
  assert.equal(extractDriveFileId('https://drive.google.com/open?id=1Abc_DEF-234567890'), '1Abc_DEF-234567890');
});

test('rechaza dominios engañosos, HTTP y URLs incompletas', () => {
  for (const value of [
    'https://drive.google.com.example.org/file/d/1Abc_DEF-234567890/view',
    'http://drive.google.com/file/d/1Abc_DEF-234567890/view',
    'https://evil.example/file/d/1Abc_DEF-234567890/view',
    'https://drive.google.com/file/d/short/view',
    'not a URL',
  ]) assert.throws(() => normalizeDriveFile(value));
});
