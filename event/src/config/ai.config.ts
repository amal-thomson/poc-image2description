import { GoogleAuth } from 'google-auth-library';
import vision from '@google-cloud/vision';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';

dotenv.config();

const BASE64_ENCODED_GCP_SERVICE_ACCOUNT = process.env.BASE64_ENCODED_GCP_SERVICE_ACCOUNT;
if (!BASE64_ENCODED_GCP_SERVICE_ACCOUNT) {
    throw new Error("❌ BASE64_ENCODED_GCP_SERVICE_ACCOUNT environment variable is not set.");
}

const GENERATIVE_AI_API_KEY = process.env.GENERATIVE_AI_API_KEY;
if (!GENERATIVE_AI_API_KEY) {
    throw new Error("❌ GENERATIVE_AI_API_KEY environment variable is not set.");
}

const GEMINI_MODEL = process.env.GEMINI_MODEL;
if (!GEMINI_MODEL) {
    throw new Error("❌ GEMINI_MODEL environment variable is not set.");
}

const decodedServiceAccount = Buffer.from(BASE64_ENCODED_GCP_SERVICE_ACCOUNT, 'base64').toString('utf-8');
const credentials = JSON.parse(decodedServiceAccount);

const auth = new GoogleAuth({
    credentials: credentials,
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

export const visionClient = new vision.ImageAnnotatorClient({ auth: auth });
export const genAI = new GoogleGenerativeAI(GENERATIVE_AI_API_KEY);
export const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
