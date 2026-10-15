import { sign, verify } from 'jsonwebtoken';
import crypto from 'crypto';
// @ts-ignore
import EVP_BytesToKey from 'evp_bytestokey';
const algorithm = 'aes-256-cbc';

function deriveKeyIv(secret: string) {
  const { keyLength, ivLength } = crypto.getCipherInfo(algorithm);
  const { key, iv } = EVP_BytesToKey(
    Buffer.from(secret ?? '', 'utf8'),
    null,
    keyLength * 8,
    ivLength,
    'md5'
  );
  return { key, iv };
}

export class AuthService {
  static signJWT(value: object) {
    return sign(value, process.env.JWT_SECRET!);
  }
  static verifyJWT(token: string) {
    return verify(token, process.env.JWT_SECRET!);
  }
  static hashToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
  static fixedEncryption(value: string) {
    const { key, iv } = deriveKeyIv(process.env.ENCRYPTION_KEY!);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    return Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]).toString('hex');
  }
  static fixedDecryption(hash: string) {
    const { key, iv } = deriveKeyIv(process.env.ENCRYPTION_KEY!);
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    return Buffer.concat([decipher.update(hash, 'hex'), decipher.final()]).toString('utf8');
  }
}
