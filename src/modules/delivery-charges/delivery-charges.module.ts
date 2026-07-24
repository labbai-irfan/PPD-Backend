import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { InjectModel, MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model, Types } from 'mongoose';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { Settings, SettingsDocument, SettingsModule } from '../settings/settings.module';

// ---------- Schema ----------

export type DeliveryChargeDocument = HydratedDocument<DeliveryCharge>;

@Schema({ timestamps: true })
export class DeliveryCharge {
  @Prop({ required: true, uppercase: true, trim: true })
  country: string;

  @Prop({ default: '', uppercase: true, trim: true })
  state: string;

  @Prop({ default: '', uppercase: true, trim: true })
  city: string;

  @Prop({ default: '', uppercase: true, trim: true })
  pincode: string;

  @Prop({ required: true, type: Number })
  charge: number;
}

export const DeliveryChargeSchema = SchemaFactory.createForClass(DeliveryCharge);

// Ensure unique index per unique location spec
DeliveryChargeSchema.index({ country: 1, state: 1, city: 1, pincode: 1 }, { unique: true });

// ---------- DTOs ----------

class CreateDeliveryChargeDto {
  @ApiProperty() @IsString() country: string;
  @ApiPropertyOptional() @IsOptional() @IsString() state?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() pincode?: string;
  @ApiProperty() @IsNumber() @Min(0) charge: number;
}

class CalculateDeliveryChargeDto {
  @ApiProperty() @IsString() country: string;
  @ApiPropertyOptional() @IsOptional() @IsString() state?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() pincode?: string;
  @ApiProperty() @IsNumber() subtotal: number;
}

// ---------- Service ----------

@Injectable()
export class DeliveryChargesService {
  constructor(
    @InjectModel(DeliveryCharge.name) private readonly chargeModel: Model<DeliveryChargeDocument>,
    @InjectModel(Settings.name) private readonly settingsModel: Model<SettingsDocument>,
  ) {}

  async calculate(dto: {
    country: string;
    state?: string;
    city?: string;
    pincode?: string;
    subtotal: number;
  }): Promise<number> {
    const country = (dto.country || '').trim().toUpperCase();
    const state = (dto.state || '').trim().toUpperCase();
    const city = (dto.city || '').trim().toUpperCase();
    const pincode = (dto.pincode || '').trim().toUpperCase();

    // Fetch all rules matching this country
    const rules = await this.chargeModel.find({ country }).exec();

    // Evaluate rules by matching hierarchy:
    // 1. Pincode match
    // 2. City match (with pincode unset)
    // 3. State match (with city and pincode unset)
    // 4. Country match (with state, city, and pincode unset)
    let bestMatch: DeliveryChargeDocument | null = null;
    let highestPriority = -1;

    for (const rule of rules) {
      const ruleState = rule.state || '';
      const ruleCity = rule.city || '';
      const rulePincode = rule.pincode || '';

      if (rulePincode && pincode === rulePincode) {
        // Pincode level match - priority 4
        if (4 > highestPriority) {
          bestMatch = rule;
          highestPriority = 4;
        }
      } else if (!rulePincode && ruleCity && city === ruleCity && (!ruleState || state === ruleState)) {
        // City level match - priority 3
        if (3 > highestPriority) {
          bestMatch = rule;
          highestPriority = 3;
        }
      } else if (!rulePincode && !ruleCity && ruleState && state === ruleState) {
        // State level match - priority 2
        if (2 > highestPriority) {
          bestMatch = rule;
          highestPriority = 2;
        }
      } else if (!rulePincode && !ruleCity && !ruleState) {
        // Country level match - priority 1
        if (1 > highestPriority) {
          bestMatch = rule;
          highestPriority = 1;
        }
      }
    }

    if (bestMatch !== null) {
      return bestMatch.charge;
    }

    // Default configuration fallback
    const settings = await this.settingsModel.findOne().exec();
    const threshold = settings?.freeShippingThreshold ?? 499;
    const fee = settings?.shippingFee ?? 40;

    return dto.subtotal >= threshold ? 0 : fee;
  }
}

// ---------- Controller ----------

@ApiTags('delivery-charges')
@Controller('delivery-charges')
export class DeliveryChargesController {
  constructor(private readonly service: DeliveryChargesService) {}

  @Post('calculate')
  @ApiOperation({ summary: 'Calculate delivery charge for a location' })
  async calculate(@Body() dto: CalculateDeliveryChargeDto) {
    const charge = await this.service.calculate(dto);
    return { charge };
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles('moderator')
@Controller('admin/delivery-charges')
export class AdminDeliveryChargesController {
  constructor(
    @InjectModel(DeliveryCharge.name) private readonly chargeModel: Model<DeliveryChargeDocument>,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all custom delivery charges' })
  list() {
    return this.chargeModel.find().sort({ createdAt: -1 }).exec();
  }

  @Post()
  @ApiOperation({ summary: 'Create or update a delivery charge rule' })
  async upsert(@Body() dto: CreateDeliveryChargeDto) {
    const country = (dto.country || '').trim().toUpperCase();
    const state = (dto.state || '').trim().toUpperCase();
    const city = (dto.city || '').trim().toUpperCase();
    const pincode = (dto.pincode || '').trim().toUpperCase();

    // Try finding existing rule
    let existing = await this.chargeModel.findOne({ country, state, city, pincode }).exec();
    if (existing) {
      existing.charge = dto.charge;
      return existing.save();
    }
    return this.chargeModel.create({
      country,
      state,
      city,
      pincode,
      charge: dto.charge,
    });
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a delivery charge rule' })
  async remove(@Param('id', ParseObjectIdPipe) id: string) {
    const deleted = await this.chargeModel.findByIdAndDelete(id).exec();
    if (!deleted) throw new NotFoundException('Delivery charge rule not found');
  }
}

// ---------- Module ----------

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DeliveryCharge.name, schema: DeliveryChargeSchema },
    ]),
    SettingsModule,
  ],
  controllers: [DeliveryChargesController, AdminDeliveryChargesController],
  providers: [DeliveryChargesService],
  exports: [DeliveryChargesService],
})
export class DeliveryChargesModule {}
