import { Module } from '@nestjs/common';
import { StudyController } from './study.controller';
import { FactoryService } from '../blockchain/factory.service';
import { ParticipantService } from '../storage/participant.service';

@Module({
  controllers: [StudyController],
  providers: [FactoryService, ParticipantService],
  exports: [FactoryService, ParticipantService],
})
export class StudyModule {}