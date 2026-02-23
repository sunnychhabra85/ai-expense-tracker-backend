// =============================================================
// apps/analytics-service/src/chatbot/chatbot.controller.ts
// =============================================================

import {
  Controller, Post, Body, UseGuards, Req, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsArray, IsOptional, MaxLength } from 'class-validator';
import { ChatbotService, ChatMessage } from './chatbot.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

class ChatDto {
  @IsString() @IsNotEmpty() @MaxLength(500)
  message: string;

  @IsOptional() @IsArray()
  history?: ChatMessage[];
}

@ApiTags('chatbot')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatbotController {
  constructor(private readonly chatbot: ChatbotService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ask the AI spending assistant a question' })
  async chat(@Body() dto: ChatDto, @Req() req: any) {
    const reply = await this.chatbot.chat(req.user.id, dto.message, dto.history || []);
    return { success: true, data: { reply }, timestamp: new Date().toISOString() };
  }
}
