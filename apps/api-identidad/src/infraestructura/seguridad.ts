import { randomUUID } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { SignJWT, importPKCS8, type CryptoKey } from 'jose';
import { ALGORITMO_JWT, AUDIENCIA_JWT, EMISOR_JWT, leerSecreto } from '@bancagt/plataforma';
import type { DatosToken, EmisorTokens, HasherContrasenas, Reloj, TokenEmitido } from '../aplicacion/puertos.js';

/** Parámetros Argon2id recomendados por OWASP (m=19 MiB, t=2, p=1). */
// algorithm 2 = Argon2id (la librería lo expone como const enum, no importable con verbatimModuleSyntax).
export const OPCIONES_ARGON2 = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export class HasherArgon2 implements HasherContrasenas {
  private readonly ficticio: Promise<string> = hash('contrasena-ficticia-para-igualar-tiempos', OPCIONES_ARGON2);
  private ficticioResuelto = '';

  constructor() {
    void this.ficticio.then((h) => (this.ficticioResuelto = h));
  }

  async verificar(hashGuardado: string, contrasena: string): Promise<boolean> {
    try {
      return await verify(hashGuardado || (await this.ficticio), contrasena);
    } catch {
      return false;
    }
  }

  hashFicticio(): string {
    return this.ficticioResuelto;
  }
}

/**
 * Firma JWT con ECDSA P-256 (ES256). La llave privada solo existe en este
 * servicio (montada desde Vault); las demás APIs reciben únicamente la pública.
 */
export class EmisorJwt implements EmisorTokens {
  private pemActual = '';
  private llave?: CryptoKey;

  constructor(
    private readonly rutaLlavePrivada: string,
    private readonly kid: string,
    private readonly minutosVigencia: number,
    private readonly reloj: Reloj,
  ) {}

  async emitir(d: DatosToken): Promise<TokenEmitido> {
    const ahora = Math.floor(this.reloj.ahora().getTime() / 1000);
    const exp = ahora + this.minutosVigencia * 60;
    const token = await new SignJWT({ cli: d.clienteId, nom: d.nombre, uac: d.ultimoAcceso?.toISOString() ?? null })
      .setProtectedHeader({ alg: ALGORITMO_JWT, kid: this.kid, typ: 'JWT' })
      .setSubject(d.usuarioId)
      .setIssuer(EMISOR_JWT)
      .setAudience(AUDIENCIA_JWT)
      .setIssuedAt(ahora)
      .setExpirationTime(exp)
      .setJti(randomUUID())
      .sign(await this.llavePrivada());
    return { token, expiraEn: new Date(exp * 1000) };
  }

  private async llavePrivada(): Promise<CryptoKey> {
    const pem = leerSecreto(this.rutaLlavePrivada);
    if (!this.llave || pem !== this.pemActual) {
      this.llave = await importPKCS8(pem, ALGORITMO_JWT);
      this.pemActual = pem;
    }
    return this.llave;
  }
}
