import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index, CreateDateColumn } from 'typeorm';
import { Study } from './study.entity';
import { User } from './user.entity';
import { StudySession } from './study-session.entity';

@Entity('commit_records')
@Index(['study_session_id', 'user_id'], { unique: true }) // 세션당 사용자별로 하나의 커밋만 기록
export class CommitRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  study_session_id: number;

  @Column()
  user_id: number;

  @Column({ type: 'bigint' })
  commit_timestamp: number; // Unix timestamp (첫 번째 커밋 시간)

  @Column({ type: 'varchar', length: 40 })
  commit_id: string; // GitHub 커밋 ID

  @Column({ type: 'text', nullable: true })
  commit_message: string; // 커밋 메시지

  @Column({ type: 'varchar', length: 42 })
  wallet_address: string; // 참가자 지갑 주소

  @CreateDateColumn()
  created_at: Date;

  // Relations
  @ManyToOne(() => StudySession, studySession => studySession.commit_records, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'study_session_id' })
  study_session: StudySession;

  @ManyToOne(() => User, user => user.commit_records, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}