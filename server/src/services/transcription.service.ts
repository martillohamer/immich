import { Injectable, NotFoundException } from '@nestjs/common';

import type { AuthDto } from 'src/dtos/auth.dto.js';
import type { JobOf } from 'src/types.js';
import { OnJob } from 'src/decorators.js';
import { TranscriptionResponseDto } from 'src/dtos/transcription.dto.js';
import { AssetVisibility, JobName, JobStatus, Permission, QueueName } from 'src/enum.js';
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

  async get(auth: AuthDto, assetId: string): Promise<TranscriptionResponseDto> {
    await this.requireAccess({ auth, permission: Permission.AssetRead, ids: [assetId] });

    const transcript = await this.transcriptionRepository.getById(assetId);
    if (!transcript) {
      throw new NotFoundException('Transcript not found');
    }

    return {
      text: transcript.text,
      segments: transcript.segments,
      language: transcript.language,
      model: transcript.model,
      createdAt: transcript.createdAt,
    };
  }
}
