import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { UserStudy } from './user-study.entity';
import { Repository } from './repository.entity';
import { CommitRecord } from './commit-record.entity';
import { Balance } from './balance.entity';

@Entity('studies')
export class Study {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  proxy_address: string;

  @Column()
  study_name: string;

  @Column({ type: 'bigint' })
  study_start_time: number; // Unix timestamp

  @Column({ type: 'bigint' })
  study_end_time: number; // Unix timestamp

  @Column({ type: 'decimal', precision: 20, scale: 0 })
  deposit_amount: string; // Wei 단위 (string으로 저장)

  @Column({ type: 'decimal', precision: 20, scale: 0 })
  penalty_amount: string; // Wei 단위 (string으로 저장)

  @CreateDateColumn()
  created_at: Date;

  @OneToMany(() => UserStudy, userStudy => userStudy.study)
  user_studies: UserStudy[];

  @OneToMany(() => Repository, repository => repository.study)
  repositories: Repository[];

  @OneToMany(() => CommitRecord, commitRecord => commitRecord.study)
  commit_records: CommitRecord[];

  @OneToMany(() => Balance, balance => balance.study)
  balances: Balance[];
}