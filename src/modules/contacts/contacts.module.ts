import {
  Body,
  Controller,
  Get,
  Module,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectModel, MongooseModule } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

import { Contact, ContactDocument, ContactSchema } from './schemas/contact.schema';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

class CreateContactDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsString()
  @MinLength(20)
  message: string;
}

@ApiTags('contacts')
@Controller('contacts')
export class ContactsController {
  constructor(
    @InjectModel(Contact.name) private readonly contactModel: Model<ContactDocument>,
  ) {}

  @Public()
  @Post()
  @ApiOperation({ summary: 'Submit a new contact inquiry' })
  async create(@Body() dto: CreateContactDto) {
    const contact = new this.contactModel(dto);
    return contact.save();
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles('moderator', 'admin', 'super_admin')
@Controller('admin/contacts')
export class AdminContactsController {
  constructor(
    @InjectModel(Contact.name) private readonly contactModel: Model<ContactDocument>,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Retrieve all contact submissions' })
  async list() {
    return this.contactModel.find().sort({ createdAt: -1 }).exec();
  }
}

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Contact.name, schema: ContactSchema }]),
  ],
  controllers: [ContactsController, AdminContactsController],
  exports: [MongooseModule],
})
export class ContactsModule {}
