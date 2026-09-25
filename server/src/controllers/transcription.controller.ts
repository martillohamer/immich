import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthDto } from 'src/dtos/auth.dto.js';
import { Endpoint, HistoryBuilder } from 'src/decorators.js';
import { TranscriptionParamDto, TranscriptionResponseDto } from 'src/dtos/transcription.dto.js';
import { Permission } from 'src/enum.js';
import { Auth, Authenticated } from 'src/middleware/auth.guard.js';
import { TranscriptionService } from 'src/services/transcription.service.js';

@ApiTags('Transcription')
@Controller('transcript')
export class TranscriptionController {
  constructor(private service: TranscriptionService) {}

  @Get(':assetId')
  @Authenticated({ permission: Permission.AssetRead })
  @Endpoint({
    summary: 'Retrieve an asset transcript',
    description: 'Retrieve the transcript for an asset.',
    history: HistoryBuilder.v3(),
  })
  get(@Auth() auth: AuthDto, @Param() { assetId }: TranscriptionParamDto): Promise<TranscriptionResponseDto> {
    return this.service.get(auth, assetId);
  }
}
