import { Controller, Post, Body, Get, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { FactoryService } from '../blockchain/factory.service';
import type { CreateStudyDto } from '../blockchain/factory.service';
import { ParticipantService, ParticipantInfo } from '../storage/participant.service';

export interface JoinStudyDto {
  walletAddress: string;
  proxyAddress: string;
  githubEmail: string;
  studyName?: string;
}

@Controller('study')
export class StudyController {
  constructor(
    private readonly factoryService: FactoryService,
    private readonly participantService: ParticipantService,
  ) {}

  @Post('create')
  @HttpCode(HttpStatus.OK)
  async createStudy(@Body() createStudyDto: CreateStudyDto): Promise<{ success: boolean; proxyAddress?: string; message: string }> {
    try {
      const proxyAddress = await this.factoryService.createStudyProxy(createStudyDto);

      return {
        success: true,
        proxyAddress,
        message: `Study "${createStudyDto.studyName}" created successfully at ${proxyAddress}`
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to create study: ${error.message}`
      };
    }
  }

  @Get('list')
  async getStudyList(): Promise<{ success: boolean; proxies?: string[]; message: string }> {
    try {
      const proxies = await this.factoryService.getAllProxies();

      return {
        success: true,
        proxies,
        message: `Found ${proxies.length} studies`
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to get study list: ${error.message}`
      };
    }
  }

  @Post('join')
  @HttpCode(HttpStatus.OK)
  async joinStudy(@Body() joinStudyDto: JoinStudyDto): Promise<{ success: boolean; message: string }> {
    try {
      await this.participantService.registerParticipant(
        joinStudyDto.walletAddress,
        joinStudyDto.proxyAddress,
        joinStudyDto.githubEmail,
        joinStudyDto.studyName
      );

      return {
        success: true,
        message: `Participant ${joinStudyDto.walletAddress} registered for study ${joinStudyDto.proxyAddress}`
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to register participant: ${error.message}`
      };
    }
  }

  @Get('participant/:walletAddress')
  async getParticipantStudies(@Param('walletAddress') walletAddress: string): Promise<{ success: boolean; studies?: Array<{ proxyAddress: string; studyName?: string; registeredAt: Date }>; message: string }> {
    try {
      const studies = this.participantService.getParticipantStudies(walletAddress);

      return {
        success: true,
        studies,
        message: `Found ${studies.length} studies for participant ${walletAddress}`
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to get participant studies: ${error.message}`
      };
    }
  }

  @Get('participants/:proxyAddress')
  async getStudyParticipants(@Param('proxyAddress') proxyAddress: string): Promise<{ success: boolean; participants?: ParticipantInfo[]; message: string }> {
    try {
      const participants = this.participantService.getStudyParticipants(proxyAddress);

      return {
        success: true,
        participants,
        message: `Found ${participants.length} participants for study ${proxyAddress}`
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to get study participants: ${error.message}`
      };
    }
  }

  @Get('admin/registrations')
  async getAllRegistrations(): Promise<{ success: boolean; registrations?: any; message: string }> {
    try {
      const registrations = this.participantService.getAllRegistrations();

      return {
        success: true,
        registrations,
        message: 'Retrieved all registrations'
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to get registrations: ${error.message}`
      };
    }
  }
}