import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, CreateDateColumn, Index } from 'typeorm';
import { Study } from './study.entity';
import { CommitRecord } from './commit-record.entity';

export enum StudySessionStatus {
  ACTIVE = 'ACTIVE',
  CLOSED = 'CLOSED',
  FAILED = 'FAILED',
}

@Entity('study_sessions')
@Index(['study_id', 'study_date'], { unique: true }) // 스터디별로 날짜마다 하나의 세션만
export class StudySession {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  study_id: number;

  @Column({ type: 'date' })
  study_date: string; // 'YYYY-MM-DD' 형식 (한국 날짜)

  @Column({
    type: 'enum',
    enum: StudySessionStatus,
    default: StudySessionStatus.ACTIVE
  })
  status: StudySessionStatus;

  @Column({ type: 'bigint', nullable: true })
  started_at: number; // 첫 커밋 시간 (Unix timestamp)

  @Column({ type: 'bigint', nullable: true })
  closed_at: number; // 세션 종료 시간 (Unix timestamp)

  @Column({ type: 'varchar', length: 66, nullable: true })
  blockchain_tx_hash: string; // close 트랜잭션 해시

  @Column({ type: 'bigint' })
  study_midnight_utc: number; // 해당 날짜의 한국 자정 UTC 타임스탬프

  @CreateDateColumn()
  created_at: Date;

  // Relations
  @ManyToOne(() => Study, study => study.study_sessions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'study_id' })
  study: Study;

  @OneToMany(() => CommitRecord, commitRecord => commitRecord.study_session)
  commit_records: CommitRecord[];
}
