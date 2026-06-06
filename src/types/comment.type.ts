export interface IComment {
  id: number;
  issue_id: number;
  author_id: number;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface ICommentWithAuthor {
  id: number;
  issue_id: number;
  body: string;
  created_at: string;
  updated_at: string;
  author: {
    id: number;
    name: string;
    role: string;
  };
}

export interface ICreateCommentRequest {
  body: string;
}
