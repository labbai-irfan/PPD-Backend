import { Body, Controller, Get, Module, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { InjectModel, MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model } from 'mongoose';
import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator';

// ---------- Schema (singleton document) ----------

export type SettingsDocument = HydratedDocument<Settings>;

@Schema({ timestamps: true, collection: 'settings' })
export class Settings {
  @Prop({ default: 'PPD Store' }) siteName: string;
  @Prop({ default: 'admin@ppdstore.com' }) siteEmail: string;
  @Prop({ default: '+91-1234567890' }) sitePhone: string;
  @Prop({ default: 'INR' }) currency: string;
  @Prop({ default: true }) emailNotifications: boolean;
  @Prop({ default: true }) orderNotifications: boolean;
  @Prop({ default: true }) reviewNotifications: boolean;
  @Prop({ default: 12 }) maxProductsPerPage: number;
  @Prop({ default: 30 }) sessionTimeoutMinutes: number;
  @Prop({ default: false }) maintenanceMode: boolean;
  @Prop({ default: 499 }) freeShippingThreshold: number;
  @Prop({ default: 40 }) shippingFee: number;
  @Prop({ default: '' }) seoTitle: string;
  @Prop({ default: '' }) seoDescription: string;
  @Prop({ default: '' }) seoKeywords: string;
  @Prop({ default: '' }) facebookUrl: string;
  @Prop({ default: '' }) instagramUrl: string;
}

export const SettingsSchema = SchemaFactory.createForClass(Settings);

// ---------- DTO ----------

class UpdateSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) siteName?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() siteEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sitePhone?: string;
  @ApiPropertyOptional({ enum: ['INR', 'USD', 'EUR'] }) @IsOptional() @IsIn(['INR', 'USD', 'EUR']) currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() emailNotifications?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() orderNotifications?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() reviewNotifications?: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(100) maxProductsPerPage?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(5) @Max(480) sessionTimeoutMinutes?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() maintenanceMode?: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) freeShippingThreshold?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) shippingFee?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() seoTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() seoDescription?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() seoKeywords?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() facebookUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() instagramUrl?: string;
}

// ---------- Controller ----------

@ApiTags('admin')
@ApiBearerAuth()
@Roles('super_admin')
@Controller('admin/settings')
export class SettingsController {
  constructor(@InjectModel(Settings.name) private readonly settingsModel: Model<SettingsDocument>) {}

  @Get()
  @Roles('moderator')
  @ApiOperation({ summary: 'Site settings (singleton, auto-created)' })
  async get() {
    const existing = await this.settingsModel.findOne().exec();
    return existing ?? this.settingsModel.create({});
  }

  @Patch()
  @ApiOperation({ summary: 'Update site settings' })
  async update(@Body() dto: UpdateSettingsDto) {
    const settings = (await this.settingsModel.findOne().exec()) ?? (await this.settingsModel.create({}));
    Object.assign(settings, dto);
    return settings.save();
  }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: Settings.name, schema: SettingsSchema }])],
  controllers: [SettingsController],
  exports: [MongooseModule],
})
export class SettingsModule {}
