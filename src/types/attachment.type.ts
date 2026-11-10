export interface IAttachment {
  id: number;
  issue_id: number;
  uploaded_by: number;
  url: string;
  public_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  uploader?: {
    id: number;
    name: string;
    email?: string | undefined;
  } | undefined;
}

export interface ISignAttachmentRequest {
  file_name: string;
  mime_type: string;
  size_bytes: number;
}

export interface IRegisterAttachmentRequest {
  url: string;
  public_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
}
