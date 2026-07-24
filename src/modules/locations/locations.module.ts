import { Controller, Get, Module, NotFoundException, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';

interface PostalPincodeOffice {
  Name: string;
  District: string;
  State: string;
  DeliveryStatus: string;
  Pincode: string;
}

interface PostalPincodeResponse {
  Status: string;
  Message: string;
  PostOffice?: PostalPincodeOffice[];
}

@ApiTags('locations')
@Public()
@Controller('locations')
export class LocationsController {
  @Get('pincode/:pincode')
  @ApiOperation({ summary: 'Lookup Indian pincode details (state, district, post offices)' })
  async lookupPincode(@Param('pincode') pincode: string) {
    const normalized = pincode.replace(/\D/g, '');
    if (!/^\d{6}$/.test(normalized)) {
      throw new NotFoundException('Invalid pincode — must be 6 digits');
    }

    const response = await fetch(`https://api.postalpincode.in/pincode/${normalized}`);
    if (!response.ok) {
      throw new NotFoundException('Pincode lookup service unavailable');
    }

    const payload = (await response.json()) as PostalPincodeResponse[];
    const result = payload[0];
    if (!result || result.Status !== 'Success' || !result.PostOffice?.length) {
      throw new NotFoundException('Pincode not found');
    }

    const primary = result.PostOffice[0];
    return {
      pincode: normalized,
      state: primary.State,
      city: primary.District,
      offices: result.PostOffice.map((office) => ({
        name: office.Name,
        district: office.District,
        state: office.State,
        deliveryStatus: office.DeliveryStatus,
      })),
    };
  }
}

@Module({
  controllers: [LocationsController],
})
export class LocationsModule {}
