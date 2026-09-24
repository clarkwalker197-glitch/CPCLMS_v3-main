import { Router } from 'express';
import * as controller from '../controllers/community.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();
router.use(authenticate);
router.post('/', authorize('STUDENT', 'FACULTY'), controller.createSuggestion);
router.get('/mine', authorize('STUDENT', 'FACULTY'), controller.listMineSuggestions);
router.get('/', authorize('LIBRARIAN'), controller.listSuggestions);
router.patch('/:id', authorize('LIBRARIAN'), controller.updateSuggestion);
export default router;