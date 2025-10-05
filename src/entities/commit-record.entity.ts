import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index, CreateDateColumn } from 'typeorm';
import { Study } from './study.entity';
import { User } from './user.entity';

@Entity('commit_records')
@Index(['study_id', 'user_id', 'date'], { unique: true }) // 하루에 하나의 커밋만 기록
export class CommitRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  study_id: number;

  @Column()
  user_id: number;

  @Column({ type: 'date' })
  date: string; // 'YYYY-MM-DD' 형식

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
  @ManyToOne(() => Study, study => study.commit_records, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'study_id' })
  study: Study;

  @ManyToOne(() => User, user => user.commit_records, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}