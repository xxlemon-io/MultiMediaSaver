import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

// Mock modules - must be done before imports
jest.mock('fs/promises');
jest.mock('path', () => ({
  join: jest.fn((...paths: string[]) => paths.join('/')),
}));
jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => '12345678-90ab-cdef-1234-567890abcdef'),
}));

// Import after mocks
import { saveMedia } from '../saveMedia';

const mockedWriteFile = writeFile as jest.MockedFunction<typeof writeFile>;
const mockedMkdir = mkdir as jest.MockedFunction<typeof mkdir>;
const mockedJoin = join as jest.MockedFunction<typeof join>;

describe('saveMedia', () => {
  // Note: DOWNLOADS_DIR is computed at module load time, so it uses real process.cwd()
  // We test the behavior rather than exact paths

  beforeEach(() => {
    jest.clearAllMocks();
    // Ensure join mock returns joined paths
    mockedJoin.mockImplementation((...paths: string[]) => paths.join('/'));
    mockedMkdir.mockResolvedValue(undefined);
    mockedWriteFile.mockResolvedValue(undefined);
  });
  
  afterEach(() => {
    // Restore Date.now if it was mocked
    jest.restoreAllMocks();
  });

  describe('File extension inference', () => {
    it('should infer .jpg extension from image/jpeg content type', async () => {
      const buffer = Buffer.from('fake image data');

      const result = await saveMedia(buffer, 'image/jpeg');

      expect(result.filename).toMatch(/\.jpg$/);
      expect(result.publicPath).toMatch(/\.jpg$/);
    });

    it('should infer .png extension from image/png content type', async () => {
      const buffer = Buffer.from('fake image data');

      const result = await saveMedia(buffer, 'image/png');

      expect(result.filename).toMatch(/\.png$/);
      expect(result.publicPath).toMatch(/\.png$/);
    });

    it('should infer .gif extension from image/gif content type', async () => {
      const buffer = Buffer.from('fake image data');

      const result = await saveMedia(buffer, 'image/gif');

      expect(result.filename).toMatch(/\.gif$/);
    });

    it('should infer .mp4 extension from video/mp4 content type', async () => {
      const buffer = Buffer.from('fake video data');

      const result = await saveMedia(buffer, 'video/mp4');

      expect(result.filename).toMatch(/\.mp4$/);
    });

    it('should use suggested name extension if provided', async () => {
      const buffer = Buffer.from('fake image data');

      const result = await saveMedia(buffer, 'image/jpeg', 'image.webp');

      expect(result.filename).toMatch(/\.webp$/);
    });

    it('should default to .bin for unknown content types', async () => {
      const buffer = Buffer.from('fake data');

      const result = await saveMedia(buffer, 'application/octet-stream');

      expect(result.filename).toMatch(/\.bin$/);
    });
  });

  describe('Filename generation', () => {
    it('should generate filename with timestamp and UUID', async () => {
      const buffer = Buffer.from('fake image data');
      const mockTimestamp = 1234567890;
      jest.spyOn(Date, 'now').mockReturnValue(mockTimestamp);
      
      const result = await saveMedia(buffer, 'image/jpeg');
      
      // Verify filename format: timestamp-uuid.ext
      expect(result.filename).toMatch(/^\d+-12345678\.jpg$/);
      expect(result.filename).toContain(mockTimestamp.toString());
      expect(result.publicPath).toBe(`/downloads/${result.filename}`);
    });

    it('should generate unique filenames for multiple calls', async () => {
      const buffer = Buffer.from('fake image data');
      
      jest.spyOn(Date, 'now').mockReturnValueOnce(1234567890);
      const result1 = await saveMedia(buffer, 'image/jpeg');
      
      jest.spyOn(Date, 'now').mockReturnValueOnce(1234567891);
      const result2 = await saveMedia(buffer, 'image/jpeg');

      expect(result1.filename).not.toBe(result2.filename);
      expect(result1.filename).toContain('1234567890');
      expect(result2.filename).toContain('1234567891');
    });
  });

  describe('Directory creation', () => {
    it('should create downloads directory if it does not exist', async () => {
      const buffer = Buffer.from('fake image data');

      await saveMedia(buffer, 'image/jpeg');

      // mkdir should be called with recursive: true
      expect(mockedMkdir).toHaveBeenCalled();
      const mkdirCall = mockedMkdir.mock.calls[0];
      // Check that mkdir was called with a path ending in 'public/downloads' and recursive option
      expect(mkdirCall[0]).toContain('public/downloads');
      expect(mkdirCall[1]).toEqual({ recursive: true });
    });

    it('should handle directory already exists error gracefully', async () => {
      const buffer = Buffer.from('fake image data');
      const eexistError = new Error('Directory exists') as NodeJS.ErrnoException;
      eexistError.code = 'EEXIST';
      mockedMkdir.mockRejectedValueOnce(eexistError);

      await expect(saveMedia(buffer, 'image/jpeg')).resolves.toBeDefined();
      expect(mockedWriteFile).toHaveBeenCalled();
    });

    it('should throw error if directory creation fails for other reasons', async () => {
      const buffer = Buffer.from('fake image data');
      const error = new Error('Permission denied') as NodeJS.ErrnoException;
      error.code = 'EACCES';
      mockedMkdir.mockRejectedValueOnce(error);

      await expect(saveMedia(buffer, 'image/jpeg')).rejects.toThrow('Failed to create downloads directory');
    });
  });

  describe('File size limit', () => {
    it('should reject files exceeding 500MB limit', async () => {
      const largeBuffer = Buffer.alloc(500 * 1024 * 1024 + 1); // 500MB + 1 byte

      await expect(saveMedia(largeBuffer, 'image/jpeg')).rejects.toThrow('File size exceeds maximum limit of 500MB');
      expect(mockedWriteFile).not.toHaveBeenCalled();
    });

    it('should accept files at exactly 500MB limit', async () => {
      const exactBuffer = Buffer.alloc(500 * 1024 * 1024); // Exactly 500MB

      await expect(saveMedia(exactBuffer, 'image/jpeg')).resolves.toBeDefined();
      expect(mockedWriteFile).toHaveBeenCalled();
    });

    it('should accept files smaller than 500MB', async () => {
      const smallBuffer = Buffer.alloc(100 * 1024 * 1024); // 100MB

      await expect(saveMedia(smallBuffer, 'image/jpeg')).resolves.toBeDefined();
      expect(mockedWriteFile).toHaveBeenCalled();
    });
  });

  describe('File writing', () => {
    it('should write file with correct buffer', async () => {
      const buffer = Buffer.from('fake image data');

      await saveMedia(buffer, 'image/jpeg');

      expect(mockedWriteFile).toHaveBeenCalled();
      const writeCall = mockedWriteFile.mock.calls[0];
      expect(writeCall[1]).toBe(buffer);
      // Path should contain the filename
      expect(writeCall[0]).toContain('12345678');
    });

    it('should throw error if file write fails', async () => {
      const buffer = Buffer.from('fake image data');
      const error = new Error('Disk full');
      mockedWriteFile.mockRejectedValueOnce(error);

      await expect(saveMedia(buffer, 'image/jpeg')).rejects.toThrow('Failed to save file');
    });
  });

  describe('Return value', () => {
    it('should return correct publicPath and filename', async () => {
      const buffer = Buffer.from('fake image data');

      const result = await saveMedia(buffer, 'image/jpeg');

      expect(result).toHaveProperty('publicPath');
      expect(result).toHaveProperty('filename');
      expect(result.publicPath).toMatch(/^\/downloads\/.+/);
      expect(result.filename).toMatch(/^\d+-12345678\.jpg$/);
    });
  });
});

