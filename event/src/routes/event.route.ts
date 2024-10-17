import { Router } from 'express';
import { post } from '../controllers/event.controller';
import { logger } from '../utils/logger.utils';

const eventRouter: Router = Router();

eventRouter.post('/', post);

export default eventRouter;

