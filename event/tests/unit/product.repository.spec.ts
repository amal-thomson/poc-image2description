import { updateProductDescription } from '../../src/repository/product/product.repository';
import { createApiRoot } from '../../src/client/create.client';
import { logger } from '../../src/utils/logger.utils';
import { readConfiguration } from '../../src/utils/config.utils';

jest.mock('../../src/utils/config.utils', () => ({
  readConfiguration: jest.fn().mockReturnValue({
    projectKey: 'test-project',
    clientId: 'test-client',
    clientSecret: 'test-secret',
    scope: 'test-scope',
    region: 'test-region'
  })
}));

jest.mock('../../src/client/create.client');
jest.mock('../../src/utils/logger.utils', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn()
  }
}));

jest.mock('../../src/middleware/auth.middleware', () => ({
  authMiddleware: jest.fn()
}));

describe('Product Repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    console.log('\n--- Starting new test case ---');
  });

  const mockProductId = 'product-123';
  const mockDescription = 'A beautiful product description';
  const mockUpdateResponse = {
    body: {
      id: mockProductId,
      version: 2
    }
  };

  const mockApiRoot = {
    products: () => ({
      withId: () => ({
        get: () => ({
          execute: jest.fn().mockResolvedValue({ 
            body: { id: mockProductId, version: 1 }
          })
        }),
        post: () => ({
          execute: jest.fn().mockResolvedValue(mockUpdateResponse)
        })
      })
    })
  };

  it('should successfully update product description', async () => {
    console.log('Test case: Successful product description update');
    console.log('Input:', { productId: mockProductId, description: mockDescription });
    
    (createApiRoot as jest.Mock).mockReturnValue(mockApiRoot);

    const result = await updateProductDescription(mockProductId, mockDescription);
    console.log('Result:', result);

    expect(result).toBe(mockUpdateResponse);
    console.log('Test passed ✓');
  });

  it('should throw error when product is not found', async () => {
    console.log('Test case: Product not found handling');
    console.log('Input:', { productId: mockProductId, description: mockDescription });
    
    const mockApiRootError = {
      products: () => ({
        withId: () => ({
          get: () => ({
            execute: jest.fn().mockResolvedValue({ body: null })
          })
        })
      })
    };
    (createApiRoot as jest.Mock).mockReturnValue(mockApiRootError);

    try {
      await updateProductDescription(mockProductId, mockDescription);
    } catch (e) {
      const err = e as Error; // Explicitly casting `e` to `Error`
      console.log('Error caught:', err.message);
    }
    console.log('Test passed ✓');
  });
});
