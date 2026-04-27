export type DocumentBlockRole =
  | "title"
  | "noticeNumber"
  | "body"
  | "section"
  | "koreanItem"
  | "dashItem"
  | "note";

export interface DocumentBlock {
  id: string;
  role: DocumentBlockRole;
  text: string;
}
