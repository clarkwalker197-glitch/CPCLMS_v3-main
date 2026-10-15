import { prisma } from '../config';
import { BadRequestError, NotFoundError } from '../utils/errors';
import { notificationService } from './notification.service';

const suggestionStatuses = new Set(['PENDING', 'REVIEWED', 'ACCEPTED', 'REJECTED']);
const acquisitionStatuses = new Set(['PENDING', 'ACCEPTED', 'REJECTED', 'FULFILLED']);

export class CommunityService {
  async listFaqs(includeUnpublished = false) {
    return prisma.faq.findMany({
      where: includeUnpublished ? undefined : { isPublished: true },
      ...(includeUnpublished ? {
        include: { createdBy: { select: { firstName: true, lastName: true, role: true } } },
      } : {}),
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async submitFaqQuestion(question: string, createdById: string) {
    const trimmedQuestion = question?.trim();
    if (!trimmedQuestion) throw new BadRequestError('Question is required');
    if (trimmedQuestion.length > 1000) throw new BadRequestError('Question must be 1000 characters or fewer');

    return prisma.faq.create({
      data: {
        question: trimmedQuestion,
        answer: '',
        isPublished: false,
        createdById,
      },
    });
  }

  async updateFaq(id: string, input: Partial<{ question: string; answer: string; category: string; sortOrder: number; isPublished: boolean }>) {
    const existing = await prisma.faq.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('FAQ');
    if (input.isPublished && !(input.answer ?? existing.answer).trim()) {
      throw new BadRequestError('An answer is required before publishing this FAQ');
    }
    const faq = await prisma.faq.update({ where: { id }, data: input });
    if (!existing.isPublished && faq.isPublished) {
      await notificationService.notifyStudentsAndFaculty(
        'FAQ_PUBLISHED',
        'New FAQ',
        `New FAQ: "${faq.question}"`,
        '/faq'
      );
    }
    return faq;
  }

  async deleteFaq(id: string) {
    await prisma.faq.delete({ where: { id } });
  }

  async createSuggestion(userId: string, input: { subject: string; message: string }) {
    if (!input.subject?.trim() || !input.message?.trim()) throw new BadRequestError('Subject and message are required');
    const suggestion = await prisma.suggestion.create({
      data: { userId, subject: input.subject.trim(), message: input.message.trim() },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    const memberName = suggestion.user
      ? `${suggestion.user.firstName} ${suggestion.user.lastName}`.trim()
      : 'a deleted member';
    await notificationService.notifyAllLibrarians(
      'SUGGESTION_NEW',
      'New suggestion',
      `New suggestion: "${suggestion.subject}" from ${memberName}`,
      '/suggestions'
    );
    return suggestion;
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
    const existing = await prisma.suggestion.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Suggestion');
    const suggestion = await prisma.suggestion.update({ where: { id }, data: input });
    if (input.status && input.status !== existing.status && suggestion.userId) {
      await notificationService.createNotification(
        suggestion.userId,
        'SUGGESTION_UPDATED',
        'Suggestion status updated',
        `Your suggestion "${suggestion.subject}" was marked ${suggestion.status.toLowerCase()}`,
        '/suggestions'
      );
    }
    return suggestion;
  }

  async createAcquisitionRequest(userId: string, input: { title: string; author?: string; isbn?: string; details?: string }) {
    if (!input.title?.trim()) throw new BadRequestError('Book title is required');
    const request = await prisma.acquisitionRequest.create({
      data: { userId, title: input.title.trim(), author: input.author?.trim() || undefined, isbn: input.isbn?.trim() || undefined, details: input.details?.trim() || undefined },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    const memberName = request.user
      ? `${request.user.firstName} ${request.user.lastName}`.trim()
      : 'a deleted member';
    await notificationService.notifyAllLibrarians(
      'ACQUISITION_REQUEST_NEW',
      'New book request',
      `New book request: "${request.title}" from ${memberName}`,
      '/acquisition-requests'
    );
    return request;
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
    const existing = await prisma.acquisitionRequest.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Acquisition request');
    const request = await prisma.acquisitionRequest.update({ where: { id }, data: input });
    if (input.status && input.status !== existing.status && request.userId) {
      await notificationService.createNotification(
        request.userId,
        'ACQUISITION_REQUEST_UPDATED',
        'Book request status updated',
        `Your book request "${request.title}" was ${request.status.toLowerCase()}`,
        '/acquisition-requests'
      );
    }
    return request;
  }
}

export const communityService = new CommunityService();