import { Request, Response } from 'express';
import { logger } from '../utils/logger.utils';
import { productAnalysis } from '../services/Vision AI/productAnalysis.service';
import { generateProductDescription } from '../services/Generative AI/descriptionGeneration.service';
import { updateProductDescription } from '../repository/Product/product.repository';
import { ProductAttribute } from '../interfaces/productAttribute.interface';

export const post = async (request: Request, response: Response) => {
    try {
        const pubSubMessage = request.body.message;
        const decodedData = pubSubMessage.data
            ? Buffer.from(pubSubMessage.data, 'base64').toString().trim()
            : undefined;

        if (!decodedData) {
            logger.error('❌ No data found in Pub/Sub message.');
            return response.status(400).send({ error: '❌ No data found in Pub/Sub message.' });
        }

        if (decodedData) {
            logger.info('✅ Event message received.');
            logger.info('✅ Processing event message.');
        }

        const jsonData = JSON.parse(decodedData);
        const productId = jsonData.productProjection?.id;
        const imageUrl = jsonData.productProjection?.masterVariant?.images?.[0]?.url;

        if (productId && imageUrl) {
            const attributes: ProductAttribute[] = jsonData.productProjection?.masterVariant?.attributes || [];
            const genDescriptionAttr = attributes.find(attr => attr.name === 'gen-description');
            const genDescriptionValue = genDescriptionAttr?.value;

            if (genDescriptionValue !== 'true') {
                logger.info('❌ The option for automatic description generation is not enabled.', { productId, imageUrl });
                return response.status(200).send({
                    message: '❌ The option for automatic description generation is not enabled.',
                    productId,
                    imageUrl,
                });
            }

            logger.info('✅ Sending product image to Vision AI.');
            const imageData = await productAnalysis(imageUrl);

            logger.info('✅ Sending image data to Generative AI.');
            const description = await generateProductDescription(imageData);

            logger.info('✅ Sending image description to Commerce Tools.');
            const updateResponse = await updateProductDescription(productId, description);

            logger.info('✅ Process completed successfully.');
            logger.info('⌛ Waiting for next event message.');

            return response.status(200).send({
                productId,
                imageUrl,
                description,
                productAnalysis: imageData,
                commerceToolsUpdate: updateResponse.body
            });
        }
        
    } catch (error) {
        if (error instanceof Error) {
            logger.error('❌ Error processing request', { error: error.message });
            return response.status(500).send({
                error: '❌ Internal server error. Failed to process request.',
                details: error.message,
            });
        }
        logger.error('❌ Unexpected error', { error });
        return response.status(500).send({
            error: '❌ Unexpected error occurred.',
        });
    }
};