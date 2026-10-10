// ============================================================
// Notification Routes
// ============================================================

import { Router } from 'express';
import * as notificationController from '../controllers/notification.controller';
import * as pushController from '../controllers/push.controller';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { pushSubscriptionSchema, pushUnsubscriptionSchema } from '../validators/push.schema';

const router = Router();

router.use(authenticate);

router.get('/push/public-key', pushController.getPublicKey);
router.post('/push/subscribe', validate(pushSubscriptionSchema), pushController.subscribe);
router.delete('/push/subscribe', validate(pushUnsubscriptionSchema), pushController.unsubscribe);
router.get('/', notificationController.listNotifications);
router.get('/unread-count', notificationController.getUnreadCount);
router.put('/mark-all-read', notificationController.markAllAsRead);
router.put('/:id/read', notificationController.markAsRead);
router.delete('/:id', notificationController.deleteNotification);

export default router;
