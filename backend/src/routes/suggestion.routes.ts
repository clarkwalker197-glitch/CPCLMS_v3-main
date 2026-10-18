import { Router } from 'express';
import * as controller from '../controllers/community.controller';
import { authenticate, authorize } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { rateSuggestionSchema } from '../validators/suggestion.schema';

const router = Router();
router.use(authenticate);
router.post('/', authorize('STUDENT', 'FACULTY'), controller.createSuggestion);
router.get('/mine', authorize('STUDENT', 'FACULTY'), controller.listMineSuggestions);
router.get('/', authorize('LIBRARIAN'), controller.listSuggestions);
router.post('/:id/rating', authorize('STUDENT', 'FACULTY'), validate(rateSuggestionSchema), controller.rateSuggestion);
router.patch('/:id', authorize('LIBRARIAN'), controller.updateSuggestion);
export default router;