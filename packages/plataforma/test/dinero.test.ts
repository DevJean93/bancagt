import { describe, expect, it } from 'vitest';
import { Dinero } from '../src/dinero.js';

describe('Dinero (value object)', () => {
  it('opera en centavos exactos, sin errores de punto flotante', () => {
    const a = Dinero.de('0.10', 'GTQ');
    const b = Dinero.de('0.20', 'GTQ');
    expect(a.sumar(b).aTexto()).toBe('0.30'); // 0.1 + 0.2 = 0.30000000000000004 en float
  });

  it('acepta enteros, 1 o 2 decimales y negativos', () => {
    expect(Dinero.de('1250', 'GTQ').aTexto()).toBe('1250.00');
    expect(Dinero.de('1250.5', 'GTQ').aTexto()).toBe('1250.50');
    expect(Dinero.de('-3.2', 'USD').aTexto()).toBe('-3.20');
  });

  it('rechaza formatos inválidos y más de 2 decimales', () => {
    expect(() => Dinero.de('12.345', 'GTQ')).toThrow(RangeError);
    expect(() => Dinero.de('abc', 'GTQ')).toThrow(RangeError);
  });

  it('impide mezclar monedas', () => {
    expect(() => Dinero.de('1', 'GTQ').sumar(Dinero.de('1', 'USD'))).toThrow(/GTQ y USD/);
  });

  it('compara montos', () => {
    expect(Dinero.de('10', 'GTQ').esMayorQue(Dinero.de('9.99', 'GTQ'))).toBe(true);
    expect(Dinero.cero('GTQ').esPositivo()).toBe(false);
  });
});
