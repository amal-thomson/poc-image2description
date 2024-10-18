import { ImageData } from '../../interfaces/imageData.interface';
import { logger } from '../../utils/logger.utils';
import { model } from '../../config/ai.config';

export async function generateProductDescription(imageData: ImageData): Promise<string> {
    logger.info('✅ Starting Generative AI for processing image data.');

    const prompt = `
        As an expert e-commerce product copywriter, craft a captivating product description based on the following image analysis for an apparel item:
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
        
        Please ensure no text styling such as bold (**), italics (*), or underlining (_) is used in the description or key features section.
    `;

    try {
        logger.info('✅ Sending prompt to Generative AI.');
        const result = await model.generateContent(prompt);

        const generatedDescription = result.response.text();
        logger.info('✅ Generative AI processing completed.');
        return generatedDescription;

    } catch (error: any) {
        logger.error('❌ Detailed error in Google Generative AI processing:', {
            error: error.message,
            stack: error.stack,
            modelName: "gemini-1.5-flash-002",
        });
        throw error;
    }
}