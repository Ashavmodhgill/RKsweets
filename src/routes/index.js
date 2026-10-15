import express from 'express';

import V1Routes from './V1/index.js';

const router = express.Router();

router.use('/v1', V1Routes);
 export default router;

 
