// ============================================================
// Policy Configuration Service
// ============================================================

import { prisma } from '../config';
import { AppError, ConflictError, NotFoundError } from '../utils/errors';
import { recordActivity } from './activity-log.service';
import { Prisma } from '@prisma/client';

export class PolicyService {
  /**
   * Get all policies
   */
  async listPolicies() {
    return prisma.policy.findMany({ orderBy: { key: 'asc' } });
  }

  /**
   * Get a single policy by key
   */
  async getPolicyByKey(key: string) {
    const policy = await prisma.policy.findUnique({ where: { key } });
    if (!policy) throw new NotFoundError(`Policy '${key}'`);
    return policy;
  }

  /**
   * Update or create a policy (upsert)
   */
  async upsertPolicy(
    key: string,
    value: string,
    description: string | undefined,
    expectedUpdatedAt: string | null,
    actor: { userId: string; ipAddress?: string },
  ) {
    if (expectedUpdatedAt !== null && Number.isNaN(Date.parse(expectedUpdatedAt))) {
      throw new ConflictError('The policy version is invalid. Reload the latest policy before saving.');
    }
    try {
      return await prisma.$transaction(async (tx) => {
        let policy;
        if (expectedUpdatedAt === null) {
          policy = await tx.policy.create({ data: { key, value, description } });
        } else {
          const expectedVersion = new Date(expectedUpdatedAt);
          const result = await tx.policy.updateMany({
            where: { key, updatedAt: expectedVersion },
            data: {
              value,
              description,
              updatedAt: new Date(Math.max(Date.now(), expectedVersion.getTime() + 1)),
            },
          });
          if (result.count !== 1) {
            throw new ConflictError('This policy was changed by another administrator. Reload the latest policy before saving.');
          }
          policy = await tx.policy.findUnique({ where: { key } });
          if (!policy) {
            throw new ConflictError('This policy was removed by another administrator. Reload the latest policies before saving.');
          }
        }

        await recordActivity({
          userId: actor.userId,
          action: 'UPDATE_POLICY',
          description: `Updated policy "${key}"`,
          entity: 'Policy',
          entityId: key,
          ipAddress: actor.ipAddress,
          details: { key },
        }, tx);
        return policy;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof ConflictError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002' || error.code === 'P2034') {
          throw new ConflictError('This policy was changed by another administrator. Reload the latest policy before saving.');
        }
        console.error('Policy update failed due to a database error:', error);
        throw new AppError('Unable to save this policy right now. Please try again.', 503);
      }
      console.error('Policy update failed:', error);
      throw new AppError('Unable to save this policy right now. Please try again.', 503);
    }
  }

  /**
   * Delete a policy
   */
  async deletePolicy(key: string, actor: { userId: string; ipAddress?: string }) {
    await prisma.$transaction(async (tx) => {
      const policy = await tx.policy.findUnique({ where: { key } });
      if (!policy) throw new NotFoundError(`Policy '${key}'`);

      await tx.policy.delete({ where: { key } });
      await recordActivity({
        userId: actor.userId,
        action: 'UPDATE_SETTINGS',
        description: `Deleted policy "${key}"`,
        entity: 'Policy',
        entityId: key,
        ipAddress: actor.ipAddress,
        details: { key, change: 'deleted' },
      }, tx);
    });
  }

  /**
   * Get a policy value as number with fallback
   */
  async getNumber(key: string, fallback: number): Promise<number> {
    const policy = await prisma.policy.findUnique({ where: { key } });
    if (!policy) return fallback;
    const parsed = parseInt(policy.value, 10);
    return isNaN(parsed) ? fallback : parsed;
  }

  /**
   * Get a policy value as float with fallback
   */
  async getFloat(key: string, fallback: number): Promise<number> {
    const policy = await prisma.policy.findUnique({ where: { key } });
    if (!policy) return fallback;
    const parsed = parseFloat(policy.value);
    return isNaN(parsed) ? fallback : parsed;
  }
}

export const policyService = new PolicyService();
