import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MinLength, MaxLength } from 'class-validator';

// Password requirements: at least 8 chars with uppercase, lowercase, number, special char
const PASSWORD_POLICY = {
  MIN_LENGTH: 8,
  MAX_LENGTH: 128,
};

const INPUT_LIMITS = {
  EMAIL: 254,
  NAME: 100,
};

export class RegisterDto {
  @ApiProperty({ example: 'John Doe', maxLength: INPUT_LIMITS.NAME })
  @IsString()
  @MinLength(2)
  @MaxLength(INPUT_LIMITS.NAME)
  name: string;

  @ApiProperty({ example: 'john@example.com', maxLength: INPUT_LIMITS.EMAIL })
  @IsEmail()
  @MaxLength(INPUT_LIMITS.EMAIL)
  email: string;

  @ApiProperty({
    example: 'SecurePass123!',
    minLength: 8,
    description: 'Must contain uppercase, lowercase, number, and special character',
  })
  @IsString()
  @MinLength(PASSWORD_POLICY.MIN_LENGTH)
  @MaxLength(PASSWORD_POLICY.MAX_LENGTH)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])[\s\S]{8,}$/, {
    message: 'Password must contain uppercase, lowercase, number, and special character',
  })
  password: string;

  @ApiPropertyOptional({ example: 'PPD-A1B2C3', description: 'Referral code of the referrer', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  referralCode?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'john@example.com', maxLength: INPUT_LIMITS.EMAIL })
  @IsEmail()
  @MaxLength(INPUT_LIMITS.EMAIL)
  email: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @MinLength(6)
  @MaxLength(PASSWORD_POLICY.MAX_LENGTH)
  password: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '123456' })
  @Matches(/^\d{6}$/, { message: 'otp must be a 6-digit code' })
  otp: string;

  @ApiProperty({ minLength: 8, maxLength: PASSWORD_POLICY.MAX_LENGTH })
  @IsString()
  @MinLength(PASSWORD_POLICY.MIN_LENGTH)
  @MaxLength(PASSWORD_POLICY.MAX_LENGTH)
  password: string;
}

export class SendOtpDto {
  @ApiProperty({ example: '9876543210' })
  @Matches(/^\d{10}$/, { message: 'phone must be a 10-digit number' })
  phone: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: '9876543210' })
  @Matches(/^\d{10}$/, { message: 'phone must be a 10-digit number' })
  phone: string;

  @ApiProperty({ example: '123456' })
  @Matches(/^\d{6}$/, { message: 'otp must be a 6-digit code' })
  otp: string;
}
