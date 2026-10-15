// ============================================================
// Policy configuration is readable by authenticated members; only librarians may edit it.
// ============================================================

import { Router } from 'express';
import * as policyController from '../controllers/policy.controller';
import { authenticate, authorize } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { updatePolicySchema } from '../validators';

const router = Router();

router.use(authenticate);

router.get('/', policyController.listPolicies);
router.get('/:key', policyController.getPolicy);
router.put('/', authorize('LIBRARIAN'), validate(updatePolicySchema), policyController.upsertPolicy);
router.delete('/:key', authorize('LIBRARIAN'), policyController.deletePolicy);

export default router;
