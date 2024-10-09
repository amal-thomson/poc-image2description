import { Request, Response } from 'express';
import { VertexAI, HarmCategory, HarmBlockThreshold } from '@google-cloud/vertexai';
import vision from '@google-cloud/vision';
import { logger } from '../utils/logger.utils';
import * as dotenv from 'dotenv';
import { ImageData } from '../interfaces/imageData.interface';
import { ProductAttribute } from '../interfaces/productAttribute.interface';
import { createApiRoot } from '../client/create.client';  // Import the CommerceTools client
import { ClientResponse } from '@commercetools/platform-sdk';
import {
    ProductUpdate,
    ProductUpdateAction,
    ProductSetDescriptionAction
  } from '@commercetools/platform-sdk';

dotenv.config();

const visionClient = new vision.ImageAnnotatorClient();
const vertex_ai = new VertexAI({
    project: process.env.GOOGLE_PROJECT,
    location: process.env.GOOGLE_LOCATION
});
const model = 'gemini-1.5-flash-002';

// Function to get product data from image using Google Vision API
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

// Function to generate description using VertexAI
async function generateEnhancedDescription(imageData: ImageData): Promise<string> {
    const safetySettings = [
        { category: 'HARM_CATEGORY_HATE_SPEECH' as HarmCategory, threshold: 'BLOCK_NONE' as HarmBlockThreshold },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT' as HarmCategory, threshold: 'BLOCK_NONE' as HarmBlockThreshold },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT' as HarmCategory, threshold: 'BLOCK_NONE' as HarmBlockThreshold },
        { category: 'HARM_CATEGORY_HARASSMENT' as HarmCategory, threshold: 'BLOCK_NONE' as HarmBlockThreshold }
    ];

    const generativeModel = vertex_ai.preview.getGenerativeModel({
        model: model,
        generationConfig: {
            maxOutputTokens: 8192,
            temperature: 0.7,
            topP: 0.95,
        },
        safetySettings
    });

    const chat = generativeModel.startChat({});

    const prompt = {
      text: `As an expert e-commerce product copywriter, craft a captivating product description based on the following image analysis for an apparel item:
      Labels: ${imageData.labels}
      Objects detected: ${imageData.objects}
      Dominant colors: ${imageData.colors.join(', ')}
      Text detected: ${imageData.detectedText}
      Web entities: ${imageData.webEntities}`
  };  

    const result = await chat.sendMessage([prompt]);

    if (!result.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
        throw new Error('No valid response received from the model');
    }

    return result.response.candidates[0].content.parts[0].text;
}

async function updateProductDescription(productId: string, description: string): Promise<ClientResponse<any>> {
    const apiRoot = createApiRoot();

    // Fetch the current product data to get the version
    const productResponse = await apiRoot.products().withId({ ID: productId }).get().execute();
    const currentProduct = productResponse.body;
    const currentVersion = currentProduct.version;

    // Prepare update actions as ProductSetDescriptionAction
    const updateActions: ProductUpdateAction[] = [
        {
            action: 'setDescription',
            description: {
                en: description  // Assuming the description is in English
            }
        } as ProductSetDescriptionAction
    ];

    // Send update request
    return await apiRoot.products().withId({ ID: productId }).post({
        body: {
            version: currentVersion,
            actions: updateActions
        }
    }).execute();
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

        // Get image data using Google Vision
        const imageData = await getImageData(imageUrl);
        
        // Generate description using Vertex AI
        const description = await generateEnhancedDescription(imageData);
        logger.info(`Product Description: ${description}`);

        // Update product description in CommerceTools
        const updateResponse = await updateProductDescription(productId, description);
        logger.info(`Product description updated successfully: ${updateResponse.body}`);

        return response.status(200).json({
            productId,
            imageUrl,
            description,
            imageAnalysis: imageData,
            commerceToolsUpdate: updateResponse.body
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
