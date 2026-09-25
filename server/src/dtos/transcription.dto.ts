import { createZodDto } from 'nestjs-zod';
import z from 'zod';
import { isoDatetimeToDate } from 'src/validation.js';

const TranscriptionParamSchema = z.object({
  assetId: z.uuidv4(),
});

export class TranscriptionParamDto extends createZodDto(TranscriptionParamSchema) {}

const TranscriptionResponseSchema = z
  .object({
    text: z.string().describe('The full transcript text'),
    segments: z
      .array(
        z
          .object({
            start: z.number().meta({ format: 'double' }).describe('Start time of the segment in seconds'),
            end: z.number().meta({ format: 'double' }).describe('End time of the segment in seconds'),
            text: z.string().describe('The segment text'),
          })
          .describe('A transcript segment'),
      )
      .describe('The transcript segments'),
    language: z.string().describe('The detected language code'),
    model: z.string().nullable().describe('The model used for transcription'),
    createdAt: isoDatetimeToDate.describe('The date the transcript was created'),
  })
  .meta({ id: 'TranscriptionResponseDto' });

export class TranscriptionResponseDto extends createZodDto(TranscriptionResponseSchema) {}
