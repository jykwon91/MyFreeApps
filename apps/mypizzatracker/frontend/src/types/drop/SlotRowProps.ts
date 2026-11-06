export interface SlotRowProps {
  dropId: string;
  slot: { id: string; pickup_time: string; max_pizzas: number };
  editable: boolean;
}
