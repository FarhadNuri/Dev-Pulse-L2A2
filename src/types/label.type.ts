export interface ILabel {
  id: number;
  org_id: number;
  name: string;
  color: string;
  created_at: string;
}

export interface ICreateLabelRequest {
  name: string;
  color: string;
}

export interface IUpdateLabelRequest {
  name?: string;
  color?: string;
}

