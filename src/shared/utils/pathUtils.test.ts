/**
 * Path Utilities Tests
 */

import { describe, it, expect } from 'vitest';
import {
  normalizePath,
  normalizePathPreserveTrailing,
  isWithinDirectory,
  pathsEqual,
  comparePaths,
  getRelativePath,
  getExtension,
  getBasename,
  getDirname,
  getFilename,
  joinPaths,
  ensureTrailingSlash,
  removeTrailingSlash,
  detectLanguage,
  isTextFile,
  isBinaryFile,
  isAbsolutePath,
  isValidPath,
  isHidden,
  globToRegex,
  matchesGlob,
  filterPaths,
  excludePaths,
  PathUtils,
} from './pathUtils';

describe('pathUtils', () => {
  describe('normalizePath', () => {
    it('should normalize Windows paths', () => {
      const result = normalizePath('C:\\Users\\test\\file.ts');
      expect(result).toBe('C:/Users/test/file.ts');
    });
    
    it('should normalize Unix paths', () => {
      const result = normalizePath('/home/user/file.ts');
      expect(result).toBe('/home/user/file.ts');
    });
    
    it('should remove trailing slashes', () => {
      expect(normalizePath('C:/Users/test/')).toBe('C:/Users/test');
      expect(normalizePath('/home/user/')).toBe('/home/user');
    });
    
    it('should handle mixed separators', () => {
      const result = normalizePath('C:/Users\\test/nested\\file.ts');
      expect(result).toBe('C:/Users/test/nested/file.ts');
    });
    
    it('should remove duplicate slashes', () => {
      const result = normalizePath('/home//user///file.ts');
      expect(result).toBe('/home/user/file.ts');
    });
    
    it('should handle empty input', () => {
      expect(normalizePath('')).toBe('');
    });
  });
  
  describe('normalizePathPreserveTrailing', () => {
    it('should preserve trailing slash when present', () => {
      expect(normalizePathPreserveTrailing('/home/user/')).toBe('/home/user/');
      expect(normalizePathPreserveTrailing('C:\\Users\\')).toBe('C:/Users/');
    });
    
    it('should not add trailing slash when not present', () => {
      expect(normalizePathPreserveTrailing('/home/user')).toBe('/home/user');
    });
  });
  
  describe('joinPaths', () => {
    it('should join paths with forward slashes', () => {
      const result = joinPaths('/home/user', 'projects', 'test');
      expect(result).toContain('/home/user');
      expect(result).toContain('projects');
      expect(result).toContain('test');
    });
    
    it('should normalize the result', () => {
      const result = joinPaths('/home/user/', '/projects/', 'test');
      expect(result).not.toContain('\\');
    });
  });
  
  describe('isAbsolutePath', () => {
    it('should identify absolute Unix paths', () => {
      expect(isAbsolutePath('/home/user')).toBe(true);
      expect(isAbsolutePath('home/user')).toBe(false);
    });
    
    it('should identify absolute Windows paths', () => {
      expect(isAbsolutePath('C:/Users')).toBe(true);
      expect(isAbsolutePath('C:\\Users')).toBe(true);
    });
  });
  
  describe('getExtension', () => {
    it('should extract file extension without dot', () => {
      expect(getExtension('/path/to/file.ts')).toBe('ts');
      expect(getExtension('file.test.tsx')).toBe('tsx');
      expect(getExtension('noextension')).toBe('');
    });
    
    it('should return lowercase extension', () => {
      expect(getExtension('FILE.TS')).toBe('ts');
    });
  });
  
  describe('getBasename', () => {
    it('should extract filename without extension', () => {
      expect(getBasename('/path/to/file.ts')).toBe('file');
      expect(getBasename('C:/Users/test/file.txt')).toBe('file');
    });
  });
  
  describe('getFilename', () => {
    it('should extract filename with extension', () => {
      expect(getFilename('/path/to/file.ts')).toBe('file.ts');
      expect(getFilename('C:/Users/test/file.txt')).toBe('file.txt');
    });
  });
  
  describe('getDirname', () => {
    it('should extract directory path', () => {
      expect(getDirname('/path/to/file.ts')).toBe('/path/to');
    });
  });
  
  describe('getRelativePath', () => {
    it('should compute relative path', () => {
      const result = getRelativePath('/home/user/projects/test/file.ts', '/home/user/projects');
      expect(result).toBe('test/file.ts');
    });
  });
  
  describe('isWithinDirectory', () => {
    it('should return true for paths inside directory', () => {
      expect(isWithinDirectory(
        '/home/user/project/src/file.ts',
        '/home/user/project'
      )).toBe(true);
    });
    
    it('should return false for paths outside directory', () => {
      expect(isWithinDirectory(
        '/home/user/other/file.ts',
        '/home/user/project'
      )).toBe(false);
    });
    
    it('should return true for exact match', () => {
      expect(isWithinDirectory(
        '/home/user/project',
        '/home/user/project'
      )).toBe(true);
    });
  });
  
  describe('pathsEqual', () => {
    it('should detect equal paths', () => {
      expect(pathsEqual('/home/user/file.ts', '/home/user/file.ts')).toBe(true);
    });
    
    it('should handle different separators', () => {
      expect(pathsEqual('C:\\Users\\test', 'C:/Users/test')).toBe(true);
    });
  });
  
  describe('comparePaths', () => {
    it('should compare paths for sorting', () => {
      expect(comparePaths('/home/a', '/home/b')).toBeLessThan(0);
      expect(comparePaths('/home/b', '/home/a')).toBeGreaterThan(0);
      expect(comparePaths('/home/a', '/home/a')).toBe(0);
    });
  });
  
  describe('detectLanguage', () => {
    it('should detect TypeScript', () => {
      expect(detectLanguage('file.ts')).toBe('typescript');
      expect(detectLanguage('file.tsx')).toBe('typescriptreact');
    });
    
    it('should detect JavaScript', () => {
      expect(detectLanguage('file.js')).toBe('javascript');
      expect(detectLanguage('file.jsx')).toBe('javascriptreact');
      expect(detectLanguage('file.mjs')).toBe('javascript');
    });
    
    it('should detect Python', () => {
      expect(detectLanguage('file.py')).toBe('python');
    });
    
    it('should detect Rust', () => {
      expect(detectLanguage('file.rs')).toBe('rust');
    });
    
    it('should detect Go', () => {
      expect(detectLanguage('file.go')).toBe('go');
    });
    
    it('should detect JSON/YAML', () => {
      expect(detectLanguage('config.json')).toBe('json');
      expect(detectLanguage('config.yaml')).toBe('yaml');
      expect(detectLanguage('config.yml')).toBe('yaml');
    });
    
    it('should detect Markdown', () => {
      expect(detectLanguage('README.md')).toBe('markdown');
    });
    
    it('should return plaintext for unrecognized extensions', () => {
      expect(detectLanguage('file.xyz')).toBe('plaintext');
    });
    
    it('should handle special filenames', () => {
      expect(detectLanguage('Dockerfile')).toBe('dockerfile');
      expect(detectLanguage('Makefile')).toBe('makefile');
    });
  });
  
  describe('isTextFile', () => {
    it('should identify text files', () => {
      expect(isTextFile('file.ts')).toBe(true);
      expect(isTextFile('file.py')).toBe(true);
      expect(isTextFile('file.md')).toBe(true);
      expect(isTextFile('file.json')).toBe(true);
    });
  });
  
  describe('isBinaryFile', () => {
    it('should identify binary files', () => {
      expect(isBinaryFile('image.png')).toBe(true);
      expect(isBinaryFile('doc.pdf')).toBe(true);
      expect(isBinaryFile('archive.zip')).toBe(true);
    });
    
    it('should not identify text files as binary', () => {
      expect(isBinaryFile('file.ts')).toBe(false);
    });
  });
  
  describe('isValidPath', () => {
    it('should validate normal paths', () => {
      expect(isValidPath('/home/user/file.ts')).toBe(true);
    });
    
    it('should reject null bytes', () => {
      expect(isValidPath('/path/\0/file.ts')).toBe(false);
    });
    
    it('should reject empty paths', () => {
      expect(isValidPath('')).toBe(false);
    });
  });
  
  describe('isHidden', () => {
    it('should identify hidden files', () => {
      expect(isHidden('.gitignore')).toBe(true);
      expect(isHidden('/home/user/.config')).toBe(true);
    });
    
    it('should identify non-hidden files', () => {
      expect(isHidden('file.ts')).toBe(false);
    });
  });
  
  describe('ensureTrailingSlash', () => {
    it('should add trailing slash', () => {
      expect(ensureTrailingSlash('/home/user')).toBe('/home/user/');
    });
    
    it('should not duplicate trailing slash', () => {
      expect(ensureTrailingSlash('/home/user/')).toBe('/home/user/');
    });
  });
  
  describe('removeTrailingSlash', () => {
    it('should remove trailing slash', () => {
      expect(removeTrailingSlash('/home/user/')).toBe('/home/user');
    });
  });
  
  describe('glob matching', () => {
    describe('globToRegex', () => {
      it('should convert glob to regex', () => {
        const regex = globToRegex('*.ts');
        expect(regex.test('file.ts')).toBe(true);
        expect(regex.test('file.js')).toBe(false);
      });
    });
    
    describe('matchesGlob', () => {
      it('should match simple patterns', () => {
        expect(matchesGlob('file.ts', '*.ts')).toBe(true);
        expect(matchesGlob('file.js', '*.ts')).toBe(false);
      });
      
      it('should match patterns with ?', () => {
        expect(matchesGlob('file1.ts', 'file?.ts')).toBe(true);
        expect(matchesGlob('file10.ts', 'file?.ts')).toBe(false);
      });
    });
    
    describe('filterPaths', () => {
      it('should filter paths matching patterns', () => {
        const paths = ['/src/file.ts', '/src/file.js', '/src/test.ts'];
        const result = filterPaths(paths, ['*.ts']);
        expect(result).toHaveLength(2);
      });
    });
    
    describe('excludePaths', () => {
      it('should exclude paths matching patterns', () => {
        const paths = ['/src/file.ts', '/src/file.js', '/src/test.ts'];
        const result = excludePaths(paths, ['*.ts']);
        expect(result).toHaveLength(1);
        expect(result[0]).toBe('/src/file.js');
      });
    });
  });
  
  describe('PathUtils namespace', () => {
    it('should expose all functions', () => {
      expect(typeof PathUtils.normalize).toBe('function');
      expect(typeof PathUtils.join).toBe('function');
      expect(typeof PathUtils.isAbsolute).toBe('function');
      expect(typeof PathUtils.getExtension).toBe('function');
      expect(typeof PathUtils.detectLanguage).toBe('function');
    });
    
    it('should work via namespace', () => {
      expect(PathUtils.normalize('/home\\user')).toBe('/home/user');
      expect(PathUtils.getExtension('file.ts')).toBe('ts');
    });
  });
});
