import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from './user.entity';
import { Study } from './study.entity';

@Entity('balances')
@Index(['user_id', 'study_id'], { unique: true }) // 사용자당 스터디당 하나의 레코드만
export class Balance {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: number;

  @Column()
  study_id: number;

  @Column('varchar', { length: 42 })
  wallet_address: string;

  @Column('decimal', { precision: 18, scale: 0 })
  current_balance: string; // 현재 잔액 (wei 단위)

  @UpdateDateColumn()
  updated_at: Date;

  // Relations
  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Study)
  @JoinColumn({ name: 'study_id' })
  study: Study;
}