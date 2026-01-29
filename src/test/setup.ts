import '@testing-library/jest-dom';
import { vi, beforeEach } from 'vitest';

// Mock Electron APIs
const mockVyotiq = {
  files: {
    select: vi.fn(),
    read: vi.fn(),
  },
  workspaces: {
    list: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
    setActive: vi.fn(),
  },
  agent: {
    sendMessage: vi.fn(),
    createSession: vi.fn(),
    deleteSession: vi.fn(),
  },
};

// Set up global mocks
Object.defineProperty(window, 'vyotiq', {
  value: mockVyotiq,
  writable: true,
});

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});
