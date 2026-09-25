import { Column, ForeignKeyColumn, Index, PrimaryColumn, Table } from '@immich/sql-tools';
import { AssetTranscriptTable } from 'src/schema/tables/asset-transcript.table.js';

@Table('transcript_search')
@Index({
  name: 'idx_transcript_search_text',
  using: 'gin',
  expression: 'f_unaccent("text") gin_trgm_ops',
})
export class TranscriptSearchTable {
  @PrimaryColumn({ type: 'uuid' })
  assetId!: string;

  @ForeignKeyColumn(() => AssetTranscriptTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  assetTranscriptId!: string;

  @Column({ type: 'text' })
  text!: string;
}
