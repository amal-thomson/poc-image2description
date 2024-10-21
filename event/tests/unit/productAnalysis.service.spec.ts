import { productAnalysis } from '../../src/services/vision-ai/productAnalysis.service';
import { visionClient } from '../../src/config/ai.config';
import { logger } from '../../src/utils/logger.utils';

jest.mock('../../src/config/ai.config', () => ({
  visionClient: {
    annotateImage: jest.fn()
  }
}));

jest.mock('../../src/utils/logger.utils', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn()
  }
}));

describe('Product Analysis Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    console.log('\n--- Starting new test case ---');
  });

  const mockImageUrl = 'https://example.com/image.jpg';
  const mockVisionResponse = {
    labelAnnotations: [{ description: 'shirt' }, { description: 'cotton' }],
    localizedObjectAnnotations: [{ name: 'Clothing' }],
    imagePropertiesAnnotation: {
      dominantColors: {
        colors: [
          { color: { red: 255, green: 255, blue: 255 } }
        ]
      }
    },
    textAnnotations: [{ description: 'Brand Name' }],
    webDetection: {
      webEntities: [{ description: 'Fashion' }]
    }
  };

  it('should successfully analyze an image', async () => {
    console.log('Test case: Successful image analysis');
    console.log('Input:', { imageUrl: mockImageUrl });
    
    (visionClient.annotateImage as jest.Mock).mockResolvedValue([mockVisionResponse]);

    const result = await productAnalysis(mockImageUrl);
    console.log('Result:', result);

    expect(result).toEqual({
      labels: 'shirt, cotton',
      objects: 'Clothing',
      colors: ['255, 255, 255'],
      detectedText: 'Brand Name',
      webEntities: 'Fashion'
    });
    console.log('Test passed ✓');
  });

  it('should handle missing annotations gracefully', async () => {
    console.log('Test case: Missing annotations handling');
    console.log('Input:', { imageUrl: mockImageUrl });
    
    (visionClient.annotateImage as jest.Mock).mockResolvedValue([{}]);

    const result = await productAnalysis(mockImageUrl);
    console.log('Result:', result);

    expect(result).toEqual({
      labels: 'No labels detected',
      objects: 'No objects detected',
      colors: ['No colors detected'],
      detectedText: 'No text detected',
      webEntities: 'No web entities detected'
    });
    console.log('Test passed ✓');
  });

  it('should throw error when Vision AI fails', async () => {
    console.log('Test case: Vision AI failure handling');
    console.log('Input:', { imageUrl: mockImageUrl });
    
    const error = new Error('Vision AI failed');
    (visionClient.annotateImage as jest.Mock).mockRejectedValue(error);

    try {
      await productAnalysis(mockImageUrl);
    } catch (e) {
      const err = e as Error; // Explicitly casting `e` to `Error`
      console.log('Error caught:', err.message);
    }

    expect(logger.error).toHaveBeenCalledWith(
      '❌ Error during Vision AI analysis:',
      expect.any(Object)
    );
    console.log('Test passed ✓');
  });
});
