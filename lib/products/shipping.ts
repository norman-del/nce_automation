/**
 * Auto-calculate shipping tier from dimensions and weight.
 *
 * 0 = Parcel:  fits 120×55×50 cm AND ≤ 30 kg  (or ≤ 60×60×60 cube AND ≤ 30 kg)
 * 1 = Single Pallet: exceeds parcel but footprint fits 100×120 cm
 * 2 = Double Pallet: footprint exceeds 100×120 cm
 */
export function calculateShippingTier(
  widthCm: number,
  heightCm: number,
  depthCm: number,
  weightKg: number | null
): 0 | 1 | 2 {
  const underWeightLimit = weightKg === null || weightKg <= 30

  // Parcel check: standard parcel OR cube parcel
  const fitsStandardParcel = widthCm <= 120 && heightCm <= 55 && depthCm <= 50
  const fitsCubeParcel = widthCm <= 60 && heightCm <= 60 && depthCm <= 60

  if ((fitsStandardParcel || fitsCubeParcel) && underWeightLimit) {
    return 0
  }

  // Pallet footprint check (width × depth, ignoring height)
  const footprintLong = Math.max(widthCm, depthCm)
  const footprintShort = Math.min(widthCm, depthCm)

  if (footprintLong <= 120 && footprintShort <= 100) {
    return 1
  }

  return 2
}
