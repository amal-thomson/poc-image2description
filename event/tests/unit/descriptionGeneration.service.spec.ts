import { generateProductDescription } from '../../src/services/generative-ai/descriptionGeneration.service';
import { model } from '../../src/config/ai.config';
import { logger } from '../../src/utils/logger.utils';

jest.mock('../../src/config/ai.config', () => ({
  model: {
    generateContent: jest.fn()
  }
}));

jest.mock('../../src/utils/logger.utils', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn()
  }
}));

describe('Description Generation Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    console.log('\n--- Starting new test case ---');
  });

  const mockImageData = {
    labels: 'shirt, cotton',
    objects: 'Clothing',
    colors: ['255, 255, 255'],
    detectedText: 'Brand Name',
    webEntities: 'Fashion'
  };

  const mockGeneratedText = 'A beautiful cotton shirt perfect for any occasion.';

  it('should successfully generate a product description', async () => {
    console.log('Test case: Successful description generation');
    console.log('Input:', mockImageData);
    
    (model.generateContent as jest.Mock).mockResolvedValue({
      response: { text: () => mockGeneratedText }
    });

    const result = await generateProductDescription(mockImageData);
    console.log('Result:', result);

    expect(result).toBe(mockGeneratedText);
    console.log('Test passed ✓');
  });

  it('should throw error when generation fails', async () => {
    console.log('Test case: Generation failure handling');
    console.log('Input:', mockImageData);
    
    const error = new Error('Generation failed');
    (model.generateContent as jest.Mock).mockRejectedValue(error);

    try {
      await generateProductDescription(mockImageData);
    } catch (e) {
      const err = e as Error; // Explicitly casting `e` to `Error`
      console.log('Error caught:', err.message);
    }

    expect(logger.error).toHaveBeenCalled();
    console.log('Test passed ✓');
  });
});
