import * as dotenv from 'dotenv';
import express, { Express } from 'express';
import bodyParser from 'body-parser';
import EventRoutes from './routes/event.route';
import { readConfiguration } from './utils/config.utils';
import { errorMiddleware } from './middleware/error.middleware';
import CustomError from './errors/custom.error';
dotenv.config();

readConfiguration();

const app: Express = express();
app.disable('x-powered-by');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use('/event', EventRoutes);
app.use('*', () => {
  throw new CustomError(404, '❌ Path not found.');
});

app.use(errorMiddleware);

export default app;
