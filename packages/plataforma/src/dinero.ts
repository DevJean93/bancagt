// Value Object Dinero: montos en centavos enteros (BigInt) para no perder
// precisión con números de punto flotante. Inmutable.

export type Moneda = 'GTQ' | 'USD';

export class Dinero {
  private constructor(
    readonly centavos: bigint,
    readonly moneda: Moneda,
  ) {}

  /** Crea un monto desde un texto decimal ("1250.5", "-3.20"). */
  static de(valor: string | number, moneda: Moneda): Dinero {
    const texto = typeof valor === 'number' ? valor.toFixed(2) : valor.trim();
    const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(texto);
    if (!m) throw new RangeError(`Monto inválido: ${texto}`);
    const enteros = BigInt(m[2] ?? '0');
    const decimales = BigInt((m[3] ?? '').padEnd(2, '0'));
    const total = enteros * 100n + decimales;
    return new Dinero(m[1] ? -total : total, moneda);
  }

  static cero(moneda: Moneda): Dinero {
    return new Dinero(0n, moneda);
  }

  sumar(otro: Dinero): Dinero {
    this.mismaMoneda(otro);
    return new Dinero(this.centavos + otro.centavos, this.moneda);
  }

  restar(otro: Dinero): Dinero {
    this.mismaMoneda(otro);
    return new Dinero(this.centavos - otro.centavos, this.moneda);
  }

  esMayorQue(otro: Dinero): boolean {
    this.mismaMoneda(otro);
    return this.centavos > otro.centavos;
  }

  esPositivo(): boolean {
    return this.centavos > 0n;
  }

  /** Representación decimal exacta con 2 decimales ("1250.50"). */
  aTexto(): string {
    const negativo = this.centavos < 0n;
    const abs = negativo ? -this.centavos : this.centavos;
    const enteros = abs / 100n;
    const dec = (abs % 100n).toString().padStart(2, '0');
    return `${negativo ? '-' : ''}${enteros}.${dec}`;
  }

  toJSON(): { monto: string; moneda: Moneda } {
    return { monto: this.aTexto(), moneda: this.moneda };
  }

  private mismaMoneda(otro: Dinero): void {
    if (otro.moneda !== this.moneda) {
      throw new RangeError(`No se pueden operar ${this.moneda} y ${otro.moneda}`);
    }
  }
}
