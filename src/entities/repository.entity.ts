import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Study } from './study.entity';
import { User } from './user.entity';

@Entity('repositories')
export class Repository {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  study_id: number;

  @Column()
  user_id: number;

  @Column()
  repo_url: string;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Study, study => study.repositories)
  @JoinColumn({ name: 'study_id' })
  study: Study;

  @ManyToOne(() => User, user => user.repositories)
  @JoinColumn({ name: 'user_id' })
  user: User;
}