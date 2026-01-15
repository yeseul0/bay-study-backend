import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { UserStudy } from './user-study.entity';
import { Repository } from './repository.entity';
import { CommitRecord } from './commit-record.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  github_email: string;

  @Column({ nullable: true })
  github_access_token: string;

  @CreateDateColumn()
  created_at: Date;

  @OneToMany(() => UserStudy, userStudy => userStudy.user)
  user_studies: UserStudy[];

  @OneToMany(() => Repository, repository => repository.user)
  repositories: Repository[];

  @OneToMany(() => CommitRecord, commitRecord => commitRecord.user)
  commit_records: CommitRecord[];
}
