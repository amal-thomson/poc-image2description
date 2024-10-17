import { GoogleAuth } from 'google-auth-library';
import vision from '@google-cloud/vision';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';

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

export const visionClient = new vision.ImageAnnotatorClient({ auth: auth });

const API_KEY = process.env.GENERATIVE_AI_API_KEY;

if (!API_KEY) {
    throw new Error("GENERATIVE_AI_API_KEY environment variable is not set.");
}

export const genAI = new GoogleGenerativeAI(API_KEY);
export const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-002" });