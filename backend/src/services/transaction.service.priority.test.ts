import assert from 'node:assert/strict';
import { Role } from '@prisma/client';
import { TransactionService } from './transaction.service';

const reservations = [
  { user: { role: Role.STUDENT }, reservationDate: new Date('2025-02-10T10:00:00Z') },
  { user: { role: Role.FACULTY }, reservationDate: new Date('2025-02-08T09:00:00Z') },
  { user: { role: Role.STUDENT }, reservationDate: new Date('2025-02-09T08:00:00Z') },
  { user: { role: Role.FACULTY }, reservationDate: new Date('2025-02-11T09:00:00Z') },
];

const sorted = [...reservations].sort(TransactionService.sortReservationsByPriority);
assert.equal(sorted[0].user.role, Role.FACULTY, 'Faculty reservation should be prioritized first');
assert.equal(sorted[1].user.role, Role.FACULTY, 'Faculty reservations should stay ordered by oldest request');
assert.equal(sorted[2].user.role, Role.STUDENT, 'Student reservations should follow faculty reservations');
assert.equal(sorted[3].user.role, Role.STUDENT, 'Student reservations should remain in oldest-first order');

console.log('reservation priority check passed');
