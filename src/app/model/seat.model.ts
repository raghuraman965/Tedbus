export type SeatStatus =
  | 'available'
  | 'selected'
  | 'booked';

export interface SeatInfo {
  number: number;
  status: SeatStatus;
}

export const TOTAL_SEATS = 40;
export const SEATS_PER_ROW = 4;
export const TOTAL_ROWS = TOTAL_SEATS / SEATS_PER_ROW;

export function isSeatBooked(status: SeatStatus): boolean {
  return status === 'booked';
}

export function isSeatSelectable(status: SeatStatus): boolean {
  return status === 'available';
}

export function buildSeatMap(busId: string, filledSeats: number[]): SeatInfo[] {
  const filled = new Set<number>(Array.isArray(filledSeats) ? filledSeats : []);

  return Array.from({ length: TOTAL_SEATS }, (_, i) => {
    const seatNo = i + 1;
    if (filled.has(seatNo)) {
      return { number: seatNo, status: 'booked' };
    }
    return { number: seatNo, status: 'available' };
  });
}

export type SegmentSeatStatus =
  | 'available'
  | 'selected'
  | 'booked'
  | 'booked_for_segment';

export interface SegmentSeatInfo {
  number: number;
  status: SegmentSeatStatus;
}

export function buildSegmentSeatMap(
  busId: string,
  soldSeats: number[],
  totalSeats?: number
): SegmentSeatInfo[] {
  const total = totalSeats || TOTAL_SEATS;
  const filled = new Set<number>(Array.isArray(soldSeats) ? soldSeats : []);
  return Array.from({ length: total }, (_, i) => {
    const seatNo = i + 1;
    return {
      number: seatNo,
      status: filled.has(seatNo) ? 'booked_for_segment' as const : 'available' as const,
    };
  });
}
