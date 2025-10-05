import { Controller, Post, Body, Get, Param, HttpCode, HttpStatus, UseGuards, Delete } from '@nestjs/common';
import { FactoryService } from '../blockchain/factory.service';
import type { CreateStudyDto } from '../blockchain/factory.service';
import { DatabaseService } from '../database/database.service';
import { GitHubService } from '../github/github.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/user.decorator';
import type { JwtPayload } from '../auth/jwt.service';

export interface JoinStudyDto {
  walletAddress: string;
  proxyAddress: string;
}

export interface RegisterRepositoryDto {
  proxyAddress: string;
  repoUrl: string;
}

export interface WithdrawFromStudyDto {
  proxyAddress: string;
}

@Controller('study')
export class StudyController {
  constructor(
    private readonly factoryService: FactoryService,
    private readonly databaseService: DatabaseService,
    private readonly githubService: GitHubService,
  ) {}

  @Post('create')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async createStudy(@Body() createStudyDto: CreateStudyDto): Promise<{ success: boolean; proxyAddress?: string; message: string }> {
    try {
      // 1. 블록체인에 스터디 컨트랙트 배포
      const proxyAddress = await this.factoryService.createStudyProxy(createStudyDto);

      // 2. DB에 스터디 정보 저장
      await this.databaseService.createStudy({
        proxyAddress,
        studyName: createStudyDto.studyName,
        studyStartTime: createStudyDto.studyStartTime,
        studyEndTime: createStudyDto.studyEndTime,
        depositAmount: createStudyDto.depositAmount,
        penaltyAmount: createStudyDto.penaltyAmount,
      });

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
  @UseGuards(JwtAuthGuard)
  async getStudyList(@CurrentUser() user: JwtPayload): Promise<{
    success: boolean;
    studies?: Array<{
      id: number;
      proxyAddress: string;
      studyName: string;
      studyStartTime: number;
      studyEndTime: number;
      depositAmount: string;
      penaltyAmount: string;
      createdAt: Date;
      participants: Array<{
        walletAddress: string;
        githubEmail: string;
        registeredAt: Date;
      }>;
      participantCount: number;
      isParticipating: boolean;
      hasRegisteredRepository: boolean;
    }>;
    message: string
  }> {
    try {
      const studies = await this.databaseService.getAllStudies();

      const studiesWithRepoStatus = await Promise.all(
        studies.map(async study => {
          const hasRegisteredRepository = await this.databaseService.hasUserRegisteredRepository(
            user.email,
            study.proxy_address
          );

          return {
            id: study.id,
            proxyAddress: study.proxy_address,
            studyName: study.study_name,
            studyStartTime: study.study_start_time,
            studyEndTime: study.study_end_time,
            depositAmount: study.deposit_amount,
            penaltyAmount: study.penalty_amount,
            createdAt: new Date(study.created_at.getTime() + (9 * 60 * 60 * 1000)), // UTC+9 (한국시간) 변환
            participants: study.user_studies?.map(us => ({
              walletAddress: us.wallet_address,
              githubEmail: us.user.github_email,
              registeredAt: new Date(us.registered_at.getTime() + 9 * 60 * 60 * 1000), // UTC+9 (한국시간) 변환
            })) || [],
            participantCount: study.user_studies?.length || 0,
            isParticipating: study.user_studies?.some(us => us.user.github_email === user.email) || false,
            hasRegisteredRepository,
          };
        })
      );

      return {
        success: true,
        studies: studiesWithRepoStatus,
        message: `Found ${studies.length} studies`
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to get study list: ${error.message}`
      };
    }
  }

  @Post('join')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async joinStudy(
    @Body() joinStudyDto: JoinStudyDto,
    @CurrentUser() user: JwtPayload
  ): Promise<{ success: boolean; message: string }> {
    try {
      await this.databaseService.registerParticipant({
        walletAddress: joinStudyDto.walletAddress,
        proxyAddress: joinStudyDto.proxyAddress,
        githubEmail: user.email
      });

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
  async getParticipantStudies(@Param('walletAddress') walletAddress: string): Promise<{ success: boolean; studies?: Array<{ proxyAddress: string; studyName: string; registeredAt: Date }>; message: string }> {
    try {
      const studies = await this.databaseService.getParticipantStudies(walletAddress);

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
  async getStudyParticipants(@Param('proxyAddress') proxyAddress: string): Promise<{ success: boolean; participants?: Array<{ walletAddress: string; githubEmail: string; registeredAt: Date }>; message: string }> {
    try {
      const participants = await this.databaseService.getStudyParticipants(proxyAddress);

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
      const registrations = await this.databaseService.getAllRegistrations();

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

  @Delete('admin/clear-all')
  @HttpCode(HttpStatus.OK)
  async clearAllData(): Promise<{ success: boolean; message: string }> {
    try {
      await this.databaseService.clearAllData();
      return {
        success: true,
        message: 'All data cleared successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to clear data: ${error.message}`
      };
    }
  }

  @Post('repository/register')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async registerRepository(
    @Body() registerRepositoryDto: RegisterRepositoryDto,
    @CurrentUser() user: JwtPayload
  ): Promise<{ success: boolean; message: string }> {
    try {
      // 1. 사용자의 GitHub access token 가져오기
      const accessToken = await this.databaseService.getUserGithubToken(user.email);

      if (!accessToken) {
        return {
          success: false,
          message: 'GitHub access token not found. Please login again.'
        };
      }

      // 2. GitHub 레포지토리에 웹훅 생성
      await this.githubService.createRepositoryWebhook(
        registerRepositoryDto.repoUrl,
        accessToken
      );

      // 3. DB에 레포지토리 등록
      await this.databaseService.registerRepository({
        proxyAddress: registerRepositoryDto.proxyAddress,
        githubEmail: user.email,
        repoUrl: registerRepositoryDto.repoUrl
      });

      return {
        success: true,
        message: `Repository registered successfully with webhook`
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to register repository: ${error.message}`
      };
    }
  }

  @Get(':proxyAddress/repositories')
  async getStudyRepositories(@Param('proxyAddress') proxyAddress: string): Promise<{
    success: boolean;
    participants?: Array<{
      participantEmail: string;
      participantWallet?: string;
      repositories: Array<{
        id: number;
        repoUrl: string;
        registeredAt: Date;
        isActive: boolean;
      }>;
    }>;
    message: string;
  }> {
    try {
      const participants = await this.databaseService.getStudyRepositories(proxyAddress);

      const totalRepositories = participants.reduce((sum, p) => sum + p.repositories.length, 0);

      return {
        success: true,
        participants,
        message: `Found ${totalRepositories} repositories from ${participants.length} participants`
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to get repositories: ${error.message}`
      };
    }
  }

  @Get('balances/all')
  async getAllStudyBalances(): Promise<{
    success: boolean;
    studies?: Array<{
      studyId: number;
      studyName: string;
      proxyAddress: string;
      participants: Array<{
        userId: number;
        githubEmail: string;
        walletAddress: string;
        currentBalance: string;
        depositAmount: string;
        updatedAt: Date;
      }>;
    }>;
    message: string;
  }> {
    try {
      const allBalances = await this.databaseService.getAllStudyBalances();

      const totalParticipants = allBalances.reduce((sum, study) => sum + study.participants.length, 0);

      return {
        success: true,
        studies: allBalances,
        message: `Found ${allBalances.length} studies with ${totalParticipants} total participants`
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to get all study balances: ${error.message}`
      };
    }
  }

  @Post('withdraw')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async withdrawFromStudy(
    @Body() withdrawDto: WithdrawFromStudyDto,
    @CurrentUser() user: JwtPayload
  ): Promise<{ success: boolean; message: string }> {
    try {
      // 데이터베이스에서 참가자 완전 삭제 및 관련 데이터 정리
      await this.databaseService.withdrawFromStudy(user.email, withdrawDto.proxyAddress);

      return {
        success: true,
        message: `Successfully withdrew from study ${withdrawDto.proxyAddress}`
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to withdraw from study: ${error.message}`
      };
    }
  }

}