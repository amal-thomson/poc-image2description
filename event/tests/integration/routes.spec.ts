import request from 'supertest';
import express from 'express';
import { post } from '../../src/controllers/event.controller';
import { productAnalysis } from '../../src/services/vision-ai/productAnalysis.service';
import { generateProductDescription } from '../../src/services/generative-ai/descriptionGeneration.service';
import { updateProductDescription } from '../../src/repository/product/product.repository';

// Mock the dependencies
jest.mock('../../src/services/vision-ai/productAnalysis.service');
jest.mock('../../src/services/generative-ai/descriptionGeneration.service');
jest.mock('../../src/repository/product/product.repository');

describe('Event Processing Integration Tests', () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.post('/event', post);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /event', () => {
    it('should successfully process a valid product event', async () => {
      const mockPubSubMessage = {
        message: {
          data: Buffer.from(JSON.stringify({
            resource: { typeId: 'product' },
            productProjection: {
              id: 'test-product-id',
              masterVariant: {
                images: [{ url: 'https://example.com/test-image.jpg' }],
                attributes: [{ name: 'gen-description', value: 'true' }]
              }
            }
          })).toString('base64')
        }
      };

      const mockImageData = {
        labels: 'cotton, t-shirt, casual wear',
        objects: 'shirt, collar',
        colors: ['255, 255, 255', '0, 0, 0'],
        detectedText: 'Brand Logo',
        webEntities: 'fashion, apparel, clothing'
      };

      const mockDescription = 'A premium cotton t-shirt perfect for casual wear.';

      const mockCommerceToolsResponse = {
        body: {
          id: 'test-product-id',
          version: 2,
          description: { en: mockDescription }
        }
      };

      // Mock the service responses
      (productAnalysis as jest.Mock).mockResolvedValue(mockImageData);
      (generateProductDescription as jest.Mock).mockResolvedValue(mockDescription);
      (updateProductDescription as jest.Mock).mockResolvedValue(mockCommerceToolsResponse);

      console.info('🚀 Starting test: should successfully process a valid product event');

      const response = await request(app)
        .post('/event')
        .send(mockPubSubMessage);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        productId: 'test-product-id',
        imageUrl: 'https://example.com/test-image.jpg',
        description: mockDescription,
        productAnalysis: mockImageData,
        commerceToolsUpdate: mockCommerceToolsResponse.body
      });

      // Verify service calls
      expect(productAnalysis).toHaveBeenCalledWith('https://example.com/test-image.jpg');
      expect(generateProductDescription).toHaveBeenCalledWith(mockImageData);
      expect(updateProductDescription).toHaveBeenCalledWith('test-product-id', mockDescription);
      
      console.info('✅ Test passed: valid product event processed successfully');
    });

    it('should skip processing when gen-description is not enabled', async () => {
      const messageWithoutGenDescription = {
        message: {
          data: Buffer.from(JSON.stringify({
            resource: { typeId: 'product' },
            productProjection: {
              id: 'test-product-id',
              masterVariant: {
                images: [{ url: 'https://example.com/test-image.jpg' }],
                attributes: [{ name: 'gen-description', value: 'false' }]
              }
            }
          })).toString('base64')
        }
      };

      console.info('🚀 Starting test: should skip processing when gen-description is not enabled');

      const response = await request(app)
        .post('/event')
        .send(messageWithoutGenDescription);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('❌ The option for automatic description generation is not enabled.');
      expect(productAnalysis).not.toHaveBeenCalled();
      expect(generateProductDescription).not.toHaveBeenCalled();
      expect(updateProductDescription).not.toHaveBeenCalled();
      
      console.info('✅ Test passed: processing skipped as expected');
    });

    it('should handle invalid PubSub message data', async () => {
      const invalidMessage = {
        message: {
          data: Buffer.from('invalid-json').toString('base64')
        }
      };

      console.info('🚀 Starting test: should handle invalid PubSub message data');

      const response = await request(app)
        .post('/event')
        .send(invalidMessage);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('❌ Internal server error. Failed to process request.');
      
      console.info('✅ Test passed: handled invalid PubSub message data correctly');
    });

    it('should handle Vision AI service failure', async () => {
      const mockPubSubMessage = {
        message: {
          data: Buffer.from(JSON.stringify({
            resource: { typeId: 'product' },
            productProjection: {
              id: 'test-product-id',
              masterVariant: {
                images: [{ url: 'https://example.com/test-image.jpg' }],
                attributes: [{ name: 'gen-description', value: 'true' }]
              }
            }
          })).toString('base64')
        }
      };

      (productAnalysis as jest.Mock).mockRejectedValue(new Error('Vision AI service failed'));

      console.info('🚀 Starting test: should handle Vision AI service failure');

      const response = await request(app)
        .post('/event')
        .send(mockPubSubMessage);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('❌ Internal server error. Failed to process request.');
      expect(response.body.details).toBe('Vision AI service failed');
      expect(generateProductDescription).not.toHaveBeenCalled();
      expect(updateProductDescription).not.toHaveBeenCalled();
      
      console.info('✅ Test passed: handled Vision AI service failure correctly');
    });

    it('should handle Generative AI service failure', async () => {
      const mockPubSubMessage = {
        message: {
          data: Buffer.from(JSON.stringify({
            resource: { typeId: 'product' },
            productProjection: {
              id: 'test-product-id',
              masterVariant: {
                images: [{ url: 'https://example.com/test-image.jpg' }],
                attributes: [{ name: 'gen-description', value: 'true' }]
              }
            }
          })).toString('base64')
        }
      };

      const mockImageData = {
        labels: 'cotton, t-shirt, casual wear',
        objects: 'shirt, collar',
        colors: ['255, 255, 255', '0, 0, 0'],
        detectedText: 'Brand Logo',
        webEntities: 'fashion, apparel, clothing'
      };

      (productAnalysis as jest.Mock).mockResolvedValue(mockImageData);
      (generateProductDescription as jest.Mock).mockRejectedValue(new Error('Generative AI service failed'));

      console.info('🚀 Starting test: should handle Generative AI service failure');

      const response = await request(app)
        .post('/event')
        .send(mockPubSubMessage);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('❌ Internal server error. Failed to process request.');
      expect(response.body.details).toBe('Generative AI service failed');
      expect(updateProductDescription).not.toHaveBeenCalled();
      
      console.info('✅ Test passed: handled Generative AI service failure correctly');
    });

    it('should handle Commerce Tools service failure', async () => {
      const mockPubSubMessage = {
        message: {
          data: Buffer.from(JSON.stringify({
            resource: { typeId: 'product' },
            productProjection: {
              id: 'test-product-id',
              masterVariant: {
                images: [{ url: 'https://example.com/test-image.jpg' }],
                attributes: [{ name: 'gen-description', value: 'true' }]
              }
            }
          })).toString('base64')
        }
      };

      const mockImageData = {
        labels: 'cotton, t-shirt, casual wear',
        objects: 'shirt, collar',
        colors: ['255, 255, 255', '0, 0, 0'],
        detectedText: 'Brand Logo',
        webEntities: 'fashion, apparel, clothing'
      };

      const mockDescription = 'A premium cotton t-shirt perfect for casual wear.';

      (productAnalysis as jest.Mock).mockResolvedValue(mockImageData);
      (generateProductDescription as jest.Mock).mockResolvedValue(mockDescription);
      (updateProductDescription as jest.Mock).mockRejectedValue(new Error('Commerce Tools service failed'));

      console.info('🚀 Starting test: should handle Commerce Tools service failure');

      const response = await request(app)
        .post('/event')
        .send(mockPubSubMessage);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('❌ Internal server error. Failed to process request.');
      expect(response.body.details).toBe('Commerce Tools service failed');
      
      console.info('✅ Test passed: handled Commerce Tools service failure correctly');
    });
  });
});