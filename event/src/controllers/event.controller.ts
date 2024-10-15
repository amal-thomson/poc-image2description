import { Request, Response } from 'express';
import vision from '@google-cloud/vision';
import { logger } from '../utils/logger.utils';
import * as dotenv from 'dotenv';
import { ImageData } from '../interfaces/imageData.interface';
import { ProductAttribute } from '../interfaces/productAttribute.interface';

dotenv.config();
const base64EncodedServiceAccount = process.env.BASE64_ENCODED_SERVICE_ACCOUNT;

if (!base64EncodedServiceAccount) {
    throw new Error("BASE64_ENCODED_SERVICE_ACCOUNT environment variable is not set.");
}

const decodedServiceAccount = Buffer.from(base64EncodedServiceAccount, 'base64').toString('utf-8');
const credentials = JSON.parse(decodedServiceAccount);
const pid = credentials.project_id;

logger.info(`Project ID: ${pid}`);

const visionClient = new vision.ImageAnnotatorClient({
    credentials: credentials,
});

async function getImageData(imageURL: string): Promise<ImageData> {
    const request = {
        image: { source: { imageUri: imageURL } },
        features: [
            { type: 'LABEL_DETECTION' },
            { type: 'OBJECT_LOCALIZATION' },
            { type: 'IMAGE_PROPERTIES' },
            { type: 'TEXT_DETECTION' },
            { type: 'SAFE_SEARCH_DETECTION' },
            { type: 'WEB_DETECTION' }
        ]
    };
    const [result] = await visionClient.annotateImage(request);

    return {
        labels: result.labelAnnotations?.map((label: any) => label.description).join(', ') || 'No labels detected',
        objects: result.localizedObjectAnnotations?.map((obj: any) => obj.name).join(', ') || 'No objects detected',
        colors: result.imagePropertiesAnnotation?.dominantColors?.colors?.slice(0, 3).map((color: any) => {
            const rgb = color.color;
            return `${Math.round(rgb.red)}, ${Math.round(rgb.green)}, ${Math.round(rgb.blue)}`;
        }) || ['No colors detected'],
        detectedText: result.textAnnotations?.[0]?.description || 'No text detected',
        webEntities: result.webDetection?.webEntities?.slice(0, 5).map((entity: any) => entity.description).join(', ') || 'No web entities detected'
    };
}

export const post = async (request: Request, response: Response) => {
    try {
        if (!request.body.message) {
            logger.error('No Pub/Sub message received.');
            return response.status(400).json({ error: 'No Pub/Sub message received' });
        }

        const pubSubMessage = request.body.message;
        const decodedData = pubSubMessage.data
            ? Buffer.from(pubSubMessage.data, 'base64').toString().trim()
            : undefined;

        if (!decodedData) {
            logger.error('No data found in Pub/Sub message.');
            return response.status(400).json({ error: 'No data found in Pub/Sub message' });
        }

        const jsonData = JSON.parse(decodedData);

        const productId = jsonData.productProjection?.id;
        const imageUrl = jsonData.productProjection?.masterVariant?.images?.[0]?.url;

        if (!productId || !imageUrl) {
            logger.error('productId or imageUrl is missing from the Pub/Sub message data.');
            return response.status(400).json({ error: 'productId or imageUrl is missing' });
        }

        logger.info(`Processing product ID: ${productId}`);
        logger.info(`Product image URL: ${imageUrl}`);

        const attributes: ProductAttribute[] = jsonData.productProjection?.masterVariant?.attributes || [];

        const genDescriptionAttr = attributes.find(attr => attr.name === 'gen-description');
        const genDescriptionValue = genDescriptionAttr?.value;

        if (genDescriptionValue !== 'true') {
            logger.info('The option for automatic description generation is not enabled.');
            return response.status(200).json({
                message: 'The option for automatic description generation is not enabled.',
                productId,
                imageUrl,
            });
        }

        const imageData = await getImageData(imageUrl);
        
        logger.info(`Image Analysis: ${JSON.stringify(imageData)}`);

        return response.status(200).json({
            productId,
            imageUrl,
            imageAnalysis: imageData,
        });

    } catch (error) {
        if (error instanceof Error) {
            logger.error('Error processing request', { error: error.message });
            return response.status(500).json({
                error: 'Internal server error. Failed to process request.',
                details: error.message,
            });
        } else {
            logger.error('Unknown error occurred', { error: String(error) });
            return response.status(500).json({
                error: 'Internal server error.',
                details: 'Unknown error occurred',
            });
        }
    }
};
