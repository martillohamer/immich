import { AssetVisibility, JobName, JobStatus } from 'src/enum.js';
import { TranscriptionService } from 'src/services/transcription.service.js';
import { AssetFactory } from 'test/factories/asset.factory.js';
import { systemConfigStub } from 'test/fixtures/system-config.stub.js';
import { ServiceMocks, makeStream, newTestService } from 'test/utils.js';

describe(TranscriptionService.name, () => {
  let sut: TranscriptionService;
  let mocks: ServiceMocks;

  beforeEach(() => {
    ({ sut, mocks } = newTestService(TranscriptionService));

    mocks.assetJob.getForTranscription.mockResolvedValue({
      visibility: AssetVisibility.Timeline,
      ownerId: 'user-id',
      originalFileName: 'audio.mp3',
      originalPath: '/uploads/user-id/audio.mp3',
    });
  });

  it('should work', () => {
    expect(sut).toBeDefined();
  });

  describe('handleQueueTranscription', () => {
    it('should do nothing if transcription is disabled', async () => {
      mocks.systemMetadata.get.mockResolvedValue(systemConfigStub.machineLearningTranscriptionDisabled);

      expect(await sut.handleQueueTranscription({ force: false })).toEqual(JobStatus.Skipped);

      expect(mocks.assetJob.streamForTranscriptionJob).not.toHaveBeenCalled();
      expect(mocks.transcription.deleteAll).not.toHaveBeenCalled();
      expect(mocks.job.queueAll).not.toHaveBeenCalled();
    });

    it('should queue the assets without a transcript', async () => {
      const asset = AssetFactory.create();
      mocks.assetJob.streamForTranscriptionJob.mockReturnValue(makeStream([asset]));

      expect(await sut.handleQueueTranscription({ force: false })).toEqual(JobStatus.Success);

      expect(mocks.job.queueAll).toHaveBeenCalledWith([{ name: JobName.Transcription, data: { id: asset.id } }]);
      expect(mocks.assetJob.streamForTranscriptionJob).toHaveBeenCalledWith(false);
      expect(mocks.transcription.deleteAll).not.toHaveBeenCalled();
    });

    it('should delete all transcripts when forcing', async () => {
      const asset = AssetFactory.create();
      mocks.assetJob.streamForTranscriptionJob.mockReturnValue(makeStream([asset]));

      expect(await sut.handleQueueTranscription({ force: true })).toEqual(JobStatus.Success);

      expect(mocks.transcription.deleteAll).toHaveBeenCalled();
      expect(mocks.job.queueAll).toHaveBeenCalledWith([{ name: JobName.Transcription, data: { id: asset.id } }]);
      expect(mocks.assetJob.streamForTranscriptionJob).toHaveBeenCalledWith(true);
    });
  });

  describe('handleTranscription', () => {
    it('should do nothing if transcription is disabled', async () => {
      mocks.systemMetadata.get.mockResolvedValue(systemConfigStub.machineLearningTranscriptionDisabled);

      expect(await sut.handleTranscription({ id: 'asset-123' })).toEqual(JobStatus.Skipped);

      expect(mocks.machineLearning.transcribe).not.toHaveBeenCalled();
      expect(mocks.transcription.upsert).not.toHaveBeenCalled();
    });

    it('should throw if the asset is not transcribable', async () => {
      mocks.assetJob.getForTranscription.mockResolvedValue(void 0);

      await expect(sut.handleTranscription({ id: 'non-existent' })).rejects.toThrow(
        'Asset non-existent is not a transcribable asset',
      );
    });

    it('should skip hidden assets', async () => {
      mocks.assetJob.getForTranscription.mockResolvedValue({
        visibility: AssetVisibility.Hidden,
        ownerId: 'user-id',
        originalFileName: 'audio.mp3',
        originalPath: '/uploads/user-id/audio.mp3',
      });

      expect(await sut.handleTranscription({ id: 'asset-123' })).toEqual(JobStatus.Skipped);

      expect(mocks.machineLearning.transcribe).not.toHaveBeenCalled();
      expect(mocks.transcription.upsert).not.toHaveBeenCalled();
    });

    it('should transcribe and save the returned objects', async () => {
      const asset = AssetFactory.create();
      mocks.machineLearning.transcribe.mockResolvedValue({
        text: 'Hola mundo',
        segments: [{ start: 0, end: 1, text: 'Hola' }],
        language: 'es',
        model: 'small',
      });

      expect(await sut.handleTranscription({ id: asset.id })).toEqual(JobStatus.Success);

      expect(mocks.machineLearning.transcribe).toHaveBeenCalledWith(
        '/uploads/user-id/audio.mp3',
        expect.objectContaining({ modelName: 'small', language: 'es' }),
      );
      expect(mocks.transcription.upsert).toHaveBeenCalledWith(asset.id, {
        text: 'Hola mundo',
        segments: [{ start: 0, end: 1, text: 'Hola' }],
        language: 'es',
        model: 'small',
      });
      expect(mocks.asset.upsertJobStatus).toHaveBeenCalledWith({ assetId: asset.id, transcribedAt: expect.any(Date) });
    });

    it('should apply config settings', async () => {
      mocks.systemMetadata.get.mockResolvedValue({
        machineLearning: {
          enabled: true,
          transcription: {
            enabled: true,
            modelName: 'whisper-large-v3',
          },
        },
      });
      mocks.machineLearning.transcribe.mockResolvedValue({
        text: 'Hola mundo',
        segments: [],
        language: 'es',
        model: 'whisper-large-v3',
      });

      expect(await sut.handleTranscription({ id: 'asset-123' })).toEqual(JobStatus.Success);

      expect(mocks.machineLearning.transcribe).toHaveBeenCalledWith(
        '/uploads/user-id/audio.mp3',
        expect.objectContaining({ modelName: 'whisper-large-v3', language: 'es' }),
      );
    });

    it('should throw if the asset has no original file name', async () => {
      mocks.assetJob.getForTranscription.mockResolvedValue({
        visibility: AssetVisibility.Timeline,
        ownerId: 'user-id',
        originalFileName: '',
        originalPath: '/uploads/user-id/audio.mp3',
      });

      await expect(sut.handleTranscription({ id: 'asset-123' })).rejects.toThrow(
        'Asset asset-123 is not a transcribable asset',
      );
    });
  });
});
