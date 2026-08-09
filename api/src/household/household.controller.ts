import { Controller, Get, NotFoundException } from '@nestjs/common';
import { HouseholdService } from './household.service';

@Controller('household')
export class HouseholdController {
  constructor(private readonly householdService: HouseholdService) {}

  @Get()
  async getHousehold() {
    const household = await this.householdService.getHousehold();
    if (!household) {
      throw new NotFoundException('no household configured');
    }
    return household;
  }
}
