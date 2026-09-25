import {
  Column,
  CreateDateColumn,
  ForeignKeyColumn,
  type Generated,
  Table,
  Timestamp,
  UpdateDateColumn,
} from '@immich/sql-tools';
import type { TranscriptionSegment } from 'src/utils/database.js';
import { AssetTable } from 'src/schema/tables/asset.table.js';

@Table('asset_transcript')
export class AssetTranscriptTable {
  @ForeignKeyColumn(() => AssetTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE', primary: true })
  assetId!: string;

  @Column({ type: 'text' })
  text!: string;

  @Column({ type: 'jsonb' })
  segments!: TranscriptionSegment[];

  @Column({ type: 'character varying', length: 2, default: 'es' })
  language!: string;

  @Column({ type: 'character varying', length: 50, nullable: true })
  model!: string | null;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;

  @UpdateDateColumn({ default: () => 'clock_timestamp()' })
  updatedAt!: Generated<Timestamp>;
}