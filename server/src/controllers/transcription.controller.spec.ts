import { BadRequestException, NotFoundException } from '@nestjs/common';
import request from 'supertest';
import { TranscriptionController } from 'src/controllers/transcription.controller.js';
import { TranscriptionService } from 'src/services/transcription.service.js';
import { factory } from 'test/small.factory.js';
import { ControllerContext, controllerSetup, mockBaseService } from 'test/utils.js';

describe(TranscriptionController.name, () => {
  let ctx: ControllerContext;
  const service = mockBaseService(TranscriptionService);

  beforeAll(async () => {
    ctx = await controllerSetup(TranscriptionController, [{ provide: TranscriptionService, useValue: service }]);
    return () => ctx.close();
  });

  beforeEach(() => {
    service.resetAllMocks();
    ctx.reset();
  });

  describe('GET /transcript/:assetId', () => {
    it('should require a valid assetId', async () => {
      const { status, body } = await request(ctx.getHttpServer()).get('/transcript/not-a-uuid');

      expect(status).toBe(400);
      expect(body).toEqual(factory.responses.validationError([{ path: ['assetId'], message: 'Invalid UUID' }]));
      expect(service.get).not.toHaveBeenCalled();
    });

    it('should return the transcript for the asset', async () => {
      const assetId = factory.uuid();
      const createdAt = new Date('2025-01-01T00:00:00.000Z');
      service.get.mockResolvedValue({
        text: 'Hola mundo',
        segments: [{ start: 0, end: 1, text: 'Hola' }],
        language: 'es',
        model: 'small',
        createdAt,
      });

      const { status, body } = await request(ctx.getHttpServer()).get(`/transcript/${assetId}`);

      expect(status).toBe(200);
      expect(service.get).toHaveBeenCalledWith(undefined, assetId);
      expect(body).toEqual({
        text: 'Hola mundo',
        segments: [{ start: 0, end: 1, text: 'Hola' }],
        language: 'es',
        model: 'small',
        createdAt: createdAt.toISOString(),
      });
    });

    it('should throw a 404 when the asset has no transcript', async () => {
      const assetId = factory.uuid();
      service.get.mockRejectedValue(new NotFoundException('Transcript not found'));

      const { status, body } = await request(ctx.getHttpServer()).get(`/transcript/${assetId}`);

      expect(status).toBe(404);
      expect(body).toEqual(factory.responses.badRequest('Transcript not found'));
    });

    it('should throw a 400 when the user cannot access the asset', async () => {
      const assetId = factory.uuid();
      service.get.mockRejectedValue(new BadRequestException('Not found or no asset.read access'));

      const { status, body } = await request(ctx.getHttpServer()).get(`/transcript/${assetId}`);

      expect(status).toBe(400);
      expect(body).toEqual(factory.responses.badRequest('Not found or no asset.read access'));
    });
  });
});
