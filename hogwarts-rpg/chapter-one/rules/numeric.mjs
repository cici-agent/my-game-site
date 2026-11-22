/** Exact non-negative decimal arithmetic shared by generation and runtime rules. */
export class RuleValidationError extends TypeError {
  constructor(code, message) {
    super(message);
    this.name = 'RuleValidationError';
    this.code = code;
  }
}

export function requireSafeInteger(value, name, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RuleValidationError('INVALID_INTEGER', `${name} must be a safe integer in [${min}, ${max}]`);
  }
  return value;
}

export function decimalFraction(value, name = 'decimal') {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new RuleValidationError('INVALID_DECIMAL', `${name} must be a non-negative decimal string or number`);
  }
  if (typeof value === 'number' && (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER)) {
    throw new RuleValidationError('INVALID_DECIMAL', `${name} is outside the supported decimal range`);
  }
  const text = String(value);
  if (text.length > 64 || !/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(text)) {
    throw new RuleValidationError('INVALID_DECIMAL', `${name} must use plain decimal notation without signs or whitespace`);
  }
  const [whole, fraction = ''] = text.split('.');
  const denominator = 10n ** BigInt(fraction.length);
  const numerator = BigInt(whole) * denominator + BigInt(fraction || '0');
  if (numerator > BigInt(Number.MAX_SAFE_INTEGER) * denominator) {
    throw new RuleValidationError('NUMERIC_OVERFLOW', `${name} exceeds the supported range`);
  }
  return { numerator, denominator };
}

export function roundHalfUpRatio(numerator, denominator) {
  if (typeof numerator !== 'bigint' || typeof denominator !== 'bigint' || numerator < 0n || denominator <= 0n) {
    throw new RuleValidationError('INVALID_RATIO', 'HALF_UP requires a non-negative BigInt numerator and positive denominator');
  }
  return (numerator * 2n + denominator) / (denominator * 2n);
}

export function safeNumber(value, name = 'result') {
  if (typeof value !== 'bigint' || value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RuleValidationError('NUMERIC_OVERFLOW', `${name} cannot be represented as a non-negative safe integer`);
  }
  return Number(value);
}

/** Convert decimal XP to integer hundredths; calculations never multiply a float. */
export function decimalXpToCents(value) {
  const { numerator, denominator } = decimalFraction(value, 'XP');
  return safeNumber(roundHalfUpRatio(numerator * 100n, denominator), 'XP cents');
}

export function formatXpCents(value) {
  requireSafeInteger(value, 'XP cents');
  const cents = BigInt(value);
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}
