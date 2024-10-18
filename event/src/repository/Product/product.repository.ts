import { ClientResponse } from '@commercetools/platform-sdk';
import { ProductUpdateAction, ProductSetDescriptionAction } from '@commercetools/platform-sdk';
import { createApiRoot } from '../../client/create.client';
import { logger } from '../../utils/logger.utils';

export async function updateProductDescription(productId: string, description: string): Promise<ClientResponse<any>> {
    logger.info(`✅ Updating product description in Commerce Tools.`);
    const apiRoot = createApiRoot();

    const productResponse = await apiRoot.products().withId({ ID: productId }).get().execute();
    const currentProduct = productResponse.body;
    const currentVersion = currentProduct.version;

    const updateActions: ProductUpdateAction[] = [
        {
            action: 'setDescription',
            description: {
                en: description  
            }
        } as ProductSetDescriptionAction
    ];

    const updateResponse = await apiRoot.products().withId({ ID: productId }).post({
        body: {
            version: currentVersion,
            actions: updateActions
        }
    }).execute();

    logger.info('✅ Product description updated successfully in Commerce Tools.');
    return updateResponse;
}