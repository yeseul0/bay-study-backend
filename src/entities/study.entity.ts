import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { UserStudy } from './user-study.entity';
import { Repository } from './repository.entity';
import { Balance } from './balance.entity';
import { StudySession } from './study-session.entity';

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

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  deposit_amount: string; // USDC 단위 (6자리 소수점)

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  penalty_amount: string; // USDC 단위 (6자리 소수점)

  @CreateDateColumn()
  created_at: Date;

  @OneToMany(() => UserStudy, userStudy => userStudy.study)
  user_studies: UserStudy[];

  @OneToMany(() => Repository, repository => repository.study)
  repositories: Repository[];

  @OneToMany(() => Balance, balance => balance.study)
  balances: Balance[];

  @OneToMany(() => StudySession, studySession => studySession.study)
  study_sessions: StudySession[];
}