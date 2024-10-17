import * as dotenv from 'dotenv';
import { logger } from './utils/logger.utils';
import app from './app';
dotenv.config();

const PORT = 8080;

const server = app.listen(PORT, () => {
  logger.info(`✅ Event application listening on port ${PORT}.`);
});

export default server;
