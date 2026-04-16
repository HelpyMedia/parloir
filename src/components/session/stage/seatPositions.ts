export interface SeatPosition {
  index: number;
  x: number;
  y: number;
  angle: number;
}

export const STAGE_VIEWBOX = { width: 600, height: 400 };
export const TABLE_CENTER = { x: 300, y: 220 };
export const TABLE_RX = 200;
export const TABLE_RY = 100;
const SEAT_RX = 250;
const SEAT_RY = 150;

export function seatPositions(count: number): SeatPosition[] {
  const seats: SeatPosition[] = [];
  const n = Math.max(count, 4);
  for (let i = 0; i < n; i++) {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    seats.push({
      index: i,
      x: TABLE_CENTER.x + SEAT_RX * Math.cos(angle),
      y: TABLE_CENTER.y + SEAT_RY * Math.sin(angle),
      angle,
    });
  }
  return seats;
}
