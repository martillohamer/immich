import { Injectable } from '@nestjs/common';

import type { JobOf } from 'src/types.js';
import { OnJob } from 'src/decorators.js';
import { AssetVisibility, JobName, JobStatus, QueueName } from 'src/enum.js';
import { BaseService } from 'src/services/base.service.js';
import { batched, isTranscriptionEnabled } from 'src/utils/misc.js';

@Injectable()
export class TranscriptionService extends BaseService {
  @OnJob({ name: JobName.TranscriptionQueueAll, queue: QueueName.Transcription })
  async handleQueueTranscription({ force }: JobOf<JobName.TranscriptionQueueAll>): Promise<JobStatus> {
    const { machineLearning } = await this.getConfig({ withCache: false });
    if (!isTranscriptionEnabled(machineLearning)) {
      return JobStatus.Skipped;
    }

    if (force) {
      await this.transcriptionRepository.deleteAll();
    }

    for await (const assets of batched(this.assetJobRepository.streamForTranscriptionJob(force))) {
      await this.jobRepository.queueAll(
        assets.map((asset) => ({ name: JobName.Transcription, data: { id: asset.id } })),
      );
    }

    return JobStatus.Success;
  }

  @OnJob({ name: JobName.Transcription, queue: QueueName.Transcription })
  async handleTranscription({ id }: JobOf<JobName.Transcription>): Promise<JobStatus> {
    const { machineLearning } = await this.getConfig({ withCache: true });
    if (!isTranscriptionEnabled(machineLearning)) {
      return JobStatus.Skipped;
    }

    const asset = await this.assetJobRepository.getForTranscription(id);
    if (!asset || !asset.originalPath || !asset.originalFileName) {
      throw new Error(`Asset ${id} is not a transcribable asset`);
    }

    if (asset.visibility === AssetVisibility.Hidden) {
      return JobStatus.Skipped;
    }

    const transcript = await this.machineLearningRepository.transcribe(asset.originalPath, {
      modelName: machineLearning.transcription.modelName,
      language: 'es',
    });
    await this.transcriptionRepository.upsert(id, transcript);
    await this.assetRepository.upsertJobStatus({ assetId: id, transcribedAt: new Date() });

    this.logger.debug(`Transcribed ${asset.originalFileName} for ${id}`);
    return JobStatus.Success;
  }
}
