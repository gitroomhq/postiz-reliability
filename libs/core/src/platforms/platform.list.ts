import { Platform } from '@reliability/core/platforms/platform.interface';
import { blueskyPlatform } from '@reliability/core/platforms/bluesky.platform';
import { telegramPlatform } from '@reliability/core/platforms/telegram.platform';

export const platformList: Platform[] = [blueskyPlatform, telegramPlatform];

export const getPlatform = (identifier: string) =>
  platformList.find((p) => p.identifier === identifier);
