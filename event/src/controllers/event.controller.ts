import { Request, Response } from 'express';
import { VertexAI, HarmCategory, HarmBlockThreshold } from '@google-cloud/vertexai';
import vision from '@google-cloud/vision';
import { logger } from '../utils/logger.utils';
import * as dotenv from 'dotenv';
import { ImageData } from '../interfaces/imageData.interface';
import { ProductAttribute } from '../interfaces/productAttribute.interface';
import { createApiRoot } from '../client/create.client';
import { ClientResponse } from '@commercetools/platform-sdk';
import { ProductUpdateAction, ProductSetDescriptionAction } from '@commercetools/platform-sdk';
import { GoogleAuth } from 'google-auth-library';

dotenv.config();
const base64EncodedServiceAccount = process.env.BASE64_ENCODED_SERVICE_ACCOUNT;

if (!base64EncodedServiceAccount) {
  throw new Error("BASE64_ENCODED_SERVICE_ACCOUNT environment variable is not set.");
}

const decodedServiceAccount = Buffer.from(base64EncodedServiceAccount, 'base64').toString('utf-8');
const credentials = JSON.parse(decodedServiceAccount);

const auth = new GoogleAuth({
    credentials: credentials,
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

const visionClient = new vision.ImageAnnotatorClient({
    auth: auth,
});  

const PROJECT_ID = credentials.project_id;
const REGION = 'us-central1';
const MODEL_NAME = 'gemini-1.5-flash-002';

const vertex_ai = new VertexAI({project: PROJECT_ID, location: REGION});

async function getImageData(imageURL: string): Promise<ImageData> {
    logger.info(`Starting Cloud Vision AI processing for image: ${imageURL}`);
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

    const imageData = {
        labels: result.labelAnnotations?.map((label: any) => label.description).join(', ') || 'No labels detected',
        objects: result.localizedObjectAnnotations?.map((obj: any) => obj.name).join(', ') || 'No objects detected',
        colors: result.imagePropertiesAnnotation?.dominantColors?.colors?.slice(0, 3).map((color: any) => {
            const rgb = color.color;
            return `${Math.round(rgb.red)}, ${Math.round(rgb.green)}, ${Math.round(rgb.blue)}`;
        }) || ['No colors detected'],
        detectedText: result.textAnnotations?.[0]?.description || 'No text detected',
        webEntities: result.webDetection?.webEntities?.slice(0, 5).map((entity: any) => entity.description).join(', ') || 'No web entities detected'
    };

    logger.info('Cloud Vision AI processing completed', { imageData });
    return imageData;
}

async function generateEnhancedDescription(imageData: ImageData): Promise<string> {
    logger.info('Starting Vertex AI processing');

    const safetySettings = [
        { category: 'HARM_CATEGORY_HATE_SPEECH' as HarmCategory, threshold: 'BLOCK_NONE' as HarmBlockThreshold },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT' as HarmCategory, threshold: 'BLOCK_NONE' as HarmBlockThreshold },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT' as HarmCategory, threshold: 'BLOCK_NONE' as HarmBlockThreshold },
        { category: 'HARM_CATEGORY_HARASSMENT' as HarmCategory, threshold: 'BLOCK_NONE' as HarmBlockThreshold }
    ];

    try {
        const generativeModel = vertex_ai.preview.getGenerativeModel({
            model: MODEL_NAME,
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
            Web entities: ${imageData.webEntities}
        
            Guidelines:
            1. Use a professional, engaging tone suitable for e-commerce.
            2. Specify the target category of the apparel (e.g., men's, women's, kids', boys', or girls').
            3. Highlight the apparel's key features, such as style, fit, and comfort, and how they cater to the target category.
            4. Describe the fabric confidently, focusing on its smoothness, breathability, or comfort (avoid uncertain phrases like "while not specified").
            5. If colors are not properly detected, describe them in an appealing way (e.g., 'a crisp light color' or 'a subtle neutral tone'). If colors are detected, focus on other attributes of the apparel.
            6. Suggest suitable occasions for wearing the item, such as casual outings, formal events, or workouts, and how it fits within the lifestyle of the target category.
            7. Emphasize any unique styling possibilities, such as pairing with accessories or layering options.
            8. Include care instructions if relevant (e.g., machine washable, hand wash recommended).
            9. Keep the description concise but descriptive, within 100-150 words.
            10. Include relevant sizing, fit information, or recommendations based on the detected elements, if available.
            11. Additionally, generate a 'Key Features' section summarizing the apparel's key attributes, focusing on fabric, fit, and versatility.
            
            Please ensure no text styling such as bold (**), italics (*), or underlining (_) is used in the description or key features section.`
        };

        logger.info('Sending prompt to Vertex AI');
        const result = await chat.sendMessage([prompt]);

        if (!result.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
            throw new Error('No valid response received from the model');
        }

        const generatedDescription = result.response.candidates[0].content.parts[0].text;
        logger.info('Vertex AI processing completed', { generatedDescription });
        return generatedDescription;

    } catch (error: any) {
        logger.error('Detailed error in Vertex AI processing:', {
            error: error.message,
            stack: error.stack,
            projectId: credentials.project_id,
            modelName: MODEL_NAME,
            errorCode: error.code,
            errorDetails: error.details,
        });
        if (error.message.includes('Permission \'aiplatform.endpoints.predict\' denied')) {
            throw new Error('Permission denied when accessing Vertex AI. Please check the service account permissions.');
        } else {
            throw error;
        }
    }
}

async function updateProductDescription(productId: string, description: string): Promise<ClientResponse<any>> {
    logger.info(`Updating product description for product ID: ${productId}`);
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

    logger.info('Product description updated successfully', { productId, updateResponse: updateResponse.body });
    return updateResponse;
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
            logger.info('The option for automatic description generation is not enabled.', { productId, imageUrl });
            return response.status(200).json({
                message: 'The option for automatic description generation is not enabled.',
                productId,
                imageUrl,
            });
        }

        const imageData = await getImageData(imageUrl);
        
        const description = await generateEnhancedDescription(imageData);

        const updateResponse = await updateProductDescription(productId, description);

        logger.info('Process completed successfully', { 
            productId, 
            imageUrl, 
            imageAnalysis: imageData, 
            generatedDescription: description,
            updateResponse: updateResponse.body 
        });

        return response.status(200).json({
            productId,
            imageUrl,
            description,
            imageAnalysis: imageData,
            commerceToolsUpdate: updateResponse.body
        });

    } catch (error) {
        if (error instanceof Error) {
            if (error.message.includes('Permission denied when accessing Vertex AI')) {
                logger.error('Vertex AI permission error', { error: error.message });
                return response.status(403).json({
                    error: 'Permission denied when accessing Vertex AI',
                    details: 'Please check the service account permissions and ensure the Vertex AI API is enabled.',
                });
            } else {
                logger.error('Error processing request', { error: error.message });
                return response.status(500).json({
                    error: 'Internal server error. Failed to process request.',
                    details: error.message,
                });
            }
        } else {
            logger.error('Unknown error occurred', { error: String(error) });
            return response.status(500).json({
                error: 'Internal server error.',
                details: 'Unknown error occurred',
            });
        }
    }
};

