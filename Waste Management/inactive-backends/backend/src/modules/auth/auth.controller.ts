import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { RequestWithContext } from '../../common/types/request-with-context';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({ auth: { ttl: 60_000, limit: 5 } })
  @ApiCreatedResponse({ description: 'Creates a user, organization, owner membership, and session.' })
  register(@Body() dto: RegisterDto, @Req() request: Request) {
    return this.authService.register(dto, this.getClientContext(request));
  }

  @Post('login')
  @Throttle({ auth: { ttl: 60_000, limit: 10 } })
  @ApiOkResponse({ description: 'Creates a new authenticated session.' })
  login(@Body() dto: LoginDto, @Req() request: Request) {
    return this.authService.login(dto, this.getClientContext(request));
  }

  @Post('refresh')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOkResponse({ description: 'Rotates a refresh token and returns a new token pair.' })
  refresh(@Body() dto: RefreshTokenDto, @Req() request: Request) {
    return this.authService.refresh(dto, this.getClientContext(request));
  }

  @Post('logout')
  @ApiOkResponse({ description: 'Revokes a refresh session.' })
  logout(@Body() dto: LogoutDto, @Req() request: Request) {
    return this.authService.logout(dto, this.getClientContext(request));
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ description: 'Returns the current authenticated principal.' })
  me(@Req() request: RequestWithContext) {
    return request.auth;
  }

  /** Public endpoint — accepts an org invite by token. The user must already be authenticated. */
  @Post('invites/:token/accept')
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ description: 'Accepts an organization invite and joins the organization.' })
  acceptInvite(@Param('token') token: string, @Req() request: RequestWithContext) {
    return this.authService.acceptInvite(token, request.auth!.user.id);
  }

  private getClientContext(request: Request) {
    return {
      ipAddress: request.ip,
      userAgent: request.header('user-agent')
    };
  }
}
