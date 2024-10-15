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

dotenv.config();

const visionCredentials = {
    type: process.env.mygcp_type,
    project_id: process.env.mygcp_project_id,
    private_key_id: process.env.mygcp_private_key_id,
    private_key: process.env.mygcp_private_key,
    client_email: process.env.mygcp_client_email,
    client_id: process.env.mygcp_client_id,
    auth_uri: process.env.mygcp_auth_uri,
    token_uri: process.env.mygcp_token_uri,
    auth_provider_x509_cert_url: process.env.mygcp_auth_provider_x509_cert_url,
    client_x509_cert_url: process.env.mygcp_client_x509_cert_url,
  };

  const visionClient = new vision.ImageAnnotatorClient({
    credentials: visionCredentials,
    projectId: process.env.mygcp_project_id,
    location: process.env.mygcp_location
  });
  
  const vertex_ai = new VertexAI({
    project: process.env.mygcp_project_id,
    location: process.env.mygcp_location
  });

const model = 'gemini-1.5-flash-002';

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
    

    const result = await chat.sendMessage([prompt]);

    if (!result.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
        throw new Error('No valid response received from the model');
    }

    return result.response.candidates[0].content.parts[0].text;
}

async function updateProductDescription(productId: string, description: string): Promise<ClientResponse<any>> {
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

        const imageData = await getImageData(imageUrl);
        
        const description = await generateEnhancedDescription(imageData);
        logger.info(`Product Description: ${description}`);

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
