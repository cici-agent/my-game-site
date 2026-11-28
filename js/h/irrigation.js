export const BUCKET_CAPACITY = 8;
const DAY = 86400;
export const IRRIGATORS = {
  irrigation_basic: { name: '初级自动浇水', days: 3, price: 600, color: 0x897052, radius: .82 },
  irrigation_medium: { name: '中级自动浇水', days: 5, price: 1200, color: 0x397a85, radius: 1 },
  irrigation_advanced: { name: '高级自动浇水', days: 7, price: 2200, color: 0x584b8e, radius: 1.18 },
};

export const tankCapacity = key => IRRIGATORS[key].days * BUCKET_CAPACITY;

export function pourIntoTank(bucket, tankWater, capacity) {
  const poured = Math.min(bucket, Math.max(0, capacity - tankWater));
  return { poured, bucket: bucket - poured, tankWater: tankWater + poured };
}

export function drainTank(water, seconds) {
  const usePerSecond = BUCKET_CAPACITY / DAY;
  const remainingSeconds = water / usePerSecond;
  if (seconds >= remainingSeconds) return { wateredSeconds: remainingSeconds, water: 0 };
  return { wateredSeconds: seconds, water: water - seconds * usePerSecond };
}
