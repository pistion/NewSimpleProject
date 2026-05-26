import express from 'express';
import FrontPageController from '../controllers/frontPage.controller.js';

const router = express.Router();

router.get('/', FrontPageController.serveIndex);

export default router;
