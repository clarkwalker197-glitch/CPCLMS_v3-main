import { prisma } from '../config';
import { BadRequestError, NotFoundError } from '../utils/errors';

const suggestionStatuses = new Set(['PENDING', 'REVIEWED', 'ACCEPTED', 'REJECTED']);
const acquisitionStatuses = new Set(['PENDING', 'ACCEPTED', 'REJECTED', 'FULFILLED']);

export class CommunityService {
  async listFaqs(includeUnpublished = false) {
    return prisma.faq.findMany({
      where: includeUnpublished ? undefined : { isPublished: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createFaq(input: { question: string; answer: string; category?: string; sortOrder?: number; isPublished?: boolean; createdById: string }) {
    return prisma.faq.create({ data: { ...input, category: input.category || undefined } });
  }

  async updateFaq(id: string, input: Partial<{ question: string; answer: string; category: string; sortOrder: number; isPublished: boolean }>) {
    return prisma.faq.update({ where: { id }, data: input });
  }

  async deleteFaq(id: string) {
    await prisma.faq.delete({ where: { id } });
  }

  async createSuggestion(userId: string, input: { subject: string; message: string }) {
    if (!input.subject?.trim() || !input.message?.trim()) throw new BadRequestError('Subject and message are required');
    return prisma.suggestion.create({ data: { userId, subject: input.subject.trim(), message: input.message.trim() } });
  }

  async listSuggestions(userId?: string, status?: string) {
    return prisma.suggestion.findMany({
      where: { ...(userId ? { userId } : {}), ...(status ? { status } : {}) },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true, department: true, role: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateSuggestion(id: string, input: { status?: string; adminNote?: string }) {
    if (input.status && !suggestionStatuses.has(input.status)) throw new BadRequestError('Invalid suggestion status');
    return prisma.suggestion.update({ where: { id }, data: input });
  }

  async createAcquisitionRequest(userId: string, input: { title: string; author?: string; isbn?: string; details?: string }) {
    if (!input.title?.trim()) throw new BadRequestError('Book title is required');
    return prisma.acquisitionRequest.create({ data: { userId, title: input.title.trim(), author: input.author?.trim() || undefined, isbn: input.isbn?.trim() || undefined, details: input.details?.trim() || undefined } });
  }

  async listAcquisitionRequests(userId?: string, status?: string) {
    return prisma.acquisitionRequest.findMany({
      where: { ...(userId ? { userId } : {}), ...(status ? { status } : {}) },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true, department: true, role: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateAcquisitionRequest(id: string, input: { status?: string; adminNote?: string }) {
    if (input.status && !acquisitionStatuses.has(input.status)) throw new BadRequestError('Invalid acquisition request status');
    return prisma.acquisitionRequest.update({ where: { id }, data: input });
  }
}

export const communityService = new CommunityService();