import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';
import { Study } from './study.entity';

@Entity('user_studies')
export class UserStudy {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: number;

  @Column()
  study_id: number;

  @Column()
  wallet_address: string;

  @CreateDateColumn()
  registered_at: Date;

  @ManyToOne(() => User, user => user.user_studies)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Study, study => study.user_studies)
  @JoinColumn({ name: 'study_id' })
  study: Study;
}