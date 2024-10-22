import { post } from '../../src/controllers/event.controller';
import { Request, Response } from 'express';
import { logger } from '../../src/utils/logger.utils';
import { productAnalysis } from '../../src/services/vision-ai/productAnalysis.service';
import { generateProductDescription } from '../../src/services/generative-ai/descriptionGeneration.service';
import { updateProductDescription } from '../../src/repository/product/product.repository';

jest.mock('../../src/utils/logger.utils', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../src/services/vision-ai/productAnalysis.service', () => ({
  productAnalysis: jest.fn(),
}));

jest.mock('../../src/services/generative-ai/descriptionGeneration.service', () => ({
  generateProductDescription: jest.fn(),
}));

jest.mock('../../src/repository/product/product.repository', () => ({
  updateProductDescription: jest.fn(),
}));

describe('Event Controller', () => {
  const mockPubSubData = {
    resource: {
      typeId: 'product'
    },
    productProjection: {
      id: 'product-123',
      masterVariant: {
        images: [
          { url: 'https://example.com/image.jpg' }
        ],
        attributes: [
          { name: 'gen-description', value: 'true' }
        ]
      }
    }
  };

  const mockRequest = {
    body: {
      message: {
        data: Buffer.from(JSON.stringify(mockPubSubData)).toString('base64')
      }
    }
  } as Request;

  const mockResponse = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    send: jest.fn()
  } as unknown as Response;

  beforeEach(() => {
    jest.clearAllMocks();
    console.log('\n--- Starting new test case ---');
  });

  it('should successfully handle event', async () => {
    console.log('Test case: Successful event handling');
    console.log('Input:', mockRequest.body);
    
    // Mock successful vision analysis
    const mockVisionResult = {
      labels: ['shirt', 'cotton'],
      objects: ['Clothing'],
      colors: ['255, 255, 255'],
      detectedText: 'Brand Name',
      webEntities: ['Fashion']
    };
    
    // Setup successful mock responses
    (productAnalysis as jest.Mock).mockResolvedValueOnce(mockVisionResult);
    (generateProductDescription as jest.Mock).mockResolvedValueOnce(
      'A beautiful cotton shirt perfect for any occasion.'
    );
    (updateProductDescription as jest.Mock).mockResolvedValueOnce({
      body: { success: true }
    });

    // Call the controller function
    await post(mockRequest, mockResponse);

    // Verify the mocked services were called
    expect(productAnalysis).toHaveBeenCalledWith('https://example.com/image.jpg');
    expect(generateProductDescription).toHaveBeenCalledWith(mockVisionResult);
    expect(updateProductDescription).toHaveBeenCalledWith(
      'product-123',
      'A beautiful cotton shirt perfect for any occasion.'
    );

    // Verify the response
    expect(mockResponse.status).toHaveBeenCalledWith(200);
    expect(mockResponse.send).toHaveBeenCalledWith({
      productId: 'product-123',
      imageUrl: 'https://example.com/image.jpg',
      description: 'A beautiful cotton shirt perfect for any occasion.',
      productAnalysis: mockVisionResult,
      commerceToolsUpdate: { success: true }
    });

    console.log('Test passed ✓');
  });

  it('should handle errors in event handling', async () => {
    console.log('Test case: Error handling in event');
    console.log('Input:', mockRequest.body);
    
    // Create an error with a specific message
    const error = new Error('Vision API processing failed');
    
    // Mock the service to throw the specific error
    (productAnalysis as jest.Mock).mockRejectedValueOnce(error);

    // Call the controller function
    await post(mockRequest, mockResponse);

    // Verify error logging and response
    expect(logger.error).toHaveBeenCalledWith('❌ Error processing request', { error: error.message });
    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.send).toHaveBeenCalledWith({
      error: '❌ Internal server error. Failed to process request.',
      details: error.message
    });

    console.log('Test passed ✓');
  });

  it('should handle missing Pub/Sub data', async () => {
    const requestWithoutData = {
      body: {
        message: {}
      }
    } as Request;

    await post(requestWithoutData, mockResponse);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.send).toHaveBeenCalledWith({
      error: '❌ No data found in Pub/Sub message.'
    });
  });
});