import { Router } from 'express';
import * as controller from '../controllers/community.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();
router.use(authenticate);
router.get('/', controller.listFaqs);
router.post('/', authorize('STUDENT', 'FACULTY'), controller.createFaq);
router.put('/:id', authorize('LIBRARIAN'), controller.updateFaq);
router.delete('/:id', authorize('LIBRARIAN'), controller.deleteFaq);
export default router;