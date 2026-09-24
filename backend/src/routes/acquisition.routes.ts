import { Router } from 'express';
import * as controller from '../controllers/community.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();
router.use(authenticate);
router.post('/', authorize('STUDENT', 'FACULTY'), controller.createAcquisitionRequest);
router.get('/mine', authorize('STUDENT', 'FACULTY'), controller.listMineAcquisitionRequests);
router.get('/', authorize('LIBRARIAN'), controller.listAcquisitionRequests);
router.patch('/:id', authorize('LIBRARIAN'), controller.updateAcquisitionRequest);
export default router;