export interface StatusTransitionEvent {
  id: number;
  entityType: string;
  entityId: number;
  fromStatus: string | null;
  toStatus: string;
  transitionCode: string;
  transitionReason: string | null;
  actorUserId: number | null;
  actorEmployeeId: number | null;
  occurredAt: string;
  requestId: string | null;
  correlationId: string | null;
  createdAt: string;
}

export interface RecordStatusTransitionInput {
  entityType: string;
  entityId: number;
  fromStatus?: string | null;
  toStatus: string;
  transitionCode: string;
  transitionReason?: string | null;
  actorUserId?: number | null;
  actorEmployeeId?: number | null;
  occurredAt?: string | null;
  requestId?: string | null;
  correlationId?: string | null;
}
